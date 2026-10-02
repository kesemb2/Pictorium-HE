import { cacheGet, cacheSet } from "./cache"
import { timedFetch } from "./outbound-stats"
import { createLogger } from "@/lib/logger"
import { envWithFallback } from "@/lib/env-compat"
import { createCircuitBreaker, parseRetryAfterMs } from "@/lib/circuit-breaker"
import { combineAbortSignals } from "@/lib/abort-signal"
import { APP_VERSION } from "@/generated/app-version"

const log = createLogger("simkl")

const SIMKL_BASE = process.env.SIMKL_API_URL || "https://api.simkl.com"
const APP_NAME = "Pictorium"
const USER_AGENT = `Pictorium/${APP_VERSION}`

const SIMKL_TIMEOUT_MS = (() => {
  const raw = envWithFallback("SIMKL_TIMEOUT_MS")
  const n = raw ? parseInt(raw, 10) : 1500
  return Number.isFinite(n) && n >= 300 && n <= 10000 ? n : 1500
})()

// Fail-open circuit breaker dedicato: 3 fallimenti consecutivi → 30s di cooldown.
const simklBreaker = createCircuitBreaker({ name: "simkl", failureThreshold: 3, backoffMs: 30_000 })

export function __resetSimklBreaker(): void {
  simklBreaker.reset()
}

export function isSimklBreakerOpen(): boolean {
  return simklBreaker.isOpen()
}

const SIMKL_NULL_TTL_MS = 60_000
const SIMKL_NULL_MAX = 500
const simklNullAt = new Map<string, number>()

function simklNullSet(cacheKey: string): void {
  if (simklNullAt.size >= SIMKL_NULL_MAX) {
    const firstKey = simklNullAt.keys().next().value
    if (firstKey) simklNullAt.delete(firstKey)
  }
  simklNullAt.set(cacheKey, Date.now())
}

export function __resetSimklNullForTest(): void {
  simklNullAt.clear()
}

export interface SimklLookupOptions {
  tmdbId?: number | string | null
  mediaType?: "movie" | "tv" | "series" | "anime" | null
  signal?: AbortSignal
}

export interface SimklMediaId {
  type: "movies" | "tv" | "anime"
  simklId: string
}

/**
 * Risolve un ID esterno (IMDb o TMDB) nel corrispondente ID canonico Simkl ({ type, simklId })
 * tramite il redirect 301 di Simkl (stop-at-301, senza seguire il redirect).
 */
export async function resolveSimklId(
  imdbId: string | null | undefined,
  clientId: string,
  options?: SimklLookupOptions
): Promise<SimklMediaId | null> {
  const trimmedKey = clientId?.trim()
  if (!trimmedKey) return null

  const idKey = imdbId ? `imdb:${imdbId}` : options?.tmdbId ? `tmdb:${options.tmdbId}:${options.mediaType || "movie"}` : null
  if (!idKey) return null

  const cacheKey = `simkl:id:${idKey}`
  const cached = cacheGet<SimklMediaId>(cacheKey)
  if (cached) return cached

  const nulledAt = simklNullAt.get(cacheKey)
  if (nulledAt !== undefined) {
    if (Date.now() - nulledAt < SIMKL_NULL_TTL_MS) return null
    simklNullAt.delete(cacheKey)
  }

  if (simklBreaker.isOpen()) return null

  const queryParams = new URLSearchParams({
    to: "simkl",
    client_id: trimmedKey,
    "app-name": APP_NAME,
    "app-version": APP_VERSION,
  })

  if (imdbId) {
    queryParams.set("imdb", imdbId)
  } else if (options?.tmdbId) {
    queryParams.set("tmdb", String(options.tmdbId))
    const mType = options.mediaType === "tv" || options.mediaType === "series" ? "tv" : "movie"
    queryParams.set("type", mType)
  }

  const fetchUrl = `${SIMKL_BASE}/redirect?${queryParams.toString()}`

  try {
    const combinedSignal = combineAbortSignals(options?.signal, SIMKL_TIMEOUT_MS)
    const res = await timedFetch(fetchUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        "simkl-api-key": trimmedKey,
      },
      signal: combinedSignal,
    })

    if (res.status === 429 || res.status >= 500) {
      simklBreaker.recordFailure(parseRetryAfterMs((n) => res.headers.get(n)))
      return null
    }

    // Il redirect deve restituire 301 o 302 con Location header
    const location = res.headers.get("location")
    if ((res.status === 301 || res.status === 302) && location) {
      const match = location.match(/\/(movies|tv|anime)\/(\d+)/i)
      if (match) {
        const type = match[1].toLowerCase() as "movies" | "tv" | "anime"
        const simklId = match[2]
        const result: SimklMediaId = { type, simklId }
        simklBreaker.recordSuccess()
        // Gli ID canonici sono stabili e persistenti nel tempo: salviamo con tag simkl
        cacheSet(cacheKey, result, ["simkl"])
        return result
      }
    }

    // Se non ha fatto redirect valido o non è stato trovato
    simklNullSet(cacheKey)
    return null
  } catch (e) {
    if (!options?.signal?.aborted) simklBreaker.recordFailure()
    log.error("Simkl redirect resolution failed", { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/**
 * Recupera il punteggio community di Simkl (scala 0-10, es. 8.6) per un titolo.
 * Rigorosamente BYOK: se clientId è vuoto o assente, ritorna null senza chiamate di rete.
 */
export async function fetchSimklRating(
  imdbId: string | null | undefined,
  clientId: string | null | undefined,
  options?: SimklLookupOptions
): Promise<number | null> {
  const trimmedKey = clientId?.trim()
  if (!trimmedKey) return null

  const resolved = await resolveSimklId(imdbId, trimmedKey, options)
  if (!resolved) return null

  const cacheKey = `simkl:rating:${resolved.type}:${resolved.simklId}`
  const cached = cacheGet<number>(cacheKey)
  if (typeof cached === "number") return cached

  const nulledAt = simklNullAt.get(cacheKey)
  if (nulledAt !== undefined) {
    if (Date.now() - nulledAt < SIMKL_NULL_TTL_MS) return null
    simklNullAt.delete(cacheKey)
  }

  if (simklBreaker.isOpen()) return null

  const queryParams = new URLSearchParams({
    client_id: trimmedKey,
    "app-name": APP_NAME,
    "app-version": APP_VERSION,
  })

  const fetchUrl = `${SIMKL_BASE}/${resolved.type}/${resolved.simklId}?${queryParams.toString()}`

  try {
    const combinedSignal = combineAbortSignals(options?.signal, SIMKL_TIMEOUT_MS)
    const res = await timedFetch(fetchUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        "simkl-api-key": trimmedKey,
      },
      signal: combinedSignal,
    })

    if (res.status === 429 || res.status >= 500) {
      simklBreaker.recordFailure(parseRetryAfterMs((n) => res.headers.get(n)))
      return null
    }

    if (!res.ok) {
      simklNullSet(cacheKey)
      return null
    }

    simklBreaker.recordSuccess()

    const data = await res.json().catch(() => null)
    const rawRating = data?.ratings?.simkl?.rating
    const num = typeof rawRating === "number" ? rawRating : parseFloat(rawRating)

    if (!isNaN(num) && num > 0) {
      const normalized = Math.round((num > 10 ? num / 10 : num) * 10) / 10
      cacheSet(cacheKey, normalized, ["simkl"])
      return normalized
    }

    simklNullSet(cacheKey)
    return null
  } catch (e) {
    if (!options?.signal?.aborted) simklBreaker.recordFailure()
    log.error("Simkl details fetch failed", { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}
