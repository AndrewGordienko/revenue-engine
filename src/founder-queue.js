// founder-queue.js — the backend for the Today screen. Today is ACTIVE-MOTION-SCOPED and
// HARD-CAPPED at 15. The historical archive (next_actions with no active_motion_id) can
// never appear here — it lives in Backlog/Archive. Every scorecard metric declares its
// window, denominator, cohort, and whether it is human-confirmed.
import { db } from "./db.js";

export const TODAY_CAP = 15;
const DAY = 864e5;

// Ordering zones (lower = higher in Today): replies first, then call prep / promised,
// then proposals/contracts, then due follow-ups, then approved-but-unsent drafts.
const ZONE = {
  respond_to_reply: 1,
  confirm_meeting: 2, prepare_call: 2,
  proposal_review: 3, proposal_sent: 3, contract: 3,
  send_next_touch: 4, decide_next_step: 4,
};
const zoneForAction = (t) => ZONE[t] || 4;

function startOfWindow(ref, window) {
  if (window === "30d") return new Date(ref.getTime() - 30 * DAY);
  // default: current week starting Monday 00:00 local
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - dow * DAY);
}

// Build the capped, ordered Today queue for a venture (or all ventures if null).
export function buildTodayQueue(database = db(), { venture = null, now = null, cap = TODAY_CAP } = {}) {
  const ref = now ? new Date(now) : new Date();
  const upper = new Date(ref.getTime() + DAY).toISOString(); // through end of today
  const lower = new Date(ref.getTime() - 3 * DAY).toISOString(); // admission window [today-3d, today]
  const vArgs = venture ? [venture] : [];

  const actionRows = database.prepare(`
    SELECT n.id action_id, n.action_type, n.due_at, n.priority, n.reason, n.source,
           m.id motion_id, m.venture, m.play_id, m.status motion_status, m.motion_type,
           l.id lead_id, l.name, l.company, l.title, l.linkedin_url
    FROM next_actions n
    JOIN active_motions m ON m.id = n.active_motion_id
    JOIN leads l ON l.id = m.lead_id
    WHERE n.status='open' AND n.active_motion_id IS NOT NULL AND m.closed_at IS NULL
      ${venture ? "AND m.venture=?" : ""}`).all(...vArgs);

  const actionItems = actionRows
    .filter((r) => r.due_at && r.due_at >= lower && r.due_at <= upper)
    .map((r) => ({
      kind: "action", action_id: r.action_id, action_type: r.action_type, zone: zoneForAction(r.action_type),
      motion_id: r.motion_id, venture: r.venture, motion_type: r.motion_type, play_id: r.play_id,
      lead_id: r.lead_id, person: r.name, title: r.title, company: r.company, linkedin_url: r.linkedin_url,
      due_at: r.due_at, priority: r.priority, context_line: r.reason || r.action_type,
    }));

  // Approved-but-unsent drafts are always admitted (the founder committed to send them).
  const draftRows = database.prepare(`
    SELECT d.id draft_id, COALESCE(d.approved_body, d.body) text, d.linkedin_profile_url, d.touch_number, d.message_kind,
           m.id motion_id, m.venture, m.play_id, m.motion_type, l.id lead_id, l.name, l.company, l.title
    FROM outreach_drafts_v2 d
    JOIN active_motions m ON m.id = d.motion_id
    JOIN leads l ON l.id = m.lead_id
    WHERE d.review_status='approved' AND d.sent_at IS NULL AND d.stopped_at IS NULL AND m.closed_at IS NULL
      ${venture ? "AND m.venture=?" : ""}`).all(...vArgs);

  const draftItems = draftRows.map((r) => ({
    kind: "draft", draft_id: r.draft_id, action_type: "send_approved_draft", zone: 5,
    motion_id: r.motion_id, venture: r.venture, motion_type: r.motion_type, play_id: r.play_id,
    lead_id: r.lead_id, person: r.name, title: r.title, company: r.company, linkedin_url: r.linkedin_profile_url,
    draft_text: r.text, touch_number: r.touch_number, context_line: "Approved draft ready to copy and send.",
  }));

  const all = [...actionItems, ...draftItems].sort((a, b) =>
    a.zone - b.zone || String(a.due_at || "9999") .localeCompare(String(b.due_at || "9999")) || (b.priority || 0) - (a.priority || 0));

  return { venture: venture || "all", cap, admitted: all.length, overflow: Math.max(0, all.length - cap), items: all.slice(0, cap) };
}

