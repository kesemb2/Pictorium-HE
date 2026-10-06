/**
 * Fork: i fatti TMDB di un titolo per il catalogo delle tag (`tag-catalog.ts`).
 *
 * Solo per lo stile Tag, e tutto cachato: i fatti di un titolo cambiano di
 * rado (12 ore), i nomi di persone e saghe ancora meno (7-30 giorni). Ogni
 * pezzo è facoltativo: un errore toglie quella tag, mai il poster.
 *
 * Nomi in ebraico o niente: con la lingua ebraica un nome di persona, di saga
 * o di serie entra solo se TMDB ne ha una forma ebraica — una tag mezza
 * ebraica e mezza inglese ha la direzione sbagliata e si legge male.
 */
import { cacheGet, cacheSet } from "@/lib/cache"
import { getCollectionLite, getCreditsLite, getDetails, getKeywords, getPersonAkas, getPersonTvCrew } from "@/lib/tmdb"
import type { TagFacts } from "@/lib/tag-catalog"

const FACTS_TTL_MS = 12 * 60 * 60 * 1000
const PERSON_TTL_MS = 30 * 24 * 60 * 60 * 1000
const LOOKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000
const HEBREW = /[֐-׿]/

export interface LoadTagFactsInput {
  readonly mediaType: "movie" | "tv"
  readonly tmdbId: number
  /** Lingua UI della richiesta (es. "he"). */
  readonly locale: string
  /** Lingua TMDB (es. "he-IL"). */
  readonly tmdbLang: string
  readonly apiKey?: string
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  /** Parole chiave già lette dalla route (evita un fetch). */
  readonly keywords?: readonly string[] | null
}

const inflight = new Map<string, Promise<TagFacts | null>>()

function isHe(locale: string): boolean {
  return locale.slice(0, 2) === "he"
}

/** Nome adatto alla lingua: in ebraico serve una forma ebraica, altrimenti null. */
function nameForLocale(name: string | null | undefined, locale: string): string | null {
  const n = (name || "").trim()
  if (!n) return null
  if (isHe(locale)) return HEBREW.test(n) ? n : null
  return n
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cacheGet<{ v: T }>(key)
  if (hit) return hit.v
  const v = await load()
  cacheSet(key, { v }, ["tmdb", "tagfacts"], ttl)
  return v
}

async function starName(personId: number, fallbackName: string, input: LoadTagFactsInput): Promise<string | null> {
  if (!isHe(input.locale)) return fallbackName || null
  return cached(`tagfacts:person:${personId}:he`, PERSON_TTL_MS, async () => {
    const p = await getPersonAkas(personId, input.apiKey, input.signal, input.timeoutMs).catch(() => null)
    const he = p?.aka.find((a) => HEBREW.test(a)) ?? (HEBREW.test(p?.name ?? "") ? p!.name : null)
    return he?.trim() || null
  })
}

async function creatorOtherTitle(creatorId: number, input: LoadTagFactsInput): Promise<string | null> {
  const lang2 = input.locale.slice(0, 2)
  return cached(`tagfacts:creator:${creatorId}:${input.tmdbId}:${lang2}`, LOOKUP_TTL_MS, async () => {
    const crew = await getPersonTvCrew(creatorId, input.tmdbLang, input.apiKey, input.signal, input.timeoutMs).catch(() => [])
    const other = crew
      .filter((c) => c.id !== input.tmdbId && (c.job || "").toLowerCase() === "creator")
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0]
    return nameForLocale(other?.name, input.locale)
  })
}

/** "הארי פוטר - סדרת הסרטים" → "הארי פוטר"; "Alien Collection" → "Alien". */
export function trimCollectionName(name: string): string {
  return name
    .replace(/\s*[-–—]\s*סדרת הסרטים\s*$/u, "")
    .replace(/\s*סדרת הסרטים\s*$/u, "")
    .replace(/\s*\(?\bcollection\)?\s*$/i, "")
    .trim()
}

