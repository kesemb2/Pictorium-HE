/**
 * Leggibilità del logo sul poster.
 *
 * I loghi TMDB sono quasi sempre bianchi o quasi neri, e il poster sotto può
 * avere la stessa luminosità: il risultato è un logo che sparisce. Qui si misura
 * il contrasto tra l'inchiostro del logo e la fascia di poster su cui cade, e si
 * usa per due cose: scegliere meglio a parità di lingua, e — quando non c'è
 * scelta — decidere se serve una velatura sotto al logo.
 */

import sharp from "sharp"
import { contrastRatio, relativeLuminance } from "./accent-color"
import { SHADOW_DARK, SHADOW_LIGHT } from "./badge-svg-shared"
import { computeRegionStats, STD_H, STD_W } from "./image-utils"
import type { BlurOverlay } from "./blur"

/**
 * Soglia minima. 3.0 è lo stesso obiettivo che `findContrastingLightness` usa
 * già per il badge, cioè il livello WCAG per testo grande e grafica: un logo è
 * esattamente quello.
 */
export const LOGO_CONTRAST_MIN = 3.0

/**
 * Luminanza dell'INCHIOSTRO del logo: media sui soli pixel abbastanza opachi.
 * Un logo è quasi tutto trasparente, quindi la media su tutta l'immagine
 * misurerebbe soprattutto il nulla e darebbe sempre lo stesso valore.
 * Ritorna null quando non c'è abbastanza inchiostro per dire qualcosa.
 */
export async function logoInkLuminance(logoBuf: Buffer): Promise<number | null> {
  try {
    const { data, info } = await sharp(logoBuf)
      .resize(120, 120, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let sum = 0
    let n = 0
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 128) continue
      sum += relativeLuminance(data[i], data[i + 1], data[i + 2])
      n++
    }
    if (n < 16) return null
    return sum / n
  } catch {
    return null
  }
}

export interface ZoneStats {
  /** Luminanza relativa WCAG media della zona, 0-1. */
  readonly luminance: number
  /** Deviazione standard di luma nella zona, 0-255: quanto è movimentata. */
  readonly stdDev: number
}

/**
 * Misura una zona del poster COME LA VEDRÀ chi ci finisce sopra.
 *
 * Con `band` la fascia sfocata viene fusa nel conto — nel render finisce sopra
 * al poster e sotto a logo, titolo e badge — riga per riga:
 * `poster·(1-α) + fascia·α`, con α preso dall'overlay stesso. Senza, si misura
 * il poster nudo.
 *
 * È il test "la fascia sta davvero coprendo questo punto?": dove la fascia
 * copre, la zona esce scura e piatta, e chi legge questi numeri non interviene.
 */
