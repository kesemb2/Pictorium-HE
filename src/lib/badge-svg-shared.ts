const TEXT_SAFE_PAD = 1.15
const GENRE_TEXT_MAX_RATIO = 0.84
const GENRE_PILL_MAX_RATIO = 0.78
const GENRE_FONT_WEIGHT = 600
const RANKING_FONT_WEIGHT = 700

export function genreBadgeSafePad(fs: number): number {
  return Math.round(fs * TEXT_SAFE_PAD)
}

export function genrePillMaxW(containerW: number): number {
  return Math.min(containerW - 20, Math.round(containerW * GENRE_PILL_MAX_RATIO))
}

export function genreTextMaxW(containerW: number): number {
  return Math.min(containerW - 20, Math.round(containerW * GENRE_TEXT_MAX_RATIO))
}

export function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Ebraico (blocco base + presentation forms). */
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/

/** True se il testo contiene almeno un carattere ebraico. */
export function containsHebrew(text: string): boolean {
  return HEBREW_RE.test(text)
}

/**
 * Famiglia da dichiarare per un testo di badge. Inter non ha glifi ebraici:
 * resvg li recupera per-glifo da Rubik (presente nel fontdb, vedi lib/fonts),
 * ma quel fallback ignora il `font-weight` richiesto e ripiega sempre sul
 * regular — un badge in grassetto verrebbe reso sottile. Dichiarando "Rubik"
 * quando il testo contiene ebraico il peso torna corretto.
 *
 * Per i testi latini ritorna "Inter": l'SVG emesso resta byte-identico a
 * prima, quindi gli snapshot visivi non si muovono.
 */
/** RIGHT-TO-LEFT MARK: carattere forte RTL, larghezza zero. */
const RLM = "\u200F"

/**
 * Aggiunge un RLM in coda al testo ebraico.
 *
 * resvg impagina il paragrafo come LTR, quindi un segno NEUTRO finale — il
 * geresh di "לבינג'", il punto interrogativo di "מי הרוצח?" — prendeva la
 * direzione del paragrafo e finiva a DESTRA di tutta la parola invece che a
 * sinistra, dove si legge. Misurato: il geresh cadeva a x 272-276 con le
 * lettere a 143-268.
 *
 * Gli attributi SVG non servono: `direction="rtl"` e `unicode-bidi="embed"`
 * sono stati provati entrambi e resvg li ignora, il segno non si muoveva di un
 * pixel. Un RLM finale invece è dato dell'algoritmo bidi, non del renderer: il
 * neutro si trova fra ebraico e RLM, entrambi forti RTL, e per la regola N1
 * prende RTL. Con l'RLM il geresh passa a 143-147.
 *
 * Larghezza zero (vedi `charWidthFactor`), quindi non tocca né le stime né i
 * `textLength`.
 */
export function rtlSafe(text: string): string {
  return HEBREW_RE.test(text) ? text + RLM : text
}

export function fontFamilyFor(text: string): string {
  return HEBREW_RE.test(text) ? "Rubik" : "Inter"
}

function charWidthFactor(char: string): number {
  if (char === " ") return 0.33
  // Controlli bidi (RLM e compagnia): larghezza zero, altrimenti `rtlSafe`
  // gonfierebbe la stima e `textLength` allargherebbe i glifi per riempirla.
  if (/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(char)) return 0
  // Rubik: le lettere ebraiche hanno avanzamento ~0.55em, uniforme (niente
  // maiuscole/minuscole). Col default 0.62 la stima sforava del ~12% e
  // `lengthAdjust="spacingAndGlyphs"` allargava visibilmente i glifi.
  if (HEBREW_RE.test(char)) return 0.55
  if ("iIl.,:;!'|`".includes(char)) return 0.28
  if ("-–_".includes(char)) return 0.36
  if ("fjrt".includes(char.toLowerCase())) return 0.45
  if ("mw".includes(char.toLowerCase())) return 0.86
  if ("#%&@".includes(char)) return 0.75
  if (/\d/.test(char)) return 0.58
  if (/[A-Z]/.test(char)) return 0.68
  return 0.62
}

export function estimateTextWidth(text: string, fs: number): number {
  let units = 0
  for (const char of text) units += charWidthFactor(char)
  return Math.round(Math.max(units * fs, fs * 0.35))
}

function textFitAttrs(width: number): string {
  return ` textLength="${Math.max(Math.round(width), 1)}" lengthAdjust="spacingAndGlyphs"`
}

type GenreBadgeText = {
  readonly genreName: string
  readonly voteStr: string
  readonly yearStr: string
}

/**
 * Stile del testo bianco che cade sull'artwork (riga genere/voto/anno e titolo
 * sotto il logo). Tutti i valori sono percentuali del default, così 100 ovunque
 * riproduce byte per byte l'SVG precedente e i poster esistenti non si muovono.
 */
