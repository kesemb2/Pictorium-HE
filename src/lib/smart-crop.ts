/**
 * Fork: ritaglio di un'immagine larga (backdrop) in un poster verticale.
 *
 * Il vecchio `position: attention` di sharp inseguiva luce e saturazione
 * (sole, cielo, fiamme, un'auto rossa) e spesso spingeva la cornice sul
 * bordo: sulle 23 scelte fatte a mano nella "מעבדת החיתוך" prendeva il
 * soggetto 4 volte su 23 (il centro geometrico: 13). Le scelte umane dicono
 * una cosa sola: le persone, i volti, la figura più grande.
 *
 * La cornice è a piena altezza, quindi conta solo dove cade in orizzontale.
 * Ogni posizione riceve un punteggio da:
 *   - volti e persone (`subject-detect.ts`), pesati per grandezza rispetto
 *     al più grande dell'immagine: conta quanta parte del riquadro entra;
 *   - un profilo visivo per colonna (contrasto di colore sullo sfondo medio
 *     e bordi), che decide da solo quando non c'è nessuno da riconoscere;
 *   - una lieve preferenza per il centro-destra (i backdrop lasciano spesso
 *     la sinistra libera per il titolo).
 * Pesi tarati su quelle 23 immagini: 20 su 23 valutando ognuna con pesi
 * tarati sulle altre 22 (errore medio 5% della larghezza, contro il 27% di
 * `attention`). Senza riconoscimento (errore, tetto di tempo) resta il
 * profilo visivo.
 */
import { createHash } from "node:crypto"
import sharp from "sharp"
import { cacheGet, cacheSet } from "@/lib/cache"
import { detectSubjects, type SubjectBox, type Subjects } from "@/lib/subject-detect"

/** Pesi del punteggio (vedi l'intestazione). */
export const CROP_WEIGHTS = {
  face: 1,
  person: 2,
  contrast: 1,
  edges: 1,
  centre: 1,
  /** Centro preferito (frazione della larghezza). */
  centreAt: 0.55,
  /** Esponente della grandezza relativa di volti e persone. */
  sizeExp: 0.5,
} as const

const PROFILE_W = 256
const ANALYSIS_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface ColumnProfile {
  readonly width: number
  /** Contrasto di colore (sfocato) rispetto al colore medio, per colonna. */
  readonly contrast: readonly number[]
  /** Energia dei bordi (Sobel sulla luminanza), per colonna. */
  readonly edges: readonly number[]
}

export interface CropAnalysis {
  readonly profile: ColumnProfile
  readonly subjects: Subjects | null
}

function toLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const R = lin(r), G = lin(g), B = lin(b)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
}

/** Profili per colonna su una copia larga {@link PROFILE_W}px. */
export async function columnProfile(buf: Buffer): Promise<ColumnProfile> {
  const { data, info } = await sharp(buf).resize(PROFILE_W).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const blur = await sharp(buf).resize(PROFILE_W).removeAlpha().blur(2.5).raw().toBuffer()
  const W = info.width, H = info.height, N = W * H
  const L = new Float32Array(N), labB = new Float32Array(N * 3)
  let m0 = 0, m1 = 0, m2 = 0
  for (let i = 0; i < N; i++) {
    const a = toLab(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])
    L[i] = a[0]; m0 += a[0]; m1 += a[1]; m2 += a[2]
    const b = toLab(blur[i * 3], blur[i * 3 + 1], blur[i * 3 + 2])
    labB[i * 3] = b[0]; labB[i * 3 + 1] = b[1]; labB[i * 3 + 2] = b[2]
  }
  m0 /= N; m1 /= N; m2 /= N
  const contrast = new Array<number>(W).fill(0)
  const edges = new Array<number>(W).fill(0)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      contrast[x] += Math.hypot(labB[i * 3] - m0, labB[i * 3 + 1] - m1, labB[i * 3 + 2] - m2)
      const g = (dx: number, dy: number) => L[(y + dy) * W + x + dx]
      const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1)
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1)
      edges[x] += Math.hypot(gx, gy)
    }
  }
  return { width: W, contrast, edges }
}

function prefixShare(values: readonly number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0) || 1
  const out = [0]
  for (const v of values) out.push(out[out.length - 1] + v / total)
  return out
}

