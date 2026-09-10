import { describe, expect, it } from "vitest"
import {
  buildExtraDefaultSvg,
  estimateTextWidth,
  rtlSafe,
  buildGenreTextSvg,
  buildTitleTextSvg,
  genreBadgeSvgDims,
  textShadowBox,
  textShadowDefs,
  textOpacityAttr,
} from "@/lib/badge-svg-shared"

const GENRE = "Drama"
const VOTE = "8.1"
const YEAR = "2024"

describe("text shadow defaults", () => {
  // Se i default cambiassero anche di un byte, ogni poster già reso si
  // muoverebbe: il filtro è quello storico, duplicato prima in due punti.
  it("emit the historical filter untouched", () => {
    expect(textShadowDefs("sh")).toBe(
      '<defs><filter id="sh" x="-50%" y="-50%" width="200%" height="200%">'
      + '<feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="rgba(0,0,0,0.8)"/>'
      + '<feDropShadow dx="0" dy="5" stdDeviation="4.5" flood-color="rgba(0,0,0,0.55)"/>'
      + '</filter></defs>',
    )
  })

  it("is identical whether the style is omitted or fully default", () => {
    expect(textShadowDefs("sh", { opacity: 100, shadowOpacity: 100, shadowBlur: 100, shadowOffset: 100 }))
      .toBe(textShadowDefs("sh"))
  })

  it("scales opacity, blur and offset independently", () => {
    expect(textShadowDefs("sh", { shadowOpacity: 50 })).toContain("rgba(0,0,0,0.4)")
    expect(textShadowDefs("sh", { shadowBlur: 200 })).toContain('stdDeviation="3"')
    expect(textShadowDefs("sh", { shadowOffset: 50 })).toContain('dy="1"')
  })

  it("clamps out-of-range values instead of emitting nonsense", () => {
    expect(textShadowDefs("sh", { shadowOpacity: -20 })).toContain("rgba(0,0,0,0)")
    expect(textShadowDefs("sh", { shadowBlur: 9999 })).toContain('stdDeviation="3"')
  })
})

describe("text shadow box", () => {
  it("keeps the historical padding at defaults", () => {
    expect(textShadowBox()).toEqual({ pad: 8, drop: 5 })
  })

  // Il riquadro decide la larghezza del badge, quindi anche dove viene composto
  // sul poster: rimpicciolire l'ombra non deve spostare la riga.
  it("never shrinks below the default", () => {
    expect(textShadowBox({ shadowBlur: 0, shadowOffset: 0 })).toEqual({ pad: 8, drop: 5 })
  })

  it("grows so a larger shadow is not clipped", () => {
    const box = textShadowBox({ shadowBlur: 200, shadowOffset: 200 })
    expect(box.pad).toBeGreaterThan(8)
    expect(box.drop).toBeGreaterThan(5)
  })
})

describe("text opacity", () => {
  // `opacity` di gruppo e non `fill-opacity`: i bullet portano il proprio
  // fill-opacity, che sostituirebbe quello ereditato invece di moltiplicarlo.
  it("uses group opacity so the bullets dim too", () => {
    expect(textOpacityAttr({ opacity: 50 })).toBe(' opacity="0.5"')
  })

  it("emits nothing at full opacity", () => {
    expect(textOpacityAttr()).toBe("")
    expect(textOpacityAttr({ opacity: 100 })).toBe("")
  })

  it("reaches the genre line and the title alike", () => {
    const genre = buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow", 0, undefined, { opacity: 40 })
    const title = buildTitleTextSvg("דבס", 300, 36, "#ffffff", { opacity: 40 })!
    expect(genre.svg).toContain('opacity="0.4"')
    expect(title.svg).toContain('opacity="0.4"')
  })
})

describe("rating star toggle", () => {
  it("drops the star glyph but keeps the vote", () => {
    const withStar = buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow", 0, { showStar: true })
    const without = buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow", 0, { showStar: false })
    expect(withStar.svg).toContain("★")
    expect(without.svg).not.toContain("★")
    expect(without.svg).toContain(VOTE)
  })

  // Larghezza e flusso devono cambiare INSIEME: se solo uno dei due sapesse
  // della stella, il testo uscirebbe scentrato.
  it("narrows the badge by the star and its gap", () => {
    const withStar = genreBadgeSvgDims(28, GENRE, VOTE, YEAR, { showStar: true })
    const without = genreBadgeSvgDims(28, GENRE, VOTE, YEAR, { showStar: false })
    expect(without.starW).toBe(0)
    expect(without.gapStar).toBe(0)
    expect(without.totalW).toBe(withStar.totalW - withStar.starW - withStar.gapStar)
  })

  it("defaults to showing the star", () => {
    expect(buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow").svg)
      .toBe(buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow", 0, { showStar: true }).svg)
  })

  it("is moot when the rating itself is off", () => {
    const a = buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow", 0, { showRating: false, showStar: true })
    const b = buildGenreTextSvg(GENRE, VOTE, YEAR, 28, "#e5e7eb", "shadow", 0, { showRating: false, showStar: false })
    expect(a.svg).toBe(b.svg)
  })
})

describe("trailing bidi mark", () => {
  const RLM = "‏"

  // resvg impagina il paragrafo come LTR, quindi un segno NEUTRO finale — il
  // geresh di "לבינג'", il punto interrogativo di "מי הרוצח?" — finiva a destra
  // di tutta la parola invece che a sinistra. `direction="rtl"` e
  // `unicode-bidi="embed"` sono stati provati: resvg li ignora. L'RLM è dato
  // dell'algoritmo bidi, non del renderer.
  it("appends the mark to Hebrew text", () => {
    expect(rtlSafe("מוכן לבינג'")).toBe("מוכן לבינג'" + RLM)
    expect(rtlSafe("מי הרוצח?")).toBe("מי הרוצח?" + RLM)
  })

  it("leaves Latin text exactly as it was", () => {
    for (const s of ["K-Drama", "Absolute Cinema", "4K", ""]) expect(rtlSafe(s)).toBe(s)
  })

  it("costs no width, so estimates and textLength are untouched", () => {
    expect(estimateTextWidth("מוכן" + RLM, 28)).toBe(estimateTextWidth("מוכן", 28))
  })

  it("reaches the rendered badge markup", () => {
    const hebrew = buildExtraDefaultSvg("מוכן לבינג'", 28, "#fff", "#000")
    expect(hebrew.svg).toContain("'" + RLM + "</text>")
    const latin = buildExtraDefaultSvg("K-Drama", 28, "#fff", "#000")
    expect(latin.svg).not.toContain(RLM)
  })

  it("closes the genre line, which is one bidi paragraph across its tspans", () => {
    expect(buildGenreTextSvg("דרמה", "8.1", "2024", 28, "#fff", "shadow").svg).toContain(RLM + "</text>")
    expect(buildGenreTextSvg("Drama", "8.1", "2024", 28, "#fff", "shadow").svg).not.toContain(RLM)
  })
})
