"use client"

import { createContext, useContext, useState, useMemo, useCallback } from "react"
import type { TMDBImage } from "@/lib/types"
import { useDefaults } from "@/lib/useDefaults"
import type { BadgeStyle, RankingBadgeStyle } from "@/lib/badge-styles"

/**
 * PosterEditorCtx — possiede il proprio stato di editing (badge defaults,
 * posizionamento logo/backdrop, rotazione, esclusioni).
 * È il SINGLE SOURCE OF TRUTH per tutti i campi editor.
 *
 * I consumer che usano SOLO usePosterEditor() (es. BadgeControls, TransformControls)
 * NON ri-renderizzano quando cambia trending/search/navigation.
 */
export interface PosterEditorCtx {
  // ---- Badges ----
  globalBadges: boolean
  setGlobalBadges: (v: boolean | ((prev: boolean) => boolean)) => void
  rankingBadges: boolean
  setRankingBadges: (v: boolean | ((prev: boolean) => boolean)) => void
  /** Componenti del badge genere/rating (default tutti ON). */
  badgeGenre: boolean
  setBadgeGenre: (v: boolean | ((prev: boolean) => boolean)) => void
  badgeYear: boolean
  setBadgeYear: (v: boolean | ((prev: boolean) => boolean)) => void
  badgeRating: boolean
  setBadgeRating: (v: boolean | ((prev: boolean) => boolean)) => void
  badgeQuality: boolean
  setBadgeQuality: (v: boolean | ((prev: boolean) => boolean)) => void
  /** Riga rating custom provider (default ON quando il provider è configurato). */
  customRatings: boolean
  setCustomRatings: (v: boolean | ((prev: boolean) => boolean)) => void
  ratingSources: string[]
  setRatingSources: (v: string[] | ((prev: string[]) => string[])) => void
  badgeStyle: BadgeStyle
  setBadgeStyle: (v: BadgeStyle | ((prev: BadgeStyle) => BadgeStyle)) => void
  rankingBadgeStyle: RankingBadgeStyle
  setRankingBadgeStyle: (v: RankingBadgeStyle | ((prev: RankingBadgeStyle) => RankingBadgeStyle)) => void
  customBadge: string | null
  setCustomBadge: (v: string | null | ((prev: string | null) => string | null)) => void
  networkLogo: boolean
  setNetworkLogo: (v: boolean | ((prev: boolean) => boolean)) => void
  accentDominant: boolean
  setAccentDominant: (v: boolean | ((prev: boolean) => boolean)) => void
  textOpacity: number
  setTextOpacity: (v: number | ((prev: number) => number)) => void
  textShadowOpacity: number
  setTextShadowOpacity: (v: number | ((prev: number) => number)) => void
  textShadowBlur: number
  setTextShadowBlur: (v: number | ((prev: number) => number)) => void
  textShadowOffset: number
  setTextShadowOffset: (v: number | ((prev: number) => number)) => void
  ratingStar: boolean
  autoDarkText: boolean
  textHalo: boolean
  setRatingStar: (v: boolean | ((prev: boolean) => boolean)) => void
  setAutoDarkText: (v: boolean | ((prev: boolean) => boolean)) => void
  setTextHalo: (v: boolean | ((prev: boolean) => boolean)) => void
  badgeTopScale: number
  setBadgeTopScale: (v: number | ((prev: number) => number)) => void
  badgeBottomScale: number
  setBadgeBottomScale: (v: number | ((prev: number) => number)) => void
  badgeTopOffset: number
  setBadgeTopOffset: (v: number | ((prev: number) => number)) => void
  badgeBottomOffset: number
  setBadgeBottomOffset: (v: number | ((prev: number) => number)) => void
  logoBottomOffset: number
  setLogoBottomOffset: (v: number | ((prev: number) => number)) => void
  preRelease: boolean
  setPreRelease: (v: boolean | ((prev: boolean) => boolean)) => void
  ribbonSide: "left" | "right"
  setRibbonSide: (v: "left" | "right" | ((prev: "left" | "right") => "left" | "right")) => void
  episodeMetadataSource: "tmdb" | "tvdb"
  setEpisodeMetadataSource: (v: "tmdb" | "tvdb" | ((prev: "tmdb" | "tvdb") => "tmdb" | "tvdb")) => void
  region: string
  setRegion: (v: string | ((prev: string) => string)) => void

