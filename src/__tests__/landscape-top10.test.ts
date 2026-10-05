import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cacheClear } from "@/lib/cache"

vi.mock("@/lib/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tmdb")>()
  return { ...actual, getTrending: vi.fn(), getReleaseDates: vi.fn() }
})

const { getTrending, getReleaseDates } = await import("@/lib/tmdb")
const { getTopToday, topTodayRank, isEastAsianAnimation, passesPopularityGate, hasAired } = await import("@/lib/top-today")
const { composeRankStrip, neonNumberSvg, rankStripWidth } = await import("@/lib/rank-strip")
const { tagMetrics } = await import("@/lib/tag-style")
const { normalizeTagSize } = await import("@/lib/badge-styles")
const { resolvePosterRenderConfig } = await import("@/lib/poster-config")
const { normalizePosterCacheParams } = await import("@/lib/poster-runtime-cache")
const { buildStremioPosterSearchParams } = await import("@/lib/stremio-poster-params")
const { buildDefaultsPreviewUrl } = await import("@/lib/poster-url")

const NOW = new Date("2026-10-05T12:00:00Z")

type Item = { id: number; original_language?: string; genre_ids?: number[]; origin_country?: string[]; vote_count?: number; first_air_date?: string }

function trending(pages: Item[][]) {
  vi.mocked(getTrending).mockImplementation(async (_type, _window, _key, page = 1) => ({
    page, results: (pages[page - 1] ?? []) as never, total_pages: pages.length, total_results: 0,
  }))
}

/** Date di uscita USA per id: [tipo, data]. */
function releases(byId: Record<number, Array<[number, string]>>) {
  vi.mocked(getReleaseDates).mockImplementation(async (_type, id) => ({
    id,
    results: byId[id] ? [{ iso_3166_1: "US", release_dates: byId[id]!.map(([type, d]) => ({ type, release_date: `${d}T00:00:00.000Z` })) }] : [],
  }))
}

beforeEach(() => {
  cacheClear()
  vi.mocked(getTrending).mockReset()
  vi.mocked(getReleaseDates).mockReset()
})

