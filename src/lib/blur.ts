import sharp from "sharp"
import { STD_W, STD_H } from "./image-utils"

/**
 * Build the bottom-blur RGBA overlay (dual-stage progressive blur + quadratic scrim + accent tint).
 *
 * ## Performance Contract
 *
 * - Historic baseline (single-stage linear): ~8-15 ms (STD canvas)
 * - Progressive dual-stage, misurato via `npx vitest bench src/__tests__/blur.bench.ts`
 *   (vitest 4.1, 110+ campioni): STD 500x750 mean ~4.4 ms / p99 ~7.0 ms;
 *   sotto il baseline storico.
 * - Zero intermediate PNG encodes/decodes (restituisce un Buffer RGBA grezzo direttamente a sharp.composite)
 *
 * ## Algorithm
 *
 * 1. Estrazione con bleed (16px sopra gradTop) per eliminare artefatti di cucitura.
 * 2. Doppio passaggio gaussiano concorrente (low-sigma all'inizio zona, high-sigma al fondo).
 * 3. Interpolazione progressiva nel loop raw RGBA:
 *    - Curva opacità: smoothstep S(u) = u² · (3 - 2u)
 *    - Curva scurimento: shade(u) = 1 - darkAlpha · u² (quadratica, fondo compatto)
 *    - Blend sigma: smoothstep S(t) da sigmaLow a sigmaHigh (diffusione progressiva)
 *    - Tinta accento: lerp cromatico controllato (default 20%) verso accentColor
 */
export interface BlurParams {
  posterBuf: Buffer
  blurEnabled: boolean
  blurHeight: number
  blurIntensity: number
  blurFade: number
  blurDarkness: number
  /** Dimensioni canvas. Qui c'è solo il ritratto standard; restano parametri
   *  per non divergere da upstream, che rende anche un canvas 16:9. */
  canvasW?: number
  canvasH?: number
  /** Colore accento facoltativo (#RRGGBB) per tinta tonale cinematografica al fondo. */
  accentColor?: string
  /** Frazione di miscelazione tinta accento al fondo (default 0.20 = 20%, calibrata per non sovrastare l'artwork). */
  tintStrength?: number
}

export interface BandGeometry {
  /** Altezza della fascia in pixel (clampata come nel render). */
  readonly gh: number
  /** Prima riga della fascia vera e propria. */
  readonly gradTop: number
  /** Prima riga dell'overlay, `gradTop` meno il bleed di cucitura. */
  readonly extTop: number
  /** Altezza dell'overlay, bleed incluso. */
  readonly extH: number
  /** Frazione dell'overlay occupata dalla rampa di opacità. */
  readonly fadeStop: number
  /** Prima riga del poster in cui la fascia è completamente opaca. */
  readonly opaqueFrom: number
}

/**
 * Geometria della fascia, unica fonte di verità.
 *
 * `applyBlur` la usa per comporre e `fitBandToPoster` per sapere DOVE cade la
 * rampa prima di deciderne la pendenza: due copie della stessa aritmetica
 * finirebbero per divergere, e la fascia adattata non corrisponderebbe più a
 * quella disegnata.
 */
export function bandGeometry(blurHeight: number, blurFade: number, canvasH: number = STD_H): BandGeometry {
  const gh = Math.min(Math.max(Math.round(canvasH * blurHeight / 100), 100), canvasH)
  const gradTop = canvasH - gh
  const pad = Math.min(16, gradTop)
  const extTop = gradTop - pad
  const extH = canvasH - extTop
  const fadeStop = Math.min(Math.max(blurFade, 0), 100) / 100
  const opaqueFrom = extTop + (extH <= 1 ? 0 : Math.ceil(fadeStop * (extH - 1)))
  return { gh, gradTop, extTop, extH, fadeStop, opaqueFrom }
}

export interface BlurOverlay {
  /** Raw RGBA pixels (canvasW × height), da passare a `composite()` con raw. */
  readonly overlay: Buffer
  readonly top: number
  readonly height: number
}

