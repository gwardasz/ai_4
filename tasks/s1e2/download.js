import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pobieramy klucz bezpośrednio z naszej Fasady
import { AI_DEVS_API_KEY } from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!AI_DEVS_API_KEY) {
    console.error("❌ Brak AI_DEVS_API_KEY w pliku .env!");
    process.exit(1);
}

const LOCATIONS_URL = `https://hub.ag3nts.org/data/${AI_DEVS_API_KEY}/findhim_locations.json`;
const DATA_DIR = path.join(__dirname, 'data');
const LOCATIONS_OUTPUT_PATH = path.join(DATA_DIR, 'findhim_locations.json');

async function downloadJSON() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    console.log("Pobieranie pliku JSON...");
    try {
        const response = await fetch(LOCATIONS_URL);
        if (!response.ok) throw new Error(`Błąd: ${response.statusText}`);

        // Odbieramy dane jako tekst i zapisujemy do pliku
        const text = await response.text();
        fs.writeFileSync(LOCATIONS_OUTPUT_PATH, text, 'utf8');

        console.log(`✅ Plik zapisany w: ${LOCATIONS_OUTPUT_PATH}`);
    } catch (error) {
        console.error("❌ Błąd pobierania:", error.message);
    }
}

downloadJSON();