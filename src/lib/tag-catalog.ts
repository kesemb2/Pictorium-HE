/**
 * Fork: catalogo delle tag dello stile "Tag" e scelta giornaliera.
 *
 * Ogni poster in stile Tag porta una tag. Le notizie (top 10, nuova stagione,
 * nuovo episodio, in uscita, appena aggiunto) vincono sempre e le decide la
 * scala esistente (`computeTopBadge`); qui c'è tutto il resto: un catalogo di
 * tag "permanenti" ricavate dai dati TMDB del titolo (genere, decennio, durata,
 * parole chiave, persone, saga, origine…), da cui ogni giorno se ne sceglie
 * una in modo deterministico — uguale per tutti, diversa da ieri.
 *
 * Il modulo è puro: i fatti arrivano già risolti da `tag-facts.ts` (che fa le
 * chiamate TMDB, cachate). I testi sono le chiavi `tag.*` dei dizionari, con
 * la formulazione ebraica approvata nella pagina di revisione.
 */
import { getSubGenreLabels } from "./subgenres"

export type TagT = (key: string, params?: Record<string, string | number>) => string

/** Nome con forma per lingua: l'ebraico per `he`, l'altra per il resto. */
export interface LocalizedName {
  readonly he: string
  readonly en: string
}

/** Tutto ciò che un titolo porta, già letto da TMDB. */
export interface TagFacts {
  readonly mediaType: "movie" | "tv"
  readonly genreIds: readonly number[]
  readonly runtime?: number | null
  readonly episodeRunTime?: readonly number[] | null
  readonly episodeCount?: number | null
  readonly seasonCount?: number | null
  readonly status?: string | null
  readonly tvType?: string | null
  readonly revenue?: number | null
  readonly budget?: number | null
  readonly voteAverage?: number | null
  readonly voteCount?: number | null
  readonly releaseDate?: string | null
  readonly originCountries: readonly string[]
  readonly originalLanguage?: string | null
  readonly keywords: readonly string[]
  readonly productionCompanies: readonly string[]
  readonly networks: readonly string[]
  /** Primo del cast, col nome già nella lingua della richiesta (null = niente tag). */
  readonly starName?: string | null
  /** Compositore (crew "Original Music Composer"), nome TMDB grezzo. */
  readonly composer?: string | null
  /** Serie più nota dello stesso creatore, nella lingua della richiesta. */
  readonly creatorOtherTitle?: string | null
  /** Saga: nome localizzato e posizione del titolo (1-based) per data. */
  readonly collection?: { readonly name: string; readonly part: number } | null
}

export interface TagCandidate {
  readonly id: string
  readonly label: string
  /** Peso nella scelta giornaliera (1 = comune, 3 = di prestigio). */
  readonly weight: number
}

// ---------------------------------------------------------------------------
// Tabelle
// ---------------------------------------------------------------------------

/** Generi TMDB (film e serie) → id tag. I composti TV si aprono in due. */
const GENRE_TAGS: Record<number, readonly string[]> = {
  28: ["g_action"], 12: ["g_adventure"], 35: ["g_comedy"], 27: ["g_horror"],
  878: ["g_scifi"], 18: ["g_drama"], 53: ["g_thriller"], 16: ["g_animation"],
  99: ["g_documentary"], 80: ["g_crime"], 10749: ["g_romance"], 14: ["g_fantasy"],
  10752: ["g_war"], 36: ["g_history"], 10402: ["g_music"], 9648: ["g_mystery"],
  37: ["g_western"], 10751: ["g_family"],
  // Serie: generi composti e propri.
  10759: ["g_action", "g_adventure"], 10765: ["g_scifi", "g_fantasy"], 10768: ["g_war"],
}

/** Coppie di generi che diventano una tag sola (e tolgono le due singole). */
const GENRE_COMBOS: readonly { readonly id: string; readonly needs: readonly string[] }[] = [
  { id: "g_romcom", needs: ["g_comedy", "g_romance"] },
  { id: "g_actioncomedy", needs: ["g_action", "g_comedy"] },
  { id: "g_horrorcomedy", needs: ["g_horror", "g_comedy"] },
  { id: "g_crimedrama", needs: ["g_crime", "g_drama"] },
]

