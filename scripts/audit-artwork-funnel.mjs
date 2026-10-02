// Artwork Funnel Audit (Milestone D) — misura, non serve.
//
// Risponde data-first alla domanda: quanto spesso TVDB interviene davvero e,
// quando lo fa, quanti candidati textless fornisce? Nessun candidate scoring
// prima dei numeri (AGENTS.md Regole 2-3).
//
// COME OSSERVA (inference pura, zero modifiche al runtime):
//   per ogni titolo legge gli INPUT (TMDB details/images/external_ids +
//   TVDB search/artworks) e applica la stessa precedenza della poster route:
//   clean TMDB → TVDB rescue (logo+chiave+textless) → fallback lingua →
//   backdrop crop → NOT_FOUND. Gli outcome sono CLASSIFICATI, non serviti.
//
// DATASET (congelato, deterministico):
//   scripts/fixtures/artwork-funnel-dataset.json — array di
//   { tmdbId: number, mediaType: "movie"|"tv", stratum:
//     "popular-movies"|"popular-series"|"niche"|"anime-world" }.
//   Curatela una tantum (150+100+100+50), poi mai più toccato: i rerun
//   restano confrontabili. File vuoto/mancante → exit 2 con istruzioni.
//
// ENV:
//   TMDB_KEY (o PICTORIUM_TMDB_KEY) — richiesta per il live run.
//   TVDB_KEY (o PICTORIUM_TVDB_API_KEY) — opzionale: senza, niente rescue
//     (righe misurate comunque, metriche TVDB a zero + warning).
//   TMDB_BASE_URL (default https://api.themoviedb.org/3),
//   TVDB_API_URL (default https://api4.thetvdb.com/v4).
//
// USO:
//   node scripts/audit-artwork-funnel.mjs [--limit N] [--out report.json] [--sleep MS]
//   Senza chiavi: righe ERROR (plumbing check, nessun dato).
//
// DECISION GATE (soglia secca binaria, AND):
//   rescuePct >= 5.0 AND (titoli con >=2 textless AND (Δscore>0 OR
//   Δresolution>=20%) tra i rescued) >= 30.0% → scoring giustificato,
//   altrimenti No-Op (pickTvdbPoster resta com'è).
//   Δresolution = (maxW-minW)/maxW sul set textless.

import path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const TMDB_BASE = process.env.TMDB_BASE_URL || "https://api.themoviedb.org/3"
const TVDB_API = process.env.TVDB_API_URL || "https://api4.thetvdb.com/v4"
const TMDB_KEY = process.env.TMDB_KEY || process.env.PICTORIUM_TMDB_KEY || ""
const TVDB_KEY = process.env.TVDB_KEY || process.env.PICTORIUM_TVDB_API_KEY || process.env.POSTERIUM_TVDB_API_KEY || ""

const DEFAULT_DATASET = path.join(rootDir, "scripts", "fixtures", "artwork-funnel-dataset.json")

/**
 * Classifica pura del ramo funnel (stessa precedenza della poster route,
 * ramo non-mappato portrait). Testabile in Vitest senza rete.
 */
export function classifyFunnelOutcome(input) {
  if (input.tmdbHasClean) return "TMDB_CLEAN"
  if (input.tmdbHasLogo && input.tvdbKeyPresent && input.tvdbIdResolved && input.tvdbTextlessCount >= 1) {
    return "TVDB_RESCUE"
  }
  if (input.tmdbHasAnyPoster) return "LANG_FALLBACK"
  if (input.hasBackdrop) return "BACKDROP_CROP"
  return "NOT_FOUND"
}

/**
 * Gate binario sui risultati misurati (righe ERROR escluse dal denominatore).
 */
