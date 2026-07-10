// scoring.js — within-play prospect scoring (Business Plan §42).
// Gates decide ELIGIBILITY; the score decides PRIORITY among eligible records
// within the SAME play. It must not compare different plays on a generic scale,
// and it must discriminate — a system that scores nearly everything high is broken.
// Weights are heuristic placeholders to be recalibrated against observed meetings,
// qualified opportunities, wins, retention, and expansion.
export const SCORE_DIMENSIONS = [
  { key: "play_icp_fit", weight: 25 },
  { key: "problem_evidence", weight: 20 },
  { key: "trigger_timing", weight: 15 },
  { key: "owner_reachability", weight: 15 },
  { key: "economic_fit", weight: 15 },
  { key: "expansion_potential", weight: 10 },
];

const has = (v) => v != null && String(v).trim() !== "";
const titleText = (l) => String(l.title || "").toLowerCase();
const BROAD_EXEC = /\b(ceo|chief|president|board|executive|founder)\b/;

function playIcpFit(lead, play) {
  let s = 0;
  const fit = Number(lead.fit_score) || 0;
  s += Math.min(fit / 5, 1) * 0.5; // documented fit score, up to half
  if (play && lead.product === play.brand) s += 0.2; // product/brand alignment
  // title matches one of the play's buyer roles
  const roles = play ? Object.values(play.buyer_roles || {}).filter(Boolean).join(" ").toLowerCase() : "";
  const t = titleText(lead);
  if (t && roles && roles.split(/[^a-z]+/).some((w) => w.length > 3 && t.includes(w))) s += 0.3;
  return Math.min(s, 1);
}
function problemEvidence(lead) {
  let s = 0;
  if (has(lead.likely_current_pain)) s += 0.4;
  if (has(lead.first_contract_slice)) s += 0.3;
  if (has(lead.why_this_person) || has(lead.owner_hypothesis)) s += 0.3;
  return Math.min(s, 1);
}
function triggerTiming(lead) {
  let s = 0;
  if (has(lead.trigger_event) || has(lead.why_now)) s += 0.7;
  if (has(lead.lit_up_case)) s += 0.3;
  return Math.min(s, 1);
}
function ownerReachability(lead) {
  let s = 0;
  if (has(lead.email_best)) s += 0.4;
  if (/linkedin\.com\/in\//i.test(lead.linkedin_url || lead.linkedin_or_source || "")) s += 0.3;
  // penalize broad-exec-only routes per the exact-target doctrine
  if (has(lead.title) && !BROAD_EXEC.test(titleText(lead))) s += 0.3;
  return Math.min(s, 1);
}
function economicFit(lead) {
  let s = 0;
  if (has(lead.first_contract_slice)) s += 0.4;
  if (lead.contract_bucket === "short_term") s += 0.4;
  else if (lead.contract_bucket === "medium_term") s += 0.25;
  if (Number(lead.fit_score) >= 4) s += 0.2;
  return Math.min(s, 1);
}
function expansionPotential(lead, play) {
  let s = 0;
  if (play && has(play.expansion_path)) s += 0.4;
  if (/multi|portfolio|sites|regions|platform|enterprise/i.test(`${lead.segment} ${lead.company}`)) s += 0.3;
  if (lead.product === "outagehub") s += 0.3; // recurring model expands by sites/geography
  return Math.min(s, 1);
}

const SUBSCORERS = {
  play_icp_fit: playIcpFit,
  problem_evidence: (l) => problemEvidence(l),
  trigger_timing: (l) => triggerTiming(l),
  owner_reachability: (l) => ownerReachability(l),
  economic_fit: (l) => economicFit(l),
  expansion_potential: expansionPotential,
};

// Returns { score: 0..100, breakdown: {dim: {raw, weighted}} }.
export function scoreLead(lead, play = null) {
  const breakdown = {};
  let total = 0;
  for (const { key, weight } of SCORE_DIMENSIONS) {
    const raw = Math.max(0, Math.min(1, SUBSCORERS[key](lead, play)));
    const weighted = Math.round(raw * weight);
    breakdown[key] = { raw: Number(raw.toFixed(2)), weighted };
    total += weighted;
  }
  return { score: total, breakdown };
}
