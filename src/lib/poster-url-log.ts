/**
 * Registro delle URL poster realmente richieste, per il warmup.
 *
 * Il warmup ricostruiva le URL da `getServerDefaults()`, ma le cache CDN sono
 * chiavate sull'URL ESATTA e i link che i client portano in giro (un addon di
 * metadati, un catalogo Stremio salvato) sono stati generati quando erano
 * generati: basta un parametro diverso — `dtx` e `halo` non esistevano fino a
 * ieri — e si scalda una chiave che nessuno chiederà mai.
 *
 * Quindi non si ricostruisce: si registra ciò che arriva davvero e lo si
 * rigioca. Solo le richieste che RENDERIZZANO finiscono qui — un colpo di
 * cache in memoria è già a costo zero, e così le scritture restano legate al
 * percorso caro.
 */

import { createLogger } from "./logger"

const log = createLogger("poster-url-log")

const KV_KEY = "pictorium:warm-urls"
const MAX_URLS = 300
/** Intervallo massimo fra due flush, per istanza: il KV gratuito si conta a comandi. */
const FLUSH_INTERVAL_MS = 60_000
/**
 * Quante entry in attesa bastano a forzare un flush comunque.
 *
 * Col solo intervallo, su serverless sopravviveva UNA entry per istanza: il
 * primo record scriveva, i successivi si accodavano in memoria e la lambda
 * veniva riciclata molto prima che la finestra scadesse. Con la soglia una
 * griglia da venti poster costa quattro scritture invece di perdere diciannove
 * URL.
 */
const FLUSH_BATCH = 5
const MAX_URL_LEN = 2048

/**
 * Parametri che possono portare credenziali. `resolveRequestApiKey` accetta
 * `api_key` dalla query, quindi una URL che ne porta uno NON viene registrata
 * affatto: ripulirla e salvare il resto darebbe una URL che al replay rende
 * diversamente, e queste stringhe finiscono in uno store condiviso.
 */
const CREDENTIAL_PARAMS = ["api_key", "apikey", "key", "token", "secret", "mdblist_key", "tvdb_key", "fanart_key"]

const useKv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN

/** Pending locali dall'ultimo flush, in ordine di inserimento. */
const pending = new Set<string>()
let lastFlush = 0
let flushing: Promise<void> | null = null

/** `true` se la query porta qualcosa che somiglia a una credenziale. */
export function carriesCredential(search: URLSearchParams): boolean {
  for (const name of search.keys()) {
    if (CREDENTIAL_PARAMS.includes(name.toLowerCase())) return true
  }
  return false
}

/**
 * Registra una URL servita (path + query). Non lancia mai e non attende il KV:
 * il percorso di render non deve pagare un round trip per la telemetria.
 */
export function recordPosterUrl(url: URL): void {
  try {
    if (carriesCredential(url.searchParams)) return
    const entry = `${url.pathname}${url.search}`
    if (entry.length > MAX_URL_LEN) return
    // Re-inserire porta la entry in coda: il taglio tiene le più recenti.
    pending.delete(entry)
    pending.add(entry)
    while (pending.size > MAX_URLS) pending.delete(pending.keys().next().value!)
    void maybeFlush()
  } catch {
    // Un registro non deve mai poter rompere un render.
  }
}

async function maybeFlush(force = false): Promise<void> {
  if (!useKv || pending.size === 0) return
  if (flushing) return
  const due = force || pending.size >= FLUSH_BATCH || Date.now() - lastFlush >= FLUSH_INTERVAL_MS
  if (!due) return
  lastFlush = Date.now()
  // Istantanea: quello che si registra MENTRE la scrittura è in volo non deve
  // sparire con una clear() cieca — resta in coda per il flush successivo.
  const batch = [...pending]
  flushing = (async () => {
    try {
      const { kv } = await import("@vercel/kv")
      const stored = await kv.get<string[]>(KV_KEY)
      // Le altre istanze registrano le loro: si fondono, le nostre in coda.
      const merged = new Set<string>(Array.isArray(stored) ? stored : [])
      for (const entry of batch) {
        merged.delete(entry)
        merged.add(entry)
      }
      while (merged.size > MAX_URLS) merged.delete(merged.keys().next().value!)
      await kv.set(KV_KEY, [...merged])
      for (const entry of batch) pending.delete(entry)
    } catch (e) {
      log.debug("Warm-url flush failed", { error: e instanceof Error ? e.message : String(e) })
    } finally {
      flushing = null
    }
  })()
  await flushing
}

/**
 * URL da riscaldare, più recenti per ultime. Senza KV resta quel che questa
 * istanza ha visto — inutile fra lambda diverse, ma innocuo e corretto su VPS.
 */
export async function recordedPosterUrls(limit = MAX_URLS): Promise<string[]> {
  const local = [...pending]
  if (!useKv) return local.slice(-limit)
  try {
    const { kv } = await import("@vercel/kv")
    const stored = await kv.get<string[]>(KV_KEY)
    const merged = new Set<string>(Array.isArray(stored) ? stored : [])
    for (const entry of local) {
      merged.delete(entry)
      merged.add(entry)
    }
    return [...merged].slice(-limit)
  } catch (e) {
    log.debug("Warm-url read failed", { error: e instanceof Error ? e.message : String(e) })
    return local.slice(-limit)
  }
}

/** Solo per i test. */
export function __resetPosterUrlLogForTest(): void {
  pending.clear()
  lastFlush = 0
  flushing = null
}

/** Solo per i test: forza il flush ignorando l'intervallo. */
export async function __flushPosterUrlLogForTest(): Promise<void> {
  await maybeFlush(true)
}

export const __WARM_URL_KV_KEY = KV_KEY
export const __WARM_URL_MAX = MAX_URLS
export const __WARM_URL_FLUSH_BATCH = FLUSH_BATCH
