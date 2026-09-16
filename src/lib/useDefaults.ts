"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { BadgeStyle, RankingBadgeStyle } from "./badge-styles"
import { normalizeRegion } from "./regions"
import { shouldSkipServerSync } from "./guest-guard"
import { t } from "./i18n"

export type RibbonSide = "left" | "right"

export interface DefaultsState {
  defaultBadgeStyle: BadgeStyle
  defaultRankingBadgeStyle: RankingBadgeStyle
  defaultBlurEnabled: boolean
  defaultBlurIntensity: number
  defaultBlurFade: number
  defaultBlurDarkness: number
  /** Intensità tinta di scena di default 0-100 (default 20). */
  defaultTintStrength: number
  defaultGradientHeight: number
  defaultTopBadgeScale: number
  defaultTopBadgeOffsetX: number
  defaultTopBadgeOffsetY: number
  defaultGenreBadgeScale: number
  defaultQualityBadgeScale: number
  defaultNetworkLogoScale: number
  defaultGenreBadgeOffsetX: number
  defaultGenreBadgeOffsetY: number
  defaultQualityBadgeOffsetX: number
  defaultQualityBadgeOffsetY: number
  defaultNetworkLogoOffsetX: number
  defaultNetworkLogoOffsetY: number
  defaultGlobalBadges: boolean
  defaultRankingBadges: boolean
  /** Componenti del badge genere/rating di default (default tutti ON). */
  defaultBadgeGenre: boolean
  defaultBadgeYear: boolean
  defaultBadgeRating: boolean
  defaultBadgeQuality: boolean
  /** Riga rating custom provider di default (default ON). */
  defaultCustomRatings: boolean
  /** Endpoint provider custom rating salvato via UI (non-segreto). */
  defaultCustomRatingEndpoint?: string
  /** Header chiave provider salvato via UI. */
  defaultCustomRatingApiKeyHeader?: string
  defaultRatingSources: string[]
  defaultAutoRotateClean: boolean
  defaultLogoFitEnabled: boolean
  defaultNetworkLogo: boolean
  defaultAccentDominant: boolean
  defaultBadgeTopScale: number
  defaultBadgeBottomScale: number
  defaultTextOpacity: number
  defaultTextShadowOpacity: number
  defaultTextShadowBlur: number
  defaultTextShadowOffset: number
  defaultRatingStar: boolean
  defaultAutoDarkText: boolean
  defaultTextHalo: boolean
  defaultBadgeTopOffset: number
  defaultBadgeBottomOffset: number
  defaultLogoBottomOffset: number
  defaultPreRelease: boolean
  defaultRibbonSide: RibbonSide
  defaultEpisodeMetadataSource: "tmdb" | "tvdb"
  /** Regione classifiche (codice JW canonico, es. "IT"). */
  defaultRegion: string
  region: string
  globalBadges: boolean
  rankingBadges: boolean
  /** Componenti del badge genere/rating (default tutti ON). */
  badgeGenre: boolean
  badgeYear: boolean
  badgeRating: boolean
  badgeQuality: boolean
  /** Riga rating custom provider (default ON). */
  customRatings: boolean
  ratingSources: string[]
  networkLogo: boolean
  accentDominant: boolean
  badgeTopScale: number
  badgeBottomScale: number
  textOpacity: number
  textShadowOpacity: number
  textShadowBlur: number
  textShadowOffset: number
  ratingStar: boolean
  autoDarkText: boolean
  textHalo: boolean
  badgeTopOffset: number
  badgeBottomOffset: number
  logoBottomOffset: number
  preRelease: boolean
  ribbonSide: RibbonSide
  episodeMetadataSource: "tmdb" | "tvdb"
  gradientHeight: number
  topBadgeScale: number
  topBadgeOffsetX: number
  topBadgeOffsetY: number
  genreBadgeScale: number
  qualityBadgeScale: number
  networkLogoScale: number
  genreBadgeOffsetX: number
  genreBadgeOffsetY: number
  qualityBadgeOffsetX: number
  qualityBadgeOffsetY: number
  networkLogoOffsetX: number
  networkLogoOffsetY: number
  blurIntensity: number
  blurFade: number
  blurDarkness: number
  blurEnabled: boolean
  /** Intensità tinta di scena 0-100 (default 20). */
  tintStrength: number
  badgeStyle: BadgeStyle
  rankingBadgeStyle: RankingBadgeStyle
}

