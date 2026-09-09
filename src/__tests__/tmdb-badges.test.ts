import { describe, expect, it, vi, beforeEach } from "vitest"
import { computeBadge, getAllBadgeOptions } from "@/lib/badge-priority"
import { computeTopBadge, getNextEpisodeLabel, type BadgeInput } from "@/lib/poster-badge"
import { createT } from "@/lib/i18n"

const t = createT("it")

function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const EMPTY = {
  mediaType: "tv" as const, upcomingRelease: null, isNewMovie: false, isNewSeries: false,
  newSeason: null, animeRank: null, trendRank: null, award: null, nomination: null,
  studio: null, director: null, extra: null,
}

const BASE: BadgeInput = {
  mediaType: "tv", releaseDate: null, firstAirDate: null, lastAirDate: null,
  seasonCount: null, originCountries: [], voteAverage: 0, trendRank: null, animeRank: null,
  awards: [], nominations: [], studios: [], director: null, tvType: null, tvStatus: null,
}

describe("getNextEpisodeLabel", () => {
  it("fires inside the window", () => {
    expect(getNextEpisodeLabel({ airDate: daysFromNow(3), t })).toContain("Nuovo episodio")
  })

  it("does not fire today, in the past, or past the window", () => {
    // Oggi e passato sono coperti da "nuova stagione"; oltre 14 giorni la data
    // smette di essere una notizia.
    expect(getNextEpisodeLabel({ airDate: daysFromNow(0), t })).toBeNull()
    expect(getNextEpisodeLabel({ airDate: daysFromNow(-1), t })).toBeNull()
    expect(getNextEpisodeLabel({ airDate: daysFromNow(14), t })).not.toBeNull()
    expect(getNextEpisodeLabel({ airDate: daysFromNow(15), t })).toBeNull()
  })

  it("returns null for missing or malformed dates", () => {
    expect(getNextEpisodeLabel({ airDate: null, t })).toBeNull()
    expect(getNextEpisodeLabel({ airDate: "not-a-date", t })).toBeNull()
  })

  it("is TV-only through computeTopBadge", () => {
    const tv = computeTopBadge({ ...BASE, nextEpisodeAirDate: daysFromNow(3) }, t)
    expect(tv.nextEpisode).not.toBeNull()
    const movie = computeTopBadge({ ...BASE, mediaType: "movie", nextEpisodeAirDate: daysFromNow(3) }, t)
    expect(movie.nextEpisode).toBeNull()
  })
})

describe("highly rated", () => {
  it("needs a high score AND a wide sample", () => {
    // Su TMDB un titolo oscuro con dodici voti arriva a 9: senza la soglia sui
    // voti il badge sarebbe rumore.
    expect(computeTopBadge({ ...BASE, voteAverage: 8.0, voteCount: 1000 }, t).highlyRated).toBe(true)
    expect(computeTopBadge({ ...BASE, voteAverage: 7.9, voteCount: 5000 }, t).highlyRated).toBe(false)
    expect(computeTopBadge({ ...BASE, voteAverage: 9.5, voteCount: 999 }, t).highlyRated).toBe(false)
    expect(computeTopBadge({ ...BASE, voteAverage: 9.5 }, t).highlyRated).toBe(false)
  })
})

describe("ended", () => {
  it("covers ended and cancelled, TV only", () => {
    expect(computeTopBadge({ ...BASE, tvStatus: "Ended" }, t).ended).toBe(true)
    expect(computeTopBadge({ ...BASE, tvStatus: "Canceled" }, t).ended).toBe(true)
    expect(computeTopBadge({ ...BASE, tvStatus: "Returning Series" }, t).ended).toBe(false)
    expect(computeTopBadge({ ...BASE, mediaType: "movie", tvStatus: "Ended" }, t).ended).toBe(false)
  })
})

describe("trending label", () => {
  it("uses the media type to pick the wording", () => {
    expect(computeBadge({ ...EMPTY, mediaType: "movie", tmdbTrending: true }, t)?.label).toBe("Di tendenza")
    expect(computeBadge({ ...EMPTY, mediaType: "tv", tmdbTrending: true }, t)?.label).toBe("Serie di tendenza")
  })
})

