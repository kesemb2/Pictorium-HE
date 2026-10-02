import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import {
  checkUserAuth,
  invalidUserResponse,
  isMultiUserEnabled,
  sanitizeUserId,
  userAuthResponse,
  userRateLimitKey,
} from "@/lib/user-auth"
import { isSameOrigin, originMismatchResponse } from "@/lib/auth"
import {
  getUserKeysDisabled,
  getUserKeysHealth,
  getUserKeysStatus,
  InvalidUserKeyError,
  KeysEncryptionUnavailableError,
  setUserKeys,
  USER_KEY_KINDS,
  type UserKeyKind,
} from "@/lib/user-keys"
import { readJsonBody, BodyTooLargeError, DEFAULT_MAX_BODY_BYTES } from "@/lib/read-body"

type RouteParams = { uuid: string }

/**
 * Chiavi API del namespace (multi-user, slice 2).
 *
 * GET → solo presenza per kind (`{tmdb, mdblist, tvdb, simkl}` booleani) + flag
 * soft-disable (`disabled`): MAI valori, MAI nei log. PUT → salva/cancella
 * (stringa = imposta, `""`/`null` = cancella, campo assente = invariato) e
 * soft-disable (`{ value?, disabled? }`: il flag non tocca il materiale).
 * POST `/reveal` → restituisce UNA chiave al proprietario autenticato (sotto):
 * unica eccezione all'eco, rate-limitata e mai loggata. La cifratura a riposo
 * è AES-256-GCM con PROFILE_ENCRYPTION_KEY: senza env valida il salvataggio
 * è rifiutato fail-closed (503), mai chiavi in chiaro. I soli flag e le sole
 * cancellazioni passano anche senza env.
 */

async function checkAccess(req: NextRequest, uuid: string): Promise<{ userId: string } | Response> {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const userId = sanitizeUserId(uuid)
  if (!userId) return invalidUserResponse()
  if (!(await checkUserAuth(req, userId))) return userAuthResponse()
  return { userId }
}

export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  const rl = await rateLimit(userId ? userRateLimitKey(req, userId) : rateLimitKey(req), "defaults")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  const access = await checkAccess(req, uuid)
  if (access instanceof Response) return access
  const { hasUserPassword } = await import("@/lib/user-auth")
  // Stato onesto: presenza (contratto storico) + decifrabilità (env corrente)
  // + soft-disable. I client vecchi leggono i booleani top-level, quelli nuovi
  // usano `health` e `disabled`.
  const health = await getUserKeysHealth(access.userId)
  return Response.json({ ...(await getUserKeysStatus(access.userId)), disabled: await getUserKeysDisabled(access.userId), health, hasPassword: await hasUserPassword(access.userId) })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  const rl = await rateLimit(userId ? userRateLimitKey(req, userId) : rateLimitKey(req), "defaults")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  const access = await checkAccess(req, uuid)
  if (access instanceof Response) return access
  if (!isSameOrigin(req)) return originMismatchResponse()
  let body: unknown
  try {
    body = await readJsonBody(req, DEFAULT_MAX_BODY_BYTES)
  } catch (e) {
    if (e instanceof BodyTooLargeError) return Response.json({ error: "Request body too large" }, { status: 413 })
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 })
  }
  const input: Partial<Record<UserKeyKind, unknown>> = {}
  for (const kind of USER_KEY_KINDS) {
    if (kind in (body as Record<string, unknown>)) {
      input[kind] = (body as Record<string, unknown>)[kind]
    }
  }
  try {
    await setUserKeys(access.userId, input)
  } catch (e) {
    if (e instanceof InvalidUserKeyError) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    if (e instanceof KeysEncryptionUnavailableError) {
      return Response.json({ error: e.message }, { status: 503 })
    }
    throw e
  }
  return Response.json({ ok: true, keys: await getUserKeysStatus(access.userId), disabled: await getUserKeysDisabled(access.userId) })
}
