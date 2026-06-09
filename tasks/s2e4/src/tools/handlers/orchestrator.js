import { mergeProgress, isMetaKey, loadProgress, updateProgressFromVerify } from "../../state/progress.js";
import { getMission } from "../../mission.js";
import { resumeSession, getDeferredSessions } from "../../agent/sessions.js";
import { addProposal } from "../../state/leads.js";
import { submitVerify, hasAllFields, missingFields } from "../../services/verify-api.js";

const buildResult = ({ success, message, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  return payload;
};

export const createOrchestratorHandlers = (log, { cycle = 0 } = {}) => ({
  async write_progress(args) {
    const { fields } = getMission();
    const updates = {};

    for (const field of fields) {
      if (args[field] !== undefined) {
        updates[field] = args[field];
      }
    }
    if (args.notes !== undefined) {
      updates.notes = args.notes;
    }

    const unexpected = Object.keys(args).filter((key) => key !== "notes" && !fields.includes(key));
    if (unexpected.length > 0) {
      return buildResult({
        success: false,
        message: `Unknown fields: ${unexpected.join(", ")}. Expected: ${fields.join(", ")}.`
      });
    }

    if (Object.keys(updates).length === 0) {
      return buildResult({ success: false, message: "Provide at least one field to update." });
    }

    try {
      const progress = await mergeProgress(updates);
      const updatedFields = Object.keys(updates).filter((key) => !isMetaKey(key));
      log.info("progress.updated", { fields: updatedFields });
      return buildResult({ success: true, progress, message: "Progress updated." });
    } catch (err) {
      return buildResult({ success: false, message: err.message });
    }
  },

  async propose_search({ leadId, query, rationale }) {
    if (!leadId || !query?.trim() || !rationale?.trim()) {
      return buildResult({ success: false, message: "leadId, query, and rationale are required." });
    }

    try {
      const { proposal, created } = await addProposal({ leadId, query, rationale, cycle });
      log.info("proposal.created", { proposalId: proposal.id, leadId, query, created });
      return buildResult({
        success: true,
        proposalId: proposal.id,
        created,
        proposal,
        message: created
          ? "Search proposal submitted — awaiting user approval."
          : "Proposal already exists for this lead and query."
      });
    } catch (err) {
      return buildResult({ success: false, message: err.message });
    }
  },

  async submit_verify() {
    const mission = getMission();
    const progress = await loadProgress();
    const missing = missingFields(progress, mission.fields);

    if (!hasAllFields(progress, mission.fields)) {
      return buildResult({
        success: false,
        message: `Cannot verify — missing fields: ${missing.join(", ")}.`,
        missing
      });
    }

    try {
      const verify = await submitVerify(progress, mission.fields, log);
      const updated = await updateProgressFromVerify(verify);
      const feedback = verify.data ?? verify.raw ?? null;

      log.info("verify.submitted", {
        ok: verify.ok,
        hasFlag: Boolean(verify.flag),
        status: verify.status
      });

      return buildResult({
        success: true,
        ok: verify.ok,
        status: verify.status,
        flag: verify.flag ?? null,
        hasFlag: Boolean(verify.flag),
        feedback,
        progress: updated,
        message: verify.flag
          ? "Verification successful — flag received."
          : "Verification submitted — no flag yet. Check feedback and continue investigation."
      });
    } catch (err) {
      return buildResult({ success: false, message: err.message });
    }
  },

  async reply_to_agent({ sessionId, content }) {
    if (!sessionId || !content) {
      return buildResult({ success: false, message: "sessionId and content are required." });
    }

    const resumed = resumeSession(sessionId, content);
    if (!resumed) {
      const deferred = getDeferredSessions();
      return buildResult({
        success: false,
        message: `Session ${sessionId} not found or already completed.`,
        deferredSessions: deferred.map((s) => ({ sessionId: s.sessionId, agent: s.agentName, question: s.question }))
      });
    }

    log.info("message.replied", { sessionId, agent: resumed.agentName });
    return buildResult({
      success: true,
      sessionId,
      agent: resumed.agentName,
      message: "Reply queued. Resume delegation to continue the suspended agent.",
      resume: resumed
    });
  }
});
