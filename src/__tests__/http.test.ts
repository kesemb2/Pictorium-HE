import { afterEach, describe, expect, it, vi } from "vitest"
import { http, ApiError } from "@/lib/http"
import { clearAdminToken, setAdminToken } from "@/lib/admin-token"

describe("http", () => {
  afterEach(() => {
    clearAdminToken()
    vi.unstubAllGlobals()
  })

  it("returns null when the response has no content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })))

    const result = await http<null>("/api/empty", { retries: 0 })

    expect(result).toBeNull()
  })

  it("throws ApiError for non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })))

    await expect(http("/api/protected", { retries: 0 })).rejects.toBeInstanceOf(ApiError)
  })

  it("attaches the session admin token to /api/ calls", async () => {
    setAdminToken("adm")
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await http("/api/warmup", { method: "POST", retries: 0 })

    const [call] = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const [, init] = call
    expect((init.headers as Record<string, string>)["x-admin-token"]).toBe("adm")
  })
})
