/**
 * Rilevatore visivo di testo stampato su un poster.
 *
 * Serve a fanart.tv: un poster marcato "No Language" ("00") dovrebbe essere
 * senza scritte, ma chi lo carica a volte sbaglia il tag. Il metadato da solo
 * non basta a garantire "mai un poster con il titolo stampato", quindi i
 * candidati clean di fanart passano anche da qui.
 *
 * Il testo si riconosce come una FASCIA orizzontale di tratti verticali corti:
 * - tante transizioni di bordo per riga (ogni lettera ha 2+ aste),
 * - aste allineate da una riga all'altra (coerenza verticale),
 * - la fascia spicca sulla trama del poster subito sopra e sotto,
 * - alta 1.5–20% del poster e larga almeno un quarto.
 * Fogliame e rumore hanno transizioni ma senza coerenza né bordi netti; una
 * città illuminata è coerente ma occupa una regione troppo alta per essere una
 * riga di testo. Soglie conservative: nel dubbio il poster non è "clean".
 */

import sharp from "sharp"

/** Griglia di analisi: piccola (costo trascurabile) ma sufficiente per un titolo. */
export const TEXT_DETECT_W = 200
export const TEXT_DETECT_H = 300

export interface TextBand {
  /** Prima e ultima riga della fascia (griglia TEXT_DETECT_H). */
  readonly top: number
  readonly bottom: number
  /** Transizioni medie per riga nella fascia. */
  readonly runs: number
  /** Rapporto tra la densità della fascia e quella del contorno. */
  readonly contrast: number
  /** Frazione di bordi con un bordo vicino nella riga sopra. */
  readonly coherence: number
  /** Larghezza occupata (0..1). */
  readonly span: number
}

export interface PosterTextResult {
  readonly hasText: boolean
  /** Punteggio della fascia più "testuale" (0 = nessuna fascia). */
  readonly score: number
  readonly band: TextBand | null
}

// Soglie (griglia 200×300).
const EDGE_MIN = 26
/** Soglie fisse extra: sui poster con trama fitta (fogliame, sabbia) solo i
 *  bordi molto netti delle lettere sopravvivono e la fascia riemerge. */
const EXTRA_EDGE_THRESHOLDS = [60, 95, 130] as const
const MIN_ROW_RUNS = 5
/** Una riga è "attiva" se supera di questo fattore la mediana locale. */
const LOCAL_RATIO = 1.6
const LOCAL_WINDOW = 40
const MIN_BAND_ROWS = 4
const MAX_BAND_FRACTION = 0.2
const MIN_SPAN = 0.22
const MIN_CONTRAST = 2.2
const MIN_COHERENCE = 0.5
/** Aste per pixel di ampiezza: le lettere sono fitte, oggetti sparsi no. */
const MIN_DENSITY = 0.09
/** Contrasto minimo della fascia verso ciascun lato (sopra e sotto). */
const MIN_SIDE_CONTRAST = 1.1
/** Fasce simili vicine oltre le quali la fascia è trama, non testo. */
const PERIODIC_NEIGHBOURS = 3
/** Punteggio minimo perché la fascia conti come testo. */
export const TEXT_SCORE_THRESHOLD = 0.8

async function greyGrid(buf: Buffer): Promise<Uint8Array> {
  const { data } = await sharp(buf)
    .resize(TEXT_DETECT_W, TEXT_DETECT_H, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return new Uint8Array(data.buffer, data.byteOffset, data.length)
}

/** Gradiente orizzontale (bordi verticali) e soglia adattiva di base. */
function gradientMap(g: Uint8Array): { grad: Uint16Array; adaptive: number } {
  const W = TEXT_DETECT_W, H = TEXT_DETECT_H
  const grad = new Uint16Array(W * H)
  const hist = new Uint32Array(256)
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const v = Math.abs(g[y * W + x + 1]! - g[y * W + x - 1]!)
      grad[y * W + x] = v
      hist[Math.min(255, v)]!++
    }
  }
  // max(EDGE_MIN, 92° percentile): il percentile normalizza i poster molto
  // contrastati; il minimo evita che il rumore di un poster piatto diventi "bordi".
  const total = W * H
  let acc = 0
  let p92 = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!
    if (acc >= total * 0.92) { p92 = v; break }
  }
  return { grad, adaptive: Math.max(EDGE_MIN, p92) }
}

