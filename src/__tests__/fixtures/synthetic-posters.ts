/**
 * Poster sintetici per tarare/verificare il rilevatore di testo
 * (poster-text-detect). Deterministici: PRNG con seed, niente rete.
 */
import sharp from "sharp"
import { renderSVG } from "@/lib/svg-badge"

export const PW = 500
export const PH = 750

function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function noise(seed: number, sigma: number, contrast = 1, base = 0): Promise<Buffer> {
  const rnd = prng(seed)
  const raw = Buffer.alloc(PW * PH * 3)
  for (let i = 0; i < PW * PH; i++) {
    const v = Math.round(rnd() * 255)
    raw[i * 3] = v; raw[i * 3 + 1] = Math.round(v * 0.9); raw[i * 3 + 2] = Math.round(v * 0.8)
  }
  let img = sharp(raw, { raw: { width: PW, height: PH, channels: 3 } })
  if (sigma >= 0.3) img = img.blur(sigma)
  return img.linear(contrast, base).png().toBuffer()
}

async function svgImage(body: string, bg = "#000"): Promise<Buffer> {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`)).png().toBuffer()
}

/** Sfondi senza testo, dal più piatto al più "trama". */
export async function backgrounds(): Promise<Record<string, Buffer>> {
  const rnd = prng(7)
  const blobs = Array.from({ length: 14 }, () => `<ellipse cx="${rnd() * PW}" cy="${rnd() * PH}" rx="${40 + rnd() * 160}" ry="${40 + rnd() * 160}" fill="hsl(${Math.round(rnd() * 360)},55%,${25 + Math.round(rnd() * 40)}%)"/>`).join("")
  const windows: string[] = []
  for (let y = 430; y < 740; y += 9) for (let x = 6; x < PW; x += 8) if (rnd() > 0.35) windows.push(`<rect x="${x}" y="${y}" width="4" height="5" fill="#ffd27a"/>`)
  const trunks = Array.from({ length: 22 }, (_, i) => `<rect x="${i * 23 + rnd() * 8}" y="0" width="${4 + rnd() * 9}" height="${PH}" fill="#2a1c10"/>`).join("")
  const stripes = Array.from({ length: 60 }, (_, i) => `<line x1="${i * 20 - 300}" y1="0" x2="${i * 20 + 200}" y2="${PH}" stroke="#c8c8c8" stroke-width="5"/>`).join("")
  const face = `<ellipse cx="250" cy="300" rx="130" ry="170" fill="#d9a07a"/><ellipse cx="200" cy="270" rx="22" ry="10" fill="#222"/><ellipse cx="300" cy="270" rx="22" ry="10" fill="#222"/><path d="M200 380 Q250 410 300 380" stroke="#7a2a2a" stroke-width="8" fill="none"/><path d="M120 200 Q250 60 380 200" stroke="#3a2412" stroke-width="40" fill="none"/>`
  const hair = Array.from({ length: 90 }, () => { const x = 120 + rnd() * 260; return `<path d="M${x} 120 Q${x + (rnd() - 0.5) * 60} 300 ${x + (rnd() - 0.5) * 80} 520" stroke="#3a2412" stroke-width="1.5" fill="none"/>` }).join("")
  return {
    gradient: await svgImage(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a33"/><stop offset="1" stop-color="#d98c3a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`),
    blobs: await sharp(await svgImage(blobs, "#223")).blur(12).png().toBuffer(),
    foliage: await noise(11, 1.2, 1.8, -90),
    sand: await noise(12, 0.5, 1.4, -40),
    clouds: await noise(13, 6, 3, -260),
    city: await svgImage(`<rect y="420" width="${PW}" height="330" fill="#0b0b14"/>${windows.join("")}`, "#1a2440"),
    forest: await svgImage(trunks, "#4a7a3a"),
    fabric: await svgImage(stripes, "#555"),
    face: await sharp(await svgImage(face, "#203040")).blur(2).png().toBuffer(),
    hair: await svgImage(face + hair, "#203040"),
  }
}

export interface TextSpec {
  readonly text: string
  readonly y: number // frazione dell'altezza (centro della riga)
  readonly size: number // frazione dell'altezza
  readonly fill?: string
  readonly family?: string
  readonly weight?: number
  readonly lines?: number
}

/** Sovrappone testo (font del bundle via resvg) a uno sfondo. */
export async function withText(bg: Buffer, specs: readonly TextSpec[]): Promise<Buffer> {
  const els = specs.flatMap((s) => {
    const fs = Math.round(s.size * PH)
    const lines = s.lines ?? 1
    return Array.from({ length: lines }, (_, i) => `<text x="${PW / 2}" y="${Math.round(s.y * PH + i * fs * 1.3)}" text-anchor="middle" dominant-baseline="central" font-family="${s.family ?? "Inter"}" font-weight="${s.weight ?? 800}" font-size="${fs}" fill="${s.fill ?? "#ffffff"}">${s.text}</text>`)
  }).join("")
  const overlay = await renderSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">${els}</svg>`, PW)
  return sharp(bg).composite([{ input: overlay }]).png().toBuffer()
}

export const TITLE_CASES: Record<string, readonly TextSpec[]> = {
  "title-top": [{ text: "THE MATRIX", y: 0.12, size: 0.08 }],
  "title-bottom": [{ text: "THE MATRIX", y: 0.82, size: 0.08 }],
  "title-center-big": [{ text: "INCEPTION", y: 0.5, size: 0.12 }],
  "title-hebrew": [{ text: "המטריקס", y: 0.8, size: 0.09, family: "Rubik" }],
  "title-dark": [{ text: "DUNE", y: 0.15, size: 0.1, fill: "#111111" }],
  "tagline-small": [{ text: "Reality is a thing of the past", y: 0.9, size: 0.03, weight: 500 }],
  "billing-block": [{ text: "DIRECTED BY LANA WACHOWSKI PRODUCED BY JOEL SILVER MUSIC BY DON DAVIS", y: 0.92, size: 0.014, weight: 500, lines: 3 }],
  "short-title": [{ text: "UP", y: 0.2, size: 0.14 }],
  "two-lines": [{ text: "PULP", y: 0.72, size: 0.09 }, { text: "FICTION", y: 0.82, size: 0.09 }],
}
