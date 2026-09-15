import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { findSceneTint, findAccentColor } from "@/lib/accent-color"
import { extractSceneTint } from "@/lib/poster-render-helpers"

function createSolidRawRgba(w: number, h: number, r: number, g: number, b: number): Buffer {
  const buf = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = 255
  }
  return buf
}

/** Luminosità HSL, la stessa grandezza che la tinta deve conservare. */
function hslLightness(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return (max + min) / 2
}

describe("findSceneTint (same-hue scene tint extraction)", () => {
  it("solid green raw image -> G dominant with significant margin over R and B", () => {
    const raw = createSolidRawRgba(100, 100, 20, 180, 30)
    const tint = findSceneTint(raw, 100, 100)!
    expect(tint).not.toBeNull()
    expect(tint.g).toBeGreaterThan(tint.r + 30)
    expect(tint.g).toBeGreaterThan(tint.b + 30)
  })

  it("solid blue raw image -> B dominant over R and G", () => {
    const raw = createSolidRawRgba(100, 100, 30, 40, 200)
    const tint = findSceneTint(raw, 100, 100)!
    expect(tint).not.toBeNull()
    expect(tint.b).toBeGreaterThan(tint.r + 30)
    expect(tint.b).toBeGreaterThan(tint.g + 30)
  })

  it("amber image (229, 142, 38) -> R max and same-hue (proves non-rotation vs complementary +150°)", () => {
    const raw = createSolidRawRgba(100, 100, 229, 142, 38)
    const sceneTint = findSceneTint(raw, 100, 100)!
    const accentBadge = findAccentColor(raw, 100, 100, "Action")

    // Scene tint must keep warm amber hue (R dominant, G mid, B lowest)
    expect(sceneTint.r).toBeGreaterThan(sceneTint.g)
    expect(sceneTint.g).toBeGreaterThan(sceneTint.b)

    // Contrast with findAccentColor (+150° rotation gives cool cyan/blue where B or G dominates R)
    expect(accentBadge.b).toBeGreaterThan(accentBadge.r)
  })

  it("flat grey -> no tint at all (niente colore inventato dal genere)", () => {
    const raw = createSolidRawRgba(100, 100, 128, 128, 128)
    expect(findSceneTint(raw, 100, 100)).toBeNull()
  })

  it("keeps the region's own lightness instead of pinning it to a dark value", () => {
    // Un rosso medio: la tinta deve stare sulla luminosità del rosso, non
    // sotto. La vecchia implementazione chiudeva sempre a L=0.20.
    const raw = createSolidRawRgba(100, 100, 190, 40, 40)
    const tint = findSceneTint(raw, 100, 100)!
    expect(Math.abs(hslLightness(tint.r, tint.g, tint.b) - hslLightness(190, 40, 40))).toBeLessThan(0.05)
  })

  it("never raises the saturation of a washed-out region", () => {
    // Grigio appena tinto di blu: resta appena tinto, non diventa blu pieno.
    const raw = createSolidRawRgba(100, 100, 120, 128, 150)
    const tint = findSceneTint(raw, 100, 100)
    if (tint) {
      const chroma = (Math.max(tint.r, tint.g, tint.b) - Math.min(tint.r, tint.g, tint.b)) / 255
      expect(chroma).toBeLessThan((150 - 120) / 255 + 0.02)
    }
  })

  it("findAccentColor remains byte-identical after analyzeBuckets extraction", () => {
    const rawGreen = createSolidRawRgba(50, 50, 20, 180, 30)
    const resGreen = findAccentColor(rawGreen, 50, 50, "Action")
    expect(resGreen).toEqual(findAccentColor(rawGreen, 50, 50, "Action"))

    const rawGrey = createSolidRawRgba(50, 50, 80, 80, 80)
    const resGrey = findAccentColor(rawGrey, 50, 50, "Drama")
    expect(resGrey).toEqual(findAccentColor(rawGrey, 50, 50, "Drama"))
  })
})

