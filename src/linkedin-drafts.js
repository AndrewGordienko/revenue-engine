// linkedin-drafts.js — CRUD + approval for the ONE canonical LinkedIn draft object
// (outreach_drafts_v2). Every draft belongs to an open active motion. There is no
// email shape here: a draft carries a linkedin_profile_url, a body, and evidence.
//
// Lifecycle: pending --approve--> approved --(manual copy/send)--> copied_at/sent_at.
// A reply on the motion stops future pending/approved-unsent drafts. Sending itself is
// always manual — these functions only record what the founder did.
import { db } from "./db.js";
import { getLead } from "./crm-model.js";
import { getMotion } from "./active-motions.js";

const now = () => new Date().toISOString();
const KINDS = new Set(["connection_note", "direct_message", "follow_up", "reply"]);

export function getDraft(database, id) {
  return database.prepare("SELECT * FROM outreach_drafts_v2 WHERE id=?").get(Number(id)) || null;
}

// Queue (or re-queue) a LinkedIn draft for a motion+touch. Idempotent on
// (motion_id, touch_number): re-running the writer overwrites the body and resets the
// draft to pending. Fails closed if the motion is missing/closed or there is no
// LinkedIn profile URL (a LinkedIn motion requires a confirmed profile).
export function queueDraft(database, {
  motion_id,
  message_kind = "connection_note",
  touch_number = 1,
  body,
  evidence = [],
  writer_version = null,
  linkedin_profile_url = null,
  pipeline_run_id = null,
} = {}) {
  if (!KINDS.has(message_kind)) throw new Error(`queueDraft: invalid message_kind ${message_kind}`);
  if (!body || !String(body).trim()) throw new Error("queueDraft: body is required");
  if (!Number.isInteger(Number(touch_number))) throw new Error("queueDraft: touch_number must be an integer");

  const motion = getMotion(database, motion_id);
  if (!motion) throw new Error(`queueDraft: unknown motion ${motion_id}`);
  if (motion.closed_at) throw new Error(`queueDraft: motion ${motion_id} is closed (${motion.status})`);

  const lead = getLead(database, motion.lead_id);
  if (!lead) throw new Error(`queueDraft: motion ${motion_id} references missing lead ${motion.lead_id}`);
  const profile = linkedin_profile_url || lead.linkedin_url || null;
  if (!profile) throw new Error(`queueDraft: no LinkedIn profile URL for lead ${lead.id} (a LinkedIn motion requires one)`);

  const t = now();
  const info = database.prepare(`INSERT INTO outreach_drafts_v2
    (motion_id,lead_id,venture,cohort_id,pipeline_run_id,strategy_version,channel,message_kind,
     touch_number,linkedin_profile_url,body,evidence_json,writer_version,review_status,created_at,updated_at)
    VALUES(?,?,?,?,?,?, 'linkedin', ?,?,?,?,?,?, 'pending', ?,?)
    ON CONFLICT(motion_id,touch_number) DO UPDATE SET
      message_kind=excluded.message_kind, linkedin_profile_url=excluded.linkedin_profile_url,
      body=excluded.body, evidence_json=excluded.evidence_json, writer_version=excluded.writer_version,
      review_status='pending', approved_body=NULL, approved_at=NULL, approved_by=NULL,
      rejection_reason=NULL, updated_at=excluded.updated_at
    RETURNING id`)
    .get(motion.id, lead.id, motion.venture, motion.cohort_id, pipeline_run_id, motion.strategy_version,
      message_kind, Number(touch_number), profile, String(body), JSON.stringify(evidence || []), writer_version, t, t);
  return getDraft(database, Number(info.id));
}

export function listDrafts(database = db(), { venture = null, motion_id = null, review_status = null, lead_id = null, unsent = false } = {}) {
  const clauses = [];
  const args = [];
  if (venture) { clauses.push("venture=?"); args.push(venture); }
  if (motion_id) { clauses.push("motion_id=?"); args.push(Number(motion_id)); }
  if (review_status) { clauses.push("review_status=?"); args.push(review_status); }
  if (lead_id) { clauses.push("lead_id=?"); args.push(lead_id); }
  if (unsent) clauses.push("sent_at IS NULL AND stopped_at IS NULL");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return database.prepare(`SELECT * FROM outreach_drafts_v2 ${where} ORDER BY created_at DESC`).all(...args);
}

