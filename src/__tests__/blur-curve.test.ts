import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { applyBlur, bandDimming, bandGeometry, bandOpacity } from "@/lib/blur"
import { STD_H, STD_W } from "@/lib/image-utils"

async function flatPoster(v: number): Promise<Buffer> {
  return sharp({ create: { width: STD_W, height: STD_H, channels: 3, background: { r: v, g: v, b: v } } })
    .jpeg({ quality: 95 })
    .toBuffer()
}

/** Media per riga di un canale dell'overlay RGBA (dithering mediato via). */
function rowMeans(overlay: Buffer, rows: number, channel: number): number[] {
  const out: number[] = []
  for (let y = 0; y < rows; y++) {
    let sum = 0
    for (let x = 0; x < STD_W; x++) sum += overlay[(y * STD_W + x) * 4 + channel]
    out.push(sum / STD_W)
  }
  return out
}

describe("band curve (fork hybrid)", () => {
  it("reaches full opacity and full dimming at fadeStop and holds below", () => {
    expect(bandOpacity(1)).toBe(1)
    expect(bandDimming(1)).toBe(1)
    expect(bandOpacity(0)).toBe(0)
    expect(bandDimming(0)).toBe(0)
  })

  it("lands with zero slope at both ends (no horizontal step)", () => {
    const h = 1e-4
    for (const f of [bandOpacity, bandDimming]) {
      expect((f(1) - f(1 - h)) / h).toBeLessThan(0.01)
      expect((f(h) - f(0)) / h).toBeLessThan(0.01)
    }
  })

  it("keeps mid-tones in the upper ramp close to the historic s² dimming", () => {
    expect(Math.abs(bandDimming(0.3) - 0.09)).toBeLessThan(0.02)
  })

  it("covers the lower half fully at the default fade (50)", async () => {
    const poster = await flatPoster(200)
    const res = await applyBlur({
      posterBuf: poster, blurEnabled: true,
      blurHeight: 30, blurIntensity: 20, blurFade: 50, blurDarkness: 30,
    })
    expect(res).not.toBeNull()
    const { opaqueFrom } = bandGeometry(30, 50)
    const alpha = rowMeans(res!.overlay, res!.height, 3)
    const red = rowMeans(res!.overlay, res!.height, 0)
    for (let y = opaqueFrom - res!.top; y < res!.height; y++) {
      expect(alpha[y]).toBeGreaterThan(254)
      // 200 * (1 - 0.30) = 140, più la sfocatura di un piatto (invariata).
      expect(Math.abs(red[y] - 140)).toBeLessThan(2)
    }
  })

  it("has no row-to-row jump in the ramp (smooth landing at fadeStop)", async () => {
    const poster = await flatPoster(200)
    const res = await applyBlur({
      posterBuf: poster, blurEnabled: true,
      blurHeight: 30, blurIntensity: 20, blurFade: 50, blurDarkness: 60,
    })
    const red = rowMeans(res!.overlay, res!.height, 0)
    const alpha = rowMeans(res!.overlay, res!.height, 3)
    // Salto massimo fra righe adiacenti ben sotto la variazione media della
    // rampa: nessun gradino concentrato in una riga.
    const maxRedStep = Math.max(...red.slice(1).map((v, i) => Math.abs(v - red[i])))
    const maxAlphaStep = Math.max(...alpha.slice(1).map((v, i) => Math.abs(v - alpha[i])))
    expect(maxRedStep).toBeLessThan(3)
    expect(maxAlphaStep).toBeLessThan(6)
  })

  it("is deterministic (same input, same bytes)", async () => {
    const poster = await flatPoster(120)
    const params = { posterBuf: poster, blurEnabled: true, blurHeight: 30, blurIntensity: 20, blurFade: 50, blurDarkness: 30 }
    const a = await applyBlur(params)
    const b = await applyBlur(params)
    expect(a!.overlay.equals(b!.overlay)).toBe(true)
  })
})
