// linkedin-events.js — the canonical LinkedIn event layer that drives the motion state
// machine and the founder's ONE next action. These are MANUAL records of what happened
// on LinkedIn; nothing here sends anything.
//
// Record-send:  approved draft --Mark sent--> immutable linkedin_message_sent event,
//   motion approved->contacted, last_touch_at stamped, next follow-up scheduled per the
//   play cadence. Exactly one state transition per send; idempotent per draft.
// Paste-reply:  inbound text --Log reply--> must follow a send in the SAME motion,
//   motion contacted->replied, future drafts stopped, ONE respond action created. The
//   reply body is stored in the erasable table; the immutable event holds only a ref.
//
// LinkedIn manual sends deliberately bypass crm-model's email-era EVENT_RULES (deliverable
// email / route_ready). The funnel state of record is active_motions.status.
import { db } from "./db.js";
import { getMotion, advanceMotion, touchMotion, getOpenMotionForLead } from "./active-motions.js";
import { getDraft, markDraftSent, stopDraftsForMotion } from "./linkedin-drafts.js";
import { SEQUENCE_POLICIES } from "./sales-plays.js";

const now = () => new Date().toISOString();
const addDays = (iso, days) => new Date(new Date(iso).getTime() + days * 864e5).toISOString();
const policyFor = (venture) => SEQUENCE_POLICIES[venture] || SEQUENCE_POLICIES.gnk;

export const LINKEDIN_EVENT_TYPES = [
  "linkedin_message_sent", "linkedin_reply_received", "meeting_confirmed",
  "qualification_confirmed", "proposal_reviewed", "contract_signed", "payment_recorded",
];

const ACTION_PRIORITY = {
  respond_to_reply: 120, confirm_meeting: 110, prepare_call: 100,
  send_next_touch: 60, decide_next_step: 50,
};

function insertEvent(database, { lead_id, type, occurred_at, cohort_id, pipeline_run_id, payload, dedupe_key }) {
  database.prepare(`INSERT INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
    VALUES(?,?,?,?,?,?,'manual_linkedin',?,?)`)
    .run(lead_id, type, occurred_at || now(), now(), cohort_id || null, pipeline_run_id || null,
      JSON.stringify(payload || {}), dedupe_key || null);
}

// Upsert the SINGLE open next action for a motion (one open action per motion entity).
function setMotionNextAction(database, motion, { action_type, due_at, reason, source }) {
  const t = now();
  const existing = database.prepare("SELECT id FROM next_actions WHERE entity_type='motion' AND entity_id=? AND status='open'").get(String(motion.id));
  let actionId;
  if (existing) {
    database.prepare("UPDATE next_actions SET action_type=?,due_at=?,reason=?,priority=?,active_motion_id=?,source=?,updated_at=? WHERE id=?")
      .run(action_type, due_at, reason, ACTION_PRIORITY[action_type] || 50, motion.id, source, t, existing.id);
    actionId = existing.id;
  } else {
    const info = database.prepare(`INSERT INTO next_actions
      (entity_type,entity_id,action_type,due_at,owner,status,priority,reason,source_key,active_motion_id,source,created_at,updated_at)
      VALUES('motion',?,?,?,?, 'open', ?,?,?,?,?,?,?) RETURNING id`)
      .get(String(motion.id), action_type, due_at, motion.owner, ACTION_PRIORITY[action_type] || 50,
        reason, `motion:${motion.id}:${action_type}:${t}`, motion.id, source, t, t);
    actionId = Number(info.id);
  }
  database.prepare("UPDATE active_motions SET next_action_id=?, updated_at=? WHERE id=?").run(actionId, t, motion.id);
  return actionId;
}

// Mark an approved draft as sent. Idempotent per draft. Advances the motion once and
// schedules the next touch (or a decide-next-step when the sequence is exhausted).
export function recordSend(database, { draft_id, occurred_at = null, recorded_by = "andrew" } = {}) {
  const draft = getDraft(database, draft_id);
  if (!draft) throw new Error(`recordSend: unknown draft ${draft_id}`);
  const motion = getMotion(database, draft.motion_id);
  if (!motion) throw new Error(`recordSend: draft ${draft_id} has no motion`);
  if (draft.sent_at) {
    // Already recorded — return the current state without a second event/transition.
    return { draft_id: draft.id, motion_id: motion.id, motion_status: motion.status, already_sent: true, next_action_id: motion.next_action_id };
  }
  if (motion.closed_at) throw new Error(`recordSend: motion ${motion.id} is closed (${motion.status})`);
  if (draft.review_status !== "approved") throw new Error(`recordSend: draft ${draft_id} must be approved before it is sent`);

  const at = occurred_at || now();
  markDraftSent(database, draft.id, { at });
  insertEvent(database, {
    lead_id: motion.lead_id, type: "linkedin_message_sent", occurred_at: at,
    cohort_id: motion.cohort_id, payload: { motion_id: motion.id, draft_id: draft.id, touch_number: draft.touch_number, linkedin_profile_url: draft.linkedin_profile_url, recorded_by },
    dedupe_key: `li_sent:${draft.id}`,
  });
  // Exactly one transition: the first send moves approved -> contacted; later touches
  // leave an already-contacted motion where it is.
  if (motion.status === "approved") advanceMotion(database, motion.id, "contacted");
  touchMotion(database, motion.id, at);

  const policy = policyFor(motion.venture);
  const nextTouch = draft.touch_number + 1;
  let actionId;
  if (nextTouch <= policy.send_days.length) {
    const gap = policy.send_days[nextTouch - 1] - policy.send_days[draft.touch_number - 1];
    actionId = setMotionNextAction(database, getMotion(database, motion.id), {
      action_type: "send_next_touch", due_at: addDays(at, gap),
      reason: `Send touch ${nextTouch} of ${policy.send_days.length} (${policy.motion.split(",")[0]})`, source: "deliberate_outreach",
    });
  } else {
    actionId = setMotionNextAction(database, getMotion(database, motion.id), {
      action_type: "decide_next_step", due_at: addDays(at, 7),
      reason: "Sequence complete — route, nurture, or close.", source: "promise",
    });
  }
  return { draft_id: draft.id, motion_id: motion.id, motion_status: "contacted", next_action_id: actionId, event: "linkedin_message_sent" };
}

