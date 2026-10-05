// ---------------------------------------------------------------------------
// Single source of truth per gli stili badge.
// Condiviso da: schemi Zod (validation.ts, config-token.ts), stato client
// (PosterEditorContext, useDefaults) e rendering server
// (svg-badge.ts, poster-service.ts, route poster). Tenere gli enum qui rende
// impossibile un drift tra lista client, lista server e validazione.
// ---------------------------------------------------------------------------

export const BADGE_STYLES = ["shadow", "pill", "bar", "colored", "bordo", "vetro", "minimal"] as const
export type BadgeStyle = (typeof BADGE_STYLES)[number]

export const RANKING_BADGE_STYLES = ["default", "bar", "colored", "pill", "bordo", "vetro", "netflix", "netflix-color"] as const
export type RankingBadgeStyle = (typeof RANKING_BADGE_STYLES)[number]
/** Stile accettato dai badge "extra" (trend/classifica): union dei due set; valori sconosciuti cadono sul default nel renderer. */
export type ExtraBadgeStyle = BadgeStyle | RankingBadgeStyle

export const DEFAULT_BADGE_STYLE: BadgeStyle = "shadow"
export const DEFAULT_RANKING_BADGE_STYLE: RankingBadgeStyle = "default"

/**
 * Stile del badge qualità streaming: "standard" (pill testuale satinata),
 * "mono" (icone monocromatiche da public/quality-badges/mono) o "color"
 * (icone a colori da public/quality-badges/color). Catena come gli altri
 * stili: query `qbs` > mapping per-titolo > config token > server defaults.
 */
export const QUALITY_BADGE_STYLES = ["standard", "mono", "color"] as const
export type QualityBadgeStyle = (typeof QUALITY_BADGE_STYLES)[number]

export const DEFAULT_QUALITY_BADGE_STYLE: QualityBadgeStyle = "standard"

export function isBadgeStyle(v: string | null | undefined): v is BadgeStyle {
  return !!v && (BADGE_STYLES as readonly string[]).includes(v)
}

export function isRankingBadgeStyle(v: string | null | undefined): v is RankingBadgeStyle {
  return !!v && (RANKING_BADGE_STYLES as readonly string[]).includes(v)
}

export function isQualityBadgeStyle(v: string | null | undefined): v is QualityBadgeStyle {
  return !!v && (QUALITY_BADGE_STYLES as readonly string[]).includes(v)
}

/**
 * Font dei testi badge ("inter" = resa storica). Catena come gli altri
 * visuali: query `bfont` > mapping per-titolo > config token > server
 * defaults > "inter". Assente o non valido → Inter (URL e preset esistenti
 * invariati). I preset custom/house del Badge Lab hanno tipografia propria
 * e ignorano questo parametro (vedi badge-svg-shared.ts).
 */
export const BADGE_FONTS = ["inter", "barlow-condensed", "oswald"] as const
export type BadgeFont = (typeof BADGE_FONTS)[number]

export const DEFAULT_BADGE_FONT: BadgeFont = "inter"

export function isBadgeFont(v: string | null | undefined): v is BadgeFont {
  return !!v && (BADGE_FONTS as readonly string[]).includes(v)
}

/**
 * Fork: font del testo ebraico, scelto nelle Impostazioni e indipendente dal
 * font latino dei badge. Catena: query `hfont` > config token > server
 * defaults > "rubik". Vale per il solo ebraico: l'arabo resta in Rubik (queste
 * famiglie non hanno glifi arabi).
 */
export const HEBREW_FONTS = ["rubik", "heebo", "karantina", "secular-one", "frank-ruhl-libre"] as const
export type HebrewFont = (typeof HEBREW_FONTS)[number]

export const DEFAULT_HEBREW_FONT: HebrewFont = "rubik"

export function isHebrewFont(v: string | null | undefined): v is HebrewFont {
  return !!v && (HEBREW_FONTS as readonly string[]).includes(v)
}

/** Famiglia SVG (nome nella tabella `name` del TTF) per ogni font ebraico. */
export const HEBREW_FONT_FAMILY: Readonly<Record<HebrewFont, string>> = {
  rubik: "Rubik",
  heebo: "Heebo",
  karantina: "Karantina",
  "secular-one": "Secular One",
  "frank-ruhl-libre": "Frank Ruhl Libre",
}

