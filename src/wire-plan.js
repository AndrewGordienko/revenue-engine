// wire-plan.js — wire the Business Plan 2026 strategy into the canonical store:
//  1. seed the versioned sales_plays,
//  2. assign exactly one play to every existing lead (Plan §36),
//  3. stamp the plan strategy_version,
//  4. compute within-play scores (§42).
// Idempotent: re-running re-seeds plays and re-scores. Run: node src/wire-plan.js
import fs from "node:fs";
import path from "node:path";
import { db, tx } from "./db.js";
import { rowToLead } from "./crm-model.js";
import { SALES_PLAYS, PLAYS_BY_ID, STRATEGY_VERSION } from "./sales-plays.js";
import { scoreLead } from "./scoring.js";

const now = () => new Date().toISOString();

// Heuristic play assignment from the lead's research signals. Returns { play_id, confident }.
export function assignPlay(lead) {
  const text = `${lead.title} ${lead.segment} ${lead.trigger_event} ${lead.why_now} ${lead.outreach_angle} ${lead.company} ${lead.first_contract_slice}`.toLowerCase();
  if (lead.product === "gnk") {
    if (/\b(ai|agent|agentic|ml|model|llm|genai|copilot)\b/.test(text)) return { play_id: "GNK-AI-01", confident: true };
    if (/\b(legacy|rescue|incident|modernization|migration|troubled|contractor|rewrite|technical debt|backend|platform|reliability|infrastructure|scale|api|integration|performance|latency)\b/.test(text)) return { play_id: "GNK-BE-01", confident: true };
    if (/\b(data|automation|workflow|spreadsheet|pipeline|reporting|reconciliation|manual|ops|operations)\b/.test(text)) return { play_id: "GNK-DATA-01", confident: true };
    return { play_id: "GNK-BE-01", confident: false }; // broad product/rescue work must be narrowed to a critical system path
  }
  // outagehub
  if (/\b(telecom|isp|network|noc|fibre|fiber|wireless|carrier|connectivity)\b/.test(text)) return { play_id: "OHUB-ISP-01", confident: true };
  if (/\b(software|platform|api|saas|product|integration|developer|embed)\b/.test(text)) return { play_id: "OHUB-EMBED-01", confident: true };
  if (/\b(property|facilit|logistic|dispatch|cold storage|warehouse|maintenance|building|portfolio|field service|depot|greenhouse)\b/.test(text)) return { play_id: "OHUB-FAC-01", confident: true };
  return { play_id: "OHUB-FAC-01", confident: false }; // facilities is the volume default
}

function mergedView(lead) {
  const r = lead.research || {};
  return {
    product: lead.product, title: lead.title, company: lead.company, segment: r.segment,
    trigger_event: r.trigger_event, why_now: r.why_now, outreach_angle: r.outreach_angle,
    first_contract_slice: r.first_contract_slice, likely_current_pain: r.likely_current_pain,
    why_this_person: r.why_this_person || lead.role_relevance_note, owner_hypothesis: r.owner_hypothesis,
    lit_up_case: r.lit_up_case, fit_score: r.fit_score, contract_bucket: r.contract_bucket,
    email_best: lead.email_best, linkedin_url: lead.linkedin_url, linkedin_or_source: r.linkedin_or_source,
  };
}

function main() {
  const d = db();
  const report = { seeded_plays: 0, assigned: {}, low_confidence: 0, scored: 0, unassigned: 0 };

  tx((database) => {
    // 1. Seed versioned plays.
    const stmt = database.prepare(`INSERT OR REPLACE INTO sales_plays(play_id,strategy_version,brand,name,spec,created_at) VALUES(?,?,?,?,?,?)`);
    for (const p of SALES_PLAYS) { stmt.run(p.play_id, p.strategy_version, p.brand, p.name, JSON.stringify(p), now()); report.seeded_plays++; }

    // 2–4. Assign play, stamp strategy_version, score.
    const leads = database.prepare("SELECT * FROM leads").all().map(rowToLead);
    for (const lead of leads) {
      const view = mergedView(lead);
      const { play_id, confident } = assignPlay(view);
      const play = PLAYS_BY_ID[play_id];
      const { score, breakdown } = scoreLead(view, play);
      const originalReasons = lead.review_reasons || [];
      const reasons = originalReasons.filter((reason) => reason.reason !== "play_low_confidence");
      if (!confident) reasons.push({ reason: "play_low_confidence", assigned: play_id, strategy_version: STRATEGY_VERSION });
      const reviewWasOnlyOldPlayAssignment = Boolean(lead.needs_review) && originalReasons.length > 0 && reasons.length === 0;
      const needsReview = confident ? (reviewWasOnlyOldPlayAssignment ? 0 : (lead.needs_review ? 1 : 0)) : 1;
      database.prepare("UPDATE leads SET play_id=@play, strategy_version=@sv, score=@score, score_breakdown=@bd, needs_review=@nr, review_reasons=@rr, updated_at=@t WHERE id=@id")
        .run({ play: play_id, sv: STRATEGY_VERSION, score, bd: JSON.stringify(breakdown), nr: needsReview, rr: JSON.stringify(reasons), t: now(), id: lead.id });
      report.assigned[play_id] = (report.assigned[play_id] || 0) + 1;
      if (!confident) report.low_confidence++;
      report.scored++;
    }
  });

  fs.writeFileSync(path.join(process.cwd(), "data", "wire-plan-report.json"), JSON.stringify(report, null, 2));
  const scoreRows = d.prepare("SELECT score FROM leads WHERE score IS NOT NULL").all().map((r) => r.score);
  const avg = scoreRows.length ? Math.round(scoreRows.reduce((a, b) => a + b, 0) / scoreRows.length) : 0;
  console.log(`plays seeded: ${report.seeded_plays} (strategy ${STRATEGY_VERSION})`);
  console.log(`leads assigned to plays: ${JSON.stringify(report.assigned)}`);
  console.log(`low-confidence assignments (flagged): ${report.low_confidence} | scored: ${report.scored}`);
  console.log(`score range: ${Math.min(...scoreRows)}–${Math.max(...scoreRows)} (avg ${avg})`);
  console.log(`report: data/wire-plan-report.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
