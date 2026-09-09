import { describe, expect, it } from "vitest"
import { findAccentColor } from "@/lib/accent-color"

/** Immagine RGBA piatta di un solo colore. */
function solid(r: number, g: number, b: number, w = 40, h = 40): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255
  }
  return px
}

function hue({ r, g, b }: { r: number; g: number; b: number }): number {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  if (max === min) return 0
  const d = max - min
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

/** Differenza circolare fra due tinte, 0..180. */
function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe("findAccentColor hue modes", () => {
  // Un teal saturo: tinta ~180°.
  const teal = solid(20, 140, 140)
  const TEAL_HUE = 180

  it("dominant keeps the poster's own hue", () => {
    const got = hue(findAccentColor(teal, 40, 40, "", "dominant"))
    expect(hueDelta(got, TEAL_HUE)).toBeLessThan(25)
  })

  it("complement rotates away from it, which is the legacy look", () => {
    const got = hue(findAccentColor(teal, 40, 40, "", "complement"))
    // +150° dal dominante: deve stare lontano dalla tinta del poster.
    expect(hueDelta(got, TEAL_HUE)).toBeGreaterThan(100)
  })

  it("defaults to complement so callers that do not opt in are unchanged", () => {
    const withDefault = findAccentColor(teal, 40, 40, "")
    const explicit = findAccentColor(teal, 40, 40, "", "complement")
    expect(withDefault).toEqual(explicit)
  })

  it("falls back by genre on a flat poster with no vibrant pixels", () => {
    // Grigio: nessun pixel supera la soglia di saturazione, quindi la tinta
    // non si può dedurre e si usa il colore del genere.
    const grey = solid(128, 128, 128)
    const dominant = findAccentColor(grey, 40, 40, "Action", "dominant")
    const complement = findAccentColor(grey, 40, 40, "Action", "complement")
    // Il ramo di fallback non ruota nulla: le due modalità coincidono.
    expect(dominant).toEqual(complement)
  })
})
