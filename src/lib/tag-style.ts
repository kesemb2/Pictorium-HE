/**
 * Fork: stile poster "Tag" (alternativo al classico).
 *
 * Niente fascia sfocata né riga genere/anno/voto: l'artwork resta pulito in
 * alto, il logo sta in basso dentro una card di vetro smerigliato insieme al
 * titolo ebraico, e sotto, staccata, una "tag" di vetro a filo del bordo con lo
 * stato del titolo (nuova stagione, prima, classifica…). Una dissolvenza scura
 * dal basso (opzionale, default on) tiene leggibile il vetro sui poster chiari.
 *
 * Il vetro è sfocatura REALE di ciò che sta sotto (non un gradiente): si
 * ricava dalla tela già composta (poster + vignetta + dissolvenza), si scurisce
 * e si maschera alla forma. Per questo il modulo riceve la tela e restituisce
 * i layer da comporre in ordine: dissolvenza, vetri, logo, titolo, testo tag.
 */
import sharp from "sharp"
import type { BadgeFontSpec } from "./badge-styles"
import { escSvg, estimateTextWidth, fontFamilyFor, rtlSafe } from "./badge-svg-shared"
import { renderSVG } from "./svg-badge"

export type TagLayer = { input: Buffer; top: number; left: number }

type Placed = { input: Buffer; w: number; h: number; left: number; top: number }

export interface TagStyleInput {
  /** Tela già composta sotto al nuovo strato (poster + vignetta + angoli). */
  readonly base: Buffer
  readonly canvasW: number
  readonly canvasH: number
  /** Logo già ridimensionato (posizione orizzontale dal layout classico). */
  readonly logo: Placed | null
  /** Striscia del titolo tradotto, già renderizzata. */
  readonly title: { png: Buffer; w: number; h: number } | null
  /** Testo della tag; null → niente tag. */
  readonly tagLabel: string | null
  /** Dissolvenza scura dal basso fin sopra la card. */
  readonly fade: boolean
  /**
   * Card di vetro dietro logo e titolo (default true). Senza, logo e titolo
   * poggiano sulla sola dissolvenza, che allora è sempre attiva: senza vetro
   * né dissolvenza il logo tornerebbe sull'artwork nudo.
   */
  readonly card?: boolean
  readonly font?: BadgeFontSpec
  /** Grandezza della tag (1 = default del formato). */
  readonly size?: number
}

/** Scala delle misure: ritratto 500×750 = 1, landscape 768×432 ≈ 0.72. */
export function tagScale(canvasW: number, canvasH: number): number {
  return Math.min(canvasW / 500, canvasH / 600)
}

const GLASS_BLUR = 16
const GLASS_BRIGHTNESS = 0.7
const GLASS_WASH = 0.06
const GLASS_EDGE = 0.28
const FADE_STRENGTH_MID = 0.68
const FADE_STRENGTH_BOTTOM = 0.85
/** In orizzontale il fondo è quasi nero (riferimento): logo e tag ci stanno sopra. */
const FADE_LANDSCAPE_MID = 0.8
const FADE_LANDSCAPE_BOTTOM = 0.95

function round(n: number): number {
  return Math.round(n)
}

