import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { cacheClear } from "@/lib/cache"
import type { TMDBStillLite } from "@/lib/tmdb"

// Il pattern che si incolla in AIOMetadata non porta per forza la chiave: con
// lo spazio `u` la route la prende da lì, come logo e poster.
vi.mock("@/lib/user-auth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/user-auth")>()
  return {
    ...mod,
    getScopedUserId: vi.fn((u: string | null | undefined) => u || null),
    userExists: vi.fn(async (u: string) => u === "space-1"),
  }
})
vi.mock("@/lib/user-keys", () => ({ getUserKeys: vi.fn(async () => ({ tmdb: "space-key" })) }))
vi.mock("@/lib/imdb-resolver", () => ({
  resolveImdbToTmdb: vi.fn(async (imdb: string) => (imdb === "tt0944947" ? 1399 : null)),
}))

const still = (over: Partial<TMDBStillLite>): TMDBStillLite => ({
  file_path: "/x.jpg", iso_639_1: null, width: 1920, height: 1080, vote_average: 0, ...over,
})

vi.mock("@/lib/tmdb", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/tmdb")>()
  return {
    ...mod,
    getEpisodeStills: vi.fn(async () => [
      still({ file_path: "/en-wide.jpg", iso_639_1: "en", width: 3840 }),
      still({ file_path: "/clean-small.jpg", width: 1280, vote_average: 9 }),
      still({ file_path: "/clean-wide.jpg", width: 1920 }),
    ]),
  }
})

const { GET } = await import("@/app/api/thumbnail/[id]/[ep]/route")
const { getEpisodeStills } = await import("@/lib/tmdb")
const { resolveImdbToTmdb } = await import("@/lib/imdb-resolver")
const { parseEpisodeSegment, pickEpisodeStill, safeFallbackUrl, tmdbOriginalUrl } = await import("@/lib/episode-thumbnail")
const { buildThumbnailUrlPattern } = await import("@/lib/poster-url")

async function thumb(id: string, ep: string, query = "") {
  const req = new NextRequest(`http://localhost:3000/api/thumbnail/${id}/${ep}${query ? `?${query}` : ""}`)
  return GET(req, { params: Promise.resolve({ id, ep }) })
}

afterEach(() => {
  vi.mocked(getEpisodeStills).mockClear()
  vi.mocked(resolveImdbToTmdb).mockClear()
  cacheClear()
})

describe("episode still choice", () => {
  it("prefers a still without language, then the widest, then votes", () => {
    expect(pickEpisodeStill([
      still({ file_path: "/en.jpg", iso_639_1: "en", width: 3840 }),
      still({ file_path: "/a.jpg", width: 1280, vote_average: 9 }),
      still({ file_path: "/b.jpg", width: 1920 }),
    ])?.file_path).toBe("/b.jpg")
    expect(pickEpisodeStill([
      still({ file_path: "/low.jpg", vote_average: 2 }),
      still({ file_path: "/high.jpg", vote_average: 8 }),
    ])?.file_path).toBe("/high.jpg")
    expect(pickEpisodeStill([])).toBeNull()
  })

  it("parses the episode segment", () => {
    expect(parseEpisodeSegment("S1E2")).toEqual({ season: 1, episode: 2 })
    expect(parseEpisodeSegment("s01e02.jpg")).toEqual({ season: 1, episode: 2 })
    expect(parseEpisodeSegment("S0E5")).toEqual({ season: 0, episode: 5 })
    expect(parseEpisodeSegment("X1")).toBeNull()
    expect(parseEpisodeSegment("S1E")).toBeNull()
  })

  it("always upgrades TMDB images to the original size", () => {
    expect(tmdbOriginalUrl("/a.jpg")).toBe("https://image.tmdb.org/t/p/original/a.jpg")
    expect(tmdbOriginalUrl("https://image.tmdb.org/t/p/w300/a.jpg")).toBe("https://image.tmdb.org/t/p/original/a.jpg")
  })

  it("accepts a fallback only from known image hosts", () => {
    expect(safeFallbackUrl("https://image.tmdb.org/t/p/w500/a.jpg")).toBe("https://image.tmdb.org/t/p/original/a.jpg")
    expect(safeFallbackUrl("https://evil.example/a.jpg")).toBeNull()
    expect(safeFallbackUrl("")).toBeNull()
    expect(safeFallbackUrl(null)).toBeNull()
  })
})

