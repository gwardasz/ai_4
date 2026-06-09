import { mergeProgress, isMetaKey } from "../../state/progress.js";
import { getMission } from "../../mission.js";
import { resumeSession, getDeferredSessions } from "../../agent/sessions.js";

const buildResult = ({ success, message, ...rest }) => {
  const payload = { success, ...rest };
  if (message) payload.message = message;
  return payload;
};

export const createOrchestratorHandlers = (log) => ({
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