export interface TextStyle {
  /** Opacità del testo, 0-100. */
  readonly opacity?: number
  /** Opacità dell'ombra, 0-100 come percentuale di quella di default. */
  readonly shadowOpacity?: number
  /** Raggio dell'ombra, 0-200 come percentuale di quello di default. */
  readonly shadowBlur?: number
  /** Scostamento dell'ombra, 0-200 come percentuale di quello di default. */
  readonly shadowOffset?: number
}

export const DEFAULT_TEXT_STYLE: Required<TextStyle> = {
  opacity: 100,
  shadowOpacity: 100,
  shadowBlur: 100,
  shadowOffset: 100,
}

function pct(value: number | undefined, max: number): number {
  if (!Number.isFinite(value as number)) return 1
  return Math.min(Math.max(value as number, 0), max) / 100
}

export function normalizeTextStyle(style?: TextStyle) {
  return {
    opacity: pct(style?.opacity ?? DEFAULT_TEXT_STYLE.opacity, 100),
    shadowOpacity: pct(style?.shadowOpacity ?? DEFAULT_TEXT_STYLE.shadowOpacity, 100),
    shadowBlur: pct(style?.shadowBlur ?? DEFAULT_TEXT_STYLE.shadowBlur, 200),
    shadowOffset: pct(style?.shadowOffset ?? DEFAULT_TEXT_STYLE.shadowOffset, 200),
  }
}

