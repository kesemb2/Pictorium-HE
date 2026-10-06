import { describe, expect, it } from "vitest"
import he from "@/lib/translations/he.json"
import en from "@/lib/translations/en.json"
import { eligibleTags, pickDailyTag, type TagCandidate, type TagFacts } from "@/lib/tag-catalog"
import { trimCollectionName } from "@/lib/tag-facts"

const HE = he as Record<string, string>
/** t() reale sul dizionario ebraico, con sostituzione dei segnaposto. */
const t = (key: string, params?: Record<string, string | number>) => {
  let s = HE[key] ?? key
  for (const [k, v] of Object.entries(params ?? {})) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
const NOW = new Date("2026-10-06T12:00:00Z")

function facts(over: Partial<TagFacts> = {}): TagFacts {
  return {
    mediaType: "movie", genreIds: [], originCountries: [], keywords: [], productionCompanies: [], networks: [],
    ...over,
  }
}
const ids = (f: TagFacts) => eligibleTags(f, t, "he", NOW).map((c) => c.id)
const label = (f: TagFacts, id: string) => eligibleTags(f, t, "he", NOW).find((c) => c.id === id)?.label

describe("tag catalogue: rules", () => {
  it("money, votes and age", () => {
    expect(ids(facts({ revenue: 1_200_000_000 }))).toContain("billion")
    expect(ids(facts({ revenue: 1_200_000_000 }))).not.toContain("blockbuster")
    expect(ids(facts({ revenue: 600_000_000 }))).toContain("blockbuster")
    expect(ids(facts({ budget: 3_000_000, voteAverage: 7.1, voteCount: 400 }))).toContain("indie")
    expect(ids(facts({ voteAverage: 7.8, voteCount: 300 }))).toContain("hiddenGem")
    expect(ids(facts({ voteAverage: 7.8, voteCount: 30_000 }))).toEqual(expect.arrayContaining(["crowdFavorite"]))
    expect(ids(facts({ voteAverage: 7.8, voteCount: 30_000 }))).not.toContain("hiddenGem")
    expect(ids(facts({ releaseDate: "1994-09-23", voteAverage: 8.7, voteCount: 28_000 }))).toContain("cult")
  })

  it("decade, anniversary and runtime, in the approved Hebrew", () => {
    expect(label(facts({ releaseDate: "1985-07-03" }), "classicDecade")).toBe("קלאסיקה משנות ה-80")
    expect(label(facts({ releaseDate: "2008-07-16" }), "hitDecade")).toBe("להיט משנות ה-2000")
    expect(label(facts({ releaseDate: "2001-12-19" }), "anniversary")).toBe("חוגג 25 שנים")
    expect(ids(facts({ releaseDate: "2002-05-01" }))).not.toContain("anniversary")
    expect(label(facts({ runtime: 88 }), "short")).toBe("קצר וקולע")
    expect(label(facts({ runtime: 169 }), "epic")).toBe("אפוס של 3 שעות")
    expect(label(facts({ runtime: 152 }), "epic")).toBe("אפוס של 2.5 שעות")
  })

  it("series format", () => {
    const mini = facts({ mediaType: "tv", tvType: "Miniseries", episodeCount: 6 })
    expect(ids(mini)).toEqual(expect.arrayContaining(["miniseries", "fewEpisodes"]))
    expect(label(mini, "fewEpisodes")).toBe("6 פרקים בלבד")
    expect(ids(facts({ mediaType: "tv", tvType: "Scripted", episodeCount: 8 }))).toContain("binge")
    expect(label(facts({ mediaType: "tv", seasonCount: 7 }), "seasons")).toBe("7 עונות")
    expect(ids(facts({ mediaType: "tv", episodeRunTime: [22, 24] }))).toContain("halfHour")
    expect(ids(facts({ mediaType: "tv", status: "Canceled" }))).toContain("canceled")
  })

  it("genres: combinations replace the single ones; TV composites open up", () => {
    const romcom = ids(facts({ genreIds: [35, 10749] }))
    expect(romcom).toContain("g_romcom")
    expect(romcom).not.toContain("g_comedy")
    expect(romcom).not.toContain("g_romance")
    expect(ids(facts({ mediaType: "tv", genreIds: [10765] }))).toEqual(expect.arrayContaining(["g_scifi", "g_fantasy"]))
    expect(ids(facts({ mediaType: "tv", genreIds: [99] }))).toContain("t_docuseries")
    expect(ids(facts({ genreIds: [10751] }))).toContain("family")
    expect(ids(facts({ genreIds: [16], originalLanguage: "ja" }))).toContain("anime")
    expect(ids(facts({ genreIds: [16], originalLanguage: "ja" }))).not.toContain("g_animation")
  })

  it("story keywords, including the edited wording", () => {
    expect(label(facts({ keywords: ["artificial intelligence (a.i.)"] }), "s_ai")).toBe("על בינה מלאכותית")
    expect(ids(facts({ keywords: ["based on novel or book", "time travel"] }))).toEqual(expect.arrayContaining(["s_book", "s_timetravel"]))
    // Confronto esatto: "band of brothers" non è una band.
    expect(ids(facts({ keywords: ["band of brothers"] }))).not.toContain("s_musician")
  })

  it("people, studios, networks and saga", () => {
    expect(label(facts({ starName: "לאונרדו דיקפריו" }), "star")).toBe("בכיכוב לאונרדו דיקפריו")
    expect(ids(facts({ starName: null }))).not.toContain("star")
    expect(label(facts({ composer: "Hans Zimmer" }), "composer")).toBe("מוזיקה: האנס צימר")
    expect(ids(facts({ composer: "Someone Unknown" }))).not.toContain("composer")
    // Formulazione approvata: solo il nome della rete.
    expect(label(facts({ mediaType: "tv", networks: ["Netflix"] }), "original")).toBe("Netflix")
    expect(ids(facts({ mediaType: "tv", networks: ["BBC One"] }))).not.toContain("original")
    expect(label(facts({ productionCompanies: ["Pixar Animation Studios"] }), "st_pixar")).toBe("פיקסאר")
    expect(label(facts({ collection: { name: "הארי פוטר", part: 3 } }), "collection")).toBe("חלק 3 בסאגת הארי פוטר")
    expect(label(facts({ keywords: ["marvel cinematic universe (mcu)"] }), "universe")).toBe("פרק ביקום מארוול")
    expect(label(facts({ mediaType: "tv", creatorOtherTitle: "שובר שורות" }), "creators")).toBe("מאת היוצרים של שובר שורות")
  })

  it("origin", () => {
    expect(ids(facts({ originCountries: ["IL"], originalLanguage: "he" }))).toContain("il_movie")
    expect(ids(facts({ mediaType: "tv", originCountries: ["IL"], originalLanguage: "he" }))).toContain("il_series")
    expect(ids(facts({ mediaType: "tv", originCountries: ["KR"] }))).toContain("kdrama")
    expect(ids(facts({ originalLanguage: "hi" }))).toContain("bollywood")
  })

  it("a typical title fits at least 10 tags", () => {
    const inception = facts({
      genreIds: [28, 878, 12], runtime: 148, revenue: 839_000_000, budget: 160_000_000,
      voteAverage: 8.4, voteCount: 37_000, releaseDate: "2010-07-15", originCountries: ["US", "GB"], originalLanguage: "en",
      keywords: ["dream", "subconscious", "heist", "spy"], composer: "Hans Zimmer", starName: "לאונרדו דיקפריו",
    })
    expect(eligibleTags(inception, t, "he", NOW).length).toBeGreaterThanOrEqual(10)
  })

  it("never prints an untranslated key", () => {
    const bare = (k: string) => k
    expect(eligibleTags(facts({ revenue: 1_500_000_000, genreIds: [35] }), bare, "he", NOW)).toEqual([])
  })
})

describe("tag catalogue: translations", () => {
  it("every tag.* key exists in Hebrew and English with the same placeholders", () => {
    const keys = Object.keys(HE).filter((k) => k.startsWith("tag."))
    expect(keys.length).toBeGreaterThanOrEqual(100)
    for (const k of keys) {
      const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join()
      expect((en as Record<string, string>)[k], k).toBeTruthy()
      expect(ph((en as Record<string, string>)[k]!), k).toBe(ph(HE[k]!))
    }
    expect(HE["badge.director"]).toBe("בבימוי {name}")
  })
})

describe("daily pick", () => {
  const pool: TagCandidate[] = [
    { id: "a", label: "A", weight: 1 }, { id: "b", label: "B", weight: 1 }, { id: "c", label: "C", weight: 3 },
    { id: "d", label: "D", weight: 2 }, { id: "e", label: "E", weight: 1 },
  ]

  it("is deterministic for the same title and day, and order-independent", () => {
    expect(pickDailyTag(pool, "movie:1", 100)!.id).toBe(pickDailyTag([...pool].reverse(), "movie:1", 100)!.id)
  })

  it("never repeats yesterday's tag", () => {
    for (let d = 1; d < 200; d++) {
      expect(pickDailyTag(pool, "movie:27205", d)!.id).not.toBe(pickDailyTag(pool, "movie:27205", d - 1)!.id)
    }
  })

  it("covers the whole pool over time, weighted", () => {
    const seen = new Map<string, number>()
    for (let d = 0; d < 400; d++) {
      const id = pickDailyTag(pool, "tv:1399", d)!.id
      seen.set(id, (seen.get(id) ?? 0) + 1)
    }
    expect([...seen.keys()].sort()).toEqual(["a", "b", "c", "d", "e"])
    expect(seen.get("c")!).toBeGreaterThan(seen.get("a")!)
  })

  it("handles empty and single pools", () => {
    expect(pickDailyTag([], "x", 1)).toBeNull()
    expect(pickDailyTag([pool[0]!], "x", 1)!.id).toBe("a")
  })
})

describe("collection names", () => {
  it("drops the generic suffix", () => {
    expect(trimCollectionName("הארי פוטר - סדרת הסרטים")).toBe("הארי פוטר")
    expect(trimCollectionName("Alien Collection")).toBe("Alien")
  })
})
