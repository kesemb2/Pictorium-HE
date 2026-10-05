import { NextRequest } from "next/server"
import { getImages, getExternalIds, resolveRouteApiKey } from "@/lib/tmdb"
import { fanartApiKey, getFanartMovie, getFanartTv, toTmdbShape, type FanartArtwork } from "@/lib/fanart-artwork"
import { getTvdbArtworks, getTvdbMovieId, getTvdbSeriesId } from "@/lib/tvdb"
import { fanartPostersAsTmdb, tvdbCleanPosters, verifyCleanPool, EDITOR_CLEAN_VERIFY_LIMIT, type ExternalPosterImage, type PosterTextCheck } from "@/lib/poster-textless"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { cacheGet, cacheSet } from "@/lib/cache"
import { jsonGzip } from "@/lib/json-response"

type RouteParams = { id: string }
type ExtIds = { imdb_id: string | null; tvdb_id?: number | null }

/**
 * Fork: il pool "clean" dell'editor viene da TUTTE le fonti — TMDB ("No
 * Language"), fanart.tv ("00" o lingua assente) e TheTVDB (`includesText:
 * false`) — e ogni candidato passa il controllo visivo (poster-textless). La
 * griglia mostra solo i verificati: un poster scelto da lì è clean, quindi il
 * logo resta. Chiavi fanart/TVDB: spazio utente > istanza, come il resto.
 *
 * fanart e TVDB sono un di più: un loro errore non fa mai fallire la
 * richiesta, le immagini TMDB ci sono comunque.
 */

async function fanartImages(
  type: "movie" | "tv",
  id: number,
  fanartKey: string,
  extIds: () => Promise<ExtIds>,
  signal: AbortSignal | undefined,
  checks: PosterTextCheck[],
) {
  try {
    let art: FanartArtwork
    if (type === "tv") {
      // fanart indicizza le serie per id TheTVDB, non TMDB.
      const ext = await extIds()
      if (!ext.tvdb_id) return { posters: [], logos: [], backdrops: [] }
      art = await getFanartTv(ext.tvdb_id, signal, fanartKey)
    } else {
      art = await getFanartMovie(id, signal, fanartKey)
    }
    // Poster: clean SOLO se verificati senza testo; gli altri "und" (fuori
    // dalla griglia clean, mai scelti in automatico né messi in rotazione).
    const posters = await fanartPostersAsTmdb(art.posters, { limit: EDITOR_CLEAN_VERIFY_LIMIT, signal, checks })
    return { posters, logos: toTmdbShape(art.logos), backdrops: toTmdbShape(art.backgrounds) }
  } catch {
    return { posters: [], logos: [], backdrops: [] }
  }
}

