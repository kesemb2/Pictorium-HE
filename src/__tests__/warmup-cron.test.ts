import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { __resetPosterUrlLogForTest, recordPosterUrl } from "@/lib/poster-url-log"

/**
 * Il cron di Vercel invoca in GET con `Authorization: Bearer $CRON_SECRET`.
 * Finché la route esponeva solo POST prendeva 405 ogni notte, quindi il
 * riscaldamento non è mai avvenuto.
 */
describe("GET /api/warmup — the platform cron", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")

  beforeEach(() => {
    __resetPosterUrlLogForTest()
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))
    process.env.ADMIN_TOKEN = "admin-secret"
    process.env.CRON_SECRET = "cron-secret"
    delete process.env.PICTORIUM_WARMUP_TOKEN
    // setup.ts marca l'istanza come pubblica: è il caso più severo, dove senza
    // PICTORIUM_WARMUP_TOKEN la route rifiuta tutto. Il segreto del cron deve
    // bastare comunque.
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.ADMIN_TOKEN
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))
  })

  const request = (headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:3000/api/warmup?trending=0&justwatch=0&mappings=0", {
      method: "GET",
      headers,
    })

  it("accepts the cron secret", async () => {
    const { GET } = await import("@/app/api/warmup/route")
    const res = await GET(request({ authorization: "Bearer cron-secret" }))
    expect(res.status).toBe(200)
  })

  it("rejects a request with no credential at all", async () => {
    const { GET } = await import("@/app/api/warmup/route")
    expect((await GET(request())).status).toBe(401)
  })

  it("rejects a wrong cron secret", async () => {
    const { GET } = await import("@/app/api/warmup/route")
    expect((await GET(request({ authorization: "Bearer nope-nope-nope" }))).status).toBe(401)
  })

  it("replays the URLs that were actually served, verbatim", async () => {
    // Due URL che differiscono per un solo parametro: sono chiavi CDN diverse
    // e vanno scaldate entrambe, così come sono.
    recordPosterUrl(new URL("http://x/api/poster/movie/11?lang=he&halo=1"))
    recordPosterUrl(new URL("http://x/api/poster/series/22?lang=he&halo=0"))

    const { GET } = await import("@/app/api/warmup/route")
    const res = await GET(request({ authorization: "Bearer cron-secret" }))
    expect(res.status).toBe(200)

    const warmed = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(warmed.some((u) => u.endsWith("/api/poster/movie/11?lang=he&halo=1"))).toBe(true)
    expect(warmed.some((u) => u.endsWith("/api/poster/series/22?lang=he&halo=0"))).toBe(true)
  })

  it("does not replay anything when the log is empty", async () => {
    const { GET } = await import("@/app/api/warmup/route")
    await GET(request({ authorization: "Bearer cron-secret" }))
    const warmed = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(warmed.filter((u) => u.includes("/api/poster/"))).toEqual([])
  })

  it("applies its own defaults when a param is absent", async () => {
    recordPosterUrl(new URL("http://x/api/poster/movie/77?lang=he"))
    // Number(null) è 0, non NaN: prima ogni default collassava sul minimo e il
    // warmup girava a vuoto anche quando veniva invocato.
    const { GET } = await import("@/app/api/warmup/route")
    const res = await GET(new NextRequest("http://localhost:3000/api/warmup", {
      method: "GET", headers: { authorization: "Bearer cron-secret" },
    }))
    const body = await res.json() as { total: number }
    // Senza rete i target trending restano 0, ma le URL registrate entrano
    // comunque: il replay ha il suo default di 300, non 0.
    expect(body.total).toBeGreaterThan(0)
  })
})
