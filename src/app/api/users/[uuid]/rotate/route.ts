import { NextRequest } from "next/server"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import {
  checkUserAuth,
  invalidUserResponse,
  isMultiUserEnabled,
  rotateUserSecret,
  sanitizeUserId,
  userAuthResponse,
  userRateLimitKey,
} from "@/lib/user-auth"

type RouteParams = { uuid: string }

/**
 * Ruota il secret del namespace (revoca leak): richiede la credenziale
 * corrente (secret o password). Ritorna il nuovo secret una volta sola;
 * il vecchio smette di funzionare subito. La password resta invariata.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  if (!userId) return invalidUserResponse()
  const rl = await rateLimit(userRateLimitKey(req, userId), "users-password")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (!(await checkUserAuth(req, userId))) return userAuthResponse()
  try {
    const secret = await rotateUserSecret(userId)
    // Il nuovo secret viaggia SOLO in questo body, una volta sola. Mai nei log.
    return Response.json({ secret })
  } catch {
    return userAuthResponse()
  }
}
