// Normalizzazione dei generi composti TV di TMDB in etichette brevi da badge.
//
// TMDB unifica le serie sotto tre generi composti mai localizzati in it-IT:
// 10759 "Action & Adventure", 10765 "Sci-Fi & Fantasy", 10768 "War & Politics".
// Stampati crudi rubano spazio nel badge e stonano in italiano. Questo helper
// è l'unica verità condivisa client/server (Golden Rule): stessa input,
// stessa etichetta in preview e nel poster Stremio.
//
// Idempotente: normalizzare un valore già normalizzato lo restituisce invariato.
// I generi non composti passano invariati (trim soltanto).

/** True per italiano ("it", "it-IT", ...). Tutto il resto usa l'etichetta inglese breve. */
function isItalianLang(lang: string | null | undefined): boolean {
  return (lang || "").slice(0, 2).toLowerCase() === "it"
}

/**
 * Fork: etichette ebraiche. TMDB he-IL rende i composti TV in ebraico ("מדע
 * בדיוני ופנטזיה") oppure li lascia in inglese, e lascia in inglese i generi
 * solo-TV (Kids, News…): in entrambi i casi sul poster deve finire l'ebraico.
 */
const HEBREW_GENRES: Readonly<Record<string, string>> = {
  "sci-fi & fantasy": "מדע בדיוני",
  "מדע בדיוני ופנטזיה": "מדע בדיוני",
  "action & adventure": "אקשן",
  "אקשן והרפתקאות": "אקשן",
  "war & politics": "מלחמה",
  "מלחמה ופוליטיקה": "מלחמה",
  kids: "ילדים",
  news: "חדשות",
  reality: "ריאליטי",
  soap: "אופרת סבון",
  talk: "טוק שואו",
}

function isHebrewLang(lang: string | null | undefined): boolean {
  return (lang || "").slice(0, 2).toLowerCase() === "he"
}

export function normalizeGenreName(
  raw: string | null | undefined,
  lang?: string | null,
): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const key = trimmed.toLowerCase()
  if (isHebrewLang(lang) && HEBREW_GENRES[key]) return HEBREW_GENRES[key]
  const it = isItalianLang(lang)
  if (key === "sci-fi & fantasy") return it ? "Fantascienza" : "Sci-Fi"
  if (key === "action & adventure") return it ? "Azione" : "Action"
  if (key === "war & politics") return it ? "Guerra" : "War"
  return trimmed
}
