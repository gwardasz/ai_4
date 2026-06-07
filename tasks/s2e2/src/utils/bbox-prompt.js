import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { validateBBox } from "../bbox-coords.js";

const parseCommand = (answer) => answer.trim().toLowerCase();

const tryParseBboxJson = (text) => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  return validateBBox(JSON.parse(trimmed));
};

const promptEditCoords = async (bbox, rl) => {
  const readCoord = async (key) => {
    const line = await rl.question(`${key} [${bbox[key]}]: `);
    if (!line.trim()) return bbox[key];
    const value = Number(line.trim());
    if (!Number.isFinite(value)) throw new Error(`Invalid number for ${key}: ${line}`);
    return value;
  };

  return validateBBox({
    x1: await readCoord("x1"),
    y1: await readCoord("y1"),
    x2: await readCoord("x2"),
    y2: await readCoord("y2")
  });
};

/**
 * Iteracyjna korekta bbox bez AI — podgląd w stałym pliku, edycja współrzędnych 0–1000.
 * @returns {Promise<object|null>} bbox do zapisu, null = abort
 */
export const runBboxAdjustLoop = async (bbox, { savePreview }) => {
  let current = validateBBox({ ...bbox });
  const rl = createInterface({ input, output });

  console.log("\nManual bbox adjustment (0–1000). Preview is overwritten in workspace/ each round.\n");

  try {
    for (;;) {
      const previewPath = await savePreview(current);

      console.log(`\nCurrent bbox: ${JSON.stringify(current)}`);
      console.log(`Preview: workspace/${previewPath}`);
      console.log("\n[S] Save  |  [A] Abort  |  [E] Edit coordinates  |  paste JSON {x1,y1,x2,y2}");

      const answer = await rl.question("> ");
      const cmd = parseCommand(answer);

      if (cmd === "a" || cmd === "abort") return null;

      if (cmd === "s" || cmd === "save" || cmd === "") return current;

      if (cmd === "e" || cmd === "edit") {
        try {
          console.log("\nEnter new values (0–1000). Empty line keeps current.\n");
          current = await promptEditCoords(current, rl);
        } catch (error) {
          console.error(`\nEdit failed: ${error.message}\n`);
        }
        continue;
      }

      try {
        const parsed = tryParseBboxJson(answer);
        if (parsed) {
          current = parsed;
          continue;
        }
      } catch (error) {
        console.error(`\nInvalid JSON: ${error.message}\n`);
        continue;
      }

      console.log("\nUnknown input. Use S, A, E, or paste a bbox JSON object.\n");
    }
  } finally {
    rl.close();
  }
};
