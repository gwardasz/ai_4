# WYTYCZNE PROJEKTOWE ARCHITEKTURY AGENTA (ZADANIE: FIRMWARE)

## 1. PODZIAŁ RÓL (ROZUMOWANIE VS DETERMINIZM)

### LLM (Mózg):

- Analiza komendy help i niestandardowego środowiska shell. 
- Sekwencyjne planowanie działań (odkrywanie haseł, modyfikacja settings.ini). 
- Analiza logów błędów aplikacji (cooler.bin) i interpretacja wyników.  
- Ekstrakcja końcowego kodu weryfikacyjnego (format ECCS-...).

### Kod (Układ wykonawczy):

- Orkiestracja pętli agentowej (Thought -> Action -> Observation).
- Bezpośrednia komunikacja z API HTTP (wstrzykiwanie kluczy, formatowanie JSON).

## 2. BEZPIECZEŃSTWO I GUARDRAILS (TWARDE REGUŁY)

- Walidacja Inputu (Input Guardrails): Przed wysłaniem komendy do API, kod blokuje ciągi zawierające /etc, /root, /proc/.  
- Symulacja odpowiedzi: W przypadku wykrycia zabronionej ścieżki, kod zwraca do LLM sztuczny komunikat o braku dostępu, chroniąc przed banem i resetem maszyny.  
- Obsługa .gitignore: Narzędzie modyfikacji plików automatycznie weryfikuje reguły .gitignore w danym katalogu przed wykonaniem operacji.

## 3. ODPORNOŚĆ INFRASTRUKTURALNA (RESILIENCE)

- Obsługa błędów sieciowych: Kody HTTP 429 (Rate Limit) i 503 obsługiwane są automatycznie w kodzie (Retry + Exponential Backoff).  
- Izolacja kontekstu: LLM nie widzi błędów sieciowych i nie marnuje tokenów na czekanie – dostaje tylko wynik końcowy lub błąd logiczny.  
- Restart awaryjny: Implementacja wywołania funkcji reboot w kodzie w przypadku utknięcia agenta w martwym punkcie.

## 4. OBSERWOWALNOŚĆ I MONITOROWANIE (OBSERVABILITY)

**zgodnie z @4th-devs/03_01_observability**

## Zero Trust for tool output
Context:
My LLM agent has access to a shell execution tool. Recently, the system crashed because the agent read a binary file. This caused an "Unbounded Tool Output" problem: the shell returned a massive payload of non-printable characters and null bytes, which instantly bloated the response to over 2.5 million tokens, leading to "Context Window Exhaustion" and a hard API crash. 

Task:
Review our current codebase and write an implementation plan to build a "Zero Trust" security wrapper around the agent's shell execution tool. 

The plan must implement the following specific safeguards:
1. Binary Data Detection: Intercept the raw ArrayBuffer. Check if it is a binary file - report it to LLM.
2. Strict Decoding: If no - try to strictly decode it to UTF-8 (rejecting invalid sequences).
3. Hard Truncation: If the decoded valid text exceeds 5000 characters, truncate it and append "\n[...Output truncated after 5000 characters...]".
4. Agent Feedback Loop: Ensure that triggering any of the above safeguards does NOT crash the orchestrator. Catch these exceptions and return them as a standard tool observation back to the agent (e.g., "System Error: Command returned binary data or exceeded limits") so the agent can self-correct its next action.