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
import { ARTWORKS_BASE, type TvdbArtwork } from "@/lib/tvdb"
import { detectPosterText } from "@/lib/poster-text-detect"
import { createLogger } from "@/lib/logger"

const log = createLogger("poster-textless")

/** Il verdetto dipende solo dai byte dell'immagine: cache lunga per URL. */
const VERDICT_TTL = 30 * 24 * 60 * 60 * 1000
const VERDICT_TAG = "fanart"
/**
 * Quanti candidati clean per fonte analizza il render (Stremio rende i
 * cataloghi a raffiche: qui conta solo il primo clean, che è lo stesso
 * dell'editor perché l'ordine è identico). Oltre il limite un candidato non è
 * verificato e quindi non è clean.
 */
export const CLEAN_VERIFY_LIMIT = 6
/**
 * Fork: l'editor verifica tutto il pool di ogni fonte (TMDB, fanart, TVDB):
 * la griglia "clean" mostra solo i verificati, e con 6 restavano fuori poster
 * senza testo solo perché arrivavano dopo. Verdetti in cache 30 giorni.
 */
export const EDITOR_CLEAN_VERIFY_LIMIT = 30
/** Controlli in volo insieme (anteprime piccole; un pool da 30 non deve aprire 30 fetch). */
const VERIFY_CONCURRENCY = 8
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

/** URL esterno che il controllo sa analizzare (fanart o artwork TVDB). */
export function isVerifiableUrl(url: string | null | undefined): url is string {
  return isFanartAssetUrl(url) || (typeof url === "string" && url.startsWith(`${ARTWORKS_BASE}/`))
}

/** `fn` su ogni elemento con al più `limit` chiamate in volo; ordine preservato. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
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
  const verdicts = await mapLimit(candidates, VERIFY_CONCURRENCY, (c) => checkPosterText(c, opts.signal))
  opts.checks?.push(...verdicts)
  return candidates.filter((_, i) => verdicts[i]!.textless)
}

/**
 * Candidati clean fanart: "00" (lingua "None") e lingua assente. La lingua
 * assente da sola non dice nulla sul testo, ma il controllo visivo decide:
 * un poster senza testo non resta fuori solo perché chi l'ha caricato non ha
 * compilato la lingua. Una lingua vera vuol dire titolo stampato: non si
 * analizza.
 */
export function fanartCleanCandidates(images: readonly FanartImage[]): readonly FanartImage[] {
  return [...textlessOnly(images), ...images.filter((i) => !i.lang)]
}

/**
 * Poster fanart davvero senza testo, nell'ordine di fanart (likes, prima i
 * "00"): candidato clean + controllo visivo. Solo i primi `limit` candidati vengono analizzati (in
 * parallelo); `checks` raccoglie i verdetti per debug=1.
 */
export async function verifiedTextlessPosters(
  images: readonly FanartImage[],
  opts: { limit: number; signal?: AbortSignal; checks?: FanartTextCheck[] },
): Promise<FanartImage[]> {
  const candidates = fanartCleanCandidates(images)
  const ok = new Set(await verifyCleanPool(candidates.map((c) => c.url), opts))
  return candidates.filter((c) => ok.has(c.url))
}

/**
 * Poster fanart nella forma TMDB per l'editor. `iso_639_1: null` (clean) SOLO
 * per i verificati; candidati non verificati → "und" (mai clean, fuori dalla
 * griglia); le lingue vere restano tali.
 */
export async function fanartPostersAsTmdb(
  images: readonly FanartImage[],
  opts: { limit: number; signal?: AbortSignal; checks?: PosterTextCheck[] },
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

/** Artwork TVDB in forma TMDB (`source: "tvdb"`), solo clean verificati. */
export interface ExternalPosterImage {
  readonly file_path: string
  readonly iso_639_1: string | null
  readonly width: number
  readonly height: number
  readonly vote_average: number
  readonly source: "fanart" | "tvdb"
}

/**
 * Poster TVDB clean per l'editor: verticali (o misure ignote) marcati
 * `includesText: false` E verificati senza testo, per score TVDB. Quelli con
 * testo non servono: la griglia mostra solo il pool clean.
 */
export async function tvdbCleanPosters(
  arts: readonly TvdbArtwork[],
  opts: { limit: number; signal?: AbortSignal; checks?: PosterTextCheck[] },
): Promise<ExternalPosterImage[]> {
  const candidates = arts
    .filter((a) => a.image && a.includesText === false && !((a.width ?? 0) > 0 && (a.height ?? 0) > 0 && (a.width ?? 0) >= (a.height ?? 0)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const ok = new Set(await verifyCleanPool(candidates.map((a) => a.image), opts))
  return candidates.filter((a) => ok.has(a.image)).map((a) => ({
    file_path: a.image,
    iso_639_1: null,
    width: a.width ?? 0,
    height: a.height ?? 0,
    vote_average: a.score ?? 0,
    source: "tvdb" as const,
  }))
}

/**
 * Filtro per percorsi salvati (rotazione, base custom): gli URL esterni
 * (fanart, TVDB) passano solo se verificati; i path TMDB passano invariati
 * (sono entrati nel pool già verificati dall'editor).
 */
export async function rejectTextedUrls(paths: readonly string[], signal?: AbortSignal): Promise<Set<string>> {
  const external = paths.filter(isVerifiableUrl)
  const verdicts = await mapLimit(external, VERIFY_CONCURRENCY, (p) => checkPosterText(p, signal))
  return new Set(verdicts.filter((v) => !v.textless).map((v) => v.url))
}

/** Alias storico (prima il filtro copriva solo fanart). */
export const rejectTextedFanart = rejectTextedUrls
