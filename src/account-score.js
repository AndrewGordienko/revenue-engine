// account-score.js — the DETERMINISTIC account-activation score (Revenue System §4).
// An LLM may EXTRACT evidence, but the score and thresholds are computed here, by code,
// so activation is reproducible and cannot be inflated by a model's optimism. This is a
// different concept from scoring.js (which prioritizes WITHIN a play): this decides
// whether an account is eligible to be activated into a motion at all.
//
// Dimensions (max points): relationship 30 · trigger 25 · proof 20 · access 15 · timing 10.
// Activate at >= 70. Two hard rules: no source URL for a trigger => 0 trigger points; no
// LinkedIn route => the account can never reach 'approved' (see canActivate).
export const ACTIVATION_DIMENSIONS = [
  { key: "relationship", max: 30 },
  { key: "trigger", max: 25 },
  { key: "proof", max: 20 },
  { key: "access", max: 15 },
  { key: "timing", max: 10 },
];
export const ACTIVATION_THRESHOLD = 70;

const now = () => new Date().toISOString();

const RELATIONSHIP = { direct_trust: 30, first_degree: 22, introduction: 15, cold: 3 };
const PROOF = { direct: 20, demonstrator: 14, adjacent: 8 };
const STRONG_TRIGGERS = new Set(["warm_referral", "new_executive", "multiple_relevant_jobs", "migration_or_deprecation", "incident_or_reliability_problem", "launch_or_integration_deadline", "partner_overflow"]);
const MEDIUM_TRIGGERS = new Set(["raised", "funded_expansion", "manual_workflow_evidence"]);

// No source URL => 0 trigger points, regardless of the claimed trigger type. Evidence,
// not assertion, earns the trigger dimension.
function triggerPoints(trigger) {
  if (!trigger || !trigger.source_url) return 0;
  if (STRONG_TRIGGERS.has(trigger.type)) return 25;
  if (MEDIUM_TRIGGERS.has(trigger.type)) return 18;
  return 10;
}
function accessPoints(access = {}) {
  let s = 0;
  if (access.owner_named) s += 8;
  if (access.router_named) s += 4;
  if (access.linkedin_route) s += 3;
  return Math.min(s, 15);
}

// evidence = { relationship, trigger:{type,source_url}, proof, access:{owner_named,router_named,linkedin_route}, timing:{active_within_90d} }
export function scoreAccount(evidence = {}) {
  const relationship = RELATIONSHIP[evidence.relationship] || 0;
  const trigger = triggerPoints(evidence.trigger);
  const proof = PROOF[evidence.proof] || 0;
  const access = accessPoints(evidence.access);
  const timing = evidence.timing?.active_within_90d ? 10 : 3;
  const breakdown = { relationship, trigger, proof, access, timing };
  const total = relationship + trigger + proof + access + timing;
  const tier = total >= ACTIVATION_THRESHOLD ? "activate" : total >= 55 ? "research_or_route" : "no_motion";
  return { total, breakdown, tier };
}

// Score an account from evidence and persist total + full breakdown to the lead.
export function scoreAndStore(database, lead, evidence = {}) {
  const r = scoreAccount(evidence);
  database.prepare("UPDATE leads SET score=?, score_breakdown=?, updated_at=? WHERE id=?")
    .run(r.total, JSON.stringify({ model: "activation-v1", tier: r.tier, breakdown: r.breakdown, evidence }), now(), lead.id);
  return r;
}

const hasLinkedInRoute = (lead) => /linkedin\.com\/in\//i.test(String(lead?.linkedin_url || ""));

// The activation gate. An account may be activated into an outreach motion only with a
// LinkedIn route AND a score of at least 70. A not-yet-scored lead (score null) passes
// the score check — it has not been judged below the bar; it will be scored during
// cohort:build before real activation. The route rule is absolute.
export function canActivate(lead) {
  const reasons = [];
  if (!hasLinkedInRoute(lead)) reasons.push("no_linkedin_route");
  if (lead?.score != null && Number(lead.score) < ACTIVATION_THRESHOLD) reasons.push("below_activation_threshold");
  return { ok: reasons.length === 0, reasons, score: lead?.score ?? null };
}
