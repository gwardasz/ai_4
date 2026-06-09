import { chat, extractToolCalls, extractText } from "../llm.js";
import { loadAgent } from "./loadAgent.js";
import { toolsForAgent } from "../tools/definitions.js";
import { createHandlersForAgent } from "../tools/registry.js";
import {
  suspendSession,
  consumeSession,
  createSessionId,
  markSessionDeferred
} from "./sessions.js";
import { MAX_TURNS, MAX_DEPTH, maxOutputTokens } from "../config.js";
import { noopLogger, redact } from "../utils/logger.js";
import { missingFields } from "../services/verify-api.js";
import { listUnanalyzedMailIds } from "../tools/handlers/analyst.js";

const truncate = (s, max = 120) => (s.length > max ? `${s.slice(0, max)}…` : s);

const toOutput = (callId, payload) => ({
  type: "function_call_output",
  call_id: callId,
  output: JSON.stringify(payload)
});

const executeToolCalls = async (toolCalls, handlers, ctx, log) => {
  const executed = [];

  for (const call of toolCalls) {
    let args;
    try {
      args = JSON.parse(call.arguments);
    } catch {
      executed.push({
        output: toOutput(call.call_id, { success: false, message: "Invalid JSON arguments." }),
        meta: null
      });
      continue;
    }

    log.info("tool.call", { agent: ctx.agentName, name: call.name, args: redact(args) });

    if (call.name === "delegate") {
      const agent = args.agent;
      const task = args.task;
      if (!agent || !task) {
        executed.push({
          output: toOutput(call.call_id, { success: false, message: 'delegate requires "agent" and "task".' }),
          meta: null
        });
        continue;
      }

      log.info("agent.delegate", {
        from: ctx.agentName,
        to: agent,
        taskPreview: truncate(task)
      });

      let childTask = task;
      if (args.sessionId) {
        const session = consumeSession(args.sessionId);
        if (session?.reply) {
          childTask = `${task}\n\nOrchestrator reply: ${session.reply}`;
        }
      }

      const result = await ctx.runAgent(agent, childTask, ctx.depth + 1, {
        cycle: ctx.cycle,
        resumeSessionId: args.sessionId
      });

      executed.push({
        output: toOutput(call.call_id, result),
        meta: result.waiting ? { waiting: true, ...result } : null
      });
      continue;
    }

    const handler = handlers[call.name];
    if (!handler) {
      executed.push({
        output: toOutput(call.call_id, { success: false, message: `Unknown tool: ${call.name}` }),
        meta: null
      });
      continue;
    }

    const result = await handler(args);
    log.info("tool.result", { agent: ctx.agentName, name: call.name, success: result?.success !== false });

    let meta = null;
    if (call.name === "message" && result?.waiting) {
      const sessionId = result.sessionId ?? createSessionId();
      suspendSession(
        sessionId,
        {
          agentName: ctx.agentName,
          question: result.question ?? args.content,
          conversation: ctx.conversationSnapshot,
          turn: ctx.turn,
          pendingCallId: call.call_id
        },
        log
      );
      meta = { waiting: true, sessionId, question: result.question ?? args.content };
    }

    executed.push({ output: toOutput(call.call_id, result), meta });
  }

  return executed;
};

