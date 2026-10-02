import { cacheGet, cacheSet } from "./cache"
import { timedFetch } from "./outbound-stats"
import { createLogger } from "@/lib/logger"
import { envWithFallback } from "@/lib/env-compat"
import { createCircuitBreaker, parseRetryAfterMs } from "@/lib/circuit-breaker"
import { combineAbortSignals } from "@/lib/abort-signal"

const log = createLogger("anime-ratings")

// Override E2E/mock deterministici (stesso pattern di mdblist.ts/simkl.ts): in
// produzione le env sono assenti e si usano gli endpoint reali (tutti pubblici,
// nessuna API key richiesta).
const ANIZIP_BASE = process.env.ANIZIP_API_URL || "https://api.ani.zip"
const ANILIST_BASE = process.env.ANILIST_API_URL || "https://graphql.anilist.co"
const KITSU_BASE = process.env.KITSU_API_URL || "https://kitsu.app/api/edge"

const ANIME_TIMEOUT_MS = (() => {
  const raw = envWithFallback("ANIME_RATINGS_TIMEOUT_MS")
  const n = raw ? parseInt(raw, 10) : 1200
  return Number.isFinite(n) && n >= 300 && n <= 10000 ? n : 1200
})()

// Fail-open breaker dedicati per upstream: 3 fallimenti consecutivi → 30s di
// cooldown. Separati per isolare i guasti (AniList rate-limit non deve
// oscurare Kitsu e viceversa).
const anizipBreaker = createCircuitBreaker({ name: "anizip", failureThreshold: 3, backoffMs: 30_000 })
const anilistBreaker = createCircuitBreaker({ name: "anilist", failureThreshold: 3, backoffMs: 30_000 })
const kitsuBreaker = createCircuitBreaker({ name: "kitsu", failureThreshold: 3, backoffMs: 30_000 })

/** Solo per i test: azzera lo stato dei breaker anime. */
export function __resetAnimeBreakers(): void {
  anizipBreaker.reset()
  anilistBreaker.reset()
  kitsuBreaker.reset()
}

// Negativa in-memory per i miss (titolo non-anime / voto assente): 5 minuti
// invece dei 60s degli altri provider — un non-anime resta non-anime (le
// mapping AniZip si aggiungono di rado) e con anilist/kitsu nei default
// globali OGNI poster non-anime pagherebbe altrimenti un resolve AniZip.
const ANIME_NULL_TTL_MS = 5 * 60_000
const ANIME_NULL_MAX = 500
const animeNullAt = new Map<string, number>()

function animeNullSet(cacheKey: string): void {
  if (animeNullAt.size >= ANIME_NULL_MAX) {
    const firstKey = animeNullAt.keys().next().value
    if (firstKey) animeNullAt.delete(firstKey)
  }
  animeNullAt.set(cacheKey, Date.now())
}

function animeNullFresh(cacheKey: string): boolean {
  const nulledAt = animeNullAt.get(cacheKey)
  if (nulledAt === undefined) return false
  if (Date.now() - nulledAt < ANIME_NULL_TTL_MS) return true
  animeNullAt.delete(cacheKey)
  return false
}

/** Solo per i test: svuota la negative cache anime. */
export function __resetAnimeNullForTest(): void {
  animeNullAt.clear()
}

// Deduplica i fetch concorrenti sullo stesso ID (griglie catalogo: N render
// dello stesso titolo condividono un solo upstream, come tmdb.ts).
const animeInflight = new Map<string, Promise<unknown>>()

function coalesceAnime<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = animeInflight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const promise = run().finally(() => {
    if (animeInflight.get(key) === promise) animeInflight.delete(key)
  })
  animeInflight.set(key, promise)
  return promise
}

export interface AnimeRatingOptions {
  tmdbId?: number | string | null
  wantAnilist?: boolean
  wantKitsu?: boolean
  signal?: AbortSignal
}

export interface AnimeIds {
  anilistId: number | null
  kitsuId: number | null
}

export interface AnimeRatings {
  anilist?: number
  kitsu?: number
}

interface AnizipMappings {
  anilist_id?: number | string | null
  kitsu_id?: number | string | null
}

function toPositiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toTen(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round((n > 10 ? n / 10 : n) * 10) / 10
}

/**
 * Risolve gli ID proprietari anime (AniList/Kitsu) da TMDB o IMDb via AniZip.
 * Prova TMDB prima e IMDb dopo: un 404/miss sul primo non blocca il secondo
 * (la route poster passa tmdbId dall'URL e imdbId dalla query, e uno dei due
 * può non essere mappato). Errori transienti (5xx/rete/breaker) fermano
 * subito senza fallback (stesso upstream, ritentare raddoppierebbe i danni).
 * Ritorna null se il titolo non è un anime (404) o senza identificativi.
 * Cache condivisa KV (mapping stabili) + negativa 5min per i miss.
 *
 * NOTA duplicazione consapevole: episode-ordering.ts interroga già AniZip per
 * gli episodi (cache Map locale 6h, altro shape/TTL) — qui serve solo
 * `mappings` con cache KV condivisa, quindi modulo separato.
 */
export async function resolveAnimeIds(
  imdbId: string | null | undefined,
  tmdbId: number | string | null | undefined,
  signal?: AbortSignal,
): Promise<AnimeIds | null> {
  const attempts: { idKey: string; qp: string }[] = []
  if (tmdbId) attempts.push({ idKey: `tmdb:${tmdbId}`, qp: `themoviedb_id=${encodeURIComponent(String(tmdbId))}` })
  if (imdbId) attempts.push({ idKey: `imdb:${imdbId}`, qp: `imdb_id=${encodeURIComponent(imdbId)}` })
  if (attempts.length === 0) return null
  if (anizipBreaker.isOpen()) return null

  for (const attempt of attempts) {
    const cacheKey = `anime:map:${attempt.idKey}`
    const cached = cacheGet<AnimeIds>(cacheKey)
    if (cached) return cached
    if (animeNullFresh(cacheKey)) continue

    const outcome = await coalesceAnime(cacheKey, async (): Promise<{ status: "ok" | "miss" | "error"; ids: AnimeIds | null }> => {
      try {
        const res = await timedFetch(`${ANIZIP_BASE}/mappings?${attempt.qp}`, {
          headers: { Accept: "application/json" },
          signal: combineAbortSignals(signal, ANIME_TIMEOUT_MS),
        })
        if (res.status === 429 || res.status >= 500) {
          anizipBreaker.recordFailure(parseRetryAfterMs((n) => res.headers.get(n)))
          return { status: "error", ids: null }
        }
        // 404 = non-anime (o mapping assente): miss genuino in negativa, senza
        // far scattare il breaker per tutti i titoli non-anime.
        if (!res.ok) {
          animeNullSet(cacheKey)
          return { status: "miss", ids: null }
        }
        anizipBreaker.recordSuccess()
        const data = (await res.json().catch(() => null)) as { mappings?: AnizipMappings } | null
        const ids: AnimeIds = {
          anilistId: toPositiveInt(data?.mappings?.anilist_id),
          kitsuId: toPositiveInt(data?.mappings?.kitsu_id),
        }
        if (ids.anilistId === null && ids.kitsuId === null) {
          animeNullSet(cacheKey)
          return { status: "miss", ids: null }
        }
        cacheSet(cacheKey, ids, ["anime", "ratings"])
        return { status: "ok", ids }
      } catch (e) {
        if (!signal?.aborted) anizipBreaker.recordFailure()
        log.error("AniZip mapping fetch failed", { error: e instanceof Error ? e.message : String(e) })
        return { status: "error", ids: null }
      }
    })

    if (outcome.status === "ok") return outcome.ids
    if (outcome.status === "error") return null
    // miss → prova l'identificativo successivo
  }
  return null
}

