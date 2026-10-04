import fs from "node:fs"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_HEBREW_FONT,
  HEBREW_FONTS,
  HEBREW_FONT_FAMILY,
  hebrewFontOf,
  isHebrewFont,
  latinFontOf,
  normalizeBadgeFontSpec,
  withHebrewFont,
} from "../lib/badge-styles"
import { buildGenreTextSvg, buildTitleTextSvg, estimateTextWidth, fontFamilyFor } from "../lib/badge-svg-shared"
import { FONT_FILES, HEBREW_FONT_FILES, fontFilesFor } from "../lib/fonts"
import { buildNetflixRankBadgeSVG, renderGenreBadge, renderTitleText } from "../lib/svg-badge"
import { resolvePosterRenderConfig } from "../lib/poster-config"
import { normalizePosterCacheParams } from "../lib/poster-runtime-cache"
import { buildDefaultsPreviewUrl } from "../lib/poster-url"
import { buildStremioPosterSearchParams } from "../lib/stremio-poster-params"

function resolve(hfont: string | null, extra?: { configFont?: string | null; sdFont?: string | null }) {
  return resolvePosterRenderConfig({
    searchParams: new URLSearchParams(hfont === null ? "" : `hfont=${hfont}`),
    mapping: null,
    configOverride: extra?.configFont !== undefined ? ({ hebrewFont: extra.configFont } as never) : null,
    sd: extra?.sdFont !== undefined ? { hebrewFont: extra.sdFont as never } : {},
    hasQuery: true,
    showBadges: true,
    rankingBadges: true,
    animeRank: null,
    rankingResult: null,
    finalRank: null,
  })
}

/** Larghezza dell'inchiostro di un PNG (colonne con alpha > 0). */
async function inkWidth(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let min = info.width
  let max = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! > 40) {
        if (x < min) min = x
        if (x > max) max = x
      }
    }
  }
  return max < 0 ? 0 : max - min + 1
}

