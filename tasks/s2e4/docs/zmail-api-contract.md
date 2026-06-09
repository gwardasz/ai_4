# zmail API — kontrakt i audyt założeń

Dokument oparty na żywych odpowiedziach API (`npm run probe:zmail`, 2026-06-09) oraz cache w `test/fixtures/zmail/`.

## Potwierdzony kontrakt API

Endpoint: `POST {HUB_BASE_URL}/api/zmail` z polem `apikey`.

### `search`

```json
{
  "ok": true,
  "action": "search",
  "query": "from:proton.me",
  "pagination": { "page": 1, "perPage": 10, "total": 1, "totalPages": 1 },
  "items": [ { "rowID", "messageID", "threadID", "subject", "from", "to", "date", "snippet" } ]
}
```

- Lista wyników jest w **`items`** (nie `messages`).
- Search zwraca **metadane** — pole `snippet`, **bez** pełnego `message` (treści).

### `getMessages`

```json
{
  "ok": true,
  "action": "getMessages",
  "count": 1,
  "items": [ { "rowID", "messageID", "threadID", "subject", "message", "from", "to", "date", "request" } ],
  "notFound": []
}
```

- Pełna treść maila: pole **`message`** (string) wewnątrz obiektu w **`items`**.
- `ids` akceptuje **messageID** (32-znakowy hash) lub **rowID** (number).

### `getThread`

```json
{
  "apikey": "...",
  "action": "getThread",
  "threadID": 62044
}
```

- Zwraca wszystkie maile w wątku w **`items`** (ten sam kształt co `getMessages` / search metadata).
- `threadID` jest numeryczny — dostępny w polu `threadID` trafień search i zapisanych maili.

Narzędzie agenta: **`zmail_get_thread`** — zapisuje każdy mail z wątku do `workspace/mails/`.

### Pusta odpowiedź search

`items: []`, `pagination.total: 0`, HTTP 200 — nie jest to błąd.

---

## Zapis w workspace (`mails/*.json`)

Po fetchu handler zapisuje ujednolicony kształt:

```json
{
  "id": "<messageID>",
  "fetchedAt": "<ISO>",
  "query": "<search query, optional>",
  "metadata": { "...search hit..." },
  "body": { "...full mail from getMessages..." },
  "bodyText": "<plain text from body.message>"
}
```

Analyst powinien czytać **`bodyText`**, z fallbackiem na `body.message`.

---

## Audyt dotychczasowych założeń

| Miejsce | Założenie | Werdykt |
|---------|-----------|---------|
| `normalizeMessages` — `data.items` | Search/getMessages zwracają tablicę pod `items` | **Potwierdzone** |
| `normalizeMessages` — `data.messages` | Alternatywny klucz tablicy | **Niepewne** — nie występuje w probe; zostawione jako fallback |
| `normalizeMessages` — `data.results` | Alternatywny klucz | **Błędne / usunięte** — brak w API |
| `normalizeMessages` — `if (data.message) return [data.message]` | Pojedynczy mail w `data.message` | **Błędne** — `message` to treść maila (string), nie wrapper |
| `extractMailId` — `messageID` przed `rowID` | Stabilne ID pliku | **Potwierdzone** — rowID różni się między search (88) a getMessages (90) |
| Zapis `body = messages[0] ?? hit` | getMessages dostarcza pełne body | **Potwierdzone** z fallbackiem na metadata search |
| Analyst — „full body field” | Treść w `body` | **Błędne w promptcie** — treść w `body.message` / `bodyText` |
| `mailFilePath` — sanityzacja ID | Bezpieczna nazwa pliku | **Potwierdzone** |
| `snippet` tylko w search | Metadata vs body | **Potwierdzone** |

---

## Parser (`src/services/zmail-parse.js`)

| Funkcja | Rola |
|---------|------|
| `isMailRecord` | Obiekt z co najmniej jednym polem ID |
| `normalizeMessages` | API response → tablica rekordów maili |
| `extractMailId` | messageID > rowID > … |
| `pickMailBody` | Pierwszy rekord z getMessages lub fallback search hit |
| `getMailText` | bodyText / body.message |
| `buildSavedMail` | Ujednolicony zapis do workspace |

---

## Testy i probe

```bash
npm run test:s2e4      # offline, fixture'y w test/fixtures/zmail/
npm run probe:zmail    # live API → odświeża fixture'y (wymaga .env)
```

Fixture'y: `help.json`, `search-from-proton.json`, `search-empty.json`, `getMessages-by-messageID.json`, `getMessages-by-rowID.json`, `saved-mail-sample.json`.
