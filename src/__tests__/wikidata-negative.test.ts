import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { __resetCircuitBreaker, __resetWikidataNegativeForTest, fetchAllWikidata } from "@/lib/awards"
import { cacheClear } from "@/lib/cache"

beforeEach(() => {
  cacheClear()
  __resetCircuitBreaker()
  __resetWikidataNegativeForTest()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Wikidata transient-failure negative cache (60s)", () => {
  it("second call within 60s after SPARQL failure makes no second POST", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("sparql down"))
    const first = await fetchAllWikidata(424242, "movie")
    expect(first).toEqual({ awards: [], nominations: [], studios: [], director: null, directorHe: null, degraded: true })
    const second = await fetchAllWikidata(424242, "movie")
    expect(second).toEqual({ awards: [], nominations: [], studios: [], director: null, directorHe: null, degraded: true })
    // 1 POST (con retry interno una sola sequenza): la negativa assorbe la 2ª.
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("sparql")).length).toBeLessThanOrEqual(2)
  })

  it("success still caches 24h and is unaffected", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: { bindings: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    const first = await fetchAllWikidata(424243, "movie")
    expect(first.awards).toEqual([])
    expect(first.degraded).toBe(false)
    await fetchAllWikidata(424243, "movie")
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("REST fast-path hit is not degraded", async () => {
    // claims con P166 + labels batch: successo accertato anche con zero premi.
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url)
      if (u.includes("wbgetentities") && u.includes("claims")) {
        return Promise.resolve(new Response(JSON.stringify({
          entities: { Q999: { claims: { P166: [{ mainsnak: { datavalue: { value: { id: "Q101" } } } }] } } },
        }), { status: 200, headers: { "content-type": "application/json" } }))
      }
      if (u.includes("wbgetentities")) {
        return Promise.resolve(new Response(JSON.stringify({
          entities: { Q101: { labels: { en: { value: "Some Unknown Prize" } } } },
        }), { status: 200, headers: { "content-type": "application/json" } }))
      }
      return Promise.reject(new Error("unexpected fetch " + u))
    })
    const res = await fetchAllWikidata(424244, "movie", undefined, { wikidataId: "Q999" })
    expect(res.awards).toEqual([])
    expect(res.degraded).toBe(false)
    expect(spy).toHaveBeenCalled()
  })
})
