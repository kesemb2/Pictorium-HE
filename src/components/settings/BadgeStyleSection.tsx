"use client"

import { useState } from "react"
import { Maximize2, Palette } from "lucide-react"
import { usePSelector } from "@/lib/context"
import { useT } from "@/lib/contexts/TranslationContext"
import { usePosterEditor } from "@/lib/contexts/PosterEditorContext"
import { BadgeStyleSelector, VideoFormatSelector, BadgeFontSelector, HebrewFontSelector, PosterStyleSelector } from "@/components/ui"
import { Toggle } from "@/components/Toggle"
import { KNOWN_VIDEO_FORMATS } from "@/lib/av-specs"
import { SliderRow } from "@/components/SliderRow"
import { DEFAULT_TAG_SIZE, TAG_SIZE_MAX, TAG_SIZE_MIN, normalizeTagSize, type PosterStyle } from "@/lib/badge-styles"

/** Stili grafici predefiniti (tab Badge). Estratto da SettingsPanel: solo JSX + context, nessuno stato locale. */
export function BadgeStyleSection() {
  const accentColor = usePSelector((v) => v.accentColor)
  const { t } = useT()
  const ed = usePosterEditor()
  const [editVal, setEditVal] = useState<string | null>(null)
  const [editTxt, setEditTxt] = useState("")
  const styleNames: Record<PosterStyle, { title: string; sub: string }> = {
    classic: { title: t("ui.posterStyleClassic"), sub: t("ui.posterStyleClassicSub") },
    tag: { title: t("ui.posterStyleTag"), sub: t("ui.posterStyleTagSub") },
  }
  return (
    <div className="bg-surface/50 border border-surface2/60 rounded-xl p-3.5 space-y-3 shadow-sm">
      <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
        <Palette className="w-3.5 h-3.5 text-accent-orange" />
        {t("ui.styleDefault")}
      </span>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted font-medium block">
          {t("ui.portraitStyle")}
        </label>
        <PosterStyleSelector
          value={ed.defaultPosterStyle}
          onChange={(v) => ed.setDefaultPosterStyle(v)}
          label={t("ui.portraitStyle")}
          names={styleNames}
        />
      </div>

      {/* Fork: lo stile dell'orizzontale si sceglie a parte. */}
      <div className="space-y-1.5">
        <label className="text-[11px] text-muted font-medium block">
          {t("ui.landscapeStyle")}
        </label>
        <PosterStyleSelector
          value={ed.defaultLandscapeStyle}
          onChange={(v) => ed.setDefaultLandscapeStyle(v)}
          label={t("ui.landscapeStyle")}
          names={styleNames}
          landscape
        />
      </div>

      {(ed.defaultPosterStyle === "tag" || ed.defaultLandscapeStyle === "tag") && (
        <div className="space-y-1.5" role="group" aria-label={t("ui.tagOptions")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-300">{t("ui.tagCard")}</span>
            <Toggle value={ed.defaultTagCard} onChange={(v) => ed.setDefaultTagCard(v)} label={t("ui.tagCard")} />
          </div>
          <div className={`flex items-center justify-between gap-3 ${ed.defaultTagCard ? "" : "opacity-60 pointer-events-none"}`}>
            <span className="text-[11px] text-zinc-300">{t("ui.tagFade")}</span>
            {/* Senza card la dissolvenza è sempre attiva (vedi lib/tag-style). */}
            <Toggle value={ed.defaultTagCard ? ed.defaultTagFade : true} onChange={(v) => ed.setDefaultTagFade(v)} label={t("ui.tagFade")} />
          </div>
          {!ed.defaultTagCard && (
            <p className="text-[11px] text-zinc-500 leading-snug">{t("ui.tagFadeForced")}</p>
          )}
          <SliderRow
            icon={<Maximize2 className="w-3.5 h-3.5" />}
            label={t("ui.tagSize")}
            value={ed.defaultTagSize}
            min={TAG_SIZE_MIN}
            max={TAG_SIZE_MAX}
            boundsMin={TAG_SIZE_MIN}
            boundsMax={TAG_SIZE_MAX}
            onChange={(v) => ed.setDefaultTagSize(normalizeTagSize(v))}
            onDoubleClick={() => ed.setDefaultTagSize(DEFAULT_TAG_SIZE)}
            editingValue={editVal}
            editText={editTxt}
            setEditingValue={setEditVal}
            setEditText={setEditTxt}
            editingKey="dtagSize"
            suffix="%"
          />
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-300">{t("ui.landscapeTop10")}</span>
          <Toggle value={ed.defaultLandscapeTop10} onChange={(v) => ed.setDefaultLandscapeTop10(v)} label={t("ui.landscapeTop10")} />
        </div>
        <p className="text-[11px] text-zinc-500 leading-snug">{t("ui.landscapeTop10Hint")}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted font-medium block">
          {t("ui.styleRankingDefault")}
        </label>
        <BadgeStyleSelector
          value={ed.defaultRankingBadgeStyle}
          options={["default", "pill", "colored", "bordo", "vetro"]}
          onChange={(v) => {
            ed.setDefaultRankingBadgeStyle(v)
          }}
          t={t}
          accentColor={accentColor}
        />
      </div>

      <div className="pt-2 border-t border-surface2/50 space-y-1.5">
        <label className="text-[11px] text-muted font-medium block">
          {t("ui.styleGenreBadge")}
        </label>
        <BadgeStyleSelector
          value={ed.defaultBadgeStyle}
          options={["shadow", "pill", "bar", "colored", "bordo", "vetro", "minimal"]}
          onChange={(v) => {
            ed.setDefaultBadgeStyle(v)
          }}
          t={t}
        />
      </div>

      <div className="pt-2 border-t border-surface2/50 space-y-1.5">
        <label className="text-[11px] text-muted font-medium block">
          {t("ui.badgeFont")}
        </label>
        <BadgeFontSelector
          value={ed.defaultBadgeFont}
          onChange={(v) => {
            ed.setDefaultBadgeFont(v)
          }}
        />
      </div>

      <div className="pt-2 border-t border-surface2/50 space-y-1.5">
        <label className="text-[11px] text-muted font-medium block">
          {t("ui.hebrewFont")}
        </label>
        <HebrewFontSelector
          value={ed.defaultHebrewFont}
          onChange={(v) => ed.setDefaultHebrewFont(v)}
          label={t("ui.hebrewFont")}
        />
        <p className="text-[11px] text-zinc-500 leading-snug">{t("ui.hebrewFontHint")}</p>
      </div>

      {ed.defaultBadgeQuality && (
        <div className="pt-2 border-t border-surface2/50 space-y-1.5">
          <label className="text-[11px] text-muted font-medium block">
            {t("ui.qualityBadgeStyle")}
          </label>
          <BadgeStyleSelector
            value={ed.defaultQualityBadgeStyle}
            options={["standard", "mono", "color"]}
            onChange={(v) => {
              ed.setDefaultQualityBadgeStyle(v)
            }}
            t={t}
          />

          <div className="pt-2 border-t border-surface2/50 space-y-1.5">
            <label className="text-[11px] text-muted font-medium block">
              {t("ui.defaultVideoFormats")}
            </label>
            <VideoFormatSelector
              selectedFormats={ed.defaultVideoFormats ?? KNOWN_VIDEO_FORMATS}
              onChange={(formats) => ed.setDefaultVideoFormats(formats)}
              t={t}
            />
          </div>
        </div>
      )}
    </div>
  )
}
