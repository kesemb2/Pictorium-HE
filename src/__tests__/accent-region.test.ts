import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { clampAccentRegionFraction, extractBadgeColor, DEFAULT_ACCENT_REGION_FRACTION } from "@/lib/poster-render-helpers"

/**
 * Poster a tre bande: teal in alto, arancio in mezzo, viola negli ultimi 20%.
 * Quale banda vince dipende SOLO da quanto in alto arriva il ritaglio, quindi
 * la frazione campionata si legge dal colore che esce.
 */
async function bandedPoster(): Promise<Buffer> {
  const mid = await sharp({ create: { width: 500, height: 375, channels: 3, background: "#d2761e" } }).png().toBuffer()
  const low = await sharp({ create: { width: 500, height: 150, channels: 3, background: "#7a1ed2" } }).png().toBuffer()
  return sharp({ create: { width: 500, height: 750, channels: 3, background: "#14a0a0" } })
    .composite([{ input: mid, top: 225, left: 0 }, { input: low, top: 600, left: 0 }])
    .jpeg()
    .toBuffer()
}

function hue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const PURPLE_HUE = 270
const ORANGE_HUE = 29

describe("extractBadgeColor region fraction", () => {
  it("follows the band height instead of a fixed bottom 40%", async () => {
    const poster = await bandedPoster()
    // Fascia stretta (20%): vede solo il viola.
    const narrow = await extractBadgeColor(poster, null, "", "bottom", "dominant", 0.2)
    // Fascia larga (40%, il vecchio default): entra anche l'arancio, che copre
    // metà del ritaglio ed è il bucket dominante.
    const wide = await extractBadgeColor(poster, null, "", "bottom", "dominant", 0.4)
    expect(hueDelta(hue(narrow), PURPLE_HUE)).toBeLessThan(30)
    expect(hueDelta(hue(wide), ORANGE_HUE)).toBeLessThan(30)
  }, 20000)

  it("defaults to the historical bottom 40%", async () => {
    const poster = await bandedPoster()
    const withDefault = await extractBadgeColor(poster, null, "", "bottom", "dominant")
    const explicit = await extractBadgeColor(poster, null, "", "bottom", "dominant", DEFAULT_ACCENT_REGION_FRACTION)
    expect(withDefault).toBe(explicit)
  }, 20000)
})

describe("clampAccentRegionFraction", () => {
  it("keeps a sane fraction untouched", () => {
    expect(clampAccentRegionFraction(0.3)).toBe(0.3)
  })

  it("never degenerates to a zero-height crop", () => {
    expect(clampAccentRegionFraction(0)).toBeGreaterThan(0)
    expect(clampAccentRegionFraction(-1)).toBeGreaterThan(0)
  })

  it("falls back to the default on a non-number", () => {
    expect(clampAccentRegionFraction(undefined)).toBe(DEFAULT_ACCENT_REGION_FRACTION)
    expect(clampAccentRegionFraction(NaN)).toBe(DEFAULT_ACCENT_REGION_FRACTION)
  })

  it("caps at the whole poster", () => {
    expect(clampAccentRegionFraction(5)).toBe(1)
  })
})
