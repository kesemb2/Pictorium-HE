import { describe, expect, it } from "vitest"
import { classifyFunnelOutcome, evaluateGate } from "../../scripts/audit-artwork-funnel.mjs"

// classifyFunnelOutcome replica la precedenza della poster route (ramo
// non-mappato portrait): clean → rescue (logo+chiave+id+textless) → lingua →
// crop → 404. Lo script live misura gli input, qui si blindano le decisioni.
describe("classifyFunnelOutcome (precedenza rami)", () => {
  const base = {
    tmdbHasClean: false,
    tmdbHasLogo: false,
    tvdbKeyPresent: false,
    tvdbIdResolved: false,
    tvdbTextlessCount: 0,
    tmdbHasAnyPoster: false,
    hasBackdrop: false,
  }

  it("TMDB_CLEAN vince su tutto", () => {
    expect(classifyFunnelOutcome({
      ...base,
      tmdbHasClean: true,
      tmdbHasLogo: true,
      tvdbKeyPresent: true,
      tvdbIdResolved: true,
      tvdbTextlessCount: 5,
      tmdbHasAnyPoster: true,
      hasBackdrop: true,
    })).toBe("TMDB_CLEAN")
  })

  it("TVDB_RESCUE richiede logo + chiave + id + almeno un textless", () => {
    const ok = {
      ...base,
      tmdbHasLogo: true,
      tvdbKeyPresent: true,
      tvdbIdResolved: true,
      tvdbTextlessCount: 1,
      tmdbHasAnyPoster: true,
      hasBackdrop: true,
    }
    expect(classifyFunnelOutcome(ok)).toBe("TVDB_RESCUE")
    // Ogni condizione mancante ricade nel fallback lingua (poster esistenti).
    expect(classifyFunnelOutcome({ ...ok, tmdbHasLogo: false })).toBe("LANG_FALLBACK")
    expect(classifyFunnelOutcome({ ...ok, tvdbKeyPresent: false })).toBe("LANG_FALLBACK")
    expect(classifyFunnelOutcome({ ...ok, tvdbIdResolved: false })).toBe("LANG_FALLBACK")
    expect(classifyFunnelOutcome({ ...ok, tvdbTextlessCount: 0 })).toBe("LANG_FALLBACK")
  })

  it("LANG_FALLBACK quando c'è un poster TMDB qualsiasi", () => {
    expect(classifyFunnelOutcome({ ...base, tmdbHasAnyPoster: true })).toBe("LANG_FALLBACK")
  })

  it("BACKDROP_CROP solo senza poster ma con backdrop", () => {
    expect(classifyFunnelOutcome({ ...base, hasBackdrop: true })).toBe("BACKDROP_CROP")
  })

  it("NOT_FOUND da orfano totale", () => {
    expect(classifyFunnelOutcome(base)).toBe("NOT_FOUND")
  })
})

describe("evaluateGate (soglia secca binaria)", () => {
  interface GateRow {
    tmdbId: number
    mediaType: string
    stratum: string
    outcome: string
    tvdbTextless: { w: number; h: number; score: number }[]
  }
  const row = (outcome: string, tvdbTextless: GateRow["tvdbTextless"] = [], stratum = "niche"): GateRow => ({
    tmdbId: 1,
    mediaType: "movie",
    stratum,
    outcome,
    tvdbTextless,
  })

  it("No-Op sotto il 5% di rescue", () => {
    const rows = [
      ...Array.from({ length: 97 }, () => row("TMDB_CLEAN", [], "popular-movies")),
      ...Array.from({ length: 3 }, () => row("TVDB_RESCUE", [{ w: 680, h: 1000, score: 8 }])),
    ]
    const g = evaluateGate(rows)
    expect(g.measured).toBe(100)
    expect(g.rescuePct).toBeCloseTo(3, 5)
    expect(g.scoringJustified).toBe(false)
  })

  it("No-Op con rescue ma senza dispersione (1 textless ciascuno)", () => {
    const rows = [
      ...Array.from({ length: 90 }, () => row("TMDB_CLEAN")),
      ...Array.from({ length: 10 }, () => row("TVDB_RESCUE", [{ w: 680, h: 1000, score: 8 }])),
    ]
    const g = evaluateGate(rows)
    expect(g.rescuePct).toBeCloseTo(10, 5)
    expect(g.multiPct).toBe(0)
    expect(g.scoringJustified).toBe(false)
  })

  it("Scoring giustificato: >=5% rescue e >=30% multi-eterogenei", () => {
    const rows = [
      ...Array.from({ length: 90 }, () => row("TMDB_CLEAN")),
      ...Array.from({ length: 6 }, () =>
        row("TVDB_RESCUE", [{ w: 680, h: 1000, score: 5 }, { w: 1000, h: 1500, score: 9 }])),
      ...Array.from({ length: 4 }, () => row("TVDB_RESCUE", [{ w: 680, h: 1000, score: 8 }])),
    ]
    const g = evaluateGate(rows)
    expect(g.rescuePct).toBeCloseTo(10, 5)
    expect(g.multiPct).toBeCloseTo(60, 5)
    expect(g.scoringJustified).toBe(true)
  })

  it("le righe ERROR sono escluse dal denominatore", () => {
    const rows = [
      ...Array.from({ length: 90 }, () => row("TMDB_CLEAN")),
      ...Array.from({ length: 5 }, () => ({ ...row("TVDB_RESCUE"), outcome: "ERROR" })),
      ...Array.from({ length: 5 }, () => row("TVDB_RESCUE", [{ w: 1, h: 2, score: 1 }, { w: 3, h: 4, score: 2 }])),
    ]
    const g = evaluateGate(rows)
    expect(g.measured).toBe(95)
    expect(g.scoringJustified).toBe(true)
  })

  it("dataset vuoto → mai giustificato", () => {
    const g = evaluateGate([])
    expect(g.scoringJustified).toBe(false)
  })
})