const EXTREME_LIGHT = 236
const EXTREME_DARK = 18

/** Bordi della maschera dei pixel estremi (transizioni dentro/fuori). */
function extremeEdges(g: Uint8Array, inMask: (v: number) => boolean): Uint8Array {
  const W = TEXT_DETECT_W, H = TEXT_DETECT_H
  const edges = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    let prev = inMask(g[y * W]!)
    for (let x = 1; x < W; x++) {
      const cur = inMask(g[y * W + x]!)
      if (cur !== prev) edges[y * W + x] = 1
      prev = cur
    }
  }
  return edges
}

function threshold(grad: Uint16Array, thr: number): Uint8Array {
  const edges = new Uint8Array(grad.length)
  for (let i = 0; i < grad.length; i++) edges[i] = grad[i]! >= thr ? 1 : 0
  return edges
}

interface RowStat { runs: number; first: number; last: number }

function rowStats(edges: Uint8Array): RowStat[] {
  const W = TEXT_DETECT_W, H = TEXT_DETECT_H
  const out: RowStat[] = []
  for (let y = 0; y < H; y++) {
    let runs = 0, first = -1, last = -1, prev = 0
    for (let x = 0; x < W; x++) {
      const e = edges[y * W + x]!
      if (e && !prev) {
        runs++
        if (first < 0) first = x
      }
      if (e) last = x
      prev = e
    }
    out.push({ runs, first, last })
  }
  return out
}

/**
 * Coerenza verticale della fascia: frazione dei bordi (righe top+1..bottom)
 * con un bordo a ±1 px nella riga sopra. Conteggio aggregato, così le righe
 * vuote di interlinea non abbassano la media.
 */
