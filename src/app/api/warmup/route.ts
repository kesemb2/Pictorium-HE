import { NextRequest } from "next/server"
import crypto from "node:crypto"
import { getJWRankings } from "@/lib/justwatch"

// Vercel: il warmup itera decine di poster in batch → richiede il massimo
// consentito. Su Hobby (10s) non completa comunque; su Pro vale 60s.
export const maxDuration = 60
import { buildPosterPublicUrl } from "@/lib/poster-public-url"
import { getServerDefaults } from "@/lib/server-defaults"
import { buildStremioPosterSearchParams } from "@/lib/stremio-poster-params"
import { getWarmupCatalogs } from "@/lib/catalog-definitions"
import { getRegionDef, normalizeRegion } from "@/lib/regions"
import { getAll } from "@/lib/store"
import { getTrending, resolveRequestApiKey } from "@/lib/tmdb"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { checkAdminToken, adminAuthResponse, isSameOrigin, originMismatchResponse } from "@/lib/auth"
import { createLogger } from "@/lib/logger"
import { envWithFallback } from "@/lib/env-compat"
import { recordedPosterUrls } from "@/lib/poster-url-log"

const log = createLogger("warmup")

type PosterRouteType = "movie" | "series"
type WarmupStatus = "ok" | "fail"

interface WarmupTarget {
  readonly type: PosterRouteType
  readonly id: number
  readonly source: string
  /**
   * Path+query ESATTI di una richiesta realmente servita. Quando c'è, si
   * rigioca così com'è: le cache CDN sono chiavate sull'URL intera, e una
   * ricostruita dai default di oggi non è la stessa che i client portano.
   */
  readonly path?: string
}

interface WarmupResult extends WarmupTarget {
  readonly status: WarmupStatus
  readonly statusCode?: number
}

interface BoundedIntInput {
  readonly value: string | null
  readonly fallback: number
  readonly min: number
  readonly max: number
}

interface BuildPosterUrlInput {
  readonly req: NextRequest
  readonly target: WarmupTarget
  readonly lang: string
}

function boundedInt(input: BoundedIntInput): number {
  // `searchParams.get()` torna null quando il parametro manca, e Number(null)
  // è 0 — non NaN. Senza questo controllo OGNI default veniva schiacciato sul
  // minimo: trending 20→0, mappings 50→0, concurrency 3→1. Il warmup non
  // scaldava niente nemmeno quando veniva invocato.
  if (input.value === null || input.value.trim() === "") return input.fallback
  const parsed = Number(input.value)
  if (!Number.isFinite(parsed)) return input.fallback
  return Math.min(Math.max(Math.floor(parsed), input.min), input.max)
}

function routeTypeForMedia(mediaType: "movie" | "tv"): PosterRouteType {
  return mediaType === "tv" ? "series" : "movie"
}