/**
 * Parole chiave TMDB (minuscole, confronto esatto) → tag di trama. Esatto e
 * non per sottostringa: "band" non deve accendersi su "band of brothers".
 */
const KEYWORD_TAGS: Record<string, readonly string[]> = {
  s_truestory: ["based on true story", "based on a true story"],
  s_book: ["based on novel or book", "based on novel", "based on book", "based on young adult novel"],
  s_comic: ["based on comic", "based on comic book", "based on graphic novel"],
  s_superhero: ["superhero", "superhero team", "super power"],
  s_sequel: ["sequel"],
  s_spinoff: ["spin off", "spin-off", "spinoff"],
  s_remake: ["remake"],
  s_ai: ["artificial intelligence (a.i.)", "artificial intelligence"],
  s_aliens: ["alien", "alien invasion", "extraterrestrial"],
  s_robots: ["robot", "android", "cyborg"],
  s_serialkiller: ["serial killer"],
  s_revenge: ["revenge"],
  s_spy: ["spy", "espionage", "secret agent"],
  s_courtroom: ["courtroom", "courtroom drama", "legal drama", "trial"],
  s_ww2: ["world war ii"],
  s_space: ["space", "outer space", "astronaut", "space travel"],
  s_dystopia: ["dystopia"],
  s_endofworld: ["end of the world", "apocalypse"],
  s_dragons: ["dragon"],
  s_magic: ["magic", "witch", "wizard", "sorcery"],
  s_knights: ["knight"],
  s_sport: ["sport", "sports"],
  s_boxing: ["boxing", "boxer"],
  s_football: ["football (soccer)", "soccer"],
  s_comingofage: ["coming of age"],
  s_highschool: ["high school"],
  s_christmas: ["christmas"],
  s_halloween: ["halloween"],
  s_survival: ["survival"],
  s_disaster: ["natural disaster", "disaster movie", "earthquake", "tsunami"],
  s_shark: ["shark", "shark attack"],
  s_musician: ["musician", "rock band", "singer"],
  s_musical: ["musical"],
  t_anthology: ["anthology"],
}

/** Universi condivisi, da parola chiave. */
const UNIVERSES: Record<string, LocalizedName> = {
  "marvel cinematic universe (mcu)": { he: "מארוול", en: "Marvel" },
  "dc extended universe (dceu)": { he: "DC", en: "DC" },
  "monsterverse": { he: "מונסטרוורס", en: "MonsterVerse" },
  "wizarding world": { he: "עולם הקוסמים", en: "the Wizarding World" },
}

/** Studi riconosciuti: inizio del nome della production company → tag. */
const STUDIOS: readonly { readonly id: string; readonly prefixes: readonly string[] }[] = [
  { id: "st_pixar", prefixes: ["pixar"] },
  { id: "st_ghibli", prefixes: ["studio ghibli"] },
  { id: "st_marvel", prefixes: ["marvel studios"] },
  { id: "st_dc", prefixes: ["dc studios", "dc entertainment", "dc films", "dc comics"] },
  { id: "st_a24", prefixes: ["a24"] },
  { id: "st_blumhouse", prefixes: ["blumhouse"] },
  { id: "st_disney", prefixes: ["walt disney pictures", "walt disney animation"] },
  { id: "st_dreamworks", prefixes: ["dreamworks"] },
  { id: "st_lucasfilm", prefixes: ["lucasfilm"] },
]

/** Reti di streaming le cui produzioni originali meritano la tag col nome. */
const STREAMING_NETWORKS: readonly { readonly match: readonly string[]; readonly label: string }[] = [
  { match: ["netflix"], label: "Netflix" },
  { match: ["hbo", "max"], label: "HBO" },
  { match: ["apple tv+", "apple tv"], label: "Apple TV+" },
  { match: ["disney+"], label: "Disney+" },
  { match: ["prime video", "amazon"], label: "Prime Video" },
  { match: ["hulu"], label: "Hulu" },
  { match: ["paramount+"], label: "Paramount+" },
]