export function evaluateGate(rows) {
  const measured = rows.filter((r) => r.outcome !== "ERROR")
  const rescued = measured.filter((r) => r.outcome === "TVDB_RESCUE")
  const rescuePct = measured.length > 0 ? (rescued.length / measured.length) * 100 : 0
  const multi = rescued.filter((r) => {
    const tl = r.tvdbTextless || []
    if (tl.length < 2) return false
    const scores = tl.map((t) => t.score ?? 0)
    const widths = tl.map((t) => t.w ?? 0)
    const dScore = Math.max(...scores) - Math.min(...scores)
    const maxW = Math.max(...widths)
    const dRes = maxW > 0 ? (maxW - Math.min(...widths)) / maxW : 0
    return dScore > 0 || dRes >= 0.2
  })
  const multiPct = rescued.length > 0 ? (multi.length / rescued.length) * 100 : 0
  return {
    measured: measured.length,
    rescued: rescued.length,
    rescuePct,
    multiTextless: multi.length,
    multiPct,
    scoringJustified: rescuePct >= 5.0 && multiPct >= 30.0,
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function redactUrl(url) {
  return String(url).replace(/([?&])(api_key|apikey)=[^&]*/g, "$1$2=***").slice(0, 80)
}

async function fetchJson(url, { timeoutMs = 15000, ...init } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${redactUrl(url)}`)
  return res.json()
}

function loadDataset(datasetPath) {
  let raw
  try {
    raw = fs.readFileSync(datasetPath, "utf8")
  } catch {
    console.error(`[funnel-audit] Dataset mancante: ${datasetPath}`)
    console.error("Curare 400 entry {tmdbId, mediaType, stratum} (150 popular-movies, 100 popular-series, 100 niche, 50 anime-world) e riprovare.")
    process.exit(2)
  }
  const data = JSON.parse(raw.replace(/^\uFEFF/, ""))
  const ids = Array.isArray(data) ? data : data.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    console.error("[funnel-audit] Dataset vuoto: curare 400 entry {tmdbId, mediaType, stratum} e riprovare.")
    process.exit(2)
  }
  for (const e of ids) {
    if (!Number.isInteger(e?.tmdbId) || (e?.mediaType !== "movie" && e?.mediaType !== "tv") || typeof e?.stratum !== "string") {
      console.error(`[funnel-audit] Entry dataset invalida: ${JSON.stringify(e)}`)
      process.exit(2)
    }
  }
  return ids
}

// --- TVDB live helpers (stessi endpoint/parsing di src/lib/tvdb.ts) ---

let tvdbToken = null
async function tvdbLogin() {
  if (tvdbToken) return tvdbToken
  const json = await fetchJson(`${TVDB_API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: TVDB_KEY }),
  })
  tvdbToken = json?.data?.token || null
  return tvdbToken
}

