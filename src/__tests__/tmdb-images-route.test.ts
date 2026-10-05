import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { cacheClear, cacheGet } from "@/lib/cache"

// La chiave di cache porta in coda quali fonti c'erano (`fa`/`x` per fanart,
// `tv`/`x` per TVDB): accendere una chiave deve cambiare la risposta, non
// riusare quella calcolata senza.

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, retAfter: 0 })),
  rateLimitKey: vi.fn(() => "test"),
  rateLimitResponse: vi.fn(() => new Response("rate limited", { status: 429 })),
}))

vi.mock("@/lib/tmdb", () => ({
  getImages: vi.fn(),
  getExternalIds: vi.fn(async () => ({ imdb_id: "tt0000042", tvdb_id: null })),
  resolveRouteApiKey: vi.fn(async () => undefined),
}))

vi.mock("@/lib/fanart-artwork", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fanart-artwork")>()
  return { ...actual, fanartApiKey: vi.fn(() => undefined), getFanartMovie: vi.fn(), getFanartTv: vi.fn() }
})

// fanart e TVDB passano dal controllo vero (chiamate interne al modulo, non
// intercettabili): immagini finte e rilevatore "senza testo".
vi.mock("@/lib/poster-render-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/poster-render-helpers")>()
  return { ...actual, fetchImg: vi.fn(async () => Buffer.from("img")) }
})
vi.mock("@/lib/poster-text-detect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/poster-text-detect")>()
  return { ...actual, detectPosterText: vi.fn(async () => ({ hasText: false, score: 0.1, band: null })) }
})

vi.mock("@/lib/tvdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tvdb")>()
  return { ...actual, getTvdbMovieId: vi.fn(async () => 77), getTvdbSeriesId: vi.fn(async () => 78), getTvdbArtworks: vi.fn(async () => []) }
})

// Verifica "senza testo" dei clean: di default passa tutto (nessuna rete nei
// test); il test dedicato la fa fallire per un poster.
vi.mock("@/lib/poster-textless", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/poster-textless")>()
  return { ...actual, verifyCleanPool: vi.fn(async (sources: readonly string[], opts: { limit: number }) => sources.slice(0, opts.limit)) }
})

const { GET } = await import("@/app/api/tmdb/[id]/images/route")
const { verifyCleanPool } = await import("@/lib/poster-textless")
const { getImages, resolveRouteApiKey } = await import("@/lib/tmdb")
const { getFanartMovie } = await import("@/lib/fanart-artwork")
const { getTvdbArtworks, getTvdbMovieId } = await import("@/lib/tvdb")
const mockedGetImages = vi.mocked(getImages)

function req(id: string): NextRequest {
  // Niente gzip: il corpo dei pool grandi resta leggibile con res.json().
  return new NextRequest(`http://localhost:3000/api/tmdb/${id}/images?type=movie&languages=en,null`, { headers: { "accept-encoding": "identity" } })
}

const VALID_DATA = {
  id: 42,
  backdrops: [{ file_path: "/b1.jpg", aspect_ratio: 1.78, height: 720, iso_639_1: null, vote_average: 5, vote_count: 1, width: 1280 }],
  posters: [{ file_path: "/p1.jpg", aspect_ratio: 0.667, height: 1080, iso_639_1: null, vote_average: 6, vote_count: 2, width: 720 }],
  logos: [],
}