/** Compositori noti (nome TMDB → nome per lingua). */
const COMPOSERS: Record<string, LocalizedName> = {
  "hans zimmer": { he: "האנס צימר", en: "Hans Zimmer" },
  "john williams": { he: "ג'ון ויליאמס", en: "John Williams" },
  "ennio morricone": { he: "אניו מוריקונה", en: "Ennio Morricone" },
  "howard shore": { he: "הווארד שור", en: "Howard Shore" },
  "ludwig göransson": { he: "לודוויג גורנסון", en: "Ludwig Göransson" },
  "danny elfman": { he: "דני אלפמן", en: "Danny Elfman" },
  "hildur guðnadóttir": { he: "הילדור גודנאדוטיר", en: "Hildur Guðnadóttir" },
  "alexandre desplat": { he: "אלכסנדר דספלה", en: "Alexandre Desplat" },
  "michael giacchino": { he: "מייקל ג'יאקינו", en: "Michael Giacchino" },
  "ramin djawadi": { he: "רמין ג'וואדי", en: "Ramin Djawadi" },
  "thomas newman": { he: "תומאס ניומן", en: "Thomas Newman" },
  "james horner": { he: "ג'יימס הורנר", en: "James Horner" },
  "trent reznor": { he: "טרנט רזנור", en: "Trent Reznor" },
  "max richter": { he: "מקס ריכטר", en: "Max Richter" },
}

const NORDIC = new Set(["SE", "NO", "DK"])

// Soglie (vedi pagina di revisione).
const BLOCKBUSTER_REVENUE = 500_000_000
const BILLION_REVENUE = 1_000_000_000
const INDIE_BUDGET = 5_000_000

function localized(n: LocalizedName, locale: string): string {
  return locale.slice(0, 2) === "he" ? n.he : n.en
}

function yearOf(date: string | null | undefined): number | null {
  const y = Number((date || "").slice(0, 4))
  return Number.isFinite(y) && y > 1800 ? y : null
}

/** Mezze ore: 150 min → "2.5", 180 → "3". */
function hoursLabel(minutes: number): string {
  const h = Math.round(minutes / 30) / 2
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function median(xs: readonly number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0).slice().sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.floor(v.length / 2)]!
}

// ---------------------------------------------------------------------------
// Regole
// ---------------------------------------------------------------------------

/**
 * Tutte le tag permanenti che valgono per il titolo. Ogni id compare al più
 * una volta; l'ordine non conta (la scelta è per hash).
 */
