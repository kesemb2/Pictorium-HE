import { describe, expect, it } from "vitest"
import { directorBadgeLabel } from "@/lib/awards"
import he from "@/lib/translations/he.json"
import en from "@/lib/translations/en.json"
import itDict from "@/lib/translations/it.json"

/** Un `t` reale sui dizionari veri: il setup dei test mocka i18n. */
function tFor(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    let v = dict[key] ?? key
    if (params) for (const [k, p] of Object.entries(params)) v = v.replaceAll(`{${k}}`, String(p))
    return v
  }
}
const tHe = tFor(he as Record<string, string>)
const tEn = tFor(en as Record<string, string>)
const tIt = tFor(itDict as Record<string, string>)

describe("directorBadgeLabel", () => {
  it("uses the curated Hebrew name over Wikidata's", () => {
    expect(directorBadgeLabel("Martin Scorsese", "מרטין סקורסזי", tHe, "he")).toBe("מרטין סקורסזה")
  })

  it("falls back to Wikidata's Hebrew label when the name is not curated", () => {
    expect(directorBadgeLabel("John Ford", "ג'ון פורד", tHe, "he")).toBe("ג'ון פורד")
  })

  // Un nome in latino è meglio di nessun badge.
  it("keeps the English name when no Hebrew is available", () => {
    expect(directorBadgeLabel("John Ford", null, tHe, "he")).toBe("John Ford")
  })

  it("never uses Hebrew for another language", () => {
    expect(directorBadgeLabel("Martin Scorsese", "מרטין סקורסזה", tEn, "en")).toBe("By Martin Scorsese")
    expect(directorBadgeLabel("Martin Scorsese", "מרטין סקורסזה", tIt, "it")).toBe("Di Martin Scorsese")
  })

  it("accepts a full locale, not only the two-letter code", () => {
    expect(directorBadgeLabel("Martin Scorsese", null, tHe, "he-IL")).toBe("מרטין סקורסזה")
  })

  it("is null without a director", () => {
    expect(directorBadgeLabel(null, "מרטין סקורסזה", tHe, "he")).toBeNull()
  })

  it("drops the prefix in Hebrew but keeps it elsewhere", () => {
    expect(directorBadgeLabel("Tim Burton", null, tHe, "he")).toBe("טים ברטון")
    expect(directorBadgeLabel("Tim Burton", null, tEn, "en")).toBe("By Tim Burton")
  })

  /**
   * La regressione che conta. La cache di Wikidata è per titolo e NON per
   * lingua; finché conservava il testo già reso, la prima richiesta decideva
   * la lingua di tutte le altre per 24 ore. Ora conserva il nome canonico e
   * l'etichetta ebraica, entrambi fatti sul titolo, e la resa avviene qui.
   */
  it("renders the same cached pair differently per language", () => {
    const cached = { director: "Stanley Kubrick", directorHe: "סטנלי קובריק" }
    expect(directorBadgeLabel(cached.director, cached.directorHe, tHe, "he")).toBe("סטנלי קובריק")
    expect(directorBadgeLabel(cached.director, cached.directorHe, tEn, "en")).toBe("By Stanley Kubrick")
  })
})
