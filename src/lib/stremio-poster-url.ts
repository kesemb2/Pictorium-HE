import { buildPosterPublicUrl } from "@/lib/poster-public-url"
import { buildStremioPosterSearchParams } from "@/lib/stremio-poster-params"
import { isRankKey } from "@/lib/i18n"
import type { ServerDefaults } from "@/lib/server-defaults"
import type { Mapping } from "@/lib/types"
import { envWithFallback } from "@/lib/env-compat"
import { createLogger } from "@/lib/logger"

const log = createLogger("stremio-poster-url")

/**
 * Ora che `api_key` non viaggia più nell'URL poster, la chiave TMDB del render
 * può arrivare SOLO dall'env d'istanza: Stremio non invia header custom, e né
 * il config token né il profilo `?u=` portano una chiave TMDB. Senza env, i
 * poster dei cataloghi restano senza dati TMDB — meglio dirlo una volta a voce
 * alta che scoprirlo da poster vuoti.
 */
let warnedNoInstanceKey = false
function warnIfNoInstanceTmdbKey(): void {
  if (warnedNoInstanceKey) return
  const envKey = envWithFallback("TMDB_KEY") || process.env.TMDB_KEY || process.env.TMDB_API_KEY
  if (envKey) return
  warnedNoInstanceKey = true
  log.warn("Nessuna chiave TMDB d'istanza: i poster serviti a Stremio non ne porteranno una. Imposta PICTORIUM_TMDB_KEY.")
}

export type StremioPosterType = "movie" | "series"

export interface BuildStremioPosterUrlInput {
  readonly origin: string
  readonly type: StremioPosterType
  readonly id: number
  readonly defaults: ServerDefaults
  readonly mapping?: Mapping | null
  // Niente chiavi (vedi stremio-poster-params.ts): questo URL viene servito a
  // Stremio e persistito nel suo database — mai segreti dentro.
  readonly animerank?: number
  readonly lang?: string | null
  readonly config?: string | null
  readonly user?: string | null
}

export function mappingVersionParam(mapping: Mapping | null | undefined): string | null {
  if (!mapping?.updatedAt) return null
  const timestamp = Date.parse(mapping.updatedAt)
  return Number.isFinite(timestamp) ? String(timestamp) : null
}

export function buildStremioPosterUrl(input: BuildStremioPosterUrlInput): URL {
  const url = buildPosterPublicUrl(`/api/poster/${input.type}/${input.id}`, {
    origin: input.origin,
  })

  const mapping = input.mapping ?? null
  // Custom badge testuale salvato per-titolo: emesso come `extra` (il server
  // risolve le label prefissate __badge.* con la lingua della richiesta).
  // Le rank-key (__badge.today/anime/movie/series e label equivalenti) sono
  // ESCLUSE: la preview WYSIWYG le rende come badge rank via rank/label, e il
  // server le riproduce da solo (rank live + fallback mapping.badgeRank/
  // trendRank/animeRank). Emetterle come `extra` duplicherebbe il badge perché
  // queryExtra vince sul badge calcolato (poster-service).
  const customBadge = mapping?.customBadge && !isRankKey(mapping.customBadge)
    ? mapping.customBadge
    : undefined
  warnIfNoInstanceTmdbKey()
  const params = buildStremioPosterSearchParams({
    config: input.config,
    animerank: input.animerank,
    user: input.user,
    lang: input.lang || "it",
    // Per-titolo vince sui default globali, con emissione ESPLICITA in query:
    // il fallback server (mapping quando il parametro manca) è fragile —
    // con installazioni ?config= il token scavalca il mapping (poster-config:
    // configOverride.globalBadges vince su mapping.showBadges). Il server
    // applica query > mapping > config > defaults, quindi l'esplicito è
    // sempre fedele al mapping senza alterare i titoli senza mapping.
    globalBadges: mapping?.showBadges ?? input.defaults.globalBadges,
    rankingBadges: mapping?.rankingBadges ?? input.defaults.rankingBadges,
    badgeGenre: input.mapping?.badgeGenre ?? input.defaults.badgeGenre,
    badgeYear: input.mapping?.badgeYear ?? input.defaults.badgeYear,
    badgeRating: input.mapping?.badgeRating ?? input.defaults.badgeRating,
    badgeQuality: input.mapping?.badgeQuality ?? input.defaults.badgeQuality,
    ratingSources: input.defaults.ratingSources,
    badgeStyle: mapping?.badgeStyle ?? input.defaults.badgeStyle,
    rankingBadgeStyle: mapping?.rankingBadgeStyle ?? input.defaults.rankingBadgeStyle,
    gradientHeight: mapping?.gradientHeight ?? input.defaults.gradientHeight,
    blurIntensity: mapping?.blurIntensity ?? input.defaults.blurIntensity,
    blurFade: mapping?.blurFade ?? input.defaults.blurFade,
    blurDarkness: mapping?.blurDarkness ?? input.defaults.blurDarkness,
    blurEnabled: mapping?.blurEnabled ?? input.defaults.blurEnabled,
    customBadge,
    networkLogo: (input.defaults.networkLogo !== false) && (mapping?.networkLogo !== false),
    accentDominant: (input.defaults.accentDominant !== false) && (mapping?.accentDominant !== false),
    badgeTopScale: mapping?.badgeTopScale ?? input.defaults.badgeTopScale,
    badgeBottomScale: mapping?.badgeBottomScale ?? input.defaults.badgeBottomScale,
    badgeTopOffset: mapping?.badgeTopOffset ?? input.defaults.badgeTopOffset,
    badgeBottomOffset: mapping?.badgeBottomOffset ?? input.defaults.badgeBottomOffset,
    logoBottomOffset: input.defaults.logoBottomOffset,
    ribbonSide: mapping?.ribbonSide ?? input.defaults.ribbonSide,
  })

  params.forEach((value, key) => url.searchParams.set(key, value))
  const mappingVersion = mappingVersionParam(input.mapping)
  if (mappingVersion) url.searchParams.set("mv", mappingVersion)
  return url
}