// Inline edit. While pending, edits update the body; once approved, edits update the
// approved_body (the exact text the founder will paste). Never touches a sent draft.
export function editDraft(database, id, { body }) {
  const d = getDraft(database, id);
  if (!d) throw new Error(`editDraft: unknown draft ${id}`);
  if (d.sent_at) throw new Error(`editDraft: draft ${id} was already sent`);
  if (!body || !String(body).trim()) throw new Error("editDraft: body is required");
  const t = now();
  if (d.review_status === "approved") database.prepare("UPDATE outreach_drafts_v2 SET approved_body=?, updated_at=? WHERE id=?").run(String(body), t, Number(id));
  else database.prepare("UPDATE outreach_drafts_v2 SET body=?, updated_at=? WHERE id=?").run(String(body), t, Number(id));
  return getDraft(database, id);
}

// Approve a pending draft. approved_body defaults to the current body. The motion must
// still be open (you cannot approve a draft for a closed relationship).
export function approveDraft(database, id, { approved_by = "Andrew", approved_body = null } = {}) {
  const d = getDraft(database, id);
  if (!d) throw new Error(`approveDraft: unknown draft ${id}`);
  if (d.review_status !== "pending") throw new Error(`approveDraft: draft ${id} is ${d.review_status}, not pending`);
  const motion = getMotion(database, d.motion_id);
  if (!motion || motion.closed_at) throw new Error(`approveDraft: motion ${d.motion_id} is not open`);
  const t = now();
  database.prepare("UPDATE outreach_drafts_v2 SET review_status='approved', approved_body=?, approved_at=?, approved_by=?, updated_at=? WHERE id=?")
    .run(approved_body || d.body, t, approved_by, t, Number(id));
  return getDraft(database, id);
}

export function rejectDraft(database, id, { reason, rejected_by = "Andrew" } = {}) {
  if (!reason) throw new Error("rejectDraft: a reason is required");
  const d = getDraft(database, id);
  if (!d) throw new Error(`rejectDraft: unknown draft ${id}`);
  if (d.review_status === "rejected") return d;
  const t = now();
  database.prepare("UPDATE outreach_drafts_v2 SET review_status='rejected', rejection_reason=?, approved_by=?, updated_at=? WHERE id=?")
    .run(String(reason), rejected_by, t, Number(id));
  return getDraft(database, id);
}

// "Copy draft" — records that the founder copied the text. Deliberately does NOT change
// any lead/motion state (per the UI spec: copying is not sending).
export function markDraftCopied(database, id) {
  const d = getDraft(database, id);
  if (!d) throw new Error(`markDraftCopied: unknown draft ${id}`);
  const t = now();
  database.prepare("UPDATE outreach_drafts_v2 SET copied_at=?, updated_at=? WHERE id=?").run(t, t, Number(id));
  return getDraft(database, id);
}

// Stamp the draft as sent. Idempotent. The motion-advancing + activity-event side of
// "Mark sent" lives in the events layer (record-send); this only marks the draft row.
export function markDraftSent(database, id, { at = null } = {}) {
  const d = getDraft(database, id);
  if (!d) throw new Error(`markDraftSent: unknown draft ${id}`);
  if (d.review_status !== "approved") throw new Error(`markDraftSent: draft ${id} must be approved before it can be sent`);
  if (d.sent_at) return d;
  const t = at || now();
  database.prepare("UPDATE outreach_drafts_v2 SET sent_at=?, updated_at=? WHERE id=?").run(t, t, Number(id));
  return getDraft(database, id);
}

// A reply arrived — stop every future pending/approved-but-unsent draft on the motion.
export function stopDraftsForMotion(database, motionId, { reason = "reply_received" } = {}) {
  const t = now();
  const info = database.prepare(`UPDATE outreach_drafts_v2 SET stopped_at=?, stopped_reason=?, updated_at=?
    WHERE motion_id=? AND sent_at IS NULL AND stopped_at IS NULL`).run(t, reason, t, Number(motionId));
  return info.changes;
}
