// active-motions.js — the first-class unit of the three-venture operating loop.
//
// A motion binds ONE relationship (lead) at ONE account to exactly one (venture, play,
// cohort, owner) inside an explicit open/expiry window, and carries the SALES STATE
// MACHINE. Relationship history is evidence, not work: the historical archive never
// gets a motion, so it can never manufacture open work in "Today".
//
// Channel is LinkedIn only. A motion is OPEN while closed_at IS NULL.
//
// Invariants (all FAIL CLOSED — a bad call throws, it never silently coerces):
//   1. venture ∈ {gnk, outagehub, morrow}                       (also a DB CHECK)
//   2. at most one OPEN motion per lead                         (also a DB partial index)
//   3. at most one OPEN motion per (account_key, venture, play) (also a DB partial index)
//   4. the play belongs to the venture                          (PLAYS_BY_BRAND)
//   5. the play matches the lead's play_id, if the lead has one
//   6. the play matches the cohort's locked play, if a cohort is given
//   7. the cohort's product equals the venture, if a cohort is given
//   8. status only moves along ALLOWED_TRANSITIONS; only real events should advance it
import { db } from "./db.js";
import { getLead } from "./crm-model.js";
import { getCohort, normalizeProduct } from "./lineage.js";
import { PLAYS_BY_ID, PLAYS_BY_BRAND, STRATEGY_VERSION } from "./sales-plays.js";

const now = () => new Date().toISOString();
const MOTION_TYPES = new Set(["revenue", "design_partner"]);

// The sales state machine. Openness is tracked by closed_at, but these two statuses
// are the ones that force closure when entered.
const CLOSED_STATUSES = new Set(["closed_no_fit", "suppressed"]);
// A motion may only be OPENED into one of these early states.
const OPENABLE_STATUSES = new Set(["candidate", "evidence_ready", "approved"]);

const ALLOWED_TRANSITIONS = {
  candidate: ["evidence_ready", "approved", "nurture", "closed_no_fit", "suppressed"],
  evidence_ready: ["approved", "nurture", "closed_no_fit", "suppressed"],
  approved: ["contacted", "nurture", "closed_no_fit", "suppressed"],
  contacted: ["replied", "nurture", "closed_no_fit", "suppressed"],
  replied: ["meeting_confirmed", "qualified", "contacted", "nurture", "closed_no_fit", "suppressed"],
  meeting_confirmed: ["qualified", "nurture", "closed_no_fit", "suppressed"],
  qualified: ["proposal_review", "nurture", "closed_no_fit", "suppressed"],
  proposal_review: ["signed", "nurture", "closed_no_fit", "suppressed"],
  signed: ["active_delivery", "closed_no_fit"],
  active_delivery: ["closed_no_fit"],
  nurture: ["approved", "contacted", "evidence_ready", "closed_no_fit", "suppressed"],
  closed_no_fit: [],
  suppressed: [],
};

// Venture is the normalized, lowercase product. Reject anything we can't place —
// callers must be explicit, never let a typo fall through to gnk.
export function normalizeVenture(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "ohub" || v === "outagehub") return "outagehub";
  if (v === "morrow") return "morrow";
  if (v === "gnk") return "gnk";
  throw new Error(`unknown venture: ${JSON.stringify(value)} (expected gnk | outagehub | morrow)`);
}

