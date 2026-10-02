import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import {
  invalidUserResponse,
  isMultiUserEnabled,
  sanitizeUserId,
  userAuthResponse,
  userRateLimitKey,
  verifyUserPassword,
} from "@/lib/user-auth"
import { readJsonBody, BodyTooLargeError, DEFAULT_MAX_BODY_BYTES } from "@/lib/read-body"

type RouteParams = { uuid: string }

/**
 * Conferma password (stile AIO: al ritorno mostra l'UUID e chiede la pass).
 * Body `{password}` → `{ok:true}` / 401. Bucket stretto anti brute-force;
 * non distingue inesistente da errata oltre quanto fa già `exists`.
 * Mai secret/password in risposta o log.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  const rl = await rateLimit(userId ? userRateLimitKey(req, userId) : rateLimitKey(req), "users-password")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (!userId) return invalidUserResponse()
  let body: unknown
  try {
    body = await readJsonBody(req, DEFAULT_MAX_BODY_BYTES)
  } catch (e) {
    if (e instanceof BodyTooLargeError) return Response.json({ error: "Request body too large" }, { status: 413 })
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const password = (body as { password?: unknown } | null)?.password
  if (typeof password !== "string" || !password) {
    return Response.json({ error: "password required" }, { status: 400 })
  }
  if (!(await verifyUserPassword(userId, password))) return userAuthResponse()
  return Response.json({ ok: true })
}
