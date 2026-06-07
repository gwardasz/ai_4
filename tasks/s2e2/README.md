# S02E02 — `electricity` (agent + vision)

Autonomiczny agent rozwiązuje puzzle elektryczne 3×3: obraca płytki, aby dopasować układ kabli do wzoru docelowego i doprowadzić prąd do trzech elektrowni w obwodzie zamkniętym.

## Zadanie

Plansza to siatka 3×3 z elementami kabli. Źródło zasilania jest w **3x1** (lewy-dolny róg). Cel: dopasować układ do [schematu docelowego](https://hub.ag3nts.org/i/solved_electricity.png) — obwód zamknięty zasilający elektrownie PWR6132PL, PWR1593PL, PWR7264PL.

- Jedyna operacja: obrót pola o **90° w prawo** → `POST /verify` z `{ "rotate": "AxB" }`
- Stan bieżący: `{HUB_BASE_URL}/data/{API_KEY}/electricity.png`
- Adresacja pól: `AxB` (wiersz 1–3 od góry, kolumna 1–3 od lewej)

```
1x1 | 1x2 | 1x3
----|-----|----
2x1 | 2x2 | 2x3
----|-----|----
3x1 | 3x2 | 3x3
```

## Podejście

- **Vision** (Gemini) opisuje planszę jako JSON: 9 pól × otwarte krawędzie `N/E/S/W`
- **Agent tekstowy** porównuje `current` vs `target`, planuje obroty (1–3 na pole) i woła `rotate_tile`
- Przy błędzie: ponowny odczyt planszy + korekty — **bez resetu**
- Pliki agenta tylko w sandboxie `workspace/` (wzór s1e4)

## Narzędzia agenta

| Narzędzie | Opis |
|---|---|
| `get_board_state` | Pobiera PNG z huba, vision → grid `current` |
| `get_target_board` | Zwraca wzór z `reference/target_board.json` |
| `rotate_tile` | `{ cell, times }` — 1–3 obroty CW, każdy = 1 POST |

## Architektura

```
app.js → [TEST_MODE probe?] → agent.js ↔ LLM
              ↓                    ↓
           probe.js            tools/handlers.js
              ↓                 ↙     ↓      ↘
           vision.js    electricity-api  board.js
                              ↓
                           hub /verify
```

## Przygotowanie targetu

```bash
cd ai-devs-tasks/tasks/s2e2
node scripts/extract-target.js
```

Skrypt pobiera solved PNG, analizuje vision i zapisuje `reference/target_board.json`.

## Uruchomienie

```bash
cd ai-devs-tasks/tasks/s2e2
node app.js
```

### Tryb testowy (`TEST_MODE=1`)

Dwie pauzy do testowania modeli vision i analizy agenta:

```bash
TEST_MODE=1 VISION_MODEL=google/gemini-3-flash-preview node app.js
```

1. **Pauza 1** — po probe vision: wydruk `current` vs `target`, `[C]ontinue | [A]bort`
2. Agent opisuje różnice tekstem (bez obrotów)
3. **Pauza 2** — wydruk analizy agenta, `[C]ontinue | [A]bort`
4. Po zatwierdzeniu: obroty przez `rotate_tile`

Abort @ pauza 1 → zero tokenów agenta. Abort @ pauza 2 → ~1 runda LLM, zero obrotów.

## Konfiguracja (env)

Z `ai-devs-tasks/.env`:

- `AI_DEVS_API_KEY`, `HUB_BASE_URL`
- `OPENROUTER_API_KEY` lub `OPENAI_API_KEY`
- `AGENT_MODEL` — domyślnie `gpt-5-mini`
- `VISION_MODEL` — domyślnie `google/gemini-3-flash-preview`
- `TEST_MODE=1` — dwie pauzy
- `MAX_TOOL_ROUNDS` — domyślnie 30
- `LOG_LEVEL` — `debug` dla pełnych gridów w `logs/`

Logi: `logs/<data>.jsonl` — zdarzenia `board.vision`, `board.analysis`, `board.rotate`.
