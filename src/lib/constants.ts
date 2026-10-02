export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
export const TOP_LIGHT_LUMINANCE = 0.60
export const MAX_LOGO_HEIGHT_RATIO = 0.25
export const STANDARD_POSTER_HEIGHT = 570
export const CHAR_WIDTH_FACTOR = 0.62
export const BADGE_PADDING_FACTOR = 0.35
export const BADGE_BORDER_RADIUS_FACTOR = 0.7
export const BADGE_SHADOW_BLUR_FACTOR = 0.6
export const BADGE_SHADOW_OFFSET_FACTOR = 0.2
export const RANKING_BAR_PADDING_FACTOR = 0.35
export const GENRE_BAR_PADDING_FACTOR = 0.5
export const POSTER_WIDTH_BASE = 380
export const RANKING_FONT_SIZE_BASE = 23
export const GENRE_FONT_SIZE_BASE = 24

// Canvas poster (browser-safe: questo modulo non importa sharp né Node API,
// quindi è importabile dai componenti client).
// Portrait standard 500×750 vive in image-utils.ts (server, con sharp);
// qui solo le dimensioni landscape 16:9, necessarie anche al client
// (slider logo, preview) senza trascinare sharp nel bundle browser.
export const LAND_W = 768
export const LAND_H = 432
