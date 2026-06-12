import { createWriteStream, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { DOCS_URL, WORKSPACE_ROOT } from "../src/config.js";

// Ustawienie ścieżki docelowej: workspace/sensors
const SENSORS_DIR = join(WORKSPACE_ROOT, "sensors");

const downloadAndExtractSensors = async () => {
  // 1. Upewnij się, że katalog istnieje
  mkdirSync(SENSORS_DIR, { recursive: true });
  const zipPath = join(SENSORS_DIR, "sensors.zip");

  console.log(`Pobieranie z: ${DOCS_URL}...`);

  // 2. Pobieranie pliku
  const response = await fetch(DOCS_URL);
  if (!response.ok) {
    throw new Error(`Błąd pobierania: ${response.status} ${response.statusText}`);
  }

  const fileStream = createWriteStream(zipPath);
  await finished(Readable.fromWeb(response.body).pipe(fileStream));
  
  console.log("Pobrano plik ZIP. Rozpoczynam rozpakowywanie...");

  // 3. Rozpakowywanie
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(SENSORS_DIR, true);
  
  console.log(`Dane zostały rozpakowane do: ${SENSORS_DIR}`);
  return SENSORS_DIR;
};

if (process.argv[1] === import.meta.filename) {
  downloadAndExtractSensors().catch(error => {
    console.error("Wystąpił błąd podczas pobierania:", error);
    process.exit(1);
  });
}