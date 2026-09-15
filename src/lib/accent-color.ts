import { GENRE_FALLBACK } from "./badges"

export interface AccentResult { r: number; g: number; b: number }

/** sRGB linearization per componente [0,255] → [0,1] */
function linearize(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Luminanza relativa sRGB (WCAG) */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/** Rapporto di contrasto WCAG tra due luminanze */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Sceglie il colore testo con miglior contrasto WCAG.
 * Valuta colore chiaro (`dark`) e scuro (`light`) contro lo sfondo.
 */
export function textColorForBg(hex: string, dark: string = "#ffffff", light: string = "rgba(0,0,0,0.80)"): string {
  if (!hex || hex === "#555555") return light
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const bgLum = relativeLuminance(r, g, b)

  const best = [dark, light]
    .map((textColor) => {
      const [tr, tg, tb, ta] = parseColor(textColor)
      const effectiveR = ta < 1 ? Math.round(tr * ta + r * (1 - ta)) : tr
      const effectiveG = ta < 1 ? Math.round(tg * ta + g * (1 - ta)) : tg
      const effectiveB = ta < 1 ? Math.round(tb * ta + b * (1 - ta)) : tb
      const textLum = relativeLuminance(effectiveR, effectiveG, effectiveB)
      return { color: textColor, ratio: contrastRatio(textLum, bgLum) }
    })
    .sort((a, b) => b.ratio - a.ratio)[0]

  return best.color
}

/** Parsea "#rrggbb" o "rgba(r,g,b,a)" restituendo [r,g,b,alpha]. Hex: alpha=1 */
function parseColor(color: string): [number, number, number, number] {
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ]
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      1,
    ]
  }
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
  if (match) {
    return [
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
      match[4] !== undefined ? parseFloat(match[4]) : 1,
    ]
  }
  return [0, 0, 0, 1]
}

/** Approssimazione hue veloce da RGB normalizzati [0,1], risultato [0, 360) */
function fastHue(r: number, g: number, b: number, d: number, max: number): number {
  if (d === 0) return 0
  let h: number
  if (max === r) h = 60 * ((g - b) / d)
  else if (max === g) h = 60 * (2 + (b - r) / d)
  else h = 60 * (4 + (r - g) / d)
  return h < 0 ? h + 360 : h
}

/** Convert HSL to RGB (H: 0-360, S: 0-1, L: 0-1) */
function hslToRgb(H: number, S: number, L: number): AccentResult {
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs((H / 60) % 2 - 1))
  const m = L - c / 2
  let r1 = 0, g1 = 0, b1 = 0
  if (H < 60) { r1 = c; g1 = x }
  else if (H < 120) { r1 = x; g1 = c }
  else if (H < 180) { r1 = 0; g1 = c; b1 = x }
  else if (H < 240) { r1 = 0; g1 = x; b1 = c }
  else if (H < 300) { r1 = x; g1 = 0; b1 = c }
  else { r1 = c; g1 = 0; b1 = x }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

export interface BucketAnalysis {
  readonly hue: number
  readonly avgSat: number
  readonly vibrantWeight: number
  readonly bgRelLum: number
  readonly avgR: number
  readonly avgG: number
  readonly avgB: number
  readonly countLuma: number
}

export function analyzeBuckets(
  pixels: Uint8ClampedArray | Buffer,
  width: number,
  height: number,
): BucketAnalysis {
  const step = 2
  let sumR = 0, sumG = 0, sumB = 0, countLuma = 0

  // 12 hue buckets (30° each)
  const buckets = Array.from({ length: 12 }, () => ({
    count: 0,
    totalSat: 0,
    hueSin: 0,
    hueCos: 0,
  }))
  let totalVibrantWeight = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const pr = pixels[i], pg = pixels[i + 1], pb = pixels[i + 2]
      const alpha = pixels[i + 3]
      if (alpha < 128) continue

      sumR += pr; sumG += pg; sumB += pb
      countLuma++

      const r = pr / 255, g = pg / 255, b = pb / 255
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const l = (max + min) / 2, d = max - min
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (s < 0.12 || l < 0.08 || l > 0.94) continue

      const hue = fastHue(r, g, b, d, max)
      const bucketIdx = Math.floor(hue / 30) % 12
      const bkt = buckets[bucketIdx]
      // Penalità per scuro/chiaro: al badge serve contrasto per il testo.
      const weight = Math.pow(s, 1.5) * (1 - Math.abs(l - 0.5) * 1.5)
      bkt.count += weight
      bkt.totalSat += s * weight
      bkt.hueSin += Math.sin(hue * Math.PI / 180) * weight
      bkt.hueCos += Math.cos(hue * Math.PI / 180) * weight
      totalVibrantWeight += weight
    }
  }

  // Compute background relative luminance (WCAG) from average RGB
  const avgR = countLuma > 0 ? sumR / countLuma : 128
  const avgG = countLuma > 0 ? sumG / countLuma : 128
  const avgB = countLuma > 0 ? sumB / countLuma : 128
  const bgRelLum = relativeLuminance(avgR, avgG, avgB)

  if (totalVibrantWeight < 1) {
    return {
      hue: 0,
      avgSat: 0,
      vibrantWeight: totalVibrantWeight,
      bgRelLum,
      avgR,
      avgG,
      avgB,
      countLuma,
    }
  }

  // Find most vibrant hue bucket
  let bestBucket = buckets[0]
  for (const bkt of buckets) {
    if (bkt.count > bestBucket.count) bestBucket = bkt
  }

  // Dominant hue of the poster
  const posterHue = ((Math.atan2(bestBucket.hueSin, bestBucket.hueCos) * 180 / Math.PI) % 360 + 360) % 360
  const avgSat = bestBucket.count > 0 ? bestBucket.totalSat / bestBucket.count : 0

  return {
    hue: posterHue,
    avgSat,
    vibrantWeight: totalVibrantWeight,
    bgRelLum,
    avgR,
    avgG,
    avgB,
    countLuma,
  }
}

