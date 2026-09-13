import { describe, expect, it } from "vitest"
import {
  CLEAN_GRADIENT_HEIGHT,
  NON_CLEAN_GRADIENT_HEIGHT,
  defaultGradientHeightForPoster,
} from "@/lib/gradient-defaults"

// Regressione: l'altezza della fascia tornava a 30 a ogni cambio di poster,
// perché il valore per il poster clean era fisso e questa funzione viene
// richiamata anche subito dopo aver ricaricato i default salvati.
describe("defaultGradientHeightForPoster", () => {
  const clean = { iso_639_1: null }
  const withTitle = { iso_639_1: "he" }

  it("usa l'impostazione dell'utente sul poster clean", () => {
    expect(defaultGradientHeightForPoster(clean, 55)).toBe(55)
    expect(defaultGradientHeightForPoster(clean, 12)).toBe(12)
  })

  it("tiene la fascia bassa sul poster col titolo stampato", () => {
    expect(defaultGradientHeightForPoster(withTitle, 55)).toBe(NON_CLEAN_GRADIENT_HEIGHT)
    expect(defaultGradientHeightForPoster(null, 55)).toBe(NON_CLEAN_GRADIENT_HEIGHT)
  })

  it("senza default esplicito resta il valore di fabbrica", () => {
    expect(defaultGradientHeightForPoster(clean)).toBe(CLEAN_GRADIENT_HEIGHT)
  })
})
