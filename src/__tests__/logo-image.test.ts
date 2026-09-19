import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
  LOGO_LIGHT_MIN_LUMINANCE,
  chooseLogo,
  composeLogoImage,
  inkLuminanceScorer,
  localizedTitle,
  whitenLogo,
} from "@/lib/logo-image"
import { logoInkLuminance } from "@/lib/logo-contrast"
import type { TMDBImage } from "@/lib/types"

/** Wordmark: una barra piena del colore dato su tela trasparente. */
async function wordmark(hex: string, w = 300, h = 80): Promise<Buffer> {
  const bar = await sharp({ create: { width: Math.round(w * 0.7), height: Math.round(h * 0.5), channels: 4, background: hex } }).png().toBuffer()
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bar, top: Math.round(h * 0.25), left: Math.round(w * 0.15) }])
    .png().toBuffer()
}

function img(path: string, lang: string | null): TMDBImage {
  return { file_path: path, iso_639_1: lang, width: 300, height: 80, vote_average: 0 }
}

/** Sorgente di loghi per path, così lo scorer misura inchiostro vero. */
function scorerFor(map: Record<string, Buffer>) {
  return inkLuminanceScorer(async (path) => {
    const b = map[path]
    if (!b) throw new Error(`no logo for ${path}`)
    return b
  })
}

describe("chooseLogo", () => {
  it("keeps a light Hebrew logo as it is", async () => {
    const map = { "/he-white.png": await wordmark("#ffffff"), "/en-white.png": await wordmark("#ffffff") }
    const choice = (await chooseLogo([img("/he-white.png", "he"), img("/en-white.png", "en")], "he", "en", scorerFor(map)))!

    expect(choice.logo.file_path).toBe("/he-white.png")
    expect(choice.whitened).toBe(false)
    expect(choice.needsTitle).toBe(false)
  })

  it("whitens a dark Hebrew logo rather than dropping to English", async () => {
    // Il punto della scala: la lingua non si perde per un problema di colore.
    const map = { "/he-black.png": await wordmark("#0a0a0a"), "/en-white.png": await wordmark("#ffffff") }
    const choice = (await chooseLogo([img("/he-black.png", "he"), img("/en-white.png", "en")], "he", "en", scorerFor(map)))!

    expect(choice.logo.file_path).toBe("/he-black.png")
    expect(choice.whitened).toBe(true)
    expect(choice.needsTitle).toBe(false)
  })

  it("prefers the lightest inside the Hebrew tier, since whitening loses colour", async () => {
    const map = {
      "/he-black.png": await wordmark("#111111"),
      "/he-white.png": await wordmark("#f8f8f8"),
    }
    const choice = (await chooseLogo([img("/he-black.png", "he"), img("/he-white.png", "he")], "he", "en", scorerFor(map)))!

    expect(choice.logo.file_path).toBe("/he-white.png")
    expect(choice.whitened).toBe(false)
  })

  it("falls to English and asks for the title when there is no Hebrew logo", async () => {
    const map = { "/en-white.png": await wordmark("#ffffff") }
    const choice = (await chooseLogo([img("/en-white.png", "en")], "he", "en", scorerFor(map)))!

    expect(choice.logo.file_path).toBe("/en-white.png")
    expect(choice.needsTitle).toBe(true)
  })

  it("returns null when there is no logo at all — the caller answers 404", async () => {
    expect(await chooseLogo([], "he", "en", scorerFor({}))).toBeNull()
  })

  it("leaves a logo it cannot measure alone", async () => {
    // Non misurabile non significa scuro: sbiancare per un errore di lettura
    // distruggerebbe un logo che stava bene.
    const choice = (await chooseLogo([img("/broken.png", "he")], "he", "en", scorerFor({})))!
    expect(choice.whitened).toBe(false)
  })

  it("agrees with the threshold it documents", async () => {
    expect(await logoInkLuminance(await wordmark("#ffffff"))).toBeGreaterThan(LOGO_LIGHT_MIN_LUMINANCE)
    expect(await logoInkLuminance(await wordmark("#0a0a0a"))).toBeLessThan(LOGO_LIGHT_MIN_LUMINANCE)
  })
})

describe("whitenLogo", () => {
  it("keeps the shape and changes only the colour", async () => {
    const src = await wordmark("#0a0a0a")
    const out = await whitenLogo(src)

    const a = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const b = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(b.info.width).toBe(a.info.width)
    expect(b.info.height).toBe(a.info.height)

    let opaque = 0
    for (let i = 0; i < b.data.length; i += 4) {
      // L'alpha sopravvive intatta...
      expect(b.data[i + 3]).toBe(a.data[i + 3])
      if (b.data[i + 3] > 200) {
        // ...e dove c'è inchiostro ora è bianco.
        opaque++
        expect(b.data[i]).toBe(255)
        expect(b.data[i + 1]).toBe(255)
        expect(b.data[i + 2]).toBe(255)
      }
    }
    expect(opaque).toBeGreaterThan(100)
  })

  it("makes a dark logo read as light", async () => {
    expect(await logoInkLuminance(await whitenLogo(await wordmark("#0a0a0a")))).toBeGreaterThan(LOGO_LIGHT_MIN_LUMINANCE)
  })
})

describe("composeLogoImage", () => {
  it("returns the trimmed logo alone when no title is asked for", async () => {
    const out = await composeLogoImage({ logoBuf: await wordmark("#ffffff"), title: null })
    const meta = await sharp(out).metadata()
    expect(meta.hasAlpha).toBe(true)
    // Il ritaglio toglie il margine trasparente intorno alla barra.
    expect(meta.height!).toBeLessThan(80)
  })

  it("trims to the ink exactly, without eating any of it", async () => {
    // La barra è 210x40 dentro una tela 300x80: il ritaglio deve restituire
    // la barra, non un pixel di meno.
    const out = await composeLogoImage({ logoBuf: await wordmark("#ffffff", 300, 80), title: null })
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(Math.round(300 * 0.7))
    expect(meta.height).toBe(Math.round(80 * 0.5))
  })

  it("grows taller when the Hebrew title goes underneath", async () => {
    const logo = await wordmark("#ffffff")
    const alone = await sharp(await composeLogoImage({ logoBuf: logo, title: null })).metadata()
    const titled = await sharp(await composeLogoImage({ logoBuf: logo, title: "מלחמת הכוכבים" })).metadata()

    expect(titled.height!).toBeGreaterThan(alone.height!)
    expect(titled.hasAlpha).toBe(true)
  })

  it("ignores a blank title", async () => {
    const logo = await wordmark("#ffffff")
    const a = await sharp(await composeLogoImage({ logoBuf: logo, title: "   " })).metadata()
    const b = await sharp(await composeLogoImage({ logoBuf: logo, title: null })).metadata()
    expect(a.height).toBe(b.height)
  })
})

describe("localizedTitle", () => {
  it("reads title for a movie and name for a series", () => {
    expect(localizedTitle({ title: "המשרד" })).toBe("המשרד")
    expect(localizedTitle({ name: "המשרד" })).toBe("המשרד")
    expect(localizedTitle({ title: "  " , name: "המשרד" })).toBe("המשרד")
    expect(localizedTitle(null)).toBeNull()
  })
})
