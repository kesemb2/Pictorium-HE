import { NextRequest } from "next/server"
import { pictoriumCatalog } from "@/lib/catalog-handler"
import { invalidUserResponse, isMultiUserEnabled, resolvePathUser } from "@/lib/user-auth"

export const maxDuration = 60

type RouteParams = { user: string; type: string; id: string; extra: string[] }

export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { user, type: mediaType, id: rawId, extra } = await params
  const queryUser = req.nextUrl.searchParams.get("u") || req.nextUrl.searchParams.get("user")
  // Path vince, query divergente → 400 (anti confused-deputy, mai namespace B).
  const { user: canonicalUser, mismatch } = resolvePathUser(user, queryUser)
  if (mismatch) {
    return Response.json({ error: "User mismatch between path and query" }, { status: 400 })
  }
  // Path non-UUID: con flag ON è un errore (mai fallback silenzioso al
  // globale); con flag OFF resta il passthrough storico byte-identico.
  if (!canonicalUser && isMultiUserEnabled()) return invalidUserResponse()
  const configParam = req.nextUrl.searchParams.get("config") || req.nextUrl.searchParams.get("c")
  return pictoriumCatalog(req, mediaType, rawId, canonicalUser, configParam, extra)
}
