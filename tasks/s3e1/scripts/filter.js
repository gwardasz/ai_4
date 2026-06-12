import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { 
  WORKSPACE_ROOT,
  VERIFY_URL,          
  TASK_NAME,
  AI_DEVS_API_KEY
 } from "../src/config.js";

// Zaktualizowane importy, dodano narzędzia do obsługi LLM
import { 
  AI_API_KEY, 
  AI_PROVIDER, 
  EXTRA_API_HEADERS, 
  resolveModelForProvider, 
  RESPONSES_API_ENDPOINT 
} from "../../../config.js";

const SENSORS_DIR = join(WORKSPACE_ROOT, "sensors");
const FILTERED_DIR = join(WORKSPACE_ROOT, "filtered");
const COMMENTS_FILE = join(WORKSPACE_ROOT, "comments.txt");
const STATEMENTS_FILE = join(WORKSPACE_ROOT, "statements.txt");
const CLASSIFIED_FILE = join(WORKSPACE_ROOT, "classified.txt");
// Dodaj te nowe stałe na górze pliku, tam gdzie są inne ścieżki
const CORRECT_FILE = join(FILTERED_DIR, "correct.txt");
const INCORRECT_FILE = join(FILTERED_DIR, "incorrect.txt");
const INCORRECT_COMMENT_BASED_FILE = join(FILTERED_DIR, "incorrect_comment_based.txt");
const INCORRECT_FINAL_FILE = join(FILTERED_DIR, "incorrect_final.txt");

const SENSOR_RULES = {
  temperature: { key: "temperature_K", min: 553, max: 873 },
  pressure: { key: "pressure_bar", min: 60, max: 160 },
  water: { key: "water_level_meters", min: 5.0, max: 15.0 },
  voltage: { key: "voltage_supply_v", min: 229.0, max: 231.0 },
  humidity: { key: "humidity_percent", min: 40.0, max: 80.0 }
};

const validateSensorData = (data) => {
  const activeSensors = data.sensor_type.split("/");
  for (const [sensorName, rule] of Object.entries(SENSOR_RULES)) {
    const value = data[rule.key];
    if (activeSensors.includes(sensorName)) {
      if (value < rule.min || value > rule.max) return false;
    } else {
      if (value !== 0) return false;
    }
  }
  return true;
};

// --- ETAP 1: Filtrowanie JSON-ów i wyciąganie komentarzy ---
export const runStage1_Filter = async () => {
  console.log("--- ETAP 1: Filtrowanie odczytów ---");
  await mkdir(FILTERED_DIR, { recursive: true });

  const files = await readdir(SENSORS_DIR, { recursive: true, withFileTypes: true });
  const jsonFiles = files.filter(f => f.isFile() && f.name.endsWith(".json"));

  const correctFiles = [];
  const incorrectFiles = [];
  const uniqueComments = new Set();

  for (const file of jsonFiles) {
    const directory = file.parentPath ?? file.path;
    const filePath = join(directory, file.name);
    
    try {
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      
      if (data.operator_notes) uniqueComments.add(data.operator_notes);

      if (validateSensorData(data)) {
        correctFiles.push(file.name);
      } else {
        incorrectFiles.push(file.name);
      }
    } catch (error) {
      incorrectFiles.push(file.name);
    }
  }

  await writeFile(join(FILTERED_DIR, "correct.txt"), correctFiles.join("\n"));
  await writeFile(join(FILTERED_DIR, "incorrect.txt"), incorrectFiles.join("\n"));
  await writeFile(COMMENTS_FILE, Array.from(uniqueComments).join("\n"));

  console.log(`Przeanalizowano plików: ${jsonFiles.length}`);
  console.log(`Zapisano correct.txt (${correctFiles.length}) i incorrect.txt (${incorrectFiles.length}) w: ${FILTERED_DIR}`);
  console.log(`Zapisano unikalne komentarze (${uniqueComments.size}) w: ${COMMENTS_FILE}\n`);
};

