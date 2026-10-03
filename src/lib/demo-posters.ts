/**
 * Poster dimostrativi della home (carosello e podio). Le loro URL portavano
 * generi ed etichette scritti in italiano: qui diventano chiavi tradotte e
 * la richiesta porta la lingua dell'interfaccia, così il badge in classifica
 * ("Serie", "Film"…) esce nella stessa lingua di chi guarda.
 */

type Translate = (key: string, params?: Record<string, string | number>) => string

/** Genere demo (valore storico in query) → chiave tradotta. */
const DEMO_GENRE_KEYS: Readonly<Record<string, string>> = {
  Dramma: "ui.demoGenreDrama",
  Azione: "ui.demoGenreAction",
  Thriller: "ui.demoGenreThriller",
  Fantascienza: "ui.demoGenreSciFi",
  Crime: "ui.demoGenreCrime",
  Avventura: "ui.demoGenreAdventure",
  Commedia: "ui.demoGenreComedy",
}

/** Localizza la query di un poster demo e aggiunge `lang`. */
export function localizeDemoParams(params: string, t: Translate, lang: string): string {
  const q = new URLSearchParams(params.startsWith("?") ? params.slice(1) : params)
  const genre = q.get("genreName")
  if (genre && DEMO_GENRE_KEYS[genre]) q.set("genreName", t(DEMO_GENRE_KEYS[genre]))
  if (q.has("label")) q.set("label", t("badge.series"))
  if (lang) q.set("lang", lang)
  return `?${q.toString()}`
}
