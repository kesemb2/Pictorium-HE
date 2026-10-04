/**
 * "Senza testo" verificato per i poster candidati clean, da qualunque fonte.
 *
 * I tag di lingua delle fonti (TMDB `iso_639_1: null`, fanart "00", TVDB
 * `includesText: false`) sono condizione necessaria ma non sufficiente: chi
 * carica a volte marca "senza lingua" un poster con il titolo stampato. Qui il
 * tag si combina con il rilevatore visivo (poster-text-detect): un poster è
 * clean SOLO se il tag lo dice E l'immagine non mostra fasce di testo.
 *
 * Fail-closed: anteprima non scaricabile, timeout o errore → NON clean. Il
 * costo di un falso rifiuto è basso (si passa al livello successivo: TVDB,
 * backdrop ritagliato, poster in lingua), quello di un poster con titolo
 * trattato da clean è il logo disegnato sopra il titolo.
 */

import { cacheGet, cacheSet } from "@/lib/cache"
import { FANART_ASSET_PREFIX, textlessOnly, type FanartAsTmdbImage, type FanartImage } from "@/lib/fanart-artwork"
import { fetchImg, imgSrc } from "@/lib/poster-render-helpers"
import { ARTWORKS_BASE } from "@/lib/tvdb"
import { detectPosterText } from "@/lib/poster-text-detect"
import { createLogger } from "@/lib/logger"

const log = createLogger("poster-textless")

/** Il verdetto dipende solo dai byte dell'immagine: cache lunga per URL. */
const VERDICT_TTL = 30 * 24 * 60 * 60 * 1000
const VERDICT_TAG = "fanart"
/**
 * Quanti candidati clean per fonte si analizzano (server ed editor usano lo
 * stesso numero, così il pannello "clean" coincide con ciò che Stremio vede).
 * Oltre il limite un candidato non è verificato e quindi non è clean.
 */
export const CLEAN_VERIFY_LIMIT = 6
/** Tetto per singolo controllo (anteprima piccola: di solito < 1s). */
const CHECK_TIMEOUT_MS = 4000

export interface PosterTextCheck {
  /** Path TMDB o URL (fanart/TVDB) del poster verificato. */
  readonly url: string
  /** True solo se l'immagine è stata analizzata e non mostra testo. */
  readonly textless: boolean
  /** Punteggio del rilevatore; null = immagine non analizzata (fail-closed). */
  readonly score: number | null
}

/** Alias storico (prima la verifica copriva solo fanart). */
export type FanartTextCheck = PosterTextCheck

export function isFanartAssetUrl(url: string | null | undefined): boolean {
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

/**
 * URL già risolti da analizzare per una fonte, dalla più leggera: path TMDB →
 * w342; asset fanart → anteprima, poi originale; artwork TVDB → l'URL. Altre
 * fonti: nessuna (mai clean). Ogni URL passa da `imgSrc` una volta sola: un
 * URL TMDB già costruito non va riconvalidato contro la allowlist esterna
 * (con una base immagini custom, es. il mock e2e, verrebbe rifiutato).
 */
function analysisSources(source: string): string[] {
  try {
    if (source.startsWith("/")) return [imgSrc(source, "w342")]
    if (isFanartAssetUrl(source)) return [imgSrc(fanartPreviewUrl(source)), imgSrc(source)]
    if (source.startsWith(`${ARTWORKS_BASE}/`)) return [imgSrc(source)]
  } catch {
    // URL fuori allowlist: mai clean.
  }
  return []
}

/** Analizza un poster candidato clean. Verdetto in cache per fonte. */
export async function checkPosterText(source: string, signal?: AbortSignal): Promise<PosterTextCheck> {
  const candidates = analysisSources(source)
  if (candidates.length === 0) return { url: source, textless: false, score: null }
  const key = `poster:textcheck:${source}`
  const cached = cacheGet<PosterTextCheck>(key)
  if (cached) return cached
  let buf: Buffer | null = null
  const sig = withTimeout(signal, CHECK_TIMEOUT_MS)
  for (const candidate of candidates) {
    try {
      buf = await fetchImg(candidate, sig)
      break
    } catch {
      // Anteprima assente: si riprova con l'originale; poi fail-closed.
    }
  }
  if (!buf) return { url: source, textless: false, score: null }
  try {
    const r = await detectPosterText(buf)
    const verdict: PosterTextCheck = { url: source, textless: !r.hasText, score: Math.round(r.score * 100) / 100 }
    if (r.hasText) log.info("clean candidate rejected: text detected", { source, score: verdict.score })
    cacheSet(key, verdict, [VERDICT_TAG], VERDICT_TTL)
    return verdict
  } catch {
    return { url: source, textless: false, score: null }
  }
}

/** Verifica di un asset fanart (gli altri URL non sono mai fanart clean). */
export async function checkFanartPosterText(url: string, signal?: AbortSignal): Promise<PosterTextCheck> {
  if (!isFanartAssetUrl(url)) return { url, textless: false, score: null }
  return checkPosterText(url, signal)
}

/**
 * Pool clean verificato: i primi `limit` candidati (già filtrati per tag dal
 * chiamante) analizzati in parallelo; restano, nell'ordine, solo quelli senza
 * testo. `checks` raccoglie i verdetti per debug=1.
 */
export async function verifyCleanPool(
  sources: readonly string[],
  opts: { limit: number; signal?: AbortSignal; checks?: PosterTextCheck[] },
): Promise<string[]> {
  const candidates = sources.slice(0, opts.limit)
  const verdicts = await Promise.all(candidates.map((c) => checkPosterText(c, opts.signal)))
  opts.checks?.push(...verdicts)
  return candidates.filter((_, i) => verdicts[i]!.textless)
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
  const candidates = textlessOnly(images)
  const ok = new Set(await verifyCleanPool(candidates.map((c) => c.url), opts))
  return candidates.filter((c) => ok.has(c.url))
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
  const verdicts = await Promise.all(fanart.map((p) => checkPosterText(p, signal)))
  return new Set(verdicts.filter((v) => !v.textless).map((v) => v.url))
}
