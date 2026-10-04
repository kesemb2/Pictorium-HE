import { describe, expect, it, vi } from "vitest"
import type { Mapping } from "@/lib/types"

let stored: Mapping | null = null
vi.mock("@/lib/store", () => ({
  getById: vi.fn(async () => (stored ? { ...stored } : null)),
  upsert: vi.fn(async (m: Mapping) => { stored = m }),
}))

const { tryRotatePoster, getEffectiveRotationState } = await import("@/lib/poster-rotation")

const FANART_TITLED = "https://assets.fanart.tv/fanart/movies/1/movieposter/titled.jpg"

function due(input: Partial<Mapping>): Mapping {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Rotation",
    posterPath: "/a.jpg",
    logoPath: "/logo.png",
    originalPosterPath: null,
    language: null,
    autoRotateClean: true,
    cleanPosterIndex: 0,
    cleanPosterUpdatedAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    ...input,
  }
}

describe("tryRotatePoster with rejected paths", () => {
  it("never rotates onto a rejected (texted fanart) poster", async () => {
    stored = due({ cleanPosters: ["/a.jpg", FANART_TITLED, "/c.jpg"] })
    const reject = vi.fn(async () => new Set([FANART_TITLED]))
    const rotated = await tryRotatePoster(stored, getEffectiveRotationState(stored), reject)
    expect(reject).toHaveBeenCalledWith(["/a.jpg", FANART_TITLED, "/c.jpg"])
    expect(rotated?.posterPath).toBe("/c.jpg")
  })

  it("stops rotating when rejections leave fewer than two posters", async () => {
    stored = due({ cleanPosters: ["/a.jpg", FANART_TITLED] })
    const rotated = await tryRotatePoster(stored, getEffectiveRotationState(stored), async () => new Set([FANART_TITLED]))
    expect(rotated).toBeNull()
  })

  it("keeps rotating normally when the filter fails", async () => {
    stored = due({ cleanPosters: ["/a.jpg", "/b.jpg"] })
    const rotated = await tryRotatePoster(stored, getEffectiveRotationState(stored), async () => { throw new Error("boom") })
    expect(rotated?.posterPath).toBe("/b.jpg")
  })
})
