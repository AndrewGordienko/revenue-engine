// promote-linkedin.js — the P0 keystone. Turns the LinkedIn artifact that the live
// critical path already produces ({venture}-email-drafter -> linkedin_connection_messages)
// into pending, motion-bound drafts in outreach_drafts_v2. This is what makes
// `lead:prepare` land an approvable draft in the exact object the UI shows.
//
// It never invents work from the archive: a draft is queued only for a lead that
// carries a play (i.e. was deliberately sourced into a cohort), and each draft hangs
// off that lead's single open motion (opening one at status 'approved' if none exists).
import { db } from "./db.js";
import { getLead } from "./crm-model.js";
import { readState } from "./bus.js";
import { normalizeVenture, getOpenMotionForLead, openMotion } from "./active-motions.js";
import { queueDraft } from "./linkedin-drafts.js";
import { canActivate } from "./account-score.js";

const norm = (s) => String(s || "").toLowerCase().trim();

// Resolve the CRM lead a LinkedIn message is about: name+company first, then an
// unambiguous company-only match. Scoped to the venture so brands never cross.
export function matchLead(database, venture, msg) {
  const v = normalizeVenture(venture);
  const cands = database.prepare("SELECT id FROM leads WHERE product=?").all(v).map((r) => getLead(database, r.id)).filter(Boolean);
  const name = norm(msg.person_name), company = norm(msg.company);
  const byNameCompany = cands.find((l) => name && company && norm(l.name) === name && norm(l.company) === company);
  if (byNameCompany) return byNameCompany;
  const byCompany = cands.filter((l) => company && norm(l.company) === company);
  return byCompany.length === 1 ? byCompany[0] : null;
}

function promoteOne(database, venture, msg, { pipeline_run_id }) {
  const body = msg.connection_message || msg.body || "";
  const lead = matchLead(database, venture, msg);
  if (!lead) return { status: "skipped", reason: "no_matching_lead", person: msg.person_name, company: msg.company };
  if (!lead.play_id) return { status: "skipped", reason: "lead_has_no_play", lead_id: lead.id };
  if (!body.trim()) return { status: "skipped", reason: "empty_message", lead_id: lead.id };
  const profile = msg.linkedin_url || lead.linkedin_url || null;
  if (!profile) return { status: "skipped", reason: "no_profile_url", lead_id: lead.id };
  // Activation gate: a scored-below-70 lead is never activated into a motion. (Route is
  // already guaranteed by the profile check above; not-yet-scored leads pass — they are
  // scored during cohort:build before real activation.)
  const gate = canActivate(lead);
  if (!gate.ok && gate.reasons.includes("below_activation_threshold"))
    return { status: "skipped", reason: "below_activation_threshold", lead_id: lead.id, score: gate.score };

  let motion = getOpenMotionForLead(database, lead.id);
  if (!motion) {
    try {
      motion = openMotion(database, {
        lead_id: lead.id, venture, play_id: lead.play_id, cohort_id: lead.cohort_id, status: "approved",
      });
    } catch (e) {
      return { status: "skipped", reason: "cannot_open_motion", lead_id: lead.id, detail: e.message };
    }
  } else if (motion.play_id !== lead.play_id) {
    return { status: "skipped", reason: "motion_play_mismatch", lead_id: lead.id };
  }

  const evidence = (msg.evidence_urls || []).map((u) => (typeof u === "string" ? { source_url: u } : u));
  const draft = queueDraft(database, {
    motion_id: motion.id, message_kind: "connection_note", touch_number: 1, body,
    evidence, writer_version: msg.generation_model || null, linkedin_profile_url: profile, pipeline_run_id,
  });
  return { status: "queued", lead_id: lead.id, account_key: motion.account_key, motion_id: motion.id, draft_id: draft.id };
}

// Promote every LinkedIn message in an artifact. Returns an explicit outcome for each
// (queued or skipped-with-reason) so nothing is dropped silently.
export function promoteLinkedInMessages(artifact, venture, database = db(), { pipeline_run_id = null } = {}) {
  const v = normalizeVenture(venture);
  const messages = artifact?.linkedin_connection_messages || [];
  const results = [];
  const skipped_reasons = {};
  const accounts = new Set();
  let drafts_queued = 0;
  for (const msg of messages) {
    const outcome = promoteOne(database, v, msg, { pipeline_run_id });
    results.push(outcome);
    if (outcome.status === "queued") { drafts_queued++; accounts.add(outcome.account_key); }
    else skipped_reasons[outcome.reason] = (skipped_reasons[outcome.reason] || 0) + 1;
  }
  return {
    venture: v, messages: messages.length, accounts_queued: accounts.size,
    drafts_queued, skipped: messages.length - drafts_queued, skipped_reasons, results,
  };
}

// Read the current-run artifact from shared state and promote it. Returns null when no
// LinkedIn artifact is present (nothing to queue), matching the email promoter's shape.
export async function promoteLinkedInFromState(venture = "gnk", database = db()) {
  const v = normalizeVenture(venture);
  const state = await readState();
  const artifact = state?.artifacts?.[`${v}-email-drafter`];
  if (!artifact?.linkedin_connection_messages?.length) return null;
  return promoteLinkedInMessages(artifact, v, database);
}
