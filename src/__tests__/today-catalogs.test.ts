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
    // Ordine salvato prima dei "Top 10 Oggi": JW serie è terzo.
    const saved = ["pictorium-netflix-movies", "pictorium-jw-movies", "pictorium-jw-series", "pictorium-anime"]
    const map = new Map(saved.map((id, i) => [id, i]))
    const ids = [...saved, "pictorium-today-movies", "pictorium-today-series", "pictorium-custom-movie-x"]
    const sorted = [...ids].sort((a, b) => catalogOrderPosition(a, map) - catalogOrderPosition(b, map))
    expect(sorted).toEqual([
      "pictorium-netflix-movies", "pictorium-jw-movies", "pictorium-jw-series",
      "pictorium-today-movies", "pictorium-today-series", "pictorium-anime", "pictorium-custom-movie-x",
    ])
  })
})
