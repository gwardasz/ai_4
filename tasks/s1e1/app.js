import {
  AI_API_KEY,
  AI_DEVS_API_KEY,
  EXTRA_API_HEADERS,
  RESPONSES_API_ENDPOINT,
  resolveModelForProvider
} from "../../config.js";
import { extractResponseText, toMessage } from "../../common/helpers.js";

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Przygotowanie ścieżki do pliku CSV
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, 'data', 'people.csv');

// --- FAZA 1: Wczytywanie i parsowanie CSV ---
// --- FAZA 1: Wczytywanie i parsowanie CSV (Wersja odporna na przecinki w tekście) ---
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    
    // Prosty podział dla pierwszego wiersza (nagłówków)
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        // MAGICZNY REGEX: Dzieli po przecinku, ALE TYLKO jeśli przecinek nie jest wewnątrz cudzysłowów
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        
        const obj = {};
        headers.forEach((header, index) => {
            if (values[index]) {
                // Usuwamy białe znaki ORAZ ewentualne cudzysłowy okalające tekst
                obj[header] = values[index].replace(/^"|"$/g, '').trim();
            } else {
                obj[header] = '';
            }
        });
        return obj;
    });
}

async function main() {
    console.log("🚀 Start zadania PEOPLE");

    // Sprawdzamy czy plik istnieje
    if (!fs.existsSync(CSV_PATH)) {
        console.error("❌ Brak pliku people.csv! Uruchom najpierw download.js");
        process.exit(1);
    }
    
    const people = parseCSV(CSV_PATH);
    console.log(`✅ Wczytano ${people.length} osób.`);
    
    // Wypisujemy strukturę pierwszego rekordu, żebyś wiedział jak odwoływać się do pól
    console.log("\nStruktura rekordu (pola, z których możesz korzystać):");
    console.log(people[0]);
    console.log("--------------------------------------------------\n");

    // --- FAZA 2: Filtrowanie ---
    // TUTAJ ZMIEŃ WARTOŚCI NA TE Z TREŚCI TWOJEGO ZADANIA:
    const TARGET_GENDER = "M";
    const TARGET_BIRTH_PLACE = "Grudziądz";      // miejsce urodzenia

    // 2. Obliczamy daty graniczne RAZ dla wieku 20-40 lat
    const today = new Date();

    // Najstarsza data urodzenia (40 lat temu)
    const minDate = new Date(today);
    minDate.setFullYear(today.getFullYear() - 40);
    const minDateStr = minDate.toISOString().split('T')[0]; 

    // Najmłodsza data urodzenia (20 lat temu)
    const maxDate = new Date(today);
    maxDate.setFullYear(today.getFullYear() - 20);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    console.log(`⚙️ Filtruję: Płeć=${TARGET_GENDER}, Miasto=${TARGET_BIRTH_PLACE}, Wiek=20-40 (${minDateStr} do ${maxDateStr})`);
    

    const filteredPeople = people.filter(p => {
        // Upewniamy się, że rekord ma w ogóle te pola (zapobiega błędom w "brudnych" danych)
        if (!p.birthDate || !p.gender || !p.birthPlace) return false; 
        
        // Zwróć true, tylko jeśli WSZYSTKIE 4 warunki są spełnione
        return (
            p.gender === TARGET_GENDER &&
            p.birthPlace === TARGET_BIRTH_PLACE &&
            p.birthDate >= minDateStr && 
            p.birthDate <= maxDateStr
        );
    });

    

    console.log(`🎯 Po filtracji zostało: ${filteredPeople.length} osób.`);
    
    if (filteredPeople.length > 0) {
        console.log("\nPierwsze 5 pasujących rekordów:");
        console.table(filteredPeople.slice(0, 5));
    }


// --- FAZA 3: Przygotowanie Danych i Schematu (Structured Outputs) ---
    
    const jobsToTag = filteredPeople.map((person, index) => ({
        id: index,
        job: person.job
    }));

    // --- PODGLĄD DANYCH (DEBUG) ---
    console.log(`\n👀 Podgląd przygotowanej paczki ${jobsToTag.length} zawodów (jobsToTag):`);
    
    // Jeśli jest ich mało, wyświetlamy całą tabelę. Jeśli dużo, np. pierwsze 10.
    console.table(jobsToTag.length <= 35 ? jobsToTag : jobsToTag.slice(0, 10));
    
    // // Zatrzymujemy skrypt! Nie idziemy dalej do LLM.
    // console.log("🛑 Skrypt zatrzymany (tryb weryfikacji). Sprawdź indeksy i opisy powyżej.");
    // process.exit(0); 
    // ------------------------------

    console.log(`\n🧠 Wysyłam ${jobsToTag.length} zawodów do LLM w celu otagowania...`);

    // POPRAWKA: Prawidłowa struktura zgodna z wymaganiami pola response_format
    const taggingSchema = {
        type: "json_schema",
        json_schema: {
            name: "job_classification",
            strict: true,
            schema: {
                type: "object",
                properties: {
                    classifications: {
                        type: "array",
                        description: "List of tagged jobs corresponding to the input list",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "integer" },
                                tags: {
                                    type: "array",
                                    items: { 
                                        type: "string",
                                        enum: [
                                            "it", 
                                            "transport", 
                                            "education", 
                                            "healthcare", 
                                            "working_with_people", 
                                            "working_with_vehicles", 
                                            "manual_labor"
                                        ] 
                                    }
                                }
                            },
                            required: ["id", "tags"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["classifications"],
                additionalProperties: false
            }
        }
    };

    const systemPrompt = `You are an expert data classification assistant. 
Your task is to assign the most appropriate tags to the provided job descriptions.
IMPORTANT: The input job descriptions are written in Polish, but you MUST evaluate them and assign tags using ONLY the provided English categories.
Return the output strictly in valid JSON format. Do not include any introductory text, explanations, or Markdown code blocks (like \`\`\`json). Output only the raw JSON string.

Definitions and Rules for Tags:
- 'it': Information Technology, software development, coding, databases.
- 'transport': Logistics, moving goods or people, supply chain, delivery.
- 'education': Teaching, schools, mentoring, training others.
- 'healthcare': Medicine, doctors, nurses, medical staff, healing.
- 'working_with_people': Customer service, HR, interacting with clients.
- 'working_with_vehicles': Driving, piloting, mechanics, operating machines.
- 'manual_labor': Physical work, construction, cleaning, farming.

Input jobs to classify:
${JSON.stringify(jobsToTag, null, 2)}`;


    // --- FAZA 4: Zapytanie do API i Zapis do pliku ---
    
    // --- FAZA 4: Zapytanie do API i zrzut surowych danych ---
    const RAW_RESPONSE_PATH = path.join(__dirname, 'data', 'raw_llm_response.txt');
    let responseText = "";

    // Mechanizm Cache: Jeśli plik istnieje, nie pytamy API
    if (fs.existsSync(RAW_RESPONSE_PATH)) {
        console.log(`♻️ Omijam API. Wczytuję surową odpowiedź z dysku...`);
        responseText = fs.readFileSync(RAW_RESPONSE_PATH, 'utf8');
    } else {
        console.log(`⏳ Brak cache. Wysyłam zapytanie do modelu...`);
        
        //const MODEL = resolveModelForProvider("google/gemini-2.0-flash-001");
        const MODEL = resolveModelForProvider("gpt-5.2"); 
        const requestBody = {
            model: MODEL,
            input: systemPrompt, 
            response_format: taggingSchema 
        };

        const response = await fetch(RESPONSES_API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_API_KEY}`,
                ...EXTRA_API_HEADERS
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (!response.ok || data.error) {
            console.error("❌ Błąd API:", JSON.stringify(data.error || data, null, 2));
            process.exit(1);
        }

        responseText = extractResponseText(data); 
        
        // Zapis do pliku
        fs.writeFileSync(RAW_RESPONSE_PATH, responseText, 'utf8');
        console.log(`💾 Zapisano SUROWĄ odpowiedź do: ${RAW_RESPONSE_PATH}`);
    }

    const aiResult = JSON.parse(responseText);
    const classifications = Array.isArray(aiResult) ? aiResult : aiResult.classifications;

    console.log("✅ AI pomyślnie sklasyfikowało zawody!");

    // ZAPIS 1: Surowe tagi od LLM
    const TAGS_FILE_PATH = path.join(__dirname, 'data', 'llm_tags.json');
    fs.writeFileSync(TAGS_FILE_PATH, JSON.stringify(aiResult, null, 2), 'utf8');
    console.log(`💾 Zapisano tagi LLM do: ${TAGS_FILE_PATH}`);

    // --- FAZA 5: Mapowanie na format końcowy i wysyłka ---
    
    // 1. Przypisujemy tagi z AI do naszych przefiltrowanych osób
    classifications.forEach(item => {
        if (filteredPeople[item.id]) {
            filteredPeople[item.id].tags = item.tags;
        }
    });

    // 2. Budujemy finalną tablicę (tylko transport + zmiana struktury pól)
    const finalAnswer = filteredPeople
        .filter(p => p.tags && p.tags.includes("transport"))
        .map(p => ({
            name: p.name,
            surname: p.surname,
            gender: p.gender,
            born: parseInt(p.birthDate.substring(0, 4), 10), // Konwersja YYYY-MM-DD -> YYYY (liczba)
            city: p.birthPlace,                             // Zmiana nazwy pola birthPlace -> city
            tags: p.tags                                    // Tablica stringów
        }));

    console.log(`🚚 Gotowe do wysyłki: ${finalAnswer.length} osób z tagiem transport.`);

    

    // 3. Wyświetlenie, zapis i OSTATECZNA WYSYŁKA
    if (finalAnswer.length > 0) {
        // Zapis do JSON
        const FINAL_RESULT_PATH = path.join(__dirname, 'data', 'final_result.json');
        fs.writeFileSync(FINAL_RESULT_PATH, JSON.stringify(finalAnswer, null, 2), 'utf8');
        console.log(`💾 Zapisano gotową listę do: ${FINAL_RESULT_PATH}`);
        
        // --- WYSYŁKA DO HUB.AG3NTS.ORG ---
        console.log("\n🚀 Wysyłam gotową odpowiedź do systemu weryfikacyjnego...");
        
        const payload = {
            apikey: AI_DEVS_API_KEY,
            task: "people",
            answer: finalAnswer
        };
        try {
            const response = await fetch("https://hub.ag3nts.org/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const resultText = await response.text();
            console.log("\n🎯 ODPOWIEDŹ SERWERA (Zdobądź swoją flagę!):");
            console.log("-------------------------------------------------");
            console.log(resultText);
            console.log("-------------------------------------------------");
            console.log(JSON.stringify(resultText, null, 2));
            console.log("-------------------------------------------------");

        } catch (error) {
            console.error("❌ Błąd podczas wysyłania do centrali:", error);
        }

    } else {
        console.log("⚠️ Nikt nie pasuje do kryteriów końcowych.");
    }
}
main();
