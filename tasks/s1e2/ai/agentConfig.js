import { sandbox } from '../utils/sandbox.js'; // We import your existing secure sandbox

export const agentConfig = {
  // You can set your model here
  model: "gpt-4o-mini", 
  
  // Your system prompt mapped to instructions
  instructions: `You are a helpful assistant.
Your objective is to solve the user's task.
CRITICAL INSTRUCTIONS:
1. You have a set of tools at your disposal. Use them to gather data step by step or send reports to API.
2. BE CAREFUL with coordinates or access levels. ALWAYS rely on the data returned by your tools.
Think step-by-step. If a tool fails, analyze the error and try again.`,

  // Keep a reference to your sandbox base directory if needed elsewhere
  sandboxRoot: sandbox.baseDir 
};