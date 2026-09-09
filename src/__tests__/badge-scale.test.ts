import { describe, expect, it } from "vitest"
import { badgeScaleFactor, buildExtraBadgeSVG, buildGenreBadgeSVG } from "@/lib/svg-badge"

describe("badgeScaleFactor", () => {
  it("treats 100 as the untouched default", () => {
    expect(badgeScaleFactor(100)).toBe(1)
  })

  it("clamps out-of-range values instead of trusting them", () => {
    // Un token vecchio o una query manomessa non deve produrre un badge
    // grande quanto il poster né invisibile.
    expect(badgeScaleFactor(9999)).toBe(2)
    expect(badgeScaleFactor(-50)).toBe(0.5)
    expect(badgeScaleFactor(undefined)).toBe(1)
    expect(badgeScaleFactor(NaN)).toBe(1)
  })
})

describe("scale actually reaches the rendered badge", () => {
  it("makes the bottom line bigger and smaller when there is room", async () => {
    const base = (await buildGenreBadgeSVG("War", 8, 500, undefined, "pill", "#336699", false, { showYear: false }, 100))!
    const big = (await buildGenreBadgeSVG("War", 8, 500, undefined, "pill", "#336699", false, { showYear: false }, 160))!
    const small = (await buildGenreBadgeSVG("War", 8, 500, undefined, "pill", "#336699", false, { showYear: false }, 60))!
    expect(big.h).toBeGreaterThan(base.h)
    expect(small.h).toBeLessThan(base.h)
  })

  it("lets the width fit override the scale on a long line", async () => {
    // Il badge genere si rimpicciolisce da solo per stare in `pw * 0.86`.
    // Con una riga lunga quel vincolo vince sullo scale: alzarlo non può
    // sfondare il poster. È voluto, ma va saputo.
    const base = (await buildGenreBadgeSVG("Action & Adventure", 8.5, 500, "2024", "pill", "#336699", false, undefined, 100))!
    const big = (await buildGenreBadgeSVG("Action & Adventure", 8.5, 500, "2024", "pill", "#336699", false, undefined, 200))!
    expect(big.w).toBeLessThanOrEqual(500)
    expect(big.h).toBe(base.h)
  })

  it("makes the top badge bigger and smaller", async () => {
    const base = (await buildExtraBadgeSVG("New season", 500, false, "pill", "#336699", 100))!
    const big = (await buildExtraBadgeSVG("New season", 500, false, "pill", "#336699", 160))!
    const small = (await buildExtraBadgeSVG("New season", 500, false, "pill", "#336699", 60))!
    expect(big.h).toBeGreaterThan(base.h)
    expect(small.h).toBeLessThan(base.h)
  })

  it("defaults to the base size when no scale is passed", async () => {
    const implicit = (await buildGenreBadgeSVG("Action", 8, 500, "2024", "pill", "#336699", false))!
    const explicit = (await buildGenreBadgeSVG("Action", 8, 500, "2024", "pill", "#336699", false, undefined, 100))!
    expect(implicit.h).toBe(explicit.h)
    expect(implicit.w).toBe(explicit.w)
  })
})
