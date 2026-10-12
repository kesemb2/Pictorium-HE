/**
 * Fork: thumbnail pulita di un episodio per AIOMetadata ("Episode Thumbnail
 * URL Pattern"). Nessun ritocco: l'immagine dell'episodio così com'è, nella
 * risoluzione più alta disponibile, senza voti né loghi.
 *
 * Pattern AIOMetadata (customThumbnailUrlPattern): i segnaposto sono quelli
 * della SERIE più `{season}`/`{episode}` (dal `video.id` "tt…:S:E"), e
 * `{thumbnail}` è l'immagine che AIOMetadata userebbe da sé (URL-encoded).
 */
import type { TMDBStillLite } from "./tmdb"
import { isAllowedImageUrl } from "./poster-render-helpers"

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/"

/** "S1E2", "S01E02", "s1e2.jpg" → {season, episode}; altro → null. */
export function parseEpisodeSegment(segment: string): { season: number; episode: number } | null {
  const m = /^S(\d{1,4})E(\d{1,5})(?:\.jpe?g)?$/i.exec(segment.trim())
  if (!m) return null
  return { season: Number(m[1]), episode: Number(m[2]) }
}

/**
 * Lo still migliore: senza lingua prima (nessun testo stampato), poi il più
 * largo, poi il più votato. Null senza still.
 */
export function pickEpisodeStill(stills: readonly TMDBStillLite[]): TMDBStillLite | null {
  if (!stills.length) return null
  return [...stills].sort((a, b) =>
    (a.iso_639_1 === null ? 0 : 1) - (b.iso_639_1 === null ? 0 : 1)
    || b.width - a.width
    || b.vote_average - a.vote_average,
  )[0]!
}

/** URL TMDB alla risoluzione originale (`/t/p/w500/x.jpg` → `/t/p/original/x.jpg`). */
export function tmdbOriginalUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("/")) return `${TMDB_IMAGE_BASE}original${pathOrUrl}`
  if (pathOrUrl.startsWith(TMDB_IMAGE_BASE)) return pathOrUrl.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//, "$1original/")
  return pathOrUrl
}

/**
 * Ripiego dato da AIOMetadata (`{thumbnail}`): solo host d'immagini noti (mai
 * un redirect aperto), e un'immagine TMDB sale alla risoluzione originale.
 */
export function safeFallbackUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim()
  if (!url || !isAllowedImageUrl(url)) return null
  return tmdbOriginalUrl(url)
}
