import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { applyBlur } from "@/lib/blur"
import {
  DARK_GLYPH_COLOR,
  ZONE_BRIGHT_LUMINANCE,
  ZONE_BUSY_STDDEV,
  ZONE_FLAT_STDDEV,
  buildLogoHalo,
  posterZoneStats,
  zoneTextTreatment,
} from "@/lib/logo-contrast"
import { SHADOW_DARK, SHADOW_LIGHT, textShadowBox, textShadowDefs } from "@/lib/badge-svg-shared"
import { STD_H, STD_W } from "@/lib/image-utils"

const BOTH = { darkText: true, halo: true }
const ZONE = { left: 0, top: 580, width: STD_W, height: STD_H - 580 }

async function poster(paint: (raw: Buffer, x: number, y: number) => void): Promise<Buffer> {
  const raw = Buffer.alloc(STD_W * STD_H * 4)
  for (let y = 0; y < STD_H; y++) {
    for (let x = 0; x < STD_W; x++) {
      const i = (y * STD_W + x) * 4
      raw[i + 3] = 255
      paint(raw, x, y)
    }
  }
  return sharp(raw, { raw: { width: STD_W, height: STD_H, channels: 4 } }).png().toBuffer()
}

function gray(raw: Buffer, x: number, y: number, v: number): void {
  const i = (y * STD_W + x) * 4
  raw[i] = v; raw[i + 1] = v; raw[i + 2] = v
}

const white = () => poster((raw, x, y) => gray(raw, x, y, 246))
const checker = () => poster((raw, x, y) => gray(raw, x, y, (Math.floor(x / 14) + Math.floor(y / 9)) % 2 ? 235 : 28))

describe("posterZoneStats", () => {
  it("reads a flat white field as bright and flat", async () => {
    const stats = (await posterZoneStats(await white(), ZONE))!
    expect(stats.luminance).toBeGreaterThan(ZONE_BRIGHT_LUMINANCE)
    expect(stats.stdDev).toBeLessThan(ZONE_FLAT_STDDEV)
  })

  it("reads a contrasty field as busy", async () => {
    const stats = (await posterZoneStats(await checker(), ZONE))!
    expect(stats.stdDev).toBeGreaterThan(ZONE_BUSY_STDDEV)
  })

  it("reads a zone the band covers as neither bright nor busy", async () => {
    // È il test che tiene onesti i due trattamenti: dove la fascia copre
    // davvero, non deve scattare niente.
    const buf = await checker()
    const band = await applyBlur({
      posterBuf: buf, blurEnabled: true, blurHeight: 50,
      blurIntensity: 40, blurFade: 20, blurDarkness: 70,
    })
    const stats = (await posterZoneStats(buf, ZONE, band))!
    expect(stats.luminance).toBeLessThan(ZONE_BRIGHT_LUMINANCE)
    expect(stats.stdDev).toBeLessThan(ZONE_BUSY_STDDEV)
    expect(zoneTextTreatment(stats, BOTH)).toEqual({ color: "", shadowColor: SHADOW_DARK, halo: 0 })
  })
})

describe("zoneTextTreatment", () => {
  it("turns the glyphs dark on a flat bright field, with a light shadow", async () => {
    const t = zoneTextTreatment(await posterZoneStats(await white(), ZONE), BOTH)
    expect(t.color).toBe(DARK_GLYPH_COLOR)
    expect(t.shadowColor).toBe(SHADOW_LIGHT)
    // Glifi scuri e alone scuro insieme non avrebbero senso.
    expect(t.halo).toBe(0)
  })

  it("adds a halo on a busy field, and leaves the glyphs light", async () => {
    const t = zoneTextTreatment(await posterZoneStats(await checker(), ZONE), BOTH)
    expect(t.color).toBe("")
    expect(t.halo).toBeGreaterThan(0)
    expect(t.halo).toBeLessThanOrEqual(1)
  })

  it("does nothing at all when both switches are off", async () => {
    const off = { darkText: false, halo: false }
    for (const buf of [await white(), await checker()]) {
      expect(zoneTextTreatment(await posterZoneStats(buf, ZONE), off)).toEqual({
        color: "", shadowColor: SHADOW_DARK, halo: 0,
      })
    }
  })

  it("honours each switch on its own", async () => {
    expect(zoneTextTreatment(await posterZoneStats(await white(), ZONE), { darkText: false, halo: true }).color).toBe("")
    expect(zoneTextTreatment(await posterZoneStats(await checker(), ZONE), { darkText: true, halo: false }).halo).toBe(0)
  })

  it("returns no treatment when the zone could not be measured", () => {
    expect(zoneTextTreatment(null, BOTH)).toEqual({ color: "", shadowColor: SHADOW_DARK, halo: 0 })
  })
})

