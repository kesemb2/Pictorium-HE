type LogoLayoutInput = {
  readonly posterW: number
  readonly posterH: number
  readonly logoW: number
  readonly logoH: number
  readonly logoScale: number
  readonly logoOffsetX: number
  readonly logoOffsetY: number
  readonly hasBadges: boolean
  /**
   * Altezza della striscia riservata SOTTO il logo al titolo tradotto (0 =
   * nessuna striscia, comportamento storico). Il logo viene SOLLEVATO di questo
   * valore, non rimpicciolito: per un wordmark è la larghezza a decidere la
   * dimensione, quindi ridurne l'altezza gli toglierebbe metà larghezza via
   * `fit: "inside"` senza guadagnare spazio utile.
   */
  readonly titleBandH?: number
}

type LogoBoxInput = Pick<LogoLayoutInput, "posterW" | "posterH" | "logoW" | "logoH" | "logoScale">

type LogoBox = {
  readonly width: number
  readonly height: number
}

type LogoLayout = LogoBox & {
  readonly left: number
  readonly top: number
}

type LogoOffsetBounds = {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

/**
 * Margine sotto il logo, in frazione dell'altezza poster. Era 0.1 (75px a
 * STD_H=750): il logo finiva schiacciato sul bordo inferiore, sopra una riga
 * genere che a sua volta stava a 39px dal fondo. 0.2 lo stacca dal bordo e
 * lascia respiro alla riga metadati, come nei poster di riferimento.
 */
const LOGO_BOTTOM_MARGIN_RATIO = 0.2

function sanePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value
}

export function computeLogoBox(input: LogoBoxInput): LogoBox {
  const posterW = sanePositive(input.posterW, 1000)
  const posterH = sanePositive(input.posterH, 1500)
  const logoW = sanePositive(input.logoW, 1)
  const logoH = sanePositive(input.logoH, 1)
  const scalePct = Math.max(input.logoScale, 10) / 100
  const targetW = Math.min(Math.round(posterW * scalePct), posterW)
  const targetH = Math.round(logoH * (targetW / logoW))
  if (targetH <= posterH) return { width: targetW, height: targetH }

  const ratio = posterH / targetH
  return {
    width: Math.max(Math.round(targetW * ratio), 1),
    height: posterH,
  }
}

export function computeLogoLayout(input: LogoLayoutInput): LogoLayout {
  const posterW = sanePositive(input.posterW, 1000)
  const posterH = sanePositive(input.posterH, 1500)
  const box = computeLogoBox(input)
  const badgeOffset = input.hasBadges ? 0 : Math.round(40 * posterH / 1500)
  const titleBandH = Number.isFinite(input.titleBandH) ? Math.max(input.titleBandH!, 0) : 0
  const left = Math.round((posterW - box.width) / 2 + input.logoOffsetX)
  const top = Math.max(0, Math.round(posterH - box.height - posterH * LOGO_BOTTOM_MARGIN_RATIO + input.logoOffsetY + badgeOffset - titleBandH))
  return { ...box, left, top }
}

/**
 * Bounds degli slider X/Y dell'editor. Ignora deliberatamente `titleBandH`: la
 * striscia del titolo è una decisione del render server (dipende dai loghi che
 * TMDB restituisce), il client non la conosce e passa sempre 0.
 */
export function computeLogoOffsetBounds(input: Omit<LogoLayoutInput, "logoOffsetX" | "logoOffsetY">): LogoOffsetBounds {
  const posterW = sanePositive(input.posterW, 1000)
  const posterH = sanePositive(input.posterH, 1500)
  const box = computeLogoBox(input)
  const badgeOffset = input.hasBadges ? 0 : Math.round(40 * posterH / 1500)
  const halfX = Math.round((posterW - box.width) / 2)
  const baseTop = Math.round(posterH - box.height - posterH * LOGO_BOTTOM_MARGIN_RATIO + badgeOffset)
  const maxY = Math.round(posterH * LOGO_BOTTOM_MARGIN_RATIO - badgeOffset)
  return { minX: cleanZero(-halfX), maxX: cleanZero(halfX), minY: cleanZero(-baseTop), maxY: cleanZero(maxY) }
}
