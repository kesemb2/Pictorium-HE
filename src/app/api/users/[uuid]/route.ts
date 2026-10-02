import { NextRequest } from "next/server"
import { isSameOrigin, originMismatchResponse } from "@/lib/auth"
import { checkUserAuth, sanitizeUserId, invalidUserResponse, isMultiUserEnabled, userAuthResponse, userRateLimitKey } from "@/lib/user-auth"
import { deleteUser } from "@/lib/user-activity"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"

type RouteParams = { uuid: string }

/**
 * Wipe account (multi-user, GDPR): cancella integralmente il namespace
 * (auth, chiavi, mapping, defaults, epoch, activity) e scade le sue entry
 * di cache in-process. Solo il proprietario (user-token) + same-origin.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  const rl = await rateLimit(userId ? userRateLimitKey(req, userId) : rateLimitKey(req), "defaults")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (!userId) return invalidUserResponse()
  if (!(await checkUserAuth(req, userId))) return userAuthResponse()
  if (!isSameOrigin(req)) return originMismatchResponse()
  const freedBytes = await deleteUser(userId)
  return Response.json({ ok: true, freedBytes })
}