describe("today's top 10 (TMDB trending/day, TopToday rules)", () => {
  it("keeps only movies already out digitally or on disc in the US, in trending order", async () => {
    trending([[{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]])
    releases({
      1: [[3, "2026-09-01"]], // solo cinema
      2: [[4, "2026-09-20"]], // digitale uscito
      3: [[4, "2026-10-09"]], // digitale futuro
      4: [[5, "2026-08-01"]], // disco uscito
      // 5: nessuna data USA
    })
    expect(await getTopToday("movie", "k", NOW)).toEqual([2, 4])
  })

  it("keeps only shows that already aired, without anime, with the vote gate", async () => {
    trending([[
      { id: 10, first_air_date: "2026-10-01", original_language: "en" },
      { id: 11, first_air_date: "2026-10-12", original_language: "en" },
      { id: 12, first_air_date: "2026-01-01", original_language: "ja", genre_ids: [16], vote_count: 900 },
      { id: 13, first_air_date: "2026-01-01", original_language: "ko", vote_count: 20 },
      { id: 14, first_air_date: "2026-01-01", original_language: "ko", vote_count: 400 },
    ]])
    expect(await getTopToday("tv", "k", NOW)).toEqual([10, 14])
  })

  it("pages through trending until ten titles pass, and ranks 1..10", async () => {
    const page = (start: number) => Array.from({ length: 20 }, (_, i) => ({ id: start + i, first_air_date: i % 3 === 0 ? "2030-01-01" : "2020-01-01" }))
    trending([page(100), page(200)])
    const ids = await getTopToday("tv", "k", NOW)
    expect(ids).toHaveLength(10)
    expect(ids[0]).toBe(101)
    expect(await topTodayRank("tv", ids[9]!, "k")).toBe(10)
    expect(await topTodayRank("tv", 999, "k")).toBeNull()
  })

  it("does not cache an empty list (upstream failure)", async () => {
    vi.mocked(getTrending).mockRejectedValueOnce(new Error("down"))
    expect(await getTopToday("movie", "k", NOW)).toEqual([])
    trending([[{ id: 7 }]])
    releases({ 7: [[4, "2026-01-01"]] })
    expect(await getTopToday("movie", "k", NOW)).toEqual([7])
  })

  it("filter helpers", () => {
    expect(isEastAsianAnimation({ id: 1, genre_ids: [16], origin_country: ["JP"] })).toBe(true)
    expect(isEastAsianAnimation({ id: 1, genre_ids: [16], original_language: "en" })).toBe(false)
    expect(isEastAsianAnimation({ id: 1, original_language: "ja" })).toBe(false)
    expect(passesPopularityGate({ id: 1, original_language: "fr", vote_count: 49 })).toBe(false)
    expect(passesPopularityGate({ id: 1, original_language: "en", vote_count: 0 })).toBe(true)
    expect(hasAired({ id: 1, first_air_date: "2026-10-05" }, "2026-10-05")).toBe(true)
    expect(hasAired({ id: 1 }, "2026-10-05")).toBe(false)
  })
})

describe("rank strip", () => {
  it("widens the strip only as much as two digits need", () => {
    expect(rankStripWidth(768, 432, 1)).toBe(Math.round(768 * 0.148))
    expect(rankStripWidth(768, 432, 7)).toBe(Math.round(768 * 0.148))
    expect(rankStripWidth(768, 432, 10)).toBeGreaterThan(rankStripWidth(768, 432, 1))
    expect(rankStripWidth(768, 432, 10)).toBeLessThan(768 * 0.25)
  })

  it("draws the digits as one path per glyph, two for 10 with a narrow 1", () => {
    const one = neonNumberSvg(1, 160)
    const ten = neonNumberSvg(10, 160)
    expect(ten.inkW).toBeLessThan(one.inkW * 2)
    expect(ten.inkW).toBeGreaterThan(one.inkW)
    expect(one.svg).toContain("feGaussianBlur")
  })

  it("composes a full canvas: navy strip on the left, the panel on the right", async () => {
    const W = 768, H = 432, S = rankStripWidth(W, H, 3)
    const panel = await sharp({ create: { width: W - S, height: H, channels: 3, background: "#d0d0d0" } }).png().toBuffer()
    const out = await composeRankStrip({ panel, rank: 3, canvasW: W, canvasH: H, stripW: S })
    const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([W, H])
    const px = (x: number, y: number) => Array.from(data.subarray((y * W + x) * 3, (y * W + x) * 3 + 3))
    const [r, g, b] = px(4, 4)
    expect(b).toBeGreaterThan(r! + 15) // blu notte
    expect(px(W - 10, H / 2)).toEqual([208, 208, 208]) // pannello intatto
    // Angolo arrotondato: il vertice del pannello mostra la striscia.
    expect(px(S + 1, 1)[0]).toBeLessThan(60)
  })
})

describe("landscape tag size and settings chain", () => {
  it("sizes the landscape tag from the reference and scales it", () => {
    const land = tagMetrics(768, 432)
    expect(land.h).toBe(Math.round(432 * 0.134))
    expect(tagMetrics(768, 432, 1.5).h).toBeGreaterThan(land.h)
    expect(tagMetrics(500, 750).h).toBe(66)
    expect(normalizeTagSize("abc")).toBe(100)
    expect(normalizeTagSize("400")).toBe(160)
    expect(normalizeTagSize(72.4)).toBe(72)
  })

  function resolve(q: string, sd: Record<string, unknown> = {}, configOverride: Record<string, unknown> | null = null) {
    return resolvePosterRenderConfig({
      searchParams: new URLSearchParams(q),
      mapping: null,
      configOverride: configOverride as never,
      sd: sd as never,
      hasQuery: true, showBadges: true, rankingBadges: true, animeRank: null, rankingResult: null, finalRank: null,
    })
  }

  it("resolves lstyle / ltop / tsize: query > config > defaults > default", () => {
    expect(resolve("")).toMatchObject({ landscapeStyle: "classic", landscapeTop10: true, tagSize: 100 })
    expect(resolve("", { landscapeStyle: "tag", landscapeTop10: false, tagSize: 80 })).toMatchObject({ landscapeStyle: "tag", landscapeTop10: false, tagSize: 80 })
    expect(resolve("", { landscapeStyle: "tag" }, { landscapeStyle: "classic" }).landscapeStyle).toBe("classic")
    expect(resolve("lstyle=tag&ltop=0&tsize=130", { landscapeTop10: true })).toMatchObject({ landscapeStyle: "tag", landscapeTop10: false, tagSize: 130 })
    expect(resolve("lstyle=bogus&tsize=9").landscapeStyle).toBe("classic")
    expect(resolve("tsize=9").tagSize).toBe(50)
    // Lo stile verticale non decide l'orizzontale.
    expect(resolve("pstyle=tag").landscapeStyle).toBe("classic")
  })

  it("cache keys and URLs: defaults stay out of Stremio URLs, previews are explicit", () => {
    expect(normalizePosterCacheParams(new URLSearchParams("lstyle=x&ltop=7&tsize=999")).toString()).toBe("lstyle=classic&ltop=1&tsize=160")
    expect(buildStremioPosterSearchParams({}).get("lstyle")).toBeNull()
    expect(buildStremioPosterSearchParams({}).get("ltop")).toBeNull()
    const tagLand = buildStremioPosterSearchParams({ landscapeStyle: "tag", tagSize: 120, tagCard: false, landscapeTop10: false })
    expect(tagLand.get("lstyle")).toBe("tag")
    expect(tagLand.get("pstyle")).toBeNull()
    expect(tagLand.get("tsize")).toBe("120")
    expect(tagLand.get("tcard")).toBe("0")
    expect(tagLand.get("ltop")).toBe("0")
    expect(buildStremioPosterSearchParams({ landscapeStyle: "tag", tagSize: 100 }).get("tsize")).toBeNull()
    const preview = buildDefaultsPreviewUrl({ defaultLandscapeStyle: "tag", defaultLandscapeTop10: false, defaultTagSize: 90 })
    expect(preview).toContain("lstyle=tag")
    expect(preview).toContain("ltop=0")
    expect(preview).toContain("tsize=90")
  })
})
