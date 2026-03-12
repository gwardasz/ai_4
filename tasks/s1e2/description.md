# Architektura Systemu: Agent Śledczy ("findhim")

## 📌 Przegląd
Projekt implementuje w pełni autonomicznego agenta AI opartego na architekturze **ReAct (Reason + Act)**. Celem agenta jest rozwiązanie zadania śledczego polegającego na zlokalizowaniu podejrzanego na podstawie jego współrzędnych geograficznych, korelacji tych danych z mapą elektrowni oraz zdobyciu jego poziomu dostępu.

System został zaprojektowany zgodnie z zasadami **Clean Architecture** oraz **Separation of Concerns**, oddzielając logikę AI, operacje I/O, infrastrukturę API oraz reguły biznesowe.

---

## 📂 Struktura Katalogów i Plików

\`\`\`text
├── src/
│   ├── app.js                 # Entry point: uruchomienie aplikacji
│   ├── config.js              # Centralny menadżer konfiguracji (API keys, provider AI)
│   ├── ai/
│   │   ├── agent.js           # Główna pętla agenta (ReAct Loop) z mechanizmem Human-in-the-Loop
│   │   └── agentConfig.js     # Scentralizowana konfiguracja agenta (model, instrukcje systemowe, sandbox)
│   ├── services/
│   │   ├── api.js             # Abstrakcja klienta HTTP do komunikacji z modelami LLM (OpenAI/OpenRouter)
│   │   └── hqService.js       # Klient HTTP do komunikacji z API Centrali (hub.ag3nts.org)
│   ├── tools/
│   │   ├── index.js           # Fasada/Router narzędzi (łączy definicje z handlerami)
│   │   ├── definitions.js     # Definicje narzędzi w formacie JSON Schema (OpenAI Tool Calling)
│   │   └── handlers.js        # Implementacje logiki biznesowej poszczególnych narzędzi w JS
│   └── utils/
│       └── sandbox.js         # Menadżer przestrzeni roboczej (Workspace) - bezpieczne I/O plików
├── data/
│   └── suspects.json          # Zewnętrzne dane wejściowe (lista osób z poprzedniego etapu)
├── workspace/                 # Tymczasowy cache/scratchpad (pliki generowane przez agenta)
└── .env                       # Zmienne środowiskowe
\`\`\`

---

## 🏗️ Kluczowe Komponenty i Wzorce Projektowe

### 1. Pętla Agenta (Executor / ReAct Loop) - `src/ai/agent.js`
Serce systemu. Agent działa w pętli asynchronicznej `while`, analizując kontekst i decydując o wywołaniu narzędzi.
* **Wzorzec Human-in-the-Loop (HITL):** Przed wysłaniem każdego zapytania do LLM system zatrzymuje się i czeka na zgodę użytkownika (odczyt przez moduł `readline`). Zapobiega to utracie kontroli nad kosztami API podczas testowania.
* **Circuit Breaker:** Wdrożono twardy limit iteracji (`MAX_ITERATIONS = 10`), chroniący system przed wejściem w nieskończoną pętlę halucynacji.
* **Fault Tolerance:** Błędy wewnątrz narzędzi nie powodują "wysypania" aplikacji. Są łapane (try/catch) i zwracane do modelu jako `tool_response`, pozwalając AI na samokorektę.

### 2. Narzędzia i Logika (Tool Calling) - `src/tools/`
Oddzielono definicje (to, co widzi model) od implementacji (to, co wykonuje środowisko Node.js).
* **Definicje w j. angielskim (`definitions.js`):** Opisy zoptymalizowano pod kątem zrozumienia przez LLM, jasno określając typy zwracanych danych.
* **Przeniesienie ciężaru obliczeniowego do JS (`handlers.js`):** Zamiast obarczać LLM matematyką przestrzenną (co grozi halucynacjami), model otrzymuje dedykowane narzędzie `analyze_proximity`. Pod spodem, w środowisku JS, używany jest **Wzór Haversine'a** do dokładnego obliczenia odległości na kuli ziemskiej. LLM otrzymuje tylko zwięzły werdykt.

### 3. Wzorzec Przestrzeni Roboczej (Workspace Pattern) - `src/utils/sandbox.js`
Zamiast "pompować" setki kilobajtów JSON-ów do okna kontekstowego (Context Window) modelu, system używa lokalnego systemu plików (cache).
* **Mechanizm:** Narzędzie pobierające lokalizacje lub elektrownie zapisuje je w folderze `workspace/`, a do modelu zwraca jedynie *nazwę pliku*. Następnie inne narzędzie (np. `analyze_proximity`) wczytuje te pliki.
* **Bezpieczeństwo (Security by Design):** Klasa `Workspace` implementuje weryfikację ścieżek absolutnych (`path.resolve`). Blokuje ataki typu *Path Traversal* (np. próby odczytu `../../../.env` wyhalucynowane przez model), rzucając `SecurityViolationError`.

### 4. Optymalizacja I/O (Serwisy i Współbieżność)
* **Serwis API (`hqService.js`):** Abstrakcja dla wywołań `fetch`. Centralizuje doklejanie klucza `apikey` do żądań POST oraz ujednolica obsługę błędów HTTP.
* **Batching & Promise.all:** W narzędziu `download_people_locations` wykorzystano właściwości asynchroniczne JavaScriptu do współbieżnego pobierania danych o wszystkich podejrzanych na raz. Znacząco redukuje to latencję (czas oczekiwania) całego systemu.
* **Rate Limiting:** W integracji z darmowym API Geokodowania (Nominatim) wprowadzono opóźnienia (`setTimeout(1000)`) w pętli synchronicznej, aby zapobiec zablokowaniu IP. Bezpiecznie obsłużono też polskie znaki i spacje używając interfejsu `URLSearchParams`.

---

## ⚖️ Wybrane Trade-offs (Wady i Zalety)

1. **Przechowywanie danych w plikach vs. Kontekst LLM:**
   * *Zaleta:* Drastyczne zmniejszenie zużycia tokenów, niższe koszty, mniejsze ryzyko "zgubienia" uwagi przez model, zyskujemy lokalny cache po restarcie aplikacji.
   * *Wada:* Wymaga dodatkowej warstwy zarządzania plikami (Sandbox) i operacji I/O na dysku.
2. **"Inteligentne Narzędzia" (Smart Tools) vs. Atomowe Narzędzia:**
   * *Zaleta:* Narzędzie `analyze_proximity` samo pętluje i filtruje dane. Zmniejsza to liczbę iteracji modelu z kilkudziesięciu do zaledwie kilku.
   * *Wada:* Zmniejsza to swobodę dedukcyjną agenta (logika zaszyta "na sztywno" w kodzie), ale w zastosowaniach produkcyjnych gwarantuje to 100% determinizmu w newralgicznych punktach.