const DEFAULTS: DefaultsState = {
  defaultBadgeStyle: "shadow",
  defaultRankingBadgeStyle: "default",
  defaultBlurEnabled: true,
  defaultBlurIntensity: 20,
  defaultBlurFade: 50,
  defaultBlurDarkness: 30,
  defaultTintStrength: 20,
  defaultGradientHeight: 30,
  defaultTopBadgeScale: 100,
  defaultTopBadgeOffsetX: 0,
  defaultTopBadgeOffsetY: 0,
  defaultGenreBadgeScale: 100,
  defaultQualityBadgeScale: 100,
  defaultNetworkLogoScale: 100,
  defaultGenreBadgeOffsetX: 0,
  defaultGenreBadgeOffsetY: 0,
  defaultQualityBadgeOffsetX: 0,
  defaultQualityBadgeOffsetY: 0,
  defaultNetworkLogoOffsetX: 0,
  defaultNetworkLogoOffsetY: 0,
  defaultGlobalBadges: true,
  defaultRankingBadges: true,
  defaultBadgeGenre: true,
  defaultBadgeYear: true,
  defaultBadgeRating: true,
  defaultBadgeQuality: true,
  defaultCustomRatings: true,
  defaultRatingSources: ["imdb", "tmdb"],
  defaultAutoRotateClean: false,
  defaultLogoFitEnabled: true,
  defaultNetworkLogo: true,
  defaultAccentDominant: true,
  defaultBadgeTopScale: 100,
  defaultBadgeBottomScale: 100,
  defaultTextOpacity: 100,
  defaultTextShadowOpacity: 100,
  defaultTextShadowBlur: 100,
  defaultTextShadowOffset: 100,
  defaultRatingStar: true,
  defaultAutoDarkText: true,
  defaultTextHalo: true,
  defaultBadgeTopOffset: 0,
  defaultBadgeBottomOffset: 0,
  defaultLogoBottomOffset: 0,
  defaultPreRelease: false,
  defaultRibbonSide: "left",
  defaultEpisodeMetadataSource: "tmdb",
  defaultRegion: "IT",
  region: "IT",
  globalBadges: true,
  rankingBadges: true,
  badgeGenre: true,
  badgeYear: true,
  badgeRating: true,
  badgeQuality: true,
  customRatings: true,
  ratingSources: ["imdb", "tmdb"],
  networkLogo: true,
  accentDominant: true,
  badgeTopScale: 100,
  badgeBottomScale: 100,
  textOpacity: 100,
  textShadowOpacity: 100,
  textShadowBlur: 100,
  textShadowOffset: 100,
  ratingStar: true,
  autoDarkText: true,
  textHalo: true,
  badgeTopOffset: 0,
  badgeBottomOffset: 0,
  logoBottomOffset: 0,
  preRelease: false,
  ribbonSide: "left",
  episodeMetadataSource: "tmdb",
  gradientHeight: 30,
  topBadgeScale: 100,
  topBadgeOffsetX: 0,
  topBadgeOffsetY: 0,
  genreBadgeScale: 100,
  qualityBadgeScale: 100,
  networkLogoScale: 100,
  genreBadgeOffsetX: 0,
  genreBadgeOffsetY: 0,
  qualityBadgeOffsetX: 0,
  qualityBadgeOffsetY: 0,
  networkLogoOffsetX: 0,
  networkLogoOffsetY: 0,
  blurIntensity: 20,
  blurFade: 50,
  blurDarkness: 30,
  blurEnabled: true,
  tintStrength: 20,
  badgeStyle: "shadow",
  rankingBadgeStyle: "default",
}

