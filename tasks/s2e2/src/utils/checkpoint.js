import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export const formatBoardGrid = (grid, label) => {
  const lines = [`=== ${label} ===`];
  for (let row = 1; row <= 3; row++) {
    const cells = [];
    for (let col = 1; col <= 3; col++) {
      const key = `${row}x${col}`;
      const conn = grid[key]?.connections?.join("") ?? "?";
      cells.push(`${key}:${conn.padEnd(4, " ")}`);
    }
    lines.push(cells.join("  "));
  }
  return lines.join("\n");
};

const isContinue = (answer) => {
  const normalized = answer.trim().toLowerCase();
  return normalized === "" || normalized === "c" || normalized === "continue";
};

/** @returns {Promise<boolean>} true = continue, false = abort */
export const promptCheckpoint = async ({ stage, title, body = "" }) => {
  console.log(`\n[${stage}/2] ${title}\n`);
  if (body) console.log(`${body}\n`);
  console.log("[C]ontinue  |  [A]bort");

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("> ");
    return isContinue(answer);
  } finally {
    rl.close();
  }
};

export const printProbeReport = ({ current, target, imagePath, visionModel }) => {
  console.log(`\nVision model: ${visionModel}`);
  console.log(`Image: ${imagePath}\n`);
  console.log(formatBoardGrid(current, "CURRENT"));
  console.log("");
  console.log(formatBoardGrid(target, "TARGET"));
};
