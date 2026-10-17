/**
 * Fork: chi c'è nell'immagine. Volti (BlazeFace) e persone (CenterNet, classi
 * COCO) dal pacchetto @vladmandic/human, su TensorFlow.js con backend WASM:
 * niente binari nativi, modelli letti dal disco, nessuna chiamata di rete.
 *
 * Serve solo al ritaglio dei backdrop in poster (`smart-crop.ts`). Si carica
 * pigramente alla prima immagine da ritagliare (un poster normale non lo
 * tocca mai), ogni analisi ha un tetto di tempo, e su qualunque errore la
 * risposta è null: il ritaglio ripiega sul profilo visivo, mai un poster rotto.
 *
 * Misurato in locale: avvio a freddo ~1.1s (WASM + modelli), poi ~50ms a
 * immagine a 640px. Le analisi passano una alla volta (memoria e CPU limitate).
 */
import path from "node:path"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { createLogger } from "@/lib/logger"

const log = createLogger("subject-detect")

/** Riquadro normalizzato (0..1) di un volto o di una persona. */
export interface SubjectBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly score: number
}

export interface Subjects {
  readonly faces: readonly SubjectBox[]
  readonly people: readonly SubjectBox[]
}

/** Larghezza a cui gira il riconoscimento (quella misurata sul set di prova). */
const DETECT_WIDTH = 640
/** Tetto di un'analisi, avvio a freddo compreso: oltre, null e profilo visivo. */
export const DETECT_BUDGET_MS = 2500
const MIN_SCORE = 0.25

type Box4 = [number, number, number, number]
interface HumanResult {
  face: Array<{ box?: Box4; boxScore?: number; score?: number }>
  object: Array<{ label: string; score: number; box: Box4 }>
}
interface TfLike {
  tensor(values: Int32Array, shape: number[], dtype: "int32"): unknown
  dispose(t: unknown): void
  io: { registerLoadRouter(router: (url: string | string[]) => unknown): void }
}
interface HumanLike {
  load(): Promise<void>
  detect(input: unknown): Promise<HumanResult>
  tf: TfLike
}

const HUMAN_CONFIG = {
  backend: "wasm",
  debug: false,
  warmup: "none",
  // Ogni immagine è nuova: niente cache tra fotogrammi né salti "video".
  cacheSensitivity: 0,
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 12, minConfidence: MIN_SCORE, skipFrames: 0, skipTime: 0, return: false },
    mesh: { enabled: false },
    iris: { enabled: false },
    description: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
  object: { enabled: true, modelPath: "centernet.json", minConfidence: MIN_SCORE, maxDetected: 20, skipFrames: 0, skipTime: 0 },
}

/**
 * Loader `file://` per tfjs: legge model.json e i pesi dal disco. Solo dalla
 * cartella dei modelli del pacchetto, mai un percorso arbitrario.
 */
function fileModelHandler(url: string, modelsDir: string) {
  const file = fileURLToPath(url)
  if (!file.startsWith(modelsDir + path.sep)) return null
  return {
    load: async () => {
      const json = JSON.parse(await readFile(file, "utf8"))
      const dir = path.dirname(file)
      const weightSpecs: unknown[] = []
      const chunks: Buffer[] = []
      for (const group of json.weightsManifest ?? []) {
        weightSpecs.push(...group.weights)
        for (const p of group.paths) chunks.push(await readFile(path.join(dir, path.basename(p))))
      }
      const all = Buffer.concat(chunks)
      return {
        modelTopology: json.modelTopology,
        format: json.format,
        generatedBy: json.generatedBy,
        convertedBy: json.convertedBy,
        signature: json.signature,
        userDefinedMetadata: json.userDefinedMetadata,
        modelInitializer: json.modelInitializer,
        weightSpecs,
        weightData: all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength),
      }
    },
  }
}

async function loadHuman(): Promise<HumanLike> {
  // Import con stringa letterale: sono serverExternalPackages, così il
  // tracing li porta nella lambda, e human li ritrova già caricati.
  await import("@tensorflow/tfjs-core")
  await import("@tensorflow/tfjs-converter")
  await import("@tensorflow/tfjs-backend-wasm")
  // Percorsi dalla radice del progetto, come i font (fonts.ts): nella lambda
  // il tracing copia solo i file elencati in next.config, quindi niente
  // risoluzione di pacchetto (l'`exports` di human non espone la build
  // node-wasm, e il suo package.json non viaggia). human, caricato da qui,
  // ritrova le stesse copie di tfjs importate sopra.
  const modules = path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules")
  const humanDir = path.join(modules, "@vladmandic", "human")
  const wasmDir = path.join(modules, "@tensorflow", "tfjs-backend-wasm", "dist")
  const modelsDir = path.join(humanDir, "models")
  const req = createRequire(path.join(humanDir, "dist", "loader.cjs"))
  const { Human } = req(path.join(humanDir, "dist", "human.node-wasm.js")) as { Human: new (config: unknown) => HumanLike }
  const human = new Human({
    ...HUMAN_CONFIG,
    wasmPath: `file://${wasmDir}/`,
    modelBasePath: `file://${modelsDir}/`,
  })
  human.tf.io.registerLoadRouter((url) => (typeof url === "string" && url.startsWith("file://") ? fileModelHandler(url, modelsDir) : null))
  await human.load()
  return human
}

let humanPromise: Promise<HumanLike> | null = null
function getHuman(): Promise<HumanLike> {
  if (!humanPromise) {
    const t0 = Date.now()
    humanPromise = loadHuman().then(
      (h) => { log.info("Subject detector ready", { ms: Date.now() - t0 }); return h },
      (e) => {
        // Niente retry a raffica: il prossimo processo riproverà.
        log.warn("Subject detector unavailable", { error: e instanceof Error ? e.message : String(e) })
        throw e
      },
    )
  }
  return humanPromise
}

function toBox(b: Box4, score: number, w: number, h: number): SubjectBox {
  return { x: b[0] / w, y: b[1] / h, w: b[2] / w, h: b[3] / h, score }
}

async function runDetection(buf: Buffer): Promise<Subjects> {
  const human = await getHuman()
  const { data, info } = await sharp(buf)
    .resize({ width: DETECT_WIDTH, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const input = human.tf.tensor(new Int32Array(data), [1, info.height, info.width, 3], "int32")
  try {
    const r = await human.detect(input)
    return {
      faces: r.face
        .filter((f) => f.box && (f.boxScore ?? f.score ?? 0) >= MIN_SCORE)
        .map((f) => toBox(f.box!, f.boxScore ?? f.score ?? 0, info.width, info.height)),
      people: r.object
        .filter((o) => o.label === "person" && o.score >= MIN_SCORE)
        .map((o) => toBox(o.box, o.score, info.width, info.height)),
    }
  } finally {
    human.tf.dispose(input)
  }
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Volti e persone dell'immagine, o null (disattivato, errore, tetto di tempo
 * superato). Il tetto non ferma il lavoro già partito: la prossima analisi
 * trova il modello caldo.
 */
export async function detectSubjects(buf: Buffer, budgetMs: number = DETECT_BUDGET_MS): Promise<Subjects | null> {
  if (process.env.PICTORIUM_SUBJECT_DETECT === "0") return null
  const job = queue.then(() => runDetection(buf), () => runDetection(buf))
  queue = job.catch(() => null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budgetMs) })
  try {
    return await Promise.race([job.catch(() => null), timeout])
  } finally {
    clearTimeout(timer)
  }
}
