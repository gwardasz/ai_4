import { createHash } from "node:crypto";
import { readJson, writeJson } from "../../state/store.js";
import { addLead } from "../../state/leads.js";

const buildResult = ({ success, message, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  return payload;
};

const checksum = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 16);

export const createAnalystHandlers = (log) => ({
  async mark_mail_analyzed({ mailId, notes }) {
    if (!mailId) {
      return buildResult({ success: false, message: "mailId is required." });
    }

    const id = String(mailId);
    const registry = await readJson("state/analyzed-mail-ids.json", { analyzed: [] });

    if (registry.analyzed.some((entry) => entry.id === id)) {
      log.warn("tool.guard", { agent: "analyst", reason: "mail_already_analyzed", mailId: id });
      return buildResult({
        success: true,
        cached: true,
        mailId: id,
        message: "Mail already marked as analyzed."
      });
    }

    registry.analyzed.push({
      id,
      analyzedAt: new Date().toISOString(),
      checksum: checksum(notes ?? id),
      notes: notes ?? null
    });
    await writeJson("state/analyzed-mail-ids.json", registry);

    return buildResult({
      success: true,
      mailId: id,
      message: `Marked mail ${id} as analyzed.`
    });
  },

  async submit_lead({
    sourceMailId,
    summary,
    keywords,
    entities,
    suggestedQueries,
    relatedThreadIDs,
    priority,
    rationale
  }) {
    if (!sourceMailId || !summary?.trim()) {
      return buildResult({ success: false, message: "sourceMailId and summary are required." });
    }

    try {
      const { lead, created } = await addLead({
        sourceMailId,
        summary,
        keywords,
        entities,
        suggestedQueries,
        relatedThreadIDs,
        priority,
        rationale
      });
      log.info("lead.submitted", { leadId: lead.id, created, sourceMailId });
      return buildResult({
        success: true,
        leadId: lead.id,
        created,
        lead,
        message: created ? "Investigation lead recorded." : "Lead already exists (deduplicated)."
      });
    } catch (err) {
      return buildResult({ success: false, message: err.message });
    }
  }
});

export const listUnanalyzedMailIds = async () => {
  const fetched = await readJson("state/fetched-mail-ids.json", { mails: {} });
  const analyzed = await readJson("state/analyzed-mail-ids.json", { analyzed: [] });
  const analyzedSet = new Set(analyzed.analyzed.map((e) => e.id));
  return Object.entries(fetched.mails)
    .filter(([, meta]) => meta.status === "fetched")
    .map(([id]) => id)
    .filter((id) => !analyzedSet.has(id));
};
