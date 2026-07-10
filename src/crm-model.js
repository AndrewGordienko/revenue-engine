// crm-model.js — the real state controls on top of db.js.
// - Buyer stages are MATERIALIZED from immutable activity_events.
// - An explicit transition graph prevents skipped/illegal stage moves.
// - Send-eligibility is strict: deliverability + jurisdiction + enumerated legal
//   basis WITH required evidence + suppression + sender infra + no duplicate contact.
import { tx } from "./db.js";

const now = () => new Date().toISOString();

// ---- Prospect lifecycle & transition graph (§38) ----------------------------
// This is the PROSPECT record only. Deal progression (discovery→…→won/lost)
// lives in the separate opportunities record (see opportunities.js).
export const STAGES = [
  "target", "researched", "route_ready", "enrolled", "engaged",
  "disqualified", "nurture", "contact_evidence_missing",
];

// Legal forward/branch moves. No edge = illegal (prevents skips).
export const ALLOWED_TRANSITIONS = {
  target: ["researched", "disqualified", "nurture", "contact_evidence_missing"],
  researched: ["route_ready", "disqualified", "nurture"],
  route_ready: ["enrolled", "disqualified", "nurture"],
  enrolled: ["engaged", "disqualified", "nurture"],
  engaged: ["disqualified", "nurture"], // opportunity opens separately
  disqualified: ["nurture"],
  nurture: ["target", "researched"],
  contact_evidence_missing: ["route_ready", "enrolled", "disqualified", "nurture"],
};

// Stages that may ONLY be entered by recording their evidence event.
export const STAGE_REQUIRES_EVENT = {
  enrolled: "sent",
  engaged: "reply",
};

// ---- Event rules ------------------------------------------------------------
// Prospect-level events only. Deal events (proposal, contract_signed) belong to
// the opportunity record.
export const EVENT_TYPES = [
  "sent", "delivered", "bounced", "reply", "meeting",
  "unsubscribe", "contact_evidence_missing", "note",
];

const EVENT_RULES = {
  sent: { from: ["route_ready", "contact_evidence_missing"], to: "enrolled", needsEligibility: true },
  delivered: { requiresPrior: "sent", to: null },
  bounced: { requiresPrior: "sent", to: null, sideEffect: "bounce" },
  reply: { from: ["enrolled"], requiresPrior: "sent", to: "engaged" },
  meeting: { from: ["engaged"], to: null },
  unsubscribe: { requiresPrior: "sent", to: null, sideEffect: "unsubscribe" },
  contact_evidence_missing: { from: ["target", "route_ready", "contact_evidence_missing"], to: "contact_evidence_missing", sideEffect: "evidence_missing" },
  note: { to: null },
};

// ---- Legal bases & required evidence (CASL/PECR-shaped) ---------------------
export const LEGAL_BASES = {
  // Address conspicuously published + role-relevant + no no-solicitation note.
  // A GUESSED address can never satisfy this — the published address is the basis.
  published_business_address: (lead, ev) => {
    if (!ev) return "missing evidence";
    if (lead.address_found_or_guessed === "guessed")
      return "address is guessed, not the publicly-published address";
    if (!ev.source_url) return "missing source_url of the published address";
    if (ev.address_published !== true) return "address_published must be true";
    if (ev.role_relevant !== true) return "role_relevant must be true";
    if (ev.no_solicitation_statement !== false)
      return "a no-solicitation statement was present (or unconfirmed)";
    return null;
  },
  express_consent: (lead, ev) => {
    if (!ev) return "missing evidence";
    if (!ev.consent_source) return "missing consent_source";
    if (!ev.consent_at) return "missing consent_at";
    return null;
  },
  existing_business_relationship: (lead, ev) => {
    if (!ev) return "missing evidence";
    if (!ev.relationship_type) return "missing relationship_type";
    if (!ev.established_at) return "missing established_at";
    return null;
  },
};

