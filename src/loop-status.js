// loop-status.js — the ONE lifecycle vocabulary for an account in the revenue
// loop. Reporting must never say "closed"/"won" for a prepared-but-unapproved
// account: those words mean a signed commercial contract only.
//
// Ordered stages (low -> high). loop_complete is a separate boolean meaning "the
// automated prep loop reached the human-approval gate" — it is NOT a deal.
import { getCohort } from "./lineage.js";

export const STAGES = [
  "seeded",           // lead exists, no research yet
  "researched",       // qualified / route_ready
  "prepared",         // dossier + reviewed sequence produced, nothing queued
  "pending_approval", // messages queued, awaiting human approval
  "approved",         // human approved one+ messages (not sent)
  "sent",             // a message was actually sent
  "replied",          // prospect replied
  "meeting",          // meeting booked
  "opportunity",      // opportunity opened
  "won",              // SIGNED CONTRACT — the only "closed/won"
];

export function stageRank(stage) {
  const i = STAGES.indexOf(stage);
  return i < 0 ? 0 : i;
}

// The automated loop is allowed to reach pending_approval and no further without a
// human. loop_complete = the prep loop finished for this account.
export function isLoopComplete(stage) {
  return stageRank(stage) >= stageRank("pending_approval");
}

// Compute an account's current lifecycle stage from CRM truth. Recognizes BOTH the
// LinkedIn-native path (outreach_drafts_v2 + linkedin_* events, the live path) and the
// legacy email path (outreach_messages + reviewer artifact, dormant). `reviewedSequence`
// is whether a reviewer artifact references this company (prepared, pre-queue).
export function accountStage(database, lead, { reviewedSequence = false } = {}) {
  if (!lead) return "seeded";
  const leadId = lead.id;
  const eventTypes = new Set(database.prepare("SELECT DISTINCT type FROM activity_events WHERE lead_id=?").all(leadId).map((r) => r.type));

  const contract = database.prepare(
    "SELECT 1 FROM contracts c JOIN opportunities o ON o.id=c.opportunity_id WHERE o.lead_id=? LIMIT 1"
  ).get(leadId) || database.prepare("SELECT 1 FROM contracts WHERE lead_id=? LIMIT 1").get(leadId);
  if (contract || eventTypes.has("contract_signed")) return "won";
  if (database.prepare("SELECT 1 FROM opportunities WHERE lead_id=? LIMIT 1").get(leadId)) return "opportunity";
  if (database.prepare("SELECT 1 FROM meetings WHERE lead_id=? LIMIT 1").get(leadId) || eventTypes.has("meeting") || eventTypes.has("meeting_confirmed")) return "meeting";
  if (eventTypes.has("reply") || eventTypes.has("linkedin_reply_received")) return "replied";
  if (eventTypes.has("sent") || eventTypes.has("linkedin_message_sent")) return "sent";

  // LinkedIn-native drafts (the live path).
  const drafts = database.prepare("SELECT sent_at, stopped_at, review_status FROM outreach_drafts_v2 WHERE lead_id=?").all(leadId);
  if (drafts.some((d) => d.sent_at)) return "sent";
  if (drafts.some((d) => d.review_status === "approved" && !d.stopped_at)) return "approved";
  if (drafts.some((d) => d.review_status === "pending" && !d.stopped_at)) return "pending_approval";

  // Legacy email queue (dormant).
  const msgStatuses = new Set(database.prepare("SELECT DISTINCT status FROM outreach_messages WHERE lead_id=? AND message_type='sequence_touch'").all(leadId).map((r) => r.status));
  if (msgStatuses.has("sent") || msgStatuses.has("provider_draft")) return "sent";
  if (msgStatuses.has("approved")) return "approved";
  if (msgStatuses.has("pending_approval")) return "pending_approval";

  if (reviewedSequence) return "prepared";
  if (["researched", "route_ready", "enrolled", "engaged"].includes(lead.stage)) return "researched";
  return "seeded";
}

// Current-run completion. Real commercial progress (a send or beyond) counts regardless
// of run. Otherwise the prep loop is complete ONLY if a draft from THIS pipeline run is
// waiting at the human gate — a stale draft left over from a previous run must never make
// the current run look finished.
export function loopCompleteForRun(database, lead, pipelineRunId = null) {
  if (!lead) return false;
  if (stageRank(accountStage(database, lead)) >= stageRank("sent")) return true;
  if (!pipelineRunId) return isLoopComplete(accountStage(database, lead));
  const current = database.prepare(
    "SELECT 1 FROM outreach_drafts_v2 WHERE lead_id=? AND pipeline_run_id=? AND stopped_at IS NULL AND review_status IN ('pending','approved') LIMIT 1"
  ).get(lead.id, pipelineRunId);
  return Boolean(current);
}

// Cohort approval is a human gate; report it separately so "pending_approval" is
// never confused with "the operator approved this cohort".
export function cohortApprovalStatus(database, lead) {
  if (!lead?.cohort_id) return "none";
  return getCohort(database, lead.cohort_id)?.status || "none";
}