/** Vetro smerigliato: sfocatura reale della tela nel rettangolo, mascherata. */
async function frostedGlass(
  base: Buffer,
  rect: { left: number; top: number; width: number; height: number },
  radius: number,
  flushBottom: boolean,
  s: number,
): Promise<TagLayer | null> {
  const width = round(rect.width)
  const height = round(rect.height)
  if (width < 4 || height < 4) return null
  const r = Math.min(round(radius), Math.floor(Math.min(width, height) / 2))
  const blurred = await sharp(base)
    .extract({ left: round(rect.left), top: round(rect.top), width, height })
    .blur(Math.max(0.3, GLASS_BLUR * s))
    .modulate({ brightness: GLASS_BRIGHTNESS, saturation: 1.1 })
    .png()
    .toBuffer()
  const shape = flushBottom
    ? `<path d="M0,${height} L0,${r} Q0,0 ${r},0 L${width - r},0 Q${width},0 ${width},${r} L${width},${height} Z" fill="#fff"/>`
    : `<rect width="${width}" height="${height}" rx="${r}" fill="#fff"/>`
  const edge = flushBottom
    ? `<path d="M0.75,${height} L0.75,${r} Q0.75,0.75 ${r},0.75 L${width - r},0.75 Q${width - 0.75},0.75 ${width - 0.75},${r} L${width - 0.75},${height}" fill="none" stroke="rgba(255,255,255,${GLASS_EDGE})" stroke-width="1.5"/>`
    : `<rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="${r}" fill="none" stroke="rgba(255,255,255,${GLASS_EDGE})" stroke-width="1.5"/>`
  const svg = (inner: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${inner}</svg>`)
  const glass = await sharp(blurred)
    .composite([
      { input: svg(`<rect width="100%" height="100%" fill="rgba(255,255,255,${GLASS_WASH})"/>`) },
      { input: svg(edge) },
      { input: svg(shape), blend: "dest-in" },
    ])
    .png()
    .toBuffer()
  return { input: glass, top: round(rect.top), left: round(rect.left) }
}

/** Misure della tag: altezza, corpo del testo, margini, larghezza minima. */
export interface TagMetrics {
  readonly h: number
  readonly fs: number
  readonly padX: number
  readonly minW: number
}

/**
 * Misure della tag per formato. Verticale: quelle di sempre (66px a 500×750).
 * Orizzontale: dal riferimento 1920×1080 — tag alta il 13.4% del canvas, testo
 * grande, margini ampi — perché sul 16:9 la tag è il secondo elemento della
 * scena dopo il logo.
 */
export function tagMetrics(canvasW: number, canvasH: number, size = 1): TagMetrics {
  const k = Math.min(1.6, Math.max(0.5, size))
  if (canvasW > canvasH) {
    const h = Math.round(canvasH * 0.134 * k)
    return { h, fs: Math.round(h * 0.64), padX: Math.round(h * 0.72), minW: Math.round(h * 2.2) }
  }
  const s = tagScale(canvasW, canvasH) * k
  return { h: Math.round(66 * s), fs: Math.round(30 * s), padX: Math.round(30 * s), minW: Math.round(120 * s) }
}

/** Testo bianco della tag (auto-ridotto per stare entro `maxW`). */
async function tagText(label: string, maxW: number, m: TagMetrics, font?: BadgeFontSpec): Promise<{ png: Buffer; w: number; h: number; padX: number }> {
  let fs = m.fs
  const padX = m.padX
  while (fs > 12 && estimateTextWidth(label, fs, font) + padX * 2 > maxW) fs -= 1
  const textW = Math.round(estimateTextWidth(label, fs, font))
  const w = Math.min(Math.round(maxW), Math.max(textW + padX * 2, m.minW))
  const h = m.h
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${w / 2}" y="${h / 2 + h * 0.03}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(label, font)}" font-weight="700" font-size="${fs}" fill="#ffffff">${escSvg(rtlSafe(label))}</text></svg>`
  return { png: await renderSVG(svg, w), w, h, padX }
}

/**
 * Layer dello stile Tag, già posizionati. Il logo (e il titolo) si spostano
 * in verticale: la card poggia sulla tag, o sul fondo quando non c'è tag.
 */
export async function composeTagStyle(input: TagStyleInput): Promise<{ layers: TagLayer[]; logoTop: number | null; tagRect: { left: number; top: number; width: number; height: number } | null }> {
  const { canvasW: W, canvasH: H, logo, title, tagLabel, font } = input
  const cardOn = input.card !== false
  const fade = input.fade || !cardOn
  const s = tagScale(W, H)
  // In orizzontale logo e tag stanno al centro del canvas (come il verticale),
  // qualunque sia l'allineamento del layout classico.
  const centerX = W > H || !logo ? W / 2 : logo.left + logo.w / 2

  // Tag (misura prima: la card poggia sopra di lei).
  const tag = tagLabel ? await tagText(tagLabel, W * 0.8, tagMetrics(W, H, input.size), font) : null
  const tagRect = tag
    ? { left: Math.min(Math.max(0, round(centerX - tag.w / 2)), W - tag.w), top: H - tag.h, width: tag.w, height: tag.h }
    : null

  // Card: logo + titolo con padding; poggia sulla tag con uno stacco.
  const padX = round(32 * s)
  const padY = round(20 * s)
  const gapInside = title ? round(6 * s) : 0
  let card: { left: number; top: number; width: number; height: number } | null = null
  let logoTop: number | null = null
  let titleTop: number | null = null
  if (logo) {
    const contentW = Math.max(logo.w, title?.w ?? 0)
    const contentH = logo.h + (title ? gapInside + title.h : 0)
    const cardBottom = tagRect ? tagRect.top - round(14 * s) : H - round(28 * s)
    const cardW = Math.min(W - round(24 * s), contentW + padX * 2)
    const cardH = contentH + padY * 2
    const cardTop = Math.max(round(8 * s), cardBottom - cardH)
    card = { left: Math.min(Math.max(0, round(centerX - cardW / 2)), W - cardW), top: cardTop, width: cardW, height: Math.min(cardH, cardBottom - cardTop) }
    logoTop = cardTop + padY
    titleTop = logoTop + logo.h + gapInside
  }

  const layers: TagLayer[] = []
  let base = input.base

  // Dissolvenza: trasparente sopra la card, scura sul fondo.
  // Senza card la dissolvenza parte più in alto: è lei a fare da fondo al logo.
  const land = W > H
  const fadeTop = card ? Math.max(0, card.top - round((cardOn ? 90 : land ? 140 : 110) * s)) : (tagRect ? Math.max(0, tagRect.top - round(80 * s)) : null)
  if (fade && fadeTop !== null) {
    const mid = (fadeTop + (H - fadeTop) * 0.55) / H
    const midOpacity = land ? FADE_LANDSCAPE_MID : FADE_STRENGTH_MID
    const bottomOpacity = land ? FADE_LANDSCAPE_BOTTOM : FADE_STRENGTH_BOTTOM
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="${(fadeTop / H).toFixed(4)}" stop-color="#000" stop-opacity="0"/><stop offset="${mid.toFixed(4)}" stop-color="#000" stop-opacity="${midOpacity}"/><stop offset="1" stop-color="#000" stop-opacity="${bottomOpacity}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/></svg>`
    const fadePng = await sharp(Buffer.from(svg)).png().toBuffer()
    layers.push({ input: fadePng, top: 0, left: 0 })
    // Il vetro deve sfocare ciò che si vede davvero: la dissolvenza inclusa.
    base = await sharp(base).composite([{ input: fadePng, top: 0, left: 0 }]).png().toBuffer()
  }

  const [cardGlass, tagGlass] = await Promise.all([
    card && cardOn ? frostedGlass(base, card, 22 * s, false, s) : Promise.resolve(null),
    tagRect ? frostedGlass(base, tagRect, 20 * s, true, s) : Promise.resolve(null),
  ])
  if (cardGlass) layers.push(cardGlass)
  if (tagGlass) layers.push(tagGlass)
  // Il logo segue lo stesso asse della card e della tag (in orizzontale il
  // layout classico lo allinea a sinistra: qui torna al centro).
  if (logo && logoTop !== null) {
    layers.push({ input: logo.input, top: logoTop, left: Math.min(Math.max(0, round(centerX - logo.w / 2)), Math.max(0, W - logo.w)) })
  }
  if (title && titleTop !== null) {
    layers.push({ input: title.png, top: titleTop, left: Math.min(Math.max(0, round(centerX - title.w / 2)), Math.max(0, W - title.w)) })
  }
  if (tag && tagRect) layers.push({ input: tag.png, top: tagRect.top, left: tagRect.left })
  return { layers, logoTop, tagRect }
}

/** Testo della tag dal badge superiore calcolato (null = niente tag). */
export function tagLabelFor(
  badge: { type: "extra"; label: string } | { type: "rank"; rank: number; label: string; ribbonLabel?: string } | null,
  topWord: string,
): string | null {
  if (!badge) return null
  if (badge.type === "extra") return badge.label.trim() || null
  const period = badge.ribbonLabel?.trim()
  return period ? `${topWord} ${badge.rank} · ${period}` : `${topWord} ${badge.rank}`
}
