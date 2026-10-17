// @vitest-environment node
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"
import { chooseCropCentre, columnProfile, hasClearSubject, smartCropToPortrait, type ColumnProfile, type CropAnalysis } from "@/lib/smart-crop"
import { detectSubjects, type SubjectBox } from "@/lib/subject-detect"

const W = 256
const flat = (v = 1): number[] => new Array(W).fill(v)
const profile = (contrast: number[], edges: number[] = flat()): ColumnProfile => ({ width: W, contrast, edges })
const box = (x: number, w: number, h: number, score = 0.8): SubjectBox => ({ x, y: 0.2, w, h, score })
const FRAME = 0.375 // 16:9 -> 2:3

describe("choosing where to crop", () => {
  it("goes where the people are, not where the picture is busiest", () => {
    const busyRight = flat(1).map((v, i) => (i > 190 ? 12 : v))
    const analysis: CropAnalysis = { profile: profile(busyRight, busyRight), subjects: { faces: [box(0.12, 0.08, 0.15)], people: [box(0.08, 0.2, 0.7)] } }
    const cx = chooseCropCentre(analysis, FRAME)
    expect(cx).toBeGreaterThan(0.08)
    expect(cx).toBeLessThan(0.3)
  })

  it("prefers the biggest figure over smaller ones", () => {
    const analysis: CropAnalysis = {
      profile: profile(flat()),
      subjects: { faces: [], people: [box(0.05, 0.08, 0.3), box(0.7, 0.2, 0.9)] },
    }
    expect(chooseCropCentre(analysis, FRAME)).toBeGreaterThan(0.6)
  })

  it("without anyone to recognise, follows the visual profile", () => {
    const leftSubject = flat(0.2).map((v, i) => (i > 20 && i < 80 ? 6 : v))
    const cx = chooseCropCentre({ profile: profile(leftSubject, leftSubject), subjects: null }, FRAME)
    expect(cx).toBeLessThan(0.35)
  })

  it("on an empty picture leans to the centre-right, never to an edge", () => {
    const cx = chooseCropCentre({ profile: profile(flat()), subjects: { faces: [], people: [] } }, FRAME)
    expect(cx).toBeGreaterThan(0.5)
    expect(cx).toBeLessThan(0.62)
  })

  it("calls a confident face or person a clear subject", () => {
    expect(hasClearSubject({ profile: profile(flat()), subjects: { faces: [box(0.4, 0.1, 0.2, 0.9)], people: [] } })).toBe(true)
    expect(hasClearSubject({ profile: profile(flat()), subjects: { faces: [box(0.4, 0.1, 0.2, 0.3)], people: [] } })).toBe(false)
    expect(hasClearSubject({ profile: profile(flat()), subjects: null })).toBe(false)
  })
})

/** Cielo uniforme con una figura scura in un punto. */
async function sceneWithFigure(figureLeft: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <rect width="1280" height="720" fill="#8fb8de"/>
    <rect x="${figureLeft}" y="160" width="150" height="560" fill="#3a1f1a"/>
    <circle cx="${figureLeft + 75}" cy="150" r="70" fill="#e0a37a"/>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg().toBuffer()
}

describe("cropping a wide image into a poster", () => {
  it("keeps the figure inside the poster (visual profile only)", async () => {
    const img = await sceneWithFigure(1000)
    const out = await smartCropToPortrait(img, 500, 750, 90)
    const meta = await sharp(out).metadata()
    expect([meta.width, meta.height]).toEqual([500, 750])
    // La figura (scura, 150px su 1280) deve entrare intera nel poster: una
    // fascia di colonne scure larga quanto lei, non tagliata dai bordi.
    const { data, info } = await sharp(out).extract({ left: 0, top: 450, width: 500, height: 250 }).greyscale().raw().toBuffer({ resolveWithObject: true })
    const dark: number[] = []
    for (let x = 0; x < info.width; x++) {
      let sum = 0
      for (let y = 0; y < info.height; y++) sum += data[y * info.width + x]
      if (sum / info.height < 90) dark.push(x)
    }
    expect(dark.length).toBeGreaterThan(130)
    expect(dark[0]).toBeGreaterThan(0)
    expect(dark[dark.length - 1]).toBeLessThan(499)
  })

  it("profiles have one value per column", async () => {
    const p = await columnProfile(await sceneWithFigure(100))
    expect(p.width).toBe(256)
    expect(p.contrast).toHaveLength(256)
    // Più contrasto dove c'è la figura che sul cielo.
    const at = (x: number) => p.contrast[Math.round((x / 1280) * 256)]
    expect(at(175)).toBeGreaterThan(at(900))
  })

  it("an image already narrower than a poster keeps the plain cover", async () => {
    const tall = await sharp({ create: { width: 400, height: 700, channels: 3, background: "#456" } }).jpeg().toBuffer()
    const meta = await sharp(await smartCropToPortrait(tall, 500, 750, 90)).metadata()
    expect([meta.width, meta.height]).toEqual([500, 750])
  })
})

describe("subject detector", () => {
  it("is off when disabled", async () => {
    expect(await detectSubjects(await sceneWithFigure(500))).toBeNull()
  })

  it("loads its models from disk and analyses an image", async () => {
    vi.stubEnv("PICTORIUM_SUBJECT_DETECT", "1")
    const res = await detectSubjects(await sceneWithFigure(500), 60_000)
    expect(res).not.toBeNull()
    expect(Array.isArray(res!.faces)).toBe(true)
    expect(Array.isArray(res!.people)).toBe(true)
  }, 90_000)
})
