import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { computeLogoLayout, LANDSCAPE_LOGO_BOTTOM_MARGIN_PCT } from "@/lib/logo-layout"
import { LAND_H, LAND_W } from "@/lib/image-utils"
import { posterZoneStats } from "@/lib/logo-contrast"
import { extractSceneTint, fitBandToPoster } from "@/lib/poster-render-helpers"
import { renderQualityIconBadge } from "@/lib/poster-service"
import { renderSeparateRatingStack } from "@/lib/separate-rating-renderer"

/** Base 16:9 con il terzo centrale blu e i lati rossi. */
async function sidedLandscape(): Promise<Buffer> {
  const w = LAND_W, h = LAND_H
  const raw = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3
    const centre = x > w / 3 && x < (2 * w) / 3
    raw[i] = centre ? 20 : 200; raw[i + 1] = 30; raw[i + 2] = centre ? 200 : 30
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()
}

async function alphaStats(png: Buffer): Promise<{ max: number; count: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let max = 0, count = 0
  for (let i = 3; i < info.width * info.height * 4; i += 4) {
    if (data[i] > max) max = data[i]
    if (data[i] > 8) count++
  }
  return { max, count }
}

describe("landscape: band measurements see the whole 16:9 frame", () => {
  it("samples the tint from the full width, not the centre crop", async () => {
    const hex = await extractSceneTint(await sidedLandscape(), 0.3)
    expect(hex).not.toBeNull()
    const r = parseInt(hex!.slice(1, 3), 16)
    const b = parseInt(hex!.slice(5, 7), 16)
    // Due terzi rossi, un terzo blu: col vecchio ritaglio 2:3 vinceva il blu.
    expect(r).toBeGreaterThan(b)
  })

  it("fits the band with landscape row geometry", async () => {
    const fit = await fitBandToPoster(await sidedLandscape(), { blurHeight: 40, blurFade: 70, blurIntensity: 20, blurDarkness: 30 }, LAND_H)
    expect(fit.blurHeight).toBeGreaterThan(0)
    expect(fit.blurHeight).toBeLessThanOrEqual(40)
  })

  it("measures a zone on the landscape canvas", async () => {
    const stats = await posterZoneStats(await sidedLandscape(), { left: 0, top: 0, width: 100, height: 100 }, null, { w: LAND_W, h: LAND_H })
    expect(stats).not.toBeNull()
  })
})

describe("landscape: Hebrew title band", () => {
  it("lifts the landscape logo by the title band", () => {
    const input = {
      posterW: LAND_W, posterH: LAND_H, logoW: 800, logoH: 200,
      logoScale: 60, logoOffsetX: 0, logoOffsetY: 0, hasBadges: true,
      bottomMarginPct: LANDSCAPE_LOGO_BOTTOM_MARGIN_PCT,
    }
    const base = computeLogoLayout(input)
    const lifted = computeLogoLayout({ ...input, titleBandH: 40 })
    expect(lifted.top).toBe(Math.max(0, base.top - 40))
    expect(lifted.top + lifted.height + 40).toBeLessThanOrEqual(LAND_H)
  })
})

describe("A/V icons and ratings column follow the text controls", () => {
  const ICON = "quality-badges/mono/4k-label-icon.svg"

  it("lowers the icon opacity with to=50", async () => {
    const full = await renderQualityIconBadge(ICON, 500, false)
    const half = await renderQualityIconBadge(ICON, 500, false, { opacity: 50 })
    expect(full && half).toBeTruthy()
    expect((await alphaStats(half!.png)).max).toBeLessThan((await alphaStats(full!.png)).max * 0.75)
  })

  it("is byte-identical at default style", async () => {
    const a = await renderQualityIconBadge(ICON, 500, false)
    const b = await renderQualityIconBadge(ICON, 500, false, {})
    expect(a!.png.equals(b!.png)).toBe(true)
  })

  it("adds a halo to the icons on a busy corner", async () => {
    const plain = await renderQualityIconBadge(ICON, 500, false)
    const halo = await renderQualityIconBadge(ICON, 500, false, { halo: 1 })
    expect((await alphaStats(halo!.png)).count).toBeGreaterThan((await alphaStats(plain!.png)).count)
  })

  it("scales the ratings pills' shadow with the shadow controls", async () => {
    const items = [{ id: "imdb", value: 8.5 }]
    const base = await renderSeparateRatingStack(items, 500, false)
    const none = await renderSeparateRatingStack(items, 500, false, { shadowOpacity: 0 })
    expect(base && none).toBeTruthy()
    expect(none!.png.equals(base!.png)).toBe(false)
    const same = await renderSeparateRatingStack(items, 500, false, {})
    expect(same!.png.equals(base!.png)).toBe(true)
  })
})
