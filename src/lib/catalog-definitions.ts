import { regionLabel, type RegionDef } from "./regions"

export const CATALOG_ID_PREFIX = "pictorium-"

/** Prefisso legacy pre-rename: accettato in ingresso (alias), mai più emesso. */
export const LEGACY_CATALOG_ID_PREFIX = "posterium-"

export type PictoriumCatalogType = "movie" | "series"

/** Fork: forma dei poster scelta per un catalogo (assente = impostazione globale). */
export type CatalogShape = "poster" | "landscape"

export type PictoriumCatalogDefinition = {
  readonly id: string
  readonly name: string
  readonly type: PictoriumCatalogType
}

export const PICTORIUM_CATALOGS = [
  { id: "pictorium-jw-movies", name: "🇮🇹 Top 20 Italia — Film", type: "movie" },
  { id: "pictorium-jw-series", name: "🇮🇹 Top 20 Italia — Serie TV", type: "series" },
  // Fork: la top 10 di oggi (lib/top-today), la stessa dei numeri al neon
  // sui poster orizzontali. Subito dopo la Top 20 della regione.
  { id: "pictorium-today-movies", name: "🔟 Top 10 Oggi — Film", type: "movie" },
  { id: "pictorium-today-series", name: "🔟 Top 10 Oggi — Serie TV", type: "series" },
  { id: "pictorium-netflix-movies", name: "🔴 Netflix — Film", type: "movie" },
  { id: "pictorium-netflix-series", name: "🔴 Netflix — Serie TV", type: "series" },
  { id: "pictorium-prime-movies", name: "📦 Prime Video — Film", type: "movie" },
  { id: "pictorium-prime-series", name: "📦 Prime Video — Serie TV", type: "series" },
  { id: "pictorium-disney-movies", name: "🏰 Disney+ — Film", type: "movie" },
  { id: "pictorium-disney-series", name: "🏰 Disney+ — Serie TV", type: "series" },
  { id: "pictorium-now-movies", name: "☁️ Sky Go / NOW — Film", type: "movie" },
  { id: "pictorium-now-series", name: "☁️ Sky Go / NOW — Serie TV", type: "series" },
  { id: "pictorium-apple-movies", name: "🍎 Apple TV+ — Film", type: "movie" },
  { id: "pictorium-apple-series", name: "🍎 Apple TV+ — Serie TV", type: "series" },
  { id: "pictorium-hbo-movies", name: "🟣 HBO Max — Film", type: "movie" },
  { id: "pictorium-hbo-series", name: "🟣 HBO Max — Serie TV", type: "series" },
  { id: "pictorium-paramount-movies", name: "🏔️ Paramount+ — Film", type: "movie" },
  { id: "pictorium-paramount-series", name: "🏔️ Paramount+ — Serie TV", type: "series" },
  { id: "pictorium-crunchyroll-series", name: "🍥 Crunchyroll — Anime & Serie", type: "series" },
  { id: "pictorium-crunchyroll-movies", name: "🍥 Crunchyroll — Film Anime", type: "movie" },
  { id: "pictorium-anime-movies", name: "⛩️ Top 20 Film Anime", type: "movie" },
  { id: "pictorium-anime", name: "⛩️ Top 20 Serie Anime", type: "series" },
] as const satisfies readonly PictoriumCatalogDefinition[]

export type StremioCatalogExtra = {
  readonly name: string
  readonly isRequired?: boolean
  readonly options?: readonly string[]
}

export type PictoriumManifestCatalog = {
  id: string
  name: string
  type: PictoriumCatalogType
  extra?: readonly StremioCatalogExtra[]
}

export const PICTORIUM_SEARCH_CATALOGS = [
  { id: "pictorium-search-movies", name: "🔍 Pictorium — Cerca Film", type: "movie" },
  { id: "pictorium-search-series", name: "🔍 Pictorium — Cerca Serie TV", type: "series" },
] as const satisfies readonly PictoriumCatalogDefinition[]

export const PICTORIUM_PEOPLE_SEARCH_CATALOGS = [
  { id: "pictorium-search-people-movies", name: "🔍 Pictorium — Cerca per Persona (Film)", type: "movie" },
  { id: "pictorium-search-people-series", name: "🔍 Pictorium — Cerca per Persona (Serie TV)", type: "series" },
] as const satisfies readonly PictoriumCatalogDefinition[]

/** Built-in assenti da un ordine salvato oltre i quali l'ordine è "parziale". */
const NEW_BUILTINS_MAX = 4