export function eligibleTags(f: TagFacts, t: TagT, locale = "he", now: Date = new Date()): TagCandidate[] {
  const out = new Map<string, TagCandidate>()
  const add = (id: string, label: string, weight: number) => {
    const clean = label.trim()
    if (clean && !out.has(id)) out.set(id, { id, label: clean, weight })
  }
  const tag = (id: string, weight: number, params?: Record<string, string | number>) => add(id, t(`tag.${id}`, params), weight)
  const isTv = f.mediaType === "tv"
  const kw = new Set(f.keywords.map((k) => k.toLowerCase().trim()))
  const year = yearOf(f.releaseDate)
  const votes = f.voteCount ?? 0
  const score = f.voteAverage ?? 0
  const lang = (f.originalLanguage || "").toLowerCase()
  const countries = new Set(f.originCountries.map((c) => c.toUpperCase()))
  const isAnimation = f.genreIds.includes(16)
  const isJapaneseAnimation = isAnimation && (lang === "ja" || countries.has("JP"))

  // --- Prestigio (film: incassi e budget) ---
  if (!isTv) {
    if ((f.revenue ?? 0) >= BILLION_REVENUE) tag("billion", 3)
    else if ((f.revenue ?? 0) >= BLOCKBUSTER_REVENUE) tag("blockbuster", 2)
    if ((f.budget ?? 0) > 0 && (f.budget ?? 0) <= INDIE_BUDGET && score >= 6.8 && votes >= 100) tag("indie", 2)
  }
  if (score >= 7.5 && votes >= 50 && votes <= 1500) tag("hiddenGem", 2)
  if (votes >= 15000) tag("crowdFavorite", 1)
  if (year !== null && year < 2000 && score >= 7.3 && votes >= 3000) tag("cult", 2)

  // --- Tempo e formato ---
  if (year !== null) {
    const age = now.getUTCFullYear() - year
    if (age >= 10 && age % 5 === 0) tag("anniversary", 2, { n: age })
    if (year >= 1950 && year < 2000) tag("classicDecade", 1, { decade: String(Math.floor((year % 100) / 10) * 10) })
    else if (year >= 2000 && year < 2020) tag("hitDecade", 1, { decade: String(Math.floor(year / 10) * 10) })
  }
  if (!isTv && f.runtime) {
    if (f.runtime >= 60 && f.runtime <= 90) tag("short", 1)
    else if (f.runtime >= 150) tag("epic", 1, { n: hoursLabel(f.runtime) })
  }
  if (isTv) {
    const miniseries = (f.tvType || "").toLowerCase() === "miniseries"
    const eps = f.episodeCount ?? 0
    if (miniseries) add("miniseries", t("badge.miniseries"), 1)
    if (miniseries && eps > 0 && eps <= 8) tag("fewEpisodes", 1, { n: eps })
    else if (!miniseries && eps > 0 && eps <= 10) tag("binge", 1)
    if ((f.seasonCount ?? 0) >= 5) tag("seasons", 1, { n: f.seasonCount! })
    const ep = median(f.episodeRunTime ?? [])
    if (ep !== null && ep <= 30) tag("halfHour", 1)
    if ((f.status || "").toLowerCase() === "canceled") tag("canceled", 1)
  }

  // --- Genere ---
  const genres = new Set<string>()
  for (const id of f.genreIds) for (const g of GENRE_TAGS[id] ?? []) genres.add(g)
  if (isJapaneseAnimation) { genres.delete("g_animation"); add("anime", t("badge.anime"), 2) }
  // Famiglia: sui film è la tag "per tutta la famiglia"; sulle serie il genere.
  if (!isTv && genres.has("g_family")) { genres.delete("g_family"); tag("family", 1) }
  if (isTv && f.genreIds.includes(10762)) tag("kids", 1)
  if (isTv && genres.has("g_documentary")) { genres.delete("g_documentary"); tag("t_docuseries", 1) }
  if (isTv && (f.genreIds.includes(10764) || (f.tvType || "").toLowerCase() === "reality")) tag("t_reality", 1)
  if (isTv && (f.genreIds.includes(10767) || (f.tvType || "").toLowerCase() === "talk show")) tag("t_talk", 1)
  for (const combo of GENRE_COMBOS) {
    if (combo.needs.every((g) => genres.has(g))) {
      tag(combo.id, 1)
      for (const g of combo.needs) genres.delete(g)
    }
  }
  for (const g of genres) tag(g, 1)

  // --- Trama (parole chiave) ---
  for (const sub of getSubGenreLabels([...f.keywords], locale)) add(`s_${sub.key}`, sub.label, 2)
  for (const [id, words] of Object.entries(KEYWORD_TAGS)) {
    if (words.some((w) => kw.has(w))) tag(id, id === "t_anthology" ? 1 : 2)
  }

  // --- Persone ---
  if (f.starName) tag("star", 2, { name: f.starName })
  const composer = f.composer ? COMPOSERS[f.composer.toLowerCase().trim()] : undefined
  if (composer) tag("composer", 2, { name: localized(composer, locale) })
  if (isTv && f.creatorOtherTitle) tag("creators", 2, { title: f.creatorOtherTitle })
  if (isTv) {
    const nets = f.networks.map((n) => n.toLowerCase().trim())
    const net = STREAMING_NETWORKS.find((s) => s.match.some((m) => nets.some((n) => n === m || n.startsWith(m + " "))))
    if (net) tag("original", 2, { network: net.label })
  }
  const companies = f.productionCompanies.map((c) => c.toLowerCase().trim())
  for (const studio of STUDIOS) {
    if (studio.prefixes.some((p) => companies.some((c) => c.startsWith(p)))) tag(studio.id, 2)
  }

  // --- Saga ---
  if (f.collection && f.collection.name && f.collection.part > 0) {
    tag("collection", 3, { n: f.collection.part, name: f.collection.name })
  }
  for (const [word, name] of Object.entries(UNIVERSES)) {
    if (kw.has(word)) { tag("universe", 3, { name: localized(name, locale) }); break }
  }

  // --- Origine ---
  const isIsraeli = countries.has("IL") || lang === "he"
  if (isIsraeli) tag(isTv ? "il_series" : "il_movie", 2)
  if (!isTv && lang === "fr") tag("fr_movie", 2)
  if (isTv && lang === "es") tag("es_series", 2)
  if (countries.has("GB") && lang === "en") tag("gb", 1)
  if (!isTv && lang === "ja" && !isAnimation) tag("jp_movie", 2)
  if (lang === "hi") tag("bollywood", 2)
  if ([...countries].some((c) => NORDIC.has(c)) && ["sv", "no", "nb", "da"].includes(lang)) tag("nordic", 2)
  if (isTv && countries.has("KR")) add("kdrama", t("badge.kdrama"), 2)

  // Una chiave non tradotta torna com'è ("tag.x"): mai stamparla.
  return [...out.values()].filter((c) => !c.label.startsWith("tag."))
}

