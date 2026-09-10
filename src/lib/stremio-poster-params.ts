import { POSTER_URL_VERSION } from "@/lib/render-version"
import type { BadgeStyle, RankingBadgeStyle } from "@/lib/badge-styles"

export interface StremioPosterParamsInput {
  readonly apiKey?: string
  readonly mdblistKey?: string
  readonly animerank?: number
  readonly lang?: string | null
  readonly globalBadges?: boolean
  readonly rankingBadges?: boolean
  /** Componenti del badge genere/rating: `false` disabilita quel componente. */
  readonly badgeGenre?: boolean
  readonly badgeYear?: boolean
  readonly badgeRating?: boolean
  readonly badgeQuality?: boolean
  readonly ratingSources?: string[]
  readonly badgeStyle?: BadgeStyle
  readonly rankingBadgeStyle?: RankingBadgeStyle
  readonly gradientHeight?: number
  readonly blurIntensity?: number
  readonly blurFade?: number
  readonly blurDarkness?: number
  readonly blurEnabled?: boolean
  readonly networkLogo?: boolean
  readonly accentDominant?: boolean
  readonly badgeTopScale?: number
  readonly badgeBottomScale?: number
  readonly textOpacity?: number
  readonly textShadowOpacity?: number
  readonly textShadowBlur?: number
  readonly textShadowOffset?: number
  readonly ratingStar?: boolean
  readonly badgeTopOffset?: number
  readonly badgeBottomOffset?: number
  readonly logoBottomOffset?: number
  readonly ribbonSide?: "left" | "right"
  /** Badge extra testuale per-titolo (dal mapping): emesso come `extra`. */
  readonly customBadge?: string | null
  readonly config?: string | null
  readonly user?: string | null
}

const DEFAULT_STREMIO_POSTER_PARAMS = {
  globalBadges: true,
  rankingBadges: true,
  badgeStyle: "shadow",
  rankingBadgeStyle: "default",
  gradientHeight: 30,
  blurIntensity: 5,
  blurFade: 60,
  blurDarkness: 40,
  blurEnabled: true,
  networkLogo: true,
  accentDominant: true,
  badgeTopScale: 100,
  badgeBottomScale: 100,
  textOpacity: 100,
  textShadowOpacity: 100,
  textShadowBlur: 100,
  textShadowOffset: 100,
  badgeTopOffset: 0,
  badgeBottomOffset: 0,
  logoBottomOffset: 0,
} as const

export function buildStremioPosterSearchParams(input: StremioPosterParamsInput): URLSearchParams {
  const params = new URLSearchParams()
  const globalBadges = input.globalBadges ?? DEFAULT_STREMIO_POSTER_PARAMS.globalBadges
  const rankingBadges = input.rankingBadges ?? DEFAULT_STREMIO_POSTER_PARAMS.rankingBadges
  const blurEnabled = input.blurEnabled ?? DEFAULT_STREMIO_POSTER_PARAMS.blurEnabled
  const networkLogo = input.networkLogo ?? DEFAULT_STREMIO_POSTER_PARAMS.networkLogo
  const accentDominant = input.accentDominant ?? DEFAULT_STREMIO_POSTER_PARAMS.accentDominant

  if (input.config) params.set("config", input.config)
  if (input.user) params.set("u", input.user)
  if (input.apiKey) params.set("api_key", input.apiKey)
  // Chiave MDBList esplicita della richiesta catalogo (rank anime nei poster).
  // La chiave del profilo NON va nell'URL: viene risolta server-side da ?u=.
  if (input.mdblistKey) params.set("mdblist_key", input.mdblistKey)
  // Rank anime noto al catalogo (posizione in lista): rende il badge Anime
  // deterministico su Stremio, indipendentemente dalle chiavi lato server.
  if (input.animerank) params.set("animerank", String(input.animerank))
  if (!globalBadges) params.set("badges", "0")
  if (!rankingBadges) params.set("ranking", "0")
  if (input.badgeGenre === false) params.set("bg", "0")
  if (input.badgeYear === false) params.set("by", "0")
  if (input.badgeRating === false) params.set("br", "0")
  if (input.badgeQuality === false) params.set("bq", "0")
  if (input.ratingSources && input.ratingSources.length > 0) params.set("rsrc", input.ratingSources.join(","))
  if (input.customBadge) params.set("extra", input.customBadge)
  if (!networkLogo) params.set("netLogo", "0")
  if (!accentDominant) params.set("ad", "0")
  params.set("bts", String(input.badgeTopScale ?? DEFAULT_STREMIO_POSTER_PARAMS.badgeTopScale))
  params.set("bbs", String(input.badgeBottomScale ?? DEFAULT_STREMIO_POSTER_PARAMS.badgeBottomScale))
  params.set("to", String(input.textOpacity ?? DEFAULT_STREMIO_POSTER_PARAMS.textOpacity))
  params.set("tso", String(input.textShadowOpacity ?? DEFAULT_STREMIO_POSTER_PARAMS.textShadowOpacity))
  params.set("tsb", String(input.textShadowBlur ?? DEFAULT_STREMIO_POSTER_PARAMS.textShadowBlur))
  params.set("tsf", String(input.textShadowOffset ?? DEFAULT_STREMIO_POSTER_PARAMS.textShadowOffset))
  params.set("star", input.ratingStar !== false ? "1" : "0")
  params.set("bto", String(input.badgeTopOffset ?? DEFAULT_STREMIO_POSTER_PARAMS.badgeTopOffset))
  params.set("bbo", String(input.badgeBottomOffset ?? DEFAULT_STREMIO_POSTER_PARAMS.badgeBottomOffset))
  params.set("lbo", String(input.logoBottomOffset ?? DEFAULT_STREMIO_POSTER_PARAMS.logoBottomOffset))
  if (input.ribbonSide === "right") params.set("side", "right")
  else if (input.ribbonSide === "left") params.set("side", "left")
  params.set("lang", input.lang || "it")
  if (!blurEnabled) params.set("be", "0")
  params.set("gradHeight", String(input.gradientHeight ?? DEFAULT_STREMIO_POSTER_PARAMS.gradientHeight))
  params.set("blur", String(input.blurIntensity ?? DEFAULT_STREMIO_POSTER_PARAMS.blurIntensity))
  params.set("bf", String(input.blurFade ?? DEFAULT_STREMIO_POSTER_PARAMS.blurFade))
  params.set("bd", String(input.blurDarkness ?? DEFAULT_STREMIO_POSTER_PARAMS.blurDarkness))
  params.set("bs", input.badgeStyle || DEFAULT_STREMIO_POSTER_PARAMS.badgeStyle)
  params.set("rs", input.rankingBadgeStyle || DEFAULT_STREMIO_POSTER_PARAMS.rankingBadgeStyle)
  params.set("rv", String(POSTER_URL_VERSION))
  return params
}