// --- ETAP 2: Wyciąganie stwierdzeń na podstawie pliku comments.txt ---
export const runStage2_Statements = async () => {
  console.log("--- ETAP 2: Ekstrakcja stwierdzeń z komentarzy ---");
  
  let commentsContent = "";
  try {
    commentsContent = await readFile(COMMENTS_FILE, "utf-8");
  } catch (error) {
    console.error(`Nie można wczytać pliku ${COMMENTS_FILE}. Upewnij się, że najpierw wykonałeś ETAP 1.`);
    return;
  }

  const commentsList = commentsContent.split("\n").filter(line => line.trim() !== "");
  const uniqueStatements = new Set();

  for (const comment of commentsList) {
    const parts = comment.replace(/\./g, '').split(',');
    for (const part of parts) {
      const cleanStatement = part.trim();
      if (cleanStatement) {
        uniqueStatements.add(cleanStatement);
      }
    }
  }

  await writeFile(STATEMENTS_FILE, Array.from(uniqueStatements).join("\n"));
  
  console.log(`Przeanalizowano unikalnych komentarzy: ${commentsList.length}`);
  console.log(`Znaleziono unikalnych stwierdzeń: ${uniqueStatements.size}`);
  console.log(`Zapisano w: ${STATEMENTS_FILE}\n`);
};

