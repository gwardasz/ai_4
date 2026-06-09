import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMailRecord,
  extractMailId,
  normalizeMessages,
  pickMailBody,
  getMailText,
  buildSavedMail
} from "../src/services/zmail-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "zmail");

const loadFixture = async (name) => {
  const raw = await readFile(join(fixturesDir, name), "utf-8");
  return JSON.parse(raw);
};

describe("normalizeMessages", () => {
  it("parses search response with items array", async () => {
    const { data } = await loadFixture("search-from-proton.json");
    const messages = normalizeMessages(data);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageID, "6624add090a5cb06f5c192653b5a243c");
    assert.equal(typeof messages[0].snippet, "string");
    assert.equal(messages[0].message, undefined);
  });

  it("parses empty search response", async () => {
    const { data } = await loadFixture("search-empty.json");
    assert.deepEqual(normalizeMessages(data), []);
  });

  it("parses getMessages response with items array", async () => {
    const { data } = await loadFixture("getMessages-by-messageID.json");
    const messages = normalizeMessages(data);
    assert.equal(messages.length, 1);
    assert.equal(typeof messages[0].message, "string");
  });

  it("does not treat mail object message field as wrapper", () => {
    const mail = {
      messageID: "abc123",
      message: "Email body text"
    };
    const messages = normalizeMessages(mail);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].message, "Email body text");
    assert.equal(typeof messages[0], "object");
  });

  it("returns empty array for null, empty object, and unparsed raw", () => {
    assert.deepEqual(normalizeMessages(null), []);
    assert.deepEqual(normalizeMessages({}), []);
    assert.deepEqual(normalizeMessages({ raw: "not json" }), []);
  });
});

describe("extractMailId", () => {
  it("prefers messageID over rowID", () => {
    const id = extractMailId({
      messageID: "6624add090a5cb06f5c192653b5a243c",
      rowID: 88
    });
    assert.equal(id, "6624add090a5cb06f5c192653b5a243c");
  });

  it("returns null when no id fields present", () => {
    assert.equal(extractMailId({ subject: "test" }), null);
    assert.equal(extractMailId(null), null);
  });
});

describe("pickMailBody", () => {
  it("returns first mail record from normalized list", async () => {
    const { data } = await loadFixture("getMessages-by-messageID.json");
    const messages = normalizeMessages(data);
    const hit = (await loadFixture("search-from-proton.json")).data.items[0];
    const body = pickMailBody(messages, hit);
    assert.equal(body.messageID, "6624add090a5cb06f5c192653b5a243c");
    assert.equal(typeof body.message, "string");
  });

  it("falls back to search hit when getMessages list is empty", async () => {
    const hit = (await loadFixture("search-from-proton.json")).data.items[0];
    const body = pickMailBody([], hit);
    assert.equal(body.messageID, hit.messageID);
  });
});

describe("getMailText", () => {
  it("reads bodyText from saved mail", async () => {
    const saved = await loadFixture("saved-mail-sample.json");
    assert.match(getMailText(saved), /Jako obywatel/);
  });

  it("reads body.message when bodyText missing", () => {
    assert.equal(getMailText({ body: { message: "hello" } }), "hello");
  });

  it("buildSavedMail sets bodyText from body.message", () => {
    const saved = buildSavedMail({
      id: "abc",
      body: { messageID: "abc", message: "content" }
    });
    assert.equal(saved.bodyText, "content");
    assert.equal(saved.id, "abc");
  });
});

describe("isMailRecord", () => {
  it("rejects plain strings and arrays", () => {
    assert.equal(isMailRecord("text"), false);
    assert.equal(isMailRecord([]), false);
  });

  it("accepts objects with messageID or rowID", () => {
    assert.equal(isMailRecord({ messageID: "x" }), true);
    assert.equal(isMailRecord({ rowID: 1 }), true);
  });
});
