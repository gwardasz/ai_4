# S01E04 — sendit

Jednorazowy, autonomiczny agent z function calling. Pobiera dokumentację Systemu
Przesyłek Konduktorskich (SPK), analizuje ją (narzędzia plikowe + model vision),
wypełnia deklarację transportu dokładnie wg wzoru i wysyła ją do `/verify`,
samodzielnie poprawiając się aż do uzyskania flagi.

## Cel

- Pobrać i przeczytać całą dokumentację (start: `index.md`, plus linkowane pliki — w tym co najmniej jeden graficzny)
- Ustalić kod trasy Gdańsk → Żarnowiec, kategorię przesyłki finansowaną przez System (budżet 0 PP) oraz wzór deklaracji
- Złożyć deklarację 1:1 z formatem wzoru i wysłać jako `answer.declaration` (task: `sendit`)

## Dane przesyłki

- Nadawca (identyfikator): `450202122`
- Punkt nadawczy: Gdańsk
- Punkt docelowy: Żarnowiec
- Waga: 2800 kg (2,8 tony)
- Budżet: 0 PP (przesyłka darmowa lub finansowana przez System)
- Zawartość: kasety z paliwem do reaktora
- Uwagi specjalne: brak — nie dodawać żadnych uwag

## Architektura

Warstwy z jedną odpowiedzialnością, bez efektów ubocznych przy imporcie:

- `app.js` — montaż konfiguracji (DI) i uruchomienie pojedynczego przebiegu agenta
- `src/config.js` — model, stałe, dane przesyłki, instrukcja systemowa
- `src/llm.js` — cienki klient Responses API
- `src/vision.js` — analiza obrazu przez `input_image`
- `src/agent.js` — pętla tool-call
- `src/tools/*` — schematy widoczne dla modelu + handlery (ujednolicony kształt odpowiedzi)
- `src/fs/*` — lokalne operacje plikowe (inspirowane files-mcp, bez MCP)
- `src/services/*` — fetch dokumentacji oraz wysyłka do `/verify`
- `src/utils/*` — logger oraz sandbox ścieżek dla `workspace/`

## Narzędzia agenta

- `http_fetch` — pobiera plik dokumentacji do `workspace/`
- `fs_read` — listowanie katalogu / odczyt pliku z numeracją linii
- `fs_search` — wyszukiwanie po nazwie i treści w `workspace/`
- `fs_write` — zapis roboczych notatek / wersji deklaracji
- `understand_image` — analiza lokalnego obrazu modelem vision
- `submit_declaration` — wysyłka deklaracji do `/verify` (wynik wraca do pętli)

## Uruchomienie

```bash
node app.js
```

Sekrety i adresy czytane z `ai-devs-tasks/.env` (poza repo):

- `OPENAI_API_KEY` lub `OPENROUTER_API_KEY`
- `AI_DEVS_API_KEY`
- `HUB_BASE_URL` — bazowy adres huba zadań; z niego wyprowadzane są adresy dokumentacji i `/verify`

## Logowanie

- `LOG_LEVEL` — `debug` | `info` (domyślnie) | `warn` | `error`
- `LOG_CONSOLE` — `all` (domyślnie) | `conversation`

Pełny zapis trafia do `logs/<data>.jsonl` niezależnie od `LOG_CONSOLE`.
