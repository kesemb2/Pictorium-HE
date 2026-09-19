import { beforeEach, describe, expect, it } from "vitest"
import {
  __WARM_URL_FLUSH_BATCH,
  __WARM_URL_MAX,
  __resetPosterUrlLogForTest,
  carriesCredential,
  recordPosterUrl,
  recordedPosterUrls,
} from "@/lib/poster-url-log"

const ORIGIN = "https://example.test"
const url = (pathAndQuery: string) => new URL(pathAndQuery, ORIGIN)

beforeEach(() => {
  __resetPosterUrlLogForTest()
})

describe("poster URL log", () => {
  it("records path and query exactly, because the CDN key is the whole URL", async () => {
    recordPosterUrl(url("/api/poster/movie/11?lang=he&dtx=1&halo=1"))
    expect(await recordedPosterUrls()).toEqual(["/api/poster/movie/11?lang=he&dtx=1&halo=1"])
  })

  it("treats two URLs differing by one param as different entries", async () => {
    recordPosterUrl(url("/api/poster/movie/11?lang=he"))
    recordPosterUrl(url("/api/poster/movie/11?lang=he&halo=0"))
    expect(await recordedPosterUrls()).toHaveLength(2)
  })

  it("never records a URL carrying a credential", async () => {
    for (const q of ["api_key=abc", "apikey=abc", "token=abc", "KEY=abc", "mdblist_key=abc"]) {
      recordPosterUrl(url(`/api/poster/movie/11?${q}`))
    }
    expect(await recordedPosterUrls()).toEqual([])
  })

  it("flags credential params case-insensitively", () => {
    expect(carriesCredential(new URLSearchParams("Api_Key=x"))).toBe(true)
    expect(carriesCredential(new URLSearchParams("lang=he&dtx=1"))).toBe(false)
  })

  it("dedupes and keeps the most recent first-seen order", async () => {
    recordPosterUrl(url("/api/poster/movie/1"))
    recordPosterUrl(url("/api/poster/movie/2"))
    recordPosterUrl(url("/api/poster/movie/1"))
    // Re-recording moves it to the back, so the trim keeps what is still in use.
    expect(await recordedPosterUrls()).toEqual(["/api/poster/movie/2", "/api/poster/movie/1"])
  })

  it("stays bounded, dropping the oldest", async () => {
    for (let i = 0; i < __WARM_URL_MAX + 50; i++) recordPosterUrl(url(`/api/poster/movie/${i}`))
    const list = await recordedPosterUrls()
    expect(list).toHaveLength(__WARM_URL_MAX)
    expect(list).not.toContain("/api/poster/movie/0")
    expect(list).toContain(`/api/poster/movie/${__WARM_URL_MAX + 49}`)
  })

  it("ignores an absurdly long URL instead of storing it", async () => {
    recordPosterUrl(url(`/api/poster/movie/11?x=${"a".repeat(4000)}`))
    expect(await recordedPosterUrls()).toEqual([])
  })

  it("works with no KV configured", async () => {
    // Nessun KV in ambiente di test: resta locale e non lancia.
    expect(process.env.KV_REST_API_URL).toBeUndefined()
    recordPosterUrl(url("/api/poster/series/99"))
    expect(await recordedPosterUrls()).toEqual(["/api/poster/series/99"])
  })

  it("batches rather than stranding entries behind the interval", async () => {
    // Senza la soglia, su serverless sopravviveva una sola entry per istanza:
    // il primo record scriveva e i successivi restavano in memoria fino al
    // riciclo della lambda. La soglia deve essere piccola abbastanza da
    // coprire una griglia normale.
    expect(__WARM_URL_FLUSH_BATCH).toBeLessThanOrEqual(10)
    for (let i = 0; i < __WARM_URL_FLUSH_BATCH * 2; i++) {
      recordPosterUrl(url(`/api/poster/movie/${i}`))
    }
    // Senza KV resta tutto locale, e comunque nulla si perde.
    expect(await recordedPosterUrls()).toHaveLength(__WARM_URL_FLUSH_BATCH * 2)
  })
})
