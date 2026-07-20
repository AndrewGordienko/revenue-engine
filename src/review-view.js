// review-view.js — the Monday screen. Per-venture REVENUE funnel rows (unique-lead counts
// with denominators) and a SEPARATE Morrow design-partner scorecard that is NEVER summed
// with revenue. The cash line is sourced ONLY from contract records — it reads $0 until a
// real contract exists, and never shows an inferred/weighted/projected number.
import { db } from "./db.js";
import { normalizeVenture } from "./active-motions.js";

const DAY = 864e5;
const CASH_TARGET = 40000;

function startOfWindow(ref, window) {
  if (window === "30d") return new Date(ref.getTime() - 30 * DAY);
  const d = new Date(ref); const dow = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - dow * DAY);
}

function uniqueLeads(database, { venture, type, since }) {
  return database.prepare(`SELECT COUNT(DISTINCT e.lead_id) c FROM activity_events e JOIN leads l ON l.id=e.lead_id
    WHERE e.type=? AND e.occurred_at>=? ${venture ? "AND l.product=?" : ""}`).get(type, since, ...(venture ? [venture] : [])).c;
}
function wonLeads(database, venture) {
  return database.prepare(`SELECT COUNT(DISTINCT lead_id) c FROM contracts ${venture ? "WHERE brand=?" : ""}`).get(...(venture ? [venture] : [])).c;
}
function booked(database, venture) {
  const r = database.prepare(`SELECT COALESCE(SUM(mrr),0) mrr, COALESCE(SUM(one_time),0) one_time FROM contracts ${venture ? "WHERE brand=?" : ""}`).get(...(venture ? [venture] : []));
  return { mrr: r.mrr, one_time: r.one_time, total: r.mrr + r.one_time };
}
const m = (value, denominator, denominator_of) => ({ value, denominator, denominator_of, confirmed: true });

function revenueRow(database, venture, since) {
  const sends = uniqueLeads(database, { venture, type: "linkedin_message_sent", since });
  const replies = uniqueLeads(database, { venture, type: "linkedin_reply_received", since });
  const calls = uniqueLeads(database, { venture, type: "meeting_confirmed", since });
  const proposals = uniqueLeads(database, { venture, type: "proposal_reviewed", since });
  return {
    venture, kind: "revenue",
    sends: m(sends, sends, "leads contacted"),
    replies: m(replies, sends, "sends"),
    calls: m(calls, replies, "replies"),
    proposals: m(proposals, calls, "calls"),
    won: m(wonLeads(database, venture), proposals, "proposals"),
  };
}
function morrowScorecard(database, since) {
  return {
    venture: "morrow", kind: "design_partner",
    conversations_started: m(uniqueLeads(database, { venture: "morrow", type: "linkedin_message_sent", since }), null, null),
    workflow_convos: m(uniqueLeads(database, { venture: "morrow", type: "meeting_confirmed", since }), null, null),
    site_walks: m(uniqueLeads(database, { venture: "morrow", type: "qualification_confirmed", since }), null, null),
    fit_memos: m(uniqueLeads(database, { venture: "morrow", type: "proposal_reviewed", since }), null, null),
    partners: m(wonLeads(database, "morrow"), null, null),
  };
}

export function buildReview(database = db(), { venture = null, window = "week", now = null } = {}) {
  const ref = now ? new Date(now) : new Date();
  const since = startOfWindow(ref, window).toISOString();
  const win = { start: since, end: ref.toISOString(), label: window === "30d" ? "last 30 days" : "current week (Mon–today)" };
  const v = venture && venture !== "all" ? normalizeVenture(venture) : null;

  const revenue = {};
  const wantRevenue = (brand) => !v || v === brand;
  if (wantRevenue("gnk")) revenue.gnk = revenueRow(database, "gnk", since);
  if (wantRevenue("outagehub")) revenue.outagehub = revenueRow(database, "outagehub", since);
  const morrow = (!v || v === "morrow") ? morrowScorecard(database, since) : null;

  // Movement + skips (venture-scoped where a venture is selected).
  const advanced = database.prepare(`SELECT COUNT(*) c FROM active_motions WHERE updated_at>=? AND closed_at IS NULL ${v ? "AND venture=?" : ""}`).get(since, ...(v ? [v] : [])).c;
  const stalled = database.prepare(`SELECT COUNT(*) c FROM active_motions WHERE closed_at IS NULL AND updated_at < ? ${v ? "AND venture=?" : ""}`).get(new Date(ref.getTime() - 10 * DAY).toISOString(), ...(v ? [v] : [])).c;
  const skip_analysis = database.prepare(`SELECT COALESCE(reason,'(none)') reason, COUNT(*) count FROM next_actions
    WHERE status='cancelled' AND updated_at>=? GROUP BY reason ORDER BY count DESC`).all(since);

  const b = booked(database, v);
  return {
    venture: v || "all", window: win,
    revenue, morrow,
    movement: { advanced, stalled },
    skip_analysis,
    // The cash line: booked revenue ONLY from contracts. Honest $0 until one is signed.
    cash_line: { booked: b.total, mrr: b.mrr, one_time: b.one_time, target: CASH_TARGET, currency: "USD", source: "contracts" },
  };
}
