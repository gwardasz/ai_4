import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { getWorkspaceRoot } from "../config.js";

export const readJson = async (relativePath, fallback) => {
  try {
    const raw = await readFile(join(getWorkspaceRoot(), relativePath), "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const writeJson = async (relativePath, data) => {
  const full = join(getWorkspaceRoot(), relativePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
};

export const mailFilePath = (id) => `mails/${String(id).replace(/[^\w-]/g, "_")}.json`;
