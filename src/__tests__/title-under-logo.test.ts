import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { computeLogoLayout } from "@/lib/logo-layout"
import { buildTitleTextSvg, containsHebrew, fitTitleText, titleTextMaxW, TITLE_TEXT_FONT_SIZE } from "@/lib/badge-svg-shared"
import { renderTitleText } from "@/lib/svg-badge"

const LOGO = {
  posterW: 500, posterH: 750, logoW: 800, logoH: 200,
  logoScale: 70, logoOffsetX: 0, logoOffsetY: 0, hasBadges: true,
}

describe("computeLogoLayout titleBandH", () => {
  it("is a no-op when the band is absent, zero or negative", () => {
    const base = computeLogoLayout(LOGO)
    expect(computeLogoLayout({ ...LOGO, titleBandH: 0 })).toEqual(base)
    expect(computeLogoLayout({ ...LOGO, titleBandH: -20 })).toEqual(base)
    expect(computeLogoLayout({ ...LOGO, titleBandH: NaN })).toEqual(base)
  })

  it("lifts the logo by exactly the band height without resizing it", () => {
    const base = computeLogoLayout(LOGO)
    const lifted = computeLogoLayout({ ...LOGO, titleBandH: 46 })
    expect(lifted.top).toBe(base.top - 46)
    // La larghezza è ciò che dimensiona un wordmark: ridurre l'altezza gli
    // toglierebbe metà larghezza via `fit: "inside"` senza guadagnare spazio.
    expect(lifted.width).toBe(base.width)
    expect(lifted.height).toBe(base.height)
    expect(lifted.left).toBe(base.left)
  })

  it("never pushes the logo off the top of the poster", () => {
    const tall = computeLogoLayout({ ...LOGO, logoW: 200, logoH: 800, logoScale: 100, titleBandH: 400 })
    expect(tall.top).toBeGreaterThanOrEqual(0)
  })
})

describe("fitTitleText", () => {
  it("keeps a short title at full size", () => {
    const fit = fitTitleText("מועדון קרב", titleTextMaxW(500))
    expect(fit.text).toBe("מועדון קרב")
    expect(fit.fs).toBe(TITLE_TEXT_FONT_SIZE)
  })

  it("shrinks a long title instead of overflowing or truncating it", () => {
    const long = "הארי פוטר ואבן החכמים: המסע מתחיל"
    const fit = fitTitleText(long, titleTextMaxW(500))
    expect(fit.fs).toBeLessThan(TITLE_TEXT_FONT_SIZE)
    expect(fit.text).toBe(long)
  })

  it("truncates with an ellipsis once the minimum size is not enough", () => {
    const fit = fitTitleText("א".repeat(200), titleTextMaxW(500))
    expect(fit.text.endsWith("…")).toBe(true)
    expect(fit.text.length).toBeLessThan(200)
  })

  it("collapses whitespace and handles an empty title", () => {
    expect(fitTitleText("  מועדון   קרב  ", 400).text).toBe("מועדון קרב")
    expect(fitTitleText("   ", 400).text).toBe("")
  })
})

describe("buildTitleTextSvg", () => {
  it("declares Rubik for Hebrew and Inter for Latin", () => {
    expect(buildTitleTextSvg("מועדון קרב", 400)!.svg).toContain('font-family="Rubik"')
    expect(buildTitleTextSvg("Fight Club", 400)!.svg).toContain('font-family="Inter"')
  })

  it("returns null for an empty title so callers need no special case", () => {
    expect(buildTitleTextSvg("   ", 400)).toBeNull()
  })

  it("never renders wider than the budget it is given", () => {
    const built = buildTitleTextSvg("שר הטבעות: אחוות הטבעת", 200)!
    expect(built.w).toBeLessThanOrEqual(200 + 16)
  })
})

describe("renderTitleText", () => {
  it("rasterises Hebrew glyphs rather than tofu", async () => {
    const out = await renderTitleText("מועדון קרב", titleTextMaxW(500))
    expect(out).not.toBeNull()
    const { data, info } = await sharp(out!.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    // Solo i pixel PIENI: l'ombra sotto il testo è semitrasparente e coprirebbe
    // mezza immagine, mascherando la differenza tra glifi veri e tofu.
    let solid = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) solid++
    expect(solid).toBeGreaterThan(0)
    // Tofu: i quadratini riempiono quasi tutta la scatola del glifo.
    expect(solid).toBeLessThan(info.width * info.height * 0.4)
  })
})

describe("containsHebrew", () => {
  it("separates a real Hebrew title from an untranslated one", () => {
    // TMDB restituisce il titolo ORIGINALE quando manca la traduzione: senza
    // questo controllo scriveremmo "Fight Club" sotto il logo "FIGHT CLUB".
    expect(containsHebrew("מועדון קרב")).toBe(true)
    expect(containsHebrew("Fight Club")).toBe(false)
    expect(containsHebrew("Fight Club מועדון")).toBe(true)
    expect(containsHebrew("")).toBe(false)
  })
})
