import { afterEach, describe, expect, it } from "vitest"
import { fanartApiKey } from "@/lib/fanart-artwork"
import { fanartProjectKey } from "@/lib/fanart"

const NAMES = ["PICTORIUM_FANART_KEY", "PICTORIUM_FANART_API_KEY", "POSTERIUM_FANART_KEY", "POSTERIUM_FANART_API_KEY", "FANART_API_KEY", "FANART_KEY"] as const

describe("fanart key: one name enables both fanart paths", () => {
  afterEach(() => {
    for (const n of NAMES) delete process.env[n]
  })

  for (const name of NAMES) {
    it(`${name} turns on the server tier and the Fanart.tv tab`, () => {
      for (const n of NAMES) delete process.env[n]
      process.env[name] = "  k-123  "
      expect(fanartApiKey()).toBe("k-123")
      expect(fanartProjectKey()).toBe("k-123")
    })
  }

  it("is off with no key", () => {
    for (const n of NAMES) delete process.env[n]
    expect(fanartApiKey()).toBeUndefined()
    expect(fanartProjectKey()).toBeUndefined()
  })
})
