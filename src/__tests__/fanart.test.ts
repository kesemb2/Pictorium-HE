import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const httpMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/http", () => ({ http: httpMock }))

import { getFanartMovie, getFanartTv, isFanartEnabled, textlessOnly, FANART_ASSET_PREFIX } from "@/lib/fanart"
import { cacheClear } from "@/lib/cache"

const ASSET = (name: string) => `${FANART_ASSET_PREFIX}fanart/movies/1/${name}.png`

beforeEach(() => {
  process.env.PICTORIUM_FANART_API_KEY = "test-key"
  httpMock.mockReset()
  cacheClear()
})

afterEach(() => {
  delete process.env.PICTORIUM_FANART_API_KEY
})

describe("fanart api key gate", () => {
  it("is disabled without a key, and asks nothing", async () => {
    delete process.env.PICTORIUM_FANART_API_KEY
    expect(isFanartEnabled()).toBe(false)
    const art = await getFanartMovie(603)
    expect(art.posters).toEqual([])
    expect(httpMock).not.toHaveBeenCalled()
  })

  it("is enabled with a key", () => {
    expect(isFanartEnabled()).toBe(true)
  })
})

describe("textlessOnly", () => {
  // fanart obbliga i poster SENZA testo a lingua "None", che sull'API è "00".
  // È la regola che rende utile il livello: senza filtro prenderemmo poster col
  // titolo già stampato, cioè quello che stiamo evitando.
  it('keeps lang "00" and drops real languages', () => {
    const imgs = [
      { id: "1", url: ASSET("a"), lang: "en", likes: 9 },
      { id: "2", url: ASSET("b"), lang: "00", likes: 3 },
      { id: "3", url: ASSET("c"), lang: "he", likes: 7 },
    ]
    expect(textlessOnly(imgs).map((i) => i.id)).toEqual(["2"])
  })

  it("treats a missing language as textless", () => {
    expect(textlessOnly([{ id: "1", url: ASSET("a"), lang: "", likes: 0 }])).toHaveLength(1)
  })
})

describe("getFanartMovie", () => {
  it("collects posters, backgrounds and logos, most liked first", async () => {
    httpMock.mockResolvedValue({
      movieposter: [
        { id: "1", url: ASSET("p1"), lang: "00", likes: 2 },
        { id: "2", url: ASSET("p2"), lang: "00", likes: 8 },
      ],
      moviebackground: [{ id: "3", url: ASSET("bg"), lang: "", likes: 4 }],
      hdmovielogo: [{ id: "4", url: ASSET("l-hd"), lang: "he", likes: 1 }],
      movielogo: [{ id: "5", url: ASSET("l-sd"), lang: "en", likes: 5 }],
    })
    const art = await getFanartMovie(603)
    expect(art.posters.map((p) => p.id)).toEqual(["2", "1"])
    expect(art.backgrounds.map((b) => b.id)).toEqual(["3"])
    expect(art.logos.map((l) => l.id)).toEqual(["5", "4"])
    expect(art.logos[1].lang).toBe("he")
  })

  // Un record manomesso non deve farci uscire dal CDN in allowlist.
  it("drops entries whose url is not on the fanart CDN", async () => {
    httpMock.mockResolvedValue({
      movieposter: [
        { id: "evil", url: "https://attacker.example/x.png", lang: "00", likes: 99 },
        { id: "ok", url: ASSET("p"), lang: "00", likes: 1 },
      ],
    })
    expect((await getFanartMovie(603)).posters.map((p) => p.id)).toEqual(["ok"])
  })

  it("survives a malformed payload", async () => {
    httpMock.mockResolvedValue({ movieposter: "not-an-array" })
    expect((await getFanartMovie(603)).posters).toEqual([])
  })

  // Un 404 vuol dire solo "fanart non conosce il titolo"; un outage non deve
  // spegnere il livello per 24 ore, quindi il fallimento non si mette in cache.
  it("returns empty on error without caching the failure", async () => {
    httpMock.mockRejectedValueOnce(new Error("HTTP 404"))
    expect((await getFanartMovie(603)).posters).toEqual([])
    httpMock.mockResolvedValueOnce({ movieposter: [{ id: "1", url: ASSET("p"), lang: "00", likes: 1 }] })
    expect((await getFanartMovie(603)).posters).toHaveLength(1)
    expect(httpMock).toHaveBeenCalledTimes(2)
  })

  it("caches a successful lookup", async () => {
    httpMock.mockResolvedValue({ movieposter: [{ id: "1", url: ASSET("p"), lang: "00", likes: 1 }] })
    await getFanartMovie(603)
    await getFanartMovie(603)
    expect(httpMock).toHaveBeenCalledTimes(1)
  })

  it("sends the key as a query parameter", async () => {
    httpMock.mockResolvedValue({})
    await getFanartMovie(603)
    expect(httpMock.mock.calls[0][0]).toBe("https://webservice.fanart.tv/v3/movies/603?api_key=test-key")
  })
})

describe("getFanartTv", () => {
  // fanart indicizza le serie per id TheTVDB, non TMDB.
  it("queries the tv endpoint by TVDB id", async () => {
    httpMock.mockResolvedValue({ tvposter: [{ id: "1", url: ASSET("p"), lang: "00", likes: 1 }] })
    const art = await getFanartTv(81189)
    expect(httpMock.mock.calls[0][0]).toContain("/v3/tv/81189")
    expect(art.posters).toHaveLength(1)
  })

  it("keeps movie and tv lookups in separate cache entries", async () => {
    httpMock.mockResolvedValue({})
    await getFanartMovie(1)
    await getFanartTv(1)
    expect(httpMock).toHaveBeenCalledTimes(2)
  })
})