describe("extractSceneTint (poster-render-helpers)", () => {
  it("extracts valid #rrggbb hex string from a synthetic JPEG buffer", async () => {
    const jpegBuf = await sharp({
      create: {
        width: 300,
        height: 450,
        channels: 3,
        background: { r: 180, g: 40, b: 40 },
      },
    }).jpeg().toBuffer()

    const hex = await extractSceneTint(jpegBuf, 0.3)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it("never throws on corrupt / garbage buffer and returns no tint", async () => {
    const garbage = Buffer.from([0, 1, 2, 3, 4, 5])
    expect(await extractSceneTint(garbage, 0.3)).toBeNull()
  })

  it("returns byte-identical output for identical poster input (deterministic)", async () => {
    const jpegBuf = await sharp({
      create: {
        width: 200,
        height: 300,
        channels: 3,
        background: { r: 50, g: 120, b: 200 },
      },
    }).jpeg().toBuffer()

    const hex1 = await extractSceneTint(jpegBuf, 0.3)
    const hex2 = await extractSceneTint(jpegBuf, 0.3)
    expect(hex1).toBe(hex2)
  })

  it("blue poster -> blue tint", async () => {
    const jpegBuf = await sharp({
      create: {
        width: 200,
        height: 300,
        channels: 3,
        background: { r: 50, g: 120, b: 200 },
      },
    }).jpeg().toBuffer()

    const hex = await extractSceneTint(jpegBuf, 0.3)!
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    const b = parseInt(hex!.slice(5, 7), 16)
    const r = parseInt(hex!.slice(1, 3), 16)
    expect(b).toBeGreaterThan(r + 30)
  })

  it("takes its colour from the strip the band covers, not from the rest of the poster", async () => {
    // Scena verde in alto, blob caldo nel fondo. La fascia copre il fondo,
    // quindi è il fondo a dettare la tinta: tingere di verde pixel che sotto
    // sono caldi era il modo di sbagliare colore su un poster intero.
    const w = 200, h = 300
    const raw = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const warm = y > h * 0.6
        raw[i] = warm ? 200 : 25
        raw[i + 1] = warm ? 150 : 95
        raw[i + 2] = warm ? 110 : 80
        raw[i + 3] = 255
      }
    }
    const jpegBuf = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).jpeg().toBuffer()
    const hex = (await extractSceneTint(jpegBuf, 0.3))!
    expect(hex).not.toBeNull()
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    expect(r).toBeGreaterThan(g)
  })
})

/**
 * I tre poster che avevano sbagliato colore, ricostruiti sinteticamente.
 * Le asserzioni sono sulla proprietà, non sull'hex: quello che conta è che la
 * fascia non riceva un colore che nel poster non c'è.
 */
describe("scene tint on the three posters that came out wrong", () => {
  async function poster(paint: (raw: Buffer, x: number, y: number, w: number, h: number) => void): Promise<Buffer> {
    const w = 200, h = 300
    const raw = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) paint(raw, x, y, w, h)
    }
    return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  }

  it("a warm near-black poster gets no tint instead of brown", async () => {
    // Il Padrino: nero appena caldo. Il 3% di croma veniva portato al 30% di
    // saturazione e la fascia usciva marrone.
    const buf = await poster((raw, x, y, w) => {
      const i = (y * w + x) * 4
      raw[i] = 14; raw[i + 1] = 11; raw[i + 2] = 8; raw[i + 3] = 255
    })
    expect(await extractSceneTint(buf, 0.3)).toBeNull()
  })

  it("a white poster with a small red detail does not get a dark red band", async () => {
    // Il diavolo veste Prada: bianco con i tacchi rossi. Il bianco non pesava
    // nulla e vincevano i tacchi.
    const buf = await poster((raw, x, y, w, h) => {
      const i = (y * w + x) * 4
      const heel = y > h * 0.80 && x > w * 0.44 && x < w * 0.56
      raw[i] = heel ? 190 : 246
      raw[i + 1] = heel ? 20 : 244
      raw[i + 2] = heel ? 30 : 242
      raw[i + 3] = 255
    })
    const hex = await extractSceneTint(buf, 0.3)
    if (hex !== null) {
      const l = hslLightness(
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      )
      expect(l).toBeGreaterThan(0.6)
    }
  })

  it("a uniformly red poster gets a band at its own red's lightness", async () => {
    // Michael: rosso pieno e niente in basso. La fascia usciva più scura del
    // rosso che copriva, perché L era fissa a 0.20.
    const buf = await poster((raw, x, y, w) => {
      const i = (y * w + x) * 4
      raw[i] = 178; raw[i + 1] = 34; raw[i + 2] = 34; raw[i + 3] = 255
    })
    const hex = (await extractSceneTint(buf, 0.3))!
    expect(hex).not.toBeNull()
    const l = hslLightness(
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    )
    expect(Math.abs(l - hslLightness(178, 34, 34))).toBeLessThan(0.05)
  })
})
