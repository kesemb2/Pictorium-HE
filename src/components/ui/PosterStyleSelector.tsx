"use client"

import { POSTER_STYLES, type PosterStyle } from "@/lib/badge-styles"

/**
 * Fork: scelta dello stile del poster. Le miniature sono disegnate in CSS
 * (nessuna immagine): fascia sfocata + riga genere per il classico, card di
 * vetro + tag in basso per lo stile tag.
 */
function Thumb({ style }: { style: PosterStyle }) {
  return (
    <div dir="ltr" className="relative w-[46px] h-[69px] rounded-md overflow-hidden bg-gradient-to-b from-sky-900 via-amber-800 to-stone-700 shrink-0">
      {style === "classic" ? (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent via-black/55 to-black/80 backdrop-blur-[1px]" />
          <div className="absolute inset-x-[22%] bottom-[24%] h-[7%] rounded-sm bg-white/90" />
          <div className="absolute inset-x-[30%] bottom-[9%] h-[4%] rounded-sm bg-white/60" />
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-black/70" />
          <div className="absolute inset-x-[16%] bottom-[18%] h-[19%] rounded-[4px] bg-white/20 border border-white/30" />
          <div className="absolute inset-x-[26%] bottom-[28%] h-[6%] rounded-sm bg-white/90" />
          <div className="absolute inset-x-[30%] bottom-0 h-[11%] rounded-t-[4px] bg-white/25 border border-white/30 border-b-0" />
        </>
      )}
    </div>
  )
}

export function PosterStyleSelector({
  value,
  onChange,
  label,
  names,
}: {
  value: PosterStyle
  onChange: (v: PosterStyle) => void
  label: string
  names: Record<PosterStyle, { title: string; sub: string }>
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 w-full" role="radiogroup" aria-label={label}>
      {(POSTER_STYLES as readonly PosterStyle[]).map((s) => {
        const active = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(s)}
            className={`flex items-center gap-2.5 w-full p-2 rounded-lg border text-start transition-all duration-150 cursor-pointer ${
              active
                ? "bg-accent-orange/15 border-accent-orange/25"
                : "bg-white/5 hover:bg-white/10 border-transparent"
            }`}
          >
            <Thumb style={s} />
            <span className="min-w-0">
              <span className={`block text-xs font-semibold ${active ? "text-accent-orange" : "text-zinc-200"}`}>{names[s].title}</span>
              <span className="block text-[11px] text-muted leading-snug">{names[s].sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