/**
 * Rotazione di tinta applicata al colore estratto.
 *
 * `complement` (+150°) è il comportamento storico: un colore che "stacca"
 * dall'artwork. `dominant` (0°) tiene la tinta del poster ed è quello che
 * l'interruttore "Poster colour accent" seleziona.
 */
export type AccentHueMode = "complement" | "dominant"

const ACCENT_HUE_ROTATION: Record<AccentHueMode, number> = {
  complement: 150,
  dominant: 0,
}

export function findAccentColor(pixels: Uint8ClampedArray | Buffer, width: number, height: number, genre: string, hueMode: AccentHueMode = "complement"): AccentResult {
  const analysis = analyzeBuckets(pixels, width, height)

  // Fallback for monochrome/flat posters → genre palette color, contrast-adjusted
  if (analysis.vibrantWeight < 1) {
    const fb = GENRE_FALLBACK[genre] || '#C0C0C0'
    const cr = parseInt(fb.slice(1, 3), 16)
    const cg = parseInt(fb.slice(3, 5), 16)
    const cb = parseInt(fb.slice(5, 7), 16)
    const avgRawLum = analysis.countLuma > 0
      ? (0.2126 * analysis.avgR + 0.7152 * analysis.avgG + 0.0722 * analysis.avgB) / 255
      : 0.5
    return pushContrast({ r: cr, g: cg, b: cb }, avgRawLum)
  }

  const { hue: posterHue, avgSat, bgRelLum } = analysis

  // --- Split-Complementary Harmony (+150°) ---
  // Rotating by 150° gives a badge color that is:
  //   - Harmonious with the poster by color theory
  //   - Naturally contrasting (not the same hue family as the bg)
  // Examples:
  //   Blue-violet (251°) → 251+150 = 41° → warm orange  🟠
  //   Orange-sandy (35°) → 35+150  = 185° → cool cyan   🩵
  //   Green (120°)       → 120+150 = 270° → violet      🟣
  //   Red (0°)           → 0+150   = 150° → teal        🩵
  //   Cyan (180°)        → 180+150 = 330° → pink-rose   🌸
  const badgeHue = (posterHue + ACCENT_HUE_ROTATION[hueMode]) % 360

  // Higher saturation since we're using a contrasting hue (not blending, but popping)
  const badgeSat = Math.min(0.82, Math.max(0.55, avgSat))

  // Lightness strategy:
  //   Dark poster  (bgRelLum < 0.18)  → very light badge (L=0.88) → cream/pastel tones
  //                                      Contrast on these dark bgs is always >8:1 at L=0.88
  //   Mid/light poster (bgRelLum ≥ 0.18) → binary-search for a darker badge that passes 3:1
  const targetL = bgRelLum < 0.18
    ? 0.88
    : findContrastingLightness(badgeHue, badgeSat, bgRelLum, 3.0)

  const result = hslToRgb(badgeHue, badgeSat, targetL)
  result.r = Math.max(0, Math.min(255, result.r))
  result.g = Math.max(0, Math.min(255, result.g))
  result.b = Math.max(0, Math.min(255, result.b))
  return result
}

/** Croma minimo perché un pixel voti la tonalità: sotto è grigio, non colore. */
const MIN_PIXEL_CHROMA = 0.02

/** Croma medio minimo della striscia perché valga la pena tingerla. */
const MIN_REGION_CHROMA = 0.05

/** Tetto di saturazione: limita una tinta accesa, non ne alza mai una spenta. */
const MAX_SCENE_SAT = 0.55

/**
 * Tinta della fascia sfocata: descrive la striscia che il blur coprirà.
 *
 * Tonalità, saturazione e luminosità escono TUTTE dai pixel campionati. La
 * versione precedente prendeva solo la tonalità dominante della cornice esterna
 * e poi forzava S in [0.30, 0.50] e L a 0.20, e quei due vincoli inventavano il
 * colore: un nero caldo con il 3% di croma usciva marrone, un poster bianco
 * prendeva il rosso di un dettaglio minuscolo, un rosso uniforme riceveva una
 * fascia più scura del rosso che copriva.
 *
 * Qui la saturazione è quella misurata (solo limitata verso l'alto, mai alzata)
 * e la luminosità è quella misurata, così a scurire la fascia resta solo
 * `blurDarkness`, nella misura configurata.
 *
 * Restituisce `null` quando la striscia è sostanzialmente acromatica: un poster
 * senza colore non deve riceverne uno. `applyBlur` tratta l'assenza di
 * `accentColor` come fascia non tinta, quindi resta sfocatura più shade.
 */
