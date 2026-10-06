import sharp from "sharp"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { cacheClear } from "@/lib/cache"

// Le URL logo dell'addon non portano chiavi: portano lo spazio `u`, da cui
// la route deve prendere chiave TMDB e default, come la route poster.
vi.mock("@/lib/user-auth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/user-auth")>()
  return {
    ...mod,
    getScopedUserId: vi.fn((u: string | null | undefined) => u || null),
    userExists: vi.fn(async (u: string) => u === "space-1"),
  }
})
vi.mock("@/lib/user-keys", () => ({ getUserKeys: vi.fn(async () => ({ tmdb: "space-key" })) }))
vi.mock("@/lib/server-defaults", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/server-defaults")>()
  return {
    ...mod,
    getServerDefaultsChecked: vi.fn(async () => ({})),
    getServerDefaultsForUser: vi.fn(async () => ({ hebrewFont: "heebo" })),
  }
})
vi.mock("@/lib/fanart-artwork", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/fanart-artwork")>()
  return { ...mod, getFanartMovie: vi.fn(async () => null), getFanartTv: vi.fn(async () => null) }
})
vi.mock("@/lib/tmdb", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/tmdb")>()
  return {
    ...mod,
    getDetailsWithExternalIds: vi.fn(async (_t: string, id: number, _l: string, key?: string) => {
      if (!key) throw new Error("no key")
      return { id, title: "התחלה", original_language: "en", external_ids: {} }
    }),
    getImages: vi.fn(async (_t: string, _id: number, _l: string, key?: string) => {
      if (!key) throw new Error("no key")
      return { logos: [{ file_path: "/en.png", iso_639_1: "en", width: 400, height: 100, aspect_ratio: 4, vote_average: 5, vote_count: 5 }] }
    }),
  }
})
vi.mock("@/lib/poster-render-helpers", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/poster-render-helpers")>()
  const png = await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer()
  return { ...mod, fetchImg: vi.fn(async () => png) }
})

const { GET } = await import("@/app/api/logo/[type]/[id]/route")
const { getDetailsWithExternalIds } = await import("@/lib/tmdb")
const { getFanartMovie } = await import("@/lib/fanart-artwork")

async function logo(query: string) {
  const req = new NextRequest(`http://localhost:3000/api/logo/movie/27205?${query}`)
  return GET(req, { params: Promise.resolve({ type: "movie", id: "27205" }) })
}

afterEach(() => {
  vi.mocked(getDetailsWithExternalIds).mockClear()
  cacheClear()
})

describe("logo route with the user space (u)", () => {
  it("takes the TMDB key from the space, renders the Hebrew title and caches", async () => {
    const res = await logo("lang=he&u=space-1")
    expect(res.status).toBe(200)
    expect(vi.mocked(getDetailsWithExternalIds).mock.calls[0]?.[3]).toBe("space-key")
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400")
  })

  it("uses the space's Hebrew font", async () => {
    const spy = vi.spyOn(await import("@/lib/logo-image"), "composeLogoImage")
    await logo("lang=he&u=space-1")
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ title: "התחלה", hebrewFont: "heebo" })
    spy.mockRestore()
  })

  it("without any key serves a fallback that is never cached", async () => {
    const prev = { a: process.env.PICTORIUM_TMDB_KEY, b: process.env.TMDB_KEY, c: process.env.TMDB_API_KEY }
    delete process.env.PICTORIUM_TMDB_KEY; delete process.env.TMDB_KEY; delete process.env.TMDB_API_KEY
    try {
      // Spazio inesistente → anonimo → nessuna chiave: resta solo il logo
      // inglese di fanart, senza titolo. Si serve, ma mai in cache.
      vi.mocked(getFanartMovie).mockResolvedValueOnce({ logos: [{ id: "1", url: "https://assets.fanart.tv/fanart/movies/27205/hdmovielogo/x.png", lang: "en", likes: 1 }] } as never)
      const res = await logo("lang=he&u=nobody")
      expect(res.status).toBe(200)
      expect(res.headers.get("Cache-Control")).toBe("no-store")
    } finally {
      if (prev.a) process.env.PICTORIUM_TMDB_KEY = prev.a
      if (prev.b) process.env.TMDB_KEY = prev.b
      if (prev.c) process.env.TMDB_API_KEY = prev.c
    }
  })
})
