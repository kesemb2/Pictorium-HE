/** Valore di fabbrica per il poster clean: da qui parte `defaultGradientHeight`. */
export const CLEAN_GRADIENT_HEIGHT = 30
export const NON_CLEAN_GRADIENT_HEIGHT = 20

/**
 * Altezza della fascia sfocata per il poster appena scelto.
 *
 * Sul poster clean vince l'impostazione dell'utente: prima qui c'era un 30
 * fisso, e siccome questa funzione viene richiamata a ogni cambio di poster
 * (anche subito dopo aver ricaricato i default) il cursore tornava a 30
 * qualunque cosa fosse stata salvata.
 *
 * Sul poster che ha già il titolo stampato resta il valore basso: una fascia
 * alta sotto un titolo stampato è sbagliata comunque sia impostato il default.
 */
export function defaultGradientHeightForPoster(
  poster: { iso_639_1?: string | null } | null | undefined,
  userDefault: number = CLEAN_GRADIENT_HEIGHT,
): number {
  return poster?.iso_639_1 === null ? userDefault : NON_CLEAN_GRADIENT_HEIGHT
}

export const CLEAN_BLUR_FADE = 50
export const NON_CLEAN_BLUR_FADE = 80

/** Fade di default per tipo poster (come l'altezza): sul non-clean, con poco
 *  titolo stampato da coprire, serve una transizione più lunga e morbida. */
export function defaultBlurFadeForPoster(poster: { iso_639_1?: string | null } | null | undefined): number {
  return poster?.iso_639_1 === null ? CLEAN_BLUR_FADE : NON_CLEAN_BLUR_FADE
}
