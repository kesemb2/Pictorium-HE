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

const { checkFanartPosterText, fanartPreviewUrl, verifiedTextlessPosters, fanartPostersAsTmdb, rejectTextedFanart } = await import("@/lib/fanart-textless")

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

  it("keeps only \"00\" posters that pass the visual check, in fanart order", async () => {
    images.set(preview("a"), titled)
    images.set(preview("b"), clean)
    images.set(preview("c"), clean)
    images.set(preview("d"), clean)
    const checks: unknown[] = []
    const out = await verifiedTextlessPosters([img("a", "00", 9), img("b", "00", 5), img("c", "", 4), img("d", "en", 3)], { limit: 3, checks: checks as never })
    expect(out.map((i) => i.id)).toEqual(["b"])
    // "" ed "en" non vengono nemmeno analizzati.
    expect(checks).toHaveLength(2)
  })

  it("marks only verified posters clean for the editor", async () => {
    images.set(preview("a"), titled)
    images.set(preview("b"), clean)
    const shaped = await fanartPostersAsTmdb([img("a", "00"), img("b", "00"), img("c", ""), img("d", "he")], { limit: 6 })
    expect(shaped.map((s) => s.iso_639_1)).toEqual(["und", null, "und", "he"])
  })

  it("flags texted fanart paths in saved lists, leaving TMDB paths alone", async () => {
    images.set(preview("a"), titled)
    images.set(preview("b"), clean)
    const rejected = await rejectTextedFanart(["/tmdb.jpg", asset("a"), asset("b")])
    expect([...rejected]).toEqual([asset("a")])
  })
})

describe("Fanart.tv tab tile language", () => {
  it("is clean only when the server verified it textless", () => {
    expect(fanartTileIso({ lang: "00", textless: true })).toBeNull()
    expect(fanartTileIso({ lang: "00", textless: false })).toBe("und")
    expect(fanartTileIso({ lang: null })).toBe("und")
    expect(fanartTileIso({ lang: "en", textless: false })).toBe("en")
  })
})
