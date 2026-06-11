import { mkdir, writeFile } from "node:fs/promises";
import { analyzeMap } from "./map.js";
import { MAP_ANALYSIS_PATH, PROBE_DIR } from "./config.js";
import { noopLogger } from "./utils/logger.js";

export const probeMap = async (log = noopLogger) => {
  const analysis = await analyzeMap(log);

  await mkdir(PROBE_DIR, { recursive: true });
  const { rawVision, ...persisted } = analysis;
  await writeFile(MAP_ANALYSIS_PATH, `${JSON.stringify(persisted, null, 2)}\n`, "utf-8");

  log.info("map.probe", {
    columns: analysis.columns,
    rows: analysis.rows,
    damSector: analysis.damSector,
    confidence: analysis.confidence,
    path: MAP_ANALYSIS_PATH
  });

  return persisted;
};
