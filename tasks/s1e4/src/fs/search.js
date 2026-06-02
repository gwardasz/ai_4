import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { WORKSPACE_ROOT } from "../config.js";
import { toWorkspaceRelative } from "../utils/paths.js";

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".zip", ".ico"]);
const MAX_CONTENT_MATCHES = 50;

const walk = async (dir, acc) => {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const item of items) {
    const abs = join(dir, item.name);
    if (item.isDirectory()) {
      await walk(abs, acc);
    } else if (item.isFile() && item.name !== ".gitkeep") {
      acc.push(abs);
    }
  }
  return acc;
};

/**
 * Wyszukiwanie po nazwie pliku i/lub tresci w obrebie workspace.
 * @param {{ query: string, inContent?: boolean }} args
 */
export const fsSearch = async ({ query, inContent = true }) => {
  if (typeof query !== "string" || !query.trim()) {
    return { success: false, message: "Missing search query.", hint: "Provide a non-empty 'query' string." };
  }

  const needle = query.toLowerCase();
  const files = await walk(WORKSPACE_ROOT, []);

  const nameMatches = [];
  const contentMatches = [];

  for (const abs of files) {
    const rel = toWorkspaceRelative(abs);

    if (rel.toLowerCase().includes(needle)) {
      nameMatches.push(rel);
    }

    if (inContent && contentMatches.length < MAX_CONTENT_MATCHES && !BINARY_EXTENSIONS.has(extname(abs).toLowerCase())) {
      try {
        const info = await stat(abs);
        if (info.size > 2 * 1024 * 1024) continue;
        const content = await readFile(abs, "utf-8");
        const linesArr = content.split("\n");
        for (let i = 0; i < linesArr.length; i++) {
          if (linesArr[i].toLowerCase().includes(needle)) {
            contentMatches.push({ path: rel, line: i + 1, text: linesArr[i].trim().slice(0, 200) });
            if (contentMatches.length >= MAX_CONTENT_MATCHES) break;
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  }

  return {
    success: true,
    query,
    nameMatches,
    contentMatches,
    hint:
      nameMatches.length === 0 && contentMatches.length === 0
        ? "No matches. Make sure the relevant files were downloaded with http_fetch."
        : `Found ${nameMatches.length} filename match(es) and ${contentMatches.length} content match(es). Use fs_read to open a file.`
  };
};