describe("Hebrew font contract (hfont)", () => {
  it("closed list with Rubik as default", () => {
    expect(HEBREW_FONTS).toEqual(["rubik", "heebo", "karantina", "secular-one", "frank-ruhl-libre"])
    expect(DEFAULT_HEBREW_FONT).toBe("rubik")
    expect(isHebrewFont("heebo")).toBe(true)
    expect(isHebrewFont("Heebo")).toBe(false)
    expect(isHebrewFont("david")).toBe(false)
    expect(isHebrewFont(null)).toBe(false)
  })

  it("the font spec stays the bare badge font with Rubik", () => {
    expect(withHebrewFont("oswald", "rubik")).toBe("oswald")
    expect(withHebrewFont("oswald", null)).toBe("oswald")
    expect(withHebrewFont("oswald", "heebo")).toBe("oswald+heebo")
    expect(latinFontOf("oswald+heebo")).toBe("oswald")
    expect(hebrewFontOf("oswald+heebo")).toBe("heebo")
    expect(hebrewFontOf("oswald")).toBe("rubik")
    expect(normalizeBadgeFontSpec("bogus+karantina")).toBe("inter+karantina")
    expect(normalizeBadgeFontSpec("oswald+bogus")).toBe("oswald")
    expect(normalizeBadgeFontSpec(null)).toBe("inter")
  })

  it("Hebrew text takes the chosen family; Latin and Arabic do not", () => {
    for (const f of HEBREW_FONTS) {
      expect(fontFamilyFor("מדע בדיוני", withHebrewFont("inter", f))).toBe(HEBREW_FONT_FAMILY[f])
    }
    expect(fontFamilyFor("Drama", "oswald+heebo")).toBe("Oswald")
    expect(fontFamilyFor("Drama", "inter+karantina")).toBe("Inter")
    // Queste famiglie non hanno glifi arabi: l'arabo resta in Rubik.
    expect(fontFamilyFor("دراما", "inter+heebo")).toBe("Rubik")
    expect(fontFamilyFor("מדע בדיוני")).toBe("Rubik")
  })

  it("width estimates follow the measured Hebrew advance", () => {
    const rubik = estimateTextWidth("מדע בדיוני", 100)
    expect(estimateTextWidth("מדע בדיוני", 100, "inter+karantina")).toBe(Math.round(rubik * 0.635))
    expect(estimateTextWidth("מדע בדיוני", 100, "inter+heebo")).toBe(Math.round(rubik * 1.01))
    // Il latino ignora la parte ebraica.
    expect(estimateTextWidth("Action", 28, "oswald+karantina")).toBe(estimateTextWidth("Action", 28, "oswald"))
  })

  it("the default SVG is byte-identical; a chosen font changes only the family", () => {
    const base = buildGenreTextSvg("מדע בדיוני", "8.7", "2024", 24, "#fff", "shadow")
    expect(buildGenreTextSvg("מדע בדיוני", "8.7", "2024", 24, "#fff", "shadow", 0, undefined, undefined, withHebrewFont("inter", "rubik")).svg).toBe(base.svg)
    const heebo = buildGenreTextSvg("מדע בדיוני", "8.7", "2024", 24, "#fff", "shadow", 0, undefined, undefined, "inter+heebo")
    expect(heebo.svg).toContain('font-family="Heebo"')
    expect(heebo.svg).not.toContain('font-family="Rubik"')
    const title = buildTitleTextSvg("שובר שורות", 300, 30, "#fff", undefined, "inter+frank-ruhl-libre")
    expect(title?.svg).toContain('font-family="Frank Ruhl Libre"')
    const ribbon = buildNetflixRankBadgeSVG(1, 500, false, "left", false, "היום", { top: "טופ" }, "inter+secular-one")
    expect(JSON.stringify(ribbon)).toContain("Secular One")
  })

  it("resvg loads a Hebrew family only when the SVG asks for it", () => {
    for (const files of Object.values(HEBREW_FONT_FILES)) {
      for (const file of files) expect(fs.existsSync(file)).toBe(true)
    }
    expect(fontFilesFor('<text font-family="Rubik">א</text>')).toEqual([...FONT_FILES])
    const withHeebo = fontFilesFor('<text font-family="Heebo">א</text>')
    expect(withHeebo).toEqual([...FONT_FILES, ...HEBREW_FONT_FILES.Heebo!])
  })

  it("every family really draws: Karantina is narrower than Rubik, all have ink", async () => {
    const widths: Record<string, number> = {}
    for (const f of HEBREW_FONTS) {
      const badge = await renderTitleText("מדע בדיוני ופנטזיה", 600, 40, "#ffffff", undefined, withHebrewFont("inter", f))
      expect(badge).not.toBeNull()
      widths[f] = await inkWidth(badge!.png)
      expect(widths[f]).toBeGreaterThan(50)
    }
    expect(widths.karantina!).toBeLessThan(widths.rubik! * 0.8)
  })

  it("genre badges render in every Hebrew font", async () => {
    for (const f of HEBREW_FONTS) {
      const badge = await renderGenreBadge("דרמה", 7.9, 380, "2025", "pill", undefined, false, undefined, 100, undefined, withHebrewFont("oswald", f))
      expect(badge.png).toBeInstanceOf(Buffer)
      expect(badge.w).toBeGreaterThan(0)
    }
  })

  it("precedence: query > config token > server defaults > Rubik; invalid → Rubik", () => {
    expect(resolve(null).hebrewFont).toBe("rubik")
    expect(resolve(null, { sdFont: "heebo" }).hebrewFont).toBe("heebo")
    expect(resolve(null, { configFont: "karantina", sdFont: "heebo" }).hebrewFont).toBe("karantina")
    expect(resolve("frank-ruhl-libre", { configFont: "karantina", sdFont: "heebo" }).hebrewFont).toBe("frank-ruhl-libre")
    expect(resolve("rubik", { sdFont: "heebo" }).hebrewFont).toBe("rubik")
    expect(resolve("david", { sdFont: "heebo" }).hebrewFont).toBe("rubik")
  })

  it("cache key keeps hfont, and an invalid value collapses onto Rubik", () => {
    expect(normalizePosterCacheParams(new URLSearchParams("hfont=heebo")).get("hfont")).toBe("heebo")
    expect(normalizePosterCacheParams(new URLSearchParams("hfont=david")).get("hfont")).toBe("rubik")
    expect(normalizePosterCacheParams(new URLSearchParams("")).get("hfont")).toBeNull()
  })

  it("Stremio URLs add hfont only when it is not Rubik; previews always carry it", () => {
    expect(buildStremioPosterSearchParams({}).get("hfont")).toBeNull()
    expect(buildStremioPosterSearchParams({ hebrewFont: "rubik" }).get("hfont")).toBeNull()
    expect(buildStremioPosterSearchParams({ hebrewFont: "karantina" }).get("hfont")).toBe("karantina")
    expect(buildDefaultsPreviewUrl({ defaultHebrewFont: "secular-one" })).toContain("hfont=secular-one")
    expect(buildDefaultsPreviewUrl({})).toContain("hfont=rubik")
  })
})