/** Numero in forma compatta: 2 resta "2", 1.5 resta "1.5" (niente 1.500). */
function num(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

/**
 * Le due ombre portanti del testo su artwork: una stretta e scura che stacca i
 * bordi, una larga e morbida che stende il testo sullo sfondo. Erano duplicate
 * alla lettera in `buildGenreTextSvg` e `buildTitleTextSvg`.
 */
const TEXT_SHADOW_LAYERS = [
  { dy: 2, sd: 1.5, alpha: 0.8 },
  { dy: 5, sd: 4.5, alpha: 0.55 },
] as const

/** `<defs>` del filtro ombra. A scale 1 emette esattamente l'SVG storico. */
export function textShadowDefs(id: string, style?: TextStyle): string {
  const n = normalizeTextStyle(style)
  const layers = TEXT_SHADOW_LAYERS
    .map((l) => `<feDropShadow dx="0" dy="${num(l.dy * n.shadowOffset)}" stdDeviation="${num(l.sd * n.shadowBlur)}" flood-color="rgba(0,0,0,${num(l.alpha * n.shadowOpacity)})"/>`)
    .join("")
  return `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${layers}</filter></defs>`
}

/**
 * Margini del riquadro di render che l'ombra richiede. Non scendono mai sotto il
 * default: rimpicciolire l'ombra non deve rimpicciolire il badge, perché la sua
 * larghezza decide dove viene composto sul poster. Crescono invece con blur e
 * offset, altrimenti un'ombra più grande verrebbe tagliata ai bordi.
 */
export function textShadowBox(style?: TextStyle): { pad: number; drop: number } {
  const n = normalizeTextStyle(style)
  return {
    pad: Math.ceil(8 * Math.max(1, n.shadowBlur, n.shadowOffset)),
    drop: Math.ceil(5 * Math.max(1, n.shadowOffset)),
  }
}

/** Attributo `opacity` sul gruppo, omesso quando è 100 (SVG invariato). */
export function textOpacityAttr(style?: TextStyle): string {
  const n = normalizeTextStyle(style)
  // `opacity` e non `fill-opacity`: i bullet portano già `fill-opacity="0.6"`, e
  // un fill-opacity ereditato viene SOSTITUITO dal valore del figlio, non
  // moltiplicato — i separatori non si attenuerebbero. L'opacità di gruppo
  // compone l'intero gruppo, quindi è moltiplicativa.
  return n.opacity >= 1 ? "" : ` opacity="${num(n.opacity)}"`
}

/**
 * Quali componenti del badge genere/rating mostrare. Default tutti ON:
 * con tutte le parti attive l'output SVG \u00e8 byte-identico al precedente
 * "genere \u2022 \u2605 voto \u2022 anno" (i test di regressione visiva non cambiano).
 */
export interface GenreParts {
  readonly showGenre?: boolean
  readonly showYear?: boolean
  readonly showRating?: boolean
  /** Stellina davanti al voto. Spegnerla lascia il numero da solo. */
  readonly showStar?: boolean
}

function normalizeParts(parts?: GenreParts): Required<GenreParts> {
  return {
    showGenre: parts?.showGenre ?? true,
    showYear: parts?.showYear ?? true,
    showRating: parts?.showRating ?? true,
    showStar: parts?.showStar ?? true,
  }
}

type GenreTextFlowArgs = GenreBadgeText & {
  readonly fs: number
  readonly centerX: number
  readonly y: number
  readonly parts?: GenreParts
}

export function genreBadgeSvgDims(fs: number, genreName: string, voteStr: string, yearStr: string, parts?: GenreParts) {
  const opts = normalizeParts(parts)
  const gap = Math.round(fs / 3)
  const bulletW = Math.round(fs * 0.35)
  // Senza stella spariscono sia la sua larghezza sia lo spazio che la separa dal
  // voto. Le due cose vanno insieme a buildGenreTextFlow, che salta lo stesso
  // tspan: se solo una delle due cambiasse, il testo uscirebbe scentrato.
  const showStar = opts.showRating && opts.showStar
  const starW = showStar ? Math.round(fs * 0.92) : 0
  const gapStarValue = showStar ? Math.round(fs / 6) : 0
  const genreW = (opts.showGenre && genreName) ? estimateTextWidth(genreName, fs) : 0
  const voteW = (opts.showRating && voteStr) ? estimateTextWidth(voteStr, fs) : 0
  const yearW = (opts.showYear && yearStr) ? estimateTextWidth(yearStr, fs) : 0
  const buf = Math.round(fs * 0.25)
  // Segmenti condizionali separati da gap+bullet+gap. Con tutti ON questo
  // produce: genreW + (gap+bulletW+gap) + (starW+gapStar+voteW) + (gap+bulletW+gap) + yearW.
  const segGenre = genreW > 0 ? 1 : 0
  const segRating = voteW > 0 ? 1 : 0
  const segYear = yearW > 0 ? 1 : 0
  const segCount = segGenre + segRating + segYear
  const textContentW = segCount > 0
    ? (genreW + (segRating ? starW + gapStarValue + voteW : 0) + yearW) + (segCount - 1) * (gap + bulletW + gap)
    : 0
  const totalW = textContentW + buf
  const svgH = Math.max(Math.round(fs * 1.6), 24)
  return { starW, gap, gapStar: gapStarValue, totalW, svgH, genreW, voteW, yearW, bulletW, textContentW }
}

function buildGenreTextFlow({ genreName, voteStr, yearStr, fs, centerX, y, parts }: GenreTextFlowArgs) {
  const opts = normalizeParts(parts)
  const dims = genreBadgeSvgDims(fs, genreName, voteStr, yearStr, opts)
  const starDy = Math.max(2, Math.round(fs * 0.14))
  const hasGenre = opts.showGenre && !!genreName
  const hasRating = opts.showRating && !!voteStr
  const hasStar = hasRating && opts.showStar
  const hasYear = opts.showYear && !!yearStr
  const bullet = (dx: number) => `<tspan dx="${dx}" fill-opacity="0.6">${escSvg("\u2022")}</tspan>`
  const tspan: string[] = []
  // Il dx di separazione va emesso SOLO se il segmento ha un precedente visibile:
  // quando stella o anno sono il PRIMO segmento (es. solo anno, solo voto) il dx
  // sposterebbe il testo fuori centro. Con tutti ON l'output resta byte-identico:
  // stella emette gap (dopo il genere), anno emette gap (dopo stella o genere).
  const starGapDx = hasGenre ? dims.gap : 0
  const yearGapDx = (hasGenre || hasRating) ? dims.gap : 0
  if (hasGenre) {
    tspan.push(`<tspan>${escSvg(genreName)}</tspan>`)
    if (hasRating || hasYear) tspan.push(bullet(dims.gap))
  }
  if (hasRating) {
    if (hasStar) {
      tspan.push(`<tspan dx="${starGapDx}" dy="${starDy}" font-family="Noto Sans Symbols 2" font-weight="400" fill="#F59E0B">${escSvg("\u2605")}</tspan>`)
      tspan.push(`<tspan dx="${dims.gapStar}" dy="${-starDy}">${escSvg(voteStr)}</tspan>`)
    } else {
      // Senza stella il voto prende lo spazio che la separava dal genere, e
      // niente dy: non c'è nessuna linea di base da compensare.
      tspan.push(`<tspan dx="${starGapDx}">${escSvg(voteStr)}</tspan>`)
    }
    if (hasYear) tspan.push(bullet(dims.gap))
  }
  if (hasYear) {
    tspan.push(`<tspan dx="${yearGapDx}">${escSvg(yearStr)}</tspan>`)
  }
  // Ogni separatore tra segmenti contribuisce gap*2 ai dx (gap prima e dopo il
  // bullet); il gap della stella contribuisce gapStar. Con tutti ON: gap*4 + gapStar.
  const separators = (hasGenre ? 1 : 0) + (hasRating ? 1 : 0) + (hasYear ? 1 : 0) - 1
  const totalDx = separators * dims.gap * 2 + (hasRating ? dims.gapStar : 0)
  const adjustedX = centerX - totalDx / 2
  let t = `<text x="${adjustedX}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(genreName)}" font-weight="${GENRE_FONT_WEIGHT}" font-size="${fs}"${textFitAttrs(dims.textContentW)}>`
  t += tspan.join("")
  // L'RLM chiude la riga, non il singolo tspan: il paragrafo bidi è tutto il
  // contenuto di <text>, quindi il neutro finale va ancorato lì.
  if (HEBREW_RE.test(genreName)) t += RLM
  t += "</text>"
  return t
}

export function buildGenreBarSvg(genreName: string, voteStr: string, yearStr: string, pw: number, fs: number, textColor: string, topLight: boolean, textOffsetX = 0, parts?: GenreParts) {
  const barPad = Math.round(fs * 0.5)
  const barH = fs + barPad * 2
  const barR = Math.round(fs * 0.7)
  const barShadowOff = Math.max(Math.round(barH * 0.2), 3)
  const barShadowBlur = Math.max(Math.round(barH * 0.5), 8)
  const textParts = buildGenreTextFlow({ genreName, voteStr, yearStr, fs, centerX: pw / 2 + textOffsetX, y: barH / 2, parts })
  const pathD = `M 0,${barH} L 0,${barR} A ${barR},${barR} 0 0,1 ${barR},0 L ${pw - barR},0 A ${barR},${barR} 0 0,1 ${pw},${barR} L ${pw},${barH} Z`
  const defs = `<defs><filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="-${barShadowOff}" stdDeviation="${barShadowBlur / 2}" flood-color="rgba(0,0,0,0.3)"/></filter></defs>`
  const textEl = `<g fill="${textColor}">${textParts}</g>`
  const borderLine = `<line x1="0" y1="0" x2="${pw}" y2="0" stroke="rgba(0,0,0,0.10)" stroke-width="1"/>`
  const inner = `<path d="${pathD}" fill="rgba(255,255,255,0.80)" filter="url(#sh)"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${barH}">${defs}${inner}${borderLine}${textEl}</svg>`, w: pw, h: barH }
}

