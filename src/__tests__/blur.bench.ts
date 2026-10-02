/**
 * Micro-benchmark di applyBlur (progressive dual-stage + tint).
 *
 * Uso: `npx vitest bench src/__tests__/blur.bench.ts`
 * (i file *.bench.ts NON girano in `vitest run` / `npm run test`).
 *
 * Budget: overhead p95 ≤ +10ms rispetto al baseline single-stage (~8-15ms).
 */
import { bench, describe } from "vitest"
import sharp from "sharp"
import { applyBlur } from "@/lib/blur"
import { STD_W, STD_H, LAND_W, LAND_H } from "@/lib/image-utils"

async function makeBuf(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 60, g: 80, b: 120 } },
  })
    .jpeg()
    .toBuffer()
}

const portraitBuf = await makeBuf(STD_W, STD_H)
const landscapeBuf = await makeBuf(LAND_W, LAND_H)

const base = {
  blurEnabled: true,
  blurHeight: 30,
  blurIntensity: 15,
  blurFade: 60,
  blurDarkness: 40,
}

describe("applyBlur bench", () => {
  bench("portrait 500x750", async () => {
    await applyBlur({ ...base, posterBuf: portraitBuf, canvasW: STD_W, canvasH: STD_H })
  })

  bench("portrait 500x750 + accent tint", async () => {
    await applyBlur({
      ...base,
      posterBuf: portraitBuf,
      canvasW: STD_W,
      canvasH: STD_H,
      accentColor: "#E58E26",
    })
  })

  bench("landscape 768x432", async () => {
    await applyBlur({
      ...base,
      posterBuf: landscapeBuf,
      canvasW: LAND_W,
      canvasH: LAND_H,
      blurHeight: 20,
    })
  })
})