export const KNOWN_JURISDICTIONS = new Set(["CA", "UK", "US", "AU"]);
const DELIVERABILITY_MAX_AGE_DAYS = 90;
// Sender-level unsubscribe / auth infrastructure. Track 2 sets this true.
// Read at call time so tests and runtime config take effect without reload.
const senderUnsubscribeReady = () => process.env.SENDER_UNSUBSCRIBE_READY === "1";

function freshEnough(iso, days) {
  if (!iso) return false;
  const ageMs = Date.now() - new Date(iso).getTime();
  return ageMs >= 0 && ageMs <= days * 86400000;
}

// ---- Hard-gate ladder (§41). Each returns { ok, blocked:[codes] } -----------

// research_ready: play match + not disqualified. (Trigger freshness scored, not gated.)
export function researchReady(lead) {
  const b = [];
  if (!lead.play_id) b.push("no_play");
  if (lead.stage === "disqualified") b.push("disqualified");
  return { ok: b.length === 0, blocked: b };
}

// route_ready: exact contact, address provenance, deliverability, known
// jurisdiction, legal basis + evidence, suppression check. NOT sender infra.
export function routeReady(d, lead) {
  const b = [];
  if (!lead.email_best) b.push("no_email");

  if (lead.deliverability_status !== "deliverable") b.push("deliverability_not_confirmed");
  else if (!freshEnough(lead.deliverability_checked_at, DELIVERABILITY_MAX_AGE_DAYS))
    b.push("deliverability_stale");

  if (!KNOWN_JURISDICTIONS.has(lead.recipient_jurisdiction)) b.push("jurisdiction_unknown");

  const basisFn = LEGAL_BASES[lead.legal_basis];
  if (!basisFn) b.push("no_or_invalid_legal_basis");
  else {
    const reason = basisFn(lead, parse(lead.legal_basis_evidence));
    if (reason) b.push(`legal_basis_evidence_invalid:${reason}`);
  }

  if (lead.do_not_contact) b.push("suppressed_do_not_contact");
  if (lead.unsubscribed_at) b.push("suppressed_unsubscribed");
  if (lead.suppressed) b.push("suppressed");
  if (isSuppressed(d, lead)) b.push("suppressed_list");

  return { ok: b.length === 0, blocked: b };
}

// send_ready: route_ready + working sender/unsubscribe infra + no duplicate
// active enrollment. This is the gate on the actual moment of first contact.
export function sendEligibility(d, lead) {
  const b = [...routeReady(d, lead).blocked];
  if (!senderUnsubscribeReady()) b.push("sender_unsubscribe_infra_missing");
  if (hasUnresolvedContact(d, lead.id)) b.push("unresolved_prior_contact");
  return { ok: b.length === 0, blocked: b };
}

function isSuppressed(d, lead) {
  if (!lead.email_best) return false;
  const domain = lead.email_best.split("@")[1] || lead.company_domain;
  const row = d
    .prepare("SELECT 1 FROM suppression WHERE (scope='address' AND value=?) OR (scope='domain' AND value=?) LIMIT 1")
    .get(lead.email_best.toLowerCase(), (domain || "").toLowerCase());
  return !!row;
}

function hasUnresolvedContact(d, leadId) {
  const sent = d.prepare("SELECT COUNT(*) n FROM activity_events WHERE lead_id=? AND type='sent'").get(leadId).n;
  if (!sent) return false;
  const resolved = d
    .prepare("SELECT COUNT(*) n FROM activity_events WHERE lead_id=? AND type IN ('reply','bounced','unsubscribe','contract_signed')")
    .get(leadId).n;
  return resolved === 0;
}

// ---- Stage materialization from events + gated transitions ------------------
export function priorEventTypes(d, leadId) {
  return d.prepare("SELECT DISTINCT type FROM activity_events WHERE lead_id=?").all(leadId).map((r) => r.type);
}