function bandCoherence(edges: Uint8Array, top: number, bottom: number): number {
  const W = TEXT_DETECT_W
  let n = 0, hit = 0
  for (let y = Math.max(1, top + 1); y <= bottom; y++) {
    const row = y * W, up = (y - 1) * W
    for (let x = 1; x < W - 1; x++) {
      if (!edges[row + x]) continue
      n++
      if (edges[up + x - 1] || edges[up + x] || edges[up + x + 1]) hit++
    }
  }
  return n === 0 ? 0 : hit / n
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

/** Analisi pura su una griglia di bordi già calcolata (esportata per i test). */
export function analyseEdges(edges: Uint8Array): PosterTextResult {
  const H = TEXT_DETECT_H, W = TEXT_DETECT_W
  const rows = rowStats(edges)
  const runsArr = rows.map((r) => r.runs)
  // Riga "attiva": abbastanza aste per essere lettere E sopra la trama locale
  // (mediana su ±LOCAL_WINDOW righe). Su uno sfondo fitto la trama alza la
  // mediana e solo le righe di testo restano sopra.
  const active = rows.map((r, y) => {
    const local = median(runsArr.slice(Math.max(0, y - LOCAL_WINDOW), Math.min(H, y + LOCAL_WINDOW + 1)))
    return r.runs >= MIN_ROW_RUNS && r.runs >= local * LOCAL_RATIO
  })
  // Fasce = righe attive consecutive. Buchi fino a 2 righe ammessi: i tagli
  // orizzontali di E/F/T creano righe con meno aste, e le righe di un blocco
  // crediti sono separate da 1–2 righe di interlinea.
  const bands: Array<[number, number]> = []
  let y = 0
  while (y < H) {
    if (!active[y]) { y++; continue }
    let end = y
    while (end + 1 < H && (active[end + 1] || (end + 2 < H && active[end + 2]) || (end + 3 < H && active[end + 3]))) end++
    bands.push([y, end])
    y = end + 1
  }
  const bandRuns = bands.map(([t, b]) => mean(runsArr.slice(t, b + 1)))
  let best: TextBand | null = null
  let bestScore = 0
  for (let bi = 0; bi < bands.length; bi++) {
    const [top, bottom] = bands[bi]!
    const h = bottom - top + 1
    if (h < MIN_BAND_ROWS || h > H * MAX_BAND_FRACTION) continue
    const bandRows = rows.slice(top, bottom + 1)
    const runs = bandRuns[bi]!
    // Trama periodica (finestre illuminate, piastrelle): la fascia ha intorno
    // PERIODIC_NEIGHBOURS o più fasce simili a breve distanza. Un titolo su
    // due righe o un blocco crediti di 2–3 righe resta sotto la soglia.
    const reach = Math.max(12, h * 6)
    let similar = 0
    for (let bj = 0; bj < bands.length; bj++) {
      if (bj === bi) continue
      const [t2, b2] = bands[bj]!
      const dist = t2 > bottom ? t2 - bottom : top - b2
      const r2 = bandRuns[bj]!
      if (dist > 0 && dist <= reach && r2 >= runs * 0.6 && r2 <= runs * 1.6) similar++
    }
    if (similar >= PERIODIC_NEIGHBOURS) continue
    // Contorno: altrettante righe sopra e sotto (almeno 4), escluse le 2 righe
    // a ridosso (antialiasing dei bordi delle lettere).
    const ctxH = Math.max(4, h)
    const above: number[] = []
    const below: number[] = []
    for (let i = top - 2 - ctxH; i < top - 2; i++) if (i >= 0) above.push(rows[i]!.runs)
    for (let i = bottom + 3; i <= bottom + 2 + ctxH; i++) if (i < H) below.push(rows[i]!.runs)
    const contrast = runs / Math.max(1, mean([...above, ...below]))
    // Una riga di testo spicca da ENTRAMBI i lati (almeno un po'): il bordo di
    // una trama (cielo sopra, finestre sotto) spicca da un lato solo. Una
    // seconda riga di titolo vicina abbassa un lato ma non sotto questa soglia.
    const sideContrasts = [above, below].filter((side) => side.length > 0).map((side) => runs / Math.max(1, mean(side)))
    if (sideContrasts.length > 0 && Math.min(...sideContrasts) < MIN_SIDE_CONTRAST) continue
    let firstX = W, lastX = -1
    for (const r of bandRows) {
      if (r.first >= 0 && r.first < firstX) firstX = r.first
      if (r.last > lastX) lastX = r.last
    }
    const spanPx = lastX >= firstX ? lastX - firstX + 1 : 0
    const span = spanPx / W
    if (span < MIN_SPAN) continue
    const density = runs / Math.max(1, spanPx)
    const coherence = bandCoherence(edges, top, bottom)
    // Punteggio: 1 = sulla soglia per ogni criterio; il minimo dei rapporti fa
    // sì che un criterio forte non compensi uno mancante.
    const score = Math.min(
      contrast / MIN_CONTRAST,
      coherence / MIN_COHERENCE,
      runs / (MIN_ROW_RUNS + 1),
      density / MIN_DENSITY,
    )
    if (score > bestScore) {
      bestScore = score
      best = { top, bottom, runs, contrast, coherence, span }
    }
  }
  return { hasText: bestScore >= TEXT_SCORE_THRESHOLD, score: bestScore, band: best }
}

/** Le mappe di bordi analizzate, con nome (esportata per test e debug). */
export async function textDetectMaps(buf: Buffer): Promise<Array<{ name: string; edges: Uint8Array }>> {
  const grey = await greyGrid(buf)
  const { grad, adaptive } = gradientMap(grey)
  const out = [adaptive, ...EXTRA_EDGE_THRESHOLDS.filter((t) => t > adaptive)].map((thr) => ({ name: `grad>=${thr}`, edges: threshold(grad, thr) }))
  // Titoli quasi sempre bianchi o neri pieni: isolando solo i pixel estremi la
  // trama a mezzi toni (luci di città, righe di tessuto, fogliame) sparisce e
  // le lettere restano.
  out.push({ name: "light", edges: extremeEdges(grey, (v) => v >= EXTREME_LIGHT) })
  out.push({ name: "dark", edges: extremeEdges(grey, (v) => v <= EXTREME_DARK) })
  return out
}

/** True se il poster ha (probabilmente) testo stampato sopra. */
export async function detectPosterText(buf: Buffer): Promise<PosterTextResult> {
  let best: PosterTextResult = { hasText: false, score: 0, band: null }
  for (const { edges } of await textDetectMaps(buf)) {
    const r = analyseEdges(edges)
    if (r.score > best.score) best = r
  }
  return best
}
