import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { DEFAULT_POSTER_STYLE, POSTER_STYLES, isPosterStyle } from "@/lib/badge-styles"
import { composeTagStyle, tagLabelFor, tagScale } from "@/lib/tag-style"
import { generatePosterBuffer, type GenerationInput, type ReadabilityReport } from "@/lib/poster-service"
import { resolvePosterRenderConfig } from "@/lib/poster-config"
import { normalizePosterCacheParams } from "@/lib/poster-runtime-cache"
import { buildStremioPosterSearchParams } from "@/lib/stremio-poster-params"
import { buildDefaultsPreviewUrl } from "@/lib/poster-url"

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

async function render(opts: { posterStyle?: "classic" | "tag"; extra?: string | null; logo?: boolean; report?: ReadabilityReport }): Promise<Buffer> {
  return generatePosterBuffer({
    posterBuf: await poster((x, y) => Math.round(120 + 90 * Math.sin(x / 9) * Math.cos(y / 13))),
    logoFetch: opts.logo === false ? null : await whiteLogo(),
    backdropFetch: null, backdropScale: 100, backdropOffsetX: 0, backdropOffsetY: 0,
    blurEnabled: true, blurHeight: 30, blurIntensity: 20, blurFade: 50, blurDarkness: 30, tintStrength: 20, topShade: 50,
    badgesEnabled: true, rankingEnabled: true, genreName: "Drama", voteAverage: 7.9,
    badgeStyle: "shadow", rankingBadgeStyle: "default", badgeGenre: true, badgeYear: true, badgeRating: true,
    topLight: false, targetCenter: 65, ribbonSide: "left", logoScale: null, logoOffsetX: null, logoOffsetY: null,
    topBadgeScale: 100, topBadgeOffsetX: 0, topBadgeOffsetY: 0, genreBadgeScale: 100, genreBadgeOffsetX: 0, genreBadgeOffsetY: 0,
    qualityBadgeScale: 100, qualityBadgeOffsetX: 0, qualityBadgeOffsetY: 0, networkLogoScale: 100, networkLogoOffsetX: 0, networkLogoOffsetY: 0,
    autoDarkText: true, textHalo: true, readabilityReport: opts.report,
    posterStyle: opts.posterStyle, title: "כותרת", titleUnderLogo: opts.logo !== false,
    mediaType: "movie", finalRank: null, animeRankResult: null, rankingResult: null, mapping: null,
    tmdbNetworks: [], productionCompanies: [], tmdbStudios: [], tvType: null, tvStatus: null,
    releaseDate: "2024-01-01", firstAirDate: null, lastAirDate: null, seasonCount: null, originCountries: [],
    wikidataResult: { awards: [], nominations: [], studios: [], director: null, directorHe: null },
    tmdbKeywords: [], locale: "he", t: (k: string) => (k === "badge.top" ? "טופ" : k), qLabel: null,
    queryExtra: opts.extra ?? null, qNetLogo: null,
    networkLogo: false, sd: { networkLogo: false }, accentOverride: null, imdbTop250: false, preRelease: false,
  } as unknown as GenerationInput)
}

function resolve(pstyle: string | null, extra?: { configStyle?: string; sdStyle?: string; tfade?: string; sdFade?: boolean }) {
  const qs = new URLSearchParams()
  if (pstyle !== null) qs.set("pstyle", pstyle)
  if (extra?.tfade !== undefined) qs.set("tfade", extra.tfade)
  return resolvePosterRenderConfig({
    searchParams: qs,
    mapping: null,
    configOverride: extra?.configStyle !== undefined ? ({ posterStyle: extra.configStyle } as never) : null,
    sd: { posterStyle: extra?.sdStyle as never, tagFade: extra?.sdFade },
    hasQuery: true, showBadges: true, rankingBadges: true, animeRank: null, rankingResult: null, finalRank: null,
  })
}