export function buildGenrePillSvg(genreName: string, voteStr: string, yearStr: string, fs: number, bgColor: string, textColor: string, textOffsetX = 0, parts?: GenreParts) {
  const pillPad = Math.round(fs * 0.35)
  const safePad = genreBadgeSafePad(fs)
  const pillR = Math.round(fs * 0.8)
  const dims = genreBadgeSvgDims(fs, genreName, voteStr, yearStr, parts)
  const pillW = dims.textContentW + pillPad * 3 + safePad * 2
  const pillH = fs + pillPad * 2
  const textParts = buildGenreTextFlow({ genreName, voteStr, yearStr, fs, centerX: pillW / 2 + textOffsetX, y: pillH / 2, parts })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}"><rect width="${pillW}" height="${pillH}" rx="${pillR}" fill="${bgColor}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/><g fill="${textColor}">${textParts}</g></svg>`
  return { svg, w: pillW, h: pillH }
}

/**
 * Corpo del titolo tradotto sotto il logo, in scala con la larghezza del poster
 * come il badge genere (`24 * pw / 380` in buildGenreBadgeSVG). Il fattore è
 * esattamente 1.5x quello: prima il titolo era fisso a 27px, quindi PIÙ PICCOLO
 * della riga genere+voto che dovrebbe sovrastare, e leggeva come didascalia.
 */
export function titleTextFontSize(posterW: number): number {
  return Math.round(36 * posterW / 380)
}
/**
 * Pavimento dello shrink-to-fit: sotto questo corpo il titolo si tronca invece
 * di rimpicciolirsi ancora. Tenerlo alto è il punto: un titolo lungo che scende
 * a 15px torna a essere la didascalia che questo lavoro elimina.
 */
const TITLE_TEXT_MIN_FONT_SIZE = 20
/**
 * Frazione di larghezza poster utilizzabile dal titolo. Larga: su una riga
 * sola è l'unica leva che tiene un titolo lungo sopra la soglia della
 * didascalia. 0.85 lascia comunque ~37px di margine per lato.
 */
const TITLE_TEXT_MAX_RATIO = 0.85
/** Interlinea della striscia, in multipli del corpo. */
const TITLE_TEXT_LINE_HEIGHT = 1.6

export function titleTextMaxW(posterW: number): number {
  return Math.round(posterW * TITLE_TEXT_MAX_RATIO)
}

/**
 * Altezza della striscia per un dato corpo. Usata sia da chi RISERVA lo spazio
 * (poster-service, che alza il logo) sia da chi DISEGNA: se le due divergessero
 * il titolo finirebbe sopra o sotto il buco lasciato per lui.
 */
export function titleStripHeight(fs: number): number {
  return Math.round(fs * TITLE_TEXT_LINE_HEIGHT)
}

/**
 * Titolo su UNA riga: prima riduce il corpo fino a `TITLE_TEXT_MIN_FONT_SIZE`,
 * poi tronca con l'ellissi. In tutto il codebase non esiste un helper di
 * a-capo e una riga di sottotitolo non lo giustifica: la fascia sotto il logo
 * è alta ~150px in tutto e due righe se la mangerebbero.
 */
export function fitTitleText(title: string, maxW: number, fs: number): { text: string; fs: number } {
  const clean = title.trim().replace(/\s+/g, " ")
  if (!clean) return { text: "", fs }
  let size = fs
  while (size > TITLE_TEXT_MIN_FONT_SIZE && estimateTextWidth(clean, size) > maxW) size -= 1
  if (estimateTextWidth(clean, size) <= maxW) return { text: clean, fs: size }
  // Ancora troppo lungo al corpo minimo: taglia carattere per carattere.
  const chars = [...clean]
  while (chars.length > 1 && estimateTextWidth(`${chars.join("")}\u2026`, size) > maxW) chars.pop()
  return { text: `${chars.join("")}\u2026`, fs: size }
}

/**
 * SVG del titolo tradotto reso sotto il logo. Stessa doppia ombra del badge
 * genere "shadow": il testo cade su artwork, non su una pill, e senza ombra
 * sparirebbe sui poster chiari.
 */
export function buildTitleTextSvg(title: string, maxW: number, fs: number, textColor = "#ffffff", textStyle?: TextStyle) {
  const fit = fitTitleText(title, maxW, fs)
  if (!fit.text) return null
  const { pad: shadowPad } = textShadowBox(textStyle)
  const renderW = Math.min(Math.round(estimateTextWidth(fit.text, fit.fs)) + shadowPad * 2, maxW + shadowPad * 2)
  const renderH = titleStripHeight(fit.fs)
  const defs = textShadowDefs("ts", textStyle)
  const textEl = `<text x="${renderW / 2}" y="${renderH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(fit.text)}" font-weight="700" font-size="${fit.fs}" fill="${textColor}" filter="url(#ts)"${textOpacityAttr(textStyle)}>${escSvg(rtlSafe(fit.text))}</text>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}">${defs}${textEl}</svg>`, w: renderW, h: renderH }
}

