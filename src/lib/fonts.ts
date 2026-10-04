import path from "path"

/**
 * Elenco unico dei font passati a resvg. Prima viveva duplicato in quattro
 * punti (svg-badge + tre pill in poster-service) che avevano già divergito:
 * le copie di poster-service non caricavano il font dei simboli. Una sola
 * fonte di verità evita che il prossimo font aggiunto ne raggiunga solo metà.
 *
 * Rubik (SIL OFL 1.1) è il font ebraico e arabo: Inter non ha glifi ebraici né
 * arabi e senza Rubik nel fontdb ogni badge in ebraico o arabo verrebbe
 * rasterizzato come tofu.
 * resvg fa fallback per-glifo sull'intero fontdb, quindi la sua sola presenza
 * qui basta a evitare i quadratini anche dove `font-family` resta "Inter" —
 * ma il fallback per-glifo ignora il peso richiesto e ripiega sempre sul
 * regular, per questo il testo ebraico e arabo dichiara "Rubik" esplicitamente
 * via `fontFamilyFor` (badge-svg-shared).
 */
const fontPath = (file: string) => path.join(/* turbopackIgnore: true */ process.cwd(), "src", "assets", "fonts", file)

export const FONT_INTER_REGULAR = fontPath("Inter-Regular.ttf")
export const FONT_INTER_BOLD = fontPath("Inter-Bold.ttf")
export const FONT_INTER_BLACK = fontPath("Inter-Black.ttf")
export const FONT_SYMBOLS = fontPath("NotoSansSymbols2-Regular.ttf")
export const FONT_RUBIK_REGULAR = fontPath("Rubik-Regular.ttf")
export const FONT_RUBIK_BOLD = fontPath("Rubik-Bold.ttf")
export const FONT_RUBIK_BLACK = fontPath("Rubik-Black.ttf")
export const FONT_BARLOW_REGULAR = fontPath("BarlowCondensed-Regular.ttf")
export const FONT_BARLOW_BOLD = fontPath("BarlowCondensed-Bold.ttf")
export const FONT_BARLOW_BLACK = fontPath("BarlowCondensed-Black.ttf")
export const FONT_OSWALD_REGULAR = fontPath("Oswald-Regular.ttf")
export const FONT_OSWALD_SEMIBOLD = fontPath("Oswald-SemiBold.ttf")
export const FONT_OSWALD_BOLD = fontPath("Oswald-Bold.ttf")

export const FONT_FILES = [
  FONT_INTER_REGULAR,
  FONT_INTER_BOLD,
  FONT_INTER_BLACK,
  FONT_SYMBOLS,
  FONT_RUBIK_REGULAR,
  FONT_RUBIK_BOLD,
  FONT_RUBIK_BLACK,
  FONT_BARLOW_REGULAR,
  FONT_BARLOW_BOLD,
  FONT_BARLOW_BLACK,
  FONT_OSWALD_REGULAR,
  FONT_OSWALD_SEMIBOLD,
  FONT_OSWALD_BOLD,
] as const

// Fork: famiglie del selettore "Font ebraico". Non stanno in FONT_FILES: resvg
// legge e indicizza ogni file a ogni render, e il render di default (Rubik)
// non deve pagare ~550KB di font che non usa. `fontFilesFor` le aggiunge solo
// quando l'SVG dichiara la famiglia.
export const HEBREW_FONT_FILES: Readonly<Record<string, readonly string[]>> = {
  Heebo: [fontPath("Heebo-Regular.ttf"), fontPath("Heebo-Bold.ttf"), fontPath("Heebo-Black.ttf")],
  Karantina: [fontPath("Karantina-Regular.ttf"), fontPath("Karantina-Bold.ttf")],
  "Secular One": [fontPath("SecularOne-Regular.ttf")],
  "Frank Ruhl Libre": [fontPath("FrankRuhlLibre-Regular.ttf"), fontPath("FrankRuhlLibre-Bold.ttf"), fontPath("FrankRuhlLibre-Black.ttf")],
}

/** Font da passare a resvg per un SVG: la base più le famiglie ebraiche dichiarate. */
export function fontFilesFor(svg: string): string[] {
  const files: string[] = [...FONT_FILES]
  for (const [family, paths] of Object.entries(HEBREW_FONT_FILES)) {
    if (svg.includes(`font-family="${family}"`)) files.push(...paths)
  }
  return files
}