describe("tag poster style", () => {
  it("has a closed style list with classic as default", () => {
    expect(POSTER_STYLES).toEqual(["classic", "tag"])
    expect(DEFAULT_POSTER_STYLE).toBe("classic")
    expect(isPosterStyle("tag")).toBe(true)
    expect(isPosterStyle("Tag")).toBe(false)
  })

  it("builds the tag text from the top badge, and none without one", () => {
    expect(tagLabelFor(null, "טופ")).toBeNull()
    expect(tagLabelFor({ type: "extra", label: "עונה חדשה" }, "טופ")).toBe("עונה חדשה")
    expect(tagLabelFor({ type: "extra", label: "  " }, "טופ")).toBeNull()
    expect(tagLabelFor({ type: "rank", rank: 3, label: "Top 10", ribbonLabel: "היום" }, "טופ")).toBe("טופ 3 · היום")
    expect(tagLabelFor({ type: "rank", rank: 3, label: "Top 10" }, "טופ")).toBe("טופ 3")
  })

  it("scales with the canvas", () => {
    expect(tagScale(500, 750)).toBe(1)
    expect(tagScale(768, 432)).toBeCloseTo(0.72, 2)
  })

  it("puts the card above the tag, and no tag without a label", async () => {
    const base = await poster(() => 128)
    const logo = { input: await sharp({ create: { width: 200, height: 60, channels: 4, background: "#fff" } }).png().toBuffer(), w: 200, h: 60, left: 150, top: 500 }
    const withTag = await composeTagStyle({ base, canvasW: W, canvasH: H, logo, title: null, tagLabel: "בכורה", fade: true })
    expect(withTag.tagRect).not.toBeNull()
    expect(withTag.tagRect!.top + withTag.tagRect!.height).toBe(H)
    expect(withTag.logoTop! + 60).toBeLessThan(withTag.tagRect!.top)
    const noTag = await composeTagStyle({ base, canvasW: W, canvasH: H, logo, title: null, tagLabel: null, fade: false })
    expect(noTag.tagRect).toBeNull()
    expect(noTag.logoTop! + 60).toBeGreaterThan(withTag.logoTop! + 60)
  })

  it("without the card: same logo position, no card glass, fade forced on", async () => {
    const base = await poster(() => 128)
    const logo = { input: await sharp({ create: { width: 200, height: 60, channels: 4, background: "#fff" } }).png().toBuffer(), w: 200, h: 60, left: 150, top: 500 }
    const withCard = await composeTagStyle({ base, canvasW: W, canvasH: H, logo, title: null, tagLabel: "בכורה", fade: false })
    const noCard = await composeTagStyle({ base, canvasW: W, canvasH: H, logo, title: null, tagLabel: "בכורה", fade: false, card: false })
    expect(noCard.logoTop).toBe(withCard.logoTop)
    // Con card e senza dissolvenza: card + tag + logo + testo. Senza card la
    // dissolvenza entra comunque (prima, a tutta tela) e la card sparisce.
    expect(withCard.layers.some((l) => l.top === 0 && l.left === 0)).toBe(false)
    expect(noCard.layers[0]!.top).toBe(0)
    expect(noCard.layers.length).toBe(withCard.layers.length)
  })

  it("in landscape centres the logo on the tag axis, whatever the classic alignment", async () => {
    const base = await sharp({ create: { width: 768, height: 432, channels: 3, background: "#808080" } }).png().toBuffer()
    const logoPng = await sharp({ create: { width: 200, height: 60, channels: 4, background: "#fff" } }).png().toBuffer()
    const out = await composeTagStyle({ base, canvasW: 768, canvasH: 432, logo: { input: logoPng, w: 200, h: 60, left: 36, top: 300 }, title: null, tagLabel: "בכורה", fade: true, card: false })
    const logoLayer = out.layers.find((l) => l.input === logoPng)!
    expect(logoLayer.left).toBe(284)
    expect(out.tagRect!.left + out.tagRect!.width / 2).toBeCloseTo(384, -1)
  })

  it("a tag render reports the tag and lifts the logo above it", async () => {
    const report: ReadabilityReport = {}
    const buf = await render({ posterStyle: "tag", extra: "עונה חדשה", report })
    expect(report.tag?.label).toBe("עונה חדשה")
    expect(report.tag?.logoTop).toBeGreaterThan(400)
    // Niente fascia nello stile tag.
    expect(report.band?.final).toBe(0)
    expect((await sharp(buf).metadata()).width).toBe(W)
  })

  it("classic is untouched: same bytes with the style absent or explicit", async () => {
    const a = await render({ extra: "עונה חדשה" })
    const b = await render({ posterStyle: "classic", extra: "עונה חדשה" })
    expect(a.equals(b)).toBe(true)
    const c = await render({ posterStyle: "tag", extra: "עונה חדשה" })
    expect(a.equals(c)).toBe(false)
  })

  it("resolves query > config token > server defaults > classic, and the fade", () => {
    expect(resolve(null).posterStyle).toBe("classic")
    expect(resolve(null, { sdStyle: "tag" }).posterStyle).toBe("tag")
    expect(resolve(null, { configStyle: "classic", sdStyle: "tag" }).posterStyle).toBe("classic")
    expect(resolve("tag", { configStyle: "classic" }).posterStyle).toBe("tag")
    expect(resolve("bogus", { sdStyle: "tag" }).posterStyle).toBe("classic")
    expect(resolve(null).tagFade).toBe(true)
    expect(resolve(null, { sdFade: false }).tagFade).toBe(false)
    expect(resolve(null, { tfade: "1", sdFade: false }).tagFade).toBe(true)
  })

  it("cache keys and URLs: classic URLs unchanged, tag explicit", () => {
    expect(normalizePosterCacheParams(new URLSearchParams("pstyle=tag&tfade=0")).toString()).toBe("pstyle=tag&tfade=0")
    expect(normalizePosterCacheParams(new URLSearchParams("pstyle=x&tfade=9")).toString()).toBe("pstyle=classic&tfade=1")
    expect(buildStremioPosterSearchParams({}).get("pstyle")).toBeNull()
    expect(buildStremioPosterSearchParams({ posterStyle: "classic" }).get("pstyle")).toBeNull()
    const tag = buildStremioPosterSearchParams({ posterStyle: "tag", tagFade: false })
    expect(tag.get("pstyle")).toBe("tag")
    expect(tag.get("tfade")).toBe("0")
    expect(buildStremioPosterSearchParams({ posterStyle: "tag" }).get("tfade")).toBeNull()
    expect(buildDefaultsPreviewUrl({ defaultPosterStyle: "tag", defaultTagFade: false })).toContain("pstyle=tag")
    expect(buildDefaultsPreviewUrl({ defaultPosterStyle: "tag", defaultTagFade: false })).toContain("tfade=0")
    expect(buildStremioPosterSearchParams({ posterStyle: "tag", tagCard: false }).get("tcard")).toBe("0")
    expect(buildStremioPosterSearchParams({ posterStyle: "tag" }).get("tcard")).toBeNull()
    expect(buildStremioPosterSearchParams({ posterStyle: "classic", tagCard: false }).get("tcard")).toBeNull()
    expect(normalizePosterCacheParams(new URLSearchParams("tcard=x")).get("tcard")).toBe("1")
    expect(resolve(null).tagCard).toBe(true)
  })
})
