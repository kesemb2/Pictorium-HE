/**
 * "Senza testo" verificato per i poster fanart.tv.
 *
 * Il tag "00" (No Language) di fanart è la condizione necessaria ma non
 * sufficiente: chi carica a volte marca "00" un poster con il titolo stampato.
 * Qui il tag si combina con il rilevatore visivo (poster-text-detect): un
 * poster fanart è clean SOLO se ha "00" E l'immagine non mostra fasce di testo.
 *
 * Fail-closed: anteprima non scaricabile, timeout o errore → NON clean. Il
 * costo di un falso rifiuto è basso (si passa al livello successivo: TVDB,
 * backdrop ritagliato, poster in lingua), quello di un poster con titolo
 * trattato da clean è il logo disegnato sopra il titolo.
 */

import { cacheGet, cacheSet } from "@/lib/cache"
import { FANART_ASSET_PREFIX, textlessOnly, type FanartAsTmdbImage, type FanartImage } from "@/lib/fanart-artwork"
import { fetchImg, imgSrc } from "@/lib/poster-render-helpers"
import { detectPosterText } from "@/lib/poster-text-detect"
import { createLogger } from "@/lib/logger"

const log = createLogger("fanart-textless")

/** Il verdetto dipende solo dai byte dell'immagine: cache lunga per URL. */
const VERDICT_TTL = 30 * 24 * 60 * 60 * 1000
const VERDICT_TAG = "fanart"
/** Tetto per singolo controllo (anteprima piccola: di solito < 1s). */
const CHECK_TIMEOUT_MS = 4000

export interface FanartTextCheck {
  readonly url: string
  /** True solo se l'immagine è stata analizzata e non mostra testo. */
  readonly textless: boolean
  /** Punteggio del rilevatore; null = immagine non analizzata (fail-closed). */
  readonly score: number | null
}

export function isFanartAssetUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith(FANART_ASSET_PREFIX)
}

/**
 * Anteprima fanart dello stesso asset (`/fanart/` → `/preview/`): poche decine
 * di KB invece di qualche MB, e il rilevatore lavora comunque a 200×300.
 */
export function fanartPreviewUrl(url: string): string {
  const full = `${FANART_ASSET_PREFIX}fanart/`
  return url.startsWith(full) ? `${FANART_ASSET_PREFIX}preview/${url.slice(full.length)}` : url
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

/** Analizza un poster fanart (anteprima, poi originale). Verdetto in cache. */
export async function checkFanartPosterText(url: string, signal?: AbortSignal): Promise<FanartTextCheck> {
  if (!isFanartAssetUrl(url)) return { url, textless: false, score: null }
  const key = `fanart:textcheck:${url}`
  const cached = cacheGet<FanartTextCheck>(key)
  if (cached) return cached
  let buf: Buffer | null = null
  const sig = withTimeout(signal, CHECK_TIMEOUT_MS)
  for (const candidate of [fanartPreviewUrl(url), url]) {
    try {
      buf = await fetchImg(imgSrc(candidate), sig)
      break
    } catch {
      // Anteprima assente: si riprova con l'originale; poi fail-closed.
    }
  }
  if (!buf) return { url, textless: false, score: null }
  try {
    const r = await detectPosterText(buf)
    const verdict: FanartTextCheck = { url, textless: !r.hasText, score: Math.round(r.score * 100) / 100 }
    if (r.hasText) log.info("fanart poster rejected: text detected", { url, score: verdict.score })
    cacheSet(key, verdict, [VERDICT_TAG], VERDICT_TTL)
    return verdict
  } catch {
    return { url, textless: false, score: null }
  }
}

/**
 * Poster fanart davvero senza testo, nell'ordine di fanart (likes): tag "00" +
 * controllo visivo. Solo i primi `limit` candidati vengono analizzati (in
 * parallelo); `checks` raccoglie i verdetti per debug=1.
 */
export async function verifiedTextlessPosters(
  images: readonly FanartImage[],
  opts: { limit: number; signal?: AbortSignal; checks?: FanartTextCheck[] },
): Promise<FanartImage[]> {
  const candidates = textlessOnly(images).slice(0, opts.limit)
  const verdicts = await Promise.all(candidates.map((c) => checkFanartPosterText(c.url, opts.signal)))
  opts.checks?.push(...verdicts)
  return candidates.filter((_, i) => verdicts[i]!.textless)
}

/**
 * Poster fanart nella forma TMDB per l'editor. `iso_639_1: null` (clean) SOLO
 * per i verificati; "00" non verificato o lingua assente → "und" (visibile,
 * mai clean); le lingue vere restano tali.
 */
export async function fanartPostersAsTmdb(
  images: readonly FanartImage[],
  opts: { limit: number; signal?: AbortSignal },
): Promise<FanartAsTmdbImage[]> {
  const verified = new Set((await verifiedTextlessPosters(images, opts)).map((i) => i.url))
  return images.map((i) => ({
    file_path: i.url,
    iso_639_1: verified.has(i.url) ? null : (i.lang && i.lang !== "00" ? i.lang : "und"),
    width: 0,
    height: 0,
    vote_average: i.likes,
    source: "fanart" as const,
  }))
}

/**
 * Filtro per percorsi salvati (rotazione, base custom): gli URL fanart passano
 * solo se verificati; i path TMDB passano invariati (TMDB separa già i clean).
 */
export async function rejectTextedFanart(paths: readonly string[], signal?: AbortSignal): Promise<Set<string>> {
  const fanart = paths.filter(isFanartAssetUrl)
  const verdicts = await Promise.all(fanart.map((p) => checkFanartPosterText(p, signal)))
  return new Set(verdicts.filter((v) => !v.textless).map((v) => v.url))
}
