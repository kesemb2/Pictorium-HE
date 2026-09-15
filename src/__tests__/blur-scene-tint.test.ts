import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { findAccentColor, findSceneTint } from "@/lib/accent-color"
import { extractSceneTint } from "@/lib/poster-render-helpers"

function relLuma({ r, g, b }: { r: number; g: number; b: number }): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Poster scuro ma saturo: il caso che rompeva la fascia. */
async function darkSaturatedPoster(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 300, channels: 3, background: "#0b2038" } })
    .jpeg().toBuffer()
}

/**
 * La fascia sfocata NON prende il colore del badge.
 *
 * `findAccentColor` porta di proposito l'accento di un poster scuro fino a
 * L=0.88, perché il testo del badge resti leggibile. Quando quello stesso
 * colore tingeva anche la fascia, il fondo del poster usciva più chiaro
 * dell'artwork sopra. La tinta di scena resta sulla luminosità dei pixel che
 * copre e risolve il problema alla radice: due colori, due mestieri.
 */
describe("scene tint vs badge accent on a dark poster", () => {
  it("keeps the band tint dark where the badge accent goes near-white", async () => {
    const buf = await darkSaturatedPoster()
    const pixels = await sharp(buf).ensureAlpha().raw().toBuffer()

    const badge = findAccentColor(pixels, 200, 300, "")
    const scene = findSceneTint(pixels, 200, 300)!

    expect(scene).not.toBeNull()
    expect(relLuma(badge)).toBeGreaterThan(0.6)
    expect(relLuma(scene)).toBeLessThan(0.35)
    expect(relLuma(scene)).toBeLessThan(relLuma(badge))
  })

  it("returns a usable hex through the render helper", async () => {
    const hex = await extractSceneTint(await darkSaturatedPoster(), 0.3)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})