export async function posterZoneStats(
  posterBuf: Buffer,
  zone: { left: number; top: number; width: number; height: number },
  band?: BlurOverlay | null,
): Promise<ZoneStats | null> {
  const left = Math.max(0, Math.round(zone.left))
  const top = Math.max(0, Math.round(zone.top))
  const width = Math.min(STD_W - left, Math.round(zone.width))
  const height = Math.min(STD_H - top, Math.round(zone.height))
  if (width <= 0 || height <= 0) return null

  if (!band) {
    const stats = await computeRegionStats(posterBuf, left, top, width, height)
    if (!stats) return null
    return { luminance: relativeLuminance(stats.meanR, stats.meanG, stats.meanB), stdDev: stats.stdDev }
  }

  try {
    const zonePixels = await sharp(posterBuf)
      .resize(STD_W, STD_H, { fit: "fill" })
      .extract({ left, top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer()

    let sumR = 0, sumG = 0, sumB = 0, sumY = 0, sumYY = 0
    for (let y = 0; y < height; y++) {
      const overlayRow = top + y - band.top
      const covered = overlayRow >= 0 && overlayRow < band.height
      for (let x = 0; x < width; x++) {
        const zi = (y * width + x) * 3
        let r = zonePixels[zi], g = zonePixels[zi + 1], b = zonePixels[zi + 2]
        if (covered) {
          const oi = (overlayRow * STD_W + left + x) * 4
          const a = band.overlay[oi + 3] / 255
          r = r * (1 - a) + band.overlay[oi] * a
          g = g * (1 - a) + band.overlay[oi + 1] * a
          b = b * (1 - a) + band.overlay[oi + 2] * a
        }
        sumR += r; sumG += g; sumB += b
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        sumY += luma
        sumYY += luma * luma
      }
    }
    const n = width * height
    const meanY = sumY / n
    return {
      luminance: relativeLuminance(sumR / n, sumG / n, sumB / n),
      stdDev: Math.sqrt(Math.max(0, sumYY / n - meanY * meanY)),
    }
  } catch {
    return null
  }
}

/**
 * Luminanza della fascia di poster su cui il logo verrà composto. Il rettangolo
 * arriva da `computeLogoLayout`, così si misura esattamente ciò che starà dietro
 * al logo e non il poster nel suo insieme.
 *
 * Con `band` tiene conto della fascia sfocata: vedi `posterZoneStats`. La
 * differenza non è accademica — un logo nero su poster bianco misurato sul
 * poster nudo risulta ad alto contrasto e non riceve velatura, salvo poi
 * sparire perché la fascia ha scurito proprio quella zona.
 */
export async function posterLogoZoneLuminance(
  posterBuf: Buffer,
  zone: { left: number; top: number; width: number; height: number },
  band?: BlurOverlay | null,
): Promise<number | null> {
  const stats = await posterZoneStats(posterBuf, zone, band)
  return stats ? stats.luminance : null
}

/**
 * Soglie di lettura di una zona.
 *
 * `BRIGHT` è tarato su un campo bianco, non su una fotografia chiara, e va
 * insieme a `FLAT`: un poster luminoso ma movimentato non è un caso da glifi
 * neri, è un caso da alone. `BUSY` è dove l'artwork comincia a mangiarsi il
 * testo, e `BUSY_FULL` dove l'alone arriva al massimo.
 */
export const ZONE_BRIGHT_LUMINANCE = 0.58
export const ZONE_FLAT_STDDEV = 28
export const ZONE_BUSY_STDDEV = 30
const ZONE_BUSY_FULL_STDDEV = 70

/** Nero dei glifi: lo stesso del badge in alto su poster chiaro. */
export const DARK_GLYPH_COLOR = "rgba(0,0,0,0.88)"

export interface ZoneTextTreatment {
  /** Colore dei glifi, o stringa vuota per lasciare il chiaro di sempre. */
  readonly color: string
  /** Canale RGB dell'ombra, "r,g,b". */
  readonly shadowColor: string
  /** Forza dell'alone, 0-1. */
  readonly halo: number
}

/**
 * Come va trattato il testo che cade su questa zona.
 *
 * Due casi, che si escludono a vicenda perché misurano cose diverse:
 *
 * - **chiara e piatta** (un campo bianco): glifi neri, e ombra CHIARA — un'ombra
 *   nera dietro glifi neri non stacca niente;
 * - **movimentata**: alone largo e debole, proporzionato a quanto è movimentata,
 *   perché il testo si stacchi senza disegnare una macchia.
 *
 * Una zona che la fascia copre davvero esce scura e piatta da `posterZoneStats`,
 * quindi non ricade in nessuno dei due e il testo resta com'è.
 */
export function zoneTextTreatment(
  stats: ZoneStats | null,
  opts: { readonly darkText: boolean; readonly halo: boolean },
): ZoneTextTreatment {
  const none: ZoneTextTreatment = { color: "", shadowColor: SHADOW_DARK, halo: 0 }
  if (!stats) return none

  if (opts.darkText && stats.luminance >= ZONE_BRIGHT_LUMINANCE && stats.stdDev <= ZONE_FLAT_STDDEV) {
    return { color: DARK_GLYPH_COLOR, shadowColor: SHADOW_LIGHT, halo: 0 }
  }

  if (opts.halo && stats.stdDev > ZONE_BUSY_STDDEV) {
    const span = ZONE_BUSY_FULL_STDDEV - ZONE_BUSY_STDDEV
    return { ...none, halo: Math.min(1, (stats.stdDev - ZONE_BUSY_STDDEV) / span) }
  }

  return none
}

/**
 * Alone sagomato come il logo: il suo stesso canale alpha, sfocato e dipinto di
 * nero. A differenza della velatura ellittica segue i glifi, quindi funziona
 * anche quando solo una parte del logo cade su un punto difficile.
 */
export async function buildLogoHalo(
  logoPng: Buffer,
  width: number,
  height: number,
  strength: number,
): Promise<Buffer | null> {
  if (strength <= 0 || width <= 0 || height <= 0) return null
  try {
    const pad = Math.max(4, Math.round(Math.min(width, height) * 0.08))
    const w = width + pad * 2
    const h = height + pad * 2
    // L'alpha del logo, centrata nel riquadro allargato e sfocata: è la sagoma.
    const alpha = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: await sharp(logoPng).resize(width, height, { fit: "fill" }).toBuffer(), top: pad, left: pad }])
      .extractChannel("alpha")
      .blur(Math.max(1, pad * 0.9))
      // `raw`: `joinChannel` più sotto legge questi byte come pixel grezzi, e
      // un PNG codificato lì dentro verrebbe interpretato come tale.
      .raw()
      .toBuffer()

    // La forza si applica qui e non con `.linear()`: sharp esegue le operazioni
    // in un ordine suo, non in quello di chiamata, e linear finiva prima di
    // `extractChannel` — cioè sui canali sbagliati, lasciando l'alone a piena
    // opacità a qualunque forza.
    const gain = Math.min(1, Math.max(0, strength)) * LOGO_HALO_MAX_ALPHA
    for (let i = 0; i < alpha.length; i++) alpha[i] = Math.round(alpha[i] * gain)

    return await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toBuffer()
  } catch {
    return null
  }
}

