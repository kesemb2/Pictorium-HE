import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { cacheGet, cacheSet } from "@/lib/cache"
import { createLogger } from "@/lib/logger"
import { fetchMDBList } from "@/lib/mdblist"
import { getDetails, resolveRouteApiKey } from "@/lib/tmdb"
import { resolveImdbToTmdb } from "@/lib/imdb-resolver"
import type { EnrichedAnimeItem } from "@/lib/validation"

const log = createLogger("mdblist-anime")

export async function GET(req: NextRequest) {
  const rl = await rateLimit(rateLimitKey(req), "tmdb")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)

  const typeParam = req.nextUrl.searchParams.get("type") // "movie" | "tv" | null
  const cacheKey = `mdblist:anime:top20:${typeParam || "all"}:enriched`

  const cached = cacheGet<EnrichedAnimeItem[]>(cacheKey)
  if (cached) return Response.json(cached)

  const mdblistKey = (await resolveRouteApiKey(req, "mdblist")) || ""
  const tmdbKey = await resolveRouteApiKey(req)
  if (!mdblistKey || !tmdbKey) return Response.json([])

  try {
    const listsToFetch: Array<{ key: string; mediaType: "tv" | "movie" }> = []
    if (!typeParam || typeParam === "tv" || typeParam === "series") {
      listsToFetch.push({ key: "mdblistAnime", mediaType: "tv" })
    }
    if (!typeParam || typeParam === "movie") {
      listsToFetch.push({ key: "mdblistAnimeMovie", mediaType: "movie" })
    }

    const allResults = await Promise.all(
      listsToFetch.map(async ({ key, mediaType }) => {
        const entries = await fetchMDBList(key, mdblistKey)
        const enriched = await Promise.all(
          entries.slice(0, 20).map(async (entry, idx): Promise<EnrichedAnimeItem | null> => {
            let tmdbId = entry.tmdb
            if (!tmdbId && entry.imdb) {
              tmdbId = (await resolveImdbToTmdb(entry.imdb, mediaType, tmdbKey)) ?? undefined
            }
            if (!tmdbId) return null
            try {
              const found = await getDetails(mediaType, tmdbId, "it-IT", tmdbKey)
              return {
                id: tmdbId,
                title: found.title || found.name || entry.title || "",
                poster_path: found.poster_path || "",
                rank: idx + 1,
                media_type: mediaType,
              }
            } catch (e) {
              log.error("TMDB lookup failed", { error: e instanceof Error ? e.message : String(e) })
              return null
            }
          })
        )
        return enriched.filter((r): r is EnrichedAnimeItem => r !== null)
      })
    )

    const flattened = allResults.flat()
    if (flattened.length > 0) cacheSet(cacheKey, flattened, ["mdblist"])
    return Response.json(flattened)
  } catch (e) {
    log.error("Fetch failed", { error: e instanceof Error ? e.message : String(e) })
    return Response.json([])
  }
}