export function buildGenreTextSvg(genreName: string, voteStr: string, yearStr: string, fs: number, textColor: string, style: string, textOffsetX = 0, parts?: GenreParts, textStyle?: TextStyle) {
  const dims = genreBadgeSvgDims(fs, genreName, voteStr, yearStr, parts)
  const box = textShadowBox(textStyle)
  const shadowPad = style === "shadow" ? box.pad : 0
  const shadowDrop = style === "shadow" ? box.drop : 0
  const safePad = genreBadgeSafePad(fs)
  const renderW = dims.totalW + shadowPad * 2 + safePad * 2
  const renderH = dims.svgH + shadowDrop
  const textParts = buildGenreTextFlow({ genreName, voteStr, yearStr, fs, centerX: renderW / 2 + textOffsetX, y: shadowDrop + dims.svgH / 2, parts })
  let defs = ""
  let filterAttr = ""
  if (style === "shadow") {
    defs = textShadowDefs("sh", textStyle)
    filterAttr = ' filter="url(#sh)"'
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}">${defs}<g fill="${textColor}"${filterAttr}${textOpacityAttr(textStyle)}>${textParts}</g></svg>`
  return { svg, w: renderW, h: renderH }
}

export function buildGenreBorderedSvg(genreName: string, voteStr: string, yearStr: string, fs: number, textColor: string, topLight: boolean, textOffsetX = 0, parts?: GenreParts) {
  const dims = genreBadgeSvgDims(fs, genreName, voteStr, yearStr, parts)
  const safePad = genreBadgeSafePad(fs)
  const borderPad = Math.max(Math.round(fs * 0.4), 6)
  const borderW = 2
  const renderW = dims.textContentW + borderPad * 2 + safePad * 2
  const rectH = dims.svgH
  const renderH = rectH
  const r = Math.round(fs * 0.55)
  const borderColor = topLight ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.60)"
  const bgFill = topLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"
  const textParts = buildGenreTextFlow({ genreName, voteStr, yearStr, fs, centerX: renderW / 2 + textOffsetX, y: rectH / 2, parts })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}"><rect x="${borderW / 2}" y="${borderW / 2}" width="${renderW - borderW}" height="${rectH - borderW}" rx="${r}" fill="${bgFill}" stroke="${borderColor}" stroke-width="${borderW}"/><g fill="${textColor}">${textParts}</g></svg>`
  return { svg, w: renderW, h: renderH }
}

