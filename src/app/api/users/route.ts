import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { createUser, getMaxUsers, InvalidUserPasswordError, isMultiUserEnabled } from "@/lib/user-auth"
import { readBodyBytes } from "@/lib/read-body"
import { createLogger } from "@/lib/logger"
import { listUsers } from "@/lib/user-activity"

const log = createLogger("users")

/**
 * Crea un utente: `{ uuid (v4, pubblico), secret (mostrato una volta) }`.
 * Body `{password}` OBBLIGATORIA (min 8, max 128): senza password d'accesso
 * lo spazio sarebbe raggiungibile solo col secret una tantum — su istanza
 * pubblica ogni spazio deve avere il suo login (modello AIOmetadata).
 *
 * Il namespace nasce VUOTO e isolato: niente import automatico dai globali
 * legacy (su istanza pubblica il primo registrato non deve ereditare i dati
 * dell'operatore). Chi migra single-user → UUID lancia esplicitamente
 * `POST /api/users/:uuid/import-global` autenticato.
 */
export async function POST(req: NextRequest) {
  if (!isMultiUserEnabled()) {
    return Response.json({ error: "Multi-user is disabled" }, { status: 404 })
  }
  const rl = await rateLimit(rateLimitKey(req), "users-create")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  // Cap anti-Sybil (solo se l'operatore lo configura): oltre il cap niente
  // nuovi namespace. Il conteggio resta best-effort (listUsers) — mai far
  // fallire per un check che può degradare, ma mai superare il cap noto.
  try {
    const maxUsers = getMaxUsers()
    if (maxUsers > 0) {
      const existing = await listUsers()
      if (existing.length >= maxUsers) {
        return Response.json({ error: "User limit reached" }, { status: 429 })
      }
    }
  } catch (e) {
    log.warn("max-users check degraded", { error: e instanceof Error ? e.message : String(e) })
  }
  let password: unknown
  try {
    const bytes = await readBodyBytes(req, 1024)
    if (bytes === null) return Response.json({ error: "Request body too large" }, { status: 413 })
    if (bytes.length > 0) {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { password?: unknown } | null
      password = typeof parsed === "object" && parsed !== null ? parsed.password : undefined
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  // Password obbligatoria (vedi sopra): assente/vuota/non-stringa → 400 prima
  // ancora di toccare lo store. La validazione di formato resta a createUser.
  if (typeof password !== "string" || !password.trim()) {
    return Response.json({ error: "Password required (min 8 characters)" }, { status: 400 })
  }
  try {
    const created = await createUser(password)
    // Il secret viaggia SOLO in questo body, una volta sola. Mai nei log.
    // Niente auto-import: il namespace nasce vuoto (vedi sopra).
    return Response.json({ uuid: created.uuid, secret: created.secret, importedMappings: 0 })
  } catch (e) {
    if (e instanceof InvalidUserPasswordError) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
