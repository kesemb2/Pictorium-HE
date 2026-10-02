import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { http, scopedApiInit, userFetch } from "@/lib/http"
import {
  __resetUnlockedUsersForTests,
  __resetUserCredentialsForTests,
  getStoredUserToken,
  setStoredUserPassword,
  setStoredUserToken,
  USER_UNLOCK_EVENT,
} from "@/lib/user-token"

const UUID = "11111111-1111-4111-8111-111111111111"

function setUrl(url: string): void {
  window.history.replaceState({}, "", url)
}

// jsdom qui non espone localStorage: memory store (tenuto per compatibilità,
// il contratto token non lo usa più — solo memoria di sessione).
function installMemoryStorage(): Record<string, string> {
  const store: Record<string, string> = {}
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = String(v) },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { for (const k of Object.keys(store)) delete store[k] },
    },
    configurable: true,
  })
  return store
}

function okResponse(): Response {
  return new Response("{}", { status: 200 })
}

beforeEach(() => {
  setUrl("/")
  installMemoryStorage()
  window.localStorage.clear()
  __resetUnlockedUsersForTests()
  __resetUserCredentialsForTests()
  vi.stubGlobal("fetch", vi.fn(async () => okResponse()))
})

afterEach(() => {
  setUrl("/")
  try { window.localStorage.clear() } catch { /* assente */ }
  __resetUnlockedUsersForTests()
  __resetUserCredentialsForTests()
  vi.unstubAllGlobals()
})

describe("scopedApiInit / userFetch", () => {
  it("passthrough fuori dai path utente", () => {
    expect(scopedApiInit("/api/mappings", {})).toEqual({ path: "/api/mappings", headers: undefined })
    expect(scopedApiInit("/api/health", {})).toEqual({ path: "/api/health", headers: undefined })
  })

  it("non tocca POST /api/users (creazione identità)", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "tok")
    await userFetch("/api/users", { method: "POST" })
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/users")
    expect((init.headers as Record<string, string> | undefined)?.["x-user-token"]).toBeUndefined()
  })

  it("aggiunge ?u= + x-user-token sulle famiglie scoped (dopo unlock)", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "tok")
    window.dispatchEvent(new CustomEvent(USER_UNLOCK_EVENT, { detail: { uuid: UUID } }))
    await userFetch("/api/mappings")
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/mappings?u=${UUID}`)
    expect((init.headers as Record<string, string>)["x-user-token"]).toBe("tok")
  })

  it("non duplica ?u= già presente e non sovrascrive header espliciti", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "tok")
    await userFetch(`/api/defaults?u=${UUID}`, { headers: { Authorization: "Bearer admin" } })
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/defaults?u=${UUID}`)
    const headers = init.headers as Record<string, string>
    expect(headers["Authorization"]).toBe("Bearer admin")
    expect(headers["x-user-token"]).toBeUndefined()
  })

  it("senza token aggiunge solo ?u=", async () => {
    setUrl(`/?u=${UUID}`)
    await userFetch("/api/mappings")
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/mappings?u=${UUID}`)
    expect(init.headers).toBeUndefined()
  })

  it("ignora uuid invalidi nel path", async () => {
    setUrl("/u/non-un-uuid/configure")
    setStoredUserToken("non-un-uuid", "tok")
    await userFetch("/api/mappings")
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/mappings")
  })

  it("pre-unlock (modal chiusa con X): ?u= sì, credenziali mai", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "tok")
    await userFetch("/api/mappings")
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/mappings?u=${UUID}`)
    expect(init.headers).toBeUndefined()
  })

  it("aggiunge ?u= alle famiglie proxy upstream (tmdb/mdblist/awards/tvdb)", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "tok")
    window.dispatchEvent(new CustomEvent(USER_UNLOCK_EVENT, { detail: { uuid: UUID } }))
    for (const p of ["/api/tmdb/search?q=x", "/api/mdblist/anime", "/api/awards/movie/1", "/api/tvdb/123/seasonTypes", "/api/flixpatrol/top10", "/api/trending/rank?type=movie&id=1"]) {
      vi.mocked(fetch).mockClear()
      await userFetch(p)
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
      expect(url).toContain(`u=${UUID}`)
      expect((init.headers as Record<string, string>)["x-user-token"]).toBe("tok")
    }
  })

  it("401 con token stantio + password fresca: retry password e drop token", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "stale-tok")
    setStoredUserPassword(UUID, "fresh-pw-1")
    window.dispatchEvent(new CustomEvent(USER_UNLOCK_EVENT, { detail: { uuid: UUID } }))
    vi.mocked(fetch).mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      if (headers["x-user-token"] === "stale-tok") return new Response("{}", { status: 401 })
      if (headers["x-user-password"] === "fresh-pw-1" && !headers["x-user-token"]) {
        return new Response('{"ok":true}', { status: 200 })
      }
      return new Response("{}", { status: 500 })
    })
    const res = await userFetch("/api/mappings")
    expect(res.status).toBe(200)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    // Secret provatamente invalido: rimosso, i prossimi fetch partono sani.
    expect(getStoredUserToken(UUID)).toBeNull()
  })

  it("401 senza password di sessione: niente retry, 401 integro", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "stale-tok")
    window.dispatchEvent(new CustomEvent(USER_UNLOCK_EVENT, { detail: { uuid: UUID } }))
    vi.mocked(fetch).mockImplementation(async () => new Response("{}", { status: 401 }))
    const res = await userFetch("/api/mappings")
    expect(res.status).toBe(401)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it("http(): stesso retry password sul plumbing con timeout", async () => {
    setUrl(`/u/${UUID}/configure`)
    setStoredUserToken(UUID, "stale-tok")
    setStoredUserPassword(UUID, "fresh-pw-2")
    window.dispatchEvent(new CustomEvent(USER_UNLOCK_EVENT, { detail: { uuid: UUID } }))
    vi.mocked(fetch).mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      if (headers["x-user-token"] === "stale-tok") return new Response("{}", { status: 401 })
      return new Response('{"mappings":[]}', { status: 200 })
    })
    const body = await http<{ mappings: unknown[] }>("/api/mappings", { retries: 0 })
    expect(body).toEqual({ mappings: [] })
    expect(getStoredUserToken(UUID)).toBeNull()
  })
})