async function tvdbRemoteId(remoteId, kind) {
  const token = await tvdbLogin().catch(() => null)
  if (!token) return null
  const json = await fetchJson(`${TVDB_API}/search/remoteid/${encodeURIComponent(remoteId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null)
  const results = json?.data
  if (!Array.isArray(results)) return null
  for (const item of results) {
    const rawId = kind === "tv" ? item?.series?.id : item?.movie?.id
    const n = typeof rawId === "number" ? rawId : parseInt(String(rawId ?? ""), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

async function tvdbArtworks(mediaType, tvdbId) {
  const token = await tvdbLogin().catch(() => null)
  if (!token) return []
  const url = mediaType === "tv"
    ? `${TVDB_API}/series/${tvdbId}/artworks`
    : `${TVDB_API}/movies/${tvdbId}/extended`
  const json = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null)
  const data = json?.data
  const raw = Array.isArray(data) ? data : Array.isArray(data?.artworks) ? data.artworks : []
  return raw
    .filter((r) => r && typeof r === "object" && typeof r.image === "string" && r.image)
    .map((r) => ({
      w: typeof r.width === "number" ? r.width : 0,
      h: typeof r.height === "number" ? r.height : 0,
      score: typeof r.score === "number" ? r.score : 0,
      lang: typeof r.language === "string" ? r.language.toLowerCase() : "",
      textless: r.includesText === false,
    }))
}

function textlessPortraits(arts) {
  return arts.filter((a) => (a.w <= 0 || a.h <= 0 || a.w < a.h) && a.textless)
}

async function auditTitle(entry, sleepMs) {
  const row = {
    tmdbId: entry.tmdbId,
    mediaType: entry.mediaType,
    stratum: entry.stratum,
    tmdbHasClean: false,
    tmdbHasLogo: false,
    tmdbHasAnyPoster: false,
    hasBackdrop: false,
    tvdbIdResolved: false,
    tvdbArtworkCount: 0,
    tvdbTextless: [],
    outcome: "ERROR",
    error: null,
  }
  try {
    const type = entry.mediaType === "tv" ? "tv" : "movie"
    const key = `api_key=${encodeURIComponent(TMDB_KEY)}`
    const [details, images, ext] = await Promise.all([
      fetchJson(`${TMDB_BASE}/${type}/${entry.tmdbId}?${key}&language=en`),
      fetchJson(`${TMDB_BASE}/${type}/${entry.tmdbId}/images?include_image_language=en,null&${key}`),
      fetchJson(`${TMDB_BASE}/${type}/${entry.tmdbId}/external_ids?${key}`).catch(() => ({ imdb_id: null, tvdb_id: null })),
    ])
    const posters = Array.isArray(images?.posters) ? images.posters : []
    const logos = Array.isArray(images?.logos) ? images.logos : []
    row.tmdbHasClean = posters.some((p) => p?.iso_639_1 === null)
    row.tmdbHasLogo = logos.length > 0
    row.tmdbHasAnyPoster = posters.length > 0
    row.hasBackdrop = !!details?.backdrop_path
      || (Array.isArray(images?.backdrops) && images.backdrops.length > 0)

    if (!row.tmdbHasClean && row.tmdbHasLogo && TVDB_KEY) {
      const tvdbId = ext?.tvdb_id
        ?? (ext?.imdb_id ? await tvdbRemoteId(ext.imdb_id, type).catch(() => null) : null)
      row.tvdbIdResolved = !!tvdbId
      if (tvdbId) {
        const arts = await tvdbArtworks(type, tvdbId).catch(() => [])
        row.tvdbArtworkCount = arts.length
        row.tvdbTextless = textlessPortraits(arts)
      }
    }
    row.outcome = classifyFunnelOutcome({
      tmdbHasClean: row.tmdbHasClean,
      tmdbHasLogo: row.tmdbHasLogo,
      tvdbKeyPresent: !!TVDB_KEY,
      tvdbIdResolved: row.tvdbIdResolved,
      tvdbTextlessCount: row.tvdbTextless.length,
      tmdbHasAnyPoster: row.tmdbHasAnyPoster,
      hasBackdrop: row.hasBackdrop,
    })
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e)
  }
  if (sleepMs > 0) await sleep(sleepMs)
  return row
}

function printReport(rows, gate) {
  const strata = ["popular-movies", "popular-series", "niche", "anime-world"]
  console.log("\n================================================================================")
  console.log("                           ARTWORK FUNNEL AUDIT REPORT")
  console.log("================================================================================")
  console.log("Strato               Campioni  TMDB Clean  TVDB Rescue  Lang Fallback  Crop  404/Err")
  console.log("--------------------------------------------------------------------------------")
  for (const s of strata) {
    const set = rows.filter((r) => r.stratum === s)
    if (set.length === 0) continue
    const pct = (o) => ((set.filter((r) => r.outcome === o).length / set.length) * 100).toFixed(1) + "%"
    console.log(
      `${s.padEnd(20)}${String(set.length).padEnd(10)}${pct("TMDB_CLEAN").padEnd(12)}${pct("TVDB_RESCUE").padEnd(13)}${pct("LANG_FALLBACK").padEnd(14)}${pct("BACKDROP_CROP").padEnd(6)}${pct("NOT_FOUND")}/${pct("ERROR")}`,
    )
  }
  console.log("--------------------------------------------------------------------------------")
  const m = rows.filter((r) => r.outcome !== "ERROR")
  const pctAll = (o) => (m.length > 0 ? ((rows.filter((r) => r.outcome === o).length / m.length) * 100).toFixed(1) : "0.0") + "%"
  console.log(`TOTALE (${m.length} misurati)  TMDB ${pctAll("TMDB_CLEAN")} | TVDB ${pctAll("TVDB_RESCUE")} | LANG ${pctAll("LANG_FALLBACK")} | CROP ${pctAll("BACKDROP_CROP")} | 404 ${pctAll("NOT_FOUND")}`)
  console.log("\nTVDB Rescue Deep-Dive:")
  console.log(`- Rescue: ${gate.rescued}/${gate.measured} (${gate.rescuePct.toFixed(1)}%)`)
  console.log(`- Con >=2 textless eterogenei: ${gate.multiTextless} (${gate.multiPct.toFixed(1)}%)`)
  console.log(`\nDECISION GATE: ${gate.scoringJustified ? "SCORING GIUSTIFICATO (progettare integrazione)" : "NO-OP (pickTvdbPoster resta com'è)"}`)
}

async function run() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf("--limit")
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0
  const outIdx = args.indexOf("--out")
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null
  const sleepIdx = args.indexOf("--sleep")
  const sleepMs = sleepIdx >= 0 ? parseInt(args[sleepIdx + 1], 10) : 100
  const datasetIdx = args.indexOf("--dataset")
  const datasetPath = datasetIdx >= 0 ? args[datasetIdx + 1] : DEFAULT_DATASET

  const dataset = loadDataset(datasetPath)
  if (!TMDB_KEY) {
    console.error("[funnel-audit] TMDB_KEY mancante: impossibile misurare (tutte le righe ERROR). Impostare TMDB_KEY o PICTORIUM_TMDB_KEY.")
  }
  if (!TVDB_KEY) {
    console.log("[funnel-audit] TVDB_KEY assente: rescue impossibile, metriche TVDB a zero.")
  }
  const ids = Number.isFinite(limit) && limit > 0 ? dataset.slice(0, limit) : dataset
  console.log(`[funnel-audit] ${ids.length} titoli (sleep ${sleepMs}ms)`)

  const rows = []
  for (const entry of ids) {
    const row = await auditTitle(entry, sleepMs)
    rows.push(row)
    process.stdout.write(`  ${row.tmdbId}/${row.mediaType} → ${row.outcome}${row.error ? ` (${row.error})` : ""}\n`)
  }
  const gate = evaluateGate(rows)
  printReport(rows, gate)
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows, gate }, null, 2))
    console.log(`[funnel-audit] JSON scritto in ${outPath}`)
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  run().catch((e) => {
    console.error("[funnel-audit] Errore:", e)
    process.exit(1)
  })
}
