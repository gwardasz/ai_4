import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { chat, extractText } from "./llm.js";
import { WORKSPACE_BASE, setWorkspaceRoot, orchestratorModel } from "./config.js";
import { createEmptyProgress, saveProgress } from "./state/progress.js";

let currentMission = null;

export const computeRunId = (text) =>
  createHash("sha256").update(text.trim()).digest("hex").slice(0, 12);

export const getMission = () => {
  if (!currentMission) {
    throw new Error("Mission not initialized. Call initRun before accessing mission.");
  }
  return currentMission;
};

export const parseMissionFromArgv = (argv = process.argv.slice(2)) => {
  let fresh = false;
  const parts = [];

  for (const arg of argv) {
    if (arg === "--fresh") {
      fresh = true;
    } else {
      parts.push(arg);
    }
  }

  const text = parts.join(" ").trim();
  if (!text) {
    console.error("\nUsage:");
    console.error('  npm run s2e4 -- "Your mission here"');
    console.error('  npm run s2e4 -- --fresh "Your mission here"\n');
    console.error("Example:");
    console.error(
      '  npm run s2e4 -- "Znajdź mi date, password i confirmation_code wysłane od Wiktora z domeny proton.me"\n'
    );
    process.exit(1);
  }

  return { text, fresh };
};

const parseBootstrapJson = (raw) => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonText);
};

const normalizeFields = (fields) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("Mission bootstrap returned no fields.");
  }
  return fields.map((field) => {
    const key = String(field).trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid field name from bootstrap: ${field}`);
    }
    return key;
  });
};

export const bootstrapMission = async (text) => {
  const response = await chat({
    model: orchestratorModel,
    instructions:
      "You parse investigation missions into structured JSON. " +
      "Return only valid JSON with no markdown or commentary.",
    input: [
      {
        role: "user",
        content: [
          "Extract the data fields the user wants to find from this mission.",
          "Use snake_case identifiers (e.g. date, password, confirmation_code).",
          "Include only fields explicitly requested or clearly implied.",
          "",
          `Mission: ${text}`,
          "",
          'Respond with JSON: {"text": "<original mission verbatim>", "fields": ["field1", "field2"]}'
        ].join("\n")
      }
    ],
    maxOutputTokens: 1024
  });

  const raw = extractText(response);
  if (!raw) {
    throw new Error("Mission bootstrap returned empty response.");
  }

  const parsed = parseBootstrapJson(raw);
  const fields = normalizeFields(parsed.fields);

  return {
    text: typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : text.trim(),
    fields
  };
};

const fileExists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export const initRun = async ({ text, fresh = false }) => {
  const runId = computeRunId(text);
  const runDir = join(WORKSPACE_BASE, "runs", runId);
  const missionPath = join(runDir, "mission.json");

  if (fresh) {
    await rm(runDir, { recursive: true, force: true });
  }

  setWorkspaceRoot(runDir);

  let mission;
  if (!fresh && (await fileExists(missionPath))) {
    mission = JSON.parse(await readFile(missionPath, "utf-8"));
    mission.fields = normalizeFields(mission.fields);
    if (mission.text?.trim() !== text.trim()) {
      throw new Error(
        `Run ${runId} exists with a different mission. Use --fresh or change the mission text.`
      );
    }
  } else {
    mission = await bootstrapMission(text);
    await mkdir(runDir, { recursive: true });
    await writeFile(missionPath, `${JSON.stringify(mission, null, 2)}\n`, "utf-8");
  }

  for (const sub of ["state", "mails", "docs", "messages"]) {
    await mkdir(join(runDir, sub), { recursive: true });
  }

  currentMission = { ...mission, runId };

  const progressPath = join(runDir, "state", "progress.json");
  if (!(await fileExists(progressPath))) {
    await saveProgress(createEmptyProgress(mission.fields));
  }

  return currentMission;
};
