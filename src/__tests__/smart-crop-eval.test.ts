// @vitest-environment node
/**
 * Misura del ritaglio sulle scelte fatte a mano (la "מעבדת החיתוך").
 * Gira solo con CROP_EVAL_DIR, una cartella con `labels.json`:
 *   [{ "id", "file", "cx", "w" }]  (cx = centro scelto a mano, w = larghezza
 *   della cornice, entrambi frazioni della larghezza dell'immagine)
 * Le immagini non stanno nel repository: sono still di terzi.
 *   CROP_EVAL_DIR=… CROP_EVAL_OUT=…/pred.json npx vitest run src/__tests__/smart-crop-eval.test.ts
 * "Preso" = almeno il 70% della cornice scelta a mano dentro la nostra.
 */
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"
import { analyzeForCrop, chooseCropCentre } from "@/lib/smart-crop"

const dir = process.env.CROP_EVAL_DIR

describe.skipIf(!dir)("smart crop on the hand-labelled set", () => {
  it("beats sharp's attention", async () => {
    vi.stubEnv("PICTORIUM_SUBJECT_DETECT", process.env.CROP_EVAL_DETECT ?? "1")
    const labels = JSON.parse(fs.readFileSync(path.join(dir!, "labels.json"), "utf8")) as Array<{ id: string; file: string; cx: number; w: number }>
    const rows: Array<{ id: string; cx: number; attention: number; hit: boolean; attentionHit: boolean }> = []
    for (const l of labels) {
      const buf = fs.readFileSync(l.file)
      const cx = chooseCropCentre(await analyzeForCrop(buf), l.w)
      // Com'era: attention su w1280 → 500×750.
      const w1280 = await sharp(buf).resize(1280).toBuffer()
      const meta = await sharp(w1280).metadata()
      const { info } = await sharp(w1280).resize(500, 750, { fit: "cover", position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true })
      const scaledW = (meta.width! * 750) / meta.height!
      const attention = (-(info.cropOffsetLeft ?? 0) + 250) / scaledW
      rows.push({ id: l.id, cx, attention, hit: Math.abs(cx - l.cx) <= 0.3 * l.w, attentionHit: Math.abs(attention - l.cx) <= 0.3 * l.w })
    }
    const hits = rows.filter((r) => r.hit).length
    const attentionHits = rows.filter((r) => r.attentionHit).length
    if (process.env.CROP_EVAL_OUT) fs.writeFileSync(process.env.CROP_EVAL_OUT, JSON.stringify({ hits, attentionHits, total: rows.length, rows }, null, 1))
    expect(hits).toBeGreaterThan(attentionHits)
  }, 600_000)
})