interface StoredDefaults {
  globalBadges?: boolean
  rankingBadges?: boolean
  badgeGenre?: boolean
  badgeYear?: boolean
  badgeRating?: boolean
  badgeQuality?: boolean
  customRatings?: boolean
  networkLogo?: boolean
  accentDominant?: boolean
  defaultAccentDominant?: boolean
  badgeTopScale?: number
  defaultBadgeTopScale?: number
  badgeBottomScale?: number
  defaultBadgeBottomScale?: number
  textOpacity?: number
  defaultTextOpacity?: number
  textShadowOpacity?: number
  defaultTextShadowOpacity?: number
  textShadowBlur?: number
  defaultTextShadowBlur?: number
  textShadowOffset?: number
  defaultTextShadowOffset?: number
  ratingStar?: boolean
  autoDarkText?: boolean
  textHalo?: boolean
  defaultRatingStar?: boolean
  defaultAutoDarkText?: boolean
  defaultTextHalo?: boolean
  badgeTopOffset?: number
  defaultBadgeTopOffset?: number
  badgeBottomOffset?: number
  defaultBadgeBottomOffset?: number
  logoBottomOffset?: number
  defaultLogoBottomOffset?: number
  gradientHeight?: number
  topBadgeScale?: number
  topBadgeOffsetX?: number
  topBadgeOffsetY?: number
  genreBadgeScale?: number
  qualityBadgeScale?: number
  networkLogoScale?: number
  genreBadgeOffsetX?: number
  genreBadgeOffsetY?: number
  qualityBadgeOffsetX?: number
  qualityBadgeOffsetY?: number
  networkLogoOffsetX?: number
  networkLogoOffsetY?: number
  blurIntensity?: number
  blurFade?: number
  blurDarkness?: number
  blurEnabled?: boolean
  tintStrength?: number
  badgeStyle?: BadgeStyle
  rankingBadgeStyle?: RankingBadgeStyle
  defaultBadgeStyle?: BadgeStyle
  defaultRankingBadgeStyle?: RankingBadgeStyle
  defaultBlurEnabled?: boolean
  defaultBlurIntensity?: number
  defaultBlurFade?: number
  defaultBlurDarkness?: number
  defaultTintStrength?: number
  defaultGradientHeight?: number
  defaultTopBadgeScale?: number
  defaultTopBadgeOffsetX?: number
  defaultTopBadgeOffsetY?: number
  defaultGenreBadgeScale?: number
  defaultQualityBadgeScale?: number
  defaultNetworkLogoScale?: number
  defaultGenreBadgeOffsetX?: number
  defaultGenreBadgeOffsetY?: number
  defaultQualityBadgeOffsetX?: number
  defaultQualityBadgeOffsetY?: number
  defaultNetworkLogoOffsetX?: number
  defaultNetworkLogoOffsetY?: number
  defaultGlobalBadges?: boolean
  defaultRankingBadges?: boolean
  defaultBadgeGenre?: boolean
  defaultBadgeYear?: boolean
  defaultBadgeRating?: boolean
  defaultBadgeQuality?: boolean
  defaultCustomRatings?: boolean
  defaultCustomRatingEndpoint?: string
  defaultCustomRatingApiKeyHeader?: string
  customRatingEndpoint?: string
  customRatingApiKeyHeader?: string
  defaultRatingSources?: string[]
  ratingSources?: string[]
  defaultAutoRotateClean?: boolean
  defaultLogoFitEnabled?: boolean
  defaultNetworkLogo?: boolean
  defaultPreRelease?: boolean
  preRelease?: boolean
  defaultRibbonSide?: RibbonSide
  ribbonSide?: RibbonSide
  defaultEpisodeMetadataSource?: "tmdb" | "tvdb"
  episodeMetadataSource?: "tmdb" | "tvdb"
  defaultRegion?: string
  region?: string
  autoRotateClean?: boolean
}