describe("ladder placement", () => {
  it("puts the time-sensitive new episode above awards", () => {
    const r = computeBadge({ ...EMPTY, nextEpisode: "Nuovo episodio 25.12.26", award: "Vincitore Oscar" }, t)
    expect(r?.label).toBe("Nuovo episodio 25.12.26")
  })

  it("keeps trending below an award but above a sub-genre", () => {
    expect(computeBadge({ ...EMPTY, tmdbTrending: true, award: "Vincitore Oscar" }, t)?.label).toBe("Vincitore Oscar")
    expect(computeBadge({ ...EMPTY, tmdbTrending: true, subGenre: "Cyberpunk" }, t)?.label).toBe("Serie di tendenza")
  })

  it("keeps the permanent properties at the bottom", () => {
    // Non sono una notizia: non devono mai scavalcare qualcosa che lo è.
    expect(computeBadge({ ...EMPTY, highlyRated: true, studio: "A24" }, t)?.label).toBe("A24")
    expect(computeBadge({ ...EMPTY, ended: true, highlyRated: true }, t)?.label).toBe("Molto votato")
    expect(computeBadge({ ...EMPTY, ended: true }, t)?.label).toBe("Conclusa")
  })

  it("changes nothing when none of the four apply", () => {
    expect(computeBadge({ ...EMPTY, award: "Vincitore Oscar" }, t)?.label).toBe("Vincitore Oscar")
    expect(computeBadge({ ...EMPTY }, t)).toBeNull()
  })
})

describe("getAllBadgeOptions", () => {
  it("offers the new badges so they can be pinned manually", () => {
    const options = getAllBadgeOptions({
      ...EMPTY, mediaType: "tv", voteAverage: 8.5, tvType: null, tvStatus: null,
      nextEpisode: "Nuovo episodio 25.12.26", tmdbTrending: true, highlyRated: true, ended: true,
    })
    expect(options).toContain("Nuovo episodio 25.12.26")
    expect(options).toContain("__badge.trendingSeries")
    expect(options).toContain("__badge.highlyRated")
    expect(options).toContain("__badge.ended")
  })
})

describe("isTmdbTrending", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("matches on membership and fetches the list once, not once per title", async () => {
    const getTrending = vi.fn().mockResolvedValue({ page: 1, results: [{ id: 42 }, { id: 7 }], total_pages: 2, total_results: 2 })
    vi.doMock("@/lib/tmdb", () => ({ getTrending }))
    const { isTmdbTrending } = await import("@/lib/tmdb-trending-badge")
    expect(await isTmdbTrending("movie", 42)).toBe(true)
    expect(await isTmdbTrending("movie", 999)).toBe(false)
    // Due pagine al primo giro, poi cache: una griglia catalogo da 20 poster
    // non deve pagare 20 fetch.
    expect(getTrending).toHaveBeenCalledTimes(2)
    for (let i = 0; i < 18; i++) await isTmdbTrending("movie", i)
    expect(getTrending).toHaveBeenCalledTimes(2)
  })

  it("does not cache an empty list, so an outage is not sticky", async () => {
    const getTrending = vi.fn().mockResolvedValue({ page: 1, results: [], total_pages: 0, total_results: 0 })
    vi.doMock("@/lib/tmdb", () => ({ getTrending }))
    const { isTmdbTrending } = await import("@/lib/tmdb-trending-badge")
    expect(await isTmdbTrending("tv", 42)).toBe(false)
    await isTmdbTrending("tv", 42)
    expect(getTrending).toHaveBeenCalledTimes(4)
  })

  it("returns false rather than failing the render when TMDB is down", async () => {
    vi.doMock("@/lib/tmdb", () => ({
      getTrending: vi.fn().mockRejectedValue(new Error("upstream down")),
    }))
    const { isTmdbTrending } = await import("@/lib/tmdb-trending-badge")
    expect(await isTmdbTrending("tv", 42)).toBe(false)
  })
})