function dedupeTargets(targets: readonly WarmupTarget[]): WarmupTarget[] {
  const seen = new Set<string>()
  const unique: WarmupTarget[] = []
  for (const target of targets) {
    const key = `${target.type}:${target.id}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(target)
  }
  return unique
}

function addTarget(targets: WarmupTarget[], target: WarmupTarget): void {
  if (target.id > 0) targets.push(target)
}

function buildPosterUrl(input: BuildPosterUrlInput): URL {
  if (input.target.path) return new URL(input.target.path, selfFetchOrigin())
  // C2: origin self-fetch — MAI dalla richiesta (host header injection/SSRF).
  // Loopback per locale/VPS; su Vercel il loopback non instrada (istanze
  // effimere) → VERCEL_URL fornita dalla piattaforma; override esplicito via
  // env per custom. Vedi selfFetchOrigin().
  const url = buildPosterPublicUrl(`/api/poster/${input.target.type}/${input.target.id}`, {
    origin: selfFetchOrigin(),
    preferCdn: input.req.nextUrl.searchParams.get("edge") !== "0",
  })
  const defaults = getServerDefaults()
  const params = buildStremioPosterSearchParams({
    lang: input.lang,
    globalBadges: defaults.globalBadges,
    rankingBadges: defaults.rankingBadges,
    badgeStyle: defaults.badgeStyle,
    rankingBadgeStyle: defaults.rankingBadgeStyle,
    gradientHeight: defaults.gradientHeight,
    blurIntensity: defaults.blurIntensity,
    blurFade: defaults.blurFade,
    blurDarkness: defaults.blurDarkness,
    blurEnabled: defaults.blurEnabled,
    topBadgeScale: defaults.topBadgeScale,
    topBadgeOffsetX: defaults.topBadgeOffsetX,
    topBadgeOffsetY: defaults.topBadgeOffsetY,
    genreBadgeScale: defaults.genreBadgeScale,
    qualityBadgeScale: defaults.qualityBadgeScale,
    networkLogoScale: defaults.networkLogoScale,
    genreBadgeOffsetX: defaults.genreBadgeOffsetX,
    genreBadgeOffsetY: defaults.genreBadgeOffsetY,
    qualityBadgeOffsetX: defaults.qualityBadgeOffsetX,
    qualityBadgeOffsetY: defaults.qualityBadgeOffsetY,
    networkLogoOffsetX: defaults.networkLogoOffsetX,
    networkLogoOffsetY: defaults.networkLogoOffsetY,
  })
  params.forEach((value, key) => url.searchParams.set(key, value))
  return url
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** C2: origin fidato per il self-fetch (mai dalla richiesta). */
function selfFetchOrigin(): string {
  const explicit = envWithFallback("WARMUP_ORIGIN")?.trim().replace(/\/+$/, "")
  if (explicit) return explicit
  // La CDN è chiavata per host: VERCEL_URL è l'host DEL DEPLOY, quindi
  // scaldarlo non tocca il dominio che i client chiedono. L'host di produzione
  // viene prima; VERCEL_URL resta come ultima risorsa (preview deploy).
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (production) return `https://${production}`
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return `http://127.0.0.1:${process.env.PORT || "3000"}`
}

/**
 * Credenziale del cron di piattaforma. Vercel invoca i cron in GET con
 * `Authorization: Bearer $CRON_SECRET`: senza questo ramo il cron notturno
 * prende un 401 (e prima del GET qui sotto prendeva un 405, motivo per cui
 * non ha mai scaldato niente).
 */
function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return false
  return constantTimeEqual(header.slice(7), secret)
}

/**
 * I cron di Vercel mandano GET, non POST. Stesso corpo, stessa auth: l'unico
 * motivo per cui esistono due metodi è che la piattaforma ne impone uno.
 */
