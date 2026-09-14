import { describe, it, expect } from "vitest"
import { renderGenreBadge } from "../lib/svg-badge"
import { buildGenreTextSvg } from "../lib/badge-svg-shared"
import { BADGE_STYLES, isBadgeStyle } from "../lib/badge-styles"
import { resolvePosterRenderConfig } from "../lib/poster-config"

describe("BadgeStyle minimal (pipe separator)", () => {
  it("includes minimal in BADGE_STYLES and isBadgeStyle recognizes it", () => {
    expect(BADGE_STYLES).toContain("minimal")
    expect(isBadgeStyle("minimal")).toBe(true)
    expect(isBadgeStyle("unknown")).toBe(false)
  })

  it("builds genre text flow using pipe separator '|' instead of bullet '•'", () => {
    const svgText = buildGenreTextSvg("Action", "8.5", "2024", 24, "#e5e7eb", "minimal")
    expect(svgText.svg).toContain("|")
    expect(svgText.svg).not.toContain("\u2022") // bullet not present
    expect(svgText.svg).toContain("Action")
    expect(svgText.svg).toContain("8.5")
    expect(svgText.svg).toContain("2024")
    expect(svgText.svg).toContain("\u2605") // star preserved for rating
  })

  it("respects parts flags: hides rating when showRating is false", () => {
    const svgText = buildGenreTextSvg("Comedy", "7.2", "2020", 24, "#e5e7eb", "minimal", 0, {
      showGenre: true,
      showRating: false,
      showYear: true,
    })
    expect(svgText.svg).toContain("Comedy")
    expect(svgText.svg).toContain("2020")
    expect(svgText.svg).not.toContain("7.2")
    expect(svgText.svg).not.toContain("\u2605")
    expect(svgText.svg).toContain("|")
  })

  it("renders minimal genre badge via renderGenreBadge without error", async () => {
    const badge = await renderGenreBadge("Sci-Fi", 8.0, 380, "2023", "minimal")
    expect(badge).not.toBeNull()
    expect(badge.png).toBeInstanceOf(Buffer)
    expect(badge.w).toBeGreaterThan(0)
    expect(badge.h).toBeGreaterThan(0)
  })


  it("retains minimal style in portrait poster", () => {
    const sp = new URLSearchParams("bs=minimal")
    const config = resolvePosterRenderConfig({
      searchParams: sp,
      mapping: null,
      configOverride: null,
      sd: {},
      hasQuery: true,
      showBadges: true,
      rankingBadges: true,
      animeRank: null,
      rankingResult: null,
      finalRank: null,
    })
    expect(config.badgeStyle).toBe("minimal")
  })
})

// La barra è un tspan a sé, posizionato da `dx` come il bullet: la riga non
// viene riordinata dall'algoritmo bidi, quindi in ebraico cade dove cade in
// italiano. Se un giorno il separatore finisse dentro al tspan del testo,
// questo test si accorge del cambio prima che il geresh-bug si ripeta.
describe("minimal separator in a Hebrew line", () => {
  const HE_GENRE = "\u05e4\u05e2\u05d5\u05dc\u05d4"
  function slots(svg: string): string[] {
    return (svg.match(/<tspan[^>]*>([^<]*)<\/tspan>/g) || [])
      // Via i caratteri di formattazione bidi: sono a larghezza zero e qui
      // interessa solo l'ordine dei segmenti.
      .map((t) => t.replace(/<[^>]+>/g, "").replace(/[\u2066-\u2069\u200E\u200F]/g, ""))
  }

  it("puts the pipe exactly where the bullet goes", () => {
    const minimal = slots(buildGenreTextSvg(HE_GENRE, "8.5", "2024", 28, "#fff", "minimal").svg)
    const bullet = slots(buildGenreTextSvg(HE_GENRE, "8.5", "2024", 28, "#fff", "shadow").svg)

    expect(minimal.map((s) => (s === "|" ? "SEP" : s)))
      .toEqual(bullet.map((s) => (s === "\u2022" ? "SEP" : s)))
    expect(minimal[0]).toBe(HE_GENRE)
    expect(minimal[1]).toBe("|")
  })
})
