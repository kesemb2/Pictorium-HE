/**
 * Messaggi d'errore delle route API (scritti in inglese o italiano) → testo
 * nella lingua dell'interfaccia. Le route restano come sono; qui si
 * riconoscono i messaggi noti che l'interfaccia mostra all'utente. Un
 * messaggio sconosciuto lascia il posto al testo generico del chiamante:
 * meglio un errore tradotto e generico che una frase in un'altra lingua.
 */

type Translate = (key: string, params?: Record<string, string | number>) => string

const KNOWN: Readonly<Record<string, string>> = {
  "PIN attuale non corretto": "ui.errPinCurrentWrong",
  "PIN non corretto": "ui.pinLockWrong",
  "Il nuovo PIN deve avere almeno 6 cifre": "ui.errPinTooShort",
  "Impossibile salvare il PIN": "ui.pinSaveError",
  "Nessun PIN configurato": "ui.errNoPin",
  "PIN mancante": "ui.errPinMissing",
  "Errore generazione sessione": "ui.errSession",
  "User limit reached": "ui.errUserLimit",
  "Password required (min 8 characters)": "ui.errPasswordRequired",
  "password required": "ui.errPasswordRequired",
  "Multi-user is disabled": "ui.errMultiUserDisabled",
  "Request body too large": "ui.errBodyTooLarge",
  "Invalid JSON body": "ui.errInvalidRequest",
  "Invalid body": "ui.errInvalidRequest",
  "Key not set": "ui.errKeyNotSet",
}

export function translateServerError(message: unknown, t: Translate, fallbackKey: string): string {
  if (typeof message === "string") {
    const key = KNOWN[message.trim()]
    if (key) return t(key)
  }
  return t(fallbackKey)
}
