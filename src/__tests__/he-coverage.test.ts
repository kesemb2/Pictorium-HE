import { describe, expect, it } from "vitest"
import enDict from "@/lib/translations/en.json"
import heDict from "@/lib/translations/he.json"

// Nomi propri che restano identici in ebraico (marchi, servizi, nomi file).
const BRAND_VALUES = new Set([
  "IMDb",
  "TMDB",
  "MDBList",
  "Rotten Tomatoes",
  "Popcorntime",
  "Letterboxd",
  "Metacritic",
  "Trakt",
  "SIMKL",
  "Filmweb",
  "Roger Ebert",
  "MyAnimeList",
  "AniList",
  "Kitsu",
  "Fanart.tv",
  "JustWatch",
  "FlixPatrol",
  "mappings.json",
  "Stremio",
  "ElfHosted",
])

describe("Hebrew dictionary coverage", () => {
  it("translates every key: no he value is a copy of English except brand names", () => {
    const en = enDict as Record<string, string>
    const he = heDict as Record<string, string>
    const copied = Object.keys(en).filter((k) => he[k] === en[k] && !BRAND_VALUES.has(en[k]!))
    expect(copied).toEqual([])
  })

  it("has no empty values", () => {
    const empty = Object.entries(heDict as Record<string, string>).filter(([, v]) => !v.trim())
    expect(empty).toEqual([])
  })
})
