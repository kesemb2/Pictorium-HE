import { NextRequest } from "next/server"
import { getImages, getExternalIds, resolveRouteApiKey } from "@/lib/tmdb"
import { getFanartMovie, getFanartTv, isFanartEnabled, toTmdbShape, type FanartArtwork } from "@/lib/fanart-artwork"
import { fanartPostersAsTmdb, verifyCleanPool, CLEAN_VERIFY_LIMIT, type PosterTextCheck } from "@/lib/poster-textless"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { cacheGet, cacheSet } from "@/lib/cache"
import { jsonGzip } from "@/lib/json-response"

type RouteParams = { id: string }

/**
 * Artwork fanart.tv per l'editor, nella stessa forma delle immagini TMDB.
 *
 * Senza chiave ritorna liste vuote e la risposta è identica a prima. Un errore
 * qui non deve mai far fallire la richiesta: le immagini TMDB ci sono comunque,
 * e fanart è un di più.
 */

async function fanartImages(type: "movie" | "tv", id: number, apiKey?: string, signal?: AbortSignal) {
  if (!isFanartEnabled()) return { posters: [], logos: [], backdrops: [] }
  try {
    let art: FanartArtwork
    if (type === "tv") {
      // fanart indicizza le serie per id TheTVDB, non TMDB.
      const ext = await getExternalIds("tv", id, apiKey).catch(() => ({ imdb_id: null, tvdb_id: null }))
      if (!ext.tvdb_id) return { posters: [], logos: [], backdrops: [] }
      art = await getFanartTv(ext.tvdb_id)
    } else {
      art = await getFanartMovie(id)
    }
    // Poster: clean SOLO se "00" e verificati senza testo (poster-textless);
    // gli altri restano visibili ma mai clean (niente auto-scelta/rotazione).
    const posters = await fanartPostersAsTmdb(art.posters, { limit: CLEAN_VERIFY_LIMIT, signal })
    return { posters, logos: toTmdbShape(art.logos), backdrops: toTmdbShape(art.backgrounds) }
  } catch {
    return { posters: [], logos: [], backdrops: [] }
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
  const apiKey = await resolveRouteApiKey(req)
  // La chiave di cache include fanart: accendere o spegnere la chiave d'istanza
  // deve cambiare la risposta, non riusare quella di prima.
  // `ft3`: poster clean (TMDB e fanart) solo se verificati senza testo; le
  // liste in cache prima di questa regola non vanno riusate.
  const cacheKey = `images:${type}:${id}:${languages}:ft3:${isFanartEnabled() ? "fa" : "x"}`
  const acceptEncoding = req.headers.get("accept-encoding")
  const cached = cacheGet(cacheKey)
  if (cached) return jsonGzip(cached, 200, undefined, acceptEncoding)
  // Niente catch-and-cache: un errore/outage upstream NON deve finire in cache
  // come "lista vuota" per 30 minuti (avvelenerebbe la visuale di ogni titolo
  // durante un down di TMDB). Si risponde 502: il client gestisce il fallo
  // e può riprovare al tick successivo, senza che nessun altro veda dati falsi.
  let data: Awaited<ReturnType<typeof getImages>>
  try {
    data = await getImages(type as "movie" | "tv", Number(id), languages, apiKey)
  } catch {
    return jsonGzip({ error: "TMDB images unavailable" }, 502, undefined, acceptEncoding)
  }
  // Clean TMDB verificati come sul server (poster-textless): un "No Language"
  // con il titolo stampato diventa "und" — visibile, mai clean, mai scelto in
  // automatico né messo in rotazione. Stessa regola del render Stremio.
  const textChecks: PosterTextCheck[] = []
  const tmdbClean = data.posters.filter((p) => p.iso_639_1 === null).map((p) => p.file_path)
  const verifiedClean = new Set(tmdbClean.length > 0
    ? await verifyCleanPool(tmdbClean, { limit: CLEAN_VERIFY_LIMIT, signal: req.signal, checks: textChecks })
    : [])
  const tmdbPosters = data.posters.map((p) => (p.iso_639_1 === null && !verifiedClean.has(p.file_path) ? { ...p, iso_639_1: "und" } : p))
  // fanart va in CODA a TMDB in ogni lista: a parità di lingua l'artwork
  // ufficiale resta il primo che l'utente vede.
  const extra = await fanartImages(type as "movie" | "tv", Number(id), apiKey, req.signal)
  const merged = {
    ...data,
    posters: [...tmdbPosters, ...extra.posters],
    logos: [...data.logos, ...extra.logos],
    backdrops: [...data.backdrops, ...extra.backdrops],
  }
  // Un controllo non eseguito (CDN irraggiungibile, timeout) dà "non clean"
  // ma NON si mette in cache: al prossimo caricamento si riprova.
  if (!textChecks.some((c) => c.score === null)) cacheSet(cacheKey, merged, ["tmdb", "images"])
  return jsonGzip(merged, 200, undefined, acceptEncoding)
}
