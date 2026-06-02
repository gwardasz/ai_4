import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { resolveInWorkspace, toWorkspaceRelative, SandboxError } from "../utils/paths.js";

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".zip", ".ico"]);
const PREVIEW_LINES = 200;

const addLineNumbers = (text, startLine = 1) =>
  text
    .split("\n")
    .map((line, i) => `${String(startLine + i).padStart(6, " ")}| ${line}`)
    .join("\n");

// Parsuje zakres linii: "10" lub "10-50".
const parseRange = (spec) => {
  const single = /^(\d+)$/.exec(spec);
  if (single) {
    const n = Number(single[1]);
    return { start: n, end: n };
  }
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (range) {
    return { start: Number(range[1]), end: Number(range[2]) };
  }
  return null;
};

const listDir = async (absolute, relPath) => {
  const items = await readdir(absolute, { withFileTypes: true });
  const entries = [];
  for (const item of items) {
    const childAbs = join(absolute, item.name);
    const entry = { name: item.name, kind: item.isDirectory() ? "directory" : "file" };
    if (item.isFile()) {
      try {
        entry.size = (await stat(childAbs)).size;
      } catch {
        // ignore
      }
    }
    entries.push(entry);
  }

  return {
    success: true,
    path: relPath || ".",
    type: "directory",
    entries,
    hint:
      entries.length === 0
        ? "Directory is empty. Use http_fetch to download documentation into the workspace."
        : `Found ${entries.length} item(s). Use fs_read on a file path to read it, or understand_image for image files.`
  };
};

const readTextFile = async (absolute, relPath, lines) => {
  const ext = extname(absolute).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return {
      success: false,
      path: relPath,
      type: "file",
      message: "This is a binary/image file and cannot be read as text.",
      hint: "Use understand_image on this path to analyze its contents."
    };
  }

  const content = await readFile(absolute, "utf-8");
  const totalLines = content.split("\n").length;

  if (lines) {
    const range = parseRange(lines);
    if (!range) {
      return {
        success: false,
        path: relPath,
        type: "file",
        message: `Invalid line range: ${lines}`,
        hint: 'Use "10" for a single line or "10-50" for a range.'
      };
    }
    const slice = content.split("\n").slice(range.start - 1, range.end);
    return {
      success: true,
      path: relPath,
      type: "file",
      totalLines,
      range: { start: range.start, end: Math.min(range.end, totalLines) },
      content: addLineNumbers(slice.join("\n"), range.start),
      hint: `Showing lines ${range.start}-${Math.min(range.end, totalLines)} of ${totalLines}.`
    };
  }

  if (totalLines > PREVIEW_LINES) {
    const slice = content.split("\n").slice(0, PREVIEW_LINES);
    return {
      success: true,
      path: relPath,
      type: "file",
      totalLines,
      range: { start: 1, end: PREVIEW_LINES },
      truncated: true,
      content: addLineNumbers(slice.join("\n"), 1),
      hint: `Large file: ${totalLines} lines total, showing 1-${PREVIEW_LINES}. Use lines="${PREVIEW_LINES + 1}-${PREVIEW_LINES + 200}" to read more, or fs_search to locate content.`
    };
  }

  return {
    success: true,
    path: relPath,
    type: "file",
    totalLines,
    content: addLineNumbers(content, 1),
    hint: "File read complete."
  };
};

/**
 * Odczyt pliku lub listowanie katalogu w obrebie workspace.
 * @param {{ path: string, mode?: "auto"|"list"|"content", lines?: string }} args
 */
export const fsRead = async ({ path = ".", mode = "auto", lines }) => {
  let absolute;
  try {
    absolute = resolveInWorkspace(path);
  } catch (error) {
    if (error instanceof SandboxError) {
      return { success: false, path, message: error.message, hint: "Use a path relative to the workspace, e.g. \"index.md\"." };
    }
    throw error;
  }

  const relPath = toWorkspaceRelative(absolute);

  let info;
  try {
    info = await stat(absolute);
  } catch {
    return {
      success: false,
      path: relPath,
      message: `Path does not exist: ${relPath || "."}`,
      hint: 'Use fs_read with path="." to list the workspace, or http_fetch to download a missing file.'
    };
  }

  if (info.isDirectory()) {
    if (mode === "content") {
      return { success: false, path: relPath, type: "directory", message: "Path is a directory.", hint: 'Use mode="list" (or omit mode) to list it.' };
    }
    return listDir(absolute, relPath);
  }

  if (mode === "list") {
    return { success: false, path: relPath, type: "file", message: "Path is a file.", hint: 'Use mode="content" (or omit mode) to read it.' };
  }
  return readTextFile(absolute, relPath, lines);
};
