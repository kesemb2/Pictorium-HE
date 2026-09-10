/**
 * Client fanart.tv (API v3).
 *
 * Serve a colmare i buchi di TMDB: molti titoli non hanno nessun poster
 * "clean" (senza testo) e finora l'unica strada era un poster con il titolo
 * già stampato sopra. fanart.tv ha spesso poster textless e loghi trasparenti
 * — anche in lingue che TMDB non copre.
 *
 * La chiave è SOLO una variabile d'ambiente d'istanza: senza di essa ogni
 * funzione qui ritorna liste vuote e il resto del render si comporta
 * esattamente come prima.
 */

import { envWithFallback } from "@/lib/env-compat"
import { cacheGet, cacheSet } from "@/lib/cache"
import { http } from "@/lib/http"
import { createLogger } from "@/lib/logger"

const log = createLogger("fanart")

const FANART_BASE = "https://webservice.fanart.tv/v3"

/** Host da cui fanart.tv serve le immagini (allowlist SSRF in `imgSrc`). */
export const FANART_ASSET_PREFIX = "https://assets.fanart.tv/"

const CACHE_TTL = 24 * 60 * 60 * 1000
const CACHE_TAG = "fanart"

/**
 * fanart.tv marca le immagini SENZA testo con lingua "None", che sull'API esce
 * come "00". È la regola che rende utile questo livello: senza il filtro
 * prenderemmo poster con il titolo già stampato, cioè quello che stiamo
 * cercando di evitare.
 */
const TEXTLESS_LANG = "00"

export interface FanartImage {
  readonly id: string
  readonly url: string
  /** ISO 639-1, "00" per textless, stringa vuota quando fanart la omette. */
  readonly lang: string
  readonly likes: number
}

export interface FanartArtwork {
  readonly posters: readonly FanartImage[]
  readonly backgrounds: readonly FanartImage[]
  readonly logos: readonly FanartImage[]
}

const EMPTY: FanartArtwork = { posters: [], backgrounds: [], logos: [] }

export function fanartApiKey(): string | undefined {
  // Anche il nome NUDO, come ogni altro provider della casa (mdblist.ts,
  // tmdb.ts, meta-handler.ts). Prima si leggeva solo `PICTORIUM_FANART_API_KEY`
  // e una chiave messa come `FANART_API_KEY` veniva ignorata in silenzio.
  const raw = envWithFallback("FANART_API_KEY")
    || process.env.FANART_API_KEY
    || process.env.FANART_KEY
  return raw?.trim() || undefined
}

export function isFanartEnabled(): boolean {
  return !!fanartApiKey()
}

/** Immagini textless (lingua "None"). fanart omette il campo su record vecchi. */
export function textlessOnly(images: readonly FanartImage[]): readonly FanartImage[] {
  return images.filter((i) => i.lang === TEXTLESS_LANG || i.lang === "")
}

/** Solo URL sul CDN fanart: un record manomesso non deve farci uscire altrove. */
function isFanartAsset(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(FANART_ASSET_PREFIX)
}

/**
 * Normalizza un array grezzo dell'API. Tutto è opzionale lato fanart, quindi si
 * scartano i record senza URL utilizzabile invece di propagare undefined.
 * L'ordine è per `likes` decrescente: è il voto della community, e senza di esso
 * prenderemmo semplicemente il primo caricato.
 */
function parseImages(raw: unknown): FanartImage[] {
  if (!Array.isArray(raw)) return []
  const out: FanartImage[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    if (!isFanartAsset(rec.url)) continue
    const likes = Number(rec.likes)
    out.push({
      id: typeof rec.id === "string" ? rec.id : String(rec.id ?? ""),
      url: rec.url,
      lang: typeof rec.lang === "string" ? rec.lang : "",
      likes: Number.isFinite(likes) ? likes : 0,
    })
  }
  return out.sort((a, b) => b.likes - a.likes)
}

function pick(body: Record<string, unknown>, ...keys: string[]): FanartImage[] {
  return keys.flatMap((k) => parseImages(body[k]))
    .sort((a, b) => b.likes - a.likes)
}

async function fetchArtwork(path: string, cacheKey: string, signal?: AbortSignal): Promise<FanartArtwork> {
  const apiKey = fanartApiKey()
  if (!apiKey) return EMPTY
  const cached = cacheGet<FanartArtwork>(cacheKey)
  if (cached) return cached
  let body: Record<string, unknown>
  try {
    body = await http<Record<string, unknown>>(
      `${FANART_BASE}${path}?api_key=${encodeURIComponent(apiKey)}`,
      { signal, timeout: 8000, retries: 1 },
    )
  } catch (e) {
    // Un 404 significa solo "fanart non conosce questo titolo", che è normale.
    // Non si mette in cache un fallimento: un outage non deve spegnere il
    // livello per 24 ore.
    log.info("fanart lookup failed", { path, error: e instanceof Error ? e.message : String(e) })
    return EMPTY
  }
  if (!body || typeof body !== "object") return EMPTY
  const artwork: FanartArtwork = {
    posters: pick(body, "movieposter", "tvposter"),
    backgrounds: pick(body, "moviebackground", "showbackground"),
    // hd* prima: stessa immagine a risoluzione maggiore.
    logos: pick(body, "hdmovielogo", "movielogo", "hdtvlogo", "clearlogo"),
  }
  cacheSet(cacheKey, artwork, [CACHE_TAG], CACHE_TTL)
  return artwork
}

/**
 * Immagine fanart nella forma che l'editor già sa disegnare. `file_path` è un
 * URL assoluto: `posterUrl` (utils.ts) lo lascia passare intatto, `imgSrc` lo
 * ammette perché assets.fanart.tv è in allowlist, e la CSP lo consente.
 * `source: "fanart"` serve alla griglia per marcare la provenienza.
 */
export interface FanartAsTmdbImage {
  readonly file_path: string
  readonly iso_639_1: string | null
  readonly width: number
  readonly height: number
  readonly vote_average: number
  readonly source: "fanart"
}

/**
 * `lang` "00" (senza testo) diventa `iso_639_1: null`, che è esattamente come
 * TMDB marca i poster puliti: così i filtri "clean" dell'editor funzionano sui
 * due insiemi senza sapere da dove vengono.
 */
export function toTmdbShape(images: readonly FanartImage[]): FanartAsTmdbImage[] {
  return images.map((i) => ({
    file_path: i.url,
    iso_639_1: i.lang && i.lang !== TEXTLESS_LANG ? i.lang : null,
    width: 0,
    height: 0,
    vote_average: i.likes,
    source: "fanart" as const,
  }))
}

/** Artwork di un film, per id TMDB o IMDb (fanart accetta entrambi). */
export function getFanartMovie(id: string | number, signal?: AbortSignal): Promise<FanartArtwork> {
  return fetchArtwork(`/movies/${encodeURIComponent(String(id))}`, `fanart:movie:${id}`, signal)
}

/**
 * Artwork di una serie. fanart indicizza le serie per id TheTVDB, NON TMDB:
 * il chiamante lo ricava da `external_ids`. Senza quell'id il livello si salta.
 */
export function getFanartTv(tvdbId: string | number, signal?: AbortSignal): Promise<FanartArtwork> {
  return fetchArtwork(`/tv/${encodeURIComponent(String(tvdbId))}`, `fanart:tv:${tvdbId}`, signal)
}
