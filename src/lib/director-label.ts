/**
 * Etichetta del badge regista, senza dipendenze server.
 *
 * Vive fuori da `awards.ts` perché `poster-badge.ts` (che gira anche nel
 * client, via l'editor) deve poterla importare: `awards.ts` porta con sé la
 * cache e quindi il client Redis, che nel bundle browser non si risolve.
 */

export const DIRECTORS = [
  "Alfred Hitchcock", "Orson Welles", "John Ford", "Akira Kurosawa",
  "Charles Chaplin", "Federico Fellini", "Ingmar Bergman", "Steven Spielberg",
  "Stanley Kubrick", "D.W. Griffith", "William Wyler", "Howard Hawks",
  "David Lean", "Martin Scorsese", "Jean Renoir", "Robert Bresson",
  "Jean-Luc Godard", "Frank Capra", "Andrei Tarkovsky", "Luis Buñuel",
  "Michael Powell", "John Huston", "Michael Curtiz", "Billy Wilder",
  "Carl Theodor Dreyer", "Yasujirō Ozu", "Woody Allen", "Abel Gance",
  "Ernst Lubitsch", "Paul Thomas Anderson", "Francis Ford Coppola",
  "Michelangelo Antonioni", "Sergio Leone", "F.W. Murnau", "Ridley Scott",
  "David Lynch", "George Stevens", "Fritz Lang", "Roman Polanski",
  "Miloš Forman", "James Cameron", "Tim Burton", "Elia Kazan",
  "François Truffaut", "George Cukor", "Buster Keaton", "Werner Herzog",
  "Sergei Eisenstein", "Cecil B. DeMille", "Kenji Mizoguchi", "Nicholas Ray",
  "Tod Browning", "John Sturges", "Otto Preminger", "Victor Fleming",
  "Carol Reed", "Roberto Rossellini", "Fred Zinnemann", "Sidney Lumet",
  "Marcel Carné", "Quentin Tarantino", "Raoul Walsh", "Henry King",
  "Dziga Vertov", "Lewis Milestone", "Rex Ingram", "Christopher Nolan",
  "Max Ophüls",
]

/**
 * Nomi ebraici curati. Vincono sull'etichetta di Wikidata, che per alcuni
 * registi manca e per altri usa una traslitterazione insolita. Non serve
 * coprire tutta la lista: chi non è qui prende l'etichetta di Wikidata, e chi
 * non ha nemmeno quella resta in inglese.
 */
const DIRECTOR_HE: Record<string, string> = {
  "Alfred Hitchcock": "אלפרד היצ'קוק",
  "Steven Spielberg": "סטיבן ספילברג",
  "Stanley Kubrick": "סטנלי קובריק",
  "Martin Scorsese": "מרטין סקורסזה",
  "Quentin Tarantino": "קוונטין טרנטינו",
  "Christopher Nolan": "כריסטופר נולאן",
  "Akira Kurosawa": "אקירה קורוסאווה",
  "Orson Welles": "אורסון וולס",
  "Francis Ford Coppola": "פרנסיס פורד קופולה",
  "Ridley Scott": "רידלי סקוט",
  "James Cameron": "ג'יימס קמרון",
  "David Lynch": "דיוויד לינץ'",
  "Woody Allen": "וודי אלן",
  "Tim Burton": "טים ברטון",
  "Roman Polanski": "רומן פולנסקי",
  "Billy Wilder": "בילי ויילדר",
  "Ingmar Bergman": "אינגמר ברגמן",
  "Federico Fellini": "פדריקו פליני",
  "Charles Chaplin": "צ'רלי צ'פלין",
  "Sergio Leone": "סרג'ו ליאונה",
  "Paul Thomas Anderson": "פול תומאס אנדרסון",
  "Sidney Lumet": "סידני לומט",
}

/**
 * Nome canonico del regista se in allowlist, altrimenti null. Usato per lo
 * storage neutro in cache: la cache è per titolo, non per lingua, quindi non
 * può contenere label già rese (chi chiede per primo in una lingua
 * avvelenerebbe le altre per 24h). La resa avviene con directorBadgeLabel
 * dove la locale è nota.
 */
export function matchDirectorName(name: string | null): string | null {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  for (const d of DIRECTORS) {
    if (lower === d.toLowerCase() || lower.includes(d.toLowerCase())) {
      return d
    }
  }
  return null
}

/**
 * Etichetta localizzata a render-time dal nome canonico (mai dalla cache).
 *
 * In ebraico prova prima la mappa curata, poi l'etichetta ebraica di Wikidata
 * (`nameHe`), e in ultimo il nome latino: un nome in latino è meglio di nessun
 * badge. Senza `opts` si comporta esattamente come upstream.
 */
export function directorBadgeLabel(
  name: string | null,
  t?: (key: string, params?: Record<string, string | number>) => string,
  opts?: { nameHe?: string | null; locale?: string | null },
): string | null {
  if (!name) return null
  const canonical = matchDirectorName(name) ?? name
  const wantsHebrew = (opts?.locale || "").slice(0, 2).toLowerCase() === "he"
  const shown = wantsHebrew ? (DIRECTOR_HE[canonical] || opts?.nameHe || canonical) : canonical
  return t ? t("badge.director", { name: shown }) : shown
}
