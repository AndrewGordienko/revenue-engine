import { db } from "./db.js";
import { getLead, sendEligibility } from "./crm-model.js";
import { approveCohort, getCohort } from "./lineage.js";
import { GmailProvider } from "./google-workspace.js";
import { recordRevenueEvent } from "./revenue-events.js";
import { assertSendingUnsupported } from "./outbound-guard.js";

const now = () => new Date().toISOString();

export function queueOutreachMessage({ lead_id, touch_number, recipient, subject, body, scheduled_at = null, message_type = "sequence_touch", review_status = null, evidence = [] }, database = db()) {
  const lead = getLead(database, lead_id);
  if (!lead) throw new Error(`no such lead: ${lead_id}`);
  if (!recipient || !subject || !body) throw new Error("queued outreach requires recipient, subject, and body");
  if (message_type === "sequence_touch" && !Number.isInteger(Number(touch_number))) throw new Error("sequence touch requires touch_number");
  const t = now();
  const info = database.prepare(`INSERT INTO outreach_messages
    (lead_id,cohort_id,pipeline_run_id,strategy_version,message_type,touch_number,recipient,subject,body,review_status,evidence,scheduled_at,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'pending_approval',?,?)
    ON CONFLICT(lead_id,message_type,touch_number) DO UPDATE SET recipient=excluded.recipient,subject=excluded.subject,body=excluded.body,review_status=excluded.review_status,evidence=excluded.evidence,scheduled_at=excluded.scheduled_at,status='pending_approval',approved_at=NULL,approved_by=NULL,rejected_at=NULL,rejection_reason=NULL,updated_at=excluded.updated_at
    RETURNING id`).get(lead.id, lead.cohort_id, lead.pipeline_run_id, lead.strategy_version, message_type, touch_number == null ? null : Number(touch_number), recipient, subject, body, review_status, JSON.stringify(evidence || []), scheduled_at, t, t);
  return getOutreachMessage(database, Number(info.id));
}

export function approveOutreachMessage(id, { approved_by = "operator" } = {}, database = db()) {
  const message = getOutreachMessage(database, id);
  if (!message) throw new Error(`unknown outreach message: ${id}`);
  if (message.status !== "pending_approval") throw new Error(`message ${id} is ${message.status}, not pending_approval`);
  if (message.message_type === "sequence_touch" && message.review_status !== "ready") throw new Error("sequence must pass reviewer grounding/risk controls before approval");
  const cohort = getCohort(database, message.cohort_id);
  if (cohort?.status !== "approved") throw new Error(`cohort ${message.cohort_id} must be approved before message approval`);
  const lead = getLead(database, message.lead_id);
  if (lead.cohort_id !== message.cohort_id || lead.strategy_version !== message.strategy_version) throw new Error("message lineage no longer matches its lead");
  if (message.recipient.toLowerCase() !== String(lead.email_best || "").toLowerCase()) throw new Error("message recipient must match the canonical verified contact");
  const eligibility = sendEligibility(database, lead, { allow_active_sequence: Number(message.touch_number) > 1 });
  if (!eligibility.ok) throw new Error(`message cannot be approved: ${eligibility.blocked.join(", ")}`);
  database.prepare("UPDATE outreach_messages SET status='approved',approved_at=?,approved_by=?,updated_at=? WHERE id=?").run(now(), approved_by, now(), id);
  return getOutreachMessage(database, id);
}

export function rejectOutreachMessage(id, { reason, rejected_by = "operator" } = {}, database = db()) {
  if (!reason) throw new Error("rejection requires a reason");
  database.prepare("UPDATE outreach_messages SET status='rejected',rejected_at=?,rejection_reason=?,approved_by=?,updated_at=? WHERE id=? AND status='pending_approval'")
    .run(now(), reason, rejected_by, now(), id);
  return getOutreachMessage(database, id);
}

