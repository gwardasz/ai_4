import { fetchAndAnalyzeBoard, loadTargetBoard } from "../board.js";
import { postRotate } from "../services/electricity-api.js";
import { noopLogger } from "../utils/logger.js";

const CELL_RE = /^[1-3]x[1-3]$/;
const FLAG_RE = /\{\{?FLG:[^}]+\}?\}/i;

const findFlag = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const match = FLAG_RE.exec(text);
  return match ? match[0] : null;
};

const buildResult = ({ success, message, recoveryHints, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  if (recoveryHints) payload.recoveryHints = recoveryHints;
  return payload;
};

export const createHandlers = (log = noopLogger) => ({
  async get_board_state() {
    try {
      const { grid, imagePath, fetchedAt } = await fetchAndAnalyzeBoard(log);
      return buildResult({
        success: true,
        grid,
        imagePath,
        fetchedAt,
        message: "Current board state analyzed."
      });
    } catch (error) {
      return buildResult({
        success: false,
        message: error.message,
        recoveryHints: "Retry get_board_state. Check hub connectivity and vision model availability."
      });
    }
  },

  async get_target_board() {
    try {
      const grid = await loadTargetBoard();
      return buildResult({
        success: true,
        grid,
        message: "Target board pattern loaded."
      });
    } catch (error) {
      return buildResult({
        success: false,
        message: error.message,
        recoveryHints: "Ensure reference/target_board.json exists (run scripts/extract-target.js)."
      });
    }
  },

  async rotate_tile({ cell, times }) {
    if (!CELL_RE.test(cell ?? "")) {
      return buildResult({
        success: false,
        message: `Invalid cell "${cell}". Use format AxB where A and B are 1-3.`,
        recoveryHints: 'Example: { "cell": "2x3", "times": 2 }.'
      });
    }

    const count = Number(times);
    if (!Number.isInteger(count) || count < 1 || count > 3) {
      return buildResult({
        success: false,
        message: "times must be an integer between 1 and 3.",
        recoveryHints: "Each value is a clockwise quarter-turn. Use 1, 2, or 3."
      });
    }

    const responses = [];
    let flag = null;

    try {
      for (let i = 0; i < count; i++) {
        const res = await postRotate(cell, log);
        responses.push({ step: i + 1, status: res.status, hub: res.data });
        flag = findFlag(res.data);
        if (flag) break;
      }
    } catch (error) {
      log.info("board.rotate", { cell, times: count, responses, error: error.message });
      return buildResult({
        success: false,
        message: error.message,
        cell,
        applied: responses.length,
        responses,
        recoveryHints: "Network error — retry rotate_tile or re-read board state."
      });
    }

    log.info("board.rotate", { cell, times: count, responses, flag: Boolean(flag) });

    if (flag) {
      return buildResult({
        success: true,
        flag,
        cell,
        applied: responses.length,
        responses,
        message: "Flag captured."
      });
    }

    return buildResult({
      success: true,
      cell,
      applied: count,
      responses,
      message: `Applied ${count} rotation(s) to ${cell}.`
    });
  }
});