// One stable company identity per account. Prefer the verified domain; fall back to a
// slug of the company name so two leads at the same firm collide on the same account.
export function accountKey(lead) {
  const domain = String(lead.company_domain || "").toLowerCase().trim();
  if (domain) return domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const company = String(lead.company || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (company) return `name:${company}`;
  throw new Error(`accountKey: lead ${lead.id} has neither company_domain nor company`);
}

export function getMotion(database, id) {
  return database.prepare("SELECT * FROM active_motions WHERE id=?").get(Number(id)) || null;
}

// The single open motion for a lead (openness = not closed), or null.
export function getOpenMotionForLead(database, leadId) {
  return database.prepare("SELECT * FROM active_motions WHERE lead_id=? AND closed_at IS NULL").get(leadId) || null;
}

export function getOpenMotionForAccountPlay(database, { account_key, venture, play_id }) {
  return database.prepare("SELECT * FROM active_motions WHERE account_key=? AND venture=? AND play_id=? AND closed_at IS NULL")
    .get(account_key, normalizeVenture(venture), play_id) || null;
}

export function listOpenMotions(database = db(), { venture = null, cohort_id = null } = {}) {
  const clauses = ["closed_at IS NULL"];
  const args = [];
  if (venture) { clauses.push("venture=?"); args.push(normalizeVenture(venture)); }
  if (cohort_id) { clauses.push("cohort_id=?"); args.push(cohort_id); }
  return database.prepare(`SELECT * FROM active_motions WHERE ${clauses.join(" AND ")} ORDER BY opened_at DESC`).all(...args);
}

// Open a motion for a lead. Returns the created motion row. Throws on any broken
// invariant. motion_type defaults to design_partner for morrow, revenue otherwise.
// A motion always carries an explicit expiry (default: opened_at + 30 days).
export function openMotion(database, {
  lead_id,
  venture,
  play_id,
  cohort_id = null,
  owner = "Andrew",
  motion_type = null,
  status = "candidate",
  strategy_version = STRATEGY_VERSION,
  source_signal_id = null,
  expires_at = null,
  opened_at = null,
} = {}) {
  if (!lead_id) throw new Error("openMotion requires lead_id");
  const v = normalizeVenture(venture);

  const lead = getLead(database, lead_id);
  if (!lead) throw new Error(`openMotion: no such lead ${lead_id}`);
  if (normalizeProduct(lead.product) !== v)
    throw new Error(`openMotion: lead ${lead_id} is product ${lead.product}, not venture ${v}`);

  if (!play_id || !PLAYS_BY_ID[play_id]) throw new Error(`openMotion: unknown play ${JSON.stringify(play_id)}`);
  if (!(PLAYS_BY_BRAND[v] || []).includes(play_id))
    throw new Error(`openMotion: play ${play_id} does not belong to venture ${v} (cross-venture play assignment rejected)`);
  if (lead.play_id && lead.play_id !== play_id)
    throw new Error(`openMotion: play ${play_id} conflicts with lead's play ${lead.play_id}`);

  if (cohort_id) {
    const cohort = getCohort(database, cohort_id);
    if (!cohort) throw new Error(`openMotion: unknown cohort ${cohort_id}`);
    if (normalizeProduct(cohort.product) !== v)
      throw new Error(`openMotion: cohort ${cohort_id} is ${cohort.product}, not venture ${v}`);
    if (cohort.play_id && cohort.play_id !== play_id)
      throw new Error(`openMotion: cohort ${cohort_id} is play-locked to ${cohort.play_id}, not ${play_id}`);
  }

  const type = motion_type || (v === "morrow" ? "design_partner" : "revenue");
  if (!MOTION_TYPES.has(type)) throw new Error(`openMotion: invalid motion_type ${type}`);
  if (!OPENABLE_STATUSES.has(status))
    throw new Error(`openMotion: a motion opens into candidate|evidence_ready|approved, not ${status}`);

  const ak = accountKey(lead);
  if (getOpenMotionForLead(database, lead_id))
    throw new Error(`openMotion: lead ${lead_id} already has an open motion (one open motion per lead)`);
  if (getOpenMotionForAccountPlay(database, { account_key: ak, venture: v, play_id }))
    throw new Error(`openMotion: account ${ak} already has an open ${v}/${play_id} motion`);

  const opened = opened_at || now();
  const expires = expires_at || new Date(new Date(opened).getTime() + 30 * 864e5).toISOString();
  const info = database.prepare(`INSERT INTO active_motions
    (lead_id,account_key,venture,play_id,strategy_version,cohort_id,channel,motion_type,owner,status,
     source_signal_id,opened_at,expires_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?, 'linkedin', ?,?,?, ?,?,?,?,?) RETURNING id`)
    .get(lead_id, ak, v, play_id, strategy_version, cohort_id, type, owner, status, source_signal_id, opened, expires, opened, opened);
  return getMotion(database, Number(info.id));
}

// Advance the motion along the state machine. Only real events should call this.
// Entering closed_no_fit|suppressed sets closed_at (the motion becomes closed).
// Advancing to the current status is an idempotent no-op.
export function advanceMotion(database, id, toStatus, { reason = null, at = null } = {}) {
  const motion = getMotion(database, id);
  if (!motion) throw new Error(`advanceMotion: unknown motion ${id}`);
  if (motion.closed_at) throw new Error(`advanceMotion: motion ${id} is closed (${motion.status}); open a new motion to reactivate`);
  if (toStatus === motion.status) return motion;
  const allowed = ALLOWED_TRANSITIONS[motion.status] || [];
  if (!allowed.includes(toStatus))
    throw new Error(`advanceMotion: illegal transition ${motion.status} -> ${toStatus} (allowed: ${allowed.join(", ") || "none"})`);
  const t = at || now();
  const closedAt = CLOSED_STATUSES.has(toStatus) ? t : null;
  database.prepare("UPDATE active_motions SET status=?, close_reason=COALESCE(?, close_reason), closed_at=?, updated_at=? WHERE id=?")
    .run(toStatus, reason, closedAt, t, Number(id));
  return getMotion(database, id);
}

// Close a motion terminally (default closed_no_fit). Frees the account/lead for a new motion.
export function closeMotion(database, id, { status = "closed_no_fit", reason = null } = {}) {
  if (!CLOSED_STATUSES.has(status)) throw new Error(`closeMotion: status must be closed_no_fit|suppressed, got ${status}`);
  const motion = getMotion(database, id);
  if (!motion) throw new Error(`closeMotion: unknown motion ${id}`);
  if (motion.closed_at) return motion;
  const t = now();
  database.prepare("UPDATE active_motions SET status=?, close_reason=?, closed_at=?, updated_at=? WHERE id=?")
    .run(status, reason, t, t, Number(id));
  return getMotion(database, id);
}

// Record that a touch went out on this motion (drives the "last touched" ordering and
// keeps a motion warm). Does not itself change status — the send event does that.
export function touchMotion(database, id, at = null) {
  const motion = getMotion(database, id);
  if (!motion) throw new Error(`touchMotion: unknown motion ${id}`);
  const t = at || now();
  database.prepare("UPDATE active_motions SET last_touch_at=?, updated_at=? WHERE id=?").run(t, t, Number(id));
  return getMotion(database, id);
}
