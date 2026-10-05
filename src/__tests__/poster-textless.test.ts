import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cacheClear } from "@/lib/cache"
import { FANART_ASSET_PREFIX, type FanartImage } from "@/lib/fanart-artwork"
import { fanartTileIso } from "@/lib/useFanartPosters"
import { backgrounds, withText, TITLE_CASES } from "./fixtures/synthetic-posters"

const images = new Map<string, Buffer>()
const fetched: string[] = []

vi.mock("@/lib/poster-render-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/poster-render-helpers")>()
  return {
    ...actual,
    fetchImg: vi.fn(async (url: string) => {
      fetched.push(url)
      const buf = images.get(url)
      if (!buf) throw new Error("fetch failed: 404")
      return buf
    }),
  }
})

const { checkFanartPosterText, fanartPreviewUrl, verifiedTextlessPosters, fanartPostersAsTmdb, rejectTextedFanart, rejectTextedUrls, isVerifiableUrl, tvdbCleanPosters, verifyCleanPool } = await import("@/lib/poster-textless")
const { ARTWORKS_BASE } = await import("@/lib/tvdb")
const tvdb = (name: string) => `${ARTWORKS_BASE}/banners/v4/movie/1/posters/${name}.jpg`

const asset = (name: string) => `${FANART_ASSET_PREFIX}fanart/movies/1/movieposter/${name}.jpg`
const preview = (name: string) => `${FANART_ASSET_PREFIX}preview/movies/1/movieposter/${name}.jpg`
const img = (name: string, lang: string, likes = 0): FanartImage => ({ id: name, url: asset(name), lang, likes })

let clean: Buffer
let titled: Buffer

beforeAll(async () => {
  const bgs = await backgrounds()
  clean = bgs.blobs!
  titled = await withText(bgs.blobs!, TITLE_CASES["title-bottom"]!)
}, 60000)

beforeEach(() => {
  cacheClear()
  images.clear()
  fetched.length = 0
})

describe("fanart textless verification", () => {
  it("maps a full asset to its small preview", () => {
    expect(fanartPreviewUrl(asset("a"))).toBe(preview("a"))
    expect(fanartPreviewUrl("https://image.tmdb.org/t/p/w500/x.jpg")).toBe("https://image.tmdb.org/t/p/w500/x.jpg")
  })

  it("accepts a textless preview and rejects a titled one", async () => {
    images.set(preview("clean"), clean)
    images.set(preview("titled"), titled)
    expect((await checkFanartPosterText(asset("clean"))).textless).toBe(true)
    const r = await checkFanartPosterText(asset("titled"))
    expect(r.textless).toBe(false)
    expect(r.score).toBeGreaterThan(0)
  })

  it("falls back to the full image when the preview is missing", async () => {
    images.set(asset("clean"), clean)
    expect((await checkFanartPosterText(asset("clean"))).textless).toBe(true)
    expect(fetched).toEqual([preview("clean"), asset("clean")])
  })

  it("fails closed when the image can't be fetched, without caching the failure", async () => {
    expect(await checkFanartPosterText(asset("gone"))).toEqual({ url: asset("gone"), textless: false, score: null })
    images.set(preview("gone"), clean)
    expect((await checkFanartPosterText(asset("gone"))).textless).toBe(true)
  })

  it("caches the verdict per URL", async () => {
    images.set(preview("clean"), clean)
    await checkFanartPosterText(asset("clean"))
    await checkFanartPosterText(asset("clean"))
    expect(fetched).toHaveLength(1)
  })

  it("never checks or accepts non-fanart URLs", async () => {
    expect((await checkFanartPosterText("https://evil.example/x.jpg")).textless).toBe(false)
    expect(fetched).toHaveLength(0)
  })

  it("keeps \"00\" and unlabelled posters that pass the visual check, \"00\" first", async () => {
    images.set(preview("a"), titled)
    images.set(preview("b"), clean)
    images.set(preview("c"), clean)
    images.set(preview("d"), clean)
    const checks: unknown[] = []
    const out = await verifiedTextlessPosters([img("c", "", 9), img("a", "00", 8), img("b", "00", 5), img("d", "en", 3)], { limit: 6, checks: checks as never })
    expect(out.map((i) => i.id)).toEqual(["b", "c"])
    // Una lingua vera ("en") non viene nemmeno analizzata.
    expect(checks).toHaveLength(3)
  })

  it("marks only verified posters clean for the editor", async () => {
    images.set(preview("a"), titled)
    images.set(preview("b"), clean)
    const shaped = await fanartPostersAsTmdb([img("a", "00"), img("b", "00"), img("c", ""), img("d", "he")], { limit: 6 })
    expect(shaped.map((s) => s.iso_639_1)).toEqual(["und", null, "und", "he"])
    images.set(preview("c"), clean)
    cacheClear()
    const withUnlabelled = await fanartPostersAsTmdb([img("a", "00"), img("b", "00"), img("c", ""), img("d", "he")], { limit: 6 })
    expect(withUnlabelled.map((s) => s.iso_639_1)).toEqual(["und", null, null, "he"])
  })

  it("flags texted fanart paths in saved lists, leaving TMDB paths alone", async () => {
    images.set(preview("a"), titled)
    images.set(preview("b"), clean)
    const rejected = await rejectTextedFanart(["/tmdb.jpg", asset("a"), asset("b")])
    expect([...rejected]).toEqual([asset("a")])
  })
})

