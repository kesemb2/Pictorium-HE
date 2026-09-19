import { afterEach, describe, expect, it } from "vitest"
import { acquirePosterRenderSlot, getPosterStats, __resetPosterRenderLimiter } from "@/lib/poster-runtime-cache"

// Il limite viene letto dal modulo, non fissato qui: il test verifica il
// MECCANISMO, e un cambio di default non deve romperlo.
const LIMIT = getPosterStats().maxConcurrent

describe("poster render concurrency limiter", () => {
  afterEach(() => {
    __resetPosterRenderLimiter()
  })

  it("acquires up to the max concurrent slots immediately", async () => {
    const releases: Array<() => void> = []
    for (let i = 0; i < LIMIT; i++) {
      const release = await acquirePosterRenderSlot()
      expect(release).toBeTruthy()
      releases.push(release!)
    }
    releases.forEach((r) => r())
  })

  it("queues requests beyond the limit and resolves them when a slot frees", async () => {
    const releases: Array<() => void> = []
    for (let i = 0; i < LIMIT; i++) {
      releases.push((await acquirePosterRenderSlot())!)
    }
    let fifthResolved = false
    const fifthPromise = acquirePosterRenderSlot().then((r) => { fifthResolved = true; return r })
    await new Promise((r) => setTimeout(r, 50))
    expect(fifthResolved).toBe(false)

    releases[0]()
    const fifthRelease = await fifthPromise
    expect(fifthResolved).toBe(true)
    expect(fifthRelease).toBeTruthy()
    fifthRelease!()

    releases.slice(1).forEach((r) => r())
  })

  it("handles multiple queued waiters in FIFO order", async () => {
    const releases: Array<() => void> = []
    for (let i = 0; i < LIMIT; i++) releases.push((await acquirePosterRenderSlot())!)
    const order: number[] = []
    const waiters = [1, 2, 3].map((n) => acquirePosterRenderSlot().then((r) => { order.push(n); return r }))
    releases[0]()
    releases[1]()
    releases[2]()
    const resolved = await Promise.all(waiters)
    expect(order).toEqual([1, 2, 3])
    resolved.forEach((r) => r?.())
    releases[3]()
  })
})
