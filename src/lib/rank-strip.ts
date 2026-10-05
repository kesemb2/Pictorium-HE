/**
 * Fork: striscia "Top 10" dei poster orizzontali.
 *
 * Un titolo nella top 10 del giorno (lib/top-today) perde una fascia a
 * sinistra: lì, su un fondo blu notte, c'è il suo numero disegnato come un
 * tubo al neon (vetro, filamento acceso, alone). Il poster vero e proprio
 * diventa un pannello con gli angoli sinistri arrotondati, appoggiato sopra la
 * striscia; il numero ci passa sotto di poco, come nelle file "Top 10".
 *
 * Le cifre sono tracciati a linea singola (la linea centrale del tubo), così
 * il tubo, il filamento e l'alone sono lo stesso tracciato a spessori diversi:
 * nessun asset, nitido a ogni scala, e uguale su ogni render.
 */
import sharp from "sharp"

/** Linea centrale di ogni cifra, in un riquadro 100×160 (y verso il basso). */
const DIGIT_PATHS: Readonly<Record<string, string>> = {
  "0": "M50 4 C 82 4 92 40 92 80 C 92 120 82 156 50 156 C 18 156 8 120 8 80 C 8 40 18 4 50 4 Z",
  "1": "M24 36 C 38 28 50 18 58 4 L 58 156 M 22 156 L 92 156",
  "2": "M12 40 C 14 16 32 4 52 4 C 76 4 90 20 90 42 C 90 66 70 82 48 104 L 10 156 L 94 156",
  "3": "M14 22 C 24 10 38 4 52 4 C 74 4 88 18 88 38 C 88 60 70 74 44 74 C 74 74 92 90 92 114 C 92 140 72 156 48 156 C 32 156 18 150 8 138",
  "4": "M72 156 L 72 4 L 6 112 L 96 112",
  "5": "M86 6 L 26 6 L 18 72 C 30 64 42 60 54 60 C 78 60 92 78 92 106 C 92 136 72 156 48 156 C 32 156 18 150 8 138",
  "6": "M80 12 C 72 6 62 4 54 4 C 26 4 10 36 10 84 C 10 132 28 156 52 156 C 76 156 92 138 92 110 C 92 82 76 66 52 66 C 32 66 16 78 10 96",
  "7": "M8 6 L 92 6 C 66 50 50 96 42 156",
  "8": "M50 74 C 28 74 16 60 16 40 C 16 18 32 4 50 4 C 68 4 84 18 84 40 C 84 60 72 74 50 74 C 24 74 10 92 10 116 C 10 140 28 156 50 156 C 72 156 90 140 90 116 C 90 92 76 74 50 74 Z",
  "9": "M20 148 C 28 154 38 156 46 156 C 74 156 90 124 90 76 C 90 28 72 4 48 4 C 24 4 8 22 8 50 C 8 78 24 94 48 94 C 68 94 84 82 90 64",
}

/** "1" senza base per i numeri a più cifre: la base urterebbe la cifra dopo. */
const ONE_NARROW = "M24 36 C 38 28 50 18 58 4 L 58 156"

/** Estremi orizzontali dell'inchiostro di ogni cifra nel riquadro. */
const DIGIT_INK: Readonly<Record<string, readonly [number, number]>> = {
  "0": [8, 92], "1": [22, 92], "1n": [24, 58], "2": [10, 94], "3": [8, 92], "4": [6, 96],
  "5": [8, 92], "6": [10, 92], "7": [8, 92], "8": [10, 90], "9": [8, 90],
}

const DIGIT_BOX_H = 160
/** Stacco fra l'inchiostro di due cifre consecutive (unità del riquadro). */
const DIGIT_GAP = 14
/** Margine attorno al tracciato per l'alone (unità del riquadro). */
const PAD = 26

/** Colori presi dal riferimento: notte, alone, tubo, filamento. */
const STRIP_BG_TOP = "#030a2e"
const STRIP_BG_BOTTOM = "#020821"
const GLOW = "#1a5dff"
const TUBE_EDGE = "rgba(175,205,255,0.55)"
const TUBE_BODY = "rgba(4,18,66,0.62)"
const CORE = "#3fb6ff"
const FILAMENT = "#dcfbff"

