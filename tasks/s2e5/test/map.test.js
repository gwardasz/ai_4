import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMapAnalysis } from "../src/map.js";

describe("parseMapAnalysis", () => {
  it("parses valid JSON from vision response", () => {
    const raw = JSON.stringify({
      columns: 8,
      rows: 6,
      damSector: { column: 3, row: 2 },
      powerPlantSector: { column: 5, row: 4 },
      confidence: "high",
      notes: "Dam is darker blue water sector."
    });

    const result = parseMapAnalysis(raw);
    assert.equal(result.columns, 8);
    assert.equal(result.rows, 6);
    assert.deepEqual(result.damSector, { column: 3, row: 2 });
    assert.deepEqual(result.powerPlantSector, { column: 5, row: 4 });
    assert.equal(result.confidence, "high");
  });

  it("extracts JSON from markdown fenced block", () => {
    const raw = `Here is the analysis:
\`\`\`json
{"columns":4,"rows":3,"damSector":{"column":2,"row":1},"powerPlantSector":{"column":3,"row":2},"confidence":"medium","notes":"ok"}
\`\`\``;

    const result = parseMapAnalysis(raw);
    assert.equal(result.columns, 4);
    assert.deepEqual(result.damSector, { column: 2, row: 1 });
  });

  it("rejects out-of-range dam sector", () => {
    const raw = JSON.stringify({
      columns: 4,
      rows: 3,
      damSector: { column: 9, row: 1 },
      powerPlantSector: { column: 2, row: 2 },
      confidence: "low",
      notes: "bad"
    });

    assert.throws(() => parseMapAnalysis(raw), /dam column/);
  });
});
