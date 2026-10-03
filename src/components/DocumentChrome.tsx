"use client"

import { useEffect, useState } from "react"
import { Toaster } from "sonner"
import { Check, Info, AlertTriangle, AlertCircle } from "lucide-react"
import { getLang, t } from "@/lib/i18n"

/** Lingua e direzione correnti di <html>, aggiornate quando setLang le cambia. */
function useDocumentLocale(): { lang: string; dir: "rtl" | "ltr" } {
  const [locale, setLocale] = useState<{ lang: string; dir: "rtl" | "ltr" }>({ lang: "he", dir: "rtl" })
  useEffect(() => {
    const root = document.documentElement
    const read = () => {
      setLocale({ lang: getLang(), dir: root.dir === "ltr" ? "ltr" : "rtl" })
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(root, { attributes: true, attributeFilter: ["dir", "lang"] })
    return () => {
      obs.disconnect()
    }
  }, [])
  return locale
}

/** Skip link e toaster: fuori dai provider, seguono la lingua del documento. */
export function DocumentChrome() {
  const { dir } = useDocumentLocale()
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:start-4 focus:z-[200] focus:bg-accent-orange focus:text-white focus:px-4 focus:py-2 focus:rounded-xl"
      >
        {t("ui.skipToContent")}
      </a>
      <Toaster
        position={dir === "rtl" ? "bottom-left" : "bottom-right"}
        dir={dir}
        duration={3000}
        closeButton={false}
        richColors={false}
        theme="dark"
        icons={{
          success: <Check className="w-3.5 h-3.5 stroke-[2.5]" />,
          info: <Info className="w-3.5 h-3.5 stroke-[2.5]" />,
          warning: <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />,
          error: <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />,
        }}
      />
    </>
  )
}
