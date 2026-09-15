import crypto from "node:crypto"
import sharp from "sharp"
import { FANART_ASSET_PREFIX } from "./fanart"
import { combineAbortSignals } from "./abort-signal"
import { findAccentColor, findSceneTint, type AccentHueMode } from "@/lib/accent-color"
import { GENRE_FALLBACK } from "@/lib/badges"
import { ARTWORKS_BASE } from "@/lib/tvdb"
// Batch B: STD_W/STD_H ora provengono da image-utils.ts (single source of truth)
import { STD_W, STD_H, computeRegionStats } from "@/lib/image-utils"

// Sovrascrivibile via env: nei test E2E punta al mock server locale per
// rendere il rendering determinista senza dipendere da image.tmdb.org.
const IMG_BASE = process.env.TMDB_IMG_URL || "https://image.tmdb.org/t/p"
const MAX_IMG_SIZE = 10 * 1024 * 1024

// Re-export per backward compat — tutti i file che importano STD_W/STD_H
// da poster-render-helpers continuano a funzionare.
export { STD_W, STD_H }
export const OUTPUT_W = 500
export const OUTPUT_H = 750

export type BadgeRender = { png: Buffer; w: number; h: number; isRank?: boolean }
export type PosterComposite = { input: Buffer; top: number; left: number }

export function hashKey(key: string): string {
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 16)
}

export async function fetchImg(url: string, signal?: AbortSignal): Promise<Buffer> {
  // Se il chiamante passa un signal esterno, unirlo al timeout interno invece
  // di sostituirlo: un signal mai abortito (es. renderAbort a render riuscito)
  // lascerebbe il fetch senza tetto in background. Il limite resta 15s.
  const res = await fetch(url, { signal: combineAbortSignals(signal, 15000) })
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const cl = res.headers.get("content-length")
  if (cl && Number(cl) > MAX_IMG_SIZE) throw new Error("image too large")
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMG_SIZE) throw new Error("image too large")
  return buf
}

export function isValidHex(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color)
}

/**
 * Host di immagini ammessi, per prefisso ESATTO e solo https. Un path relativo
 * resta TMDB; qualunque altro URL assoluto viene rifiutato.
 */
const ALLOWED_IMAGE_PREFIXES = [
  "https://image.tmdb.org/t/p/",
  FANART_ASSET_PREFIX,
  // CDN artwork di TVDB: host fisso, stessa asticella di TMDB (rescue poster).
  `${ARTWORKS_BASE}/`,
] as const

export function isAllowedImageUrl(url: string): boolean {
  return ALLOWED_IMAGE_PREFIXES.some((p) => url.startsWith(p))
}

export function imgSrc(path: string): string {
  if (path.startsWith("http")) {
    // SSRF protection: solo i CDN immagine noti (TMDB, fanart.tv)
    if (!isAllowedImageUrl(path)) {
      throw new Error(`Blocked external image URL: ${path.slice(0, 60)}...`)
    }
    return path
  }
  return `${IMG_BASE}/w500${path}`
}

/**
 * Riquadra un'immagine qualsiasi al formato poster 2:3. Serve ai livelli di
 * fallback che usano un backdrop (16:9) al posto di un poster mancante:
 * `position: "attention"` tiene la zona con più dettaglio invece del centro
 * geometrico, che su un 16:9 tagliato a 2:3 spesso è cielo o sfondo vuoto.
 */
export async function cropToPoster(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(STD_W, STD_H, { fit: "cover", position: "attention" })
    .jpeg({ quality: 92 })
    .toBuffer()
}

export async function fitBadgeToCanvas<T extends BadgeRender>(badge: T, maxW: number, maxH: number): Promise<T> {
  if (badge.w <= maxW && badge.h <= maxH) return badge
  const scale = Math.min(maxW / badge.w, maxH / badge.h)
  const w = Math.max(Math.floor(badge.w * scale), 1)
  const h = Math.max(Math.floor(badge.h * scale), 1)
  const png = await sharp(badge.png)
    .resize(w, h, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 1 })
    .toBuffer()
  return { ...badge, png, w, h }
}

export async function fitCompositeToCanvas(
  layer: PosterComposite,
  _maxW: number,
  _maxH: number,
): Promise<PosterComposite | null> {
  if (!layer.input || layer.input.length < 100) return null
  const meta = await sharp(layer.input).metadata()
  if ((meta.width || 0) <= 0 || (meta.height || 0) <= 0) return null
  // Sharp's .composite() handles out-of-bounds clipping natively — no sub-extract needed
  return layer
}

