/**
 * Tier qualità streaming (SD < HD < FHD < 4K) e soglia minima `qmin`.
 *
 * Modulo a ZERO dipendenze di proposito: la logica pura dei tier non deve
 * vivere in `stream-quality.ts` (che trascina justwatch/tmdb e viene mockato
 * nei test di route) — altrimenti ogni nuovo helper puro rompe i mock di
 * fabbrica (`vi.mock("@/lib/stream-quality", ...)`).
 */

export type StreamQuality = "4K" | "FHD" | "HD" | "SD"

const QUALITY_RANK: Record<StreamQuality, number> = { SD: 0, HD: 1, FHD: 2, "4K": 3 }

export function parseMinQuality(raw: string | null | undefined): StreamQuality | null {
  if (!raw) return null
  const v = raw.trim().toUpperCase()
  if (v === "SD" || v === "HD" || v === "FHD" || v === "4K") return v
  return null
}

export function isQualityAtLeast(
  quality: StreamQuality | null,
  min: StreamQuality | null | undefined,
): boolean {
  if (!quality || QUALITY_RANK[quality] === undefined) return false
  if (!min) return true
  return QUALITY_RANK[quality] >= QUALITY_RANK[min]
}

/**
 * Filtro soglia all'uscita: tier sotto `min` → nessun badge (null).
 * Default SD = tutto mostrato (filtro identità, zero snapshot rotti).
 */
export function applyMinQuality(
  quality: StreamQuality | null,
  min: StreamQuality | null | undefined,
): StreamQuality | null {
  if (!quality) return null
  if (!min || min === "SD") return quality
  return isQualityAtLeast(quality, min) ? quality : null
}
