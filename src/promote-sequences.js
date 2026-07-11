// promote-sequences.js — the real-loop adapter (PR#6 keystone).
//
// Turns a REAL email-sequence-reviewer artifact (improved_person_email_sequences)
// into pending-approval outreach_messages against the canonical CRM, with no
// manual JSON copying and no hardcoded per-brand wording. This is the generic
// successor to promote-reviewed-email-artifact.js, which only normalized GNK
// email text and never created queue records.
//
// It is fail-closed: a sequence is only queued when its lead exists, carries a
// play_id, and has a usable recipient. Everything else is skipped WITH A REASON
// so the operator sees exactly why a real account did not reach the queue.
// It never approves, drafts, or sends — approval stays a separate human gate.
import { db } from "./db.js";
import { readState } from "./bus.js";
import { getLead } from "./crm-model.js";
import { queueOutreachMessage } from "./outreach-queue.js";
import { normalizeProduct } from "./lineage.js";

const norm = (v) => String(v || "").toLowerCase().trim();
const domainOf = (url) => {
  if (!url) return "";
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return ""; }
};

// A reviewer marks a sequence send-ready, but readiness is only honored when the
// touch actually cites evidence. An ungrounded "ready" is downgraded so it can
// never pass the message-approval reviewer gate.
const READY_SYNONYMS = new Set(["ready", "send_ready", "send-ready"]);
export function normalizeReadiness(send_readiness, groundingPresent) {
  return READY_SYNONYMS.has(norm(send_readiness)) && groundingPresent ? "ready" : "needs_human_review";
}

// Match a reviewer sequence to an existing CRM lead. Leads are seeded upstream
// (cohort:build / live-smoke) already carrying the play_id, so play assignment is
// resolved FROM THE LEAD here rather than from the reviewer artifact (which does
// not carry play_id). Strongest match wins: domain+name, then company+name.
export function matchLead(database, product, seq) {
  const p = normalizeProduct(product);
  const seqDomain = norm(seq.website ? domainOf(seq.website) : "");
  const seqCompany = norm(seq.company);
  const seqName = norm(seq.person_name);
  const rows = database.prepare("SELECT id FROM leads WHERE product=?").all(p);
  const candidates = rows.map((r) => getLead(database, r.id)).filter(Boolean);
  const byDomainName = candidates.find((l) => seqDomain && norm(l.company_domain) === seqDomain && norm(l.name) === seqName);
  if (byDomainName) return byDomainName;
  const byCompanyName = candidates.find((l) => seqCompany && norm(l.company) === seqCompany && norm(l.name) === seqName);
  if (byCompanyName) return byCompanyName;
  // Fall back to company-only when the sequence names no person we can pin, but
  // only if it is unambiguous (exactly one lead for that company).
  const byCompany = candidates.filter((l) => seqCompany && norm(l.company) === seqCompany);
  return byCompany.length === 1 ? byCompany[0] : null;
}

function emailSubject(email) {
  return email.recommended_subject || (email.subject_options || [])[0] || "";
}

// Queue every touch of one reviewed sequence for one matched lead. Returns a
// per-sequence outcome: { status: 'queued'|'skipped', reason?, queued, touches }.
export function promoteSequence(database, product, seq, { operator = "pipeline" } = {}) {
  const lead = matchLead(database, product, seq);
  if (!lead) return { company: seq.company, person: seq.person_name, status: "skipped", reason: "no_matching_lead", queued: 0 };
  if (!lead.play_id) return { company: seq.company, person: seq.person_name, lead_id: lead.id, status: "skipped", reason: "lead_has_no_play", queued: 0 };

  // Canonical recipient is the lead's verified contact. Fall back to the address
  // the reviewer carried, but if neither exists the sequence cannot be queued —
  // there is nothing to send to. Surfaced, never silently dropped.
  const recipient = lead.email_best || seq.email_address || "";
  if (!recipient) return { company: seq.company, person: seq.person_name, lead_id: lead.id, status: "skipped", reason: "no_verified_contact", queued: 0 };

  const emails = (seq.emails || []).filter((e) => e && e.body && Number.isInteger(Number(e.touch_number)));
  if (!emails.length) return { company: seq.company, person: seq.person_name, lead_id: lead.id, status: "skipped", reason: "no_touches_with_body", queued: 0 };

  let queued = 0;
  for (const email of emails) {
    const grounding = Array.isArray(email.grounding_used) ? email.grounding_used.filter(Boolean) : [];
    const subject = emailSubject(email);
    if (!subject) continue; // a touch with no subject is not a sendable message
    queueOutreachMessage({
      lead_id: lead.id,
      touch_number: Number(email.touch_number),
      recipient,
      subject,
      body: email.body,
      message_type: "sequence_touch",
      review_status: normalizeReadiness(seq.send_readiness, grounding.length > 0),
      evidence: grounding,
    }, database);
    queued++;
  }
  return {
    company: seq.company, person: seq.person_name, lead_id: lead.id, play_id: lead.play_id,
    recipient, status: queued ? "queued" : "skipped", reason: queued ? null : "no_touches_with_subject",
    queued, touches: emails.length, send_readiness: seq.send_readiness || "unknown",
  };
}

// Promote every sequence in a reviewer artifact. Pure over (artifact, db) so it is
// unit-testable against the real committed reviewer-full.json without any LLM call.
export function promoteReviewerArtifact(artifact, product, database = db(), options = {}) {
  const sequences = artifact?.improved_person_email_sequences || [];
  const results = sequences.map((seq) => promoteSequence(database, product, seq, options));
  const queued = results.filter((r) => r.status === "queued");
  const skipped = results.filter((r) => r.status === "skipped");
  return {
    product: normalizeProduct(product),
    sequences: sequences.length,
    accounts_queued: queued.length,
    messages_queued: queued.reduce((n, r) => n + r.queued, 0),
    skipped: skipped.length,
    skipped_reasons: skipped.reduce((acc, r) => ((acc[r.reason] = (acc[r.reason] || 0) + 1), acc), {}),
    results,
  };
}

// Pipeline hook: read the published reviewer artifact from shared state (the
// artifact bus — NO manual copying) and promote it. Returns null when no reviewer
// artifact is present so callers can no-op cleanly.
export async function promoteSequencesFromState(product = "gnk", database = db(), options = {}) {
  const p = normalizeProduct(product);
  const state = await readState();
  const artifact = state.artifacts?.[`${p}-email-sequence-reviewer`];
  if (!artifact) return null;
  return promoteReviewerArtifact(artifact, p, database, options);
}

// CLI: node src/promote-sequences.js <gnk|outagehub>
if (import.meta.url === `file://${process.argv[1]}`) {
  promoteSequencesFromState(normalizeProduct(process.argv[2] || "gnk"))
    .then((summary) => {
      if (!summary) { console.log("No email-sequence-reviewer artifact in state; nothing to promote."); return; }
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}
