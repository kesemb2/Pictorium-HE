/**
 * Regole di leggibilità del fork che un merge upstream ha già sovrascritto in
 * silenzio (2/10: la velatura del logo era passata da 0.55 a 0.25 e nessun
 * test era diventato rosso). Se uno di questi test fallisce dopo un merge, il
 * valore va riportato a quello del fork, non il test aggiornato.
 */
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
  DARK_GLYPH_COLOR,
  LOGO_SCRIM_BOX_H,
  LOGO_SCRIM_BOX_W,
  LOGO_SCRIM_MAX,
  ZONE_BRIGHT_LUMINANCE,
  ZONE_BUSY_STDDEV,
  ZONE_FLAT_STDDEV,
  buildLogoScrim,
  logoScrimStrength,
  zoneTextTreatment,
} from "@/lib/logo-contrast"
import { generatePosterBuffer, type GenerationInput, type ReadabilityReport } from "@/lib/poster-service"
import { LOGO_BAND_REACH, MAX_LOGO_BAND_PCT, bandHeightForLogo } from "@/lib/poster-render-helpers"

const W = 500
const H = 750

async function poster(paint: (x: number, y: number) => number): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = paint(x, y)
      const i = (y * W + x) * 3
      raw[i] = v; raw[i + 1] = v; raw[i + 2] = v
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92 }).toBuffer()
}

async function whiteLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect x="20" y="30" width="560" height="120" rx="20" fill="#fafafa"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function render(posterBuf: Buffer, logoFetch: Buffer | null, blurEnabled: boolean, blurHeight = 45): Promise<ReadabilityReport> {
  const readabilityReport: ReadabilityReport = {}
  await generatePosterBuffer({
    posterBuf, logoFetch, backdropFetch: null, backdropScale: 100, backdropOffsetX: 0, backdropOffsetY: 0,
    blurEnabled, blurHeight, blurIntensity: 20, blurFade: 50, blurDarkness: 30, tintStrength: 20, topShade: 50,
    badgesEnabled: true, rankingEnabled: false, genreName: "Drama", voteAverage: 7.9,
    badgeStyle: "shadow", rankingBadgeStyle: "default", badgeGenre: true, badgeYear: true, badgeRating: true,
    topLight: false, targetCenter: 65, ribbonSide: "left", logoScale: null, logoOffsetX: null, logoOffsetY: null,
    topBadgeScale: 100, topBadgeOffsetX: 0, topBadgeOffsetY: 0, genreBadgeScale: 100, genreBadgeOffsetX: 0, genreBadgeOffsetY: 0,
    qualityBadgeScale: 100, qualityBadgeOffsetX: 0, qualityBadgeOffsetY: 0, networkLogoScale: 100, networkLogoOffsetX: 0, networkLogoOffsetY: 0,
    autoDarkText: true, textHalo: true, readabilityReport,
    mediaType: "movie", finalRank: null, animeRankResult: null, rankingResult: null, mapping: null,
    tmdbNetworks: [], productionCompanies: [], tmdbStudios: [], tvType: null, tvStatus: null,
    releaseDate: "2024-01-01", firstAirDate: null, lastAirDate: null, seasonCount: null, originCountries: [],
    wikidataResult: { awards: [], nominations: [], studios: [], director: null, directorHe: null },
    tmdbKeywords: [], locale: "he", t: (k: string) => k, qLabel: null, queryExtra: null, qNetLogo: null,
    networkLogo: false, sd: { networkLogo: false }, accentOverride: null, imdbTop250: false, preRelease: false,
  } as unknown as GenerationInput)
  return readabilityReport
}

describe("fork readability invariants", () => {
  it("keeps the fork's logo veil (upstream lowered it to 0.25 and shrank the box)", () => {
    expect(LOGO_SCRIM_MAX).toBe(0.55)
    expect(LOGO_SCRIM_BOX_W).toBe(1.35)
    expect(LOGO_SCRIM_BOX_H).toBe(1.8)
    // Contrasto quasi nullo → velatura al massimo del fork.
    expect(logoScrimStrength(1.0)).toBeCloseTo(0.55, 2)
  })

  it("the veil box is the fork's size", async () => {
    const png = (await buildLogoScrim(200, 100, 0.5, true, 500, 750))!
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(270)
    expect(meta.height).toBe(180)
  })

  it("keeps the zone thresholds", () => {
    expect(ZONE_BRIGHT_LUMINANCE).toBe(0.58)
    expect(ZONE_FLAT_STDDEV).toBe(28)
    expect(ZONE_BUSY_STDDEV).toBe(30)
    expect(DARK_GLYPH_COLOR).toBe("rgba(0,0,0,0.88)")
  })

  it("decides dark glyphs on a light flat zone and a halo on a busy one", () => {
    const opts = { darkText: true, halo: true }
    expect(zoneTextTreatment({ luminance: 0.85, stdDev: 6 }, opts).color).toBe(DARK_GLYPH_COLOR)
    expect(zoneTextTreatment({ luminance: 0.4, stdDev: 70 }, opts).halo).toBeGreaterThan(0)
    expect(zoneTextTreatment({ luminance: 0.2, stdDev: 5 }, opts).color).toBe("")
  })

  it("a full render applies them: dark text without the band, halo on busy art", async () => {
    const light = await render(await poster(() => 240), null, false)
    expect(light.meta?.dark).toBe(true)
    const busy = await render(await poster((x, y) => ((Math.floor(x / 14) + Math.floor(y / 9)) % 2 ? 235 : 28)), null, false)
    expect(busy.meta?.halo).toBeGreaterThan(0)
  })

  it("a full render veils a white logo on a light zone beyond upstream's 0.25", async () => {
    const report = await render(await poster((_, y) => (y < 300 ? 60 : 228)), await whiteLogo(), true)
    expect(report.logoScrim).toBeGreaterThan(0.25)
  })

  it("keeps the logo floor constants", () => {
    expect(LOGO_BAND_REACH).toBe(0.25)
    expect(MAX_LOGO_BAND_PCT).toBe(75)
    expect(bandHeightForLogo(null, 750)).toBe(0)
    // Logo da 500 a 600 su 750: fascia dalla y 475 → 37%.
    expect(bandHeightForLogo({ top: 500, height: 100 }, 750)).toBe(37)
    expect(bandHeightForLogo({ top: 10, height: 600 }, 750)).toBe(75)
  })

  it("with a logo the band covers it, even at a low height on busy art", async () => {
    const busy = await poster((x, y) => Math.round(120 + 90 * Math.sin(x / 9) * Math.cos(y / 13)))
    const report = await render(busy, await whiteLogo(), true, 20)
    const band = report.band!
    expect(band.requested).toBe(20)
    expect(band.logoTop).not.toBeNull()
    const bandTop = 750 - (750 * band.final) / 100
    expect(bandTop).toBeLessThanOrEqual(band.logoTop! - LOGO_BAND_REACH * band.logoH! + 1)
  })

  it("without a logo the band is exactly what the retreat left", async () => {
    const busy = await poster((x, y) => Math.round(120 + 90 * Math.sin(x / 9) * Math.cos(y / 13)))
    const band = (await render(busy, null, true, 30)).band!
    expect(band.logoTop).toBeNull()
    expect(band.final).toBe(band.retreated)
  })
})
