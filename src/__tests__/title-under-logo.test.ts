import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { computeLogoLayout } from "@/lib/logo-layout"
import { buildTitleTextSvg, containsHebrew, fitTitleText, titleStripHeight, titleTextFontSize, titleTextMaxW } from "@/lib/badge-svg-shared"
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

const RENDER_W = 500
const BASE_FS = titleTextFontSize(RENDER_W)
/** Corpo base del badge genere: `24 * pw / 380` in buildGenreBadgeSVG. */
const GENRE_BASE_FS = 24 * RENDER_W / 380

describe("titleTextFontSize", () => {
  it("outranks the genre and rating line beneath it", () => {
    // La regressione che questo lavoro corregge: il titolo era fisso a 27px,
    // cioè PIÙ PICCOLO della riga genere+voto, e leggeva come didascalia.
    expect(BASE_FS).toBeGreaterThan(GENRE_BASE_FS)
    expect(BASE_FS / GENRE_BASE_FS).toBeCloseTo(1.5, 1)
  })

  it("scales with the poster width like every other badge", () => {
    expect(titleTextFontSize(1000)).toBeGreaterThan(titleTextFontSize(500))
  })
})

describe("fitTitleText", () => {
  it("keeps a short title at full size", () => {
    const fit = fitTitleText("מועדון קרב", titleTextMaxW(RENDER_W), BASE_FS)
    expect(fit.text).toBe("מועדון קרב")
    expect(fit.fs).toBe(BASE_FS)
  })

  it("shrinks a long title instead of overflowing or truncating it", () => {
    const long = "הארי פוטר ואבן החכמים: המסע מתחיל"
    const fit = fitTitleText(long, titleTextMaxW(RENDER_W), BASE_FS)
    expect(fit.fs).toBeLessThan(BASE_FS)
    expect(fit.text).toBe(long)
  })

  it("stops shrinking before the title becomes a caption again", () => {
    const fit = fitTitleText("א".repeat(200), titleTextMaxW(RENDER_W), BASE_FS)
    expect(fit.fs).toBeGreaterThanOrEqual(20)
    expect(fit.text.endsWith("…")).toBe(true)
    expect(fit.text.length).toBeLessThan(200)
  })

  it("collapses whitespace and handles an empty title", () => {
    expect(fitTitleText("  מועדון   קרב  ", 400, BASE_FS).text).toBe("מועדון קרב")
    expect(fitTitleText("   ", 400, BASE_FS).text).toBe("")
  })
})

describe("titleStripHeight", () => {
  it("is the single source for the reserved and the drawn height", () => {
    // Se le due divergessero, il titolo finirebbe sopra o sotto il buco che
    // poster-service ha lasciato per lui alzando il logo.
    const built = buildTitleTextSvg("מועדון קרב", titleTextMaxW(RENDER_W), BASE_FS)!
    expect(built.h).toBe(titleStripHeight(BASE_FS))
  })

  it("shrinks with the title, so a long one leaves no gap above it", () => {
    const long = fitTitleText("הארי פוטר ואבן החכמים: המסע מתחיל", titleTextMaxW(RENDER_W), BASE_FS)
    expect(titleStripHeight(long.fs)).toBeLessThan(titleStripHeight(BASE_FS))
  })
})

describe("buildTitleTextSvg", () => {
  it("declares Rubik for Hebrew and Inter for Latin", () => {
    expect(buildTitleTextSvg("מועדון קרב", 400, BASE_FS)!.svg).toContain('font-family="Rubik"')
    expect(buildTitleTextSvg("Fight Club", 400, BASE_FS)!.svg).toContain('font-family="Inter"')
  })

  it("returns null for an empty title so callers need no special case", () => {
    expect(buildTitleTextSvg("   ", 400, BASE_FS)).toBeNull()
  })

  it("never renders wider than the budget it is given", () => {
    const built = buildTitleTextSvg("שר הטבעות: אחוות הטבעת", 200, BASE_FS)!
    expect(built.w).toBeLessThanOrEqual(200 + 16)
  })
})

describe("renderTitleText", () => {
  it("rasterises Hebrew glyphs rather than tofu", async () => {
    const out = await renderTitleText("מועדון קרב", titleTextMaxW(RENDER_W), BASE_FS)
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