  // ---- Defaults ----
  defaultBadgeStyle: BadgeStyle
  setDefaultBadgeStyle: (v: BadgeStyle | ((prev: BadgeStyle) => BadgeStyle)) => void
  defaultRankingBadgeStyle: RankingBadgeStyle
  setDefaultRankingBadgeStyle: (v: RankingBadgeStyle | ((prev: RankingBadgeStyle) => RankingBadgeStyle)) => void
  defaultEpisodeMetadataSource: "tmdb" | "tvdb"
  setDefaultEpisodeMetadataSource: (v: "tmdb" | "tvdb" | ((prev: "tmdb" | "tvdb") => "tmdb" | "tvdb")) => void
  defaultBlurEnabled: boolean
  setDefaultBlurEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultBlurIntensity: number
  setDefaultBlurIntensity: (v: number | ((prev: number) => number)) => void
  defaultTintStrength: number
  setDefaultTintStrength: (v: number | ((prev: number) => number)) => void
  defaultBlurFade: number
  setDefaultBlurFade: (v: number | ((prev: number) => number)) => void
  defaultBlurDarkness: number
  setDefaultBlurDarkness: (v: number | ((prev: number) => number)) => void
  defaultGradientHeight: number
  setDefaultGradientHeight: (v: number | ((prev: number) => number)) => void
  defaultTopBadgeScale: number
  setDefaultTopBadgeScale: (v: number | ((prev: number) => number)) => void
  defaultTopBadgeOffsetX: number
  setDefaultTopBadgeOffsetX: (v: number | ((prev: number) => number)) => void
  defaultTopBadgeOffsetY: number
  setDefaultTopBadgeOffsetY: (v: number | ((prev: number) => number)) => void
  defaultGenreBadgeScale: number
  setDefaultGenreBadgeScale: (v: number | ((prev: number) => number)) => void
  defaultQualityBadgeScale: number
  setDefaultQualityBadgeScale: (v: number | ((prev: number) => number)) => void
  defaultNetworkLogoScale: number
  setDefaultNetworkLogoScale: (v: number | ((prev: number) => number)) => void
  defaultNetworkLogoOffsetX: number
  setDefaultNetworkLogoOffsetX: (v: number | ((prev: number) => number)) => void
  defaultNetworkLogoOffsetY: number
  setDefaultNetworkLogoOffsetY: (v: number | ((prev: number) => number)) => void
  defaultGenreBadgeOffsetX: number
  setDefaultGenreBadgeOffsetX: (v: number | ((prev: number) => number)) => void
  defaultGenreBadgeOffsetY: number
  setDefaultGenreBadgeOffsetY: (v: number | ((prev: number) => number)) => void
  defaultQualityBadgeOffsetX: number
  setDefaultQualityBadgeOffsetX: (v: number | ((prev: number) => number)) => void
  defaultQualityBadgeOffsetY: number
  setDefaultQualityBadgeOffsetY: (v: number | ((prev: number) => number)) => void
  defaultGlobalBadges: boolean
  setDefaultGlobalBadges: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultRankingBadges: boolean
  setDefaultRankingBadges: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultBadgeGenre: boolean
  setDefaultBadgeGenre: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultBadgeYear: boolean
  setDefaultBadgeYear: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultBadgeRating: boolean
  setDefaultBadgeRating: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultBadgeQuality: boolean
  setDefaultBadgeQuality: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultCustomRatings: boolean
  setDefaultCustomRatings: (v: boolean | ((prev: boolean) => boolean)) => void
  /** Endpoint provider custom rating (non-segreto; chiave solo env). */
  defaultCustomRatingEndpoint?: string
  setDefaultCustomRatingEndpoint: (v: string | undefined | ((prev: string | undefined) => string | undefined)) => void
  defaultCustomRatingApiKeyHeader?: string
  setDefaultCustomRatingApiKeyHeader: (v: string | undefined | ((prev: string | undefined) => string | undefined)) => void
  defaultRatingSources: string[]
  setDefaultRatingSources: (v: string[] | ((prev: string[]) => string[])) => void
  defaultAutoRotateClean: boolean
  setDefaultAutoRotateClean: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultLogoFitEnabled: boolean
  setDefaultLogoFitEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultNetworkLogo: boolean
  defaultAccentDominant: boolean
  setDefaultAccentDominant: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultTextOpacity: number
  setDefaultTextOpacity: (v: number | ((prev: number) => number)) => void
  defaultTextShadowOpacity: number
  setDefaultTextShadowOpacity: (v: number | ((prev: number) => number)) => void
  defaultTextShadowBlur: number
  setDefaultTextShadowBlur: (v: number | ((prev: number) => number)) => void
  defaultTextShadowOffset: number
  setDefaultTextShadowOffset: (v: number | ((prev: number) => number)) => void
  defaultRatingStar: boolean
  defaultAutoDarkText: boolean
  defaultTextHalo: boolean
  setDefaultRatingStar: (v: boolean | ((prev: boolean) => boolean)) => void
  setDefaultAutoDarkText: (v: boolean | ((prev: boolean) => boolean)) => void
  setDefaultTextHalo: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultBadgeTopScale: number
  setDefaultBadgeTopScale: (v: number | ((prev: number) => number)) => void
  defaultBadgeBottomScale: number
  setDefaultBadgeBottomScale: (v: number | ((prev: number) => number)) => void
  defaultBadgeTopOffset: number
  setDefaultBadgeTopOffset: (v: number | ((prev: number) => number)) => void
  defaultBadgeBottomOffset: number
  setDefaultBadgeBottomOffset: (v: number | ((prev: number) => number)) => void
  defaultLogoBottomOffset: number
  setDefaultLogoBottomOffset: (v: number | ((prev: number) => number)) => void
  setDefaultNetworkLogo: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultPreRelease: boolean
  setDefaultPreRelease: (v: boolean | ((prev: boolean) => boolean)) => void
  defaultRibbonSide: "left" | "right"
  setDefaultRibbonSide: (v: "left" | "right" | ((prev: "left" | "right") => "left" | "right")) => void
  defaultRegion: string
  setDefaultRegion: (v: string | ((prev: string) => string)) => void
  loadDefaultsToState: () => void

  // ---- Blur ----
  blurEnabled: boolean
  setBlurEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
  blurIntensity: number
  setBlurIntensity: (v: number | ((prev: number) => number)) => void
  /** Intensità tinta di scena 0-100 (default 20). */
  tintStrength: number
  setTintStrength: (v: number | ((prev: number) => number)) => void
  blurFade: number
  setBlurFade: (v: number | ((prev: number) => number)) => void
  blurDarkness: number
  setBlurDarkness: (v: number | ((prev: number) => number)) => void

  // ---- Gradient ----
  gradientHeight: number
  setGradientHeight: (v: number | ((prev: number) => number)) => void

  // ---- Badge superiore (rank/extra in alto) ----
  topBadgeScale: number
  setTopBadgeScale: (v: number | ((prev: number) => number)) => void
  topBadgeOffsetX: number
  setTopBadgeOffsetX: (v: number | ((prev: number) => number)) => void
  topBadgeOffsetY: number
  setTopBadgeOffsetY: (v: number | ((prev: number) => number)) => void

  // ---- Badge genere/rating in basso ----
  genreBadgeScale: number
  setGenreBadgeScale: (v: number | ((prev: number) => number)) => void
  genreBadgeOffsetX: number
  setGenreBadgeOffsetX: (v: number | ((prev: number) => number)) => void
  genreBadgeOffsetY: number
  setGenreBadgeOffsetY: (v: number | ((prev: number) => number)) => void

  // ---- Badge qualità streaming ----
  qualityBadgeScale: number
  setQualityBadgeScale: (v: number | ((prev: number) => number)) => void
  qualityBadgeOffsetX: number
  setQualityBadgeOffsetX: (v: number | ((prev: number) => number)) => void
  qualityBadgeOffsetY: number
  setQualityBadgeOffsetY: (v: number | ((prev: number) => number)) => void

  // ---- Logo network ----
  networkLogoScale: number
  setNetworkLogoScale: (v: number | ((prev: number) => number)) => void
  networkLogoOffsetX: number
  setNetworkLogoOffsetX: (v: number | ((prev: number) => number)) => void
  networkLogoOffsetY: number
  setNetworkLogoOffsetY: (v: number | ((prev: number) => number)) => void

