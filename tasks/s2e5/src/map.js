import { MAP_IMAGE_URL, visionModel } from "./config.js";
import { vision } from "./vision.js";

const MAP_VISION_PROMPT = `You analyze a grid map of a nuclear power plant area (DRN-BMB7 mission).

The map is divided into a rectangular grid of sectors. Indexing starts at 1:
- column 1 = leftmost column
- row 1 = top row

Tasks:
1. Count how many columns and rows the grid has.
2. Find the DAM sector — the water sector with noticeably darker/intensified blue color (the dam blocks the lake).
3. Find the POWER PLANT building sector (large facility, not water).

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "columns": <number>,
  "rows": <number>,
  "damSector": { "column": <number>, "row": <number> },
  "powerPlantSector": { "column": <number>, "row": <number> },
  "confidence": "high" | "medium" | "low",
  "notes": "<brief explanation>"
}`;

const extractJson = (text) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Vision response did not contain JSON object.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
};

const validateSector = (sector, columns, rows, label) => {
  if (!sector || typeof sector !== "object") {
    throw new Error(`Missing ${label} sector.`);
  }

  const column = Number(sector.column);
  const row = Number(sector.row);

  if (!Number.isInteger(column) || column < 1 || column > columns) {
    throw new Error(`${label} column must be integer between 1 and ${columns}.`);
  }
  if (!Number.isInteger(row) || row < 1 || row > rows) {
    throw new Error(`${label} row must be integer between 1 and ${rows}.`);
  }

  return { column, row };
};

export const parseMapAnalysis = (rawText) => {
  const parsed = extractJson(rawText);

  const columns = Number(parsed.columns);
  const rows = Number(parsed.rows);

  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error("columns must be a positive integer.");
  }
  if (!Number.isInteger(rows) || rows < 1) {
    throw new Error("rows must be a positive integer.");
  }

  const damSector = validateSector(parsed.damSector, columns, rows, "dam");
  const powerPlantSector = validateSector(parsed.powerPlantSector, columns, rows, "powerPlant");

  const confidence = ["high", "medium", "low"].includes(parsed.confidence)
    ? parsed.confidence
    : "medium";

  return {
    columns,
    rows,
    damSector,
    powerPlantSector,
    confidence,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() : ""
  };
};

export const fetchMapImage = async () => {
  const response = await fetch(MAP_IMAGE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch map image (${response.status}).`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return { base64: buffer.toString("base64"), mimeType };
};

export const analyzeMap = async (log) => {
  log.info("map.fetch", { url: MAP_IMAGE_URL });
  const image = await fetchMapImage();

  log.info("map.vision", { model: visionModel });
  const raw = await vision({
    question: MAP_VISION_PROMPT,
    imageBase64: image.base64,
    mimeType: image.mimeType
  });

  log.debug("map.vision.raw", { raw: raw.slice(0, 500) });
  const analysis = parseMapAnalysis(raw);

  return {
    ...analysis,
    imageUrl: MAP_IMAGE_URL,
    visionModel,
    analyzedAt: new Date().toISOString(),
    rawVision: raw
  };
};
