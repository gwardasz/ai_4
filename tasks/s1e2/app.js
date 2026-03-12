import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_DEVS_API_KEY } from '../../config.js';

// Konfiguracja ścieżek
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCATIONS_FILE = path.join(__dirname, 'data', 'findhim_locations.json');
const SUSPECTS_FILE = '../s1e1/data/final_result.json';
const OUTPUT_FILE = path.join(__dirname, 'data', 'test_location.json');

/**
 * Funkcja odpowiedzialna WYŁĄCZNIE za komunikację z API (Wzorzec: API Client)
 */
async function fetchPersonLocation(name, surname) {
    const url = 'https://hub.ag3nts.org/api/location';
    
    console.log(`📡 Wysyłam zapytanie do API dla: ${name} ${surname}...`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            apikey: AI_DEVS_API_KEY,
            name: name,
            surname: surname
        })
    });

    if (!response.ok) {
        throw new Error(`Błąd API: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Główna funkcja orkiestrująca (Wzorzec: Controller)
 */
async function getLocations() {
    console.log("🚀 Start testu...");

    try {
        // ✅ PRO: Nieblokujący odczyt plików (Event Loop może w tym czasie działać)
        const powerPlantsRaw = await fs.readFile(LOCATIONS_FILE, 'utf8');
        const suspectsRaw = await fs.readFile(SUSPECTS_FILE, 'utf8');
        
        const powerPlants = JSON.parse(powerPlantsRaw);
        const suspects = JSON.parse(suspectsRaw);

        for (const person of suspects) {
            try {
                // 1. Pobierz dane z API
                const data = await fetchPersonLocation(person.name, person.surname);
                
                // 2. Wypisz wynik w konsoli
                console.log("\n✅ Otrzymano odpowiedź z API:");
                console.log(data);

                // 3. Analiza typu danych
                console.log("\n🔍 Analiza struktury (Profesjonalny Debugging):");
                console.log(`Typ zmiennej 'data': ${typeof data}`);
                
                if (data.message) {
                    const isArray = Array.isArray(data.message);
                    console.log(`Pole 'message' to tablica?: ${isArray}`);
                    if (isArray && data.message.length > 0) {
                        console.log(`Typ elementów w 'message': ${typeof data.message[0]}`);
                    }
                }

                // 4. Zapis do pliku
                await fs.writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
                console.log(`\n💾 Wynik zapisano w pliku: ${OUTPUT_FILE}`);

                // 5. Zabezpieczenie - Spike test
                console.log("\n🛑 Zatrzymuję pętlę po pierwszej iteracji zgodnie z założeniem.");
                break; 

            } catch (apiError) {
                console.error(`❌ Błąd podczas przetwarzania ${person.name} ${person.surname}:`, apiError.message);
                break; // W trakcie testu (Spike) ubijamy po pierwszym błędzie
            }
        }
    } catch (fsError) {
        // Główny blok catch wyłapie błędy braku plików json na dysku
        console.error("❌ Błąd systemu plików (Sprawdź ścieżki!):", fsError.message);
    }
}

getLocations();

