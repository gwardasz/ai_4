import { fetchAndAnalyzeBoard, loadTargetBoard } from "./board.js";
import { noopLogger } from "./utils/logger.js";

export const runProbe = async (log = noopLogger) => {
  const { grid: current, imagePath, fetchedAt, visionModel } = await fetchAndAnalyzeBoard(log);
  const target = await loadTargetBoard();
  return { current, target, imagePath, fetchedAt, visionModel };
};