export function findSceneTint(
  pixels: Uint8ClampedArray | Buffer,
  width: number,
  height: number,
): AccentResult | null {
  const step = 2
  let sampled = 0
  let sumL = 0
  let sumC = 0
  let hueSin = 0, hueCos = 0, hueWeight = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (pixels[i + 3] < 128) continue

      const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const l = (max + min) / 2
      const c = max - min

      sampled++
      sumL += l
      sumC += c

      // Voto pesato per croma × area: un campo ampio e appena tinto batte pochi
      // pixel accesi. È il caso del poster bianco con i tacchi rossi, dove la
      // media pesata per sola saturazione eleggeva i tacchi.
      if (c >= MIN_PIXEL_CHROMA) {
        const hue = fastHue(r, g, b, c, max)
        hueSin += Math.sin(hue * Math.PI / 180) * c
        hueCos += Math.cos(hue * Math.PI / 180) * c
        hueWeight += c
      }
    }
  }

  if (sampled === 0 || hueWeight <= 0) return null

  const meanL = sumL / sampled
  const meanC = sumC / sampled
  if (meanC < MIN_REGION_CHROMA) return null

  // C = (1 - |2L-1|) · S è la definizione HSL: invertirla restituisce la tinta
  // con esattamente il croma e la luminosità misurati sulla striscia.
  const span = 1 - Math.abs(2 * meanL - 1)
  if (span <= 0.001) return null

  const hue = ((Math.atan2(hueSin, hueCos) * 180 / Math.PI) % 360 + 360) % 360
  const sat = Math.min(MAX_SCENE_SAT, meanC / span)
  const res = hslToRgb(hue, sat, meanL)
  return {
    r: Math.max(0, Math.min(255, res.r)),
    g: Math.max(0, Math.min(255, res.g)),
    b: Math.max(0, Math.min(255, res.b)),
  }
}

/**
 * Binary-search for the HSL lightness value that achieves the target WCAG
 * contrast ratio against bgRelLum, while staying in a visually pleasant range.
 * - Dark background (bgRelLum < 0.18) → we search for a lighter badge color
 * - Light background (bgRelLum ≥ 0.18) → we search for a darker badge color
 */
function findContrastingLightness(H: number, S: number, bgRelLum: number, targetContrast: number): number {
  const wantLight = bgRelLum < 0.18

  let lo = wantLight ? 0.45 : 0.05
  let hi = wantLight ? 0.95 : 0.50
  let bestL = wantLight ? 0.80 : 0.30

  for (let iter = 0; iter < 18; iter++) {
    const mid = (lo + hi) / 2
    const rgb = hslToRgb(H, S, mid)
    const lum = relativeLuminance(rgb.r, rgb.g, rgb.b)
    const contrast = contrastRatio(lum, bgRelLum)

    if (contrast >= targetContrast) {
      bestL = mid
      // Achieved contrast — try a less extreme value for elegance
      if (wantLight) hi = mid
      else lo = mid
    } else {
      // Need more contrast — push more extreme
      if (wantLight) lo = mid
      else hi = mid
    }
  }

  // Guard: stay off pure white/black
  return Math.max(0.18, Math.min(0.92, bestL))
}

/**
 * Spinge la luminanza del colore nella direzione opposta allo sfondo,
 * in modo che il badge sia ben visibile (fallback per poster monocromatici).
 */
function pushContrast(color: AccentResult, bgLum: number): AccentResult {
  let { r, g, b } = color
  const currentLum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

  // Transizione fluida: da bgLum 0.5 nessuna spinta, a bgLum 0.0/1.0 spinta massima
  const contrastNeeded = (bgLum - 0.5) * 2  // -1 (scuro) a +1 (chiaro)
  const rawTarget = 0.53 - contrastNeeded * 0.35  // 0.88 (sfondo scuro) a 0.18 (sfondo chiaro)
  const targetLum = Math.max(0.15, Math.min(0.88, rawTarget))

  const diff = targetLum - currentLum
  if (Math.abs(diff) < 0.02) return { r, g, b }  // già vicino al target

  const pushStrength = 0.65
  const blendedLum = currentLum + diff * pushStrength
  const scale = Math.max(0.15, Math.min(
    blendedLum / Math.max(currentLum, 0.001),
    255 / Math.max(r, g, b, 1),
  ))

  r = Math.min(255, Math.max(0, Math.round(r * scale)))
  g = Math.min(255, Math.max(0, Math.round(g * scale)))
  b = Math.min(255, Math.max(0, Math.round(b * scale)))

  return { r, g, b }
}

export function topEdgeAverage(pixels: Uint8ClampedArray | Buffer, width: number, height: number): { r: number; g: number; b: number } {
  const rowCount = Math.max(Math.round(height * 0.08), 3)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = 0; y < rowCount; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]
      n++
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}
