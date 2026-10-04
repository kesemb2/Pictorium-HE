"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { TMDBImage } from "@/lib/types"
import { usePSelector } from "@/lib/context"
import { userFetch } from "@/lib/http"

export interface FanartTabMeta {
  readonly lang: string | null
  readonly likes: number
  /** Verificato senza testo dal server (tag "00" + controllo visivo). */
  readonly textless: boolean
}

export type FanartTabStatus = "idle" | "loading" | "ready" | "empty" | "unavailable" | "not_configured"

export interface FanartTabData {
  readonly status: FanartTabStatus
  readonly posters: TMDBImage[]
  readonly meta: FanartTabMeta[]
  readonly reload: () => void
}

interface FanartApiPoster {
  url: string
  lang: string | null
  likes: number
  textless?: boolean
}

/** Lingua del tile Fanart: null (clean) solo se verificato senza testo. */
export function fanartTileIso(p: { lang: string | null; textless?: boolean }): string | null {
  if (p.textless === true) return null
  return p.lang && p.lang !== "00" ? p.lang : "und"
}

/**
 * Poster verticali Fanart.tv per il titolo selezionato (tab "Fanart.tv").
 * Fetch lazy: parte solo con `enabled` (tab aperta), abort al cambio titolo.
 * La selezione riusa il percorso custom (customPosterUrl + fallback TMDB):
 * il render non interroga mai l'API Fanart.
 */
export function useFanartPosters(enabled: boolean): FanartTabData {
  const selected = usePSelector((v) => v.selected)
  const key = selected ? `${selected.media_type}:${selected.id}` : null

  const [status, setStatus] = useState<FanartTabStatus>("idle")
  const [posters, setPosters] = useState<TMDBImage[]>([])
  const [meta, setMeta] = useState<FanartTabMeta[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const keyRef = useRef<string | null>(null)
  keyRef.current = key

  const load = useCallback(async () => {
    const current = keyRef.current
    const sel = selected
    if (!sel || !current) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus("loading")
    try {
      const mediaType = sel.media_type === "tv" ? "tv" : "movie"
      const res = await userFetch(
        `/api/fanart/${sel.id}/images?type=${mediaType}`,
        { signal: ctrl.signal, timeout: 15000 },
      )
      const data = (await res.json().catch(() => null)) as
        | { posters?: FanartApiPoster[]; code?: string; error?: string }
        | null
      // Risposta tardiva di un titolo precedente: scarta.
      if (ctrl.signal.aborted || keyRef.current !== current) return
      if (res.status === 503 || data?.code === "fanart_not_configured") {
        setStatus("not_configured")
        return
      }
      if (!res.ok || !data || !Array.isArray(data.posters)) {
        setStatus("unavailable")
        return
      }
      if (data.posters.length === 0) {
        setPosters([])
        setMeta([])
        setStatus("empty")
        return
      }
      const items = data.posters.filter((p) => typeof p?.url === "string")
      setPosters(items.map((p) => ({
        file_path: p.url,
        // Clean (null) SOLO se verificato senza testo: un poster con il titolo
        // stampato salvato come clean riceverebbe il logo sopra il titolo.
        iso_639_1: fanartTileIso(p),
        vote_average: 0,
        width: 0,
        height: 0,
      })))
      setMeta(items.map((p) => ({ lang: p.lang ?? null, likes: p.likes ?? 0, textless: p.textless === true })))
      setStatus("ready")
    } catch {
      if (ctrl.signal.aborted || keyRef.current !== current) return
      setStatus("unavailable")
    }
  }, [selected])

  // Cambio titolo: cancella la richiesta precedente e resetta.
  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus("idle")
    setPosters([])
    setMeta([])
  }, [key])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (enabled && selected && status === "idle") void load()
  }, [enabled, selected, status, load])

  return { status, posters, meta, reload: load }
}
