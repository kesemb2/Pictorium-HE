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
    expect(first).toEqual({ awards: [], nominations: [], studios: [], director: null, directorHe: null })
    const second = await fetchAllWikidata(424242, "movie")
    expect(second).toEqual({ awards: [], nominations: [], studios: [], director: null, directorHe: null })
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
    await fetchAllWikidata(424243, "movie")
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
