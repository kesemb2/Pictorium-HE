import { NextRequest } from "next/server"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { checkUserAuth, invalidUserResponse, isMultiUserEnabled, sanitizeUserId, userAuthResponse, userExists, userRateLimitKey } from "@/lib/user-auth"

type RouteParams = { uuid: string }

/**
 * Esistenza namespace (oracolo morto): richiede auth del proprietario
 * (secret o password). Senza credenziale → 401 sia che l'UUID esista o meno,
 * così il probing non distingue esistente/inesistente. Con credenziale valida
 * → `{exists:true}` (l'auth passata implica esistenza).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const { uuid } = await params
  const userId = sanitizeUserId(uuid)
  // Presente ma invalido (es. traversal) → 400, mai lookup.
  if (!userId) return invalidUserResponse()
  const rl = await rateLimit(userRateLimitKey(req, userId), "users-password")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (!(await checkUserAuth(req, userId))) return userAuthResponse()
  return Response.json({ exists: await userExists(userId) })
}
