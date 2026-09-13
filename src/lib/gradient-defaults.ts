/** Valore di fabbrica per il poster clean: da qui parte `defaultGradientHeight`. */
export const CLEAN_GRADIENT_HEIGHT = 30
export const NON_CLEAN_GRADIENT_HEIGHT = 10

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