function parseHexColor(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return null
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

export async function applyBlur(params: BlurParams): Promise<BlurOverlay | null> {
  const { posterBuf, blurEnabled, blurHeight, blurIntensity, blurFade, blurDarkness, accentColor, tintStrength: userTintStrength } = params
  if (!blurEnabled) return null
  const canvasW = params.canvasW ?? STD_W
  const canvasH = params.canvasH ?? STD_H

  // Bleed padding (16px) sopra gradTop per eliminare artefatti di cucitura
  // (seam edge clamping): sta dentro `bandGeometry` insieme al resto.
  const { extTop, extH, fadeStop } = bandGeometry(blurHeight, blurFade, canvasH)
  const darkAlpha = Math.min(Math.max(blurDarkness / 100, 0), 1)

  // Sigmi dual-stage: low-sigma all'inizio zona, high-sigma al fondo
  const clampedIntensity = Math.min(Math.max(blurIntensity, 1), 100)
  const sigmaLow = Math.max(1, Math.round(clampedIntensity * 0.25))
  const sigmaHigh = Math.max(sigmaLow + 1, clampedIntensity)

  // Step 1: estrazione con bleed e dual-stage blur concorrente (C++, no PNG intermediate)
  const [blurLow, blurHigh] = await Promise.all([
    sharp(posterBuf)
      .extract({ left: 0, top: extTop, width: canvasW, height: extH })
      .resize(canvasW, extH, { fit: "fill" })
      .blur(sigmaLow)
      .removeAlpha()
      .raw()
      .toBuffer(),
    sharp(posterBuf)
      .extract({ left: 0, top: extTop, width: canvasW, height: extH })
      .resize(canvasW, extH, { fit: "fill" })
      .blur(sigmaHigh)
      .removeAlpha()
      .raw()
      .toBuffer(),
  ])

  // Step 2: composizione RGBA raw con interpolazione progressiva
  const tint = parseHexColor(accentColor)
  // Frazione controllata: 0.20 di default, calibrata per arricchire la base senza sporcare l'artwork
  const tintStrength = tint ? Math.min(Math.max(userTintStrength ?? 0.20, 0), 1) : 0
  const overlay = Buffer.alloc(extH * canvasW * 4)

  for (let y = 0; y < extH; y++) {
    const t = extH <= 1 ? 1 : y / (extH - 1)
    const u = fadeStop <= 0 ? 1 : Math.min(t / fadeStop, 1)

    // Curva smoothstep per transizione opacità (niente stacchi al bordo)
    const smoothU = u * u * (3 - 2 * u)
    const alpha = Math.round(smoothU * 255)

    // Curva quadratica per lo scurimento (preserva i mezzitoni in alto, fondo nero denso)
    const shade = 1 - darkAlpha * (u * u)

    // Interpolazione raggio progressivo con curva smoothstep in t (non lineare secca)
    const wHigh = t * t * (3 - 2 * t)
    const wLow = 1 - wHigh

    // Miscelazione tinta progressiva verso il fondo
    const tintMix = tintStrength * u
    const invTint = 1 - tintMix

    const rowOffset = y * canvasW
    for (let x = 0; x < canvasW; x++) {
      const si = (rowOffset + x) * 3
      const di = (rowOffset + x) * 4

      let r = blurLow[si] * wLow + blurHigh[si] * wHigh
      let g = blurLow[si + 1] * wLow + blurHigh[si + 1] * wHigh
      let b = blurLow[si + 2] * wLow + blurHigh[si + 2] * wHigh

      if (tint) {
        r = r * invTint + tint.r * tintMix
        g = g * invTint + tint.g * tintMix
        b = b * invTint + tint.b * tintMix
      }

      overlay[di] = Math.min(255, Math.max(0, Math.round(r * shade)))
      overlay[di + 1] = Math.min(255, Math.max(0, Math.round(g * shade)))
      overlay[di + 2] = Math.min(255, Math.max(0, Math.round(b * shade)))
      overlay[di + 3] = alpha
    }
  }

  return { overlay, top: extTop, height: extH }
}
