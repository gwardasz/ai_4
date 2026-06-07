import { resolve, relative, sep, isAbsolute } from "node:path";
import { WORKSPACE_ROOT } from "../config.js";

export class SandboxError extends Error {
  constructor(message) {
    super(message);
    this.name = "SandboxError";
  }
}

export const resolveInWorkspace = (inputPath) => {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new SandboxError("Path must be a non-empty string.");
  }

  const trimmed = inputPath.trim();

  if (isAbsolute(trimmed) || /^[a-zA-Z]:[/\\]/.test(trimmed)) {
    throw new SandboxError("Absolute paths are not allowed. Use a path relative to the workspace.");
  }

  const absolute = resolve(WORKSPACE_ROOT, trimmed);
  const rel = relative(WORKSPACE_ROOT, absolute);

  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new SandboxError("Path escapes the workspace sandbox.");
  }

  return absolute;
};

export const toWorkspaceRelative = (absolutePath) =>
  relative(WORKSPACE_ROOT, absolutePath).split(sep).join("/");