/** Poster TVDB clean verificati (stesso id del rescue del render). */
async function tvdbPosters(
  type: "movie" | "tv",
  tvdbKey: string,
  extIds: () => Promise<ExtIds>,
  signal: AbortSignal | undefined,
  checks: PosterTextCheck[],
): Promise<ExternalPosterImage[]> {
  try {
    const ext = await extIds()
    const tvdbId = ext.tvdb_id
      ?? (ext.imdb_id
        ? (type === "movie" ? await getTvdbMovieId(ext.imdb_id, tvdbKey, signal) : await getTvdbSeriesId(ext.imdb_id, tvdbKey, signal))
        : null)
    if (!tvdbId) return []
    const arts = await getTvdbArtworks(type, tvdbId, tvdbKey, signal)
    return await tvdbCleanPosters(arts, { limit: EDITOR_CLEAN_VERIFY_LIMIT, signal, checks })
  } catch {
    return []
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const rl = await rateLimit(rateLimitKey(req), "tmdb")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  const { id } = await params
  const type = req.nextUrl.searchParams.get("type") || "movie"
  // Il default è solo una rete di sicurezza: ogni chiamante passa `languages`
  // costruito dalla regione. L'italiano che stava qui privilegiava una lingua
  // sola tra le tredici.
  const languages = req.nextUrl.searchParams.get("languages") || "en,null"
  const mediaType = type === "tv" ? "tv" : "movie"
  const [apiKey, userFanartKey, tvdbKey] = await Promise.all([
    resolveRouteApiKey(req),
    resolveRouteApiKey(req, "fanart"),
    resolveRouteApiKey(req, "tvdb"),
  ])
  // La chiave d'istanza vale sempre, con tutti i suoi nomi (come prima).
  const fanartKey = userFanartKey || fanartApiKey()
  // La chiave di cache dice quali fonti c'erano (mai le chiavi): accendere
  // fanart o TVDB deve cambiare la risposta, non riusare quella di prima.
  // `ft4`: pool clean da tutte le fonti, verificato per intero.
  const cacheKey = `images:${type}:${id}:${languages}:ft4:${fanartKey ? "fa" : "x"}${tvdbKey ? "tv" : "x"}`
  const acceptEncoding = req.headers.get("accept-encoding")
  const cached = cacheGet(cacheKey)
  if (cached) return jsonGzip(cached, 200, undefined, acceptEncoding)
  // Niente catch-and-cache: un errore/outage upstream NON deve finire in cache
  // come "lista vuota" per 30 minuti (avvelenerebbe la visuale di ogni titolo
  // durante un down di TMDB). Si risponde 502: il client gestisce il fallo
  // e può riprovare al tick successivo, senza che nessun altro veda dati falsi.
  let data: Awaited<ReturnType<typeof getImages>>
  try {
    data = await getImages(mediaType, Number(id), languages, apiKey)
  } catch {
    return jsonGzip({ error: "TMDB images unavailable" }, 502, undefined, acceptEncoding)
  }
  // Una sola lettura degli id esterni, condivisa da fanart (serie) e TVDB.
  let extPromise: Promise<ExtIds> | null = null
  const extIds = () => (extPromise ??= getExternalIds(mediaType, Number(id), apiKey).catch(() => ({ imdb_id: null, tvdb_id: null })))
  const textChecks: PosterTextCheck[] = []
  // Clean TMDB verificati per intero: un "No Language" con il titolo stampato
  // diventa "und" — mai clean, mai scelto in automatico né messo in rotazione.
  const tmdbClean = data.posters.filter((p) => p.iso_639_1 === null).map((p) => p.file_path)
  const [verifiedList, extra, tvdb] = await Promise.all([
    tmdbClean.length > 0
      ? verifyCleanPool(tmdbClean, { limit: EDITOR_CLEAN_VERIFY_LIMIT, signal: req.signal, checks: textChecks })
      : Promise.resolve([] as string[]),
    fanartKey
      ? fanartImages(mediaType, Number(id), fanartKey, extIds, req.signal, textChecks)
      : Promise.resolve({ posters: [], logos: [], backdrops: [] }),
    tvdbKey ? tvdbPosters(mediaType, tvdbKey, extIds, req.signal, textChecks) : Promise.resolve([]),
  ])
  const verifiedClean = new Set(verifiedList)
  const tmdbPosters = data.posters.map((p) => (p.iso_639_1 === null && !verifiedClean.has(p.file_path) ? { ...p, iso_639_1: "und" } : p))
  // TMDB prima, poi fanart, poi TVDB: a parità l'artwork ufficiale resta il
  // primo che l'utente vede (e il primo clean coincide con quello del render).
  const merged = {
    ...data,
    posters: [...tmdbPosters, ...extra.posters, ...tvdb],
    logos: [...data.logos, ...extra.logos],
    backdrops: [...data.backdrops, ...extra.backdrops],
  }
  // Un controllo non eseguito (CDN irraggiungibile, timeout) dà "non clean"
  // ma NON si mette in cache: al prossimo caricamento si riprova.
  if (!textChecks.some((c) => c.score === null)) cacheSet(cacheKey, merged, ["tmdb", "images"])
  return jsonGzip(merged, 200, undefined, acceptEncoding)
}