// Validate + apply an event. Immutable insert, then re-materialize lead.stage.
export function recordEvent(d, leadId, type, { occurred_at, source = "dashboard", payload = {}, dedupe_key = null } = {}) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type: ${type}`);
  const rule = EVENT_RULES[type];
  const lead = getLead(d, leadId);
  if (!lead) throw new Error(`no such lead: ${leadId}`);

  // Manual/reconciled sends record a send that already happened out-of-band, so
  // they bypass both the route_ready 'from' precondition and the eligibility gate.
  const MANUAL_SEND_SOURCES = new Set(["mailbox-sync", "migration", "dashboard-manual"]);
  const isManualSend = type === "sent" && MANUAL_SEND_SOURCES.has(source);
  const priors = priorEventTypes(d, leadId);
  if (rule.requiresPrior && !priors.includes(rule.requiresPrior))
    throw new Error(`event '${type}' requires a prior '${rule.requiresPrior}' event`);
  if (rule.from && !rule.from.includes(lead.stage) && !isManualSend)
    throw new Error(`event '${type}' not allowed from stage '${lead.stage}' (needs ${rule.from.join("/")})`);
  if (rule.needsEligibility && !isManualSend) {
    const el = sendEligibility(d, lead);
    if (!el.ok) throw new Error(`cannot record automated 'sent': send-blocked [${el.blocked.join(", ")}]`);
  }

  return tx((db) => {
    db.prepare(
      `INSERT INTO activity_events(lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).run(leadId, type, occurred_at || now(), now(), lead.cohort_id, lead.pipeline_run_id, source, JSON.stringify(payload), dedupe_key);

    applySideEffects(db, lead, type, rule, payload);
    rematerialize(db, leadId);
    return getLead(db, leadId);
  });
}

function applySideEffects(db, lead, type, rule, payload) {
  const t = now();
  if (rule.sideEffect === "bounce") {
    db.prepare("UPDATE leads SET deliverability_status='invalid', deliverability_checked_at=?, updated_at=? WHERE id=?").run(t, t, lead.id);
    addSuppression(db, lead.email_best, "hard_bounce");
  } else if (rule.sideEffect === "unsubscribe") {
    db.prepare("UPDATE leads SET unsubscribed_at=?, suppressed=1, updated_at=? WHERE id=?").run(t, t, lead.id);
    addSuppression(db, lead.email_best, "unsubscribe");
  } else if (rule.sideEffect === "evidence_missing") {
    db.prepare("UPDATE leads SET suppressed=1, updated_at=? WHERE id=?").run(t, lead.id);
  }
}

export function addSuppression(db, address, reason) {
  if (!address) return;
  db.prepare("INSERT OR IGNORE INTO suppression(value,scope,reason,created_at) VALUES(?,?,?,?)").run(address.toLowerCase(), "address", reason, now());
}

// Recompute stage from events, honoring the graph (never below the event floor,
// never above what events justify). Manual judgment stages are preserved if the
// event floor allows them.
// Linear progression rank. contact_evidence_missing / nurture / disqualified are
// side-states at rank 0 so a real 'sent' supersedes them.
const RANK = { target: 0, nurture: 0, disqualified: 0, contact_evidence_missing: 0.5, researched: 1, route_ready: 2, enrolled: 3, engaged: 4 };

function rematerialize(db, leadId) {
  const lead = getLead(db, leadId);
  const types = new Set(priorEventTypes(db, leadId));
  let floor = "target";
  if (types.has("contact_evidence_missing")) floor = "contact_evidence_missing";
  if (types.has("sent")) floor = "enrolled"; // a real send supersedes evidence-missing
  if (types.has("reply")) floor = "engaged";

  const next = (RANK[lead.stage] ?? 0) >= (RANK[floor] ?? 0) ? lead.stage : floor;
  if (next !== lead.stage) db.prepare("UPDATE leads SET stage=?, updated_at=? WHERE id=?").run(next, now(), leadId);
}