export function buildGenreGlassSvg(genreName: string, voteStr: string, yearStr: string, fs: number, textColor: string, topLight: boolean, textOffsetX = 0, parts?: GenreParts) {
  const dims = genreBadgeSvgDims(fs, genreName, voteStr, yearStr, parts)
  const safePad = genreBadgeSafePad(fs)
  const glassPad = Math.max(Math.round(fs * 0.45), 8)
  const renderW = dims.textContentW + glassPad * 2 + safePad * 2
  const rectH = dims.svgH
  const renderH = rectH + Math.round(fs * 0.2)
  const r = Math.round(fs * 0.6)
  // iOS liquid glass — multi-stop gradient: bright top edge → frosted body → bottom depth
  const stops = topLight
    ? `<stop offset="0%" stop-color="rgba(255,255,255,0.92)"/><stop offset="12%" stop-color="rgba(255,255,255,0.55)"/><stop offset="50%" stop-color="rgba(255,255,255,0.32)"/><stop offset="100%" stop-color="rgba(0,0,0,0.08)"/>`
    : `<stop offset="0%" stop-color="rgba(255,255,255,0.45)"/><stop offset="10%" stop-color="rgba(255,255,255,0.14)"/><stop offset="50%" stop-color="rgba(255,255,255,0.07)"/><stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>`
  const borderColor = topLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.22)"
  const textParts = buildGenreTextFlow({ genreName, voteStr, yearStr, fs, centerX: renderW / 2 + textOffsetX, y: rectH / 2, parts })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}"><defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><rect width="${renderW}" height="${rectH}" rx="${r}" fill="url(#gg)" stroke="${borderColor}" stroke-width="1.5"/><g fill="${textColor}">${textParts}</g></svg>`
  return { svg, w: renderW, h: renderH }
}

export function buildRankingBarSvg(fullText: string, pw: number, fs: number, textColor: string, bg: string) {
  const pt = Math.round(fs * 0.35)
  const pb = pt
  const svgH = fs + pt + pb
  const textW = estimateTextWidth(fullText, fs)
  const r = Math.round(fs * 0.7)
  const shadowBlur = Math.round(fs * 0.6)
  const shadowOff = Math.round(fs * 0.2)
  const pathD = `M 0,0 L ${pw},0 L ${pw},${svgH - r} A ${r},${r} 0 0,1 ${pw - r},${svgH} L ${r},${svgH} A ${r},${r} 0 0,1 0,${svgH - r} Z`
  const defs = `<defs><filter id="ds" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${shadowOff}" stdDeviation="${shadowBlur / 2}" flood-color="rgba(0,0,0,0.3)"/></filter></defs>`
  const textEl = `<text x="${pw / 2}" y="${svgH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(fullText)}" font-weight="${RANKING_FONT_WEIGHT}" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(fullText))}</text>`
  const inner = `<path d="${pathD}" fill="${bg}" filter="url(#ds)"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${svgH}">${defs}${inner}${textEl}</svg>`, w: pw, h: svgH }
}

export function buildRankingDefaultSvg(fullText: string, fs: number, textColor: string, bg: string) {
  const px = Math.round(fs * 1.0)
  const pt = Math.round(fs * 0.5)
  const pb = pt
  const textW = estimateTextWidth(fullText, fs)
  const totalW = textW + px * 2
  const svgH = fs + pt + pb
  const r = Math.round(fs * 0.7)
  const shadowBlur = Math.round(fs * 0.6)
  const shadowOff = Math.round(fs * 0.2)
  const renderW = totalW + shadowBlur * 2
  const renderH = svgH + shadowOff + shadowBlur
  const ox = shadowBlur
  const oy = 0
  const pathD = `M ${ox},${oy} L ${ox + totalW},${oy} L ${ox + totalW},${oy + svgH - r} A ${r},${r} 0 0,1 ${ox + totalW - r},${oy + svgH} L ${ox + r},${oy + svgH} A ${r},${r} 0 0,1 ${ox},${oy + svgH - r} Z`
  const centerX = ox + totalW / 2
  const centerY = oy + svgH / 2
  const defs = `<defs><filter id="ds" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="rgba(0,0,0,0.6)"/><feDropShadow dx="0" dy="${shadowOff}" stdDeviation="${shadowBlur / 2}" flood-color="rgba(0,0,0,0.35)"/></filter></defs>`
  const textEl = `<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(fullText)}" font-weight="${RANKING_FONT_WEIGHT}" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(fullText))}</text>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}">${defs}<path d="${pathD}" fill="${bg}" stroke="rgba(255,255,255,0.15)" stroke-width="1" filter="url(#ds)"/>${textEl}</svg>`, w: renderW, h: renderH }
}

export function buildRankingPillSvg(fullText: string, fs: number, textColor: string, bg: string) {
  const px = Math.round(fs * 0.75)
  const pt = Math.round(fs * 0.35)
  const pb = pt
  const textW = Math.max(estimateTextWidth(fullText, fs), fs)
  const totalW = textW + px * 2
  const svgH = fs + pt + pb
  const r = svgH / 2
  const renderW = totalW
  const ox = 0
  const oy = 0
  const textEl = `<text x="${renderW / 2}" y="${svgH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(fullText)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(fullText))}</text>`
  const bgEl = `<rect x="${ox}" y="${oy}" width="${totalW}" height="${svgH}" rx="${r}" fill="${bg}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${svgH}">${bgEl}${textEl}</svg>`, w: renderW, h: svgH }
}

