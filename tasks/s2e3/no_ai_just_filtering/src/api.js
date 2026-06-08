import { AI_DEVS_API_KEY } from "../../../../config.js";
import { VERIFY_URL, TASK_NAME } from "./config.js";

// Fasada wysylki deklaracji. Ukrywa ksztalt zapytania i niesie ustrukturyzowany blad.
export const submitDeclaration = async (logsContent) => {
  if (!AI_DEVS_API_KEY) {
    const error = new Error("Missing AI_DEVS_API_KEY in environment (.env).");
    error.kind = "config";
    throw error;
  }

  let response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: AI_DEVS_API_KEY,
        task: TASK_NAME,
        answer: { 
          logs: logsContent
        }
      })
    });
  } catch {
    const error = new Error("Network error reaching the verification service.");
    error.kind = "network";
    throw error;
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  return { ok: response.ok, status: response.status, data };
};