import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { cacheClear } from "@/lib/cache"
import { __clearTMDBCache } from "@/lib/tmdb"

vi.mock("@/lib/top-today", () => ({ getTopToday: vi.fn(), topTodayRank: vi.fn(async () => null) }))
vi.mock("@/lib/store", () => ({ getById: vi.fn(async () => null) }))
vi.mock("@/lib/server-defaults", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/server-defaults")>()
  const mocked = vi.fn(() => ({}))
  return { ...mod, getServerDefaults: mocked, getServerDefaultsChecked: vi.fn(async () => mocked()) }
})

const { GET } = await import("@/app/catalog/[type]/[id]/route")
const { getTopToday } = await import("@/lib/top-today")
const { PICTORIUM_CATALOGS } = await import("@/lib/catalog-definitions")
const { localizeCatalogName } = await import("@/lib/stremio-labels")

/** TMDB finto: dettagli per id, tutto il resto 404. */
function tmdbByUrl() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    const m = url.match(/\/3\/(movie|tv)\/(\d+)(\?|$)/)
    if (m?.[1] === "movie") return Response.json({ id: Number(m[2]), title: `Title ${m[2]}`, release_date: "2026-09-01" })
    if (m?.[1] === "tv") return Response.json({ id: Number(m[2]), name: `Show ${m[2]}`, first_air_date: "2026-08-01" })
    return Response.json({ status_message: "not found" }, { status: 404 })
  })
}

async function catalog(type: "movie" | "series", id: string, extra = "") {
  const req = new NextRequest(`http://localhost:3000/catalog/${type}/${id}.json?api_key=settings-key${extra}`)
  const res = await GET(req, { params: Promise.resolve({ type, id: `${id}.json` }) })
  return { res, body: await res.json() }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(getTopToday).mockReset()
  cacheClear()
  __clearTMDBCache()
})

describe("Top 10 today catalogs (same list as the landscape strip)", () => {
  it("are in the manifest catalog list with Hebrew names", () => {
    const ids = PICTORIUM_CATALOGS.map((c) => c.id)
    expect(ids).toContain("pictorium-today-movies")
    expect(ids).toContain("pictorium-today-series")
    const movies = PICTORIUM_CATALOGS.find((c) => c.id === "pictorium-today-movies")!
    const series = PICTORIUM_CATALOGS.find((c) => c.id === "pictorium-today-series")!
    expect(localizeCatalogName(movies.name, "he")).toBe("🔟 טופ 10 היום — סרטים")
    expect(localizeCatalogName(series.name, "he")).toBe("🔟 טופ 10 היום — סדרות")
  })

  it("serves the movies in the list order", async () => {
    vi.mocked(getTopToday).mockResolvedValue([30, 10, 20])
    tmdbByUrl()
    const { res, body } = await catalog("movie", "pictorium-today-movies")
    expect(res.status).toBe(200)
    expect(getTopToday).toHaveBeenCalledWith("movie", "settings-key")
    expect(body.metas.map((m: { name: string }) => m.name)).toEqual(["Title 30", "Title 10", "Title 20"])
    expect(body.metas[0].poster).toContain("/api/poster/movie/30")
    // Il rank non viaggia come badge anime.
    expect(body.metas[0].poster).not.toContain("animerank")
  })

  it("serves the shows from the tv list, and nothing past the first page", async () => {
    vi.mocked(getTopToday).mockResolvedValue([7])
    tmdbByUrl()
    const { body } = await catalog("series", "pictorium-today-series")
    expect(getTopToday).toHaveBeenCalledWith("tv", "settings-key")
    expect(body.metas).toHaveLength(1)
    expect(body.metas[0]).toMatchObject({ type: "series", name: "Show 7" })
    const req = new NextRequest("http://localhost:3000/catalog/series/pictorium-today-series/skip=20.json?api_key=settings-key")
    const { GET: GET_EXTRA } = await import("@/app/catalog/[type]/[id]/[...extra]/route")
    const res = await GET_EXTRA(req, { params: Promise.resolve({ type: "series", id: "pictorium-today-series", extra: ["skip=20.json"] }) })
    expect((await res.json()).metas).toEqual([])
  })
})