// Four honest headline counts, each carrying its window/denominator/cohort/confirmation.
export function buildScorecard(database = db(), { venture = null, now = null, window = "week" } = {}) {
  const ref = now ? new Date(now) : new Date();
  const start = startOfWindow(ref, window).toISOString();
  const end = ref.toISOString();
  const vArgs = venture ? [venture] : [];
  const count = (type) => database.prepare(`SELECT COUNT(*) c FROM activity_events e JOIN leads l ON l.id=e.lead_id
    WHERE e.type=? AND e.occurred_at>=? AND e.occurred_at<=? ${venture ? "AND l.product=?" : ""}`).get(type, start, end, ...vArgs).c;
  const uniq = (type) => database.prepare(`SELECT COUNT(DISTINCT e.lead_id) c FROM activity_events e JOIN leads l ON l.id=e.lead_id
    WHERE e.type=? AND e.occurred_at>=? AND e.occurred_at<=? ${venture ? "AND l.product=?" : ""}`).get(type, start, end, ...vArgs).c;

  const sends = count("linkedin_message_sent");
  const uniqueContacted = uniq("linkedin_message_sent");
  const replies = count("linkedin_reply_received");
  const calls = count("meeting_confirmed");
  const proposals = count("proposal_reviewed");
  const win = { start, end, label: window === "30d" ? "last 30 days" : "current week (Mon–today)" };
  const metric = (value, denominator, denom_of) => ({ value, window: win, denominator, denominator_of: denom_of, cohort: "active motions", confirmed: true });
  return {
    venture: venture || "all",
    sends: metric(sends, uniqueContacted, "unique leads contacted"),
    replies: metric(replies, sends, "sends"),
    calls: metric(calls, replies, "replies"),
    proposals: metric(proposals, calls, "calls"),
  };
}

// Snooze / skip / complete a next action from Today. Snooze offers only three options.
function snoozeDue(fromIso, until) {
  const d = new Date(fromIso);
  if (until === "+3d") return new Date(d.getTime() + 3 * DAY).toISOString();
  if (until === "next_monday") { const dow = (d.getDay() + 6) % 7; const toMon = (7 - dow) % 7 || 7; return new Date(d.getTime() + toMon * DAY).toISOString(); }
  return new Date(d.getTime() + DAY).toISOString(); // "tomorrow" (default)
}
export function updateAction(database, id, op, { reason = null, until = null } = {}) {
  const action = database.prepare("SELECT * FROM next_actions WHERE id=?").get(Number(id));
  if (!action) throw new Error(`updateAction: unknown action ${id}`);
  const t = new Date().toISOString();
  if (op === "skip") {
    if (!reason) throw new Error("skip requires a reason");
    database.prepare("UPDATE next_actions SET status='cancelled', reason=?, updated_at=? WHERE id=?").run(reason, t, Number(id));
  } else if (op === "complete") {
    database.prepare("UPDATE next_actions SET status='completed', completed_at=?, updated_at=? WHERE id=?").run(t, t, Number(id));
  } else if (op === "snooze") {
    database.prepare("UPDATE next_actions SET due_at=?, updated_at=? WHERE id=?").run(snoozeDue(t, until), t, Number(id));
  } else throw new Error(`updateAction: unknown op ${op}`);
  return database.prepare("SELECT * FROM next_actions WHERE id=?").get(Number(id));
}

// Off-Today buckets. Historical actions (no active_motion_id) are Archive — never Today.
export function buildBuckets(database = db(), { venture = null } = {}) {
  const vJoin = venture ? "AND m.venture=?" : "";
  const vArgs = venture ? [venture] : [];
  const inbox = database.prepare(`SELECT COUNT(*) c FROM next_actions n JOIN active_motions m ON m.id=n.active_motion_id
    WHERE n.status='open' AND n.action_type='respond_to_reply' AND m.closed_at IS NULL ${vJoin}`).get(...vArgs).c;
  const backlog = database.prepare(`SELECT COUNT(*) c FROM next_actions n JOIN active_motions m ON m.id=n.active_motion_id
    WHERE n.status='open' AND n.action_type!='respond_to_reply' AND m.closed_at IS NULL ${vJoin}`).get(...vArgs).c;
  const watchlist = database.prepare(`SELECT COUNT(*) c FROM active_motions m WHERE m.status='nurture' AND m.closed_at IS NULL ${vJoin}`).get(...vArgs).c;
  // Archive = the historical operating-loop actions that carry no motion. Never Today.
  const archive = database.prepare("SELECT COUNT(*) c FROM next_actions WHERE status='open' AND active_motion_id IS NULL").get().c;
  return { venture: venture || "all", inbox, backlog, watchlist, archive };
}
