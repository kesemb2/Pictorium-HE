import type { PosterEditorCtx } from "@/lib/contexts/PosterEditorContext"

function safeSetItem(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch { /* localStorage non disponibile */ }
}

/** Salva i default in localStorage e li sincronizza col server.
 *  Scrive SOLO i default: il poster eventualmente aperto non viene toccato
 *  (i suoi valori per-titolo restano congelati nel mapping al save).
 *  Ritorna `true` se il PUT /api/defaults è andato a buon fine, `false` se è
 *  fallito (rete, 401 admin fail-closed, 5xx): in quel caso i default D'ISTANZA
 *  usati dai poster dei cataloghi su Stremio restano quelli vecchi. */
export function saveDefaults(ed: PosterEditorCtx): Promise<boolean> {
  const d = {
    globalBadges: ed.defaultGlobalBadges,
    rankingBadges: ed.defaultRankingBadges,
    badgeGenre: ed.defaultBadgeGenre,
    badgeYear: ed.defaultBadgeYear,
    badgeRating: ed.defaultBadgeRating,
    badgeQuality: ed.defaultBadgeQuality,
    customRatings: ed.defaultCustomRatings,
    customRatingEndpoint: ed.defaultCustomRatingEndpoint ?? "",
    customRatingApiKeyHeader: ed.defaultCustomRatingApiKeyHeader ?? "",
    ratingSources: ed.defaultRatingSources,
    badgeStyle: ed.defaultBadgeStyle,
    rankingBadgeStyle: ed.defaultRankingBadgeStyle,
    blurEnabled: ed.defaultBlurEnabled,
    blurIntensity: ed.defaultBlurIntensity,
    blurFade: ed.defaultBlurFade,
    blurDarkness: ed.defaultBlurDarkness,
    tintStrength: ed.defaultTintStrength,
    gradientHeight: ed.defaultGradientHeight,
    topBadgeScale: ed.defaultTopBadgeScale,
    topBadgeOffsetX: ed.defaultTopBadgeOffsetX,
    topBadgeOffsetY: ed.defaultTopBadgeOffsetY,
    genreBadgeScale: ed.defaultGenreBadgeScale,
    qualityBadgeScale: ed.defaultQualityBadgeScale,
    networkLogoScale: ed.defaultNetworkLogoScale,
    genreBadgeOffsetX: ed.defaultGenreBadgeOffsetX,
    genreBadgeOffsetY: ed.defaultGenreBadgeOffsetY,
    qualityBadgeOffsetX: ed.defaultQualityBadgeOffsetX,
    qualityBadgeOffsetY: ed.defaultQualityBadgeOffsetY,
    networkLogoOffsetX: ed.defaultNetworkLogoOffsetX,
    networkLogoOffsetY: ed.defaultNetworkLogoOffsetY,
    // Controlli del fork: accent dominante, scale/offset di gruppo e
    // aspetto del testo bianco. Senza queste righe il salvataggio dei
    // default li lascerebbe indietro (il PUT torna 200 e i valori spariscono).
    accentDominant: ed.defaultAccentDominant,
    badgeTopScale: ed.defaultBadgeTopScale,
    badgeBottomScale: ed.defaultBadgeBottomScale,
    badgeTopOffset: ed.defaultBadgeTopOffset,
    badgeBottomOffset: ed.defaultBadgeBottomOffset,
    logoBottomOffset: ed.defaultLogoBottomOffset,
    textOpacity: ed.defaultTextOpacity,
    textShadowOpacity: ed.defaultTextShadowOpacity,
    textShadowBlur: ed.defaultTextShadowBlur,
    textShadowOffset: ed.defaultTextShadowOffset,
    ratingStar: ed.defaultRatingStar,
    autoDarkText: ed.defaultAutoDarkText,
    textHalo: ed.defaultTextHalo,
    autoRotateClean: ed.defaultAutoRotateClean,
    defaultLogoFitEnabled: ed.defaultLogoFitEnabled,
    defaultNetworkLogo: ed.defaultNetworkLogo,
    preRelease: ed.defaultPreRelease,
    defaultRibbonSide: ed.defaultRibbonSide,
    defaultEpisodeMetadataSource: ed.defaultEpisodeMetadataSource,
    region: ed.defaultRegion,
    networkLogo: ed.defaultNetworkLogo,
    ribbonSide: ed.defaultRibbonSide,
    episodeMetadataSource: ed.defaultEpisodeMetadataSource,
  }
  safeSetItem("badgeDefaults", JSON.stringify(d))
  const syncPromise = fetch("/api/defaults", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
    .then((res) => {
      if (res.ok) return true
      // 401 (admin fail-closed) / 403 origin / 5xx: il localStorage è salvato ma
      // i default D'ISTANZA no — e su Stremio i poster dei cataloghi usano quelli.
      // Ritorna false così il chiamante può avvisare l'utente del desync.
      console.warn(`[defaults] Failed to sync server defaults: HTTP ${res.status}`)
      return false
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[defaults] Failed to sync server defaults: ${message}`)
      return false
    })
  return syncPromise
}
