import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { applyBlur } from "@/lib/blur"

async function poster(): Promise<Buffer> {
  // Grigio neutro: qualunque deriva di tinta nell'overlay viene dal tint,
  // non dall'artwork.
  return sharp({ create: { width: 500, height: 750, channels: 3, background: "#808080" } })
    .jpeg().toBuffer()
}

const PARAMS = {
  blurEnabled: true, blurHeight: 30, blurIntensity: 5, blurFade: 60, blurDarkness: 40,
}

function luma({ r, g, b }: { r: number; g: number; b: number }): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Pixel RGBA in coda alla fascia, dove `fade` vale 1. */
function bottomPixel(overlay: Buffer, height: number) {
  const i = ((height - 1) * 500 + 250) * 4
  return { r: overlay[i], g: overlay[i + 1], b: overlay[i + 2], a: overlay[i + 3] }
}

describe("applyBlur tint", () => {
  it("leaves the band neutral when no tint is given", async () => {
    const out = (await applyBlur({ posterBuf: await poster(), ...PARAMS }))!
    const p = bottomPixel(out.overlay, out.height)
    expect(p.r).toBe(p.g)
    expect(p.g).toBe(p.b)
  })

  it("pulls the band toward the tint colour", async () => {
    const out = (await applyBlur({ posterBuf: await poster(), ...PARAMS, tintColor: "#00ff00" }))!
    const p = bottomPixel(out.overlay, out.height)
    expect(p.g).toBeGreaterThan(p.r)
    expect(p.g).toBeGreaterThan(p.b)
  })

  it("does not tint the transparent top edge of the band", async () => {
    // La tinta segue `fade`: dove l'overlay è trasparente non deve colorare
    // nulla, altrimenti si vedrebbe uno stacco netto dove l'opacità sale.
    const out = (await applyBlur({ posterBuf: await poster(), ...PARAMS, tintColor: "#00ff00" }))!
    const i = (0 * 500 + 250) * 4
    expect(out.overlay[i + 3]).toBe(0)
    expect(out.overlay[i + 1]).toBe(out.overlay[i])
  })

  it("ignores a malformed colour instead of rendering black", async () => {
    const neutral = (await applyBlur({ posterBuf: await poster(), ...PARAMS }))!
    for (const bad of ["", "nope", "#fff", "rgb(0,255,0)"]) {
      const out = (await applyBlur({ posterBuf: await poster(), ...PARAMS, tintColor: bad }))!
      expect(bottomPixel(out.overlay, out.height), bad).toEqual(bottomPixel(neutral.overlay, neutral.height))
    }
  })

  // La regressione che conta. `findAccentColor` porta di proposito l'accent di
  // un poster scuro a L=0.88 perché il badge resti leggibile; miscelarlo a piena
  // luminosità schiariva la fascia, e il fondo dei poster scuri risultava più
  // chiaro dell'artwork sopra.
  it("does not brighten a dark band when the tint is near-white", async () => {
    const dark = await sharp({ create: { width: 500, height: 750, channels: 3, background: "#101014" } })
      .jpeg().toBuffer()
    const neutral = (await applyBlur({ posterBuf: dark, ...PARAMS }))!
    const tinted = (await applyBlur({ posterBuf: dark, ...PARAMS, tintColor: "#f0e6d2" }))!
    const n = bottomPixel(neutral.overlay, neutral.height)
    const t = bottomPixel(tinted.overlay, tinted.height)
    expect(luma(t)).toBeLessThanOrEqual(luma(n) + 1)
  })

  it("still shifts the hue of a dark band toward the tint", async () => {
    const dark = await sharp({ create: { width: 500, height: 750, channels: 3, background: "#101014" } })
      .jpeg().toBuffer()
    const tinted = (await applyBlur({ posterBuf: dark, ...PARAMS, tintColor: "#f0e6d2" }))!
    const neutral = (await applyBlur({ posterBuf: dark, ...PARAMS }))!
    const t = bottomPixel(tinted.overlay, tinted.height)
    const n = bottomPixel(neutral.overlay, neutral.height)
    // Su una fascia quasi nera lo spostamento assoluto è di pochi livelli, quindi
    // si misura il rapporto: il tint è caldo e deve alzare il rosso rispetto al
    // blu, che sul poster di partenza era il canale più alto.
    expect(t.r / t.b).toBeGreaterThan(n.r / n.b)
  })

  it("returns null when blur is disabled", async () => {
    expect(await applyBlur({ posterBuf: await poster(), ...PARAMS, blurEnabled: false, tintColor: "#00ff00" })).toBeNull()
  })
})
