import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { renderSeparateRatingStack, SEPARATE_STACK_GAP } from "@/lib/separate-rating-renderer"

describe("renderSeparateRatingStack (colonna uniforme: logo sopra, punteggio sotto)", () => {
  it("rende lo stack con pill a larghezza uniforme e gap costante", async () => {
    const stack = await renderSeparateRatingStack(
      [
        { id: "imdb", value: 8.4 },
        { id: "tmdb", value: 8.0 },
        { id: "tomatoes", value: 9.2 },
      ],
      380,
      true,
    )
    expect(stack).not.toBeNull()
    const metadata = await sharp(stack!.png).metadata()
    expect(metadata.width).toBe(stack!.w)
    expect(metadata.height).toBe(stack!.h)
    // Colonna dritta e compatta: più stretta di 140px, gap incluso nell'altezza
    expect(stack!.w).toBeLessThan(140)
    expect(stack!.h).toBeGreaterThan(0)
    expect(SEPARATE_STACK_GAP).toBe(5)
  })

  it("skippate le fonti senza asset; nessuna restante → null (mai 500)", async () => {
    const partial = await renderSeparateRatingStack(
      [
        { id: "nope", value: 7.0 },
        { id: "imdb", value: 8.4 },
      ],
      380,
      true,
    )
    expect(partial).not.toBeNull()
    const single = await renderSeparateRatingStack([{ id: "imdb", value: 8.4 }], 380, true)
    expect(single).not.toBeNull()
    // Stessa pill, con o senza vicini skippati la larghezza coincide
    expect(partial!.w).toBe(single!.w)
    expect(await renderSeparateRatingStack([{ id: "nope", value: 7.0 }], 380, true)).toBeNull()
    expect(await renderSeparateRatingStack([], 380, true)).toBeNull()
  })
})
