import { resolve } from "path";
import { mkdir } from "fs/promises";
import { resolveModelForProvider } from "../../../config.js";

export const sandbox = {
  root: resolve(import.meta.dirname, "..", "sandbox")
};

await mkdir(sandbox.root, { recursive: true });

export const api = {
  model: resolveModelForProvider("gpt-4.1"),
  instructions: `You are an investigative AI agent. You must use the provided tools to gather intelligence, cross-reference data, and report targets.
    STRICT RULES:
    1. NEVER hallucinate data. If you lack information (like a powerplant_filename or a birthYear), you MUST use a tool to fetch it first.
    2. You cannot guess access levels; you must query them explicitly.
    3. You must output ONLY raw, valid JSON. 
    4. DO NOT wrap the output in markdown code blocks (e.g., no \`\`\`json). DO NOT include any conversational text, greetings, or reasoning. If your response cannot be parsed directly by JSON.parse(), you have failed.`
};