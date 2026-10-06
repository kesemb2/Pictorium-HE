import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { cacheClear } from "@/lib/cache"
import { __clearTMDBCache } from "@/lib/tmdb"
import { getRegionDef, resolveContentLang } from "@/lib/regions"

// La lingua dei contenuti dell'addon è quella scelta nella UI (salvata nello
// spazio), non quella della regione: con regione US i poster e i loghi in
// Nuvio uscivano in inglese.
vi.mock("@/lib/top-today", () => ({ getTopToday: vi.fn(async () => [30]), topTodayRank: vi.fn(async () => null) }))
vi.mock("@/lib/store", () => ({ getById: vi.fn(async () => null) }))
vi.mock("@/lib/server-defaults", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/server-defaults")>()
  const mocked = vi.fn(() => ({}))
  return { ...mod, getServerDefaults: mocked, getServerDefaultsChecked: vi.fn(async () => mocked()) }
})

const { GET } = await import("@/app/catalog/[type]/[id]/route")
const { buildManifestResponse } = await import("@/lib/build-manifest")
const { getServerDefaults } = await import("@/lib/server-defaults")

function defaults(sd: Record<string, unknown>) {
  vi.mocked(getServerDefaults).mockReturnValue(sd as never)
}

function tmdbRecorder(): string[] {
  const urls: string[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    urls.push(url)
    if (/\/3\/movie\/30(\?|$)/.test(url)) return Response.json({ id: 30, title: "Title 30", release_date: "2026-09-01" })
    return Response.json({ status_message: "not found" }, { status: 404 })
  })
  return urls
}

afterEach(() => {
  vi.restoreAllMocks()
  defaults({})
  cacheClear()
  __clearTMDBCache()
})

describe("content language chain", () => {
  it("query > token > space > region", () => {
    const us = getRegionDef("US")
    expect(resolveContentLang(null, null, null, us)).toBe("en")
    expect(resolveContentLang(null, null, "he", us)).toBe("he")
    expect(resolveContentLang(null, "it", "he", us)).toBe("it")
    expect(resolveContentLang("fr", "it", "he", us)).toBe("fr")
    expect(resolveContentLang(null, null, "xx", us)).toBe("en")
  })
})

describe("addon follows the space language, not the region", () => {
  it("region US + Hebrew chosen: catalog posters, logos and TMDB text are Hebrew", async () => {
    defaults({ region: "US", language: "he" })
    const urls = tmdbRecorder()
    const req = new NextRequest("http://localhost:3000/catalog/movie/pictorium-today-movies.json?api_key=k")
    const res = await GET(req, { params: Promise.resolve({ type: "movie", id: "pictorium-today-movies.json" }) })
    const meta = (await res.json()).metas[0]
    expect(new URL(meta.poster).searchParams.get("lang")).toBe("he")
    expect(new URL(meta.logo).searchParams.get("lang")).toBe("he")
    expect(urls.find((u) => /\/3\/movie\/30\?/.test(u))).toContain("language=he")
  })

  it("without a saved language the region still decides (unchanged)", async () => {
    defaults({ region: "US" })
    tmdbRecorder()
    const req = new NextRequest("http://localhost:3000/catalog/movie/pictorium-today-movies.json?api_key=k")
    const res = await GET(req, { params: Promise.resolve({ type: "movie", id: "pictorium-today-movies.json" }) })
    expect(new URL((await res.json()).metas[0].poster).searchParams.get("lang")).toBe("en")
  })

  it("the manifest catalog names follow the space language", async () => {
    defaults({ region: "US", language: "he" })
    const he = await (await buildManifestResponse(new NextRequest("http://localhost:3000/manifest.json"))).json()
    expect(he.catalogs.map((c: { name: string }) => c.name)).toContain("🔟 טופ 10 היום — סרטים")
    defaults({ region: "US" })
    const en = await (await buildManifestResponse(new NextRequest("http://localhost:3000/manifest.json"))).json()
    expect(en.catalogs.map((c: { name: string }) => c.name)).not.toContain("🔟 טופ 10 היום — סרטים")
  })
})
