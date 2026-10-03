import { afterEach, describe, expect, it, vi } from "vitest"

// setup.ts sostituisce @/lib/i18n con un mock: qui serve il modulo vero.
const i18n = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n")

describe("document direction follows the UI language", () => {
  afterEach(() => {
    i18n.setLang("he")
  })

  it("dirFor marks Hebrew and Arabic as RTL", () => {
    expect(i18n.dirFor("he")).toBe("rtl")
    expect(i18n.dirFor("ar")).toBe("rtl")
    expect(i18n.dirFor("HE")).toBe("rtl")
    expect(i18n.dirFor("en")).toBe("ltr")
    expect(i18n.dirFor("it")).toBe("ltr")
  })

  it("setLang sets lang and dir on <html>", () => {
    i18n.setLang("he")
    expect(document.documentElement.lang).toBe("he")
    expect(document.documentElement.dir).toBe("rtl")
    i18n.setLang("en")
    expect(document.documentElement.lang).toBe("en")
    expect(document.documentElement.dir).toBe("ltr")
  })

  it("starts in Hebrew", () => {
    expect(i18n.getLang()).toBe("he")
    expect(i18n.t("ui.reset")).toBe("איפוס")
  })
})
