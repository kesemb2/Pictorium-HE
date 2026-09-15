import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { bandGeometry } from "@/lib/blur"
import { fitBandToPoster, MIN_BAND_FADE, MIN_FITTED_BAND_PCT, type BandFit } from "@/lib/poster-render-helpers"

const W = 200
const H = 300

const REQUESTED: BandFit = { blurHeight: 30, blurFade: 60, blurIntensity: 8 }

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

describe("fitBandToPoster", () => {
  it("covers an element the ramp would cut through instead of retreating from it", async () => {
    // Blocco largo, dalle righe 198..228 del thumb: la rampa di una fascia al
    // 30% con fade 60 gli passa in mezzo semitrasparente.
    const fitted = await fitBandToPoster(await poster(block(198, 228)), REQUESTED)

    // L'altezza NON si muove: è quella che tiene il logo sopra una base calma.
    expect(fitted.blurHeight).toBe(REQUESTED.blurHeight)
    // La rampa si accorcia, così la fascia è opaca dove l'elemento comincia.
    expect(fitted.blurFade).toBeLessThan(REQUESTED.blurFade)
    expect(fitted.blurFade).toBeGreaterThanOrEqual(MIN_BAND_FADE)
    // E la sfocatura sale, o l'elemento coperto resta un blob contrastato.
    expect(fitted.blurIntensity).toBeGreaterThan(REQUESTED.blurIntensity)
  })

  it("makes the band opaque at the top of the element, not below it", async () => {
    const buf = await poster(block(198, 228))
    const fitted = await fitBandToPoster(buf, REQUESTED)

    const before = bandGeometry(REQUESTED.blurHeight, REQUESTED.blurFade)
    const after = bandGeometry(fitted.blurHeight, fitted.blurFade)
    // Il blocco sul poster 500×750 comincia a y≈495: prima la fascia diventava
    // opaca solo a y 653, cioè oltre l'elemento e oltre il logo.
    expect(before.opaqueFrom).toBeGreaterThan(560)
    expect(after.opaqueFrom).toBeLessThan(before.opaqueFrom)
    expect(after.opaqueFrom).toBeLessThanOrEqual(560)
  })

  it("takes a small shrink when a few points clear the element outright", async () => {
    // Blocco basso e corto: bastano ~3 punti per scavalcarlo del tutto.
    const fitted = await fitBandToPoster(await poster(block(205, 219)), REQUESTED)

    expect(fitted.blurHeight).toBeLessThan(REQUESTED.blurHeight)
    expect(fitted.blurHeight).toBeGreaterThanOrEqual(REQUESTED.blurHeight - 4)
    // Il ritocco basta da solo: fade e sfocatura restano come richiesti.
    expect(fitted.blurFade).toBe(REQUESTED.blurFade)
    expect(fitted.blurIntensity).toBe(REQUESTED.blurIntensity)
  })

  it("keeps everything as requested when the bottom of the poster is clean", async () => {
    const buf = await poster((raw, x, y) => gray(raw, x, y, y < H * 0.5 ? ((x * 37 + y * 53) % 255) : 40))
    expect(await fitBandToPoster(buf, REQUESTED)).toEqual(REQUESTED)
  })

  it("keeps the full height on a poster busy all the way down", async () => {
    // Il caso che prima collassava al pavimento del 18% e lasciava il logo
    // sull'artwork nitido.
    const buf = await poster((raw, x, y) => gray(raw, x, y, (x * 61 + y * 29) % 255))
    const fitted = await fitBandToPoster(buf, REQUESTED)

    expect(fitted.blurHeight).toBe(REQUESTED.blurHeight)
    expect(fitted.blurHeight).toBeGreaterThan(MIN_FITTED_BAND_PCT)
    expect(fitted.blurFade).toBe(MIN_BAND_FADE)
    expect(fitted.blurIntensity).toBeGreaterThan(REQUESTED.blurIntensity)
  })

  it("never returns a value above what was asked for", async () => {
    const buf = await poster((raw, x, y) => gray(raw, x, y, (x * 61 + y * 29) % 255))
    for (const requested of [
      { blurHeight: 30, blurFade: 60, blurIntensity: 8 },
      { blurHeight: 50, blurFade: 10, blurIntensity: 90 },
      { blurHeight: 20, blurFade: 100, blurIntensity: 100 },
      { blurHeight: 15, blurFade: 25, blurIntensity: 1 },
    ] satisfies BandFit[]) {
      const fitted = await fitBandToPoster(buf, requested)
      expect(fitted.blurHeight).toBeLessThanOrEqual(requested.blurHeight)
      expect(fitted.blurFade).toBeLessThanOrEqual(requested.blurFade)
      expect(fitted.blurIntensity).toBeLessThanOrEqual(100)
    }
  })

  it("falls back to the requested band on a corrupt buffer", async () => {
    expect(await fitBandToPoster(Buffer.from([1, 2, 3, 4]), REQUESTED)).toEqual(REQUESTED)
  })
})
