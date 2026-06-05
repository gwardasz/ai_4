# S02E01 — `categorize` (agentowy inżynier promptów)

Autonomiczny "inżynier promptów": silny model LLM iteracyjnie tworzy **prompt
klasyfikujący** dla archaicznego mini-modelu huba (okno kontekstowe 100 tokenów),
testuje go w pełnym cyklu i poprawia na podstawie feedbacku, aż zdobędzie flagę.

Zadanie polega na sklasyfikowaniu 10 towarów jako `DNG` (niebezpieczne) lub `NEU`
(neutralne). Haczyk: wszystkie pozycje związane z **reaktorem** muszą być zawsze
klasyfikowane jako `NEU`, mimo że brzmią niebezpiecznie. Prompt musi zmieścić się
w 100 tokenach (łącznie z danymi towaru), a całe podejście w budżecie **1,5 PP**.

## Podejście (zgodnie z lekcją S02E01)

Zamiast ręcznie zgadywać prompt, agent dysponuje jednym narzędziem
`run_classification_cycle`, które wykonuje cały cykl i zwraca ustrukturyzowany
feedback. Model sam analizuje wynik (które ID źle sklasyfikowane, czy przekroczono
limit/budżet) i proponuje lepszy szablon. Sterowanie limitami sieci jest
deterministyczne w kodzie (jak w `s1e5`), a nie w decyzji LLM.

```
LLM (inżynier) --promptTemplate--> run_classification_cycle
   ^                                   |
   |                          reset -> pobierz świeży CSV ->
   |                          10x: podstaw {id}/{description}, POST /verify
   |                                   |
   +-------- feedback (błędne ID, budżet, flaga?) <----+
```

## Podział kontekstu (S02E01)

| Warstwa | Plik | Co zawiera |
|---|---|---|
| System prompt | `src/config.js` | Rola, misja, polityka klasyfikacji (w tym wyjątek reaktora), reguła iteracji |
| Tool schema | `src/tools/definitions.js` | Kontrakt techniczny szablonu: placeholdery, limit 100 tokenów, DNG/NEU, cache-first |
| Tool output | `src/tools/handlers.js` | `outcome` z naszego harnessu, `items[].hub` = surowa odpowiedź API (model sam analizuje), `promptTemplate` echo |
| recoveryHints | `handlers.js` | Jedno zdanie, tylko przy błędzie; bez powtórki polityki z systemu |

Odpowiedzi huba nie są parsowane — agent interpretuje surowy feedback (agentic observation). Pełne odpowiedzi w `logs/` (poziom `debug`).

## Dwa rozdzielne rozliczenia tokenów

- **Zużycie AGENTA** (`src/helpers/stats.js`) — koszt naszej pętli LLM
  (`input/output/reasoning/cached/requests`), czytany z pola `usage` każdej
  odpowiedzi Responses API. Raportowany przez `logStats()` na końcu przebiegu.
  To **nie** jest budżet mini-modelu klasyfikującego z zadania.
- **Prompt KLASYFIKUJĄCY** (`src/utils/tokens.js`) — limit 100 tokenów i budżet
  1,5 PP egzekwuje hub. Lokalnie estymujemy długość promptu tokenizerem
  `js-tiktoken` (`o200k_base`, rodzina GPT-5), aby pre-walidować limit **przed**
  wysyłką i nie przepalać budżetu huba. Hub pozostaje ostatecznym źródłem prawdy.

## Architektura

- `app.js` — montaż konfiguracji (DI), uruchomienie agenta, `logStats()` i raport flagi
- `src/config.js` — model (wybieralny `ENGINEER_MODEL`), `TASK_NAME`, `VERIFY_URL`, `DATA_URL`, limity tokenów/budżetu, instrukcja systemowa
- `src/llm.js` — cienki klient Responses API; rejestruje zużycie tokenów agenta (`recordUsage`)
- `src/agent.js` — pętla tool-call (sekwencyjna), wykrycie flagi i deterministyczne przerwanie
- `src/services/categorize-api.js` — transport: pobranie + parsowanie CSV, `POST /verify`, reset, obsługa 503/429
- `src/tools/*` — schemat narzędzia `run_classification_cycle` + handler komponujący cykl
- `src/utils/*` — logger (JSONL + konsola, redakcja sekretów), estymacja tokenów (tiktoken)
- `src/helpers/stats.js` — tracker zużycia tokenów agenta (w tym cached)

## Uruchomienie

Najpierw zainstaluj zależności w katalogu repo (`ai-devs-tasks`):

```bash
npm install
```

Następnie uruchom zadanie:

```bash
node app.js
```

Wybór modelu inżyniera (do przetestowania obu):

```bash
# domyślnie: gpt-5-mini
ENGINEER_MODEL=anthropic/claude-sonnet-4-6 node app.js
```

## Konfiguracja (przez env)

- `ENGINEER_MODEL` — model inżyniera promptów (domyślnie `gpt-5-mini`; opcjonalnie `anthropic/claude-sonnet-4-6`)
- `MAX_TOOL_ROUNDS` — maksymalna liczba iteracji agenta (domyślnie 20)
- `PROMPT_TOKEN_LIMIT` — limit tokenów promptu klasyfikującego (domyślnie 100)
- `MAX_HTTP_RETRIES`, `BASE_BACKOFF_MS`, `MAX_BACKOFF_MS`, `MAX_RATE_LIMIT_WAIT_MS` — parametry obsługi 503/429
- `LOG_LEVEL` — `debug` | `info` (domyślnie) | `warn` | `error`
- `LOG_CONSOLE` — `all` (domyślnie) | `conversation`

Sekrety i adresy czytane z `ai-devs-tasks/.env` (poza repo): `OPENROUTER_API_KEY`
(lub `OPENAI_API_KEY`), `AI_DEVS_API_KEY`, `HUB_BASE_URL`.

Pełny zapis przebiegu trafia do `logs/<data>.jsonl`.
