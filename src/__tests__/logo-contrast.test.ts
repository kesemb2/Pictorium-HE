import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
  LOGO_CONTRAST_MIN,
  LOGO_SCRIM_MAX,
  buildLogoScrim,
  logoContrast,
  logoInkLuminance,
  logoInkProfile,
  logoScrimStrength,
  posterLogoZoneLuminance,
} from "@/lib/logo-contrast"
import { applyBlur } from "@/lib/blur"
import { selectLogoTier, pickReadableLogo } from "@/lib/logo-selection"
import type { TMDBImage } from "@/lib/types"

/** Logo: barra piena del colore dato su un canvas per il resto trasparente. */
async function logo(hex: string): Promise<Buffer> {
  const bar = await sharp({ create: { width: 300, height: 60, channels: 4, background: hex } }).png().toBuffer()
  return sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bar, top: 70, left: 50 }])
    .png().toBuffer()
}

async function poster(hex: string): Promise<Buffer> {
  return sharp({ create: { width: 500, height: 750, channels: 3, background: hex } }).jpeg().toBuffer()
}

const ZONE = { left: 0, top: 390, width: 500, height: 195 }

describe("logoInkLuminance", () => {
  // Un logo è quasi tutto trasparente: la media su TUTTA l'immagine misurerebbe
  // il nulla e darebbe lo stesso valore per un logo bianco e uno nero.
  it("measures the ink, not the transparent canvas", async () => {
    const white = await logoInkLuminance(await logo("#ffffff"))
    const black = await logoInkLuminance(await logo("#000000"))
    expect(white).toBeGreaterThan(0.8)
    expect(black).toBeLessThan(0.05)
  }, 20000)

  it("returns null when there is not enough ink to judge", async () => {
    const empty = await sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png().toBuffer()
    expect(await logoInkLuminance(empty)).toBeNull()
  }, 20000)

  it("returns null instead of throwing on a non-image", async () => {
    expect(await logoInkLuminance(Buffer.from("not an image"))).toBeNull()
  })
})

describe("logoInkProfile", () => {
  // logoInkLuminance legge da qui: se i due divergessero, il path poster si
  // muoverebbe per una modifica pensata solo per il path logo.
  it("carries the same luminance logoInkLuminance reports", async () => {
    for (const hex of ["#ffffff", "#000000", "#c81e1e"]) {
      const buf = await logo(hex)
      expect((await logoInkProfile(buf))!.luminance).toBe(await logoInkLuminance(buf))
    }
  }, 20000)

  it("calls a flat black logo flat and a coloured one not", async () => {
    expect((await logoInkProfile(await logo("#000000")))!.flatBlack).toBe(true)
    expect((await logoInkProfile(await logo("#232323")))!.flatBlack).toBe(true)
    expect((await logoInkProfile(await logo("#c81e1e")))!.flatBlack).toBe(false)
    expect((await logoInkProfile(await logo("#ffffff")))!.flatBlack).toBe(false)
  }, 20000)

  it("returns null on an empty or unreadable buffer", async () => {
    const empty = await sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png().toBuffer()
    expect(await logoInkProfile(empty)).toBeNull()
    expect(await logoInkProfile(Buffer.from("not an image"))).toBeNull()
  }, 20000)
})

describe("logoContrast", () => {
  it("is low for a white logo on a bright poster", async () => {
    const ink = await logoInkLuminance(await logo("#ffffff"))
    const zone = await posterLogoZoneLuminance(await poster("#e8e4dd"), ZONE)
    expect(logoContrast(ink, zone)).toBeLessThan(LOGO_CONTRAST_MIN)
  }, 20000)

  it("is high for a white logo on a dark poster", async () => {
    const ink = await logoInkLuminance(await logo("#ffffff"))
    const zone = await posterLogoZoneLuminance(await poster("#101014"), ZONE)
    expect(logoContrast(ink, zone)).toBeGreaterThan(10)
  }, 20000)

  // Non misurabile deve significare "non intervenire": inventare un valore
  // basso farebbe comparire velature su poster che non ne hanno bisogno.
  it("reports the threshold when either side is unmeasurable", () => {
    expect(logoContrast(null, 0.2)).toBe(LOGO_CONTRAST_MIN)
    expect(logoContrast(0.9, null)).toBe(LOGO_CONTRAST_MIN)
  })
})