/** Tetto dell'alone del logo: deve staccare, non disegnare una macchia. */
const LOGO_HALO_MAX_ALPHA = 0.55

/**
 * Contrasto WCAG tra logo e fascia. `null` per uno dei due significa "non
 * misurabile": si ritorna la soglia, cioè "non intervenire", perché inventare
 * un valore basso farebbe comparire velature su poster che non ne hanno bisogno.
 */
export function logoContrast(logoLum: number | null, zoneLum: number | null): number {
  if (logoLum === null || zoneLum === null) return LOGO_CONTRAST_MIN
  return contrastRatio(logoLum, zoneLum)
}

/**
 * Quanto deve essere forte la velatura sotto al logo, 0..1, dato il contrasto
 * misurato. Sopra la soglia è esattamente 0 (nessun pixel dipinto); sotto cresce
 * in proporzione a quanto manca, e si ferma a 0.55 perché una velatura piena
 * coprirebbe l'artwork invece di aiutarlo.
 */
export const LOGO_SCRIM_MAX = 0.55

export function logoScrimStrength(contrast: number): number {
  if (!Number.isFinite(contrast) || contrast >= LOGO_CONTRAST_MIN) return 0
  const shortfall = (LOGO_CONTRAST_MIN - Math.max(contrast, 1)) / (LOGO_CONTRAST_MIN - 1)
  return Math.min(LOGO_SCRIM_MAX, Math.max(0, shortfall) * LOGO_SCRIM_MAX)
}

/**
 * Velatura ellittica sfumata da comporre SOTTO al logo. Il centro è scuro o
 * chiaro a seconda di dove sta l'inchiostro: un logo scuro su poster scuro va
 * schiarito, non ulteriormente scurito.
 */
export async function buildLogoScrim(
  width: number,
  height: number,
  strength: number,
  lightLogo: boolean,
  maxW: number = STD_W,
  maxH: number = STD_H,
): Promise<Buffer | null> {
  if (strength <= 0 || width <= 0 || height <= 0) return null
  // Il riquadro è più largo del logo: la sfumatura deve morire fuori dai bordi,
  // altrimenti si vedrebbe l'alone come una macchia con un contorno. Il clamp
  // alla tela non è un dettaglio: un logo a piena larghezza produrrebbe un
  // riquadro più grande del poster, e sharp rifiuta di comporlo.
  const w = Math.min(Math.round(width * 1.35), Math.round(maxW))
  const h = Math.min(Math.round(height * 1.8), Math.round(maxH))
  if (w <= 0 || h <= 0) return null
  const rgb = lightLogo ? "0,0,0" : "255,255,255"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + `<defs><radialGradient id="s" cx="50%" cy="50%" r="50%">`
    + `<stop offset="0%" stop-color="rgba(${rgb},${strength.toFixed(3)})"/>`
    + `<stop offset="60%" stop-color="rgba(${rgb},${(strength * 0.45).toFixed(3)})"/>`
    + `<stop offset="100%" stop-color="rgba(${rgb},0)"/>`
    + `</radialGradient></defs>`
    + `<rect width="${w}" height="${h}" fill="url(#s)"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