/** Peso di ogni riquadro: grandezza (per punteggio) rispetto al più grande. */
function weighted(boxes: readonly SubjectBox[]): Array<{ a: number; b: number; w: number }> {
  const raw = boxes.map((b) => ({ a: b.x, b: b.x + b.w, w: b.score * b.w * b.h }))
  const max = Math.max(1e-6, ...raw.map((r) => r.w))
  return raw.map((r) => ({ ...r, w: (r.w / max) ** CROP_WEIGHTS.sizeExp }))
}

const inside = (a: number, b: number, lo: number, hi: number) => Math.max(0, Math.min(b, hi) - Math.max(a, lo)) / Math.max(1e-6, b - a)

/**
 * Centro orizzontale (0..1) della cornice migliore, larga `windowFrac` della
 * larghezza dell'immagine.
 */
export function chooseCropCentre(analysis: CropAnalysis, windowFrac: number): number {
  const { profile, subjects } = analysis
  const W = profile.width
  const ww = Math.max(1, Math.min(W, Math.round(windowFrac * W)))
  const contrast = prefixShare(profile.contrast)
  const edges = prefixShare(profile.edges)
  const faces = subjects ? weighted(subjects.faces) : []
  const people = subjects ? weighted(subjects.people) : []
  let best = -Infinity, bestX = 0
  for (let x0 = 0; x0 + ww <= W; x0++) {
    const lo = x0 / W, hi = (x0 + ww) / W
    let s = CROP_WEIGHTS.contrast * (contrast[x0 + ww] - contrast[x0]) + CROP_WEIGHTS.edges * (edges[x0 + ww] - edges[x0])
    for (const f of faces) s += CROP_WEIGHTS.face * f.w * inside(f.a, f.b, lo, hi)
    for (const p of people) s += CROP_WEIGHTS.person * p.w * inside(p.a, p.b, lo, hi)
    const cx = (lo + hi) / 2
    s -= CROP_WEIGHTS.centre * ((cx - CROP_WEIGHTS.centreAt) / 0.25) ** 2 * 0.1
    if (s > best) { best = s; bestX = x0 }
  }
  return (bestX + ww / 2) / W
}

function analysisKey(buf: Buffer): string {
  return `smartcrop:v1:${createHash("sha1").update(buf).digest("hex")}`
}

/**
 * Profilo + soggetti dell'immagine, memorizzati per contenuto (30 giorni):
 * la stessa immagine non si analizza due volte. Un riconoscimento fallito
 * non si memorizza, così la prossima volta ci riprova.
 */
export async function analyzeForCrop(buf: Buffer): Promise<CropAnalysis> {
  const key = analysisKey(buf)
  const hit = cacheGet<CropAnalysis>(key)
  if (hit) return hit
  const [profile, subjects] = await Promise.all([columnProfile(buf), detectSubjects(buf)])
  const analysis = { profile, subjects }
  if (subjects) cacheSet(key, analysis, ["smartcrop"], ANALYSIS_TTL_MS)
  return analysis
}

/** Vero se nell'immagine c'è qualcuno di riconoscibile con buona fiducia. */
export function hasClearSubject(analysis: CropAnalysis): boolean {
  const s = analysis.subjects
  return !!s && [...s.faces, ...s.people].some((b) => b.score >= 0.4)
}

/**
 * Ritaglia `buf` in `outW`×`outH` scegliendo dove tagliare. Un'immagine già
 * più stretta del formato (nessuna scelta orizzontale) passa dal cover di
 * sharp come prima.
 */
export async function smartCropToPortrait(buf: Buffer, outW: number, outH: number, quality: number, analysis?: CropAnalysis): Promise<Buffer> {
  const meta = await sharp(buf).metadata()
  const srcW = meta.width || 0, srcH = meta.height || 0
  const cropW = Math.round((srcH * outW) / outH)
  if (!srcW || !srcH || cropW >= srcW) {
    return sharp(buf).resize(outW, outH, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality }).toBuffer()
  }
  const a = analysis ?? (await analyzeForCrop(buf))
  const cx = chooseCropCentre(a, cropW / srcW)
  const left = Math.max(0, Math.min(srcW - cropW, Math.round(cx * srcW - cropW / 2)))
  return sharp(buf)
    .extract({ left, top: 0, width: cropW, height: srcH })
    .resize(outW, outH, { fit: "cover" })
    .jpeg({ quality })
    .toBuffer()
}
