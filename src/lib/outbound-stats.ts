/**
 * Telemetria outbound per host (Step 0a, I/O audit).
 *
 * Conta richieste/errori e latenza delle fetch upstream, raggruppate per
 * hostname. Mai payload, mai chiavi: la key è solo l'hostname.
 * Zero allocazioni per-call oltre un Date.now() + Map lookup; la Map è
 * bounded (64 host, evict oldest) così un redirect malevolo non la gonfia.
 * Solo osservabilità: non cambia retry, timeout o cache di nessun caller.
 */

export interface OutboundHostStats {
  readonly requests: number
  readonly errors: number
  readonly avgMs: number
  readonly lastMs: number
}

interface MutableHostStats {
  requests: number
  errors: number
  totalMs: number
  lastMs: number
}

const MAX_HOSTS = 64
const hosts = new Map<string, MutableHostStats>()

function record(host: string, ms: number, failed: boolean): void {
  let s = hosts.get(host)
  if (!s) {
    if (hosts.size >= MAX_HOSTS) hosts.delete(hosts.keys().next().value!)
    s = { requests: 0, errors: 0, totalMs: 0, lastMs: 0 }
    hosts.set(host, s)
  }
  s.requests++
  if (failed) s.errors++
  s.totalMs += ms
  s.lastMs = ms
}

function hostOf(url: string | URL): string {
  try {
    return new URL(String(url)).hostname || "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * Drop-in della global fetch con conteggio per host. Delega 1:1 (stessi
 * argomenti, stessa promise): i mock su globalThis.fetch restano intercettati
 * perché la lookup è al momento della chiamata, non all'import.
 * Trasparente anche verso stub esotici: un valore non-promise viene assimilato
 * via Promise.resolve (come farebbe await), un throw sincrono resta sincrono.
 */
export function timedFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const host = hostOf(url)
  const t0 = Date.now()
  let result: unknown
  try {
    result = fetch(url, init)
  } catch (err) {
    record(host, Date.now() - t0, true)
    throw err
  }
  return Promise.resolve(result as Response | Promise<Response>).then(
    (res) => {
      record(host, Date.now() - t0, false)
      return res
    },
    (err) => {
      record(host, Date.now() - t0, true)
      throw err
    },
  )
}

export function outboundStats(): Record<string, OutboundHostStats> {
  const out: Record<string, OutboundHostStats> = {}
  for (const [host, s] of hosts) {
    out[host] = {
      requests: s.requests,
      errors: s.errors,
      avgMs: s.requests > 0 ? Math.round((s.totalMs / s.requests) * 10) / 10 : 0,
      lastMs: s.lastMs,
    }
  }
  return out
}

/** Solo per i test: azzera i contatori. */
export function __resetOutboundStatsForTest(): void {
  hosts.clear()
}