async function fetchAnilistRating(anilistId: number, signal?: AbortSignal): Promise<number | null> {
  const cacheKey = `anime:rating:anilist:${anilistId}`
  const cached = cacheGet<number>(cacheKey)
  if (typeof cached === "number") return cached
  if (animeNullFresh(cacheKey)) return null
  if (anilistBreaker.isOpen()) return null

  return coalesceAnime(cacheKey, async (): Promise<number | null> => {
    try {
      const res = await timedFetch(ANILIST_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: "query ($id: Int) { Media(id: $id, type: ANIME) { averageScore } }",
          variables: { id: anilistId },
        }),
        signal: combineAbortSignals(signal, ANIME_TIMEOUT_MS),
      })
      if (res.status === 429 || res.status >= 500) {
        anilistBreaker.recordFailure(parseRetryAfterMs((n) => res.headers.get(n)))
        return null
      }
      if (!res.ok) {
        animeNullSet(cacheKey)
        return null
      }
      anilistBreaker.recordSuccess()
      const data = (await res.json().catch(() => null)) as { data?: { Media?: { averageScore?: unknown } | null } } | null
      const rating = toTen(data?.data?.Media?.averageScore)
      if (rating === null) {
        animeNullSet(cacheKey)
        return null
      }
      cacheSet(cacheKey, rating, ["anime", "ratings"])
      return rating
    } catch (e) {
      if (!signal?.aborted) anilistBreaker.recordFailure()
      log.error("AniList rating fetch failed", { error: e instanceof Error ? e.message : String(e) })
      return null
    }
  })
}

async function fetchKitsuRating(kitsuId: number, signal?: AbortSignal): Promise<number | null> {
  const cacheKey = `anime:rating:kitsu:${kitsuId}`
  const cached = cacheGet<number>(cacheKey)
  if (typeof cached === "number") return cached
  if (animeNullFresh(cacheKey)) return null
  if (kitsuBreaker.isOpen()) return null

  return coalesceAnime(cacheKey, async (): Promise<number | null> => {
    try {
      const res = await timedFetch(`${KITSU_BASE}/anime/${kitsuId}`, {
        headers: { Accept: "application/vnd.api+json" },
        signal: combineAbortSignals(signal, ANIME_TIMEOUT_MS),
      })
      if (res.status === 429 || res.status >= 500) {
        kitsuBreaker.recordFailure(parseRetryAfterMs((n) => res.headers.get(n)))
        return null
      }
      if (!res.ok) {
        animeNullSet(cacheKey)
        return null
      }
      kitsuBreaker.recordSuccess()
      const data = (await res.json().catch(() => null)) as { data?: { attributes?: { averageRating?: unknown } } } | null
      const rating = toTen(data?.data?.attributes?.averageRating)
      if (rating === null) {
        animeNullSet(cacheKey)
        return null
      }
      cacheSet(cacheKey, rating, ["anime", "ratings"])
      return rating
    } catch (e) {
      if (!signal?.aborted) kitsuBreaker.recordFailure()
      log.error("Kitsu rating fetch failed", { error: e instanceof Error ? e.message : String(e) })
      return null
    }
  })
}

/**
 * Voti community anime (AniList/Kitsu) per un titolo. Si attiva solo se
 * almeno una delle due fonti è richiesta: a flag spenti zero chiamate di rete
 * (zero overhead per tutti i poster non-anime).
 */
export async function fetchAnimeRatings(
  imdbId: string | null | undefined,
  options?: AnimeRatingOptions,
): Promise<AnimeRatings | null> {
  const wantAnilist = !!options?.wantAnilist
  const wantKitsu = !!options?.wantKitsu
  if (!wantAnilist && !wantKitsu) return null

  const ids = await resolveAnimeIds(imdbId, options?.tmdbId, options?.signal)
  if (!ids) return null

  const [anilist, kitsu] = await Promise.all([
    wantAnilist && ids.anilistId !== null
      ? fetchAnilistRating(ids.anilistId, options?.signal).catch(() => null)
      : Promise.resolve(null),
    wantKitsu && ids.kitsuId !== null
      ? fetchKitsuRating(ids.kitsuId, options?.signal).catch(() => null)
      : Promise.resolve(null),
  ])

  const out: AnimeRatings = {}
  if (typeof anilist === "number") out.anilist = anilist
  if (typeof kitsu === "number") out.kitsu = kitsu
  return Object.keys(out).length > 0 ? out : null
}
