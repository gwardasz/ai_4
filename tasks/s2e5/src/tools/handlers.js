import { fetchDroneDocs, submitInstructions } from "../services/drone-api.js";
import { noopLogger } from "../utils/logger.js";

const buildResult = ({ success, message, recoveryHints, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  if (recoveryHints) payload.recoveryHints = recoveryHints;
  return payload;
};

const formatHubFeedback = (result) => {
  if (typeof result.data === "object" && result.data !== null) {
    return JSON.stringify(result.data);
  }
  return result.raw ?? "No hub feedback.";
};

export const createHandlers = (log = noopLogger) => ({
  async fetch_drone_docs() {
    try {
      const docs = await fetchDroneDocs(log);
      return buildResult({
        success: true,
        text: docs.text,
        cachedAt: docs.cachedAt,
        path: docs.path,
        message: "Drone API documentation fetched and cached."
      });
    } catch (error) {
      return buildResult({
        success: false,
        message: error.message,
        recoveryHints: "Retry fetch_drone_docs. Check hub connectivity."
      });
    }
  },

  async submit_instructions({ instructions }) {
    if (!Array.isArray(instructions) || instructions.length === 0) {
      return buildResult({
        success: false,
        message: "instructions must be a non-empty array of strings.",
        recoveryHints: 'Example: { "instructions": ["selfCheck", "getConfig"] }.'
      });
    }

    const invalid = instructions.find((item) => typeof item !== "string" || !item.trim());
    if (invalid !== undefined) {
      return buildResult({
        success: false,
        message: "Every instruction must be a non-empty string.",
        recoveryHints: "Remove blank entries and follow syntax from drone docs."
      });
    }

    try {
      const result = await submitInstructions(instructions, log);
      const hubResponse = formatHubFeedback(result);

      if (result.flag) {
        return buildResult({
          success: true,
          flag: result.flag,
          hubResponse,
          status: result.status,
          message: "Flag captured — mission complete."
        });
      }

      if (!result.ok) {
        return buildResult({
          success: false,
          hubResponse,
          status: result.status,
          message: hubResponse,
          recoveryHints:
            "Read the hub error, adjust the instruction list, and submit again. " +
            "Use hard_reset if configuration errors keep stacking."
        });
      }

      return buildResult({
        success: true,
        hubResponse,
        status: result.status,
        message: hubResponse
      });
    } catch (error) {
      return buildResult({
        success: false,
        message: error.message,
        recoveryHints: "Network error — retry submit_instructions."
      });
    }
  },

  async hard_reset() {
    try {
      const result = await submitInstructions(["hardReset"], log);
      const hubResponse = formatHubFeedback(result);

      return buildResult({
        success: result.ok,
        hubResponse,
        status: result.status,
        message: result.ok
          ? "Drone hard reset completed."
          : hubResponse,
        recoveryHints: result.ok
          ? "Rebuild the mission instructions from docs and submit again."
          : "Retry hard_reset or inspect hub feedback."
      });
    } catch (error) {
      return buildResult({
        success: false,
        message: error.message,
        recoveryHints: "Network error — retry hard_reset."
      });
    }
  }
});
