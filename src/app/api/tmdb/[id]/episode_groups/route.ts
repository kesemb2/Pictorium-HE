import { NextRequest } from "next/server"
import { getTVEpisodeGroups, resolveRouteApiKey } from "@/lib/tmdb"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(rateLimitKey(req), "tmdb")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)

  const { id } = await params
  const tvId = parseInt(id, 10)
  if (Number.isNaN(tvId) || tvId <= 0) {
    return Response.json({ results: [] }, { status: 400 })
  }

  const apiKey = await resolveRouteApiKey(req)
  const results = await getTVEpisodeGroups(tvId, apiKey)
  return Response.json({ results })
}