export function buildRankingGlassSvg(fullText: string, fs: number, textColor: string, _bg: string, topLight: boolean) {
  const px = Math.round(fs * 1.0)
  const pt = Math.round(fs * 0.4)
  const pb = pt
  const textW = Math.max(estimateTextWidth(fullText, fs), fs)
  const totalW = textW + px * 2
  const rectH = fs + pt + pb
  const r = Math.round(fs * 0.6)
  const renderW = totalW
  const renderH = rectH + Math.round(fs * 0.2)
  // iOS liquid glass — multi-stop gradient
  const stops = topLight
    ? `<stop offset="0%" stop-color="rgba(255,255,255,0.92)"/><stop offset="12%" stop-color="rgba(255,255,255,0.55)"/><stop offset="50%" stop-color="rgba(255,255,255,0.32)"/><stop offset="100%" stop-color="rgba(0,0,0,0.08)"/>`
    : `<stop offset="0%" stop-color="rgba(255,255,255,0.45)"/><stop offset="10%" stop-color="rgba(255,255,255,0.14)"/><stop offset="50%" stop-color="rgba(255,255,255,0.07)"/><stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>`
  const borderColor = topLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.22)"
  const textEl = `<text x="${renderW / 2}" y="${rectH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(fullText)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(fullText))}</text>`
  const defs = `<defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>`
  const bgEl = `<rect x="0" y="0" width="${totalW}" height="${rectH}" rx="${r}" fill="url(#rg)" stroke="${borderColor}" stroke-width="1.5"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}">${defs}${bgEl}${textEl}</svg>`, w: renderW, h: renderH }
}

export function buildRankingBorderedSvg(fullText: string, fs: number, textColor: string, topLight: boolean) {
  const px = Math.round(fs * 1.0)
  const pt = Math.round(fs * 0.45)
  const pb = pt
  const textW = Math.max(estimateTextWidth(fullText, fs), fs)
  const totalW = textW + px * 2
  const svgH = fs + pt + pb
  const r = Math.round(fs * 0.55)
  const renderW = totalW
  const borderW = 2
  const borderColor = topLight ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.60)"
  const bgFill = topLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"
  const textEl = `<text x="${renderW / 2}" y="${svgH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(fullText)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(fullText))}</text>`
  const bgEl = `<rect x="${borderW / 2}" y="${borderW / 2}" width="${renderW - borderW}" height="${svgH - borderW}" rx="${r}" fill="${bgFill}" stroke="${borderColor}" stroke-width="${borderW}"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${svgH}">${bgEl}${textEl}</svg>`, w: renderW, h: svgH }
}

export function buildExtraBarSvg(label: string, pw: number, fs: number, textColor: string, bg: string) {
  const pt = Math.round(fs * 0.35)
  const pb = pt
  const svgH = fs + pt + pb
  const textW = Math.max(estimateTextWidth(label, fs), fs)
  const r = Math.round(fs * 0.7)
  const shadowBlur = Math.round(fs * 0.6)
  const shadowOff = Math.round(fs * 0.2)
  const pathD = `M 0,0 L ${pw},0 L ${pw},${svgH - r} A ${r},${r} 0 0,1 ${pw - r},${svgH} L ${r},${svgH} A ${r},${r} 0 0,1 0,${svgH - r} Z`
  const defs = `<defs><filter id="ds" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${shadowOff}" stdDeviation="${shadowBlur / 2}" flood-color="rgba(0,0,0,0.3)"/></filter></defs>`
  const textEl = `<text x="${pw / 2}" y="${svgH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(label)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(label))}</text>`
  const inner = `<path d="${pathD}" fill="${bg}" filter="url(#ds)"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${svgH}">${defs}${inner}${textEl}</svg>`, w: pw, h: svgH }
}

export function buildExtraDefaultSvg(label: string, fs: number, textColor: string, bg: string) {
  const px = Math.round(fs * 1.0)
  const pt = Math.round(fs * 0.5)
  const pb = pt
  const textW = Math.max(estimateTextWidth(label, fs), fs)
  const totalW = textW + px * 2
  const svgH = fs + pt + pb
  const r = Math.round(fs * 0.7)
  const shadowBlur = Math.round(fs * 0.6)
  const shadowOff = Math.round(fs * 0.2)
  const renderW = totalW + shadowBlur * 2
  const renderH = svgH + shadowOff + shadowBlur
  const ox = shadowBlur
  const oy = 0
  const pathD = `M ${ox},${oy} L ${ox + totalW},${oy} L ${ox + totalW},${oy + svgH - r} A ${r},${r} 0 0,1 ${ox + totalW - r},${oy + svgH} L ${ox + r},${oy + svgH} A ${r},${r} 0 0,1 ${ox},${oy + svgH - r} Z`
  const centerX = ox + totalW / 2
  const centerY = oy + svgH / 2
  const defs = `<defs><filter id="ds" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="rgba(0,0,0,0.6)"/><feDropShadow dx="0" dy="${shadowOff}" stdDeviation="${shadowBlur / 2}" flood-color="rgba(0,0,0,0.35)"/></filter></defs>`
  const textEl = `<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(label)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(label))}</text>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}">${defs}<path d="${pathD}" fill="${bg}" stroke="rgba(255,255,255,0.15)" stroke-width="1" filter="url(#ds)"/>${textEl}</svg>`, w: renderW, h: renderH }
}

