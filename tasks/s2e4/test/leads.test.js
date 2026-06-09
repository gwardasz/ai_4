import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setWorkspaceRoot } from "../src/config.js";
import {
  initLeadState,
  addLead,
  addProposal,
  setProposalDecision,
  markProposalExecutedByQuery,
  listOpenLeads,
  listApprovedUnexecuted,
  listPendingUserProposals
} from "../src/state/leads.js";

let tempDir = null;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "s2e4-leads-"));
  setWorkspaceRoot(tempDir);
  await initLeadState();
});

after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe("investigation leads", () => {
  it("deduplicates leads by sourceMailId and summary", async () => {
    const first = await addLead({
      sourceMailId: "mail1",
      summary: "Check security@example.com",
      suggestedQueries: ["from:security@example.com"]
    });
    const second = await addLead({
      sourceMailId: "mail1",
      summary: "Check security@example.com"
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.lead.id, second.lead.id);
  });

  it("creates proposal and tracks approval flow", async () => {
    const { lead } = await addLead({
      sourceMailId: "mail2",
      summary: "Follow sender domain",
      suggestedQueries: ["from:other@domain.test"]
    });

    const { proposal, created } = await addProposal({
      leadId: lead.id,
      query: "from:other@domain.test",
      rationale: "Sender mentioned in mail2",
      cycle: 1
    });

    assert.equal(created, true);
    assert.equal(proposal.status, "pending_user");

    const pending = await listPendingUserProposals();
    assert.ok(pending.some((p) => p.id === proposal.id));

    const approved = await setProposalDecision(proposal.id, true);
    assert.equal(approved.status, "approved");

    const awaiting = await listApprovedUnexecuted();
    assert.ok(awaiting.some((p) => p.id === proposal.id));

    const executed = await markProposalExecutedByQuery("from:other@domain.test");
    assert.equal(executed.status, "executed");
    assert.equal((await listApprovedUnexecuted()).length, 0);
  });

  it("reopens lead on rejected proposal", async () => {
    const { lead } = await addLead({
      sourceMailId: "mail3",
      summary: "Low priority hint"
    });

    const { proposal } = await addProposal({
      leadId: lead.id,
      query: "subject:noise",
      rationale: "Probably irrelevant",
      cycle: 2
    });

    await setProposalDecision(proposal.id, false);
    const open = await listOpenLeads();
    assert.ok(open.some((entry) => entry.id === lead.id));
  });
});
