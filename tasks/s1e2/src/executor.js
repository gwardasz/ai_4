import { chat, extractToolCalls, extractText } from "./api.js";
//
import readline from "readline";
import fs from "fs/promises";
//
const MAX_TOOL_ROUNDS = 10;

const logQuery = (query) => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Query: ${query}`);
  console.log("=".repeat(60));
};

const logResult = (text) => console.log(`\nA: ${text}`);

// FEATURE 1: Ask for user confirmation
const askConfirmation = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("\nProceed with next LLM API call? (Y/n): ", (answer) => {
      rl.close();
      // Defaults to true if user just hits Enter
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
};

// FEATURE 2: Save complete conversation to a file
const saveConversation = async (historyLog) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `conversation-${timestamp}.json`;
  
  // Use absolute path to guarantee we know where it is saved (current working directory)
  const fullPath = `${process.cwd()}/${filename}`;
  
  try {
    await fs.writeFile(fullPath, JSON.stringify(historyLog, null, 2));
    console.log(`\n✓ Complete conversation saved to: ${fullPath}`);
  } catch (error) {
    console.log(`\n✗ Failed to save conversation: ${error.message}`);
  }
};


const executeToolCalls = async (toolCalls, handlers) => {
  console.log(`\nTool calls: ${toolCalls.length}`);

  return Promise.all(
    toolCalls.map(async (call) => {
      const args = JSON.parse(call.arguments);
      console.log(`  → ${call.name}(${JSON.stringify(args)})`);

      try {
        const handler = handlers[call.name];
        if (!handler) throw new Error(`Unknown tool: ${call.name}`);

        const result = await handler(args);
        console.log(`    ✓ Success`);
        return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) };
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);
        return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: error.message }) };
      }
    })
  );
};

export const processQuery = async (query, { model, tools, handlers, instructions }) => {
  const chatConfig = { model, tools, instructions };
  logQuery(query);

  // Each example query is isolated. We keep conversation state
  // only within the current query while the model is calling tools.
  let conversation = [{ role: "user", content: query }];
  let completeHistory = [{ role: "user", content: query }];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const isConfirmed = await askConfirmation();
      if (!isConfirmed) {
        const abortMsg = "LLM API call cancelled by user.";
        logResult(abortMsg);
        return abortMsg; // 'finally' block will handle the saving
      }

      // If chat() throws an error, it will immediately jump to the 'finally' block and save!
      const response = await chat({ ...chatConfig, input: conversation });
      completeHistory.push({ role: "llm_response", response });

      const toolCalls = extractToolCalls(response);

      if (toolCalls.length === 0) {
        const text = extractText(response) ?? "No response";
        logResult(text);
        return text; // 'finally' block will handle the saving
      }

      const toolResults = await executeToolCalls(toolCalls, handlers);

      // FIX: Add tool results to the completeHistory so they actually appear in the JSON!
      completeHistory.push(...toolCalls, ...toolResults);

      conversation = [
        ...conversation,
        ...toolCalls,
        ...toolResults
      ];
    }

    logResult("Max tool rounds reached");
    return "Max tool rounds reached";

  } catch (error) {
    console.error(`\n❌ Fatal Error during processQuery: ${error.message}`);
    completeHistory.push({ role: "system_error", content: error.message });
    return "Failed due to error.";
  } finally {
    // FINALLY block guarantees the file is ALWAYS saved, whether it succeeded, failed, or was cancelled.
    await saveConversation(completeHistory);
  }
};