describe("text shadow with the new fields", () => {
  it("is byte-identical to the historic filter at halo 0 and the default colour", () => {
    const historic = textShadowDefs("sh")
    expect(historic).toContain("rgba(0,0,0,")
    expect(historic).not.toContain("stdDeviation=\"9\"")
    expect(textShadowDefs("sh", { halo: 0, shadowOpacity: 100, shadowBlur: 100, shadowOffset: 100 })).toBe(historic)
  })

  it("emits the wide faint layer only when a halo is asked for", () => {
    const withHalo = textShadowDefs("sh", { halo: 1 })
    expect(withHalo).toContain('stdDeviation="9"')
    // Debole di proposito: l'alone stacca il testo, non lo copre.
    expect(withHalo).toMatch(/rgba\(0,0,0,0\.35\)/)
    expect(textShadowDefs("sh", { halo: 0.5 })).toMatch(/rgba\(0,0,0,0\.175\)/)
  })

  it("paints the shadow light when asked, for dark glyphs", () => {
    expect(textShadowDefs("sh", { shadowColor: SHADOW_LIGHT })).toContain("rgba(255,255,255,")
  })

  it("grows the render box for the halo so it is not clipped", () => {
    expect(textShadowBox({ halo: 1 }).pad).toBeGreaterThan(textShadowBox().pad)
    expect(textShadowBox({ halo: 0 })).toEqual(textShadowBox())
  })
})

describe("buildLogoHalo", () => {
  async function wordmark(): Promise<Buffer> {
    return sharp({ create: { width: 300, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 200, height: 40, channels: 4, background: "#ffffff" } }).png().toBuffer(), top: 20, left: 50 }])
      .png().toBuffer()
  }

  it("is larger than the logo, so the halo dies outside its edges", async () => {
    const png = (await buildLogoHalo(await wordmark(), 300, 80, 1))!
    const meta = await sharp(png).metadata()
    expect(meta.width!).toBeGreaterThan(300)
    expect(meta.height!).toBeGreaterThan(80)
  })

  it("follows the logo's own shape: opaque behind the ink, clear at the corner", async () => {
    const png = (await buildLogoHalo(await wordmark(), 300, 80, 1))!
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
    expect(alphaAt(Math.round(info.width / 2), Math.round(info.height / 2))).toBeGreaterThan(60)
    expect(alphaAt(0, 0)).toBeLessThan(10)
  })

  it("scales with the strength and is nothing at zero", async () => {
    const logo = await wordmark()
    expect(await buildLogoHalo(logo, 300, 80, 0)).toBeNull()
    const mid = (await buildLogoHalo(logo, 300, 80, 0.4))!
    const full = (await buildLogoHalo(logo, 300, 80, 1))!
    const centre = async (png: Buffer) => {
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      return data[(Math.round(info.height / 2) * info.width + Math.round(info.width / 2)) * 4 + 3]
    }
    expect(await centre(mid)).toBeLessThan(await centre(full))
  })

  it("returns null instead of throwing on a non-image", async () => {
    expect(await buildLogoHalo(Buffer.from([1, 2, 3]), 100, 50, 1)).toBeNull()
  })
})
