import { describe, expect, it } from "vitest"
import { POSTER_CACHE_ALLOWLIST } from "@/lib/poster-params-hardening"
import { buildStremioPosterSearchParams } from "@/lib/stremio-poster-params"

/**
 * Ogni parametro che il builder degli URL Stremio può emettere deve entrare
 * nella chiave di cache: `normalizePosterCacheParams` scarta in silenzio quelli
 * fuori da POSTER_CACHE_ALLOWLIST, e due poster che differiscono solo in un
 * parametro scartato condividerebbero la stessa entry (si serve quello
 * sbagliato). Un nuovo parametro del fork senza voce in allowlist fallisce qui.
 */

// Tolti di proposito dalla chiave, a valle dell'allowlist (versioni URL).
const DROPPED_BY_DESIGN = new Set(["rv", "v"])

describe("POSTER_CACHE_ALLOWLIST covers emitted params", () => {
  it("includes every param buildStremioPosterSearchParams can emit", () => {
    const params = buildStremioPosterSearchParams({
      tmdbKey: "k",
      lang: "he",
      accentDominant: false,
      badgeTopScale: 120,
      badgeBottomScale: 80,
      badgeTopOffset: 10,
      badgeBottomOffset: -10,
      logoBottomOffset: 5,
      textOpacity: 90,
      textShadowOpacity: 80,
      textShadowBlur: 120,
      textShadowOffset: 110,
      ratingStar: false,
      autoDarkText: false,
      textHalo: false,
      topShade: 70,
      networkLogoPosition: "top",
    } as Parameters<typeof buildStremioPosterSearchParams>[0])
    const missing = [...params.keys()].filter((k) => !POSTER_CACHE_ALLOWLIST.has(k) && !DROPPED_BY_DESIGN.has(k))
    expect(missing).toEqual([])
  })

  it("includes the fork's title-under-logo preview flag", () => {
    expect(POSTER_CACHE_ALLOWLIST.has("title")).toBe(true)
    expect(POSTER_CACHE_ALLOWLIST.has("tul")).toBe(true)
  })
})