async function collectionPart(collectionId: number, input: LoadTagFactsInput): Promise<{ name: string; part: number } | null> {
  const lang2 = input.locale.slice(0, 2)
  return cached(`tagfacts:collection:${collectionId}:${input.tmdbId}:${lang2}`, LOOKUP_TTL_MS, async () => {
    const c = await getCollectionLite(collectionId, input.tmdbLang, input.apiKey, input.signal, input.timeoutMs).catch(() => null)
    if (!c || c.parts.length < 2) return null
    const ordered = [...c.parts].sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"))
    const idx = ordered.findIndex((p) => p.id === input.tmdbId)
    const name = nameForLocale(trimCollectionName(c.name), input.locale)
    return idx >= 0 && name ? { name, part: idx + 1 } : null
  })
}

async function buildFacts(input: LoadTagFactsInput): Promise<TagFacts | null> {
  const { mediaType, tmdbId, apiKey, signal, timeoutMs } = input
  const [details, credits, keywords] = await Promise.all([
    getDetails(mediaType, tmdbId, input.tmdbLang, apiKey, signal, timeoutMs).catch(() => null),
    getCreditsLite(mediaType, tmdbId, apiKey, signal, timeoutMs).catch(() => null),
    input.keywords ? Promise.resolve([...input.keywords]) : getKeywords(mediaType, tmdbId, apiKey, signal, timeoutMs).catch(() => []),
  ])
  if (!details) return null
  // Campi passthrough dello schema details, letti con prudenza.
  const raw = details as unknown as Record<string, unknown>
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const productionCountries = Array.isArray(raw.production_countries)
    ? (raw.production_countries as { iso_3166_1?: unknown }[]).map((c) => c?.iso_3166_1).filter((c): c is string => typeof c === "string")
    : []
  const originCountry = Array.isArray(raw.origin_country)
    ? (raw.origin_country as unknown[]).filter((c): c is string => typeof c === "string")
    : []
  const collectionId = num((raw.belongs_to_collection as { id?: unknown } | null | undefined)?.id)
  const creatorId = Array.isArray(raw.created_by) ? num((raw.created_by as { id?: unknown }[])[0]?.id) : null

  const lead = credits?.cast.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0]
  const composer = credits?.crew.find((c) => c.job === "Original Music Composer")?.name ?? null

  const [star, creatorTitle, collection] = await Promise.all([
    lead ? starName(lead.id, lead.name, input).catch(() => null) : Promise.resolve(null),
    mediaType === "tv" && creatorId ? creatorOtherTitle(creatorId, input).catch(() => null) : Promise.resolve(null),
    mediaType === "movie" && collectionId ? collectionPart(collectionId, input).catch(() => null) : Promise.resolve(null),
  ])

  return {
    mediaType,
    genreIds: (details.genres || []).map((g) => g.id),
    runtime: details.runtime ?? null,
    episodeRunTime: details.episode_run_time ?? null,
    episodeCount: details.number_of_episodes ?? null,
    seasonCount: details.number_of_seasons ?? null,
    status: details.status ?? null,
    tvType: details.type ?? null,
    revenue: num(raw.revenue),
    budget: num(raw.budget),
    voteAverage: details.vote_average ?? null,
    voteCount: details.vote_count ?? null,
    releaseDate: details.release_date || details.first_air_date || null,
    originCountries: [...new Set([...originCountry, ...productionCountries])],
    originalLanguage: details.original_language ?? null,
    keywords,
    productionCompanies: (details.production_companies || []).map((c) => c.name),
    networks: (details.networks || []).map((n) => n.name),
    starName: star,
    composer,
    creatorOtherTitle: creatorTitle,
    collection,
  }
}

/** Fatti del titolo per le tag, cachati 12 ore per (tipo, id, lingua). Null su errore. */
export async function loadTagFacts(input: LoadTagFactsInput): Promise<TagFacts | null> {
  const key = `tagfacts:v1:${input.mediaType}:${input.tmdbId}:${input.locale.slice(0, 2)}`
  const hit = cacheGet<{ v: TagFacts | null }>(key)
  if (hit) return hit.v
  let p = inflight.get(key)
  if (!p) {
    p = buildFacts(input)
      .then((v) => {
        // Un fallimento (details assenti) non si cacha: la prossima riprova.
        if (v) cacheSet(key, { v }, ["tmdb", "tagfacts"], FACTS_TTL_MS)
        return v
      })
      .catch(() => null)
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}