// ---------------------------------------------------------------------------
// Scelta giornaliera
// ---------------------------------------------------------------------------

/** FNV-1a 32 bit: stabile tra istanze e versioni di Node. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Sequenza pesata del titolo: ogni tag compare tante volte quanto il suo peso,
 * disposte in modo che due giorni vicini (anche a cavallo del giro) non
 * ripetano la stessa tag quando è possibile. L'ordine fra pari dipende dal
 * titolo (hash), non dal giorno: la sequenza è fissa finché le tag lo sono.
 */
function dailySequence(pool: readonly TagCandidate[], titleKey: string): TagCandidate[] {
  const byId = new Map(pool.map((c) => [c.id, c]))
  const left = new Map(pool.map((c) => [c.id, Math.max(1, Math.round(c.weight))]))
  const rank = new Map(pool.map((c) => [c.id, fnv1a(`${titleKey}:${c.id}`)]))
  const total = [...left.values()].reduce((a, b) => a + b, 0)
  const seq: string[] = []
  for (let i = 0; i < total; i++) {
    const prev = seq[i - 1]
    const avoid = new Set<string>(prev ? [prev] : [])
    if (i === total - 1 && seq[0]) avoid.add(seq[0])
    const best = (exclude: Set<string>) => [...left.entries()]
      .filter(([id, n]) => n > 0 && !exclude.has(id))
      .sort((x, y) => y[1] - x[1] || rank.get(x[0])! - rank.get(y[0])!)[0]?.[0]
    const id = best(avoid) ?? best(new Set(prev ? [prev] : [])) ?? best(new Set())!
    seq.push(id)
    left.set(id, left.get(id)! - 1)
  }
  return seq.map((id) => byId.get(id)!)
}

/**
 * La tag del giorno: pesata, deterministica per (titolo, giorno), uguale per
 * tutti, e diversa da quella di ieri quando c'è un'alternativa.
 */
export function pickDailyTag(pool: readonly TagCandidate[], titleKey: string, bucket: number): TagCandidate | null {
  if (!pool.length) return null
  // Stessa sequenza qualunque sia l'ordine in cui arrivano le candidate.
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const seq = dailySequence(sorted, titleKey)
  // Il punto di partenza dipende dal titolo: titoli diversi non girano in fase.
  const offset = fnv1a(titleKey) % seq.length
  return seq[(((bucket + offset) % seq.length) + seq.length) % seq.length]!
}