describe("thumbnail route", () => {
  it("redirects to the clean still in original quality, cached for a week", async () => {
    const res = await thumb("1399", "S1E2", "api_key=k")
    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("https://image.tmdb.org/t/p/original/clean-wide.jpg")
    expect(res.headers.get("Cache-Control")).toContain("max-age=604800")
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(vi.mocked(getEpisodeStills).mock.calls[0]?.slice(0, 4)).toEqual([1399, 1, 2, "k"])
  })

  it("resolves an IMDb id of the series to TMDB", async () => {
    const res = await thumb("tt0944947", "S01E02.jpg", "api_key=k")
    expect(res.status).toBe(302)
    expect(vi.mocked(resolveImdbToTmdb)).toHaveBeenCalledWith("tt0944947", "tv", "k")
    expect(vi.mocked(getEpisodeStills).mock.calls[0]?.[0]).toBe(1399)
  })

  it("takes the TMDB key from the space", async () => {
    await thumb("1399", "S1E1", "u=space-1")
    expect(vi.mocked(getEpisodeStills).mock.calls[0]?.[3]).toBe("space-key")
  })

  it("memoises the chosen still", async () => {
    await thumb("1399", "S2E3", "api_key=k")
    await thumb("1399", "S2E3", "api_key=k")
    expect(vi.mocked(getEpisodeStills)).toHaveBeenCalledTimes(1)
  })

  it("rejects a malformed episode", async () => {
    const res = await thumb("1399", "X1", "api_key=k")
    expect(res.status).toBe(400)
  })

  it("without stills follows a safe fallback, upgraded to original", async () => {
    vi.mocked(getEpisodeStills).mockResolvedValueOnce([])
    const fallback = encodeURIComponent("https://image.tmdb.org/t/p/w500/aio.jpg")
    const res = await thumb("1399", "S3E1", `api_key=k&fallback=${fallback}`)
    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("https://image.tmdb.org/t/p/original/aio.jpg")
  })

  it("never redirects to a foreign host", async () => {
    vi.mocked(getEpisodeStills).mockResolvedValueOnce([])
    const res = await thumb("1399", "S3E2", `api_key=k&fallback=${encodeURIComponent("https://evil.example/x.jpg")}`)
    expect(res.status).toBe(404)
    expect(res.headers.get("Location")).toBeNull()
  })

  it("an unknown series falls back or 404s", async () => {
    expect((await thumb("tt0000001", "S1E1", "api_key=k")).status).toBe(404)
    const fallback = encodeURIComponent("https://image.tmdb.org/t/p/w780/aio.jpg")
    const res = await thumb("tt0000001", "S1E1", `api_key=k&fallback=${fallback}`)
    expect(res.headers.get("Location")).toBe("https://image.tmdb.org/t/p/original/aio.jpg")
  })

  it("a TMDB error is not memoised", async () => {
    vi.mocked(getEpisodeStills).mockRejectedValueOnce(new Error("timeout"))
    expect((await thumb("1399", "S4E1", "api_key=k")).status).toBe(404)
    expect((await thumb("1399", "S4E1", "api_key=k")).status).toBe(302)
  })
})

describe("thumbnail URL pattern", () => {
  it("uses the series ids, season/episode and AIOMetadata's own thumbnail as fallback", () => {
    const p = buildThumbnailUrlPattern({ tmdbKey: "abc" })
    expect(p).toContain("/api/thumbnail/{imdb_id|tmdb_id}/S{season}E{episode}?")
    expect(p).toContain("api_key=abc")
    expect(p.endsWith("fallback={thumbnail}")).toBe(true)
  })

  it("carries no key when there is none", () => {
    expect(buildThumbnailUrlPattern({})).not.toContain("api_key")
  })
})
