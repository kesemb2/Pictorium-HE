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
  it("returns the logo whole, margins and all, when no title is asked for", async () => {
    // Ritagliare all'inchiostro toglieva l'aria dell'artwork e il client la
    // usa: la parola finiva a filo e l'ultima lettera sembrava tagliata.
    const src = await wordmark("#ffffff", 300, 80)
    const { png, titleRendered } = await composeLogoImage({ logoBuf: src, title: null })
    const meta = await sharp(png).metadata()

    expect(titleRendered).toBe(false)
    expect(meta.width).toBe(300)
    expect(meta.height).toBe(80)
    expect(meta.hasAlpha).toBe(true)
  })

  it("keeps the soft edge of a glowing wordmark", async () => {
    // La soglia di default di sharp (10) mangia il bagliore: misurato, un
    // wordmark con sigma 25 perdeva 38px di larghezza. Qui non si perde nulla.
    const glow = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160">`
      + `<defs><filter id="g" x="-60%" y="-60%" width="220%" height="220%">`
      + `<feGaussianBlur stdDeviation="14" result="b"/>`
      + `<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>`
      + `</filter></defs>`
      + `<text x="200" y="100" text-anchor="middle" font-family="sans-serif" font-size="60" fill="#fff" filter="url(#g)">PAPER</text></svg>`,
    )).png().toBuffer()

    const { png } = await composeLogoImage({ logoBuf: glow, title: null })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(400)
    expect(meta.height).toBe(160)

    // E il bagliore c'è ancora, non solo la tela che lo conteneva.
    const tight = await sharp(png).trim({ threshold: 1 }).png().toBuffer()
    const loose = await sharp(png).trim({ threshold: 10 }).png().toBuffer()
    const t = await sharp(tight).metadata()
    const l = await sharp(loose).metadata()
    expect(t.width!).toBeGreaterThan(l.width!)
  })

  it("grows downward when the Hebrew title goes underneath", async () => {
    const logo = await wordmark("#ffffff")
    const alone = await sharp((await composeLogoImage({ logoBuf: logo, title: null })).png).metadata()
    const { png, titleRendered } = await composeLogoImage({ logoBuf: logo, title: "מלחמת הכוכבים" })
    const titled = await sharp(png).metadata()

    expect(titleRendered).toBe(true)
    expect(titled.height!).toBeGreaterThan(alone.height!)
    expect(titled.hasAlpha).toBe(true)
  })

  it("hangs the title off the ink, not off the canvas", async () => {
    // Un logo con molta aria sotto non deve spingere il titolo lontano dalla
    // parola: il distacco si misura dall'ultima riga di inchiostro.
    const bar = await sharp({ create: { width: 200, height: 40, channels: 4, background: "#ffffff" } }).png().toBuffer()
    const airy = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: bar, top: 20, left: 50 }])
      .png().toBuffer()

    const { png } = await composeLogoImage({ logoBuf: airy, title: "העיתון" })
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const rowHasInk = (y: number) => {
      for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) return true
      return false
    }
    // La barra finisce a y=59; il titolo comincia poco sotto, non a y=300.
    let firstTitleRow = -1
    for (let y = 61; y < info.height; y++) if (rowHasInk(y)) { firstTitleRow = y; break }
    expect(firstTitleRow).toBeGreaterThan(59)
    expect(firstTitleRow).toBeLessThan(90)
  })

  it("centres the title on the ink of an off-centre wordmark", async () => {
    const bar = await sharp({ create: { width: 120, height: 40, channels: 4, background: "#ffffff" } }).png().toBuffer()
    const offCentre = await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: bar, top: 30, left: 20 }])
      .png().toBuffer()

    const { png } = await composeLogoImage({ logoBuf: offCentre, title: "העיתון" })
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    // Baricentro orizzontale dell'inchiostro sotto la barra (y > 75).
    let sum = 0, n = 0
    for (let y = 76; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 0) { sum += x; n++ }
      }
    }
    expect(n).toBeGreaterThan(0)
    // L'inchiostro del logo è centrato su 80, non su 200.
    expect(sum / n).toBeLessThan(info.width / 2)
  })

  it("ignores a blank title", async () => {
    const logo = await wordmark("#ffffff")
    const a = await sharp((await composeLogoImage({ logoBuf: logo, title: "   " })).png).metadata()
    const b = await sharp((await composeLogoImage({ logoBuf: logo, title: null })).png).metadata()
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
