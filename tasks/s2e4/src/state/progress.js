import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getWorkspaceRoot } from "../config.js";
import { getMission } from "../mission.js";

const META_KEYS = new Set(["verifyFeedback", "lastCycleAt", "cyclesWithoutProgress", "notes"]);

const progressPath = () => join(getWorkspaceRoot(), "state", "progress.json");

export const createEmptyProgress = (fields) => {
  const progress = {
    verifyFeedback: null,
    lastCycleAt: null,
    cyclesWithoutProgress: 0
  };
  for (const field of fields) {
    progress[field] = null;
  }
  return progress;
};

const missionFields = () => getMission().fields;

export const loadProgress = async () => {
  const fields = missionFields();
  const empty = createEmptyProgress(fields);

  try {
    const raw = await readFile(progressPath(), "utf-8");
    const stored = JSON.parse(raw);
    const merged = { ...empty, ...stored };
    for (const field of fields) {
      if (!(field in merged)) merged[field] = null;
    }
    return merged;
  } catch {
    return empty;
  }
};

export const saveProgress = async (progress) => {
  await mkdir(join(getWorkspaceRoot(), "state"), { recursive: true });
  await writeFile(progressPath(), `${JSON.stringify(progress, null, 2)}\n`, "utf-8");
};

export const mergeProgress = async (updates) => {
  const current = await loadProgress();
  const next = { ...current, ...updates, lastCycleAt: new Date().toISOString() };
  await saveProgress(next);
  return next;
};

export const updateProgressFromVerify = async (verifyResult) => {
  const feedback = verifyResult?.data ?? verifyResult?.raw ?? null;
  return mergeProgress({ verifyFeedback: feedback });
};

export const fingerprintProgress = (progress, fields = missionFields()) => {
  const snapshot = {};
  for (const field of fields) {
    snapshot[field] = progress[field] ?? null;
  }
  return JSON.stringify(snapshot);
};

export const progressFieldStatus = (progress, fields = missionFields()) => {
  const filled = {};
  for (const field of fields) {
    filled[field] = Boolean(progress[field]);
  }
  return filled;
};

export const isMetaKey = (key) => META_KEYS.has(key);
