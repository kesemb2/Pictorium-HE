import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { scorePosterLogoFit, rankPostersByFit } from "@/lib/poster-fit-score"

/**
 * La scelta automatica deve tenere conto della fascia che coprirà il poster.
 *
 * Prima questo punteggio guardava un 16% fisso in basso, mentre il blur di
 * default ne copre il 30%: un soggetto fra il 70% e l'84% dell'altezza finiva
 * sotto la sfocatura ed era comunque fuori dal rettangolo ispezionato.
 */

/** Poster piatto con un blocco di dettaglio a una certa altezza. */
function posterWithSubject(topFraction: number): Promise<Buffer> {
  const W = 500, H = 750
  const data = Buffer.alloc(W * H * 3, 24)
  const top = Math.round(H * topFraction)
  const blockH = Math.round(H * 0.12)
  for (let y = top; y < Math.min(H, top + blockH); y++) {
    for (let x = 150; x < 350; x++) {
      const i = (y * W + x) * 3
      // Righe alternate: alza il dettaglio, non solo la luminanza media.
      const v = y % 2 === 0 ? 240 : 30
      data[i] = v; data[i + 1] = v; data[i + 2] = v
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer()
}

function makeLogo(): Promise<Buffer> {
  const w = 300, h = 100
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = 255
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

const base = {
  logoScale: 60,
  logoOffsetX: 0,
  logoOffsetY: 0,
  hasBadges: true,
}

describe("blur band in the fit score", () => {
  it("penalises a subject that the band will cover", async () => {
    const logoBuffer = await makeLogo()
    const safe = await scorePosterLogoFit({ ...base, posterBuffer: await posterWithSubject(0.40), logoBuffer, blurBandPct: 30 })
    const covered = await scorePosterLogoFit({ ...base, posterBuffer: await posterWithSubject(0.75), logoBuffer, blurBandPct: 30 })

    expect(covered.metrics.bandIntrusion).toBeGreaterThan(safe.metrics.bandIntrusion)
    expect(covered.score).toBeLessThan(safe.score)
  })

  it("ranks the safe poster first when both are offered", async () => {
    const logoBuffer = await makeLogo()
    const ranked = await rankPostersByFit(
      [
        { posterPath: "/covered.jpg", posterBuffer: await posterWithSubject(0.75) },
        { posterPath: "/safe.jpg", posterBuffer: await posterWithSubject(0.40) },
      ],
      logoBuffer, 60, 0, 0, true, undefined, 30,
    )
    expect(ranked[0].posterPath).toBe("/safe.jpg")
  })

  it("follows the configured band height instead of a fixed zone", async () => {
    const logoBuffer = await makeLogo()
    const posterBuffer = await posterWithSubject(0.72)
    // Fascia bassa: il soggetto resta sopra. Fascia alta: lo inghiotte.
    const shallow = await scorePosterLogoFit({ ...base, posterBuffer, logoBuffer, blurBandPct: 20 })
    const deep = await scorePosterLogoFit({ ...base, posterBuffer, logoBuffer, blurBandPct: 34 })

    expect(deep.metrics.bandIntrusion).toBeGreaterThan(shallow.metrics.bandIntrusion)
  })

  it("falls back to the badge strip when blur is off", async () => {
    const logoBuffer = await makeLogo()
    // Il blocco copre 0.72-0.84: dentro la fascia del 30%, fuori dalla
    // striscia badge (0.84-1.00) usata quando il blur è spento.
    const posterBuffer = await posterWithSubject(0.72)
    const withBlur = await scorePosterLogoFit({ ...base, posterBuffer, logoBuffer, blurBandPct: 30 })
    const noBlur = await scorePosterLogoFit({ ...base, posterBuffer, logoBuffer, blurBandPct: null })

    expect(withBlur.metrics.bandIntrusion).toBeGreaterThan(0)
    expect(noBlur.metrics.bandIntrusion).toBeLessThan(withBlur.metrics.bandIntrusion)
  })
})