export async function createProviderDraft(id, provider = new GmailProvider(), database = db()) {
  const message = getOutreachMessage(database, id);
  if (!message) throw new Error(`unknown outreach message: ${id}`);
  if (message.status !== "approved") throw new Error(`message ${id} must be approved before provider draft creation`);
  const draft = await provider.createDraft(message);
  database.prepare(`UPDATE outreach_messages SET status='provider_draft',provider='gmail',provider_draft_id=?,provider_message_id=?,provider_thread_id=?,updated_at=? WHERE id=?`)
    .run(draft.draft_id, draft.message_id || null, draft.thread_id || null, now(), id);
  return getOutreachMessage(database, id);
}

export async function sendApprovedDraft(id, provider = new GmailProvider(), { confirmed = false } = {}, database = db()) {
  // Sending is not implemented in this build; this throws unconditionally. The
  // function is retained (unreachable from the API) so the guarantee is tested.
  assertSendingUnsupported("sendApprovedDraft");
  if (!confirmed) throw new Error("sending requires explicit human confirmation");
  const message = getOutreachMessage(database, id);
  if (!message || message.status !== "provider_draft") throw new Error("message must have an approved provider draft");
  const sent = await provider.sendDraft(message.provider_draft_id);
  return recordRevenueEvent({ lead_id: message.lead_id, type: "sent", occurred_at: sent.sent_at, source: "gmail-sync", dedupe_key: `gmail:sent:${sent.message_id}`, payload: { outreach_message_id: id, provider_message_id: sent.message_id, provider_thread_id: sent.thread_id, subject: message.subject } }, database);
}

export async function syncGmail(provider = new GmailProvider(), database = db()) {
  const tracked = database.prepare("SELECT * FROM outreach_messages WHERE provider='gmail' AND provider_thread_id IS NOT NULL AND status IN ('provider_draft','sent')").all();
  const results = [];
  for (const message of tracked) {
    const thread = await provider.getThread(message.provider_thread_id);
    for (const item of thread) {
      try {
        if (item.labels.includes("SENT") && message.status === "provider_draft") {
          results.push(await recordRevenueEvent({ lead_id: message.lead_id, type: "sent", occurred_at: item.occurred_at, source: "gmail-sync", dedupe_key: `gmail:sent:${item.id}`, payload: { outreach_message_id: message.id, provider_message_id: item.id, provider_thread_id: item.thread_id, subject: item.subject || message.subject } }, database));
        } else if (item.labels.includes("INBOX") && item.body) {
          results.push(await recordRevenueEvent({ lead_id: message.lead_id, type: "reply", occurred_at: item.occurred_at, source: "gmail-sync", dedupe_key: `gmail:reply:${item.id}`, payload: { outreach_message_id: message.id, provider_message_id: item.id, provider_thread_id: item.thread_id, subject: item.subject || message.subject, body: item.body, from: item.from } }, database));
        }
      } catch (error) {
        if (!/UNIQUE|constraint/i.test(error.message)) throw error;
      }
    }
  }
  return { tracked_threads: tracked.length, events_recorded: results.length };
}

export function listOutreachMessages({ product = null, status = null, lead_id = null } = {}, database = db()) {
  const clauses = [], params = [];
  if (product) { clauses.push("l.product=?"); params.push(product); }
  if (status) { clauses.push("m.status=?"); params.push(status); }
  if (lead_id) { clauses.push("m.lead_id=?"); params.push(lead_id); }
  return database.prepare(`SELECT m.*,l.product,l.company,l.name,l.title,c.status cohort_status,c.play_id FROM outreach_messages m JOIN leads l ON l.id=m.lead_id JOIN cohorts c ON c.cohort_id=m.cohort_id ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY m.created_at DESC`).all(...params);
}

export function listCohorts(product = null, database = db()) {
  const rows = product ? database.prepare("SELECT * FROM cohorts WHERE product=? ORDER BY created_at DESC").all(product) : database.prepare("SELECT * FROM cohorts ORDER BY created_at DESC").all();
  return rows.map((row) => ({ ...row, rules: row.rules ? JSON.parse(row.rules) : null }));
}

export function approveOutreachCohort(cohortId, options = {}, database = db()) {
  return approveCohort(database, cohortId, options);
}

function getOutreachMessage(database, id) {
  return database.prepare("SELECT * FROM outreach_messages WHERE id=?").get(id);
}
