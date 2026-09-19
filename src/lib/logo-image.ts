/**
 * Il logo di un titolo, reso per un'interfaccia SCURA.
 *
 * L'addon di metadati sceglie da sé un logo ebraico, o inglese quando manca. Su
 * un'app sempre scura questo sbaglia due volte: un wordmark nero su trasparenza
 * sparisce, e un logo inglese lascia il titolo in inglese accanto a un poster
 * che lo dice in ebraico.
 *
 * Qui la lingua resta decisa da `selectLogoTier` — lo stesso ordine del poster,
 * così le due superfici non mostrano loghi diversi — e dentro il livello vince
 * il più chiaro. Se anche quello è scuro si ricolora di bianco, ma SOLO quando
 * è una tinta piatta e nera: vedi `flatBlack` in `logo-contrast.ts`. Sbiancare
 * un logo che è anche un disegno lo riduce a un blocco bianco, e allora è
 * meglio il logo com'è.
 */

import sharp, { type OverlayOptions } from "sharp"
import { logoInkProfile, type InkProfile } from "./logo-contrast"
import { pickReadableLogo, selectLogoTier } from "./logo-selection"
import { buildTitleTextSvg, titleStripHeight, titleTextFontSize, titleTextMaxW } from "./badge-svg-shared"
import { renderSVG } from "./svg-badge"
import type { TMDBImage } from "./types"

/** Larghezza di render del logo. I loghi TMDB arrivano a w500: non si ingrandisce. */
export const LOGO_CANVAS_W = 500

/** Spazio fra logo e titolo, come nel poster. */
const TITLE_GAP = 6

export interface LogoChoice {
  readonly logo: TMDBImage
  /** Lingua del logo scelto, `null` per i loghi senza lingua. */
  readonly lang: string | null
  /** Il logo era una tinta piatta nera ed è stato ricolorato di bianco. */
  readonly whitened: boolean
  /** Il titolo tradotto va reso sotto (il logo non è nella lingua preferita). */
  readonly needsTitle: boolean
}

/**
 * Sceglie il logo dentro il livello di lingua vincente, preferendo il più
 * chiaro: sbiancare è possibile solo per le tinte piatte nere, quindi un logo
 * già chiaro vale più di uno scuro che forse non si potrà sistemare.
 *
 * `null` quando non c'è nessun logo: il chiamante risponde 404 e l'addon torna
 * al suo comportamento.
 */
export async function chooseLogo(
  logos: readonly TMDBImage[],
  lang: string,
  origLang: string | null | undefined,
  inkProfile: (logo: TMDBImage) => Promise<InkProfile | null>,
): Promise<LogoChoice | null> {
  const tier = selectLogoTier([...logos], lang, origLang)
  if (tier.length === 0) return null

  // Il ranking resta sulla luminanza: il più chiaro vince. Conta più di prima,
  // perché ora molti loghi scuri non sono più recuperabili con lo sbiancamento.
  const chosen = await pickReadableLogo(tier, async (l) => (await inkProfile(l))?.luminance ?? null)
  if (!chosen) return null

  const profile = await inkProfile(chosen)
  return {
    logo: chosen,
    lang: chosen.iso_639_1 ?? null,
    // Non misurabile → non si tocca: meglio il logo originale che uno
    // sbiancato per un errore di lettura.
    whitened: profile?.flatBlack === true,
    needsTitle: chosen.iso_639_1 !== lang,
  }
}

/**
 * Ricolora il logo di bianco tenendone la forma: il suo canale alpha fa da
 * maschera su un campo bianco. Stessa tecnica di `buildLogoHalo`, che usa il
 * nero per l'alone.
 *
 * Distrugge qualunque cosa ci sia DENTRO la forma, quindi va chiamata solo sui
 * loghi in tinta piatta nera — quelli che non hanno niente dentro da perdere.
 * Chi decide è `chooseLogo`, via `flatBlack`.
 */
