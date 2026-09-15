import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { fitBandToPoster, MIN_FITTED_BAND_PCT, type BandFit } from "@/lib/poster-render-helpers"

const W = 200
const H = 300

const REQUESTED: BandFit = { blurHeight: 30, blurFade: 60, blurIntensity: 8, blurDarkness: 40 }

/** Poster PNG alla risoluzione del thumb, dipinto riga per riga. */
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

/** Blocco chiaro su fondo scuro fra due righe del thumb (estremi inclusi). */
function block(from: number, to: number) {
  return (raw: Buffer, x: number, y: number) => {
    gray(raw, x, y, y >= from && y <= to && x > W * 0.25 && x < W * 0.75 ? 240 : 20)
  }
}

/** Rumore ad alto contrasto: righe sempre "occupate". */
function noise(raw: Buffer, x: number, y: number): void {
  gray(raw, x, y, (x * 61 + y * 29) % 255)
}

describe("fitBandToPoster", () => {
  it("retreats below an element the top edge would cut through", async () => {
    const fitted = await fitBandToPoster(await poster(block(198, 228)), REQUESTED)

    expect(fitted.blurHeight).toBeLessThan(REQUESTED.blurHeight)
    // Il blocco finisce alla riga 228 di 300: la fascia comincia sotto.
    expect(fitted.blurHeight).toBeLessThanOrEqual(24)
    expect(fitted.blurHeight).toBeGreaterThanOrEqual(MIN_FITTED_BAND_PCT)
  })

  it("never touches the fade — that is what makes it a gradient and not a slab", async () => {
    for (const buf of [await poster(block(198, 228)), await poster(noise), await poster(block(205, 219))]) {
      for (const fade of [10, 20, 60, 100]) {
        const fitted = await fitBandToPoster(buf, { ...REQUESTED, blurFade: fade })
        expect(fitted.blurFade).toBe(fade)
      }
    }
  })

  it("clamps the retreat at the floor instead of vanishing", async () => {
    const fitted = await fitBandToPoster(await poster(noise), REQUESTED)
    expect(fitted.blurHeight).toBe(MIN_FITTED_BAND_PCT)
  })

  it("does not retreat when the top edge lands on a clean row", async () => {
    // Gradiente verticale dolce: ogni riga è uniforme, non c'è niente da
    // scavalcare e l'altezza resta quella chiesta.
    const buf = await poster((raw, x, y) => gray(raw, x, y, Math.round(200 - y * 0.5)))
    expect((await fitBandToPoster(buf, REQUESTED)).blurHeight).toBe(REQUESTED.blurHeight)
  })

  it("weakens the darkening over a strip that is already dark", async () => {
    // Nero uniforme in basso: scurire il nero nasconde artwork per niente.
    const buf = await poster((raw, x, y) => gray(raw, x, y, y < H * 0.5 ? 200 : 8))
    const fitted = await fitBandToPoster(buf, REQUESTED)

    expect(fitted.blurDarkness).toBeLessThan(REQUESTED.blurDarkness)
    expect(fitted.blurDarkness).toBeGreaterThanOrEqual(REQUESTED.blurDarkness * 0.5)
  })

  it("weakens the blur over a strip that is already plain", async () => {
    const buf = await poster((raw, x, y) => gray(raw, x, y, y < H * 0.5 ? (x * 37 + y * 53) % 255 : 128))
    const fitted = await fitBandToPoster(buf, REQUESTED)

    expect(fitted.blurIntensity).toBeLessThan(REQUESTED.blurIntensity)
    expect(fitted.blurIntensity).toBeGreaterThanOrEqual(Math.round(REQUESTED.blurIntensity * 0.5))
  })

  it("leaves a bright, busy strip exactly as requested", async () => {
    // Riga 210 del thumb è il bordo di una fascia al 30%: piatta lì (niente
    // ritirata), chiara e movimentata sotto (niente da indebolire).
    const buf = await poster((raw, x, y) => {
      gray(raw, x, y, y < 212 ? 190 : ((x * 61 + y * 29) % 128) + 127)
    })
    expect(await fitBandToPoster(buf, REQUESTED)).toEqual(REQUESTED)
  })

  it("never returns more than was asked for", async () => {
    for (const buf of [await poster(noise), await poster(block(198, 228)), await poster((raw, x, y) => gray(raw, x, y, 8))]) {
      for (const requested of [
        { blurHeight: 30, blurFade: 60, blurIntensity: 8, blurDarkness: 40 },
        { blurHeight: 50, blurFade: 10, blurIntensity: 90, blurDarkness: 100 },
        { blurHeight: 20, blurFade: 100, blurIntensity: 100, blurDarkness: 0 },
        { blurHeight: 15, blurFade: 25, blurIntensity: 1, blurDarkness: 55 },
      ] satisfies BandFit[]) {
        const fitted = await fitBandToPoster(buf, requested)
        expect(fitted.blurHeight).toBeLessThanOrEqual(requested.blurHeight)
        expect(fitted.blurIntensity).toBeLessThanOrEqual(requested.blurIntensity)
        expect(fitted.blurDarkness).toBeLessThanOrEqual(requested.blurDarkness)
        expect(fitted.blurIntensity).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it("falls back to the requested band on a corrupt buffer", async () => {
    expect(await fitBandToPoster(Buffer.from([1, 2, 3, 4]), REQUESTED)).toEqual(REQUESTED)
  })
})
