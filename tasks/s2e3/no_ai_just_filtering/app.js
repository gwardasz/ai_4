import { readFile } from "node:fs/promises";
import { findUniqueTags, filterLogs, TARGET_TAGS, outputFile } from "./src/filter.js";
import { submitDeclaration } from "./src/api.js";

async function main() {
  try {
    console.log('🔍 Skanowanie pliku...');
    const uniqueTags = await findUniqueTags();
    console.log('📋 Dostępne tagi:', uniqueTags);
    
    console.log(`\n⚙️ Filtrowanie (tylko unikalne treści) dla: ${TARGET_TAGS.join(', ')}...`);
    const linesSaved = await filterLogs(TARGET_TAGS);
    console.log(`✅ Zapisano ${linesSaved} unikalnych linii do ${outputFile}.`);

    // KROK NOWY: Odczytujemy przefiltrowany plik jako jeden ciąg znaków (string)
    console.log(`📖 Wczytywanie przefiltrowanych logów z pliku...`);
    const filteredContent = await readFile(outputFile, "utf-8");

    // Jeśli plik jest pusty, przerywamy proces
    if (!filteredContent.trim()) {
      console.warn("⚠️ Przefiltrowana zawartość jest pusta. Przerywam wysyłkę.");
      return;
    }

    // KROK NOWY: Wysyłka danych do API AI_DEVS
    console.log("🚀 Wysyłanie danych do serwisu weryfikacyjnego...");
    const result = await submitDeclaration(filteredContent.trim());

    if (result.ok) {
      console.log("🎉 Sukces! Odpowiedź z serwera:", result.data);
    } else {
      console.error(`❌ Serwer zwrócił błąd (Status ${result.status}):`, result.data);
    }

  } catch (error) {
    if (error.kind === "config") {
      console.error("❌ Błąd konfiguracji:", error.message);
    } else if (error.kind === "network") {
      console.error("❌ Błąd sieciowy:", error.message);
    } else {
      console.error("❌ Niespodziewany błąd programu:", error.message);
    }
  }
}

// Uruchomienie programu głównego
await main();