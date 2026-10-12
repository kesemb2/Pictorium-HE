import type { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { resolveImdbToTmdb } from "@/lib/imdb-resolver"
import { getEpisodeStills, resolveUserApiKeys } from "@/lib/tmdb"
import { cacheGet, cacheSet } from "@/lib/cache"
import { createLogger } from "@/lib/logger"
import { validatePosterQuery } from "@/lib/validation"
import { getScopedUserId, userExists, userRateLimitKey } from "@/lib/user-auth"
import { parseEpisodeSegment, pickEpisodeStill, safeFallbackUrl, tmdbOriginalUrl } from "@/lib/episode-thumbnail"

const log = createLogger("thumbnail")

export const maxDuration = 15

const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 60 * 60 * 1000
const TIMEOUT_MS = 8000

function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }
}

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders(),
      Location: url,
      // L'immagine di un episodio non cambia: la CDN la tiene una settimana.
      "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800",
      "CDN-Cache-Control": "public, max-age=604800, s-maxage=604800",
    },
  })
}

interface RouteParams { id: string; ep: string }

/**
 * Fork: thumbnail pulita e in alta risoluzione di un episodio, per il campo
 * "Episode Thumbnail URL Pattern" di AIOMetadata:
 *   /api/thumbnail/{imdb_id|tmdb_id}/S{season}E{episode}?fallback={thumbnail}
 * Reindirizza all'immagine TMDB originale, senza ritocchi. Senza immagine:
 * il ripiego di AIOMetadata (solo host noti), altrimenti 404 — e AIOMetadata
 * tiene la sua.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  let scopedUser = getScopedUserId(req.nextUrl.searchParams.get("u") ?? req.nextUrl.searchParams.get("user"))
  const rl = await rateLimit(scopedUser ? userRateLimitKey(req, scopedUser) : rateLimitKey(req), "thumbnail")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (scopedUser && !(await userExists(scopedUser))) scopedUser = null

  const invalidQuery = validatePosterQuery(req.nextUrl.searchParams)
  if (invalidQuery) return new Response(invalidQuery, { status: 400, headers: corsHeaders() })

  const { id, ep } = await params
  const episodeRef = parseEpisodeSegment(ep ?? "")
  if (!episodeRef) return new Response("Invalid episode (expected S{season}E{episode})", { status: 400, headers: corsHeaders() })
  const fallback = safeFallbackUrl(req.nextUrl.searchParams.get("fallback"))

  const apiKey = (await resolveUserApiKeys(req, scopedUser)).tmdb.key
  let tvId = /^\d+$/.test(id ?? "") ? Number(id) : NaN
  if (!(tvId > 0) && typeof id === "string" && /^tt\d+$/.test(id)) {
    tvId = (await resolveImdbToTmdb(id, "tv", apiKey).catch(() => null)) ?? NaN
  }
  if (!(tvId > 0)) {
    return fallback ? redirect(fallback) : new Response("Unknown series", { status: 404, headers: corsHeaders() })
  }

  const { season, episode } = episodeRef
  const memoKey = `thumbnail:v1:${tvId}:${season}:${episode}`
  const memo = cacheGet<{ url: string | null }>(memoKey)
  let url = memo?.url ?? null
  if (!memo) {
    try {
      const stills = await getEpisodeStills(tvId, season, episode, apiKey, undefined, TIMEOUT_MS)
      const best = pickEpisodeStill(stills)
      url = best ? tmdbOriginalUrl(best.file_path) : null
      cacheSet(memoKey, { url }, ["thumbnail", "tmdb"], url ? HIT_TTL_MS : MISS_TTL_MS)
    } catch (e) {
      // Errore transitorio (timeout, chiave): niente memo, il prossimo riprova.
      log.warn("Episode stills unavailable", { tvId, season, episode, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (url) return redirect(url)
  if (fallback) return redirect(fallback)
  return new Response("No thumbnail", { status: 404, headers: corsHeaders() })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
