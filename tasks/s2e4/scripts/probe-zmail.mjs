/**
 * Live zmail API probe — saves raw responses to test/fixtures/zmail/.
 * Usage: node tasks/s2e4/scripts/probe-zmail.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zmailHelp, zmailSearch, zmailGetMessages } from "../src/services/zmail-api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "test", "fixtures", "zmail");

const saveFixture = async (name, payload) => {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const path = join(FIXTURES_DIR, name);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`Saved ${path}`);
};

const logKeys = (label, data) => {
  const keys = data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [];
  console.log(`${label} top-level keys:`, keys.length ? keys.join(", ") : "(not an object)");
};

const { ok: helpOk, status: helpStatus, data: helpData } = await zmailHelp(console);
console.log("help:", helpOk, helpStatus);
logKeys("help", helpData);
await saveFixture("help.json", { ok: helpOk, status: helpStatus, data: helpData });

const searchQuery = "from:proton.me";
const { ok: searchOk, status: searchStatus, data: searchData } = await zmailSearch(searchQuery, 1, 10, console);
console.log("search:", searchOk, searchStatus);
logKeys("search", searchData);
await saveFixture("search-from-proton.json", { ok: searchOk, status: searchStatus, data: searchData });

const emptyQuery = 'subject:"__no_such_mail_xyz__"';
const { ok: emptyOk, status: emptyStatus, data: emptyData } = await zmailSearch(emptyQuery, 1, 10, console);
console.log("search empty:", emptyOk, emptyStatus);
logKeys("search empty", emptyData);
await saveFixture("search-empty.json", { ok: emptyOk, status: emptyStatus, data: emptyData });

let messageId = null;
let rowId = null;
const searchItems = searchData?.items ?? searchData?.messages ?? [];
if (Array.isArray(searchItems) && searchItems[0]) {
  messageId = searchItems[0].messageID ?? searchItems[0].messageId;
  rowId = searchItems[0].rowID ?? searchItems[0].rowId;
}

if (messageId) {
  const byMsg = await zmailGetMessages(messageId, console);
  console.log("getMessages by messageID:", byMsg.ok, byMsg.status);
  logKeys("getMessages by messageID", byMsg.data);
  await saveFixture("getMessages-by-messageID.json", {
    ok: byMsg.ok,
    status: byMsg.status,
    requestIds: messageId,
    data: byMsg.data
  });
}

if (rowId != null) {
  const byRow = await zmailGetMessages(rowId, console);
  console.log("getMessages by rowID:", byRow.ok, byRow.status);
  logKeys("getMessages by rowID", byRow.data);
  await saveFixture("getMessages-by-rowID.json", {
    ok: byRow.ok,
    status: byRow.status,
    requestIds: rowId,
    data: byRow.data
  });
}

console.log("\nDone. Fixtures in test/fixtures/zmail/");