export const runAgent = async (
  agentName,
  task,
  depth = 0,
  { log = noopLogger, cycle = 0, resumeSessionId = null, mission = null } = {},
  runAgentRef = null
) => {
  const self =
    runAgentRef ??
    ((name, t, d, opts) =>
      runAgent(name, t, d, { ...opts, log, cycle, mission }, self));

  if (depth > MAX_DEPTH) {
    return { success: false, message: "Max agent depth exceeded." };
  }

  log.info("agent.start", { agent: agentName, depth, cycle });

  const template = await loadAgent(agentName);
  const tools = toolsForAgent(agentName, mission);
  const handlers = createHandlersForAgent(agentName, log.child({ agent: agentName }), { cycle });

  let conversation = [{ role: "user", content: task }];

  if (resumeSessionId) {
    const session = consumeSession(resumeSessionId);
    if (session?.conversation) {
      conversation = session.conversation;
      if (session.reply && session.pendingCallId) {
        conversation = [
          ...conversation,
          {
            type: "function_call_output",
            call_id: session.pendingCallId,
            output: JSON.stringify({ success: true, reply: session.reply })
          },
          { role: "user", content: `Orchestrator replied: ${session.reply}` }
        ];
      }
    }
  }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    log.debug("agent.turn", { agent: agentName, turn });

    const response = await chat({
      model: template.model,
      tools,
      instructions: template.systemPrompt,
      maxOutputTokens,
      input: conversation
    });

    const toolCalls = extractToolCalls(response);
    log.info("llm.response", {
      agent: agentName,
      toolCalls: toolCalls.length,
      tokens: response?.usage?.total_tokens ?? null
    });

    if (toolCalls.length === 0) {
      const reply = extractText(response) ?? "";
      log.info("agent.complete", { agent: agentName, summary: truncate(reply) });
      return { success: true, agent: agentName, reply };
    }

    const ctx = {
      agentName,
      depth,
      cycle,
      runAgent: self,
      turn,
      conversationSnapshot: [...conversation, ...response.output]
    };

    const executed = await executeToolCalls(toolCalls, handlers, ctx, log);
    conversation = [...conversation, ...response.output, ...executed.map((e) => e.output)];

    const waiting = executed.find((e) => e.meta?.waiting);
    if (waiting) {
      log.warn("agent.waiting", {
        agent: agentName,
        sessionId: waiting.meta.sessionId,
        question: truncate(waiting.meta.question ?? "")
      });
      if (waiting.meta.sessionId) {
        markSessionDeferred(waiting.meta.sessionId, log);
      }
      return {
        success: true,
        waiting: true,
        agent: agentName,
        sessionId: waiting.meta.sessionId,
        question: waiting.meta.question,
        message: `Agent ${agentName} is waiting for orchestrator reply. Use reply_to_agent then delegate with sessionId.`
      };
    }
  }

  log.warn("agent.maxTurns", { agent: agentName, turns: MAX_TURNS });
  return { success: false, message: `Agent ${agentName} exceeded maximum turns.` };
};

const buildProgressSnapshot = (progress, mission) => {
  const snapshot = {};
  for (const field of mission.fields) {
    const value = progress[field];
    snapshot[field] = value && field.toLowerCase().includes("password") ? "[set]" : value;
  }
  snapshot.verifyFeedback = progress.verifyFeedback;
  snapshot.missing = missingFields(progress, mission.fields);
  return snapshot;
};

export const runOrchestratorCycle = async (
  progress,
  mission,
  { log = noopLogger, cycle = 0 } = {}
) => {
  const unanalyzed = await listUnanalyzedMailIds();
  const unanalyzedHint =
    unanalyzed.length > 0
      ? `Unanalyzed mail IDs (${unanalyzed.length}): ${unanalyzed.slice(0, 10).join(", ")}${unanalyzed.length > 10 ? "..." : ""}`
      : "No unanalyzed mails yet — delegate to zmail first.";

  const task = [
    `Investigation cycle ${cycle}.`,
    `Mission: ${mission.text}`,
    `Fields to find: ${mission.fields.join(", ")}`,
    "Current progress:",
    JSON.stringify(buildProgressSnapshot(progress, mission), null, 2),
    "",
    unanalyzedHint,
    "",
    "Steps:",
    "1. Delegate to zmail — search and fetch emails relevant to the mission (derive queries from the mission yourself).",
    "2. Delegate to analyst — extract the requested fields from unanalyzed mails in workspace/mails/.",
    "3. Update progress via write_progress with any confirmed values from the analyst JSON reply.",
    "4. If sub-agents sent messages, use reply_to_agent then re-delegate with sessionId.",
    "5. Do not call verify — the main loop handles that deterministically.",
    "",
    "If data is missing, note it and finish the cycle — new mail may arrive later."
  ].join("\n");

  return runAgent("orchestrator", task, 0, { log, cycle, mission });
};