type Glyph = { key: string; path: string; x: number }

/** Cifre posizionate per inchiostro (non per riquadro): spaziatura uniforme. */
function layoutDigits(rank: number): { glyphs: Glyph[]; inkW: number } {
  const digits = String(Math.max(0, Math.round(rank))).split("")
  const glyphs: Glyph[] = []
  let cursor = 0
  digits.forEach((d, i) => {
    const key = d === "1" && digits.length > 1 ? "1n" : d
    const [lo, hi] = DIGIT_INK[key] ?? DIGIT_INK["0"]!
    // x = origine del riquadro della cifra; il suo inchiostro parte da `cursor`.
    glyphs.push({ key, path: key === "1n" ? ONE_NARROW : (DIGIT_PATHS[d] ?? DIGIT_PATHS["0"]!), x: cursor - lo })
    cursor += hi - lo + (i < digits.length - 1 ? DIGIT_GAP : 0)
  })
  return { glyphs, inkW: cursor }
}

/**
 * SVG del numero al neon: cifre alte `digitH` px. Restituisce le misure in px
 * e dove sta l'inchiostro dentro l'immagine (l'alone sborda di `pad`).
 */
export function neonNumberSvg(rank: number, digitH: number): { svg: string; width: number; height: number; inkLeft: number; inkW: number } {
  const k = digitH / DIGIT_BOX_H
  const { glyphs, inkW } = layoutDigits(rank)
  const vbW = inkW + PAD * 2
  const vbH = DIGIT_BOX_H + PAD * 2
  const paths = glyphs.map((g) => `<path d="${g.path}" transform="translate(${PAD + g.x} ${PAD})"/>`).join("")
  const tube = 16
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vbW * k)}" height="${Math.round(vbH * k)}" viewBox="0 0 ${vbW} ${vbH}">
<defs>
<filter id="halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.8"/></filter>
</defs>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
<g stroke="${GLOW}" stroke-width="${tube * 1.8}" opacity="0.75" filter="url(#halo)">${paths}</g>
<g stroke="${TUBE_EDGE}" stroke-width="${tube + 2}">${paths}</g>
<g stroke="${TUBE_BODY}" stroke-width="${tube}">${paths}</g>
<g stroke="${GLOW}" stroke-width="${tube * 0.7}" opacity="0.8" filter="url(#glow)">${paths}</g>
<g stroke="${CORE}" stroke-width="${tube * 0.3}" filter="url(#soft)">${paths}</g>
<g stroke="${FILAMENT}" stroke-width="${tube * 0.12}">${paths}</g>
</g>
</svg>`
  return { svg, width: Math.round(vbW * k), height: Math.round(vbH * k), inkLeft: Math.round(PAD * k), inkW: Math.round(inkW * k) }
}

/** Altezza piena delle cifre: 41% del canvas (il "1" del riferimento). */
function digitHeight(canvasH: number): number {
  return Math.round(canvasH * 0.41)
}

/** Margine sinistro dell'inchiostro nella striscia (40/1920 del riferimento). */
function stripMargin(canvasW: number): number {
  return Math.round(canvasW * 0.021)
}

/**
 * Misure del numero: larghezza della striscia e altezza delle cifre.
 * Con una cifra la striscia è fissa (285/1920 del riferimento: i pannelli di
 * una fila restano allineati) e una cifra larga si rimpicciolisce appena per
 * starci; il 10 allarga la striscia quanto basta.
 */
function numberLayout(canvasW: number, canvasH: number, rank: number): { stripW: number; digitH: number } {
  const base = Math.round(canvasW * 0.148)
  const margin = stripMargin(canvasW)
  const { inkW } = layoutDigits(rank)
  const fullK = digitHeight(canvasH) / DIGIT_BOX_H
  if (String(Math.round(rank)).length === 1) {
    const k = Math.min(fullK, (base - margin * 1.4) / inkW)
    return { stripW: base, digitH: Math.round(DIGIT_BOX_H * k) }
  }
  const k = fullK * 0.9
  return { stripW: Math.max(base, Math.round(inkW * k) + margin * 2), digitH: Math.round(DIGIT_BOX_H * k) }
}

/** Larghezza della striscia per questo rank (vedi `numberLayout`). */
export function rankStripWidth(canvasW: number, canvasH: number, rank: number): number {
  return numberLayout(canvasW, canvasH, rank).stripW
}

export interface RankStripInput {
  /** Poster già composto, largo `canvasW - stripW`, alto `canvasH`. */
  readonly panel: Buffer
  readonly rank: number
  readonly canvasW: number
  readonly canvasH: number
  readonly stripW: number
}

/**
 * Tela finale: striscia blu notte con il numero, pannello del poster a destra
 * con gli angoli sinistri arrotondati e un'ombra morbida sulla striscia.
 */
export async function composeRankStrip(input: RankStripInput): Promise<Buffer> {
  const { canvasW: W, canvasH: H, stripW: S } = input
  const panelW = W - S
  const r = Math.round(H * 0.065)
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${STRIP_BG_TOP}"/><stop offset="1" stop-color="${STRIP_BG_BOTTOM}"/></linearGradient>
<radialGradient id="lift" cx="${(S * 0.55) / W}" cy="0.52" r="0.32"><stop offset="0" stop-color="#0b2d7a" stop-opacity="0.75"/><stop offset="1" stop-color="#0b2d7a" stop-opacity="0"/></radialGradient>
</defs>
<rect width="100%" height="100%" fill="url(#bg)"/>
<rect width="100%" height="100%" fill="url(#lift)"/>
</svg>`
  // Numero: alto ~41% del canvas, centrato in verticale; l'inchiostro
  // finisce sul bordo del pannello (lo sfiora appena, come nel riferimento).
  const num = neonNumberSvg(input.rank, numberLayout(W, H, input.rank).digitH)
  const numPng = await sharp(Buffer.from(num.svg)).png().toBuffer()
  const inkRight = S - Math.round(stripMargin(W) * 0.4)
  const numLeft = inkRight - num.inkW - num.inkLeft
  const numTop = Math.round(H * 0.51 - num.height / 2)
  // Ombra del pannello sulla striscia.
  const shadow = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(2, Math.round(H * 0.02))}"/></filter></defs><rect x="${S - 2}" y="0" width="${panelW + r}" height="${H}" rx="${r}" fill="#000" opacity="0.55" filter="url(#s)"/></svg>`
  // Pannello: angoli sinistri arrotondati (a destra il bordo del canvas).
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelW}" height="${H}"><path d="M${r},0 L${panelW},0 L${panelW},${H} L${r},${H} Q0,${H} 0,${H - r} L0,${r} Q0,0 ${r},0 Z" fill="#fff"/></svg>`
  const edge = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelW}" height="${H}"><path d="M${panelW},0.75 L${r},0.75 Q0.75,0.75 0.75,${r} L0.75,${H - r} Q0.75,${H - 0.75} ${r},${H - 0.75} L${panelW},${H - 0.75}" fill="none" stroke="rgba(150,190,255,0.28)" stroke-width="1.5"/></svg>`
  const panel = await sharp(input.panel)
    .resize(panelW, H, { fit: "cover" })
    .composite([{ input: Buffer.from(mask), blend: "dest-in" }, { input: Buffer.from(edge) }])
    .png()
    .toBuffer()
  const numClip = await sharp(numPng)
    .extract({ left: Math.max(0, -numLeft), top: Math.max(0, -numTop), width: Math.min(num.width - Math.max(0, -numLeft), W - Math.max(0, numLeft)), height: Math.min(num.height - Math.max(0, -numTop), H - Math.max(0, numTop)) })
    .png()
    .toBuffer()
  return sharp(Buffer.from(bg))
    .composite([
      { input: numClip, left: Math.max(0, numLeft), top: Math.max(0, numTop) },
      { input: Buffer.from(shadow), left: 0, top: 0 },
      { input: panel, left: S, top: 0 },
    ])
    .png()
    .toBuffer()
}
