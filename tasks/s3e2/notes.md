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