// --- ETAP 3: Kategoryzacja stwierdzeń za pomocą LLM ---
export const runStage3_LLMClassification = async () => {
  console.log("--- ETAP 3: Klasyfikacja stwierdzeń przez LLM (w paczkach) ---");
  
  let statementsContent = "";
  try {
    statementsContent = await readFile(STATEMENTS_FILE, "utf-8");
  } catch (error) {
    console.error(`Nie można wczytać pliku ${STATEMENTS_FILE}. Wykonaj najpierw ETAP 2.`);
    return;
  }

  const statementsList = statementsContent.split("\n").filter(line => line.trim() !== "");

  if (statementsList.length === 0) {
    console.log("Brak stwierdzeń do analizy.");
    return;
  }

  console.log(`Całkowita liczba stwierdzeń do analizy: ${statementsList.length}`);

  const model = resolveModelForProvider("gpt-4o-mini"); 
  const BATCH_SIZE = 10;
  let allClassifications = [];

  // ZMIANA: Pętla dzieląca zapytania na paczki (batche)
  for (let i = 0; i < statementsList.length; i += BATCH_SIZE) {
    const batch = statementsList.slice(i, i + BATCH_SIZE);
    console.log(`[Batch ${Math.floor(i / BATCH_SIZE) + 1}] Wysyłanie elementów od ${i + 1} do ${i + batch.length}...`);

    const systemPrompt = `You are a technical system anomalies detector.
    Analyze the JSON list of operator statements provided by the user.
    Classify each statement based on these rules:
    - Return "[ERR]" if the statement suggests an abnormal situation, problem, instability, or explicitly states that extra verification/action is needed.
    - Return "[OK]" otherwise (normal operation, stable readings, or no action needed).
    
    You MUST return ONLY a valid JSON array of strings containing EXACTLY ${batch.length} elements in the exact same order as the input. Do not include markdown blocks like \`\`\`json.
    Example output format:
    ["[OK]", "[ERR]", "[OK]"]`;

    try {
      const response = await fetch(RESPONSES_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${AI_API_KEY}`,
          ...EXTRA_API_HEADERS
        },
        body: JSON.stringify({
          model: model,
          instructions: systemPrompt,
          input: [
            { role: "user", content: JSON.stringify(batch) }
          ],
          temperature: 0.1 
        })
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Błąd API LLM: ${response.status} - ${errData}`);
      }

      const data = await response.json();
      let resultText = "";

      if (data.output && Array.isArray(data.output)) {
        const message = data.output.find(o => o.type === "message" && o.role === "assistant") || data.output[0];
        if (Array.isArray(message.content)) {
          resultText = message.content.find(c => c.type === "output_text")?.text || "";
        } else {
          resultText = message.content || "";
        }
      } else if (data.choices && Array.isArray(data.choices)) {
        resultText = data.choices[0].message.content;
      }

      resultText = resultText.trim();

      if (resultText.startsWith("```json")) {
        resultText = resultText.replace(/^```json/g, "").replace(/```$/g, "").trim();
      } else if (resultText.startsWith("```")) {
        resultText = resultText.replace(/^```/g, "").replace(/```$/g, "").trim();
      }

      const classifications = JSON.parse(resultText);

      if (classifications.length !== batch.length) {
        console.warn(`Ostrzeżenie w Batchu: LLM zwrócił ${classifications.length} elementów zamiast ${batch.length}. Uzupełniam brakujące [UNKNOWN].`);
      }

      // Bezpieczne dodawanie wyników i uzupełnianie braków, gdyby model znów zgubił wynik w mniejszej paczce
      for (let j = 0; j < batch.length; j++) {
        allClassifications.push(classifications[j] || "[UNKNOWN]");
      }

    } catch (error) {
      console.error(`Wystąpił błąd podczas analizy batcha (elementy ${i + 1}-${i + batch.length}):`, error.message);
      // W razie błędu oznaczamy całą paczkę jako UNKNOWN, aby zachować ciągłość i nie przerywać skryptu
      for (let j = 0; j < batch.length; j++) {
        allClassifications.push("[UNKNOWN_ERROR]");
      }
    }
  }

  // Łączymy wyniki z wszystkich paczek z oryginalnymi stwierdzeniami
  const outputLines = statementsList.map((statement, index) => {
    const status = allClassifications[index] || "[UNKNOWN]";
    return `${status} - ${statement}`;
  });

  await writeFile(CLASSIFIED_FILE, outputLines.join("\n"));
  
  console.log(`\nSkategoryzowano wszystkie stwierdzenia. Wyniki zapisano w: ${CLASSIFIED_FILE}\n`);
};
// --- ETAP 4: Finalna weryfikacja na podstawie komentarzy ---
export const runStage4_FinalValidation = async () => {
  console.log("--- ETAP 4: Finalna weryfikacja plików i komentarzy ---");

  try {
    // 1. Wczytanie sklasyfikowanych stwierdzeń
    const classifiedContent = await readFile(CLASSIFIED_FILE, "utf-8");
    const classifiedLines = classifiedContent.split("\n").filter(line => line.trim() !== "");

    // Zbieramy tylko czyste teksty stwierdzeń z błędem
    const badStatements = new Set();
    for (const line of classifiedLines) {
      if (line.startsWith("[ERR]")) {
        const cleanStatement = line.replace("[ERR] - ", "").trim();
        badStatements.add(cleanStatement);
      }
    }

    // 2. Wczytanie pełnych komentarzy i mapowanie ich na statusy
    const commentsContent = await readFile(COMMENTS_FILE, "utf-8");
    const commentsList = commentsContent.split("\n").filter(line => line.trim() !== "");
    
    const badComments = new Set();
    
    for (const comment of commentsList) {
      const parts = comment.replace(/\./g, '').split(',');
      let isError = false;
      
      for (const part of parts) {
        const cleanStatement = part.trim();
        // Jeśli chociaż jedno składowe stwierdzenie jest na liście badStatements, to cały komentarz jest ERR
        if (cleanStatement && badStatements.has(cleanStatement)) {
          isError = true;
          break;
        }
      }
      
      if (isError) {
        badComments.add(comment);
      }
    }

    console.log(`Zidentyfikowano ${badComments.size} unikalnych, negatywnych pełnych komentarzy.`);

    // 3. Weryfikacja plików uznanych wcześniej za "correct"
    const correctFilesContent = await readFile(CORRECT_FILE, "utf-8");
    const correctFilesList = correctFilesContent.split("\n").filter(line => line.trim() !== "");
    
    const incorrectCommentBasedFiles = [];
    const genuinelyCorrectFiles = []; // te, które przeszły test sprzętu i komentarza

    for (const filename of correctFilesList) {
      const filePath = join(SENSORS_DIR, filename);
      const jsonContent = await readFile(filePath, "utf-8");
      const data = JSON.parse(jsonContent);
      
      if (data.operator_notes && badComments.has(data.operator_notes)) {
        incorrectCommentBasedFiles.push(filename);
      } else {
        genuinelyCorrectFiles.push(filename);
      }
    }

    // 4. Tworzenie i łączenie list
    await writeFile(INCORRECT_COMMENT_BASED_FILE, incorrectCommentBasedFiles.join("\n"));
    console.log(`Wyłapano ${incorrectCommentBasedFiles.length} plików błędnych na podstawie komentarzy. Zapisano do: ${INCORRECT_COMMENT_BASED_FILE}`);

    // Wczytujemy sprzętowo odrzucone
    const incorrectFilesContent = await readFile(INCORRECT_FILE, "utf-8");
    const incorrectFilesList = incorrectFilesContent.split("\n").filter(line => line.trim() !== "");

    // Łączymy obie listy odrzuconych
    const finalIncorrectList = [...incorrectFilesList, ...incorrectCommentBasedFiles];
    
    await writeFile(INCORRECT_FINAL_FILE, finalIncorrectList.join("\n"));
    console.log(`Połączono listy. Ostateczna liczba błędnych plików: ${finalIncorrectList.length}. Zapisano do: ${INCORRECT_FINAL_FILE}\n`);

  } catch (error) {
    console.error("Wystąpił błąd podczas finalnej weryfikacji:", error);
  }
};

