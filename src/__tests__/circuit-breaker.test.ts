import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createCircuitBreaker } from "@/lib/circuit-breaker"

// Locks the generic contract with a non-awards config (Phase 2: MDBList
// 3 fails → 30s cooldown). Awards behavior stays covered by awards-breaker.test.ts.
describe("createCircuitBreaker (generic)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("opens after a custom threshold and recovers via half-open trial", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 3, backoffMs: 30_000 })

    expect(breaker.isOpen()).toBe(false)
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(false)

    breaker.recordFailure() // 3rd → open
    expect(breaker.isOpen()).toBe(true)

    vi.setSystemTime(Date.now() + 31_000)
    expect(breaker.isOpen()).toBe(false) // trial
    expect(breaker.isOpen()).toBe(true) // others still rejected
    breaker.recordSuccess()
    expect(breaker.isOpen()).toBe(false)
  })

  it("a failed trial re-opens the window", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 3, backoffMs: 30_000 })
    for (let i = 0; i < 3; i++) breaker.recordFailure()

    vi.setSystemTime(Date.now() + 31_000)
    expect(breaker.isOpen()).toBe(false) // trial
    breaker.recordFailure()

    expect(breaker.isOpen()).toBe(true)
    vi.setSystemTime(Date.now() + 31_000)
    expect(breaker.isOpen()).toBe(false) // next trial allowed
  })

  it("recordFailure accepts a one-shot backoff override (e.g. Retry-After)", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 1, backoffMs: 30_000 })
    breaker.recordFailure() // opens with the default 30s
    expect(breaker.isOpen()).toBe(true)

    vi.setSystemTime(Date.now() + 31_000)
    expect(breaker.isOpen()).toBe(false) // trial
    breaker.recordFailure(5_000) // trial fails, 5s custom window
    expect(breaker.isOpen()).toBe(true)

    vi.setSystemTime(Date.now() + 6_000)
    expect(breaker.isOpen()).toBe(false) // next trial after 5s, not 30s
  })

  it("trip opens immediately without waiting for the threshold", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 5, backoffMs: 60_000 })
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(false)

    breaker.trip(300_000) // hard block (e.g. 403 anti-bot): open at once
    expect(breaker.isOpen()).toBe(true)

    vi.setSystemTime(Date.now() + 61_000)
    expect(breaker.isOpen()).toBe(true) // custom 5min window still open
    vi.setSystemTime(Date.now() + 301_000)
    expect(breaker.isOpen()).toBe(false) // trial allowed after the custom window
  })

  it("instances are independent", () => {
    const a = createCircuitBreaker({ failureThreshold: 1, backoffMs: 10_000 })
    const b = createCircuitBreaker({ failureThreshold: 5, backoffMs: 60_000 })
    a.recordFailure()
    expect(a.isOpen()).toBe(true)
    expect(b.isOpen()).toBe(false)
    a.reset()
    expect(a.isOpen()).toBe(false)
  })
})
