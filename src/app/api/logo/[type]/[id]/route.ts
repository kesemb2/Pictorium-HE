import type { NextRequest } from "next/server"
import sharp from "sharp"
import { initSharp } from "@/lib/sharp-config"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { resolveImdbToTmdb } from "@/lib/imdb-resolver"
import { getDetailsWithExternalIds, getImages, resolveRequestApiKey } from "@/lib/tmdb"
import { getFanartMovie, getFanartTv, type FanartImage } from "@/lib/fanart"
import { fetchImg, imgSrc, isAllowedImageUrl } from "@/lib/poster-render-helpers"
import { chooseLogo, composeLogoImage, inkLuminanceScorer, localizedTitle, whitenLogo } from "@/lib/logo-image"
import { cacheGet, cacheSet } from "@/lib/cache"
import { RENDER_VERSION } from "@/lib/render-version"
import { recordPosterUrl } from "@/lib/poster-url-log"
import { createLogger } from "@/lib/logger"
import { validatePosterQuery } from "@/lib/validation"
import type { TMDBImage } from "@/lib/types"

const log = createLogger("logo")

export const maxDuration = 20

const LOGO_TTL_MS = 24 * 60 * 60 * 1000
const LOGO_TIMEOUT_MS = 8000

function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }
}

function logoHeaders(etag: string, contentType: string): Record<string, string> {
  return {
    ...corsHeaders(),
    "Content-Type": contentType,
    // Stessa forma del poster: un logo cambia solo quando cambia l'artwork
    // upstream, quindi la CDN è il posto giusto per tenerlo.
    "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    "CDN-Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    "ETag": etag,
  }
}

interface RouteParams { type: string; id: string }

/**
 * Logo del titolo, reso per un'interfaccia scura: ebraico quando esiste,
 * altrimenti inglese col titolo tradotto sotto, e in entrambi i casi chiaro.
 * Vedi `src/lib/logo-image.ts` per la scala di scelta.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  initSharp()
  const rl = await rateLimit(rateLimitKey(req), "logo")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)

  const invalidQuery = validatePosterQuery(req.nextUrl.searchParams)
  if (invalidQuery) return new Response(invalidQuery, { status: 400, headers: corsHeaders() })

  const { type, id } = await params
  const mediaType = ["series", "tv", "show", "tvshow"].includes(type?.toLowerCase() || "") ? "tv" : "movie"

  let tmdbId = Number(id)
  const apiKey = resolveRequestApiKey(req)
  if (isNaN(tmdbId) || tmdbId <= 0) {
    if (typeof id === "string" && id.startsWith("tt")) {
      const resolved = await resolveImdbToTmdb(id, mediaType, apiKey)
      if (resolved) tmdbId = resolved
    }
  }
  if (isNaN(tmdbId) || tmdbId <= 0) {
    return new Response("Invalid ID", { status: 400, headers: corsHeaders() })
  }

  // Stesso default del path poster, così i due pattern si comportano uguale.
  const lang = req.nextUrl.searchParams.get("lang") || "it"
  const wantsWebp = (req.nextUrl.searchParams.get("fmt") || "").toLowerCase() === "webp"
  const titleOverride = req.nextUrl.searchParams.get("title")
  const contentType = wantsWebp ? "image/webp" : "image/png"

  const cacheKey = `logo:${RENDER_VERSION}:${mediaType}:${tmdbId}:${lang}:${wantsWebp ? "webp" : "png"}:${titleOverride || ""}`
  const cached = cacheGet<Buffer>(cacheKey)
  if (cached) {
    return new Response(new Uint8Array(cached), { headers: logoHeaders(`"${cacheKey.length}-${cached.length}"`, contentType) })
  }

  try {
    const [details, images] = await Promise.all([
      getDetailsWithExternalIds(mediaType, tmdbId, lang, apiKey, undefined, LOGO_TIMEOUT_MS).catch(() => null),
      getImages(mediaType, tmdbId, `${lang},en,null`, apiKey, undefined, LOGO_TIMEOUT_MS).catch(() => null),
    ])

    // Stesso bacino del poster: TMDB più fanart, così le due superfici non
    // mostrano loghi diversi per lo stesso titolo.
    const imdbId = details?.external_ids?.imdb_id ?? null
    const tvdbId = details?.external_ids?.tvdb_id ?? null
    const fanart = await (mediaType === "tv"
      ? (tvdbId ? getFanartTv(tvdbId) : Promise.resolve(null))
      : getFanartMovie(imdbId || tmdbId)).catch(() => null)
    const fanartLogos: TMDBImage[] = (fanart?.logos ?? []).map((l: FanartImage) => ({
      file_path: l.url,
      iso_639_1: l.lang && l.lang !== "00" ? l.lang : null,
      width: 0,
      height: 0,
      aspect_ratio: 0,
      vote_average: l.likes,
      vote_count: l.likes,
    }))
    const allLogos: TMDBImage[] = [...(images?.logos ?? []), ...fanartLogos]
      .filter((l) => !l.file_path.startsWith("http") || isAllowedImageUrl(l.file_path))

    const fetchLogo = (path: string) => fetchImg(imgSrc(path))
    const choice = await chooseLogo(allLogos, lang, details?.original_language, inkLuminanceScorer(fetchLogo))
    if (!choice) {
      // Nessun logo in nessun livello: 404 e l'addon torna al suo fallback.
      log.info("No logo available", { mediaType, tmdbId, lang })
      return new Response("No logo", { status: 404, headers: corsHeaders() })
    }

    const raw = await fetchLogo(choice.logo.file_path)
    const logoBuf = choice.whitened ? await whitenLogo(raw) : raw
    const title = choice.needsTitle ? (titleOverride?.trim() || localizedTitle(details)) : null
    // Il logo non è nella lingua preferita e nemmeno il titolo si è potuto
    // risolvere (dettagli TMDB falliti, o titolo vuoto): l'utente resta con un
    // logo inglese e basta, ed è bene che si veda nei log.
    if (choice.needsTitle && !title) {
      log.warn("Logo not in the preferred language and no title to render under it", {
        mediaType, tmdbId, lang, logoLang: choice.lang, hasDetails: !!details,
      })
    }
    const { png: composed, titleRendered } = await composeLogoImage({ logoBuf, title })
    // Titolo chiesto ma non disegnato: quasi sempre resvg senza i file dei
    // font, che non solleva e rende trasparente. Vedi outputFileTracingIncludes.
    if (title && !titleRendered) {
      log.error("Title requested but nothing was drawn — are the fonts in this lambda?", { mediaType, tmdbId, lang })
    }
    const out = wantsWebp ? await sharp(composed).webp({ quality: 90 }).toBuffer() : composed

    cacheSet(cacheKey, out, ["logo"], LOGO_TTL_MS)
    log.info("Logo rendered", {
      mediaType, tmdbId, lang, logoLang: choice.lang,
      whitened: choice.whitened, titleWanted: !!title, titleRendered, bytes: out.byteLength,
    })
    recordPosterUrl(req.nextUrl)

    return new Response(new Uint8Array(out), { headers: logoHeaders(`"${cacheKey.length}-${out.length}"`, contentType) })
  } catch (e) {
    log.error("Logo generation failed", { error: e instanceof Error ? e.message : String(e) })
    return new Response("Logo generation failed", { status: 500, headers: corsHeaders() })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
