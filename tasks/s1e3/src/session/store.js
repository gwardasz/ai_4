import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// sessions/ lezy w katalogu zadania (src/session -> ../../sessions).
const SESSIONS_DIR = resolve(import.meta.dirname, "..", "..", "sessions");

// Sanityzacja sessionID - chroni przed path traversal w nazwie pliku.
const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "_");

const filePath = (id) => join(SESSIONS_DIR, `${safeId(id)}.json`);

// Jawny init - tworzenie katalogu NIE jest side-effectem importu.
export const initStore = async () => {
  await mkdir(SESSIONS_DIR, { recursive: true });
};

// Brak pliku = nowa sesja, zwracamy pusta historie.
export const load = async (sessionID) => {
  try {
    const content = await readFile(filePath(sessionID), "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
};

export const save = async (sessionID, history) => {
  await writeFile(filePath(sessionID), JSON.stringify(history, null, 2), "utf-8");
};