export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const warmupToken = envWithFallback("WARMUP_TOKEN")
  const isPublic = envWithFallback("PUBLIC_INSTANCE") === "1"
  // Il segreto del cron vale da solo, e prima di tutto il resto: è una
  // credenziale che conoscono solo la piattaforma e chi ha configurato
  // l'istanza, quindi vale anche su istanza pubblica — dove il ramo qui sotto
  // esce subito se manca PICTORIUM_WARMUP_TOKEN e non arriverebbe mai a
  // guardarlo.
  const cronOk = hasCronSecret(req)
  if (!cronOk && isPublic) {
    // Fix H3: su istanza pubblica il warmup è un amplificatore (1 req → 500
    // poster tentati) — PICTORIUM_WARMUP_TOKEN è obbligatorio. Senza token
    // l'endpoint non è utilizzabile (evita DoS su HF Spaces). Con token
    // configurato, richiede x-warmup-token esatto (non basta checkAdminToken
    // che su public è fail-open).
    if (!warmupToken) {
      log.warn("Warmup rejected: PICTORIUM_PUBLIC_INSTANCE=1 requires PICTORIUM_WARMUP_TOKEN")
      return adminAuthResponse()
    }
    const header = req.headers.get("x-warmup-token")
    const ok = !!header && constantTimeEqual(header, warmupToken)
    if (!ok) return adminAuthResponse()
  } else if (!cronOk) {
    // Istanza privata: auth coerente con le altre route admin (fail-closed con
    // token, fail-open solo se isPublic o dev loopback). Warmup token resta
    // opzionale: se configurato, richiede x-warmup-token O admin token.
    const warmupHeaderOk = !warmupToken
      ? undefined
      : (() => {
          const header = req.headers.get("x-warmup-token")
          return !!header && constantTimeEqual(header, warmupToken)
        })()
    if (warmupHeaderOk !== true && !checkAdminToken(req)) return adminAuthResponse()
  }
  const rl = await rateLimit(rateLimitKey(req), "warmup")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  if (!isSameOrigin(req)) return originMismatchResponse()

  const apiKey = resolveRequestApiKey(req)
  // 6 e non 3: i posti di render sono 8, e con 3 una corsa reale finiva
  // troncata dal deadline di 50s lasciando indietro un terzo della coda (e i
  // batch tardivi andavano in timeout, perché la finestra per batch si
  // accorcia man mano). Resta sotto gli 8 posti, così il warmup non affama
  // una richiesta vera che arriva nel frattempo.
  const concurrency = boundedInt({ value: req.nextUrl.searchParams.get("concurrency"), fallback: 6, min: 1, max: 8 })
  // C2: regione per le classifiche JW (prima hardcoded IT) — la cache key
  // include già `:r<CODE>`, quindi scaldare altre regioni non avvelena IT.
  // La lingua default resta "it" salvo regione esplicita (nessun cambio di
  // comportamento per le chiamate esistenti senza parametri).
  const regionParam = req.nextUrl.searchParams.get("region") || req.nextUrl.searchParams.get("country")
  const warmRegion = normalizeRegion(regionParam || "IT")
  const warmRegionDef = getRegionDef(warmRegion)
  const warmLang = req.nextUrl.searchParams.get("lang") || (regionParam ? warmRegionDef.lang || "it" : "it")
  // C2: resume — offset nella coda dedup + nextOffset in risposta per
  // concatenare chiamate sotto deadline (Vercel Hobby 10s).
  const queueOffset = boundedInt({ value: req.nextUrl.searchParams.get("offset"), fallback: 0, min: 0, max: 10000 })
  const replayLimit = boundedInt({ value: req.nextUrl.searchParams.get("replay"), fallback: 300, min: 0, max: 300 })
  // C2: warm dei cataloghi (default off — upstream costoso). Scalda gli 8
  // WARMUP_CATALOG_IDS così il primo browse non è freddo N+1; con C1 i body
  // finiscono anche in KV cross-istanza. Chiavi pass-through dalla richiesta.
  const warmCatalogs = req.nextUrl.searchParams.get("catalogs") === "1"
  // D2: default dimezzati (~110 target invece di ~340). Prima ogni warmup
  // senza parametri veniva sempre troncato dalla deadline 50s (e su Hobby
  // 10s non completava nulla), sprecando lavoro e — al boot su 512M —
  // rischiando OOM contro il traffico reale. Chi vuole di più passa i
  // parametri espliciti (max invariati).
  const trendingLimit = boundedInt({ value: req.nextUrl.searchParams.get("trending"), fallback: 20, min: 0, max: 100 })
  const justWatchLimit = boundedInt({ value: req.nextUrl.searchParams.get("justwatch"), fallback: 10, min: 0, max: 50 })
  const mappingLimit = boundedInt({ value: req.nextUrl.searchParams.get("mappings"), fallback: 50, min: 0, max: 500 })

  try {
    const [movies, tv, jwMovies, jwShows, mappings] = await Promise.allSettled([
      getTrending("movie", "day", apiKey, 1),
      getTrending("tv", "day", apiKey, 1),
      justWatchLimit > 0 ? getJWRankings("MOVIE", warmRegion, justWatchLimit) : Promise.resolve([]),
      justWatchLimit > 0 ? getJWRankings("SHOW", warmRegion, justWatchLimit) : Promise.resolve([]),
      getAll(),
    ])

    const targets: WarmupTarget[] = []
    if (movies.status === "fulfilled") {
      for (const item of movies.value.results.slice(0, trendingLimit)) {
        addTarget(targets, { type: "movie", id: item.id, source: "trending" })
      }
    }
    if (tv.status === "fulfilled") {
      for (const item of tv.value.results.slice(0, trendingLimit)) {
        addTarget(targets, { type: "series", id: item.id, source: "trending" })
      }
    }
    if (jwMovies.status === "fulfilled") {
      for (const item of jwMovies.value) {
        addTarget(targets, { type: "movie", id: item.tmdbId, source: "justwatch" })
      }
    }
    if (jwShows.status === "fulfilled") {
      for (const item of jwShows.value) {
        addTarget(targets, { type: "series", id: item.tmdbId, source: "justwatch" })
      }
    }
    if (mappings.status === "fulfilled") {
      for (const mapping of mappings.value.slice(0, mappingLimit)) {
        addTarget(targets, { type: routeTypeForMedia(mapping.mediaType), id: mapping.tmdbId, source: "mapping" })
      }
    }

    // Prima ciò che è stato davvero richiesto: è l'unico insieme di URL che
    // corrisponde per costruzione alle chiavi CDN che i client colpiranno. La
    // ricostruzione dai trending resta come riserva (deploy nuovo, KV vuoto).
    const recorded = replayLimit > 0 ? await recordedPosterUrls(replayLimit) : []
    const replayTargets: WarmupTarget[] = []
    for (const path of recorded) {
      const m = /^\/api\/poster\/(movie|series)\/(\d+)/.exec(path)
      if (!m) continue
      replayTargets.push({ type: m[1] as PosterRouteType, id: Number(m[2]), source: "recorded", path })
    }
    const queue = [...replayTargets, ...dedupeTargets(targets).filter((t) => !replayTargets.some((r) => r.type === t.type && r.id === t.id))]
    const results: WarmupResult[] = []

    // Fix M14: deadline complessivo sotto maxDuration (60s). Prima i batch
    // sequenziali con timeout 20s l'uno potevano sommare ~14 min nel caso
    // peggiore: la funzione serverless veniva terminata a metà senza ritorno.
    // Dopo WARMUP_DEADLINE_MS non si avviano più nuovi batch (il timeout di
    // ogni fetch in corso è ridotto al tempo residuo).
    // C2: resume via ?offset= — la coda è deterministica (stessi target,
    // stesso ordine) così chiamate successive proseguono da nextOffset.
    const WARMUP_DEADLINE_MS = 50_000
    const deadlineAt = Date.now() + WARMUP_DEADLINE_MS
    const workQueue = queue.slice(queueOffset)
    for (let i = 0; i < workQueue.length; i += concurrency) {
      const remaining = deadlineAt - Date.now()
      if (remaining <= 0) {
        log.warn("Warmup deadline reached — batch loop truncated", { processed: results.length, total: workQueue.length })
        break
      }
      const batch = workQueue.slice(i, i + concurrency)
      const batchTimeout = Math.max(1_000, Math.min(20_000, remaining))
      const batchResults = await Promise.all(batch.map(async (target): Promise<WarmupResult> => {
        try {
          const res = await fetch(buildPosterUrl({ req, target, lang: warmLang }), { signal: AbortSignal.timeout(batchTimeout) })
          if (!res.ok) return { ...target, status: "fail", statusCode: res.status }
          // D2: basta scaldare la cache server — il body non serve: cancellarlo
          // invece di allocare l'intero JPEG nell'orchestratore (prima
          // `arrayBuffer()` teneva ogni poster in memoria per niente).
          await res.body?.cancel().catch(() => {})
          return { ...target, status: "ok" }
        } catch (error: unknown) {
          if (error instanceof Error) log.error("Poster failed", { error: error.message })
          return { ...target, status: "fail" }
        }
      }))
      results.push(...batchResults)
    }
    const processedTotal = queueOffset + results.length
    const nextOffset = processedTotal < queue.length ? processedTotal : null

    // C2: warm cataloghi (solo con ?catalogs=1). Stesso self-fetch dei poster:
    // scalda la cache catalogo (L1 + KV via C1) così il primo browse non paga
    // N+1 freddo. Chiavi pass-through: senza api_key i cataloghi TMDB tornano
    // vuoti (come da contratto), gli anime/MDBList funzionano comunque.
    let catalogResults: WarmupResult[] | undefined
    if (warmCatalogs && Date.now() < deadlineAt) {
      const mdblistKey = req.nextUrl.searchParams.get("mdblist_key")
      catalogResults = await Promise.all(getWarmupCatalogs().map(async (def): Promise<WarmupResult> => {
        const target = { type: def.type, id: 0, source: `catalog:${def.id}` }
        try {
          const url = buildPosterPublicUrl(`/catalog/${def.type}/${def.id}.json`, { origin: selfFetchOrigin() })
          if (apiKey) url.searchParams.set("api_key", apiKey)
          if (mdblistKey) url.searchParams.set("mdblist_key", mdblistKey)
          url.searchParams.set("region", warmRegion)
          const remaining = deadlineAt - Date.now()
          if (remaining <= 0) return { ...target, status: "fail" }
          const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1_000, Math.min(20_000, remaining))) })
          if (!res.ok) return { ...target, status: "fail", statusCode: res.status }
          await res.body?.cancel().catch(() => {})
          return { ...target, status: "ok" }
        } catch {
          return { ...target, status: "fail" }
        }
      }))
    }

    return Response.json({
      total: queue.length,
      ok: results.filter((result) => result.status === "ok").length,
      fail: results.filter((result) => result.status === "fail").length,
      offset: queueOffset,
      nextOffset,
      results,
      ...(catalogResults ? {
        catalogs: {
          ok: catalogResults.filter((r) => r.status === "ok").length,
          fail: catalogResults.filter((r) => r.status === "fail").length,
          results: catalogResults,
        },
      } : {}),
    })
  } catch (error: unknown) {
    if (error instanceof Error) log.error("Failed", { error: error.message })
    return new Response("Warmup failed", { status: 500 })
  }
}
