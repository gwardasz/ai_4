import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  listPendingUserProposals,
  setProposalDecision,
  getLeadSummaryForProposal
} from "./state/leads.js";

export const processPendingApprovals = async ({ log, autoApprove = false } = {}) => {
  const pending = await listPendingUserProposals();
  if (pending.length === 0) return { processed: 0, quit: false };

  if (autoApprove) {
    for (const proposal of pending) {
      await setProposalDecision(proposal.id, true);
      log.info("approval.auto", { proposalId: proposal.id, query: proposal.query });
    }
    return { processed: pending.length, quit: false };
  }

  const rl = createInterface({ input, output });
  let processed = 0;
  let approveAll = false;

  try {
    for (const proposal of pending) {
      if (approveAll) {
        await setProposalDecision(proposal.id, true);
        log.info("approval.approved", { proposalId: proposal.id, query: proposal.query });
        processed += 1;
        continue;
      }

      const leadSummary = await getLeadSummaryForProposal(proposal.leadId);
      console.log("\n--- Proposed search ---");
      console.log(`Lead:    ${proposal.leadId}`);
      if (leadSummary) console.log(`Trop:    ${leadSummary}`);
      console.log(`Query:   ${proposal.query}`);
      console.log(`Reason:  ${proposal.rationale}`);

      const answer = (await rl.question("Approve? [y/n/a=all/q=quit]: ")).trim().toLowerCase();

      if (answer === "q" || answer === "quit") {
        log.warn("approval.quit", { remaining: pending.length - processed });
        return { processed, quit: true };
      }

      if (answer === "a" || answer === "all") {
        approveAll = true;
        await setProposalDecision(proposal.id, true);
        log.info("approval.approved", { proposalId: proposal.id, query: proposal.query });
        processed += 1;
        continue;
      }

      const approved = answer === "y" || answer === "yes";
      await setProposalDecision(proposal.id, approved);
      log.info(approved ? "approval.approved" : "approval.rejected", {
        proposalId: proposal.id,
        query: proposal.query
      });
      processed += 1;
    }
  } finally {
    rl.close();
  }

  return { processed, quit: false };
};