// Entry gates for manual judgment stages (research_ready / route_ready ladder).
const STAGE_ENTRY_GATES = {
  researched: (d, lead) => { const r = researchReady(lead); return r.ok ? null : `research_ready failed: ${r.blocked.join(", ")}`; },
  route_ready: (d, lead) => {
    const r = researchReady(lead); if (!r.ok) return `research_ready failed: ${r.blocked.join(", ")}`;
    const rr = routeReady(d, lead); return rr.ok ? null : `route_ready failed: ${rr.blocked.join(", ")}`;
  },
};

// Manual, gated stage transition (judgment stages: researched, route_ready,
// disqualified, nurture). Event-driven stages must go through recordEvent.
export function setStage(d, leadId, toStage) {
  const lead = getLead(d, leadId);
  if (!lead) throw new Error(`no such lead: ${leadId}`);
  if (!STAGES.includes(toStage)) throw new Error(`unknown stage: ${toStage}`);
  if (STAGE_REQUIRES_EVENT[toStage])
    throw new Error(`stage '${toStage}' can only be set by recording a '${STAGE_REQUIRES_EVENT[toStage]}' event`);
  const allowed = ALLOWED_TRANSITIONS[lead.stage] || [];
  if (!allowed.includes(toStage))
    throw new Error(`illegal transition ${lead.stage} -> ${toStage} (allowed: ${allowed.join(", ") || "none"})`);
  const gate = STAGE_ENTRY_GATES[toStage];
  if (gate) { const reason = gate(d, lead); if (reason) throw new Error(`cannot enter '${toStage}' on ${leadId}: ${reason}`); }
  d.prepare("UPDATE leads SET stage=?, updated_at=? WHERE id=?").run(toStage, now(), leadId);
  return getLead(d, leadId);
}

// ---- Cohort lineage enforcement --------------------------------------------
export function assertLineage(lead) {
  for (const f of ["cohort_id", "pipeline_run_id", "strategy_version"]) {
    if (!lead[f]) throw new Error(`lineage required: ${f} is missing`);
  }
}
// Reject downstream inputs whose cohort/strategy differ from the run's.
export function assertSameCohort(lead, expected) {
  if (expected.cohort_id && lead.cohort_id !== expected.cohort_id)
    throw new Error(`cross-cohort input: lead ${lead.id} is ${lead.cohort_id}, expected ${expected.cohort_id}`);
  if (expected.strategy_version && lead.strategy_version !== expected.strategy_version)
    throw new Error(`strategy_version mismatch on ${lead.id}: ${lead.strategy_version} vs ${expected.strategy_version}`);
}

// ---- Identity ---------------------------------------------------------------
const slug = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, "-");
function linkedinSlug(url) {
  const m = String(url || "").match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}
// Stable identity: domain + (linkedin /in/ slug | verified email | weak name).
export function identity(row) {
  const domain = slug(row.company_domain);
  const li = linkedinSlug(row.linkedin_url || row.linkedin_or_source);
  if (domain && li) return { key: `d:${domain}|li:${li}`, confidence: "strong" };
  if (domain && row.email_best && row.verified) return { key: `d:${domain}|e:${row.email_best.toLowerCase()}`, confidence: "strong" };
  if (domain && row.name) return { key: `d:${domain}|n:${slug(row.name)}`, confidence: "weak" };
  return { key: `id:${row.id}`, confidence: "weak" };
}

// ---- Row <-> object ---------------------------------------------------------
export const JSON_COLS = ["legal_basis_evidence", "review_reasons", "source_stores", "research"];
function parse(v) { try { return v == null ? null : JSON.parse(v); } catch { return v; } }
export function rowToLead(r) {
  if (!r) return r;
  const o = { ...r };
  for (const c of JSON_COLS) o[c] = parse(r[c]);
  o.do_not_contact = !!r.do_not_contact;
  o.suppressed = !!r.suppressed;
  o.needs_review = !!r.needs_review;
  return o;
}
export function getLead(d, id) {
  return rowToLead(d.prepare("SELECT * FROM leads WHERE id=?").get(id));
}
