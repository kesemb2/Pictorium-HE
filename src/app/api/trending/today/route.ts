import { NextRequest } from "next/server"
import { getDetails, resolveRouteApiKey } from "@/lib/tmdb"
import { getTopToday } from "@/lib/top-today"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { cacheGet, cacheSet } from "@/lib/cache"

/**
 * Fork: la top 10 di oggi (lib/top-today) per la pagina Cataloghi, con titolo
 * e poster nella lingua richiesta. Stessa lista dei cataloghi
 * `pictorium-today-*` e del numero al neon sui poster orizzontali.
 */
const TTL_MS = 30 * 60 * 1000

interface TodayItem {
  id: number
  media_type: "movie" | "tv"
  title?: string
  name?: string
  poster_path: string | null
  rank: number
}

export async function GET(req: NextRequest) {
  const rl = await rateLimit(rateLimitKey(req), "tmdb")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  const type = req.nextUrl.searchParams.get("type")
  if (type !== "movie" && type !== "tv") {
    return Response.json({ error: "Invalid type: must be 'movie' or 'tv'" }, { status: 400 })
  }
  const rawLang = req.nextUrl.searchParams.get("lang") || "en"
  const lang = /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLang) ? rawLang : "en"
  const day = new Date().toISOString().slice(0, 10)
  const key = `toptoday:items:${type}:${lang}:${day}`
  const cached = cacheGet<{ items: TodayItem[] }>(key)
  if (cached) return Response.json(cached)
  const apiKey = await resolveRouteApiKey(req)
  const ids = await getTopToday(type, apiKey)
  const items = await Promise.all(ids.map(async (id, idx): Promise<TodayItem> => {
    const d = await getDetails(type, id, lang, apiKey).catch(() => null)
    return {
      id,
      media_type: type,
      title: type === "movie" ? (d?.title ?? undefined) : undefined,
      name: type === "tv" ? (d?.name ?? undefined) : undefined,
      poster_path: d?.poster_path ?? null,
      rank: idx + 1,
    }
  }))
  const body = { items }
  // Una lista vuota (TMDB giù, chiave assente) non si cacha.
  if (items.length > 0) cacheSet(key, body, ["tmdb", "trending"], TTL_MS)
  return Response.json(body)
}