/**
 * Compute the luminance of the top strip of the poster (top 8% of STD_H).
 *
 * Batch B: delegates to computeRegionStats() from image-utils.ts, so the pixel
 * loop lives in one place instead of being duplicated here. The region stats
 * pool caches the result; computeTextPenalty() reuses the pool for its own
 * crop. Note: extractBadgeColor() has its own pipeline (accent-color.ts) and
 * does NOT consume this pool.
 *
 * The returned values differ slightly (~0.02) from the old topLuminance:
 * the previous implementation used RGBA stride-4, rounded per-channel means,
 * and skipped alpha removal; computeRegionStats uses RGB stride-3 with
 * unrounded Rec.709 luminance. This is why RENDER_VERSION was bumped.
 */
export async function topLuminance(buf: Buffer): Promise<number> {
  const stripH = Math.max(Math.round(STD_H * 0.08), 3)
  const stats = await computeRegionStats(buf, 0, 0, STD_W, stripH)
  if (!stats) return 0.5 // fallback: medium luminance
  return stats.mean / 255
}

/**
 * Frazione del poster campionata per l'accent quando `region` è impostata.
 * Il default 0.4 è il valore storico; i chiamanti che tingono anche la fascia
 * sfocata passano l'altezza REALE della fascia, così il colore esce dai pixel
 * su cui verrà poi steso.
 */
export const DEFAULT_ACCENT_REGION_FRACTION = 0.4

/** Frazione valida e non degenere (almeno una riga del thumb 200×300). */
export function clampAccentRegionFraction(fraction: number | null | undefined): number {
  if (!Number.isFinite(fraction as number)) return DEFAULT_ACCENT_REGION_FRACTION
  return Math.min(Math.max(fraction as number, 1 / 300), 1)
}

// B3: memo decode condivisi per extractBadgeColor (chiamato 2× — top+bottom —
// sullo STESSO posterBuf/logoBuf da resolveBadgeColors). WeakMap keyed sul
// Buffer: stesso oggetto = stessi byte, quindi niente invalidazione; le entry
// muoiono col GC dei buffer. Stessi byte negli stessi algoritmi → output
// identico, solo meno decode (1 resize 200×300 e 1 raw logo risparmiati).
const thumbMemo = new WeakMap<Buffer, Promise<Buffer>>()
function posterThumb(posterBuf: Buffer): Promise<Buffer> {
  let p = thumbMemo.get(posterBuf)
  if (!p) {
    p = sharp(posterBuf).resize(200, 300, { fit: "cover" }).toBuffer()
    thumbMemo.set(posterBuf, p)
  }
  return p
}

interface LogoRaw {
  readonly pixels: Buffer
  readonly w: number
  readonly h: number
}
const logoRawMemo = new WeakMap<Buffer, Promise<LogoRaw | null>>()
function logoRawPixels(logoBuf: Buffer): Promise<LogoRaw | null> {
  let p = logoRawMemo.get(logoBuf)
  if (!p) {
    p = (async (): Promise<LogoRaw | null> => {
      try {
        const meta = await sharp(logoBuf).metadata()
        const pixels = await sharp(logoBuf).ensureAlpha().raw().toBuffer()
        return { pixels, w: meta.width || 200, h: meta.height || 100 }
      } catch {
        return null
      }
    })()
    logoRawMemo.set(logoBuf, p)
  }
  return p
}

export async function extractBadgeColor(
  posterBuf: Buffer,
  logoBuf?: Buffer | null,
  fallbackGenre?: string | null,
  region?: 'bottom' | 'top',
  hueMode: AccentHueMode = "complement",
  regionFraction: number = DEFAULT_ACCENT_REGION_FRACTION,
): Promise<string> {
  function extractFromRaw(pixels: Buffer, w: number, h: number, genre: string): string {
    const result = findAccentColor(pixels, w, h, genre, hueMode)
    return `#${result.r.toString(16).padStart(2, "0")}${result.g.toString(16).padStart(2, "0")}${result.b.toString(16).padStart(2, "0")}`
  }

  const thumbBuf = await posterThumb(posterBuf)

  // Crop to target region for more focused color extraction
  let posterAnalysisBuf = thumbBuf
  const posterW = 200
  let posterH = 300
  // Il ritaglio segue `regionFraction`: per la fascia bassa i chiamanti passano
  // l'altezza vera del blur, così l'accent nasce dagli stessi pixel che poi
  // verranno tinti. Con il default 0.4 il ritaglio resta 120px come prima.
  const regionH = Math.max(1, Math.min(300, Math.round(300 * clampAccentRegionFraction(regionFraction))))
  if (region === 'bottom') {
    posterH = regionH
    posterAnalysisBuf = await sharp(thumbBuf)
      .extract({ left: 0, top: 300 - posterH, width: 200, height: posterH })
      .toBuffer()
  } else if (region === 'top') {
    posterH = regionH
    posterAnalysisBuf = await sharp(thumbBuf)
      .extract({ left: 0, top: 0, width: 200, height: posterH })
      .toBuffer()
  }

  const posterPixels = await sharp(posterAnalysisBuf).ensureAlpha().raw().toBuffer()
  const logoRaw = logoBuf ? await logoRawPixels(logoBuf) : null
  const posterColor = extractFromRaw(posterPixels, posterW, posterH, fallbackGenre || "")
  const logoColor = logoRaw ? extractFromRaw(logoRaw.pixels, logoRaw.w, logoRaw.h, "") : ""

  if (posterColor && logoColor) {
    const pr = parseInt(posterColor.slice(1, 3), 16)
    const pg = parseInt(posterColor.slice(3, 5), 16)
    const pb = parseInt(posterColor.slice(5, 7), 16)
    const lr = parseInt(logoColor.slice(1, 3), 16)
    const lg = parseInt(logoColor.slice(3, 5), 16)
    const lb = parseInt(logoColor.slice(5, 7), 16)
    return `#${Math.round((pr + lr) / 2).toString(16).padStart(2, "0")}${Math.round((pg + lg) / 2).toString(16).padStart(2, "0")}${Math.round((pb + lb) / 2).toString(16).padStart(2, "0")}`
  }

  return posterColor || logoColor || (fallbackGenre ? (GENRE_FALLBACK[fallbackGenre] || "#555555") : "#555555")
}

