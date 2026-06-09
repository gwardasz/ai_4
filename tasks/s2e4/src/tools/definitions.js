const delegate = {
  type: "function",
  name: "delegate",
  description:
    "Delegate a task to another agent (zmail or analyst) and wait for the result. " +
    "Use precise, actionable task descriptions.",
  parameters: {
    type: "object",
    properties: {
      agent: { type: "string", description: 'Agent name: "zmail" or "analyst".' },
      task: { type: "string", description: "Clear task description for the child agent." },
      sessionId: {
        type: ["string", "null"],
        description: "Session ID to resume a suspended agent, or null."
      }
    },
    required: ["agent", "task", "sessionId"],
    additionalProperties: false
  },
  strict: true
};

const readFileTool = {
  type: "function",
  name: "read_file",
  description: "Read a file from the shared workspace. Path is relative to workspace root.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path, e.g. state/progress.json or mails/abc.json" }
    },
    required: ["path"],
    additionalProperties: false
  },
  strict: true
};

export const buildWriteProgressTool = (fields) => {
  const properties = {
    notes: { type: "string", description: "Optional notes about confidence or source." }
  };

  for (const field of fields) {
    properties[field] = {
      type: ["string", "null"],
      description: `Discovered value for field "${field}".`
    };
  }

  return {
    type: "function",
    name: "write_progress",
    description: `Merge discovered facts into state/progress.json for fields: ${fields.join(", ")}.`,
    parameters: {
      type: "object",
      properties,
      additionalProperties: false
    },
    strict: false
  };
};

const replyToAgent = {
  type: "function",
  name: "reply_to_agent",
  description: "Reply to a suspended sub-agent that sent a message. Provide sessionId from delegate result.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string" },
      content: { type: "string", description: "Answer or clarification for the sub-agent." }
    },
    required: ["sessionId", "content"],
    additionalProperties: false
  },
  strict: true
};

const zmailHelp = {
  type: "function",
  name: "zmail_help",
  description: "Fetch zmail API documentation (cached after first call).",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  strict: true
};

const zmailSearch = {
  type: "function",
  name: "zmail_search",
  description: "Search mailbox with Gmail-style query. Saves full messages to workspace/mails/.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Gmail-style query, e.g. from:example.com OR subject:keyword" },
      page: { type: "integer", minimum: 1 },
      perPage: { type: "integer", minimum: 5, maximum: 20 },
      fetchBodies: { type: "boolean", description: "Fetch full message bodies (default true)." }
    },
    required: ["query"],
    additionalProperties: false
  },
  strict: false
};

const zmailGetMessage = {
  type: "function",
  name: "zmail_get_message",
  description: "Fetch full message by rowID or messageID hash.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "rowID or 32-char messageID." }
    },
    required: ["id"],
    additionalProperties: false
  },
  strict: true
};

const zmailGetThread = {
  type: "function",
  name: "zmail_get_thread",
  description:
    "Fetch all messages in an email thread by threadID. Saves full messages to workspace/mails/.",
  parameters: {
    type: "object",
    properties: {
      threadID: { type: "integer", description: "Numeric threadID from mail metadata (e.g. from search hits)." },
      fetchBodies: { type: "boolean", description: "Fetch and save full message bodies (default true)." }
    },
    required: ["threadID"],
    additionalProperties: false
  },
  strict: false
};

const submitLead = {
  type: "function",
  name: "submit_lead",
  description:
    "Record an investigation lead discovered in a mail — recipients, keywords, domains, or follow-up search ideas relevant to the mission.",
  parameters: {
    type: "object",
    properties: {
      sourceMailId: { type: "string", description: "Mail ID the lead was found in." },
      summary: { type: "string", description: "Short description of the lead." },
      keywords: { type: "array", items: { type: "string" } },
      entities: {
        type: "object",
        properties: {
          emails: { type: "array", items: { type: "string" } },
          domains: { type: "array", items: { type: "string" } },
          people: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      },
      suggestedQueries: {
        type: "array",
        items: { type: "string" },
        description: "Gmail-style query hints for orchestrator."
      },
      relatedThreadIDs: {
        type: "array",
        items: { type: "integer" },
        description:
          "Numeric threadIDs to fetch via zmail_get_thread — from metadata.threadID or body.threadID of the source mail or related mails."
      },
      priority: { type: "string", enum: ["normal", "high"] },
      rationale: { type: "string", description: "Why this lead matters for the mission." }
    },
    required: ["sourceMailId", "summary"],
    additionalProperties: false
  },
  strict: false
};

const proposeSearch = {
  type: "function",
  name: "propose_search",
  description:
    "Propose a zmail search derived from an investigation lead. Requires user approval before execution.",
  parameters: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "ID from investigation-leads.json." },
      query: { type: "string", description: "Gmail-style zmail query to run after approval." },
      rationale: { type: "string", description: "Why this search should be run (shown to user)." }
    },
    required: ["leadId", "query", "rationale"],
    additionalProperties: false
  },
  strict: true
};

const submitVerifyTool = {
  type: "function",
  name: "submit_verify",
  description:
    "Submit current progress fields to the hub for verification. Call only when all mission fields are filled. Returns flag on success or feedback to guide further investigation.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  strict: true
};

const markMailAnalyzed = {
  type: "function",
  name: "mark_mail_analyzed",
  description: "Mark a mail as analyzed to avoid re-processing. Only write tool for analyst.",
  parameters: {
    type: "object",
    properties: {
      mailId: { type: "string" },
      notes: { type: ["string", "null"], description: "Optional analysis notes, or null." }
    },
    required: ["mailId", "notes"],
    additionalProperties: false
  },
  strict: true
};

const message = {
  type: "function",
  name: "message",
  description: "Ask the orchestrator a question. Suspends this agent until reply_to_agent is called.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "Question or clarification request." },
      sessionId: {
        type: ["string", "null"],
        description: "Existing session ID when continuing, or null."
      }
    },
    required: ["content", "sessionId"],
    additionalProperties: false
  },
  strict: true
};

const STATIC_TOOLS = {
  delegate,
  read_file: readFileTool,
  reply_to_agent: replyToAgent,
  zmail_help: zmailHelp,
  zmail_search: zmailSearch,
  zmail_get_message: zmailGetMessage,
  zmail_get_thread: zmailGetThread,
  mark_mail_analyzed: markMailAnalyzed,
  submit_lead: submitLead,
  propose_search: proposeSearch,
  submit_verify: submitVerifyTool,
  message
};

export const AGENT_TOOLS = {
  orchestrator: ["delegate", "read_file", "write_progress", "propose_search", "submit_verify", "reply_to_agent"],
  zmail: ["zmail_help", "zmail_search", "zmail_get_message", "zmail_get_thread", "read_file", "message"],
  analyst: ["read_file", "mark_mail_analyzed", "submit_lead", "message"]
};

export const toolsForAgent = (agentName, mission) => {
  const names = AGENT_TOOLS[agentName] ?? [];
  return names
    .map((name) => {
      if (name === "write_progress") {
        return buildWriteProgressTool(mission?.fields ?? []);
      }
      return STATIC_TOOLS[name];
    })
    .filter(Boolean);
};