  // ---- Logo ----
  logoScale: number
  setLogoScale: (v: number | ((prev: number) => number)) => void
  logoOffsetX: number
  setLogoOffsetX: (v: number | ((prev: number) => number)) => void
  logoOffsetY: number
  setLogoOffsetY: (v: number | ((prev: number) => number)) => void
  logoDisabled: boolean
  setLogoDisabled: (v: boolean | ((prev: boolean) => boolean)) => void
  // ---- Backdrop ----
  backdrops: TMDBImage[]
  setBackdrops: (v: TMDBImage[] | ((prev: TMDBImage[]) => TMDBImage[])) => void
  selectedBackdrop: TMDBImage | null
  setSelectedBackdrop: (v: TMDBImage | null | ((prev: TMDBImage | null) => TMDBImage | null)) => void
  backdropScale: number
  setBackdropScale: (v: number | ((prev: number) => number)) => void
  backdropOffsetX: number
  setBackdropOffsetX: (v: number | ((prev: number) => number)) => void
  backdropOffsetY: number
  setBackdropOffsetY: (v: number | ((prev: number) => number)) => void

  // ---- Rotation / esclusioni ----
  rotationPosters: string[]
  setRotationPosters: (v: string[] | ((prev: string[]) => string[])) => void
  autoRotateClean: boolean
  setAutoRotateClean: (v: boolean | ((prev: boolean) => boolean)) => void
  excludedPosters: string[]
  setExcludedPosters: (v: string[] | ((prev: string[]) => string[])) => void

  // ---- Episode Group (TV Series parts/seasons order) ----
  episodeGroupId: string | null
  setEpisodeGroupId: (v: string | null | ((prev: string | null) => string | null)) => void
}

const Ctx = createContext<PosterEditorCtx | null>(null)

export function usePosterEditor() {
  const v = useContext(Ctx)
  if (!v) throw new Error("usePosterEditor must be inside PosterEditorProvider")
  return v
}

/**
 * PosterEditorProvider — ORA possiede il proprio stato.
 * Non dipende più da PictoriumCtx.
 * Crea useDefaults() internamente per badge/blur/gradient defaults persistenti,
 * e useState per logo/backdrop/rotazione/editing.
 */
