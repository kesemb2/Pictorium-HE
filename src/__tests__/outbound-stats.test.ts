import { afterEach, describe, expect, it, vi } from "vitest"
import { __resetOutboundStatsForTest, outboundStats, timedFetch } from "@/lib/outbound-stats"

afterEach(() => {
  __resetOutboundStatsForTest()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("timedFetch", () => {
  it("counts requests per hostname with latency", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
    await timedFetch("https://api.example.com/x")
    await timedFetch("https://api.example.com/y")
    const s = outboundStats()
    expect(s["api.example.com"]?.requests).toBe(2)
    expect(s["api.example.com"]?.errors).toBe(0)
    expect(s["api.example.com"]?.lastMs).toBeGreaterThanOrEqual(0)
    expect(s["api.example.com"]?.avgMs).toBeGreaterThanOrEqual(0)
  })

  it("counts rejections as errors and rethrows", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"))
    await expect(timedFetch("https://down.example.com/")).rejects.toThrow("down")
    const s = outboundStats()
    expect(s["down.example.com"]).toMatchObject({ requests: 1, errors: 1 })
  })

  it("falls back to unknown on invalid URL without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
    await timedFetch("not a url [[[")
    expect(outboundStats()["unknown"]?.requests).toBe(1)
  })

  it("returns the original response untouched (1:1 delegation)", async () => {
    const body = '{"a":1}'
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status: 201 }))
    const res = await timedFetch("https://api.example.com/z")
    expect(res.status).toBe(201)
    expect(await res.text()).toBe(body)
  })

  it("bounds the host map", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
    for (let i = 0; i < 80; i++) await timedFetch(`https://h${i}.example.com/`)
    expect(Object.keys(outboundStats()).length).toBeLessThanOrEqual(64)
  })
})
