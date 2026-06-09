import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { AGENTS_ROOT, orchestratorModel, specialistModel } from "../config.js";

export const loadAgent = async (name) => {
  const filePath = join(AGENTS_ROOT, `${name}.agent.md`);
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);

  const defaultModel = name === "orchestrator" ? orchestratorModel : specialistModel;

  return {
    name: data.name ?? name,
    model: data.model ? data.model.replace(/^openai:/, "") : defaultModel,
    tools: Array.isArray(data.tools) ? data.tools : [],
    systemPrompt: content.trim()
  };
};