describe("clean pool from every source", () => {
  it("knows which URLs it can verify", () => {
    expect(isVerifiableUrl(asset("x"))).toBe(true)
    expect(isVerifiableUrl(tvdb("x"))).toBe(true)
    expect(isVerifiableUrl("/tmdb.jpg")).toBe(false)
    expect(isVerifiableUrl("https://evil.example/x.jpg")).toBe(false)
    expect(isVerifiableUrl(null)).toBe(false)
  })

  it("keeps TVDB posters marked textless that pass the check, best score first", async () => {
    images.set(tvdb("hi"), clean)
    images.set(tvdb("lo"), clean)
    images.set(tvdb("titled"), titled)
    images.set(tvdb("texted"), clean)
    images.set(tvdb("wide"), clean)
    const out = await tvdbCleanPosters([
      { image: tvdb("lo"), includesText: false, score: 1, width: 680, height: 1000 },
      { image: tvdb("titled"), includesText: false, score: 9 },
      { image: tvdb("texted"), includesText: true, score: 8 },
      { image: tvdb("wide"), includesText: false, score: 7, width: 1920, height: 1080 },
      { image: tvdb("hi"), includesText: false, score: 5 },
    ], { limit: 30 })
    expect(out.map((p) => p.file_path)).toEqual([tvdb("hi"), tvdb("lo")])
    expect(out.every((p) => p.iso_639_1 === null && p.source === "tvdb")).toBe(true)
    // Il marcato con testo e quello orizzontale non vengono analizzati.
    expect(fetched).not.toContain(tvdb("texted"))
    expect(fetched).not.toContain(tvdb("wide"))
  })

  it("flags texted TVDB paths in saved lists too", async () => {
    images.set(tvdb("titled"), titled)
    images.set(tvdb("clean"), clean)
    const rejected = await rejectTextedUrls(["/tmdb.jpg", tvdb("titled"), tvdb("clean")])
    expect([...rejected]).toEqual([tvdb("titled")])
  })

  it("verifies a long pool in order with at most 8 checks in flight", async () => {
    const { fetchImg } = await import("@/lib/poster-render-helpers")
    let inFlight = 0
    let peak = 0
    vi.mocked(fetchImg).mockImplementation(async (url: string) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return url.includes("titled") ? titled : clean
    })
    const sources = Array.from({ length: 20 }, (_, i) => tvdb(i === 4 ? "titled" : `p${i}`))
    const ok = await verifyCleanPool(sources, { limit: 30 })
    expect(peak).toBeLessThanOrEqual(8)
    expect(peak).toBeGreaterThan(1)
    expect(ok).toEqual(sources.filter((_, i) => i !== 4))
  }, 30000)
})

describe("Fanart.tv tab tile language", () => {
  it("is clean only when the server verified it textless", () => {
    expect(fanartTileIso({ lang: "00", textless: true })).toBeNull()
    expect(fanartTileIso({ lang: "00", textless: false })).toBe("und")
    expect(fanartTileIso({ lang: null })).toBe("und")
    expect(fanartTileIso({ lang: "en", textless: false })).toBe("en")
  })
})
