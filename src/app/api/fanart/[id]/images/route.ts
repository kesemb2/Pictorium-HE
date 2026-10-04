import { NextRequest } from "next/server"
import { getFanartPosters, FanartError } from "@/lib/fanart"
import { resolveUserApiKeys } from "@/lib/tmdb"
import { getScopedUserId, extractUserParam } from "@/lib/user-auth"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { cacheGet, cacheSet } from "@/lib/cache"
import { jsonGzip } from "@/lib/json-response"
import { checkFanartPosterText } from "@/lib/poster-textless"

/** Poster "00" analizzati per titolo (in parallelo, anteprime piccole). */
const VERIFY_LIMIT = 6

type RouteParams = { id: string }

/**
 * GET /api/fanart/[id]/images?type=movie|tv
 * Poster verticali Fanart.tv normalizzati ({ url, lang, likes }).
 * Chiave progetto: spazio utente (`fanart` nelle chiavi cifrate) > env
 * d'istanza. Non esce mai dal server: il client riceve solo URL CDN.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const rl = await rateLimit(rateLimitKey(req), "fanart")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  const { id } = await params
  const type = req.nextUrl.searchParams.get("type") || "movie"
  if (type !== "movie" && type !== "tv") {
    return Response.json({ error: "Invalid type: must be 'movie' or 'tv'" }, { status: 400 })
  }
  const tmdbId = Number(id)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return Response.json({ error: "Invalid id: must be a positive integer" }, { status: 400 })
  }
  // Una sola risoluzione namespace per entrambe le kind (spazio > env).
  const userId = getScopedUserId(extractUserParam(req))
  const resolved = await resolveUserApiKeys(req, userId)
  if (!resolved.fanart.key) {
    return Response.json(
      { error: "Fanart.tv is not configured on this instance", code: "fanart_not_configured" },
      { status: 503 },
    )
  }
  // `v2`: ogni poster porta `textless` (tag "00" + controllo visivo).
  const cacheKey = `fanart:images:v2:${type}:${id}`
  const acceptEncoding = req.headers.get("accept-encoding")
  const cached = cacheGet<{ posters: unknown[]; source: string }>(cacheKey)
  if (cached) return jsonGzip(cached, 200, undefined, acceptEncoding)
  // Niente catch-and-cache: guasti upstream non diventano "nessun artwork".
  let posters: Awaited<ReturnType<typeof getFanartPosters>>
  try {
    posters = await getFanartPosters(
      type,
      tmdbId,
      { tmdbApiKey: resolved.tmdb.key, fanartKey: resolved.fanart.key },
      req.signal,
    )
  } catch (e) {
    if (e instanceof FanartError && e.code === "auth") {
      return jsonGzip({ error: "Fanart.tv rejected the project key", code: "fanart_auth_error" }, 502, undefined, acceptEncoding)
    }
    return jsonGzip({ error: "Fanart.tv unavailable", code: "fanart_unavailable" }, 502, undefined, acceptEncoding)
  }
  // `textless` true SOLO per "00" verificati senza testo: la tab non deve mai
  // presentare come clean un poster con il titolo stampato (fail-closed).
  const toVerify = new Set(posters.filter((p) => p.lang === "00").slice(0, VERIFY_LIMIT).map((p) => p.url))
  const verdicts = new Map((await Promise.all([...toVerify].map((u) => checkFanartPosterText(u, req.signal)))).map((v) => [v.url, v.textless]))
  const data = { posters: posters.map((p) => ({ ...p, textless: verdicts.get(p.url) === true })), source: "fanart" }
  // Hit 24h, assenza 10min (stessi TTL del client, senza segreti nella chiave).
  cacheSet(cacheKey, data, ["fanart", "images"], posters.length > 0 ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000)
  return jsonGzip(data, 200, undefined, acceptEncoding)
}