/**
 * Pavimento assoluto dell'altezza della fascia.
 *
 * La riga di testo in basso è centrata a ~85px dal fondo su 750 (`targetCenter`
 * nella route del poster): sotto il 18% il testo comincerebbe a sedersi su
 * artwork non sfocato.
 */
export const MIN_FITTED_BAND_PCT = 18

/**
 * Deviazione standard di luma oltre la quale una riga conta come "occupata".
 * Una riga piatta o con un gradiente dolce sta molto sotto; una riga che
 * attraversa un volto, un titolo o un blocco chiaro sta molto sopra.
 */
const BUSY_ROW_ENERGY = 24

/** Quanto può scendere una forza rispetto a quella richiesta. */
const MIN_STRENGTH_SCALE = 0.5

/** Luminosità della striscia sopra la quale lo scurimento resta pieno. */
const DARKNESS_REF_LIGHTNESS = 0.35

/** I parametri della fascia, come li chiede l'utente e come escono adattati. */
export interface BandFit {
  readonly blurHeight: number
  readonly blurFade: number
  readonly blurIntensity: number
  readonly blurDarkness: number
}

interface ThumbRows {
  /** Deviazione standard di luma per riga del thumb. */
  readonly energy: Float64Array
  /** Luminosità HSL media per riga del thumb. */
  readonly lightness: Float64Array
}

/** Energia di dettaglio e luminosità riga per riga sul thumb già decodificato. */
async function thumbRowStats(posterBuf: Buffer): Promise<ThumbRows> {
  const w = 200, h = 300
  const rgb = await sharp(await posterThumb(posterBuf)).removeAlpha().raw().toBuffer()
  const energy = new Float64Array(h)
  const lightness = new Float64Array(h)
  for (let y = 0; y < h; y++) {
    let sum = 0, sumSq = 0, sumL = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]
      // Luma per l'energia, luminosità HSL per lo scurimento: la prima dice
      // quanto c'è da vedere, la seconda quanto è già buio.
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      sum += luma
      sumSq += luma * luma
      sumL += (Math.max(r, g, b) + Math.min(r, g, b)) / 2
    }
    const mean = sum / w
    energy[y] = Math.sqrt(Math.max(0, sumSq / w - mean * mean))
    lightness[y] = sumL / w / 255
  }
  return { energy, lightness }
}

/**
 * Adatta la fascia al poster TOGLIENDOSI DI MEZZO: si ritira e si indebolisce
 * il più possibile, senza mai fare di più di quanto chiesto.
 *
 * Le due versioni precedenti hanno sbagliato in direzioni opposte. La prima
 * abbassava il bordo e lasciava il logo su artwork nitido. La seconda teneva
 * l'altezza e accorciava il fade per COPRIRE l'elemento: la soglia di riga
 * occupata scatta su quasi ogni poster vero, quindi il fade crollava al
 * pavimento e la fascia smetteva di essere un gradiente per diventare una
 * lastra a metà poster, con la tinta stesa piatta sopra.
 *
 * Qui la fascia fa solo due cose, entrambe in sottrazione:
 *
 * - **si ritira**: se il bordo alto cade dentro una corsa di righe occupate,
 *   scende sotto quella corsa, con pavimento a `MIN_FITTED_BAND_PCT`;
 * - **si indebolisce**: su una striscia già scura serve meno scurimento, su una
 *   striscia già piatta serve meno sfocatura. Mai sotto metà del richiesto.
 *
 * Il fade non si tocca mai: è esattamente ciò che rende la fascia un gradiente
 * invece di una lastra.
 *
 * La leggibilità del logo non è più affare della fascia: se ritirandosi lascia
 * il logo scoperto, a intervenire è la velatura locale sotto al logo
 * (`logoScrimStrength`), che ora misura la zona CON la fascia sopra. Una
 * velatura grande quanto il logo, non una lastra grande quanto il poster.
 *
 * Vive nel percorso di render, quindi l'anteprima dell'editor — che è essa
 * stessa un render server — lo eredita senza una seconda implementazione.
 */