export function PosterEditorProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const defaults = useDefaults()

  // ---- Logo state ----
  const [logoScale, setLogoScale] = useState(75)
  const [logoOffsetX, setLogoOffsetX] = useState(0)
  const [logoOffsetY, setLogoOffsetY] = useState(0)
  const [logoDisabled, setLogoDisabled] = useState(false)

  // ---- Backdrop state ----
  const [backdrops, setBackdrops] = useState<TMDBImage[]>([])
  const [selectedBackdrop, setSelectedBackdrop] = useState<TMDBImage | null>(null)
  const [backdropScale, setBackdropScale] = useState(100)
  const [backdropOffsetX, setBackdropOffsetX] = useState(0)
  const [backdropOffsetY, setBackdropOffsetY] = useState(0)

  // ---- Rotation / esclusioni ----
  const [rotationPosters, setRotationPosters] = useState<string[]>([])
  const [autoRotateClean, setAutoRotateClean] = useState(false)
  const [excludedPosters, setExcludedPosters] = useState<string[]>([])

  // ---- Episode Group state ----
  const [episodeGroupId, setEpisodeGroupId] = useState<string | null>(null)

  // ---- Custom badge ----
  const [customBadge, setCustomBadge] = useState<string | null>(null)

  const {
    globalBadges, rankingBadges, networkLogo, preRelease, ribbonSide, badgeGenre, badgeYear, badgeRating,
    badgeQuality, customRatings, ratingSources, gradientHeight, blurIntensity, blurFade, blurDarkness, blurEnabled,
    tintStrength, accentDominant, badgeTopScale, badgeBottomScale, badgeTopOffset, badgeBottomOffset, logoBottomOffset, textOpacity,
    textShadowOpacity, textShadowBlur, textShadowOffset, ratingStar, autoDarkText, textHalo,
    topBadgeScale, topBadgeOffsetX, topBadgeOffsetY,
    genreBadgeScale, qualityBadgeScale, networkLogoScale,
    genreBadgeOffsetX, genreBadgeOffsetY, qualityBadgeOffsetX, qualityBadgeOffsetY,
    networkLogoOffsetX, networkLogoOffsetY,
    badgeStyle, rankingBadgeStyle,
    defaultBadgeStyle, defaultRankingBadgeStyle,
    defaultBlurEnabled, defaultBlurIntensity, defaultBlurFade, defaultBlurDarkness, defaultTintStrength,
    defaultGradientHeight, defaultGlobalBadges, defaultRankingBadges,
    defaultTopBadgeScale, defaultTopBadgeOffsetX, defaultTopBadgeOffsetY, defaultGenreBadgeScale, defaultQualityBadgeScale, defaultNetworkLogoScale, defaultGenreBadgeOffsetX, defaultGenreBadgeOffsetY,
    defaultQualityBadgeOffsetX, defaultQualityBadgeOffsetY, defaultNetworkLogoOffsetX, defaultNetworkLogoOffsetY, defaultBadgeGenre, defaultBadgeYear, defaultBadgeRating, defaultBadgeQuality,
    defaultCustomRatings, defaultCustomRatingEndpoint, defaultCustomRatingApiKeyHeader, defaultRatingSources, defaultAutoRotateClean, defaultLogoFitEnabled, defaultNetworkLogo, defaultPreRelease,
    defaultRibbonSide, defaultAccentDominant, defaultBadgeTopScale, defaultBadgeBottomScale, defaultBadgeTopOffset, defaultBadgeBottomOffset, defaultLogoBottomOffset, defaultTextOpacity,
    defaultTextShadowOpacity, defaultTextShadowBlur, defaultTextShadowOffset, defaultRatingStar, defaultAutoDarkText, defaultTextHalo,
    episodeMetadataSource, defaultEpisodeMetadataSource,
    region, defaultRegion,
    loadDefaultsToState, update,
  } = defaults

  const setGlobalBadges = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(globalBadges) : v
      update({ globalBadges: next })
    }, [globalBadges, update])
  const setRankingBadges = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(rankingBadges) : v
      update({ rankingBadges: next })
    }, [rankingBadges, update])
  const setBadgeGenre = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(badgeGenre) : v
      update({ badgeGenre: next })
    }, [badgeGenre, update])
  const setBadgeYear = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(badgeYear) : v
      update({ badgeYear: next })
    }, [badgeYear, update])
  const setBadgeRating = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(badgeRating) : v
      update({ badgeRating: next })
    }, [badgeRating, update])
  const setBadgeQuality = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(badgeQuality) : v
      update({ badgeQuality: next })
    }, [badgeQuality, update])
  const setCustomRatings = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(customRatings) : v
      update({ customRatings: next })
    }, [customRatings, update])
  const setRatingSources = useCallback(
    (v: string[] | ((prev: string[]) => string[])) => {
      const next = typeof v === "function" ? v(ratingSources) : v
      update({ ratingSources: next })
    }, [ratingSources, update])
  const setNetworkLogo = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(networkLogo) : v
      update({ networkLogo: next })
    }, [networkLogo, update])
  const setAccentDominant = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(accentDominant) : v
      update({ accentDominant: next, defaultAccentDominant: next })
    }, [accentDominant, update])
  const setBadgeTopScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(badgeTopScale) : v
      update({ badgeTopScale: next, defaultBadgeTopScale: next })
    }, [badgeTopScale, update])
  const setTextOpacity = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(textOpacity) : v
      update({ textOpacity: next, defaultTextOpacity: next })
    }, [textOpacity, update])
  const setTextShadowOpacity = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(textShadowOpacity) : v
      update({ textShadowOpacity: next, defaultTextShadowOpacity: next })
    }, [textShadowOpacity, update])
  const setTextShadowBlur = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(textShadowBlur) : v
      update({ textShadowBlur: next, defaultTextShadowBlur: next })
    }, [textShadowBlur, update])
  const setTextShadowOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(textShadowOffset) : v
      update({ textShadowOffset: next, defaultTextShadowOffset: next })
    }, [textShadowOffset, update])
  const setRatingStar = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(ratingStar) : v
      update({ ratingStar: next, defaultRatingStar: next })
    }, [ratingStar, update])
  const setAutoDarkText = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(autoDarkText) : v
      update({ autoDarkText: next, defaultAutoDarkText: next })
    }, [autoDarkText, update])
  const setTextHalo = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(textHalo) : v
      update({ textHalo: next, defaultTextHalo: next })
    }, [textHalo, update])
  const setBadgeBottomScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(badgeBottomScale) : v
      update({ badgeBottomScale: next, defaultBadgeBottomScale: next })
    }, [badgeBottomScale, update])
  const setBadgeTopOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(badgeTopOffset) : v
      update({ badgeTopOffset: next, defaultBadgeTopOffset: next })
    }, [badgeTopOffset, update])
  const setBadgeBottomOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(badgeBottomOffset) : v
      update({ badgeBottomOffset: next, defaultBadgeBottomOffset: next })
    }, [badgeBottomOffset, update])
  const setLogoBottomOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(logoBottomOffset) : v
      update({ logoBottomOffset: next, defaultLogoBottomOffset: next })
    }, [logoBottomOffset, update])
  const setPreRelease = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(preRelease) : v
      update({ preRelease: next })
    }, [preRelease, update])
  const setRibbonSide = useCallback(
    (v: "left" | "right" | ((prev: "left" | "right") => "left" | "right")) => {
      const next = typeof v === "function" ? v(ribbonSide) : v
      update({ ribbonSide: next })
    }, [ribbonSide, update])
  // Regola di split corrente/default (vale per TUTTI i setter di questo file):
  // i setter dell'editor (setX) scrivono solo il valore corrente del poster
  // aperto, i setter delle Impostazioni (setDefaultX) solo il default globale.
  // I flussi automatici (apertura/selezione poster, slider del poster corrente)
  // non devono riscrivere il default salvato, altrimenti al rientro il default
  // risulta "cambiato da solo"; e cambiare un default non deve riscrivere il
  // poster aperto, altrimenti il salvataggio per-titolo non congela nulla.
  const setGradientHeight = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(gradientHeight) : v
      update({ gradientHeight: next })
    }, [gradientHeight, update])
  const setTopBadgeScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(topBadgeScale) : v
      update({ topBadgeScale: next })
    }, [topBadgeScale, update])
  const setTopBadgeOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(topBadgeOffsetX) : v
      update({ topBadgeOffsetX: next })
    }, [topBadgeOffsetX, update])
  const setTopBadgeOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(topBadgeOffsetY) : v
      update({ topBadgeOffsetY: next })
    }, [topBadgeOffsetY, update])
  const setGenreBadgeScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(genreBadgeScale) : v
      update({ genreBadgeScale: next })
    }, [genreBadgeScale, update])
  const setGenreBadgeOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(genreBadgeOffsetX) : v
      update({ genreBadgeOffsetX: next })
    }, [genreBadgeOffsetX, update])
  const setGenreBadgeOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(genreBadgeOffsetY) : v
      update({ genreBadgeOffsetY: next })
    }, [genreBadgeOffsetY, update])
  const setQualityBadgeScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(qualityBadgeScale) : v
      update({ qualityBadgeScale: next })
    }, [qualityBadgeScale, update])
  const setQualityBadgeOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(qualityBadgeOffsetX) : v
      update({ qualityBadgeOffsetX: next })
    }, [qualityBadgeOffsetX, update])
  const setQualityBadgeOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(qualityBadgeOffsetY) : v
      update({ qualityBadgeOffsetY: next })
    }, [qualityBadgeOffsetY, update])
  const setNetworkLogoScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(networkLogoScale) : v
      update({ networkLogoScale: next })
    }, [networkLogoScale, update])
  const setNetworkLogoOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(networkLogoOffsetX) : v
      update({ networkLogoOffsetX: next })
    }, [networkLogoOffsetX, update])
  const setNetworkLogoOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(networkLogoOffsetY) : v
      update({ networkLogoOffsetY: next })
    }, [networkLogoOffsetY, update])
  const setBlurIntensity = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(blurIntensity) : v
      update({ blurIntensity: next })
    }, [blurIntensity, update])
  const setTintStrength = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(tintStrength) : v
      update({ tintStrength: next })
    }, [tintStrength, update])
  const setBlurFade = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(blurFade) : v
      update({ blurFade: next })
    }, [blurFade, update])
  const setBlurDarkness = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(blurDarkness) : v
      update({ blurDarkness: next })
    }, [blurDarkness, update])
  const setBlurEnabled = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(blurEnabled) : v
      update({ blurEnabled: next })
    }, [blurEnabled, update])
  const setBadgeStyle = useCallback(
    (v: BadgeStyle | ((prev: BadgeStyle) => BadgeStyle)) => {
      const next = typeof v === "function" ? v(badgeStyle) : v
      update({ badgeStyle: next })
    }, [badgeStyle, update])
  const setRankingBadgeStyle = useCallback(
    (v: RankingBadgeStyle | ((prev: RankingBadgeStyle) => RankingBadgeStyle)) => {
      const next = typeof v === "function" ? v(rankingBadgeStyle) : v
      update({ rankingBadgeStyle: next })
    }, [rankingBadgeStyle, update])
  const setDefaultBadgeStyle = useCallback(
    (v: BadgeStyle | ((prev: BadgeStyle) => BadgeStyle)) => {
      const next = typeof v === "function" ? v(defaultBadgeStyle) : v
      update({ defaultBadgeStyle: next })
    }, [defaultBadgeStyle, update])
  const setDefaultRankingBadgeStyle = useCallback(
    (v: RankingBadgeStyle | ((prev: RankingBadgeStyle) => RankingBadgeStyle)) => {
      const next = typeof v === "function" ? v(defaultRankingBadgeStyle) : v
      update({ defaultRankingBadgeStyle: next })
    }, [defaultRankingBadgeStyle, update])
  const setDefaultBlurEnabled = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultBlurEnabled) : v
      update({ defaultBlurEnabled: next })
    }, [defaultBlurEnabled, update])
  const setDefaultBlurIntensity = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBlurIntensity) : v
      update({ defaultBlurIntensity: next })
    }, [defaultBlurIntensity, update])
  const setDefaultTintStrength = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTintStrength) : v
      update({ defaultTintStrength: next })
    }, [defaultTintStrength, update])
  const setDefaultBlurFade = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBlurFade) : v
      update({ defaultBlurFade: next })
    }, [defaultBlurFade, update])
  const setDefaultBlurDarkness = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBlurDarkness) : v
      update({ defaultBlurDarkness: next })
    }, [defaultBlurDarkness, update])
  const setDefaultGradientHeight = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultGradientHeight) : v
      update({ defaultGradientHeight: next })
    }, [defaultGradientHeight, update])
  const setDefaultTopBadgeScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTopBadgeScale) : v
      update({ defaultTopBadgeScale: next })
    }, [defaultTopBadgeScale, update])
  const setDefaultTopBadgeOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTopBadgeOffsetX) : v
      update({ defaultTopBadgeOffsetX: next })
    }, [defaultTopBadgeOffsetX, update])
  const setDefaultTopBadgeOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTopBadgeOffsetY) : v
      update({ defaultTopBadgeOffsetY: next })
    }, [defaultTopBadgeOffsetY, update])
  const setDefaultGenreBadgeScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultGenreBadgeScale) : v
      update({ defaultGenreBadgeScale: next })
    }, [defaultGenreBadgeScale, update])
  const setDefaultGenreBadgeOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultGenreBadgeOffsetX) : v
      update({ defaultGenreBadgeOffsetX: next })
    }, [defaultGenreBadgeOffsetX, update])
  const setDefaultGenreBadgeOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultGenreBadgeOffsetY) : v
      update({ defaultGenreBadgeOffsetY: next })
    }, [defaultGenreBadgeOffsetY, update])
  const setDefaultQualityBadgeScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultQualityBadgeScale) : v
      update({ defaultQualityBadgeScale: next })
    }, [defaultQualityBadgeScale, update])
  const setDefaultQualityBadgeOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultQualityBadgeOffsetX) : v
      update({ defaultQualityBadgeOffsetX: next })
    }, [defaultQualityBadgeOffsetX, update])
  const setDefaultQualityBadgeOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultQualityBadgeOffsetY) : v
      update({ defaultQualityBadgeOffsetY: next })
    }, [defaultQualityBadgeOffsetY, update])
  const setDefaultNetworkLogoScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultNetworkLogoScale) : v
      update({ defaultNetworkLogoScale: next })
    }, [defaultNetworkLogoScale, update])
  const setDefaultNetworkLogoOffsetX = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultNetworkLogoOffsetX) : v
      update({ defaultNetworkLogoOffsetX: next })
    }, [defaultNetworkLogoOffsetX, update])
  const setDefaultNetworkLogoOffsetY = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultNetworkLogoOffsetY) : v
      update({ defaultNetworkLogoOffsetY: next })
    }, [defaultNetworkLogoOffsetY, update])
  const setDefaultGlobalBadges = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultGlobalBadges) : v
      update({ defaultGlobalBadges: next })
    }, [defaultGlobalBadges, update])
  const setDefaultRankingBadges = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultRankingBadges) : v
      update({ defaultRankingBadges: next })
    }, [defaultRankingBadges, update])
  const setDefaultBadgeGenre = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultBadgeGenre) : v
      update({ defaultBadgeGenre: next })
    }, [defaultBadgeGenre, update])
  const setDefaultBadgeYear = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultBadgeYear) : v
      update({ defaultBadgeYear: next })
    }, [defaultBadgeYear, update])
  const setDefaultBadgeRating = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultBadgeRating) : v
      update({ defaultBadgeRating: next })
    }, [defaultBadgeRating, update])
  const setDefaultBadgeQuality = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultBadgeQuality) : v
      update({ defaultBadgeQuality: next })
    }, [defaultBadgeQuality, update])
  const setDefaultCustomRatings = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultCustomRatings) : v
      update({ defaultCustomRatings: next })
    }, [defaultCustomRatings, update])
  const setDefaultCustomRatingEndpoint = useCallback(
    (v: string | undefined | ((prev: string | undefined) => string | undefined)) => {
      const next = typeof v === "function" ? v(defaultCustomRatingEndpoint) : v
      update({ defaultCustomRatingEndpoint: next })
    }, [defaultCustomRatingEndpoint, update])
  const setDefaultCustomRatingApiKeyHeader = useCallback(
    (v: string | undefined | ((prev: string | undefined) => string | undefined)) => {
      const next = typeof v === "function" ? v(defaultCustomRatingApiKeyHeader) : v
      update({ defaultCustomRatingApiKeyHeader: next })
    }, [defaultCustomRatingApiKeyHeader, update])
  const setDefaultRatingSources = useCallback(
    (v: string[] | ((prev: string[]) => string[])) => {
      const next = typeof v === "function" ? v(defaultRatingSources) : v
      update({ defaultRatingSources: next })
    }, [defaultRatingSources, update])
  const setDefaultAutoRotateClean = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultAutoRotateClean) : v
      update({ defaultAutoRotateClean: next })
    }, [defaultAutoRotateClean, update])
  const setDefaultLogoFitEnabled = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultLogoFitEnabled) : v
      update({ defaultLogoFitEnabled: next })
    }, [defaultLogoFitEnabled, update])
  const setDefaultNetworkLogo = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultNetworkLogo) : v
      update({ defaultNetworkLogo: next })
    }, [defaultNetworkLogo, update])
  const setDefaultAccentDominant = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultAccentDominant) : v
      update({ defaultAccentDominant: next, accentDominant: next })
    }, [defaultAccentDominant, update])
  const setDefaultTextOpacity = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTextOpacity) : v
      update({ defaultTextOpacity: next, textOpacity: next })
    }, [defaultTextOpacity, update])
  const setDefaultTextShadowOpacity = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTextShadowOpacity) : v
      update({ defaultTextShadowOpacity: next, textShadowOpacity: next })
    }, [defaultTextShadowOpacity, update])
  const setDefaultTextShadowBlur = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTextShadowBlur) : v
      update({ defaultTextShadowBlur: next, textShadowBlur: next })
    }, [defaultTextShadowBlur, update])
  const setDefaultTextShadowOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultTextShadowOffset) : v
      update({ defaultTextShadowOffset: next, textShadowOffset: next })
    }, [defaultTextShadowOffset, update])
  const setDefaultRatingStar = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultRatingStar) : v
      update({ defaultRatingStar: next, ratingStar: next })
    }, [defaultRatingStar, update])
  const setDefaultAutoDarkText = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultAutoDarkText) : v
      update({ defaultAutoDarkText: next, autoDarkText: next })
    }, [defaultAutoDarkText, update])
  const setDefaultTextHalo = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultTextHalo) : v
      update({ defaultTextHalo: next, textHalo: next })
    }, [defaultTextHalo, update])
  const setDefaultBadgeTopScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBadgeTopScale) : v
      update({ defaultBadgeTopScale: next, badgeTopScale: next })
    }, [defaultBadgeTopScale, update])
  const setDefaultBadgeBottomScale = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBadgeBottomScale) : v
      update({ defaultBadgeBottomScale: next, badgeBottomScale: next })
    }, [defaultBadgeBottomScale, update])
  const setDefaultBadgeTopOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBadgeTopOffset) : v
      update({ defaultBadgeTopOffset: next, badgeTopOffset: next })
    }, [defaultBadgeTopOffset, update])
  const setDefaultBadgeBottomOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultBadgeBottomOffset) : v
      update({ defaultBadgeBottomOffset: next, badgeBottomOffset: next })
    }, [defaultBadgeBottomOffset, update])
  const setDefaultLogoBottomOffset = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(defaultLogoBottomOffset) : v
      update({ defaultLogoBottomOffset: next, logoBottomOffset: next })
    }, [defaultLogoBottomOffset, update])
  // Pre-release e lato del nastro sono GLOBALI: nessun override per-titolo, il
  // render li risolve da config token o default d'istanza. La copia "viva" non
  // può quindi congelare niente, e lasciarla indietro significava che spegnere
  // l'effetto dalle impostazioni non toglieva il nastro dall'anteprima aperta
  // (spariva solo dopo un reload). Si muovono insieme.
  const setDefaultPreRelease = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(defaultPreRelease) : v
      update({ defaultPreRelease: next, preRelease: next })
    }, [defaultPreRelease, update])
  const setDefaultRibbonSide = useCallback(
    (v: "left" | "right" | ((prev: "left" | "right") => "left" | "right")) => {
      const next = typeof v === "function" ? v(defaultRibbonSide) : v
      update({ defaultRibbonSide: next, ribbonSide: next })
    }, [defaultRibbonSide, update])
  const setEpisodeMetadataSource = useCallback(
    (v: "tmdb" | "tvdb" | ((prev: "tmdb" | "tvdb") => "tmdb" | "tvdb")) => {
      const next = typeof v === "function" ? v(episodeMetadataSource) : v
      update({ episodeMetadataSource: next })
    }, [episodeMetadataSource, update])
  const setDefaultEpisodeMetadataSource = useCallback(
    (v: "tmdb" | "tvdb" | ((prev: "tmdb" | "tvdb") => "tmdb" | "tvdb")) => {
      const next = typeof v === "function" ? v(defaultEpisodeMetadataSource) : v
      update({ defaultEpisodeMetadataSource: next })
    }, [defaultEpisodeMetadataSource, update])
  const setRegion = useCallback(
    (v: string | ((prev: string) => string)) => {
      const next = typeof v === "function" ? v(region) : v
      update({ region: next })
    }, [region, update])
  const setDefaultRegion = useCallback(
    (v: string | ((prev: string) => string)) => {
      const next = typeof v === "function" ? v(defaultRegion) : v
      update({ defaultRegion: next })
    }, [defaultRegion, update])

  const editorCtx = useMemo<PosterEditorCtx>(
    () => ({
      // Badges
      globalBadges,
      setGlobalBadges,
      rankingBadges,
      setRankingBadges,
      badgeGenre,
      setBadgeGenre,
      badgeYear,
      setBadgeYear,
      badgeRating,
      setBadgeRating,
      badgeQuality,
      setBadgeQuality,
      customRatings,
      setCustomRatings,
      ratingSources,
      setRatingSources,
      badgeStyle,
      setBadgeStyle,
      rankingBadgeStyle,
      setRankingBadgeStyle,
      customBadge,
      setCustomBadge,
      networkLogo,
      setNetworkLogo,
      preRelease, setPreRelease, accentDominant, setAccentDominant, textOpacity, setTextOpacity, textShadowOpacity, setTextShadowOpacity,
      textShadowBlur, setTextShadowBlur, textShadowOffset, setTextShadowOffset, ratingStar, setRatingStar, autoDarkText, setAutoDarkText, textHalo, setTextHalo, badgeTopScale, setBadgeTopScale,
      badgeBottomScale, setBadgeBottomScale, badgeTopOffset, setBadgeTopOffset, badgeBottomOffset, setBadgeBottomOffset, logoBottomOffset, setLogoBottomOffset,
      ribbonSide,
      setRibbonSide,
      episodeMetadataSource,
      setEpisodeMetadataSource,
      region,
      setRegion,

      // Defaults
      defaultBadgeStyle,
      setDefaultBadgeStyle,
      defaultRankingBadgeStyle,
      setDefaultRankingBadgeStyle,
      defaultEpisodeMetadataSource,
      setDefaultEpisodeMetadataSource,
      defaultBlurEnabled,
      setDefaultBlurEnabled,
      defaultBlurIntensity,
      setDefaultBlurIntensity,
      defaultTintStrength,
      setDefaultTintStrength,
      defaultBlurFade,
      setDefaultBlurFade,
      defaultBlurDarkness,
      setDefaultBlurDarkness,
      defaultGradientHeight,
      setDefaultGradientHeight,
      defaultTopBadgeScale,
      setDefaultTopBadgeScale,
      defaultTopBadgeOffsetX,
      setDefaultTopBadgeOffsetX,
      defaultTopBadgeOffsetY,
      setDefaultTopBadgeOffsetY,
      defaultGenreBadgeScale,
      setDefaultGenreBadgeScale,
      defaultGenreBadgeOffsetX,
      setDefaultGenreBadgeOffsetX,
      defaultGenreBadgeOffsetY,
      setDefaultGenreBadgeOffsetY,
      defaultQualityBadgeScale,
      setDefaultQualityBadgeScale,
      defaultQualityBadgeOffsetX,
      setDefaultQualityBadgeOffsetX,
      defaultQualityBadgeOffsetY,
      setDefaultQualityBadgeOffsetY,
      defaultNetworkLogoScale,
      setDefaultNetworkLogoScale,
      defaultNetworkLogoOffsetX,
      setDefaultNetworkLogoOffsetX,
      defaultNetworkLogoOffsetY,
      setDefaultNetworkLogoOffsetY,
      defaultGlobalBadges,
      setDefaultGlobalBadges,
      defaultRankingBadges,
      setDefaultRankingBadges,
      defaultBadgeGenre,
      setDefaultBadgeGenre,
      defaultBadgeYear,
      setDefaultBadgeYear,
      defaultBadgeRating,
      setDefaultBadgeRating,
      defaultBadgeQuality,
      setDefaultBadgeQuality,
      defaultCustomRatings,
      setDefaultCustomRatings,
      defaultCustomRatingEndpoint,
      setDefaultCustomRatingEndpoint,
      defaultCustomRatingApiKeyHeader,
      setDefaultCustomRatingApiKeyHeader,
      defaultRatingSources,
      setDefaultRatingSources,
      defaultAutoRotateClean,
      setDefaultAutoRotateClean,
      defaultLogoFitEnabled,
      setDefaultLogoFitEnabled,
      defaultNetworkLogo,
      defaultAccentDominant,
      setDefaultAccentDominant,
      defaultTextOpacity,
      setDefaultTextOpacity,
      defaultTextShadowOpacity,
      setDefaultTextShadowOpacity,
      defaultTextShadowBlur,
      setDefaultTextShadowBlur,
      defaultTextShadowOffset,
      setDefaultTextShadowOffset,
      defaultRatingStar,
      setDefaultRatingStar,
      defaultAutoDarkText,
      setDefaultAutoDarkText,
      defaultTextHalo,
      setDefaultTextHalo,
      defaultBadgeTopScale,
      setDefaultBadgeTopScale,
      defaultBadgeBottomScale,
      setDefaultBadgeBottomScale,
      defaultBadgeTopOffset,
      setDefaultBadgeTopOffset,
      defaultBadgeBottomOffset,
      setDefaultBadgeBottomOffset,
      defaultLogoBottomOffset,
      setDefaultLogoBottomOffset,
      setDefaultNetworkLogo,
      defaultPreRelease,
      setDefaultPreRelease,
      defaultRibbonSide,
      setDefaultRibbonSide,
      defaultRegion,
      setDefaultRegion,
      loadDefaultsToState,

      // Blur
      blurEnabled,
      setBlurEnabled,
      blurIntensity,
      setBlurIntensity,
      tintStrength,
      setTintStrength,
      blurFade,
      setBlurFade,
      blurDarkness,
      setBlurDarkness,

      // Gradient
      gradientHeight,
      setGradientHeight,

      // Badge superiore
      topBadgeScale,
      setTopBadgeScale,
      topBadgeOffsetX,
      setTopBadgeOffsetX,
      topBadgeOffsetY,
      setTopBadgeOffsetY,

      // Badge genere
      genreBadgeScale,
      setGenreBadgeScale,
      genreBadgeOffsetX,
      setGenreBadgeOffsetX,
      genreBadgeOffsetY,
      setGenreBadgeOffsetY,

      // Badge qualità
      qualityBadgeScale,
      setQualityBadgeScale,
      qualityBadgeOffsetX,
      setQualityBadgeOffsetX,
      qualityBadgeOffsetY,
      setQualityBadgeOffsetY,

      // Logo network
      networkLogoScale,
      setNetworkLogoScale,
      networkLogoOffsetX,
      setNetworkLogoOffsetX,
      networkLogoOffsetY,
      setNetworkLogoOffsetY,

      // Logo
      logoScale,
      setLogoScale,
      logoOffsetX,
      setLogoOffsetX,
      logoOffsetY,
      setLogoOffsetY,
      logoDisabled,
      setLogoDisabled,

      // Backdrop
      backdrops,
      setBackdrops,
      selectedBackdrop,
      setSelectedBackdrop,
      backdropScale,
      setBackdropScale,
      backdropOffsetX,
      setBackdropOffsetX,
      backdropOffsetY,
      setBackdropOffsetY,

      // Rotation
      rotationPosters,
      setRotationPosters,
      autoRotateClean,
      setAutoRotateClean,
      excludedPosters,
      setExcludedPosters,

      // Episode Group
      episodeGroupId,
      setEpisodeGroupId,
    }),
    [
      // Badges
      globalBadges, setGlobalBadges,
      rankingBadges, setRankingBadges,
      badgeGenre, setBadgeGenre,
      badgeYear, setBadgeYear,
      badgeRating, setBadgeRating,
      badgeQuality, setBadgeQuality,
      customRatings, setCustomRatings,
      ratingSources, setRatingSources,
      badgeStyle, setBadgeStyle,
      rankingBadgeStyle, setRankingBadgeStyle,
      customBadge, setCustomBadge,
      networkLogo, setNetworkLogo,
      preRelease, setPreRelease, accentDominant, setAccentDominant, badgeTopScale, setBadgeTopScale, badgeBottomScale, setBadgeBottomScale,
      badgeTopOffset, setBadgeTopOffset, badgeBottomOffset, setBadgeBottomOffset, logoBottomOffset, setLogoBottomOffset,
      textOpacity, setTextOpacity, textShadowOpacity, setTextShadowOpacity,
      textShadowBlur, setTextShadowBlur, textShadowOffset, setTextShadowOffset,
      ratingStar, setRatingStar,
      autoDarkText, setAutoDarkText,
      textHalo, setTextHalo,
      ribbonSide, setRibbonSide,
      episodeMetadataSource, setEpisodeMetadataSource,
      region, setRegion,
      defaultRegion, setDefaultRegion,

      // Defaults
      defaultBadgeStyle, setDefaultBadgeStyle,
      defaultRankingBadgeStyle, setDefaultRankingBadgeStyle,
      defaultEpisodeMetadataSource, setDefaultEpisodeMetadataSource,
      defaultBlurEnabled, setDefaultBlurEnabled,
      defaultBlurIntensity, setDefaultBlurIntensity,
      defaultTintStrength, setDefaultTintStrength,
      defaultBlurFade, setDefaultBlurFade,
      defaultBlurDarkness, setDefaultBlurDarkness,
      defaultGradientHeight, setDefaultGradientHeight,
      defaultTopBadgeScale, setDefaultTopBadgeScale,
      defaultTopBadgeOffsetX, setDefaultTopBadgeOffsetX,
      defaultTopBadgeOffsetY, setDefaultTopBadgeOffsetY,
      defaultGenreBadgeScale,
      setDefaultGenreBadgeScale,
      defaultGenreBadgeOffsetX,
      setDefaultGenreBadgeOffsetX,
      defaultGenreBadgeOffsetY,
      setDefaultGenreBadgeOffsetY,
      defaultQualityBadgeScale,
      setDefaultQualityBadgeScale,
      defaultQualityBadgeOffsetX,
      setDefaultQualityBadgeOffsetX,
      defaultQualityBadgeOffsetY,
      setDefaultQualityBadgeOffsetY,
      defaultNetworkLogoScale,
      setDefaultNetworkLogoScale,
      defaultNetworkLogoOffsetX,
      setDefaultNetworkLogoOffsetX,
      defaultNetworkLogoOffsetY,
      setDefaultNetworkLogoOffsetY,
      defaultGlobalBadges, setDefaultGlobalBadges,
      defaultRankingBadges, setDefaultRankingBadges,
      defaultBadgeGenre, setDefaultBadgeGenre,
      defaultBadgeYear, setDefaultBadgeYear,
      defaultBadgeRating, setDefaultBadgeRating,
      defaultBadgeQuality, setDefaultBadgeQuality,
      defaultCustomRatings, setDefaultCustomRatings,
      defaultCustomRatingEndpoint, setDefaultCustomRatingEndpoint,
      defaultCustomRatingApiKeyHeader, setDefaultCustomRatingApiKeyHeader,
      defaultRatingSources, setDefaultRatingSources,
      defaultAutoRotateClean, setDefaultAutoRotateClean,
      defaultLogoFitEnabled, setDefaultLogoFitEnabled,
      defaultNetworkLogo, setDefaultNetworkLogo,
      defaultPreRelease, setDefaultPreRelease, defaultAccentDominant, setDefaultAccentDominant, defaultTextOpacity, setDefaultTextOpacity, defaultTextShadowOpacity, setDefaultTextShadowOpacity,
      defaultTextShadowBlur, setDefaultTextShadowBlur, defaultTextShadowOffset, setDefaultTextShadowOffset, defaultRatingStar, setDefaultRatingStar, defaultAutoDarkText, setDefaultAutoDarkText, defaultTextHalo, setDefaultTextHalo, defaultBadgeTopScale, setDefaultBadgeTopScale,
      defaultBadgeBottomScale, setDefaultBadgeBottomScale, defaultBadgeTopOffset, setDefaultBadgeTopOffset, defaultBadgeBottomOffset, setDefaultBadgeBottomOffset, defaultLogoBottomOffset, setDefaultLogoBottomOffset,
      defaultRibbonSide, setDefaultRibbonSide,
      loadDefaultsToState,

      // Blur
      blurEnabled, setBlurEnabled,
      blurIntensity, setBlurIntensity,
      tintStrength, setTintStrength,
      blurFade, setBlurFade,
      blurDarkness, setBlurDarkness,

      // Gradient
      gradientHeight, setGradientHeight,

      // Badge superiore
      topBadgeScale, setTopBadgeScale,
      topBadgeOffsetX, setTopBadgeOffsetX,
      topBadgeOffsetY, setTopBadgeOffsetY,

      // Badge genere
      genreBadgeScale, setGenreBadgeScale,
      genreBadgeOffsetX, setGenreBadgeOffsetX,
      genreBadgeOffsetY, setGenreBadgeOffsetY,

      // Badge qualità
      qualityBadgeScale, setQualityBadgeScale,
      qualityBadgeOffsetX, setQualityBadgeOffsetX,
      qualityBadgeOffsetY, setQualityBadgeOffsetY,

      // Logo network
      networkLogoScale, setNetworkLogoScale,
      networkLogoOffsetX, setNetworkLogoOffsetX,
      networkLogoOffsetY, setNetworkLogoOffsetY,

      // Logo
      logoScale, setLogoScale,
      logoOffsetX, setLogoOffsetX,
      logoOffsetY, setLogoOffsetY,
      logoDisabled, setLogoDisabled,

      // Backdrop
      backdrops, setBackdrops,
      selectedBackdrop, setSelectedBackdrop,
      backdropScale, setBackdropScale,
      backdropOffsetX, setBackdropOffsetX,
      backdropOffsetY, setBackdropOffsetY,

      // Rotation
      rotationPosters, setRotationPosters,
      autoRotateClean, setAutoRotateClean,
      excludedPosters, setExcludedPosters,

      // Episode Group
      episodeGroupId, setEpisodeGroupId,
    ],
  )

  return <Ctx.Provider value={editorCtx}>{children}</Ctx.Provider>
}