/**
 * Posizione di un catalogo nell'ordine salvato dall'utente. Un catalogo
 * built-in nuovo (assente da un ordine completo, salvato prima che esistesse)
 * non va in fondo: si mette subito dopo il built-in che lo precede nella
 * definizione (es. "Top 10 Oggi" dopo la Top 20 della regione). Un ordine
 * parziale (pochi cataloghi elencati) resta com'era: gli elencati prima, il
 * resto in fondo. Gli ID ignoti vanno sempre in fondo.
 */
export function catalogOrderPosition(id: string, orderMap: ReadonlyMap<string, number>): number {
  const known = orderMap.get(id)
  if (known !== undefined) return known
  const idx = PICTORIUM_CATALOGS.findIndex((c) => c.id === id)
  if (idx < 0) return 9999
  const missing = PICTORIUM_CATALOGS.filter((c) => !orderMap.has(c.id)).length
  if (missing > NEW_BUILTINS_MAX) return 9999
  for (let i = idx - 1; i >= 0; i--) {
    const prev = orderMap.get(PICTORIUM_CATALOGS[i]!.id)
    if (prev !== undefined) return prev + 0.5 + idx / 1000
  }
  return -1 + idx / 1000
}

export const WARMUP_CATALOG_IDS = [
  "pictorium-jw-movies",
  "pictorium-jw-series",
  "pictorium-netflix-movies",
  "pictorium-netflix-series",
  "pictorium-prime-movies",
  "pictorium-prime-series",
  "pictorium-anime-movies",
  "pictorium-anime",
] as const

const WARMUP_CATALOG_ID_SET: ReadonlySet<string> = new Set(WARMUP_CATALOG_IDS)

export function getWarmupCatalogs(): readonly PictoriumCatalogDefinition[] {
  return PICTORIUM_CATALOGS.filter((catalog) => WARMUP_CATALOG_ID_SET.has(catalog.id))
}

/**
 * Normalizza un ID catalogo: gli ID legacy `posterium-*` (addon già installati,
 * config salvate, localStorage) vengono mappati al canonico `pictorium-*`.
 * Gli ID già canonici o custom senza prefisso passano invariati.
 */
export function normalizeCatalogId(id: string): string {
  if (id.startsWith(LEGACY_CATALOG_ID_PREFIX)) {
    return `${CATALOG_ID_PREFIX}${id.slice(LEGACY_CATALOG_ID_PREFIX.length)}`
  }
  return id
}

/** Normalizza una lista di ID catalogo (disabled/order); `undefined` passa invariato. */
export function normalizeCatalogIdList(ids: readonly string[] | undefined): string[] | undefined {
  if (!ids) return undefined
  return ids.map(normalizeCatalogId)
}

/**
 * Normalizza le chiavi di un record indicizzato per ID catalogo (renames);
 * `undefined`/`null` passano invariati.
 */
export function normalizeCatalogIdKeys(record: Record<string, string> | undefined | null): Record<string, string> | undefined {
  if (!record) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) out[normalizeCatalogId(k)] = v
  return out
}

/** @deprecated Alias legacy — usare PICTORIUM_CATALOGS. */
export const POSTERIUM_CATALOGS = PICTORIUM_CATALOGS
/** @deprecated Alias legacy — usare PICTORIUM_SEARCH_CATALOGS. */
export const POSTERIUM_SEARCH_CATALOGS = PICTORIUM_SEARCH_CATALOGS
/** @deprecated Alias legacy — usare PICTORIUM_PEOPLE_SEARCH_CATALOGS. */
export const POSTERIUM_PEOPLE_SEARCH_CATALOGS = PICTORIUM_PEOPLE_SEARCH_CATALOGS

/**
 * Nome dei cataloghi Top 20 / Ultime Uscite JustWatch nella lingua/regione
 * attiva (bandiera dinamica). Ritorna null per i cataloghi non-JW (nome statico).
 * Single source of truth condivisa da manifest Stremio (server) e modal/UI
 * (client): la classifica segue la regione, il nome deve seguirla.
 */
export function regionJwName(id: string, type: "movie" | "series", region: RegionDef): string | null {
  // Fork: in ebraico per la regione IL (paese e tipo nella lingua della regione).
  if (region.lang2 === "he") {
    const kind = type === "movie" ? "סרטים" : "סדרות"
    const country = regionLabel(region, "he")
    if (id.startsWith("pictorium-jw-new-")) return `${region.flag} יציאות אחרונות ב${country} — ${kind}`
    if (!id.startsWith("pictorium-jw-")) return null
    return `${region.flag} טופ 20 ${country} — ${kind}`
  }
  if (id.startsWith("pictorium-jw-new-")) {
    return `${region.flag} Ultime Uscite ${region.label} — ${type === "movie" ? "Film" : "Serie TV"}`
  }
  if (!id.startsWith("pictorium-jw-")) return null
  return `${region.flag} Top 20 ${region.label} — ${type === "movie" ? "Film" : "Serie TV"}`
}