export async function fitBandToPoster(posterBuf: Buffer, requested: BandFit): Promise<BandFit> {
  const { blurHeight, blurFade, blurIntensity, blurDarkness } = requested
  if (!Number.isFinite(blurHeight) || !Number.isFinite(blurFade)) return requested
  try {
    const { energy, lightness } = await thumbRowStats(posterBuf)
    const rows = energy.length
    const thumbRow = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor(y * rows / STD_H)))

    // --- Ritirata ---
    let fittedHeight = blurHeight
    if (blurHeight > MIN_FITTED_BAND_PCT) {
      const topRow = thumbRow(STD_H - Math.round(STD_H * blurHeight / 100))
      if (energy[topRow] >= BUSY_ROW_ENERGY) {
        let runEnd = topRow
        while (runEnd + 1 < rows && energy[runEnd + 1] >= BUSY_ROW_ENERGY) runEnd++
        const clearedPct = ((rows - (runEnd + 1)) / rows) * 100
        fittedHeight = Math.max(MIN_FITTED_BAND_PCT, Math.min(blurHeight, clearedPct))
      }
    }

    // --- Indebolimento, misurato sulla striscia che la fascia copre davvero ---
    const firstRow = thumbRow(STD_H - Math.round(STD_H * fittedHeight / 100))
    let sumL = 0, sumE = 0, n = 0
    for (let y = firstRow; y < rows; y++) { sumL += lightness[y]; sumE += energy[y]; n++ }
    const stripL = n > 0 ? sumL / n : 0.5
    const stripE = n > 0 ? sumE / n : BUSY_ROW_ENERGY

    const scale = (ratio: number) => Math.min(1, Math.max(MIN_STRENGTH_SCALE, ratio))
    const darknessScale = scale(stripL / DARKNESS_REF_LIGHTNESS)
    const intensityScale = scale(stripE / BUSY_ROW_ENERGY)

    return {
      blurHeight: fittedHeight,
      blurFade,
      blurIntensity: Number.isFinite(blurIntensity)
        ? Math.max(1, Math.round(blurIntensity * intensityScale))
        : blurIntensity,
      blurDarkness: Number.isFinite(blurDarkness)
        ? Math.round(blurDarkness * darknessScale)
        : blurDarkness,
    }
  } catch {
    return requested
  }
}

/**
 * Estrae la tinta della fascia sfocata dalla striscia che la fascia coprirà.
 *
 * `regionFraction` è l'altezza reale del blur: il colore nasce dagli stessi
 * pixel su cui verrà steso, non dalla cornice esterna del poster. Campionare
 * altrove era il motivo per cui un poster con il fondo vuoto riceveva comunque
 * una tinta presa da tutt'altra zona.
 *
 * Restituisce `null` quando la striscia non ha colore da descrivere, o al
 * primo errore: nessun fallback di genere, perché un poster senza colore non
 * deve riceverne uno inventato.
 * Riusa `posterThumb(posterBuf)` condividendo la memo WeakMap con `extractBadgeColor`.
 * Non analizza loghi (evita inquinamento cromatico da marchi bianchi/luminosi).
 */
export async function extractSceneTint(
  posterBuf: Buffer,
  regionFraction: number = DEFAULT_ACCENT_REGION_FRACTION,
): Promise<string | null> {
  try {
    const thumbBuf = await posterThumb(posterBuf)
    const posterW = 200
    const stripH = Math.max(1, Math.min(300, Math.round(300 * clampAccentRegionFraction(regionFraction))))

    const stripBuf = stripH >= 300
      ? thumbBuf
      : await sharp(thumbBuf)
          .extract({ left: 0, top: 300 - stripH, width: posterW, height: stripH })
          .toBuffer()

    const pixels = await sharp(stripBuf).ensureAlpha().raw().toBuffer()
    const tint = findSceneTint(pixels, posterW, stripH)
    if (!tint) return null
    return `#${tint.r.toString(16).padStart(2, "0")}${tint.g.toString(16).padStart(2, "0")}${tint.b.toString(16).padStart(2, "0")}`
  } catch {
    return null
  }
}