/**
 * La fascia sfocata finisce SOTTO al logo e SOPRA al poster. Misurare la zona
 * sul poster nudo dava la risposta giusta a una domanda che nessuno ha fatto:
 * quello che il logo vedrà è il poster CON la fascia sopra.
 */
describe("posterLogoZoneLuminance con la fascia", () => {
  async function band(posterHex: string, blurDarkness = 70) {
    return applyBlur({
      posterBuf: await poster(posterHex),
      blurEnabled: true,
      blurHeight: 50,
      blurIntensity: 8,
      blurFade: 20,
      blurDarkness,
    })
  }

  it("reads darker on a bright poster once the band is over it", async () => {
    const buf = await poster("#f2f0ec")
    const bare = await posterLogoZoneLuminance(buf, ZONE)
    const covered = await posterLogoZoneLuminance(buf, ZONE, await band("#f2f0ec"))
    expect(bare).not.toBeNull()
    expect(covered).not.toBeNull()
    expect(covered!).toBeLessThan(bare! * 0.5)
  }, 20000)

  it("stops painting a halo under a white logo the band has already made readable", async () => {
    // Bianco su poster chiaro misura contrasto bassissimo e riceve una velatura
    // NERA. Ma la fascia ha già scurito quella zona: l'alone era di troppo.
    const ink = await logoInkLuminance(await logo("#ffffff"))
    const buf = await poster("#e8e4dd")

    const bare = logoContrast(ink, await posterLogoZoneLuminance(buf, ZONE))
    const covered = logoContrast(ink, await posterLogoZoneLuminance(buf, ZONE, await band("#e8e4dd", 40)))

    expect(logoScrimStrength(bare)).toBeGreaterThan(0.3)
    expect(covered).toBeGreaterThan(bare)
    // Quel che resta è sotto il 2% di alpha: nessun alone visibile.
    expect(logoScrimStrength(covered)).toBeLessThan(0.02)
  }, 20000)

  it("asks for a scrim under a dark logo where a strong band swallows it", async () => {
    // L'altra direzione: nero su bianco misura contrasto altissimo e non riceve
    // niente, poi la fascia scurisce la zona e il logo sparisce sul fondo.
    const ink = await logoInkLuminance(await logo("#0a0a0a"))
    const buf = await poster("#f2f0ec")

    const bare = logoContrast(ink, await posterLogoZoneLuminance(buf, ZONE))
    const covered = logoContrast(ink, await posterLogoZoneLuminance(buf, ZONE, await band("#f2f0ec", 85)))

    expect(bare).toBeGreaterThan(LOGO_CONTRAST_MIN)
    expect(logoScrimStrength(bare)).toBe(0)
    expect(covered).toBeLessThan(LOGO_CONTRAST_MIN)
    expect(logoScrimStrength(covered)).toBeGreaterThan(0)
  }, 20000)

  it("is identical to the historic reading when no band is passed", async () => {
    const buf = await poster("#3a4d66")
    expect(await posterLogoZoneLuminance(buf, ZONE, null)).toBe(await posterLogoZoneLuminance(buf, ZONE))
  }, 20000)

  it("ignores a band that does not reach the logo zone", async () => {
    const buf = await poster("#f2f0ec")
    const highUp = { left: 0, top: 10, width: 500, height: 120 }
    const bare = await posterLogoZoneLuminance(buf, highUp)
    const covered = await posterLogoZoneLuminance(buf, highUp, await band("#f2f0ec"))
    expect(covered).toBeCloseTo(bare!, 5)
  }, 20000)
})