function readStoredDefaults(): StoredDefaults | null {
  if (typeof window === "undefined" || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem("badgeDefaults")
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[defaults] Failed to read local defaults: ${message}`)
    return null
  }
}

function safeSetItem(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch { /* localStorage non disponibile */ }
}

function buildFromStored(d: StoredDefaults | null): DefaultsState {
  if (!d) return { ...DEFAULTS }
  return {
    defaultBadgeStyle: d.defaultBadgeStyle ?? d.badgeStyle ?? "shadow",
    defaultRankingBadgeStyle: d.defaultRankingBadgeStyle ?? d.rankingBadgeStyle ?? "default",
    defaultBlurEnabled: d.defaultBlurEnabled ?? d.blurEnabled ?? true,
    defaultBlurIntensity: d.defaultBlurIntensity ?? d.blurIntensity ?? 20,
    defaultBlurFade: d.defaultBlurFade ?? d.blurFade ?? 50,
    defaultBlurDarkness: d.defaultBlurDarkness ?? d.blurDarkness ?? 30,
    defaultTintStrength: d.defaultTintStrength ?? d.tintStrength ?? 20,
    defaultGradientHeight: d.defaultGradientHeight ?? d.gradientHeight ?? 30,
    defaultTopBadgeScale: d.defaultTopBadgeScale ?? d.topBadgeScale ?? 100,
    defaultTopBadgeOffsetX: d.defaultTopBadgeOffsetX ?? d.topBadgeOffsetX ?? 0,
    defaultTopBadgeOffsetY: d.defaultTopBadgeOffsetY ?? d.topBadgeOffsetY ?? 0,
    defaultGenreBadgeScale: d.defaultGenreBadgeScale ?? d.genreBadgeScale ?? 100,
    defaultQualityBadgeScale: d.defaultQualityBadgeScale ?? d.qualityBadgeScale ?? 100,
    defaultNetworkLogoScale: d.defaultNetworkLogoScale ?? d.networkLogoScale ?? 100,
    defaultGenreBadgeOffsetX: d.defaultGenreBadgeOffsetX ?? d.genreBadgeOffsetX ?? 0,
    defaultGenreBadgeOffsetY: d.defaultGenreBadgeOffsetY ?? d.genreBadgeOffsetY ?? 0,
    defaultQualityBadgeOffsetX: d.defaultQualityBadgeOffsetX ?? d.qualityBadgeOffsetX ?? 0,
    defaultQualityBadgeOffsetY: d.defaultQualityBadgeOffsetY ?? d.qualityBadgeOffsetY ?? 0,
    defaultNetworkLogoOffsetX: d.defaultNetworkLogoOffsetX ?? d.networkLogoOffsetX ?? 0,
    defaultNetworkLogoOffsetY: d.defaultNetworkLogoOffsetY ?? d.networkLogoOffsetY ?? 0,
    defaultGlobalBadges: d.defaultGlobalBadges ?? d.globalBadges ?? true,
    defaultRankingBadges: d.defaultRankingBadges ?? d.rankingBadges ?? true,
    defaultBadgeGenre: d.defaultBadgeGenre ?? d.badgeGenre ?? true,
    defaultBadgeYear: d.defaultBadgeYear ?? d.badgeYear ?? true,
    defaultBadgeRating: d.defaultBadgeRating ?? d.badgeRating ?? true,
    defaultBadgeQuality: d.defaultBadgeQuality ?? d.badgeQuality ?? true,
    defaultCustomRatings: d.defaultCustomRatings ?? d.customRatings ?? true,
    defaultCustomRatingEndpoint: d.defaultCustomRatingEndpoint ?? d.customRatingEndpoint,
    defaultCustomRatingApiKeyHeader: d.defaultCustomRatingApiKeyHeader ?? d.customRatingApiKeyHeader,
    defaultRatingSources: d.defaultRatingSources ?? d.ratingSources ?? ["imdb", "tmdb"],
    defaultAutoRotateClean: d.defaultAutoRotateClean ?? d.autoRotateClean ?? false,
    defaultLogoFitEnabled: d.defaultLogoFitEnabled ?? true,
    defaultNetworkLogo: d.defaultNetworkLogo ?? d.networkLogo ?? true,
    defaultAccentDominant: d.defaultAccentDominant ?? d.accentDominant ?? true,
    defaultBadgeTopScale: d.defaultBadgeTopScale ?? d.badgeTopScale ?? 100,
    defaultBadgeBottomScale: d.defaultBadgeBottomScale ?? d.badgeBottomScale ?? 100,
    defaultTextOpacity: d.defaultTextOpacity ?? d.textOpacity ?? 100,
    defaultTextShadowOpacity: d.defaultTextShadowOpacity ?? d.textShadowOpacity ?? 100,
    defaultTextShadowBlur: d.defaultTextShadowBlur ?? d.textShadowBlur ?? 100,
    defaultTextShadowOffset: d.defaultTextShadowOffset ?? d.textShadowOffset ?? 100,
    defaultRatingStar: d.defaultRatingStar ?? d.ratingStar ?? true,
    defaultAutoDarkText: d.defaultAutoDarkText ?? d.autoDarkText ?? true,
    defaultTextHalo: d.defaultTextHalo ?? d.textHalo ?? true,
    defaultBadgeTopOffset: d.defaultBadgeTopOffset ?? d.badgeTopOffset ?? 0,
    defaultBadgeBottomOffset: d.defaultBadgeBottomOffset ?? d.badgeBottomOffset ?? 0,
    defaultLogoBottomOffset: d.defaultLogoBottomOffset ?? d.logoBottomOffset ?? 0,
    defaultPreRelease: d.defaultPreRelease ?? d.preRelease ?? false,
    defaultRibbonSide: d.defaultRibbonSide ?? d.ribbonSide ?? "left",
    defaultEpisodeMetadataSource: d.defaultEpisodeMetadataSource ?? d.episodeMetadataSource ?? "tmdb",
    defaultRegion: normalizeRegion(d.defaultRegion ?? d.region),
    region: normalizeRegion(d.region ?? d.defaultRegion),
    globalBadges: d.globalBadges ?? d.defaultGlobalBadges ?? true,
    rankingBadges: d.rankingBadges ?? d.defaultRankingBadges ?? true,
    badgeGenre: d.badgeGenre ?? d.defaultBadgeGenre ?? true,
    badgeYear: d.badgeYear ?? d.defaultBadgeYear ?? true,
    badgeRating: d.badgeRating ?? d.defaultBadgeRating ?? true,
    badgeQuality: d.badgeQuality ?? d.defaultBadgeQuality ?? true,
    customRatings: d.customRatings ?? d.defaultCustomRatings ?? true,
    ratingSources: d.ratingSources ?? d.defaultRatingSources ?? ["imdb", "tmdb"],
    networkLogo: d.networkLogo ?? d.defaultNetworkLogo ?? true,
    accentDominant: d.accentDominant ?? d.defaultAccentDominant ?? true,
    badgeTopScale: d.badgeTopScale ?? d.defaultBadgeTopScale ?? 100,
    badgeBottomScale: d.badgeBottomScale ?? d.defaultBadgeBottomScale ?? 100,
    textOpacity: d.textOpacity ?? d.defaultTextOpacity ?? 100,
    textShadowOpacity: d.textShadowOpacity ?? d.defaultTextShadowOpacity ?? 100,
    textShadowBlur: d.textShadowBlur ?? d.defaultTextShadowBlur ?? 100,
    textShadowOffset: d.textShadowOffset ?? d.defaultTextShadowOffset ?? 100,
    ratingStar: d.ratingStar ?? d.defaultRatingStar ?? true,
    autoDarkText: d.autoDarkText ?? d.defaultAutoDarkText ?? true,
    textHalo: d.textHalo ?? d.defaultTextHalo ?? true,
    badgeTopOffset: d.badgeTopOffset ?? d.defaultBadgeTopOffset ?? 0,
    badgeBottomOffset: d.badgeBottomOffset ?? d.defaultBadgeBottomOffset ?? 0,
    logoBottomOffset: d.logoBottomOffset ?? d.defaultLogoBottomOffset ?? 0,
    preRelease: d.preRelease ?? d.defaultPreRelease ?? false,
    ribbonSide: d.ribbonSide ?? d.defaultRibbonSide ?? "left",
    episodeMetadataSource: d.episodeMetadataSource ?? d.defaultEpisodeMetadataSource ?? "tmdb",
    gradientHeight: d.gradientHeight ?? d.defaultGradientHeight ?? 30,
    topBadgeScale: d.topBadgeScale ?? d.defaultTopBadgeScale ?? 100,
    topBadgeOffsetX: d.topBadgeOffsetX ?? d.defaultTopBadgeOffsetX ?? 0,
    topBadgeOffsetY: d.topBadgeOffsetY ?? d.defaultTopBadgeOffsetY ?? 0,
    genreBadgeScale: d.genreBadgeScale ?? d.defaultGenreBadgeScale ?? 100,
    qualityBadgeScale: d.qualityBadgeScale ?? d.defaultQualityBadgeScale ?? 100,
    networkLogoScale: d.networkLogoScale ?? d.defaultNetworkLogoScale ?? 100,
    genreBadgeOffsetX: d.genreBadgeOffsetX ?? d.defaultGenreBadgeOffsetX ?? 0,
    genreBadgeOffsetY: d.genreBadgeOffsetY ?? d.defaultGenreBadgeOffsetY ?? 0,
    qualityBadgeOffsetX: d.qualityBadgeOffsetX ?? d.defaultQualityBadgeOffsetX ?? 0,
    qualityBadgeOffsetY: d.qualityBadgeOffsetY ?? d.defaultQualityBadgeOffsetY ?? 0,
    networkLogoOffsetX: d.networkLogoOffsetX ?? d.defaultNetworkLogoOffsetX ?? 0,
    networkLogoOffsetY: d.networkLogoOffsetY ?? d.defaultNetworkLogoOffsetY ?? 0,
    blurIntensity: d.blurIntensity ?? d.defaultBlurIntensity ?? 20,
    blurFade: d.blurFade ?? d.defaultBlurFade ?? 50,
    blurDarkness: d.blurDarkness ?? d.defaultBlurDarkness ?? 30,
    blurEnabled: d.blurEnabled ?? d.defaultBlurEnabled ?? true,
    tintStrength: d.tintStrength ?? d.defaultTintStrength ?? 20,
    badgeStyle: d.badgeStyle ?? d.defaultBadgeStyle ?? "shadow",
    rankingBadgeStyle: d.rankingBadgeStyle ?? d.defaultRankingBadgeStyle ?? "default",
  }
}

/**
 * Payload dei SOLI default persistiti — allineato allo schema server
 * (`defaultsSchema` in `/api/defaults`) e allo shape scritto da `saveDefaults`.
 * Non include i valori "corrente" (globalBadges, badgeStyle…) che dipendono
 * dal poster in editing.
 */
function defaultsToPayload(d: DefaultsState): Record<string, unknown> {
  return {
    badgeStyle: d.defaultBadgeStyle,
    rankingBadgeStyle: d.defaultRankingBadgeStyle,
    blurEnabled: d.defaultBlurEnabled,
    blurIntensity: d.defaultBlurIntensity,
    blurFade: d.defaultBlurFade,
    blurDarkness: d.defaultBlurDarkness,
    tintStrength: d.defaultTintStrength,
    gradientHeight: d.defaultGradientHeight,
    topBadgeScale: d.defaultTopBadgeScale,
    topBadgeOffsetX: d.defaultTopBadgeOffsetX,
    topBadgeOffsetY: d.defaultTopBadgeOffsetY,
    genreBadgeScale: d.defaultGenreBadgeScale,
    qualityBadgeScale: d.defaultQualityBadgeScale,
    networkLogoScale: d.defaultNetworkLogoScale,
    genreBadgeOffsetX: d.defaultGenreBadgeOffsetX,
    genreBadgeOffsetY: d.defaultGenreBadgeOffsetY,
    qualityBadgeOffsetX: d.defaultQualityBadgeOffsetX,
    qualityBadgeOffsetY: d.defaultQualityBadgeOffsetY,
    networkLogoOffsetX: d.defaultNetworkLogoOffsetX,
    networkLogoOffsetY: d.defaultNetworkLogoOffsetY,
    globalBadges: d.defaultGlobalBadges,
    rankingBadges: d.defaultRankingBadges,
    badgeGenre: d.defaultBadgeGenre,
    badgeYear: d.defaultBadgeYear,
    badgeRating: d.defaultBadgeRating,
    badgeQuality: d.defaultBadgeQuality,
    customRatings: d.defaultCustomRatings,
    customRatingEndpoint: d.defaultCustomRatingEndpoint ?? "",
    customRatingApiKeyHeader: d.defaultCustomRatingApiKeyHeader ?? "",
    ratingSources: d.defaultRatingSources,
    autoRotateClean: d.defaultAutoRotateClean,
    defaultLogoFitEnabled: d.defaultLogoFitEnabled,
    networkLogo: d.defaultNetworkLogo,
    accentDominant: d.defaultAccentDominant,
    badgeTopScale: d.defaultBadgeTopScale,
    badgeBottomScale: d.defaultBadgeBottomScale,
    textOpacity: d.defaultTextOpacity,
    textShadowOpacity: d.defaultTextShadowOpacity,
    textShadowBlur: d.defaultTextShadowBlur,
    textShadowOffset: d.defaultTextShadowOffset,
    ratingStar: d.defaultRatingStar,
    autoDarkText: d.defaultAutoDarkText,
    textHalo: d.defaultTextHalo,
    badgeTopOffset: d.defaultBadgeTopOffset,
    badgeBottomOffset: d.defaultBadgeBottomOffset,
    logoBottomOffset: d.defaultLogoBottomOffset,
    preRelease: d.defaultPreRelease,
    ribbonSide: d.defaultRibbonSide,
    episodeMetadataSource: d.defaultEpisodeMetadataSource,
    region: d.defaultRegion,
  }
}

export function useDefaults() {
  // Stato iniziale deterministico (DEFAULTS): la lettura di localStorage è rimandata
  // al mount via useEffect. Durante la SSR `window` non esiste (readStoredDefaults
  // torna null) quindi l'HTML server usa i default; leggere lo storage nell'initializer
  // di useState avrebbe prodotto un hydration mismatch con l'HTML renderizzato dal server.
  const [state, setState] = useState<DefaultsState>(() => ({ ...DEFAULTS }))

  // Gate anti-clobber: l'effect di auto-persist sotto gira nello stesso commit
  // del caricamento con `state` ancora ai factory — senza gate sovrascriverebbe
  // localStorage (e poi il server via PUT) con i factory. In dev StrictMode
  // rimonta due volte e il secondo mount leggeva lo storage già avvelenato,
  // consolidando i factory al rientro ("le impostazioni non si salvano").
  // Il gate resta chiuso finché il load non conferma l'idratazione.
  const [hydrated, setHydrated] = useState(false)

  // Ref di dedup per l'auto-persist: primato durante l'hydration con il payload appena
  // caricato, così il primo run dell'effetto di sync trova payload identico e non scrive.
  const lastPersistRef = useRef<string>("")

  useEffect(() => {
    const stored = readStoredDefaults()
    const hydratedState = buildFromStored(stored)
    setState(hydratedState)
    lastPersistRef.current = JSON.stringify(defaultsToPayload(hydratedState))
    setHydrated(true)

    fetch("/api/defaults")
      .then((r) => (r.ok ? r.json() : null))
      .then((serverData) => {
        if (!serverData) return
        const currentStored = readStoredDefaults()
        const merged: StoredDefaults = {
          ...(serverData || {}),
          ...(currentStored || {}),
        }
        if (!currentStored?.episodeMetadataSource && !currentStored?.defaultEpisodeMetadataSource && serverData.episodeMetadataSource) {
          merged.defaultEpisodeMetadataSource = serverData.episodeMetadataSource
          merged.episodeMetadataSource = serverData.episodeMetadataSource
        }
        if (!currentStored?.ratingSources && !currentStored?.defaultRatingSources && Array.isArray(serverData.ratingSources)) {
          merged.defaultRatingSources = serverData.ratingSources
          merged.ratingSources = serverData.ratingSources
        }
        const updated = buildFromStored(merged)
        setState(updated)
        lastPersistRef.current = JSON.stringify(defaultsToPayload(updated))
        safeSetItem("badgeDefaults", JSON.stringify(defaultsToPayload(updated)))
      })
      .catch(() => {})
  }, [])

  // Auto-persist: ogni cambio dei default scrive SUBITO su localStorage
  // e tenta il sync server (/api/defaults). Dedup via payload string — se cambiano
  // solo i valori "corrente" il payload resta identico e non viene riscritta.
  // Il gate `hydrated` blocca il run del primo commit (state ancora factory).
  useEffect(() => {
    if (!hydrated) return
    const payload = defaultsToPayload(state)
    const payloadStr = JSON.stringify(payload)
    if (lastPersistRef.current === payloadStr) return
    lastPersistRef.current = payloadStr

    // Scrittura immediata e sincrona in localStorage ad ogni cambio
    safeSetItem("badgeDefaults", payloadStr)

    const timer = setTimeout(() => {
      // Guest guard: ospite da link altrui senza sessione su istanza con PIN
      // → resta tutto locale, mai sovrascrivere i default del proprietario
      // (es. cambio lingua che sposta la regione). Come sul 401: ref azzerato
      // così un cambio successivo (es. dopo il login) riprova il sync.
      void shouldSkipServerSync().then((skip) => {
        if (skip) {
          lastPersistRef.current = ""
          console.debug("[defaults] Server sync skipped (guest without session)")
          return
        }
        fetch("/api/defaults", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payloadStr,
        })
        .then((res) => {
          if (res.ok) return
          // 401 (admin fail-closed), 403 origin, 5xx persist: il client crede di
          // aver salvato (localStorage) ma i default d'istanza restano vecchi —
          // e su Stremio i poster dei cataloghi usano QUELLI. Segnala il desync.
          lastPersistRef.current = ""
          console.warn(`[defaults] Auto-sync failed: HTTP ${res.status}`)
          void import("sonner").then(({ toast }) =>
            toast.warning(t("ui.defaultsSyncFailed")),
          )
        })
        .catch((error: unknown) => {
          // Se il PUT fallisce (rete, serverless cold start) resetta il ref
          // così un successivo cambio di default riprova invece di considerare "sincronizzato".
          lastPersistRef.current = ""
          const message = error instanceof Error ? error.message : String(error)
          console.warn(`[defaults] Auto-sync failed: ${message}`)
          void import("sonner").then(({ toast }) =>
            toast.warning(t("ui.defaultsSyncFailed")),
          )
        })
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [state, hydrated])

  const update = useCallback((patch: Partial<DefaultsState>) => {
    setState((prev) => ({ ...prev, ...patch }))
  }, [])

  const loadDefaultsToState = useCallback(() => {
    const stored = readStoredDefaults()
    setState(buildFromStored(stored))
    lastPersistRef.current = JSON.stringify(defaultsToPayload(buildFromStored(stored)))
  }, [])

  return { ...state, update, loadDefaultsToState }
}
