import type { TMDBImage } from "./types"

/**
 * Selects the best logo from a list based on language preference.
 *
 * Priority (descending):
 *   1. Preferred language (`lang`)
 *   2. English ("en")
 *   3. Original language of the content (`origLang`)
 *   4. Any first available logo
 *
 * L'italiano stava al secondo posto per ogni lingua: un utente ebraico (o
 * giapponese, o coreano) senza logo nella propria lingua riceveva il logo
 * italiano prima di quello inglese. Ora l'italiano non è più privilegiato —
 * per `lang === "it"` il tier 1 lo copre già e l'ordine resta identico a prima.
 *
 * Returns `undefined` when `logos` is empty.
 */
export function selectBestLogo(
  logos: TMDBImage[],
  lang: string,
  origLang?: string | null,
): TMDBImage | undefined {
  return selectLogoTier(logos, lang, origLang)[0]
}

/**
 * Il livello di lingua vincente, come LISTA anziché come singolo logo.
 *
 * La lingua decide da sola quale gruppo si usa — è la regola che vogliamo,
 * altrimenti un logo nella lingua giusta perderebbe contro uno inglese solo
 * perché contrasta meglio. Ma dentro un gruppo l'ordine di TMDB è arbitrario,
 * e lì la leggibilità può decidere: da qui `pickReadableLogo`.
 *
 * Ritorna una lista vuota quando non c'è nessun logo.
 */
export function selectLogoTier(
  logos: TMDBImage[],
  lang: string,
  origLang?: string | null,
): TMDBImage[] {
  if (logos.length === 0) return []
  const tier = (code: string | null) => logos.filter((l) => l.iso_639_1 === code)
  const langTier = tier(lang)
  if (langTier.length > 0) return langTier
  const enTier = lang !== "en" ? tier("en") : []
  if (enTier.length > 0) return enTier
  const origTier = origLang && origLang !== lang ? tier(origLang) : []
  if (origTier.length > 0) return origTier
  return logos
}

/**
 * Sceglie, DENTRO un livello di lingua già deciso, il logo che si legge meglio
 * sul poster. `score` ritorna il contrasto misurato; un candidato che non si
 * riesce a misurare non vince per caso, perché il primo resta il riferimento.
 */
export async function pickReadableLogo(
  tier: TMDBImage[],
  score: (logo: TMDBImage) => Promise<number | null>,
): Promise<TMDBImage | undefined> {
  if (tier.length === 0) return undefined
  if (tier.length === 1) return tier[0]
  let best = tier[0]
  let bestScore = (await score(tier[0])) ?? -Infinity
  for (const candidate of tier.slice(1)) {
    const s = await score(candidate)
    if (s !== null && s > bestScore) {
      best = candidate
      bestScore = s
    }
  }
  return best
}

/**
 * Returns a string describing which fallback tier was used, for logging.
 * Returns null when the selected logo is an exact match for `lang`.
 */
export function logoBestLogoFallbackReason(
  selected: TMDBImage | undefined,
  lang: string,
  origLang?: string | null,
): "origLang" | "any" | "none" | null {
  if (!selected) return "none"
  if (selected.iso_639_1 === lang) return null
  if (origLang && selected.iso_639_1 === origLang) return "origLang"
  if (selected.iso_639_1 === "en") return null
  return "any"
}

/**
 * Seleziona il miglior logo e, quando il match non è esatto, emette un warning
 * tramite `warn`. Unisce selectBestLogo + logoBestLogoFallbackReason + i
 * tre rami di warn che prima erano duplicati nei due rami di openPosterBrowser
 * (mapping esistente vs item nuovo).
 */
export function autoLogoSelection(
  logos: TMDBImage[] | undefined,
  lang: string,
  origLang: string | null | undefined,
  itemLabel: string,
  warn: (msg: string) => void = (msg) => console.warn(`[pictorium] ${msg}`),
): TMDBImage | undefined {
  const autoLogo = selectBestLogo(logos || [], lang, origLang)
  const reason = logoBestLogoFallbackReason(autoLogo, lang, origLang)
  if (reason === "origLang") warn(`Logo fallback to original_language "${origLang}" for ${itemLabel}`)
  else if (reason === "any") warn(`Logo fallback to any (first available) for ${itemLabel}`)
  else if (reason === "none") warn(`No logo available for ${itemLabel}`)
  return autoLogo
}

/**
 * Scala di default del logo (in %) data la sua proporzione: curva sublineare
 * `37.5 * aspect^(2/3)` con cap a 75%. La vecchia lineare `37.5 * aspect`
 * saturava al cap per QUALSIASI logo più largo di 2:1 (tutti i wordmark
 * panoramici uscivano identici a 75); la potenza differenzia i larghi tra loro
 * (2:1 → 60, 2.5:1 → 69, 3:1+ al cap) lasciando quadrati/stretti invariati
 * (`1^p` è sempre 1). Esponente 2/3 (non 1/2): con la sqrt un 2:1 usciva 53,
 * troppo piccolo per i wordmark pieni.
 * Ritorna null quando il logo non ha dimensioni (nessuna scala calcolabile);
 * i call site usano `?? 75` come default. Deduplica la formula che ricorreva
 * in context.tsx (2×), TransformControls e usePosterSave.
 * SINGLE SOURCE OF TRUTH (Golden Rule): poster-service.ts, poster-auto-fit.ts
 * e scripts/backfill-wide-logo-scale.mjs DEVONO usare
 * `logoDefaultScaleFromAspect`, mai ricopiare la formula.
 */
export function logoDefaultScaleFromAspect(width: number, height: number): number | null {
  if (!width || !height || width <= 0 || height <= 0) return null
  return Math.min(Math.round(37.5 * Math.pow(width / height, 2 / 3)), 75)
}

export function logoDefaultScale(logo: TMDBImage): number | null {
  if (!logo.width || !logo.height) return null
  return logoDefaultScaleFromAspect(logo.width, logo.height)
}