describe("new built-in catalogs in a saved order", () => {
  it("land right after the built-in that precedes them, not at the bottom", async () => {
    const { catalogOrderPosition } = await import("@/lib/catalog-definitions")
    const { PICTORIUM_CATALOGS } = await import("@/lib/catalog-definitions")
    // Ordine completo salvato dal gestore prima dei "Top 10 Oggi", con la
    // Netflix film spostata in cima.
    const builtins = PICTORIUM_CATALOGS.map((c) => c.id).filter((id) => !id.startsWith("pictorium-today-"))
    const saved = ["pictorium-netflix-movies", ...builtins.filter((id) => id !== "pictorium-netflix-movies")]
    const map = new Map(saved.map((id, i) => [id, i]))
    const ids = [...saved, "pictorium-today-movies", "pictorium-today-series", "pictorium-custom-movie-x"]
    const sorted = [...ids].sort((a, b) => catalogOrderPosition(a, map) - catalogOrderPosition(b, map))
    expect(sorted.slice(0, 5)).toEqual([
      "pictorium-netflix-movies", "pictorium-jw-movies", "pictorium-jw-series",
      "pictorium-today-movies", "pictorium-today-series",
    ])
    expect(sorted.at(-1)).toBe("pictorium-custom-movie-x")
  })

  it("a partial order keeps listed first and the rest at the bottom", async () => {
    const { catalogOrderPosition } = await import("@/lib/catalog-definitions")
    const map = new Map(["pictorium-anime", "pictorium-jw-movies"].map((id, i) => [id, i]))
    expect(catalogOrderPosition("pictorium-today-movies", map)).toBe(9999)
    expect(catalogOrderPosition("pictorium-jw-movies", map)).toBe(1)
  })
})

describe("per-catalog poster shape (as in AIOMetadata)", () => {
  // La forma si salva nei default dello spazio (Impostazioni → Cataloghi):
  // il catalogo la legge da lì.
  async function withDefaults(sd: Record<string, unknown>) {
    const { getServerDefaults } = await import("@/lib/server-defaults")
    vi.mocked(getServerDefaults).mockReturnValue(sd as never)
  }
  afterEach(async () => { await withDefaults({}) })

  it("a catalog set to landscape serves landscape posters; the others keep the global shape", async () => {
    await withDefaults({ catalogShapes: { "pictorium-today-movies": "landscape" } })
    vi.mocked(getTopToday).mockResolvedValue([30])
    tmdbByUrl()
    const land = await catalog("movie", "pictorium-today-movies")
    expect(land.body.metas[0].posterShape).toBe("landscape")
    expect(land.body.metas[0].poster).toContain("shape=landscape")
    expect(land.body.metas[0].landscapePoster).toBe(land.body.metas[0].poster)
    // Il logo arriva anche in landscape (come AIOMetadata).
    expect(land.body.metas[0].logo).toBe("http://localhost:3000/api/logo/movie/30?lang=he")
    const other = await catalog("series", "pictorium-today-series")
    expect(other.body.metas[0]?.posterShape ?? "poster").toBe("poster")
  })

  it("a catalog forced to portrait wins over a global landscape default", async () => {
    await withDefaults({ posterShape: "landscape", catalogShapes: { "pictorium-today-movies": "poster" } })
    vi.mocked(getTopToday).mockResolvedValue([40])
    tmdbByUrl()
    const res = await catalog("movie", "pictorium-today-movies")
    expect(res.body.metas[0].posterShape).toBe("poster")
    expect(res.body.metas[0].poster).not.toContain("shape=landscape")
  })
})

describe("logo URL on catalog metas (as AIOMetadata does with the logo pattern)", () => {
  async function withDefaults(sd: Record<string, unknown>) {
    const { getServerDefaults } = await import("@/lib/server-defaults")
    vi.mocked(getServerDefaults).mockReturnValue(sd as never)
  }
  afterEach(async () => { await withDefaults({}) })

  it("every meta carries our /api/logo URL, with no key in it", async () => {
    vi.mocked(getTopToday).mockResolvedValue([30, 10])
    tmdbByUrl()
    const { body } = await catalog("movie", "pictorium-today-movies")
    expect(body.metas.map((m: { logo: string }) => m.logo)).toEqual([
      "http://localhost:3000/api/logo/movie/30?lang=he",
      "http://localhost:3000/api/logo/movie/10?lang=he",
    ])
    expect(body.metas[0].logo).not.toContain("api_key")
  })

  it("series use the series path, and the IMDB id when known", async () => {
    vi.mocked(getTopToday).mockResolvedValue([77])
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input)
      if (/\/3\/tv\/77\/external_ids/.test(url)) return Response.json({ id: 77, imdb_id: "tt0000077" })
      if (/\/3\/tv\/77(\?|$)/.test(url)) return Response.json({ id: 77, name: "Show 77", first_air_date: "2026-08-01" })
      return Response.json({ status_message: "not found" }, { status: 404 })
    })
    const { body } = await catalog("series", "pictorium-today-series")
    expect(body.metas[0].logo).toBe("http://localhost:3000/api/logo/series/tt0000077?lang=he")
  })

  it("carries the space's Hebrew font when it isn't the default", async () => {
    await withDefaults({ hebrewFont: "heebo" })
    vi.mocked(getTopToday).mockResolvedValue([30])
    tmdbByUrl()
    const { body } = await catalog("movie", "pictorium-today-movies")
    expect(body.metas[0].logo).toBe("http://localhost:3000/api/logo/movie/30?lang=he&hfont=heebo")
  })
})
