import { createHash } from "node:crypto";
import { readJson, writeJson } from "./store.js";

const LEADS_PATH = "state/investigation-leads.json";
const PROPOSALS_PATH = "state/search-proposals.json";

const hashKey = (...parts) =>
  createHash("sha256").update(parts.map(String).join("|")).digest("hex").slice(0, 12);

const emptyLeads = () => ({ leads: [] });
const emptyProposals = () => ({ proposals: [] });

export const initLeadState = async () => {
  const leads = await readJson(LEADS_PATH, null);
  if (!leads) await writeJson(LEADS_PATH, emptyLeads());
  const proposals = await readJson(PROPOSALS_PATH, null);
  if (!proposals) await writeJson(PROPOSALS_PATH, emptyProposals());
};

export const loadLeads = () => readJson(LEADS_PATH, emptyLeads());

export const saveLeads = (data) => writeJson(LEADS_PATH, data);

export const loadProposals = () => readJson(PROPOSALS_PATH, emptyProposals());

export const saveProposals = (data) => writeJson(PROPOSALS_PATH, data);

export const findLead = async (id) => {
  const { leads } = await loadLeads();
  return leads.find((lead) => lead.id === id) ?? null;
};

export const addLead = async ({
  sourceMailId,
  summary,
  keywords = [],
  entities = { emails: [], domains: [], people: [] },
  suggestedQueries = [],
  relatedThreadIDs = [],
  priority = "normal",
  rationale = null
}) => {
  if (!sourceMailId || !summary?.trim()) {
    throw new Error("sourceMailId and summary are required.");
  }

  const dedupeKey = hashKey(sourceMailId, summary.trim());
  const registry = await loadLeads();
  const existing = registry.leads.find((lead) => lead.dedupeKey === dedupeKey);
  if (existing) {
    return { lead: existing, created: false };
  }

  const lead = {
    id: `lead_${dedupeKey}`,
    dedupeKey,
    status: "open",
    sourceMailId: String(sourceMailId),
    summary: summary.trim(),
    keywords: Array.isArray(keywords) ? keywords.map(String) : [],
    entities: {
      emails: entities?.emails ?? [],
      domains: entities?.domains ?? [],
      people: entities?.people ?? []
    },
    suggestedQueries: Array.isArray(suggestedQueries) ? suggestedQueries.map(String) : [],
    relatedThreadIDs: Array.isArray(relatedThreadIDs)
      ? [...new Set(relatedThreadIDs.map(Number).filter(Number.isFinite))]
      : [],
    priority: priority === "high" ? "high" : "normal",
    rationale: rationale ?? null,
    createdAt: new Date().toISOString()
  };

  registry.leads.push(lead);
  await saveLeads(registry);
  return { lead, created: true };
};

export const updateLeadStatus = async (id, status) => {
  const registry = await loadLeads();
  const lead = registry.leads.find((entry) => entry.id === id);
  if (!lead) return null;
  lead.status = status;
  lead.updatedAt = new Date().toISOString();
  await saveLeads(registry);
  return lead;
};

export const listOpenLeads = async () => {
  const { leads } = await loadLeads();
  return leads.filter((lead) => lead.status === "open");
};

export const listOpenLeadsWithThreads = async () => {
  const open = await listOpenLeads();
  return open.filter((lead) => lead.relatedThreadIDs?.length > 0);
};

export const addProposal = async ({ leadId, query, rationale, cycle = 0 }) => {
  if (!leadId || !query?.trim() || !rationale?.trim()) {
    throw new Error("leadId, query, and rationale are required.");
  }

  const lead = await findLead(leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const normalizedQuery = query.trim();
  const dedupeKey = hashKey(leadId, normalizedQuery);
  const registry = await loadProposals();
  const existing = registry.proposals.find(
    (proposal) =>
      proposal.dedupeKey === dedupeKey &&
      !["rejected"].includes(proposal.status)
  );
  if (existing) {
    return { proposal: existing, created: false };
  }

  const proposal = {
    id: `prop_${dedupeKey}`,
    dedupeKey,
    leadId,
    query: normalizedQuery,
    rationale: rationale.trim(),
    status: "pending_user",
    proposedAt: new Date().toISOString(),
    decidedAt: null,
    executedAt: null,
    cycle
  };

  registry.proposals.push(proposal);
  await saveProposals(registry);
  await updateLeadStatus(leadId, "proposed");
  return { proposal, created: true };
};

export const listPendingUserProposals = async () => {
  const { proposals } = await loadProposals();
  return proposals.filter((proposal) => proposal.status === "pending_user");
};

export const listApprovedUnexecuted = async () => {
  const { proposals } = await loadProposals();
  return proposals.filter((proposal) => proposal.status === "approved");
};

export const setProposalDecision = async (id, approved) => {
  const registry = await loadProposals();
  const proposal = registry.proposals.find((entry) => entry.id === id);
  if (!proposal || proposal.status !== "pending_user") return null;

  proposal.status = approved ? "approved" : "rejected";
  proposal.decidedAt = new Date().toISOString();
  await saveProposals(registry);

  if (approved) {
    await updateLeadStatus(proposal.leadId, "proposed");
  } else {
    await updateLeadStatus(proposal.leadId, "open");
  }

  return proposal;
};

export const markProposalExecutedByQuery = async (query) => {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) return null;

  const registry = await loadProposals();
  const proposal = registry.proposals.find(
    (entry) => entry.query === normalizedQuery && entry.status === "approved"
  );
  if (!proposal) return null;

  proposal.status = "executed";
  proposal.executedAt = new Date().toISOString();
  await saveProposals(registry);
  await updateLeadStatus(proposal.leadId, "pursued");
  return proposal;
};

export const getLeadSummaryForProposal = async (leadId) => {
  const lead = await findLead(leadId);
  return lead?.summary ?? null;
};

export const markThreadFetchedForLeads = async (threadID) => {
  const id = Number(threadID);
  if (!Number.isFinite(id)) return [];

  const registry = await loadLeads();
  const updated = [];

  for (const lead of registry.leads) {
    if (lead.relatedThreadIDs?.includes(id) && lead.status !== "pursued") {
      lead.status = "pursued";
      lead.updatedAt = new Date().toISOString();
      updated.push(lead.id);
    }
  }

  if (updated.length > 0) await saveLeads(registry);
  return updated;
};
