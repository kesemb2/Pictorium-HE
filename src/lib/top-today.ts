/**
 * Fork: la top 10 del giorno di film e serie, con le regole di TopToday
 * (toptoday.llamayu.com, codice gemello: github.com/savantguarded/Top-20).
 *
 * Fonte: il trending GIORNALIERO di TMDB (`/trending/{movie,tv}/day`), nel suo
 * ordine. Dalla lista si tolgono i titoli che non si possono ancora guardare:
 * - film: serve un'uscita digitale (tipo 4) o fisica (tipo 5) negli USA già
 *   avvenuta. Un film solo al cinema non è in classifica;
 * - serie: la prima messa in onda deve essere già avvenuta;
 * - animazione giapponese, cinese e coreana (anime, donghua) esclusa;
 * - titoli non in inglese: almeno 50 voti su TMDB (niente exploit di una
 *   sola community).
 * Si scorrono le pagine finché 10 titoli passano. La lista si ricostruisce da
 * sola: la chiave porta il giorno (UTC) e scade comunque dopo 3 ore, così
 * segue gli aggiornamenti del trending durante la giornata.
 *
 * Usata solo dalla striscia col numero dei poster orizzontali (rank-strip).
 */
import { cacheGet, cacheSet } from "@/lib/cache"
import { getReleaseDates, getTrending } from "@/lib/tmdb"

export const TOP_TODAY_SIZE = 10
const MAX_PAGES = 5
const FOREIGN_MIN_VOTES = 50
const REGION = "US"
const TTL_MS = 3 * 60 * 60 * 1000
const ANIMATION_GENRE = 16
const EAST_ASIAN_LANGUAGES = new Set(["ja", "zh", "cn", "ko"])
const EAST_ASIAN_COUNTRIES = new Set(["JP", "CN", "HK", "TW", "KR"])
/** Uscita digitale (4) o fisica (5) nelle date TMDB. */
const HOME_RELEASE_TYPES = new Set([4, 5])

export type TopTodayType = "movie" | "tv"

/** Campi del trending che servono ai filtri (lo schema TMDB è passthrough). */
interface TrendingCandidate {
  readonly id: number
  readonly original_language?: string
  readonly genre_ids?: readonly number[]
  readonly origin_country?: readonly string[]
  readonly vote_count?: number
  readonly first_air_date?: string
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Anime e donghua: animazione con lingua o paese dell'Asia orientale. */
export function isEastAsianAnimation(item: TrendingCandidate): boolean {
  if (!item.genre_ids?.includes(ANIMATION_GENRE)) return false
  if (item.original_language && EAST_ASIAN_LANGUAGES.has(item.original_language)) return true
  return (item.origin_country ?? []).some((c) => EAST_ASIAN_COUNTRIES.has(c))
}

/** Un titolo non in inglese entra solo con abbastanza voti. */
export function passesPopularityGate(item: TrendingCandidate): boolean {
  if (!item.original_language || item.original_language === "en") return true
  return (item.vote_count ?? 0) >= FOREIGN_MIN_VOTES
}

/** Serie già in onda (prima messa in onda non futura). */
export function hasAired(item: TrendingCandidate, day: string): boolean {
  return !!item.first_air_date && item.first_air_date.slice(0, 10) <= day
}

/** Film già uscito negli USA in digitale o su disco. */
async function movieAtHome(id: number, day: string, apiKey?: string): Promise<boolean> {
  try {
    const dates = await getReleaseDates("movie", id, apiKey)
    const us = dates.results.find((r) => r.iso_3166_1 === REGION)
    return !!us?.release_dates.some((d) => HOME_RELEASE_TYPES.has(d.type) && d.release_date.slice(0, 10) <= day)
  } catch {
    // Date non disponibili: fuori dalla classifica (meglio un posto vuoto
    // che un film ancora al cinema col numero).
    return false
  }
}

async function buildList(type: TopTodayType, apiKey: string | undefined, now: Date): Promise<number[]> {
  const day = today(now)
  const ids: number[] = []
  for (let page = 1; page <= MAX_PAGES && ids.length < TOP_TODAY_SIZE; page++) {
    const res = await getTrending(type, "day", apiKey, page, "en-US")
    const candidates = (res.results as unknown as TrendingCandidate[])
      .filter((item) => !ids.includes(item.id) && !isEastAsianAnimation(item) && passesPopularityGate(item))
      .filter((item) => type === "movie" || hasAired(item, day))
    const ok = type === "movie"
      ? await Promise.all(candidates.map((item) => movieAtHome(item.id, day, apiKey)))
      : candidates.map(() => true)
    for (let i = 0; i < candidates.length && ids.length < TOP_TODAY_SIZE; i++) {
      if (ok[i]) ids.push(candidates[i]!.id)
    }
    if (page >= (res.total_pages ?? MAX_PAGES)) break
  }
  return ids
}

const inflight = new Map<string, Promise<number[]>>()

/** La top 10 di oggi (id TMDB, in ordine). Lista vuota su errore, mai in cache. */
export async function getTopToday(type: TopTodayType, apiKey?: string, now: Date = new Date()): Promise<number[]> {
  const key = `toptoday:v1:${type}:${today(now)}`
  const cached = cacheGet<number[]>(key)
  if (cached) return cached
  let p = inflight.get(key)
  if (!p) {
    p = buildList(type, apiKey, now)
      .then((ids) => {
        // Una lista vuota non si cacha: un errore upstream la renderebbe
        // "nessuno in classifica" per ore.
        if (ids.length > 0) cacheSet(key, ids, ["tmdb", "trending"], TTL_MS)
        return ids
      })
      .catch(() => [] as number[])
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

/** Posizione (1..10) del titolo nella top di oggi, o null. Non lancia mai. */
export async function topTodayRank(type: TopTodayType, tmdbId: number, apiKey?: string): Promise<number | null> {
  const ids = await getTopToday(type, apiKey)
  const idx = ids.indexOf(tmdbId)
  return idx >= 0 ? idx + 1 : null
}
