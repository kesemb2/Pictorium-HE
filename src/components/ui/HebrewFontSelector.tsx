"use client"

import { Frank_Ruhl_Libre, Heebo, Karantina, Rubik, Secular_One } from "next/font/google"
import { HEBREW_FONTS, HEBREW_FONT_FAMILY, type HebrewFont } from "@/lib/badge-styles"

// Fork: campioni del selettore "Font ebraico". Come BadgeFontSelector, le
// webfont arrivano a build time da next/font (solo il subset ebraico) e
// servono solo ai campioni: il render poster usa i TTF in src/assets/fonts.
const rubikSample = Rubik({ subsets: ["hebrew"], weight: ["700"] })
const heeboSample = Heebo({ subsets: ["hebrew"], weight: ["700"] })
const karantinaSample = Karantina({ subsets: ["hebrew"], weight: ["700"] })
const secularSample = Secular_One({ subsets: ["hebrew"], weight: ["400"] })
const frankSample = Frank_Ruhl_Libre({ subsets: ["hebrew"], weight: ["700"] })

const SAMPLE_CLASS: Record<HebrewFont, string> = {
  rubik: rubikSample.className,
  heebo: heeboSample.className,
  karantina: karantinaSample.className,
  "secular-one": secularSample.className,
  "frank-ruhl-libre": frankSample.className,
}

/** Parola di prova: un genere vero, così il campione somiglia al badge. */
const SAMPLE_TEXT = "דרמה"

export function HebrewFontSelector({
  value,
  onChange,
  label,
}: {
  value: HebrewFont
  onChange: (v: HebrewFont) => void
  label: string
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 w-full" role="radiogroup" aria-label={label}>
      {(HEBREW_FONTS as readonly HebrewFont[]).map((f) => {
        const isActive = value === f
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(f)}
            className={`flex flex-col items-center justify-center gap-1 w-full py-1.5 px-1 rounded-lg border transition-all duration-150 cursor-pointer ${
              isActive
                ? "bg-accent-orange/15 text-accent-orange border-accent-orange/25"
                : "bg-white/5 text-muted hover:bg-white/10 hover:text-zinc-200 border-transparent"
            }`}
          >
            <span dir="rtl" className={`text-[17px] leading-none select-none ${SAMPLE_CLASS[f]}`}>
              {SAMPLE_TEXT}
            </span>
            <span dir="ltr" className="text-[10px] font-semibold leading-tight truncate max-w-full">
              {HEBREW_FONT_FAMILY[f]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
