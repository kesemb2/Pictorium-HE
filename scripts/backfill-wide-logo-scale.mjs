// Backfill una tantum: riallinea logoScale ai wordmark panoramici salvati con
// scala automatica satura (>= --min-scale, default 70).
//
// Contesto: il vecchio default automatico saturava a 75 per QUALSIASI logo più
// largo di 2:1, quindi i mapping salvati in quell'epoca hanno logoScale: 75
// congelato. Lo script misura l'aspect reale di ogni logo via TMDB /images e
// propone/scrive per i wordmark larghi (aspect > --min-aspect, default 2.2)
// la STESSA curva del default attuale (`round(37.5 * sqrt(aspect))`, cap 75 —
// sincronizzata con logoDefaultScale in logo-selection.ts): arretrato e futuro
// convergono allo stesso valore, una sola fonte di verità. `--target N`
// forza invece un valore piatto N per tutti i confermati.
// I mapping con scala manuale bassa (< --min-scale) non vengono mai toccati.
//
// Uso:
//   node scripts/backfill-wide-logo-scale.mjs [--apply] [--data-dir ./data]
//     [--tmdb-key KEY] [--min-scale 70] [--min-aspect 2.2] [--target N]
// Dry-run di default: stampa la tabella candidati, non scrive niente.
// Con --apply: backup data/mappings.json.bak-<ts> + scrittura (logoScale +
// updatedAt, così la cache poster si invalida da sola).
//
// Mai RENDER_VERSION: è una migrazione dati, non un cambio del motore.

import { readFileSync, writeFileSync, copyFileSync } from "node:fs"
import path from "node:path"

const TMDB_API = process.env.TMDB_API_URL || "https://api.themoviedb.org/3"

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const APPLY = process.argv.includes("--apply")
const DATA_DIR = arg("--data-dir", process.env.DATA_DIR || path.join(process.cwd(), "data"))
const TMDB_KEY = arg("--tmdb-key", process.env.PICTORIUM_TMDB_KEY || process.env.TMDB_API_KEY || "")
const MIN_SCALE = Number(arg("--min-scale", "70"))
const MIN_ASPECT = Number(arg("--min-aspect", "2.2"))
// Curva default sincronizzata con logoDefaultScale (logo-selection.ts).
const curveScale = (aspect) => Math.min(Math.round(37.5 * Math.pow(aspect, 2 / 3)), 75)
const FLAT_TARGET = arg("--target", null)
const TARGET = FLAT_TARGET === null ? null : Number(FLAT_TARGET)

if (!TMDB_KEY) {
  console.error("Serve una chiave TMDB: --tmdb-key KEY o env PICTORIUM_TMDB_KEY / TMDB_API_KEY")
  process.exit(1)
}

const FILE = path.join(DATA_DIR, "mappings.json")
let raw
try {
  raw = readFileSync(FILE, "utf-8")
} catch (e) {
  console.error(`Mapping non trovati in ${FILE} (${e.message}) — niente da fare.`)
  process.exit(1)
}
const mappings = JSON.parse(raw)
const entries = Object.entries(mappings)
const candidates = entries.filter(
  ([, m]) => m?.logoPath && (m.logoScale ?? 0) >= MIN_SCALE,
)
console.log(`${entries.length} mapping totali, ${candidates.length} con logo a scala >= ${MIN_SCALE}`)

async function logoAspect(mediaType, tmdbId, logoPath) {
  const type = mediaType === "tv" ? "tv" : "movie"
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(
      `${TMDB_API}/${type}/${tmdbId}/images?api_key=${encodeURIComponent(TMDB_KEY)}`,
      { signal: ctrl.signal },
    )
    if (!res.ok) return { error: `TMDB ${res.status}` }
    const data = await res.json()
    const hit = (data.logos || []).find((l) => l.file_path === logoPath)
    if (!hit || !hit.width || !hit.height) return { error: "logo non trovato" }
    return { aspect: hit.width / hit.height, w: hit.width, h: hit.height }
  } catch (e) {
    return { error: e.message }
  } finally {
    clearTimeout(t)
  }
}

const confirmed = []
for (const [key, m] of candidates) {
  const r = await logoAspect(m.mediaType, m.tmdbId, m.logoPath)
  if (r.error) {
    console.log(`SKIP ${key} (${m.title}): ${r.error}`)
    continue
  }
  if (r.aspect > MIN_ASPECT) {
    const to = TARGET ?? curveScale(r.aspect)
    confirmed.push({ key, title: m.title, aspect: r.aspect, from: m.logoScale, to })
    console.log(`OK   ${key} (${m.title}): aspect ${r.aspect.toFixed(2)} (${r.w}x${r.h}), ${m.logoScale} -> ${to}`)
  } else {
    console.log(`--   ${key} (${m.title}): aspect ${r.aspect.toFixed(2)}, resta ${m.logoScale}`)
  }
}

console.log(`\n${confirmed.length} titoli da aggiornare${TARGET === null ? " (scala da curva)" : ` a scala ${TARGET}`}.`)
if (confirmed.length === 0) process.exit(0)

if (!APPLY) {
  console.log("Dry-run: niente scritto. Re-run con --apply per scrivere (con backup).")
  process.exit(0)
}

const bak = `${FILE}.bak-${Date.now()}`
copyFileSync(FILE, bak)
console.log(`Backup: ${bak}`)
const now = new Date().toISOString()
for (const c of confirmed) {
  mappings[c.key] = { ...mappings[c.key], logoScale: c.to, updatedAt: now }
}
writeFileSync(FILE, JSON.stringify(mappings, null, 2))
console.log(`Scritti ${confirmed.length} mapping.`)
