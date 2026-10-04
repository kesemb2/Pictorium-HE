import { describe, expect, it } from "vitest"
import fs from "node:fs"
import { detectPosterText, TEXT_SCORE_THRESHOLD } from "@/lib/poster-text-detect"
import { backgrounds, withText, TITLE_CASES } from "./fixtures/synthetic-posters"

// Taratura su poster sintetici (vedi fixtures/synthetic-posters). Il rilevatore
// è volutamente sbilanciato verso il rifiuto: un falso "testo" costa solo il
// passaggio al livello di fallback successivo.
describe("detectPosterText", () => {
  it("finds no text on textless artwork (gradients, blobs, textures, faces, city lights)", async () => {
    const bgs = await backgrounds()
    for (const [name, buf] of Object.entries(bgs)) {
      const r = await detectPosterText(buf)
      expect(r.hasText, `${name} score=${r.score}`).toBe(false)
      expect(r.score).toBeLessThan(TEXT_SCORE_THRESHOLD)
    }
  }, 60000)

  it("finds titles, taglines and billing blocks on soft backgrounds (Latin and Hebrew)", async () => {
    const bgs = await backgrounds()
    for (const bg of ["gradient", "blobs", "clouds", "face"] as const) {
      for (const [name, specs] of Object.entries(TITLE_CASES)) {
        const r = await detectPosterText(await withText(bgs[bg]!, specs))
        expect(r.hasText, `${bg}+${name} score=${r.score}`).toBe(true)
      }
    }
  }, 120000)

  it("finds titles over busy textures", async () => {
    const bgs = await backgrounds()
    const cases: Array<[string, string]> = [
      ["foliage", "title-top"], ["sand", "title-center-big"], ["forest", "two-lines"],
      ["hair", "title-bottom"], ["foliage", "title-hebrew"], ["fabric", "title-center-big"],
    ]
    for (const [bg, c] of cases) {
      const r = await detectPosterText(await withText(bgs[bg]!, TITLE_CASES[c]!))
      expect(r.hasText, `${bg}+${c} score=${r.score}`).toBe(true)
    }
  }, 60000)

  it("finds the printed text on real rendered posters", async () => {
    for (const f of ["1405", "1368337", "155", "66732"]) {
      const r = await detectPosterText(fs.readFileSync(`public/Screen/${f}.jpg`))
      expect(r.hasText, `${f} score=${r.score}`).toBe(true)
    }
  }, 60000)
})
