import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { fitBandToPoster, MIN_FITTED_BAND_PCT } from "@/lib/poster-render-helpers"

const W = 200
const H = 300

/** Costruisce un poster PNG 200×300 dipinto riga per riga. */
async function poster(paint: (raw: Buffer, x: number, y: number) => void): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      raw[i + 3] = 255
      paint(raw, x, y)
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

function gray(raw: Buffer, x: number, y: number, v: number): void {
  const i = (y * W + x) * 4
  raw[i] = v; raw[i + 1] = v; raw[i + 2] = v
}

describe("fitBandToPoster", () => {
  it("raises the top edge above a bright block that the requested band would cut through", async () => {
    // Blocco chiaro fra il 66% e il 76% dell'altezza, largo mezzo poster: il
    // bordo di una fascia al 30% cadrebbe al 70%, in mezzo al blocco.
    const buf = await poster((raw, x, y) => {
      const inBlock = y >= H * 0.66 && y <= H * 0.76 && x > W * 0.25 && x < W * 0.75
      gray(raw, x, y, inBlock ? 240 : 20)
    })
    const fitted = await fitBandToPoster(buf, 30)
    expect(fitted).toBeLessThan(30)
    // Il bordo deve stare SOTTO il blocco, non dentro: blocco fino al 76%,
    // quindi una fascia di al più il 24%.
    expect(fitted).toBeLessThanOrEqual(24.5)
    // E deve fermarsi lì, non precipitare sul pavimento: è la corsa di righe
    // occupate a decidere il bordo, non il clamp.
    expect(fitted).toBeGreaterThan(MIN_FITTED_BAND_PCT + 3)
  })

  it("keeps the requested height when the bottom of the poster is clean", async () => {
    // Dettaglio solo in alto, fondo piatto: niente da evitare.
    const buf = await poster((raw, x, y) => {
      const noisy = y < H * 0.5
      gray(raw, x, y, noisy ? ((x * 37 + y * 53) % 255) : 40)
    })
    expect(await fitBandToPoster(buf, 30)).toBe(30)
  })

  it("clamps at the floor instead of vanishing on a poster busy all the way down", async () => {
    const buf = await poster((raw, x, y) => {
      gray(raw, x, y, (x * 61 + y * 29) % 255)
    })
    const fitted = await fitBandToPoster(buf, 30)
    expect(fitted).toBe(MIN_FITTED_BAND_PCT)
  })

  it("never grows the band beyond the requested height", async () => {
    const buf = await poster((raw, x, y) => gray(raw, x, y, y < H * 0.9 ? 30 : 200))
    for (const requested of [12, 18, 25, 40, 60]) {
      expect(await fitBandToPoster(buf, requested)).toBeLessThanOrEqual(requested)
    }
  })

  it("leaves a request already at or below the floor untouched", async () => {
    const buf = await poster((raw, x, y) => gray(raw, x, y, (x * 61 + y * 29) % 255))
    expect(await fitBandToPoster(buf, 10)).toBe(10)
    expect(await fitBandToPoster(buf, MIN_FITTED_BAND_PCT)).toBe(MIN_FITTED_BAND_PCT)
  })

  it("falls back to the requested height on a corrupt buffer", async () => {
    expect(await fitBandToPoster(Buffer.from([1, 2, 3, 4]), 30)).toBe(30)
  })
})