describe("logoScrimStrength", () => {
  it("paints nothing at or above the threshold", () => {
    expect(logoScrimStrength(LOGO_CONTRAST_MIN)).toBe(0)
    expect(logoScrimStrength(12)).toBe(0)
    expect(logoScrimStrength(NaN)).toBe(0)
  })

  it("grows as the contrast falls short, and stays bounded", () => {
    const mild = logoScrimStrength(2.5)
    const severe = logoScrimStrength(1.05)
    expect(mild).toBeGreaterThan(0)
    expect(severe).toBeGreaterThan(mild)
    expect(severe).toBeLessThanOrEqual(LOGO_SCRIM_MAX)
  })
})

describe("buildLogoScrim", () => {
  it("returns null when no scrim is needed", async () => {
    expect(await buildLogoScrim(200, 80, 0, true)).toBeNull()
  })

  it("is larger than the logo so the fade dies outside its edges", async () => {
    const png = await buildLogoScrim(200, 80, 0.4, true)
    const meta = await sharp(png!).metadata()
    expect(meta.width).toBeGreaterThan(200)
    expect(meta.height).toBeGreaterThan(80)
  }, 20000)

  // Un logo scuro su poster scuro va SCHIARITO: velarlo di nero lo nasconderebbe
  // ancora di più.
  it("darkens under a light logo and lightens under a dark one", async () => {
    const forLight = await sharp((await buildLogoScrim(200, 80, 0.5, true))!).raw().toBuffer({ resolveWithObject: true })
    const forDark = await sharp((await buildLogoScrim(200, 80, 0.5, false))!).raw().toBuffer({ resolveWithObject: true })
    const centre = (r: { data: Buffer; info: { width: number; height: number; channels: number } }) => {
      const i = ((Math.floor(r.info.height / 2) * r.info.width) + Math.floor(r.info.width / 2)) * r.info.channels
      return r.data[i]
    }
    expect(centre(forLight)).toBeLessThan(centre(forDark))
  }, 20000)
})

const L = (lang: string | null, path: string): TMDBImage => ({
  file_path: path, iso_639_1: lang, width: 800, height: 310, vote_average: 0,
})

describe("selectLogoTier", () => {
  // La lingua decide da sola quale gruppo si usa: un logo nella lingua giusta
  // non deve perdere contro uno inglese solo perché contrasta meglio.
  it("returns every logo of the winning language, not just the first", () => {
    const tier = selectLogoTier([L("he", "/a"), L("en", "/b"), L("he", "/c")], "he", "en")
    expect(tier.map((l) => l.file_path)).toEqual(["/a", "/c"])
  })

  it("falls through language tiers in order", () => {
    expect(selectLogoTier([L("en", "/b"), L("ja", "/c")], "he", "ja").map((l) => l.file_path)).toEqual(["/b"])
    expect(selectLogoTier([L("ja", "/c"), L("fr", "/d")], "he", "ja").map((l) => l.file_path)).toEqual(["/c"])
    expect(selectLogoTier([L("fr", "/d")], "he", "ja").map((l) => l.file_path)).toEqual(["/d"])
  })

  it("is empty when there are no logos", () => {
    expect(selectLogoTier([], "he", "en")).toEqual([])
  })
})

describe("pickReadableLogo", () => {
  it("prefers the highest-contrast candidate in the tier", async () => {
    const tier = [L("he", "/dim"), L("he", "/bright")]
    const got = await pickReadableLogo(tier, async (l) => (l.file_path === "/bright" ? 9 : 1.2))
    expect(got?.file_path).toBe("/bright")
  })

  it("keeps the first when nothing can be measured", async () => {
    const tier = [L("he", "/a"), L("he", "/b")]
    expect((await pickReadableLogo(tier, async () => null))?.file_path).toBe("/a")
  })

  it("does not measure a single candidate at all", async () => {
    let calls = 0
    const got = await pickReadableLogo([L("he", "/only")], async () => { calls++; return 1 })
    expect(got?.file_path).toBe("/only")
    expect(calls).toBe(0)
  })
})
