import { join, resolve, relative } from "node:path";
import { getWorkspaceRoot } from "../config.js";

const READ_PREFIXES = {
  orchestrator: ["state/", "mails/", "messages/", "docs/"],
  zmail: ["state/fetched-mail-ids.json", "state/search-log.json", "mails/", "docs/", "messages/"],
  analyst: [
    "state/analyzed-mail-ids.json",
    "state/fetched-mail-ids.json",
    "state/investigation-leads.json",
    "state/search-proposals.json",
    "mails/",
    "messages/"
  ]
};

const WRITE_RULES = {
  orchestrator: ["state/progress.json", "state/search-proposals.json"],
  zmail: [
    "state/fetched-mail-ids.json",
    "state/search-log.json",
    "docs/zmail-help.json",
    "messages/inbox.json"
  ],
  analyst: ["state/analyzed-mail-ids.json", "state/investigation-leads.json"]
};

export const isPathSafe = (path) => {
  const workspaceRoot = getWorkspaceRoot();
  const fullPath = resolve(join(workspaceRoot, path));
  const workspaceResolved = resolve(workspaceRoot);
  const rel = relative(workspaceResolved, fullPath);
  return !rel.startsWith("..") && rel !== "..";
};

const normalize = (path) => path.replace(/\\/g, "/");

export const canRead = (agent, path) => {
  if (!isPathSafe(path)) return false;
  const normalized = normalize(path);
  const prefixes = READ_PREFIXES[agent] ?? [];
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? normalized.startsWith(prefix) : normalized === prefix
  );
};

export const canWrite = (agent, path) => {
  if (!isPathSafe(path)) return false;
  const normalized = normalize(path);

  if (agent === "zmail" && normalized.startsWith("mails/") && normalized.endsWith(".json")) {
    return true;
  }

  const allowed = WRITE_RULES[agent] ?? [];
  return allowed.some((entry) =>
    entry.endsWith("/") ? normalized.startsWith(entry) : normalized === entry
  );
};

export const resolveWorkspacePath = (path) => join(getWorkspaceRoot(), path);
