import { cacheGet, cacheSet } from "./cache"
import { getTrending } from "./tmdb"

/**
 * Badge "di tendenza" preso dalla classifica di TMDB.
 *
 * Da non confondere col rank del nastro: quello viene da JustWatch
 * (`/api/trending/rank` → `getJWRankings`) ed è una classifica di streaming
 * regionale. Questo è il trending di TMDB, globale e senza numero: si limita a
 * dire "questo titolo è nella lista della settimana".
 *
 * Si guarda l'appartenenza alle prime due pagine (40 titoli). Oltre, "di
 * tendenza" smette di voler dire qualcosa.
 */
const TRENDING_PAGES = 2
const TRENDING_TTL_MS = 30 * 60 * 1000

function cacheKey(mediaType: "movie" | "tv"): string {
  return `tmdb:trending:week:${mediaType}:p${TRENDING_PAGES}`
}

async function trendingIds(mediaType: "movie" | "tv", apiKey?: string): Promise<Set<number>> {
  const key = cacheKey(mediaType)
  const cached = cacheGet<number[]>(key)
  if (cached) return new Set(cached)

  const pages = await Promise.all(
    Array.from({ length: TRENDING_PAGES }, (_, i) => getTrending(mediaType, "week", apiKey, i + 1)),
  )
  const ids = pages.flatMap((p) => (p.results || []).map((r) => r.id))
  // Una lista vuota non si cacha: un errore upstream la renderebbe "niente è
  // di tendenza" per mezz'ora su ogni titolo.
  if (ids.length > 0) cacheSet(key, ids, ["tmdb", "trending"], TRENDING_TTL_MS)
  return new Set(ids)
}

/**
 * True se il titolo è nella classifica settimanale TMDB. Non lancia mai: il
 * badge è un extra e non deve poter far fallire un render.
 *
 * Il costo è una sola chiamata upstream per lista: `tmdbFetch` ha già LRU 5
 * minuti + coalescing delle richieste in volo, e qui sopra c'è la cache a 30
 * minuti. Una griglia catalogo da 20 poster paga una fetch, non venti.
 */
export async function isTmdbTrending(
  mediaType: "movie" | "tv", tmdbId: number, apiKey?: string,
): Promise<boolean> {
  try {
    return (await trendingIds(mediaType, apiKey)).has(tmdbId)
  } catch {
    return false
  }
}
