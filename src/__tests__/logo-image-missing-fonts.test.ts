import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"

/**
 * La regressione che è andata in produzione, riprodotta con resvg vero.
 *
 * `outputFileTracingIncludes` tracciava i font nella sola lambda di
 * /api/poster, quindi in /api/logo i file non esistevano. resvg in quel caso
 * NON solleva: restituisce un PNG della misura giusta e del tutto trasparente.
 * `composeLogoImage` riservava lo spazio della striscia, il ritaglio finale lo
 * ritoglieva, e il titolo ebraico spariva senza una riga di log.
 */
vi.mock("@/lib/fonts", () => ({
  FONT_FILES: ["/nonexistent/Rubik-Bold.ttf", "/nonexistent/Inter-Bold.ttf"] as const,
}))

const { composeLogoImage } = await import("@/lib/logo-image")

async function wordmark(w = 300, h = 80): Promise<Buffer> {
  const bar = await sharp({ create: { width: 210, height: 40, channels: 4, background: "#ffffff" } }).png().toBuffer()
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bar, top: 20, left: 45 }])
    .png().toBuffer()
}

describe("composeLogoImage without the font files", () => {
  it("says the title was not rendered instead of reserving empty space", async () => {
    const { png, titleRendered } = await composeLogoImage({ logoBuf: await wordmark(), title: "העיתון" })
    const meta = await sharp(png).metadata()

    expect(titleRendered).toBe(false)
    // Nessuna striscia vuota appesa sotto: l'immagine è il logo e basta.
    expect(meta.height).toBe(80)
    expect(meta.width).toBe(300)
  })
})