/**
 * Font effettivo passato ai renderer: il font latino, più il font ebraico
 * quando non è quello di default ("oswald+heebo"). Con Rubik il valore resta
 * il BadgeFont nudo, quindi chiavi cache e SVG sono byte-identici a prima.
 */
export type BadgeFontSpec = BadgeFont | `${BadgeFont}+${Exclude<HebrewFont, "rubik">}`

export function withHebrewFont(font: BadgeFont, hebrew: HebrewFont | null | undefined): BadgeFontSpec {
  if (!hebrew || hebrew === DEFAULT_HEBREW_FONT) return font
  return `${font}+${hebrew}` as BadgeFontSpec
}

/** Parte latina di un BadgeFontSpec (o di un valore libero). */
export function latinFontOf(spec: string | null | undefined): BadgeFont {
  const latin = (spec ?? "").split("+")[0]
  return isBadgeFont(latin) ? latin : DEFAULT_BADGE_FONT
}

/** Parte ebraica di un BadgeFontSpec (assente/invalida → Rubik). */
export function hebrewFontOf(spec: string | null | undefined): HebrewFont {
  const hebrew = (spec ?? "").split("+")[1]
  return isHebrewFont(hebrew) ? hebrew : DEFAULT_HEBREW_FONT
}
export function isRibbonRankingStyle(v: string | null | undefined): boolean {
  return v === "netflix" || v === "netflix-color" || v === "colored"
}

/**
 * Fallback centrato quando il nastro è disattivato (`ribbonEnabled=false`):
 * gli stili nastro collassano sull'equivalente centrato (il badge resta
 * visibile, mai nascosto). "colored" diventa "default" ma conserva la tinta
 * accent come riempimento piatto (flag `rankingBadgeAccent` in poster-config:
 * senza nastro deve colorare il badge default).
 */
export function nonRibbonRankingStyle(v: RankingBadgeStyle): RankingBadgeStyle {
  if (v === "netflix" || v === "netflix-color" || v === "colored") return "default"
  return v
}

/**
 * Avanzamento medio dell'ebraico rispetto a Rubik, misurato con resvg (ink
 * bbox, pesi 700/800, 7 stringhe da badge a fs=100). Serve a `estimateTextWidth`:
 * i badge fissano la larghezza con `textLength`, e una stima tarata su Rubik
 * stirerebbe Karantina del +57%.
 */
export const HEBREW_FONT_WIDTH: Readonly<Record<HebrewFont, number>> = {
  rubik: 1,
  heebo: 1.01,
  karantina: 0.635,
  "secular-one": 0.935,
  "frank-ruhl-libre": 0.85,
}

/** Normalizza un valore libero a BadgeFontSpec (parti invalide → default). */
export function normalizeBadgeFontSpec(v: string | null | undefined): BadgeFontSpec {
  return withHebrewFont(latinFontOf(v), hebrewFontOf(v))
}

/**
 * Fork: stile del poster. "classic" = la resa di sempre (fascia sfocata, riga
 * genere/voto, badge in alto); "tag" = artwork pulito, logo e titolo in una
 * card di vetro, stato in una tag di vetro in basso (vedi lib/tag-style).
 * Catena: query `pstyle` > config token > server defaults > "classic".
 */
export const POSTER_STYLES = ["classic", "tag"] as const
export type PosterStyle = (typeof POSTER_STYLES)[number]
export const DEFAULT_POSTER_STYLE: PosterStyle = "classic"

export function isPosterStyle(v: string | null | undefined): v is PosterStyle {
  return !!v && (POSTER_STYLES as readonly string[]).includes(v)
}

/**
 * Fork: grandezza della tag (stile tag) in % del default del formato.
 * Catena: query `tsize` > config token > server defaults > 100.
 */
export const TAG_SIZE_MIN = 50
export const TAG_SIZE_MAX = 160
export const DEFAULT_TAG_SIZE = 100

/** Valore libero → % intera nei limiti (assente/invalido → default). */
export function normalizeTagSize(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v)
  if (!Number.isFinite(n)) return DEFAULT_TAG_SIZE
  return Math.min(TAG_SIZE_MAX, Math.max(TAG_SIZE_MIN, Math.round(n)))
}
