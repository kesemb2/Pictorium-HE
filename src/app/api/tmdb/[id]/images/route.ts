import { NextRequest } from "next/server"
import { getImages, getExternalIds } from "@/lib/tmdb"
import { getFanartMovie, getFanartTv, isFanartEnabled, toTmdbShape } from "@/lib/fanart"
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
async function fanartImages(type: "movie" | "tv", id: number, apiKey?: string) {
  if (!isFanartEnabled()) return { posters: [], logos: [], backdrops: [] }
  try {
    if (type === "tv") {
      // fanart indicizza le serie per id TheTVDB, non TMDB.
      const ext = await getExternalIds("tv", id, apiKey).catch(() => ({ imdb_id: null, tvdb_id: null }))
      if (!ext.tvdb_id) return { posters: [], logos: [], backdrops: [] }
      const art = await getFanartTv(ext.tvdb_id)
      return { posters: toTmdbShape(art.posters), logos: toTmdbShape(art.logos), backdrops: toTmdbShape(art.backgrounds) }
    }
    const art = await getFanartMovie(id)
    return { posters: toTmdbShape(art.posters), logos: toTmdbShape(art.logos), backdrops: toTmdbShape(art.backgrounds) }
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
  const apiKey = req.nextUrl.searchParams.get("api_key") || undefined
  // La chiave di cache include fanart: accendere o spegnere la chiave d'istanza
  // deve cambiare la risposta, non riusare quella di prima.
  const cacheKey = `images:${type}:${id}:${languages}:${isFanartEnabled() ? "fa" : "x"}`
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
  // fanart va in CODA a TMDB in ogni lista: a parità di lingua l'artwork
  // ufficiale resta il primo che l'utente vede.
  const extra = await fanartImages(type as "movie" | "tv", Number(id), apiKey)
  const merged = {
    ...data,
    posters: [...data.posters, ...extra.posters],
    logos: [...data.logos, ...extra.logos],
    backdrops: [...data.backdrops, ...extra.backdrops],
  }
  cacheSet(cacheKey, merged, ["tmdb", "images"])
  return jsonGzip(merged, 200, undefined, acceptEncoding)
}
