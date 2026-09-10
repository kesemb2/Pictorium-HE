import { describe, it, expect } from "vitest"
import { getSubGenreLabel } from "../lib/subgenres"

describe("subgenres detection", () => {
  it("labels every rule for Hebrew", () => {
    // getSubGenreLabel ripiega sull'italiano per le lingue senza label: senza
    // una voce `he` su ogni regola il badge sottogenere di un utente ebraico
    // uscirebbe in italiano.
    const HEBREW = /[\u0590-\u05FF]/
    // Nessuna eccezione: "Found Footage" e "Film Noir" stavano in latino anche
    // in ebraico, ma sulla riga di un poster ebraico spiccavano come un errore.
    // Ora sono traslitterati come il resto.
    for (const kw of ["time travel", "cyberpunk", "whodunit", "heist", "zombie", "vampire", "paranormal", "kaiju", "post-apocalyptic", "found footage", "film noir", "spaghetti western", "martial arts", "space opera"]) {
      const he = getSubGenreLabel([kw], "he")
      expect(he, kw).toBeTruthy()
      expect(HEBREW.test(he!), kw).toBe(true)
      expect(he, kw).not.toBe(getSubGenreLabel([kw], "it"))
    }
    expect(getSubGenreLabel(["cyberpunk"], "he")).toBe("סייברפאנק")
    expect(getSubGenreLabel(["time travel"], "he")).toBe("מסע בזמן")
  })

  it("detects cyberpunk for Blade Runner keywords", () => {
    const keywords = ["cyberpunk", "android", "futuristic city"]
    expect(getSubGenreLabel(keywords, "it")).toBe("Cyberpunk")
    expect(getSubGenreLabel(keywords, "en")).toBe("Cyberpunk")
  })



  it("detects time travel for Back to the Future keywords without false cyberpunk match", () => {
    const keywords = ["time travel", "delorean", "time machine", "future"]
    expect(getSubGenreLabel(keywords, "it")).toBe("Viaggi nel Tempo")
  })

  it("detects whodunit for Knives Out keywords with Italian label", () => {
    const keywords = ["murder mystery", "whodunit", "inheritance"]
    expect(getSubGenreLabel(keywords, "it")).toBe("Giallo")
    expect(getSubGenreLabel(keywords, "en")).toBe("Whodunit")
  })

  it("detects zombie for The Walking Dead keywords", () => {
    const keywords = ["zombie apocalypse", "undead"]
    expect(getSubGenreLabel(keywords, "it")).toBe("Film di Zombie")
  })

  it("returns null when no matching subgenre keywords exist", () => {
    const keywords = ["family", "school", "friendship"]
    expect(getSubGenreLabel(keywords, "it")).toBeNull()
  })

  it("detects space opera for The Mandalorian, not spaghetti western", () => {
    const keywords = ["bounty hunter", "affectation", "space western", "space opera", "space exploration", "quest"]
    expect(getSubGenreLabel(keywords, "it")).toBe("Space Opera")
  })

  it("detects spaghetti western for a real western with gunslinger", () => {
    const keywords = ["gunslinger", "wild west", "saloon"]
    expect(getSubGenreLabel(keywords, "it")).toBe("Spaghetti Western")
  })

  it("does not trigger spaghetti western from generic bounty hunter alone", () => {
    const keywords = ["bounty hunter", "action", "crime"]
    expect(getSubGenreLabel(keywords, "it")).toBeNull()
  })
})
