import { NextRequest } from "next/server"
import { buildManifestResponse } from "@/lib/build-manifest"
import { invalidUserResponse, isMultiUserEnabled, resolvePathUser } from "@/lib/user-auth"

type RouteParams = { user: string }

export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { user } = await params
  const queryUser = req.nextUrl.searchParams.get("u") || req.nextUrl.searchParams.get("user")
  // Path vince, query divergente → 400 (stessa regola di catalog/meta).
  const { user: canonicalUser, mismatch } = resolvePathUser(user, queryUser)
  if (mismatch) {
    return Response.json({ error: "User mismatch between path and query" }, { status: 400 })
  }
  // Path non-UUID: con flag ON è un errore (mai fallback silenzioso al
  // globale); con flag OFF resta il passthrough storico byte-identico.
  if (!canonicalUser && isMultiUserEnabled()) return invalidUserResponse()
  const config = req.nextUrl.searchParams.get("config") || req.nextUrl.searchParams.get("c")
  return await buildManifestResponse(req, canonicalUser, config)
}
