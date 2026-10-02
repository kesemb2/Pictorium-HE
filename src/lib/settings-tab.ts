/**
 * Tab impostazioni richiesta (micro-stato modulo, niente storage): la toolbar
 * la imposta PRIMA di aprire il pannello (dynamic, monta in async) e il
 * pannello la consuma al mount. Niente race tra mount ed eventi.
 */
const VALID_TABS = ["badge", "trasforma", "prefs", "data", "spazio"] as const
export type SettingsTabId = (typeof VALID_TABS)[number]

let pending: SettingsTabId | null = null

export function requestSettingsTab(tab: SettingsTabId): void {
  pending = tab
}

/** Legge e azzera la tab richiesta (solo valori noti, mai arbitrari). */
export function consumeSettingsTab(): SettingsTabId | null {
  const t = pending
  pending = null
  return t && (VALID_TABS as readonly string[]).includes(t) ? t : null
}
