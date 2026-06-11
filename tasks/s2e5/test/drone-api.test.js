import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractFlag,
  buildVerifyPayload,
  htmlToPlainText
} from "../src/services/drone-api.js";

describe("drone-api helpers", () => {
  it("extracts flag from string and object payloads", () => {
    assert.equal(extractFlag('Mission done {FLG:drone123}'), "{FLG:drone123}");
    assert.equal(extractFlag({ message: "{{FLG:abc}}" }), "{{FLG:abc}}");
    assert.equal(extractFlag("no flag here"), null);
  });

  it("builds verify payload with instructions array", () => {
    const payload = buildVerifyPayload(["selfCheck", "flyToLocation"]);
    assert.equal(payload.task, "drone");
    assert.ok(payload.apikey);
    assert.deepEqual(payload.answer.instructions, ["selfCheck", "flyToLocation"]);
  });

  it("strips HTML to plain text", () => {
    const text = htmlToPlainText("<h1>Title</h1><p>Hello <b>world</b></p>");
    assert.equal(text, "Title Hello world");
  });
});