export function buildExtraPillSvg(label: string, fs: number, textColor: string, bg: string) {
  const px = Math.round(fs * 1.0)
  const pt = Math.round(fs * 0.4)
  const pb = pt
  const textW = Math.max(estimateTextWidth(label, fs), fs)
  const totalW = textW + px * 2
  const svgH = fs + pt + pb
  const r = svgH / 2
  const renderW = totalW
  const textEl = `<text x="${renderW / 2}" y="${svgH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(label)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(label))}</text>`
  const bgEl = `<rect x="0" y="0" width="${totalW}" height="${svgH}" rx="${r}" fill="${bg}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${svgH}">${bgEl}${textEl}</svg>`, w: renderW, h: svgH }
}

export function buildExtraGlassSvg(label: string, fs: number, textColor: string, _bg: string, topLight: boolean) {
  const px = Math.round(fs * 1.0)
  const pt = Math.round(fs * 0.4)
  const pb = pt
  const textW = Math.max(estimateTextWidth(label, fs), fs)
  const totalW = textW + px * 2
  const rectH = fs + pt + pb
  const r = Math.round(fs * 0.6)
  const renderW = totalW
  const renderH = rectH + Math.round(fs * 0.2)
  // iOS liquid glass — multi-stop gradient
  const stops = topLight
    ? `<stop offset="0%" stop-color="rgba(255,255,255,0.92)"/><stop offset="12%" stop-color="rgba(255,255,255,0.55)"/><stop offset="50%" stop-color="rgba(255,255,255,0.32)"/><stop offset="100%" stop-color="rgba(0,0,0,0.08)"/>`
    : `<stop offset="0%" stop-color="rgba(255,255,255,0.45)"/><stop offset="10%" stop-color="rgba(255,255,255,0.14)"/><stop offset="50%" stop-color="rgba(255,255,255,0.07)"/><stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>`
  const borderColor = topLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.22)"
  const textEl = `<text x="${renderW / 2}" y="${rectH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(label)}" font-weight="700" font-size="${fs}" fill="${textColor}"${textFitAttrs(textW)}>${escSvg(rtlSafe(label))}</text>`
  const defs = `<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>`
  const bgEl = `<rect x="0" y="0" width="${totalW}" height="${rectH}" rx="${r}" fill="url(#eg)" stroke="${borderColor}" stroke-width="1.5"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}">${defs}${bgEl}${textEl}</svg>`, w: renderW, h: renderH }
}

export function buildNetflixRankSvg(rank: number, pw: number) {
  const fs = Math.round(Math.max(23 * pw / 380, 14))
  const w = Math.round(fs * 2.4)
  const h = Math.round(fs * 2.0)
  const cut = Math.round(fs * 0.35)
  const topFs = Math.round(fs * 0.5)
  const rankFs = Math.round(fs * 1.0)
  const pathD = `M ${cut},0 L ${w},0 L ${w},${h} L 0,${h} L 0,${cut} Z`
  const textEl = `<text x="${w / 2}" y="${Math.round(h * 0.38)}" text-anchor="middle" dominant-baseline="central" font-family="Inter" font-weight="700" font-size="${topFs}" fill="#ffffff">TOP</text><text x="${w / 2}" y="${Math.round(h * 0.72)}" text-anchor="middle" dominant-baseline="central" font-family="Inter" font-weight="900" font-size="${rankFs}" fill="#ffffff">${rank}</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><clipPath id="nf"><path d="${pathD}"/></clipPath></defs><g clip-path="url(#nf)"><rect width="${w}" height="${h}" rx="2" fill="#E50914"/></g>${textEl}</svg>`
  return { svg, w, h }
}

export function buildQualityBadgeSvg(quality: string, fs: number, _textColor: string, _bg: string, topLight: boolean = false) {
  // Pill con funzionamento identico al badge grande: bianco→testo nero, nero→testo bianco
  const px = Math.round(fs * 0.75)
  const pt = Math.round(fs * 0.35)
  const textW = Math.max(estimateTextWidth(quality, fs), fs)
  const totalW = textW + px * 2
  const svgH = fs + pt * 2
  const r = Math.round(svgH / 2)
  const bg = topLight ? "rgba(0,0,0,0.80)" : "rgba(255,255,255,0.80)"
  const stroke = topLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.20)"
  const fg = topLight ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.88)"
  const textEl = `<text x="${totalW / 2}" y="${svgH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamilyFor(quality)}" font-weight="700" font-size="${fs}" fill="${fg}"${textFitAttrs(textW)}>${escSvg(rtlSafe(quality))}</text>`
  const bgEl = `<rect width="${totalW}" height="${svgH}" rx="${r}" fill="${bg}" stroke="${stroke}" stroke-width="1"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${svgH}">${bgEl}${textEl}</svg>`, w: totalW, h: svgH }
}

