import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { cropToPoster, imgSrc, isAllowedImageUrl } from "@/lib/poster-render-helpers"
import { STD_H, STD_W } from "@/lib/image-utils"

describe("image URL allowlist", () => {
  it("allows the two known CDNs", () => {
    expect(isAllowedImageUrl("https://image.tmdb.org/t/p/w500/a.jpg")).toBe(true)
    expect(isAllowedImageUrl("https://assets.fanart.tv/fanart/movies/1/movieposter/x.png")).toBe(true)
  })

  it("blocks everything else, including lookalike hosts", () => {
    for (const url of [
      "https://attacker.example/x.png",
      "http://assets.fanart.tv/x.png",
      "https://assets.fanart.tv.attacker.example/x.png",
      "https://image.tmdb.org.attacker.example/t/p/x.jpg",
      "https://evil.com/?u=https://assets.fanart.tv/x.png",
    ]) {
      expect(isAllowedImageUrl(url), url).toBe(false)
      expect(() => imgSrc(url), url).toThrow(/Blocked external image URL/)
    }
  })

  it("still treats a bare path as TMDB", () => {
    expect(imgSrc("/abc.jpg")).toContain("/w500/abc.jpg")
  })
})

describe("cropToPoster", () => {
  it("turns a 16:9 backdrop into a 2:3 poster", async () => {
    const backdrop = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#3a5f8a" } })
      .jpeg().toBuffer()
    const meta = await sharp(await cropToPoster(backdrop)).metadata()
    expect(meta.width).toBe(STD_W)
    expect(meta.height).toBe(STD_H)
  }, 20000)

  it("leaves an already-2:3 image at the same size", async () => {
    const poster = await sharp({ create: { width: 1000, height: 1500, channels: 3, background: "#3a5f8a" } })
      .jpeg().toBuffer()
    const meta = await sharp(await cropToPoster(poster)).metadata()
    expect(meta.width).toBe(STD_W)
    expect(meta.height).toBe(STD_H)
  }, 20000)
})