export async function whitenLogo(logoBuf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(logoBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const alpha = Buffer.alloc(info.width * info.height)
  for (let i = 0, a = 0; i < data.length; i += info.channels, a++) {
    alpha[a] = data[i + info.channels - 1]
  }
  return sharp({
    create: { width: info.width, height: info.height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer()
}

/**
 * Soglia per MISURARE il riquadro d'inchiostro: solo il margine del tutto
 * trasparente conta come margine. La soglia di default di sharp (10) mangia i
 * bordi morbidi — un wordmark con bagliore perde fino a ~38px di larghezza —
 * e qui serve sapere dove finisce la parola, non ritagliarla.
 */
const INK_THRESHOLD = 1

export interface ComposedLogo {
  readonly png: Buffer
  /** Un titolo era richiesto ed è stato DAVVERO disegnato. */
  readonly titleRendered: boolean
}

/** Riquadro dell'inchiostro dentro il logo, misurato senza buttare via niente. */
async function inkBox(logo: Buffer, w: number, h: number) {
  try {
    const { info } = await sharp(logo).trim({ threshold: INK_THRESHOLD }).raw().toBuffer({ resolveWithObject: true })
    return {
      left: -(info.trimOffsetLeft ?? 0),
      top: -(info.trimOffsetTop ?? 0),
      width: info.width,
      height: info.height,
    }
  } catch {
    // Immagine uniforme: niente da misurare, vale tutta.
    return { left: 0, top: 0, width: w, height: h }
  }
}

/** Vero se l'immagine ha un solo pixel disegnato. */
async function hasInk(png: Buffer): Promise<boolean> {
  const stats = await sharp(png).stats()
  if (stats.isOpaque) return true
  return (stats.channels[stats.channels.length - 1]?.max ?? 0) > 0
}

/**
 * La striscia del titolo, o `null` se non è stato disegnato niente.
 *
 * Il controllo sull'inchiostro non è pignoleria: resvg senza i file dei font
 * NON solleva, restituisce un PNG della misura giusta e del tutto trasparente.
 * In produzione i font non erano tracciati nella lambda di /api/logo e il
 * titolo ebraico spariva senza una riga di log — riservare spazio al nulla è
 * peggio che non riservarlo.
 */
async function renderTitleStrip(title: string, width: number) {
  const built = buildTitleTextSvg(title, titleTextMaxW(width), titleTextFontSize(width), "#ffffff")
  if (!built) return null
  const png = await renderSVG(built.svg, built.w)
  if (!(await hasInk(png))) return null
  return { png, w: built.w, h: built.h }
}

/**
 * Compone il logo e, quando serve, il titolo tradotto sotto.
 *
 * Il logo esce INTERO, con i suoi margini: ritagliarlo all'inchiostro toglieva
 * l'aria che l'artwork si porta dietro, e il client la usa — la parola finiva a
 * filo del bordo e l'ultima lettera sembrava tagliata. Quello che il ritaglio
 * serviva a sapere — dove finisce davvero la parola — si misura senza tagliare,
 * e serve solo ad appendere il titolo sotto l'inchiostro anziché sotto la tela.
 */
export async function composeLogoImage(input: {
  readonly logoBuf: Buffer
  readonly title?: string | null
  readonly width?: number
}): Promise<ComposedLogo> {
  const width = input.width ?? LOGO_CANVAS_W
  const logo = await sharp(input.logoBuf)
    .resize(width, null, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
  const logoMeta = await sharp(logo).metadata()
  const logoW = logoMeta.width ?? width
  const logoH = logoMeta.height ?? width

  const title = input.title?.trim()
  // Senza titolo l'immagine È il logo: stessa geometria che il client riceveva
  // prima di passare da noi, solo schiarita.
  if (!title) return { png: logo, titleRendered: false }

  const strip = await renderTitleStrip(title, width).catch(() => null)
  if (!strip) return { png: logo, titleRendered: false }

  const ink = await inkBox(logo, logoW, logoH)
  const canvasW = Math.max(logoW, strip.w)
  const logoLeft = Math.round((canvasW - logoW) / 2)
  const titleTop = ink.top + ink.height + TITLE_GAP
  // Margine inferiore speculare a quello sopra il logo: il risultato resta
  // bilanciato invece di finire a filo sotto.
  const canvasH = Math.max(logoH, titleTop + strip.h + ink.top)

  // Il titolo si centra sull'INCHIOSTRO, non sulla tela: un wordmark
  // decentrato nella propria cornice lo porterebbe fuori asse.
  const inkCenter = logoLeft + ink.left + ink.width / 2
  const titleLeft = Math.max(0, Math.min(canvasW - strip.w, Math.round(inkCenter - strip.w / 2)))

  const layers: OverlayOptions[] = [
    { input: logo, top: 0, left: logoLeft },
    { input: strip.png, top: titleTop, left: titleLeft },
  ]

  const png = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer()

  return { png, titleRendered: true }
}

/** Profilo dell'inchiostro, memoizzato per path: `chooseLogo` lo rilegge. */
export function inkProfiler(
  fetchLogo: (path: string) => Promise<Buffer>,
): (logo: TMDBImage) => Promise<InkProfile | null> {
  const memo = new Map<string, Promise<InkProfile | null>>()
  return (logo: TMDBImage) => {
    let p = memo.get(logo.file_path)
    if (!p) {
      p = fetchLogo(logo.file_path).then(logoInkProfile).catch(() => null)
      memo.set(logo.file_path, p)
    }
    return p
  }
}

/** Titolo tradotto: `title` di un film, `name` di una serie. */
export function localizedTitle(details: { title?: string | null; name?: string | null } | null | undefined): string | null {
  return details?.title?.trim() || details?.name?.trim() || null
}

export { titleStripHeight }