describe("GET /api/tmdb/[id]/images (H4: niente cache poisoning su errore upstream)", () => {
  beforeEach(() => {
    cacheClear()
    mockedGetImages.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cacheClear()
  })

  it("risponde 502 e NON mette in cache quando il fetch TMDB fallisce", async () => {
    mockedGetImages.mockRejectedValue(new Error("TMDB down"))
    const res = await GET(req("42"), { params: Promise.resolve({ id: "42" }) })

    expect(res.status).toBe(502)
    // Nessun record in cache per la chiave della richiesta (prima il catch
    // cacettava la lista vuota per 30 minuti, avvelenando l'editor).
    expect(cacheGet(`images:movie:42:en,null:ft4:xx`)).toBeNull()
  })

  it("risponde 200 e mette in cache quando il fetch TMDB riesce (anche con liste vuote valide)", async () => {
    mockedGetImages.mockResolvedValue(VALID_DATA as never)
    const res = await GET(req("42"), { params: Promise.resolve({ id: "42" }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.posters).toHaveLength(1)

    // Il dato valido è in cache: la seconda richiesta non tocca più TMDB.
    const res2 = await GET(req("42"), { params: Promise.resolve({ id: "42" }) })
    expect(res2.status).toBe(200)
    expect(mockedGetImages).toHaveBeenCalledTimes(1)
  })

  it("marks a TMDB \"clean\" with printed text as \"und\" (never clean in the editor)", async () => {
    mockedGetImages.mockResolvedValue({
      ...VALID_DATA,
      posters: [
        { ...VALID_DATA.posters[0], file_path: "/texted.jpg" },
        { ...VALID_DATA.posters[0], file_path: "/clean.jpg" },
        { ...VALID_DATA.posters[0], file_path: "/en.jpg", iso_639_1: "en" },
      ],
    } as never)
    vi.mocked(verifyCleanPool).mockImplementationOnce(async (sources) => sources.filter((p) => p !== "/texted.jpg"))
    const res = await GET(req("44"), { params: Promise.resolve({ id: "44" }) })
    const body = await res.json()
    expect(body.posters.map((p: { file_path: string; iso_639_1: string | null }) => [p.file_path, p.iso_639_1])).toEqual([
      ["/texted.jpg", "und"],
      ["/clean.jpg", null],
      ["/en.jpg", "en"],
    ])
  })

  it("un errore dopo un successo NON sovrascrive la cache valida", async () => {
    mockedGetImages.mockResolvedValueOnce(VALID_DATA as never).mockRejectedValueOnce(new Error("boom"))
    await GET(req("42"), { params: Promise.resolve({ id: "42" }) })

    const res = await GET(req("43"), { params: Promise.resolve({ id: "43" }) })
    expect(res.status).toBe(502)
    expect(cacheGet(`images:movie:43:en,null:ft4:xx`)).toBeNull()
    // La cache chiave 42 resta valida.
    expect(cacheGet(`images:movie:42:en,null:ft4:xx`)).toEqual(VALID_DATA)
  })

  it("verifies the whole TMDB clean pool, not just the first six", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...VALID_DATA.posters[0], file_path: `/c${i}.jpg` }))
    mockedGetImages.mockResolvedValue({ ...VALID_DATA, posters: many } as never)
    const res = await GET(req("45"), { params: Promise.resolve({ id: "45" }) })
    const body = await res.json()
    expect(body.posters.filter((p: { iso_639_1: string | null }) => p.iso_639_1 === null)).toHaveLength(12)
    expect(vi.mocked(verifyCleanPool).mock.calls[0]![1].limit).toBe(30)
  })

  it("adds verified fanart and TVDB posters after TMDB, with their source", async () => {
    vi.mocked(resolveRouteApiKey).mockImplementation(async (_req, kind) => (kind === "fanart" ? "fa-key" : kind === "tvdb" ? "tv-key" : undefined))
    vi.mocked(getFanartMovie).mockResolvedValue({
      posters: [
        { id: "f1", url: "https://assets.fanart.tv/fanart/movies/46/movieposter/none.jpg", lang: "00", likes: 5 },
        { id: "f2", url: "https://assets.fanart.tv/fanart/movies/46/movieposter/unlabelled.jpg", lang: "", likes: 3 },
        { id: "f3", url: "https://assets.fanart.tv/fanart/movies/46/movieposter/en.jpg", lang: "en", likes: 9 },
      ],
      logos: [],
      backgrounds: [],
    })
    vi.mocked(getTvdbArtworks).mockResolvedValue([
      { image: "https://artworks.thetvdb.com/banners/v4/movie/77/posters/clean.jpg", includesText: false, score: 3 },
      { image: "https://artworks.thetvdb.com/banners/v4/movie/77/posters/texted.jpg", includesText: true, score: 9 },
    ])
    mockedGetImages.mockResolvedValue(VALID_DATA as never)
    const res = await GET(req("46"), { params: Promise.resolve({ id: "46" }) })
    const body = await res.json()
    const rows = body.posters.map((p: { file_path: string; iso_639_1: string | null; source?: string }) => [p.file_path.split("/").pop(), p.iso_639_1, p.source ?? "tmdb"])
    expect(rows).toEqual([
      ["p1.jpg", null, "tmdb"],
      ["none.jpg", null, "fanart"],
      ["unlabelled.jpg", null, "fanart"],
      ["en.jpg", "en", "fanart"],
      ["clean.jpg", null, "tvdb"],
    ])
    expect(getFanartMovie).toHaveBeenCalledWith(46, expect.anything(), "fa-key")
    expect(getTvdbMovieId).toHaveBeenCalledWith("tt0000042", "tv-key", expect.anything())
    expect(cacheGet(`images:movie:46:en,null:ft4:fatv`)).not.toBeNull()
    vi.mocked(resolveRouteApiKey).mockImplementation(async () => undefined)
  })

  it("never asks TVDB without a key", async () => {
    vi.mocked(getTvdbArtworks).mockClear()
    vi.mocked(getFanartMovie).mockClear()
    mockedGetImages.mockResolvedValue(VALID_DATA as never)
    await GET(req("47"), { params: Promise.resolve({ id: "47" }) })
    expect(getTvdbArtworks).not.toHaveBeenCalled()
    expect(getFanartMovie).not.toHaveBeenCalled()
  })
})
