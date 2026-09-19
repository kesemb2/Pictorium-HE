/**
 * Il logo di un titolo, reso per un'interfaccia SCURA.
 *
 * L'addon di metadati sceglie da sé un logo ebraico, o inglese quando manca. Su
 * un'app sempre scura questo sbaglia due volte: un wordmark nero su trasparenza
 * sparisce, e un logo inglese lascia il titolo in inglese accanto a un poster
 * che lo dice in ebraico.
 *
 * Qui la lingua resta decisa da `selectLogoTier` — lo stesso ordine del poster,
 * così le due superfici non mostrano loghi diversi — e la luminosità smette di
 * essere un criterio di scelta per diventare una trasformazione: dentro il
 * livello vince il più chiaro, e se anche quello è scuro viene ricolorato di
 * bianco. È il motivo per cui un logo ebraico scuro non costa mai l'ebraico.
 */

import sharp, { type OverlayOptions } from "sharp"
import { logoInkLuminance } from "./logo-contrast"
import { pickReadableLogo, selectLogoTier } from "./logo-selection"
import { buildTitleTextSvg, titleStripHeight, titleTextFontSize, titleTextMaxW } from "./badge-svg-shared"
import { renderSVG } from "./svg-badge"
import type { TMDBImage } from "./types"

/** Larghezza di render del logo. I loghi TMDB arrivano a w500: non si ingrandisce. */
export const LOGO_CANVAS_W = 500

/** Spazio fra logo e titolo, come nel poster. */
const TITLE_GAP = 6

/**
 * Sotto questa luminanza dell'inchiostro il logo va ricolorato. 0.45 è a metà
 * strada: un wordmark bianco sta vicino a 1, uno nero vicino a 0, e i loghi
 * colorati (oro, rosso) restano com'erano quando si leggono già sullo scuro.
 */
export const LOGO_LIGHT_MIN_LUMINANCE = 0.45

export interface LogoChoice {
  readonly logo: TMDBImage
  /** Lingua del logo scelto, `null` per i loghi senza lingua. */
  readonly lang: string | null
  /** Il logo era troppo scuro ed è stato ricolorato. */
  readonly whitened: boolean
  /** Il titolo tradotto va reso sotto (il logo non è nella lingua preferita). */
  readonly needsTitle: boolean
}

/**
 * Sceglie il logo dentro il livello di lingua vincente, preferendo il più
 * chiaro: ricolorare perde il colore dell'originale, quindi un logo già chiaro
 * vale più di uno scuro da sistemare.
 *
 * `null` quando non c'è nessun logo: il chiamante risponde 404 e l'addon torna
 * al suo comportamento.
 */
export async function chooseLogo(
  logos: readonly TMDBImage[],
  lang: string,
  origLang: string | null | undefined,
  inkLuminance: (logo: TMDBImage) => Promise<number | null>,
): Promise<LogoChoice | null> {
  const tier = selectLogoTier([...logos], lang, origLang)
  if (tier.length === 0) return null

  const chosen = await pickReadableLogo(tier, inkLuminance)
  if (!chosen) return null

  const ink = await inkLuminance(chosen)
  return {
    logo: chosen,
    lang: chosen.iso_639_1 ?? null,
    // Non misurabile → non si tocca: meglio il logo originale che uno
    // sbiancato per un errore di lettura.
    whitened: ink !== null && ink < LOGO_LIGHT_MIN_LUMINANCE,
    needsTitle: chosen.iso_639_1 !== lang,
  }
}

/**
 * Ricolora il logo di bianco tenendone la forma: il suo canale alpha fa da
 * maschera su un campo bianco. Stessa tecnica di `buildLogoHalo`, che usa il
 * nero per l'alone.
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
 * Compone il logo e, quando serve, il titolo tradotto sotto: stesse proporzioni
 * del poster, su trasparenza. Il ritaglio finale toglie il margine morto, così
 * il client riceve l'immagine e non l'aria intorno.
 */
export async function composeLogoImage(input: {
  readonly logoBuf: Buffer
  readonly title?: string | null
  readonly width?: number
}): Promise<Buffer> {
  const width = input.width ?? LOGO_CANVAS_W
  const logo = await sharp(input.logoBuf)
    .resize(width, null, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
  const logoMeta = await sharp(logo).metadata()
  const logoW = logoMeta.width ?? width
  const logoH = logoMeta.height ?? width

  const title = input.title?.trim()
  const titleBadge = title
    ? await (async () => {
        const fs = titleTextFontSize(width)
        const built = buildTitleTextSvg(title, titleTextMaxW(width), fs, "#ffffff")
        if (!built) return null
        return { png: await renderSVG(built.svg, built.w), w: built.w, h: built.h }
      })().catch(() => null)
    : null

  const canvasW = Math.max(logoW, titleBadge?.w ?? 0)
  const canvasH = logoH + (titleBadge ? TITLE_GAP + titleBadge.h : 0)

  const layers: OverlayOptions[] = [
    { input: logo, top: 0, left: Math.round((canvasW - logoW) / 2) },
  ]
  if (titleBadge) {
    layers.push({
      input: titleBadge.png,
      top: logoH + TITLE_GAP,
      left: Math.round((canvasW - titleBadge.w) / 2),
    })
  }

  const composed = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer()

  // Ritaglio in un passaggio SUO: sharp esegue le operazioni nel proprio
  // ordine, non in quello di chiamata, e `trim` cade prima di `composite` —
  // sulla tela ancora vuota non troverebbe niente da togliere.
  return sharp(composed).trim().png().toBuffer().catch(() => composed)
}

/** Luminanza dell'inchiostro, memoizzata per path: `pickReadableLogo` richiama. */
export function inkLuminanceScorer(
  fetchLogo: (path: string) => Promise<Buffer>,
): (logo: TMDBImage) => Promise<number | null> {
  const memo = new Map<string, Promise<number | null>>()
  return (logo: TMDBImage) => {
    let p = memo.get(logo.file_path)
    if (!p) {
      p = fetchLogo(logo.file_path).then(logoInkLuminance).catch(() => null)
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