// Log an inbound reply. Must follow a send on the SAME motion to be attributable.
export function pasteReply(database, { motion_id = null, lead_id = null, text, sentiment = "neutral", occurred_at = null, recorded_by = "andrew" } = {}) {
  if (!text || !String(text).trim()) throw new Error("pasteReply: reply text is required");
  const motion = motion_id ? getMotion(database, motion_id) : (lead_id ? getOpenMotionForLead(database, lead_id) : null);
  if (!motion) throw new Error("pasteReply: no open motion (pass motion_id or a lead_id with an open motion)");
  if (motion.closed_at) throw new Error(`pasteReply: motion ${motion.id} is closed`);
  const sentCount = database.prepare("SELECT COUNT(*) c FROM outreach_drafts_v2 WHERE motion_id=? AND sent_at IS NOT NULL").get(motion.id).c;
  if (!sentCount) throw new Error(`pasteReply: reply cannot be attributed — no prior send on motion ${motion.id}`);

  const at = occurred_at || now();
  const t = now();
  const body = database.prepare("INSERT INTO erasable_message_bodies(motion_id,lead_id,direction,body,sentiment,created_at) VALUES(?,?,'inbound',?,?,?) RETURNING id")
    .get(motion.id, motion.lead_id, String(text), sentiment, t);
  const bodyRef = Number(body.id);
  insertEvent(database, {
    lead_id: motion.lead_id, type: "linkedin_reply_received", occurred_at: at,
    cohort_id: motion.cohort_id, payload: { motion_id: motion.id, body_ref: bodyRef, sentiment, recorded_by },
  });
  if (motion.status === "contacted") advanceMotion(database, motion.id, "replied");
  const stopped = stopDraftsForMotion(database, motion.id, { reason: "reply_received" });
  const actionId = setMotionNextAction(database, getMotion(database, motion.id), {
    action_type: "respond_to_reply", due_at: at,
    reason: `Reply received (${sentiment}) — respond within SLA.`, source: "reply",
  });
  return { motion_id: motion.id, motion_status: getMotion(database, motion.id).status, body_ref: bodyRef, stopped_drafts: stopped, next_action_id: actionId };
}

// Generic mid-funnel confirmation event (meeting/qualification/proposal/sign). Writes the
// immutable event and advances the motion to the mapped status. Contract/booked-revenue
// records for contract_signed are layered on in the commercial-offers work (#11).
const EVENT_TO_STATUS = {
  meeting_confirmed: "meeting_confirmed",
  qualification_confirmed: "qualified",
  proposal_reviewed: "proposal_review",
  contract_signed: "signed",
};
export function recordMotionEvent(database, { motion_id, type, payload = {}, occurred_at = null, recorded_by = "andrew" } = {}) {
  if (!LINKEDIN_EVENT_TYPES.includes(type)) throw new Error(`recordMotionEvent: unknown type ${type}`);
  const motion = getMotion(database, motion_id);
  if (!motion) throw new Error(`recordMotionEvent: unknown motion ${motion_id}`);
  if (motion.closed_at) throw new Error(`recordMotionEvent: motion ${motion_id} is closed`);
  const at = occurred_at || now();
  insertEvent(database, { lead_id: motion.lead_id, type, occurred_at: at, cohort_id: motion.cohort_id, payload: { ...payload, motion_id: motion.id, recorded_by } });
  const target = EVENT_TO_STATUS[type];
  if (target && motion.status !== target) advanceMotion(database, motion.id, target);
  return getMotion(database, motion.id);
}

// Privacy: delete a stored (erasable) message body. The immutable event survives.
export function eraseMessageBody(database, id) {
  return database.prepare("DELETE FROM erasable_message_bodies WHERE id=?").run(Number(id)).changes;
}