// --- ETAP 5: Wysłanie wyników do Centrali ---
export const runStage5_SendToVerify = async () => {
  console.log("--- ETAP 5: Wysyłanie danych pod VERIFY_URL ---");

  try {
    // 1. Wczytanie ostatecznej listy błędnych plików
    const incorrectContent = await readFile(INCORRECT_FINAL_FILE, "utf-8");
    const incorrectFilesList = incorrectContent.split("\n").filter(line => line.trim() !== "");

    if (incorrectFilesList.length === 0) {
      console.log("Brak plików do wysłania. Lista jest pusta.");
      return;
    }

    // 2. Formatowanie nazw plików (usuwamy rozszerzenie .json, aby pasowało do przykładu "0001", "0002")
    const formattedFiles = incorrectFilesList.map(filename => filename.replace(".json", "").trim());

    // 3. Budowa payloadu zgodnie ze specyfikacją
    const payload = {
      apikey: AI_DEVS_API_KEY,
      task: TASK_NAME,
      answer: {
        recheck: formattedFiles
      }
    };

    console.log(`Wysyłanie ${formattedFiles.length} identyfikatorów do weryfikacji...`);

    // 4. Wysłanie POST requestu
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Błąd HTTP: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    // 5. Wyświetlenie odpowiedzi
    console.log("\n=== ODPOWIEDŹ Z SERWERA ===");
    console.log(JSON.stringify(data, null, 2));
    console.log("===========================\n");

  } catch (error) {
    console.error("Wystąpił błąd podczas wysyłania do weryfikacji:", error);
  }
};


// ==========================================
// --- MIEJSCE NA ODPALANIE FUNKCJI ---
// Zakomentuj linię, której nie chcesz uruchamiać (dodaj // na początku)
// ==========================================

if (process.argv[1] === import.meta.filename) {
  const main = async () => {
    
    //await runStage1_Filter();
    // await runStage2_Statements();
    //await runStage3_LLMClassification(); // Nowy etap z LLM
    //await runStage4_FinalValidation();
    await runStage5_SendToVerify();

  };

  main().catch(error => {
    console.error("Wystąpił krytyczny błąd:", error);
    process.exit(1);
  });
}