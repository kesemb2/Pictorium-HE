import { describe, expect, it } from "vitest"
import { buildExtraBadgeSVG, buildGenreBadgeSVG } from "@/lib/svg-badge"

// La scala non agisce più sul font di tutti gli stili: la barra scala
// nativamente (font + padding, così resta full-width senza staccarsi dai
// bordi), mentre gli stili compatti vengono ridimensionati a valle come
// bitmap in poster-service. Qui si verifica la metà nativa.
describe("scale reaches the rendered bar badge", () => {
  it("makes the bottom bar bigger and smaller", async () => {
    const base = (await buildGenreBadgeSVG("War", 8, 500, undefined, "bar", "#336699", false, { showYear: false }, 100))!
    const big = (await buildGenreBadgeSVG("War", 8, 500, undefined, "bar", "#336699", false, { showYear: false }, 160))!
    const small = (await buildGenreBadgeSVG("War", 8, 500, undefined, "bar", "#336699", false, { showYear: false }, 60))!
    expect(big.h).toBeGreaterThan(base.h)
    expect(small.h).toBeLessThan(base.h)
  })

  it("makes the top bar bigger and smaller", async () => {
    const base = (await buildExtraBadgeSVG("New season", 500, false, "bar", "#336699", 100))!
    const big = (await buildExtraBadgeSVG("New season", 500, false, "bar", "#336699", 160))!
    const small = (await buildExtraBadgeSVG("New season", 500, false, "bar", "#336699", 60))!
    expect(big.h).toBeGreaterThan(base.h)
    expect(small.h).toBeLessThan(base.h)
  })

  it("leaves the compact styles to the bitmap resize downstream", async () => {
    const base = (await buildGenreBadgeSVG("War", 8, 500, undefined, "pill", "#336699", false, { showYear: false }, 100))!
    const big = (await buildGenreBadgeSVG("War", 8, 500, undefined, "pill", "#336699", false, { showYear: false }, 160))!
    expect(big.h).toBe(base.h)
    expect(big.w).toBe(base.w)
  })

  it("defaults to the base size when no scale is passed", async () => {
    const implicit = (await buildGenreBadgeSVG("Action", 8, 500, "2024", "pill", "#336699", false))!
    const explicit = (await buildGenreBadgeSVG("Action", 8, 500, "2024", "pill", "#336699", false, undefined, 100))!
    expect(implicit.h).toBe(explicit.h)
    expect(implicit.w).toBe(explicit.w)
  })
})
