# Bundled fonts

Scaricati da `node scripts/download-fonts.mjs`, versionati nel repo perché il
render dei poster (`src/lib/fonts.ts` → resvg) li legge da disco con
`loadSystemFonts: false`: senza i file il badge esce vuoto.

| File | Famiglia | Licenza | Uso |
|---|---|---|---|
| `Inter-Regular.ttf`, `Inter-Bold.ttf`, `Inter-Black.ttf` | Inter | SIL Open Font License 1.1 | Testo latino di tutti i badge (pesi 400/700/900) |
| `NotoSansSymbols2-Regular.ttf` | Noto Sans Symbols 2 | SIL Open Font License 1.1 | Glifo stella ★ del badge genere |
| `Rubik-Regular.ttf`, `Rubik-Bold.ttf`, `Rubik-Black.ttf` | Rubik | SIL Open Font License 1.1 | Testo ebraico e arabo: Inter non ha questi glifi |
| `BarlowCondensed-Regular.ttf`, `BarlowCondensed-Bold.ttf`, `BarlowCondensed-Black.ttf` | Barlow Condensed (expo-google-fonts 0.4.1) | SIL Open Font License 1.1 | Selettore "Font dei badge" (pesi 400/700/900) |
| `Oswald-Regular.ttf`, `Oswald-SemiBold.ttf`, `Oswald-Bold.ttf` | Oswald (expo-google-fonts 0.4.2) | SIL Open Font License 1.1 | Selettore "Font dei badge" (pesi 400/600/700; il 900 risolve sul Bold) |
| `Heebo-Regular.ttf`, `Heebo-Bold.ttf`, `Heebo-Black.ttf` | Heebo | SIL Open Font License 1.1 | Fork: selettore "Font ebraico" (testo ebraico) |
| `Karantina-Regular.ttf`, `Karantina-Bold.ttf` | Karantina | SIL Open Font License 1.1 | Fork: selettore "Font ebraico" (il 900 risolve sul Bold) |
| `SecularOne-Regular.ttf` | Secular One | SIL Open Font License 1.1 | Fork: selettore "Font ebraico" (un solo peso, già display) |
| `FrankRuhlLibre-Regular.ttf`, `FrankRuhlLibre-Bold.ttf`, `FrankRuhlLibre-Black.ttf` | Frank Ruhl Libre | SIL Open Font License 1.1 | Fork: selettore "Font ebraico" (serif) |

Rubik copre latino, ebraico e arabo. resvg fa fallback per-glifo sull'intero fontdb,
quindi la sola presenza dei file evita i quadratini anche dove `font-family`
resta `Inter` — ma quel fallback ignora il peso richiesto e ripiega sempre sul
regular, per questo `fontFamilyFor` (in `src/lib/badge-svg-shared.ts`) dichiara
`Rubik` esplicitamente quando il testo contiene ebraico.

Fork: le famiglie ebraiche del selettore "Font ebraico" non stanno nel fontdb
di ogni render: `fontFilesFor` (`src/lib/fonts.ts`) le aggiunge solo quando
l'SVG le dichiara, così il render di default non legge un byte in più.
