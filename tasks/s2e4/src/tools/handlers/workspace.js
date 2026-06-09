import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { canRead, canWrite, resolveWorkspacePath } from "../sandbox.js";

const buildResult = ({ success, message, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  return payload;
};

export const createWorkspaceHandlers = (agent, log) => ({
  async read_file({ path }) {
    if (typeof path !== "string" || !path.trim()) {
      return buildResult({ success: false, message: "path must be a non-empty string." });
    }
    if (!canRead(agent, path)) {
      return buildResult({ success: false, message: `Agent "${agent}" cannot read path: ${path}` });
    }
    try {
      const content = await readFile(resolveWorkspacePath(path), "utf-8");
      return buildResult({ success: true, path, content });
    } catch (err) {
      return buildResult({ success: false, message: err.message });
    }
  },

  async write_file({ path, content }) {
    if (typeof path !== "string" || typeof content !== "string") {
      return buildResult({ success: false, message: "path and content must be strings." });
    }
    if (!canWrite(agent, path)) {
      return buildResult({ success: false, message: `Agent "${agent}" cannot write path: ${path}` });
    }
    try {
      const full = resolveWorkspacePath(path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, "utf-8");
      log.info("workspace.write", { agent, path });
      return buildResult({ success: true, path, message: `Wrote ${path}` });
    } catch (err) {
      return buildResult({ success: false, message: err.message });
    }
  }
});
