import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { isSameOrigin, originMismatchResponse } from "@/lib/auth"
import {
  clearUserPassword,
  extractUserPassword,
  extractUserToken,
  invalidUserResponse,
  InvalidUserPasswordError,
  isMultiUserEnabled,
  sanitizeUserId,
  setUserPassword,
  userAuthResponse,
  userRateLimitKey,
  verifyUserPassword,
  verifyUserToken,
} from "@/lib/user-auth"
import { readJsonBody, BodyTooLargeError, DEFAULT_MAX_BODY_BYTES } from "@/lib/read-body"

type RouteParams = { uuid: string }

/**
 * Imposta/cambia/rimuove la password del namespace (stile AIO).
 * Richiede la credenziale corrente (secret o vecchia password): senza,
 * nessun reset server-side (principio v4). Body:
 * `{password}` = imposta/sostituisce (min 8); `{password:null}` = rimuove
 * (resta il secret). Per cambiare serve anche `{current}` quando esiste già
 * una password — il secret vale sempre come `current`.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  const rl = await rateLimit(userId ? userRateLimitKey(req, userId) : rateLimitKey(req), "users-password")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (!userId) return invalidUserResponse()
  if (!isSameOrigin(req)) return originMismatchResponse()
  let body: unknown
  try {
    body = await readJsonBody(req, DEFAULT_MAX_BODY_BYTES)
  } catch (e) {
    if (e instanceof BodyTooLargeError) return Response.json({ error: "Request body too large" }, { status: 413 })
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const input = (body as { password?: unknown; current?: unknown } | null) ?? {}
  const wantsClear = input.password === null || input.password === "";

  // Autenticazione: secret oppure password corrente. Se il namespace ha già
  // una password, `current` è obbligatorio a meno che arrivi il secret.
  const token = extractUserToken(req)
  const tokenOk = !!token && (await verifyUserToken(userId, token))
  if (!tokenOk) {
    const current = typeof input.current === "string" ? input.current : extractUserPassword(req)
    if (!current || !(await verifyUserPassword(userId, current))) return userAuthResponse()
  }
  try {
    if (wantsClear) {
      await clearUserPassword(userId)
    } else {
      await setUserPassword(userId, input.password)
    }
  } catch (e) {
    if (e instanceof InvalidUserPasswordError) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
  return Response.json({ ok: true })
}
