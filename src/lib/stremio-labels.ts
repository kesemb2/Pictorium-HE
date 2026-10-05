/**
 * Testi che il manifest manda a Stremio (nomi dei cataloghi, opzioni del
 * filtro genere, descrizione), nella lingua della regione del manifest.
 *
 * Upstream li scrive in italiano per tutti. Il fork li traduce in ebraico per
 * la regione IL; le altre lingue restano come upstream. Il filtro genere usa
 * internamente le etichette canoniche (italiane / TMDB TV): chi riceve una
 * richiesta con un'etichetta ebraica la riporta alla canonica con
 * `canonicalGenreLabel` prima di qualunque confronto.
 */

/** Etichetta canonica del filtro → ebraico. */
const HE_GENRES: Readonly<Record<string, string>> = {
  Tutti: "הכול",
  Azione: "אקשן",
  Avventura: "הרפתקאות",
  Animazione: "אנימציה",
  Commedia: "קומדיה",
  Crime: "פשע",
  Documentario: "תיעודי",
  Dramma: "דרמה",
  Famiglia: "משפחה",
  Family: "משפחה",
  Fantascienza: "מדע בדיוני",
  Fantasy: "פנטזיה",
  Guerra: "מלחמה",
  Horror: "אימה",
  Mistero: "מסתורין",
  Musica: "מוזיקה",
  Romance: "רומנטיקה",
  Storia: "היסטוריה",
  Thriller: "מותחן",
  Western: "מערבון",
  "Action & Adventure": "אקשן והרפתקאות",
  Kids: "ילדים",
  News: "חדשות",
  Reality: "ריאליטי",
  "Sci-Fi & Fantasy": "מדע בדיוני ופנטזיה",
  Soap: "אופרת סבון",
  Talk: "טוק שואו",
  "War & Politics": "מלחמה ופוליטיקה",
}

/** Ebraico → canonica. "משפחה" vale per entrambi i Family: il filtro li tratta uguali. */
const HE_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  Object.entries(HE_GENRES).map(([canonical, he]) => [he, canonical] as const).reverse(),
)

function isHebrew(lang2: string | null | undefined): boolean {
  return (lang2 || "").slice(0, 2).toLowerCase() === "he"
}

/** Opzioni del filtro genere nella lingua della regione. */
export function localizeGenreOptions(options: readonly string[], lang2: string): string[] {
  if (!isHebrew(lang2)) return [...options]
  return options.map((o) => HE_GENRES[o] ?? o)
}

/** Etichetta ricevuta da Stremio → canonica (idempotente sulle canoniche). */
export function canonicalGenreLabel(label: string | undefined): string | undefined {
  if (!label) return label
  return HE_TO_CANONICAL.get(label.trim()) ?? label
}

/** Nomi statici dei cataloghi (`catalog-definitions`) → ebraico. */
const HE_CATALOG_PHRASES: readonly (readonly [string, string])[] = [
  ["Top 10 Oggi — Film", "טופ 10 היום — סרטים"],
  ["Top 10 Oggi — Serie TV", "טופ 10 היום — סדרות"],
  ["Cerca per Persona (Film)", "חיפוש לפי אדם (סרטים)"],
  ["Cerca per Persona (Serie TV)", "חיפוש לפי אדם (סדרות)"],
  ["Cerca Serie TV", "חיפוש סדרות"],
  ["Cerca Film", "חיפוש סרטים"],
  ["Top 20 Film Anime", "טופ 20 סרטי אנימה"],
  ["Top 20 Serie Anime", "טופ 20 סדרות אנימה"],
  ["Anime & Serie", "אנימה וסדרות"],
  ["Film Anime", "סרטי אנימה"],
  ["Serie TV", "סדרות"],
  ["Film", "סרטים"],
]

/** Nome di un catalogo nella lingua della regione (i nomi utente non passano di qui). */
export function localizeCatalogName(name: string, lang2: string): string {
  if (!isHebrew(lang2)) return name
  let out = name
  for (const [it, he] of HE_CATALOG_PHRASES) {
    // Solo frasi intere a fine nome: una parola dentro un titolo resta com'è.
    // Le frasi lunghe vengono prima, quindi "Top 20 Film Anime" non diventa
    // "Top 20 סרטים Anime".
    out = out.replace(new RegExp(`(^|\\s)${it.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), `$1${he}`)
  }
  return out
}

/** Suffisso del tipo per i cataloghi utente "misti" (Film / Serie TV). */
export function typeSuffix(type: "movie" | "series", lang2: string): string {
  if (isHebrew(lang2)) return type === "movie" ? "סרטים" : "סדרות"
  return type === "movie" ? "Film" : "Serie TV"
}

/** Etichette del nome manifest per le modalità hub. */
export function hubModeSuffix(mode: "search" | "catalogs", lang2: string): string {
  if (isHebrew(lang2)) return mode === "search" ? " (חיפוש)" : " (קטלוגים)"
  return mode === "search" ? " (Ricerca)" : " (Cataloghi)"
}

export function manifestDescription(lang2: string): string {
  return isHebrew(lang2)
    ? "מנהל פוסטרים מותאמים לסטרמיו — לוגואים, באדג'י טרנד, פרסים ודירוגים"
    : "Custom poster manager for Stremio — loghi, badge trend, premi e rating"
}
