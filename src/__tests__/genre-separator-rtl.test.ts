import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { buildGenreTextSvg } from "@/lib/badge-svg-shared"
import { renderSVG } from "@/lib/svg-badge"

/**
 * Il separatore fra genere e voto deve stare IN MEZZO, anche in ebraico.
 *
 * Il bidi non si ferma ai confini dei `<tspan>`: con un genere ebraico la riga
 * veniva riordinata e i `dx` cadevano dal lato sbagliato, lasciando il
 * separatore incollato al genere. Qui si misura sui pixel, perché su testo RTL
 * la lettura della stringa non dice dove finiscono davvero i glifi.
 */
async function separatorGaps(genre: string) {
  const built = buildGenreTextSvg(genre, "8.5", "2024", 28, "#ffffff", "shadow")
  // Solo il primo separatore colorato: il resto dell'inchiostro resta chiaro.
  let n = 0
  const painted = built.svg.replace(/fill-opacity="0\.6"/g, () => (++n === 1 ? 'fill="#ff0000"' : 'fill-opacity="0.6"'))
  const png = await renderSVG(painted, built.w)
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const sep: number[] = []
  const other: number[] = []
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 60) continue
      if (r > 150 && g < 80 && b < 80) sep.push(x)
      else if (r > 100 || g > 100 || b > 100) other.push(x)
    }
  }
  expect(sep.length, "separator not found").toBeGreaterThan(0)
  const lo = Math.min(...sep)
  const hi = Math.max(...sep)
  return {
    left: lo - Math.max(...other.filter((x) => x < lo)),
    right: Math.min(...other.filter((x) => x > hi)) - hi,
  }
}

describe("genre separator spacing", () => {
  it("sits between the genre and the rating in Hebrew, as it does in Latin", async () => {
    const latin = await separatorGaps("Action")
    const hebrew = await separatorGaps("פעולה")

    // Simmetrico in latino, ed è il riferimento.
    expect(Math.abs(latin.left - latin.right)).toBeLessThanOrEqual(1)
    // Prima della correzione l'ebraico dava 13 e 4: il separatore toccava il genere.
    expect(Math.abs(hebrew.left - hebrew.right)).toBeLessThanOrEqual(1)
    expect(hebrew.left).toBe(latin.left)
    expect(hebrew.right).toBe(latin.right)
  })
})
