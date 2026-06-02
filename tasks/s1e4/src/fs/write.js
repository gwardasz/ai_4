import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveInWorkspace, toWorkspaceRelative, SandboxError } from "../utils/paths.js";

/**
 * Zapis pliku w obrebie workspace (tworzy lub nadpisuje). Tworzy katalogi nadrzedne.
 * @param {{ path: string, content: string }} args
 */
export const fsWrite = async ({ path, content }) => {
  let absolute;
  try {
    absolute = resolveInWorkspace(path);
  } catch (error) {
    if (error instanceof SandboxError) {
      return { success: false, path, message: error.message, hint: "Use a path relative to the workspace, e.g. \"notes/draft.md\"." };
    }
    throw error;
  }

  if (typeof content !== "string") {
    return { success: false, path: toWorkspaceRelative(absolute), message: "Content must be a string.", hint: "Pass the file content as a string." };
  }

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf-8");

  const rel = toWorkspaceRelative(absolute);
  return {
    success: true,
    path: rel,
    bytes: Buffer.byteLength(content, "utf-8"),
    hint: `Wrote ${rel}. You can fs_read it back to verify.`
  };
};
