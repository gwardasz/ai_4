import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { resolveModelForProvider } from "../../../../config.js";
import { AGENTS_ROOT, agentModel } from "../config.js";

export const loadAgent = async (name) => {
  const filePath = join(AGENTS_ROOT, `${name}.agent.md`);
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    name: data.name ?? name,
    model: resolveModelForProvider(data.model ? String(data.model) : agentModel),
    tools: Array.isArray(data.tools) ? data.tools : [],
    systemPrompt: content.trim()
  };
};
