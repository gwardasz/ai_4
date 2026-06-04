# S01E05 — railway

Jednorazowy, autonomiczny agent z function calling. Rozmawia z nieudokumentowanym,
samodokumentującym się API (task `railway`), zaczyna od akcji `help`, a następnie
wykonuje opisane przez nie akcje w odpowiedniej kolejności, aż aktywuje trasę
kolejową `X-01` i otrzyma flagę.

Główna trudność nie leży w logice, lecz w **odporności na limity**: API celowo
zwraca błędy 503 (symulacja przeciążenia) i ma bardzo restrykcyjny rate-limit.
Cała obsługa tych ograniczeń jest **deterministyczna w kodzie** (warstwa
transportowa), a nie w decyzji modelu — zgodnie z lekcją S01E05.

## Cel

- Aktywować trasę `X-01` przez API (`POST /verify`, task `railway`)
- Zacząć od `{"action":"help"}` i postępować dokładnie wg zwróconej dokumentacji
- Przetrwać błędy 503 i rate-limity bez przepalania budżetu zapytań
- Zakończyć po otrzymaniu flagi `{FLG:...}`

## Architektura

Warstwy z jedną odpowiedzialnością, DI, bez efektów ubocznych przy imporcie:

- `app.js` — montaż konfiguracji (DI), wstrzyknięcie loggera do handlerów i jeden przebieg agenta
- `src/config.js` — model, stałe (`TASK_NAME`, `VERIFY_URL`), limity rund i parametry backoffu/rate-limitu, instrukcja systemowa
- `src/llm.js` — cienki klient Responses API
- `src/agent.js` — pętla tool-call (wywołania narzędzi sekwencyjnie, by nie zalewać API)
- `src/tools/*` — schemat narzędzia widoczny dla modelu + fabryka handlerów (ujednolicony kształt odpowiedzi)
- `src/services/railway-api.js` — transport: POST do `/verify` + deterministyczna obsługa 503 i rate-limitów
- `src/utils/*` — logger (JSONL + konsola, redakcja sekretów)

## Mapowanie zasad z lekcji

- Jawne limity API (RPM/TPM, nagłówki resetu) -> transport czyta `Retry-After` / `RateLimit-Reset` i czeka do resetu
- 503 jako symulacja przeciążenia -> retry z wykładniczym backoffem + jitter
- "Każde zapytanie się liczy" -> tani model, niski limit rund, instrukcja bez zbędnych wywołań
- "Loguj każde wywołanie i odpowiedź" -> logger zapisuje request/response/nagłówki/odczekania
- Kontrola / error recovery -> handler zwraca `{ success, message, recoveryHints }`, by model mógł się poprawić
- Determinizm sterowania limitami -> obsługa 503/429 wyłącznie w kodzie, nie w LLM

## Narzędzie agenta

- `railway_api` — wysyła jedną akcję (`answer`) do API railway i zwraca odpowiedź; transport sam ponawia 503 i czeka na reset limitu

## Uruchomienie

```bash
node app.js
```

Sekrety i adresy czytane z `ai-devs-tasks/.env` (poza repo):

- `OPENAI_API_KEY` lub `OPENROUTER_API_KEY`
- `AI_DEVS_API_KEY`
- `HUB_BASE_URL` — bazowy adres huba zadań; z niego wyprowadzany jest endpoint `/verify`

## Konfiguracja limitów (opcjonalna, przez env)

- `MAX_TOOL_ROUNDS` — maksymalna liczba rund agenta (domyślnie 25)
- `MAX_503_RETRIES` — liczba ponowień na 503 / na rate-limit (domyślnie 8)
- `BASE_BACKOFF_MS`, `MAX_BACKOFF_MS` — parametry wykładniczego backoffu (domyślnie 1000 / 30000)
- `MAX_RATE_LIMIT_WAIT_MS` — górny limit pojedynczego oczekiwania na reset (domyślnie 120000)

## Logowanie

- `LOG_LEVEL` — `debug` | `info` (domyślnie) | `warn` | `error`
- `LOG_CONSOLE` — `all` (domyślnie) | `conversation`

Pełny zapis trafia do `logs/<data>.jsonl` niezależnie od `LOG_CONSOLE`.
