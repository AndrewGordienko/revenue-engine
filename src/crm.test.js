// crm.test.js — automated tests for the CRM control layer + Business Plan wiring.
// Throwaway SQLite db. Covers: deliverability, jurisdiction, legal basis+evidence,
// suppression, duplicate sends, prospect lifecycle + stage skipping, play attachment
// gate, separated opportunity lifecycle + contract-on-won, within-play scoring,
// event immutability, lineage, concurrency, bounces/replies/unsubscribes.
//   node --test src/crm.test.js
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CRM_DB_PATH = path.join(os.tmpdir(), `crm-test-${process.pid}.db`);
process.env.SENDER_UNSUBSCRIBE_READY = "1";

const { db } = await import("./db.js");
const { sendEligibility, routeReady, researchReady, recordEvent, setStage, getLead } = await import("./crm-model.js");
const { assertLineage, assertSameCohort } = await import("./crm-model.js");
const { openOpportunity, setOppStage, recordContractSigned, getOpp } = await import("./opportunities.js");
const { scoreLead } = await import("./scoring.js");
const { PLAYS_BY_ID, PLAYS_BY_BRAND, SEQUENCE_POLICIES, STRATEGY_VERSION } = await import("./sales-plays.js");
const { classifyReply } = await import("./reply-classifier.js");
const { buildPipelineReport } = await import("./pipeline-report.js");
const { calculatePipelineCapacity } = await import("./pipeline-capacity.js");

const nowIso = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
let seq = 0;

function seedLead(over = {}) {
  const d = db();
  const id = `t${++seq}`;
  d.prepare("INSERT OR IGNORE INTO cohorts(cohort_id,product,strategy_version,created_at) VALUES('c1','gnk','v1',?)").run(nowIso());
  const base = {
    id, product: "gnk", cohort_id: "c1", pipeline_run_id: "r1", strategy_version: "v1",
    company: "Acme", company_domain: "acme.ca", name: "Pat Lee", title: "VP Engineering", linkedin_url: null,
    identity_key: `id:${id}`, identity_confidence: "weak", play_id: "GNK-BE-01",
    email_best: `pat.${id}@acme.ca`, email_status: "found", address_found_or_guessed: "verified",
    email_source_type: "verified", email_source_url: "https://acme.ca/team",
    deliverability_status: "deliverable", deliverability_checked_at: nowIso(),
    recipient_jurisdiction: "CA", legal_basis: "published_business_address",
    legal_basis_evidence: JSON.stringify({ source_url: "https://acme.ca/team", address_published: true, role_relevant: true, no_solicitation_statement: false }),
    role_relevance_note: null, do_not_contact: 0, unsubscribed_at: null,
    stage: "route_ready", suppressed: 0, needs_review: 0, review_reasons: "[]", source_stores: "[]",
    research: "{}", created_at: nowIso(), updated_at: nowIso(),
  };
  const rec = { ...base, ...over };
  const cols = Object.keys(rec);
  d.prepare(`INSERT INTO leads(${cols.join(",")}) VALUES(${cols.map((c) => "@" + c).join(",")})`).run(rec);
  return getLead(d, id);
}

before(() => { for (const f of [process.env.CRM_DB_PATH, process.env.CRM_DB_PATH + "-wal", process.env.CRM_DB_PATH + "-shm"]) if (fs.existsSync(f)) fs.rmSync(f); });

// ---- send / route eligibility ----------------------------------------------
test("deliverability: only fresh 'deliverable' passes", () => {
  const d = db();
  for (const s of ["unchecked", "risky", "invalid", "catch_all", "unknown"])
    assert.ok(sendEligibility(d, seedLead({ deliverability_status: s })).blocked.includes("deliverability_not_confirmed"), `${s} should block`);
  assert.ok(!sendEligibility(d, seedLead()).blocked.some((b) => b.startsWith("deliverability")));
});
test("deliverability: stale (>90d) blocked", () => {
  assert.ok(sendEligibility(db(), seedLead({ deliverability_checked_at: daysAgo(120) })).blocked.includes("deliverability_stale"));
});
test("jurisdiction: unknown blocked", () => {
  assert.ok(sendEligibility(db(), seedLead({ recipient_jurisdiction: "unknown" })).blocked.includes("jurisdiction_unknown"));
});
test("legal basis: missing blocked; guessed address cannot use published_business_address", () => {
  const d = db();
  assert.ok(sendEligibility(d, seedLead({ legal_basis: null })).blocked.includes("no_or_invalid_legal_basis"));
  assert.ok(sendEligibility(d, seedLead({ address_found_or_guessed: "guessed" })).blocked.some((b) => b.startsWith("legal_basis_evidence_invalid")));
});
test("legal basis: no-solicitation present blocks", () => {
  const bad = seedLead({ legal_basis_evidence: JSON.stringify({ source_url: "x", address_published: true, role_relevant: true, no_solicitation_statement: true }) });
  assert.ok(sendEligibility(db(), bad).blocked.some((b) => b.startsWith("legal_basis_evidence_invalid")));
});
test("happy path: fully-qualified lead is sendable", () => {
  const el = sendEligibility(db(), seedLead());
  assert.deepEqual(el.blocked, []);
});
test("sender infra flag gates all sends when off", () => {
  process.env.SENDER_UNSUBSCRIBE_READY = "0";
  assert.ok(sendEligibility(db(), seedLead()).blocked.includes("sender_unsubscribe_infra_missing"));
  process.env.SENDER_UNSUBSCRIBE_READY = "1";
});
test("route_ready is a subset of send_ready (no sender-infra / duplicate checks)", () => {
  const d = db(); const l = seedLead();
  assert.ok(routeReady(d, l).ok);
  process.env.SENDER_UNSUBSCRIBE_READY = "0";
  assert.ok(routeReady(d, l).ok, "route_ready ignores sender infra");
  assert.ok(!sendEligibility(d, l).ok, "send_ready requires sender infra");
  process.env.SENDER_UNSUBSCRIBE_READY = "1";
});
test("duplicate send: unresolved prior 'sent' blocks re-send", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test" });
  assert.ok(sendEligibility(d, getLead(d, l.id)).blocked.includes("unresolved_prior_contact"));
});

// ---- play attachment gate (§36/§41) ----------------------------------------
test("research_ready requires a play and not disqualified", () => {
  assert.deepEqual(researchReady({ play_id: "GNK-BE-01", stage: "target" }).blocked, []);
  assert.ok(researchReady({ play_id: null, stage: "target" }).blocked.includes("no_play"));
  assert.ok(researchReady({ play_id: "GNK-BE-01", stage: "disqualified" }).blocked.includes("disqualified"));
});
test("cannot enter 'researched' without a play", () => {
  const d = db(); const l = seedLead({ stage: "target", play_id: null });
  assert.throws(() => setStage(d, l.id, "researched"), /no_play|research_ready/);
});
test("route_ready transition enforces route readiness", () => {
  const d = db();
  const blocked = seedLead({ stage: "researched", deliverability_status: "unchecked" });
  assert.throws(() => setStage(d, blocked.id, "route_ready"), /route_ready failed/);
});

// ---- prospect lifecycle + stage skipping -----------------------------------
test("stage skipping: illegal / event-gated transitions rejected", () => {
  const d = db(); const l = seedLead({ stage: "target" });
  assert.throws(() => setStage(d, l.id, "enrolled"), /only be set by recording/); // event-gated
  assert.throws(() => setStage(d, l.id, "engaged"), /only be set by recording/);
  assert.throws(() => setStage(d, l.id, "route_ready"), /illegal transition|route_ready failed/); // must pass researched first / gate
});
test("prospect lifecycle: sent→enrolled, reply→engaged", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test" });
  assert.equal(getLead(d, l.id).stage, "enrolled");
  recordEvent(d, l.id, "reply", { source: "test" });
  assert.equal(getLead(d, l.id).stage, "engaged");
});
test("manual contact from target bypasses eligibility and enrolls", () => {
  const d = db(); const l = seedLead({ stage: "target", deliverability_status: "unchecked" });
  recordEvent(d, l.id, "sent", { source: "dashboard-manual" });
  assert.equal(getLead(d, l.id).stage, "enrolled");
});

// ---- separated opportunity lifecycle (§38) ---------------------------------
test("opportunity: opens only from an engaged prospect", () => {
  const d = db(); const l = seedLead();
  assert.throws(() => openOpportunity(d, l.id, {}), /must be 'engaged'/);
  recordEvent(d, l.id, "sent", { source: "test" });
  recordEvent(d, l.id, "reply", { source: "test" });
  const opp = openOpportunity(d, l.id, { play_id: l.play_id });
  assert.equal(opp.stage, "discovery");
});
test("opportunity lifecycle reaches 'won' only via a signed contract, no skips", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test" });
  recordEvent(d, l.id, "reply", { source: "test" });
  const opp = openOpportunity(d, l.id, {});
  assert.throws(() => setOppStage(d, opp.id, "proposal"), /illegal opportunity transition/); // skip
  assert.throws(() => setOppStage(d, opp.id, "qualified"), /qualification missing/); // gate
  setOppStage(d, opp.id, "qualified", { qualification: { problem: "p", consequence: "c", owner: "o", timing: "t", decision_path: "d", next_step: "n" } });
  setOppStage(d, opp.id, "solution_defined", { solution: { solution: "s", success_metrics: "m", price: "40k", responsibilities: "r" } });
  assert.throws(() => setOppStage(d, opp.id, "proposal"), /proposal-review meeting/);
  setOppStage(d, opp.id, "proposal", { next_step_at: nowIso() });
  assert.throws(() => setOppStage(d, opp.id, "won"), /recordContractSigned/);
  assert.throws(() => recordContractSigned(d, opp.id, { mrr: 5000 }), /booked start_date/);
  const res = recordContractSigned(d, opp.id, { one_time: 40000, start_date: "2026-08-01" });
  assert.equal(res.opportunity.stage, "won");
  assert.ok(res.contract_id > 0);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM contracts WHERE opportunity_id=?").get(opp.id).n, 1);
});
test("opportunity: 'lost' requires a loss_reason", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test" });
  recordEvent(d, l.id, "reply", { source: "test" });
  const opp = openOpportunity(d, l.id, {});
  assert.throws(() => setOppStage(d, opp.id, "lost"), /loss_reason/);
  assert.equal(setOppStage(d, opp.id, "lost", { loss_reason: "no budget" }).stage, "lost");
});

test("commercial strategy keeps three offers per brand and different sequence economics", () => {
  assert.equal(STRATEGY_VERSION, "plan-2026-07-11");
  assert.equal(PLAYS_BY_BRAND.gnk.length, 3);
  assert.equal(PLAYS_BY_BRAND.outagehub.length, 3);
  assert.equal(SEQUENCE_POLICIES.gnk.touch_count, 4);
  assert.equal(SEQUENCE_POLICIES.outagehub.touch_count, 5);
  assert.equal(PLAYS_BY_ID["OHUB-EMBED-01"].price.implementation.min, 15000);
  assert.equal(PLAYS_BY_ID["GNK-AI-01"].engagement_shape.fallback_offer.credited_to_sprint, true);
});

test("capacity uses explicit one-deal and paid-pilot campaign targets", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "agents", "registry.json"), "utf8"));
  const gnk = calculatePipelineCapacity({ registry, state: {}, leads: [], agent: { slug: "gnk-pipeline-capacity" } });
  const oh = calculatePipelineCapacity({ registry, state: {}, leads: [], agent: { slug: "outagehub-pipeline-capacity", commercialTargetKey: "outagehub" } });
  assert.equal(gnk.campaign_targets.researchedAccounts, 250);
  assert.equal(gnk.pipeline_targets.total_leads_required, 500);
  assert.equal(gnk.revenue_goal.required_closed_deals, 1);
  assert.equal(oh.campaign_targets.researchedAccounts, 150);
  assert.equal(oh.pipeline_targets.total_leads_required, 300);
  assert.equal(oh.revenue_goal.required_closed_deals, 3);
});

test("reply classifier captures positive intent and objections", () => {
  assert.equal(classifyReply("Yes, send details and let's schedule time").intent, "positive");
  const budget = classifyReply("This is interesting but we do not have budget until next quarter");
  assert.ok(budget.objections.includes("budget"));
  assert.ok(budget.objections.includes("timing"));
});

test("cohort report tracks funnel, booked revenue, and implementation margin", () => {
  const d = db();
  d.prepare("INSERT OR IGNORE INTO cohorts(cohort_id,product,strategy_version,created_at) VALUES('report-c','gnk',?,?)").run(STRATEGY_VERSION, nowIso());
  const lead = seedLead({ cohort_id: "report-c", strategy_version: STRATEGY_VERSION, stage: "route_ready" });
  recordEvent(d, lead.id, "sent", { source: "test" });
  recordEvent(d, lead.id, "reply", { source: "test", payload: { body: "Yes, let's meet next week" } });
  recordEvent(d, lead.id, "meeting", { source: "test" });
  const opp = openOpportunity(d, lead.id, {});
  setOppStage(d, opp.id, "qualified", { qualification: { problem: "p", consequence: "c", owner: "o", timing: "t", decision_path: "d", next_step: "n" } });
  setOppStage(d, opp.id, "solution_defined", { solution: { solution: "s", success_metrics: "m", price: "40k", responsibilities: "r" } });
  setOppStage(d, opp.id, "proposal", { next_step_at: nowIso() });
  recordContractSigned(d, opp.id, { one_time: 40000, start_date: "2026-08-01", implementation_cost: 10000, contract_type: "sprint" });
  const row = buildPipelineReport(d).cohorts.find((candidate) => candidate.cohort_id === "report-c");
  assert.equal(row.positive_replies, 1);
  assert.equal(row.meetings_held, 1);
  assert.equal(row.proposals, 1);
  assert.equal(row.wins, 1);
  assert.equal(row.booked_one_time_usd, 40000);
  assert.equal(row.implementation_gross_margin, 0.75);
});

// ---- within-play scoring (§42) ---------------------------------------------
test("scoring discriminates: richer evidence scores higher, and it's bounded 0..100", () => {
  const play = PLAYS_BY_ID["GNK-BE-01"];
  const rich = scoreLead({ product: "gnk", title: "VP Engineering", fit_score: 5, trigger_event: "public incident", likely_current_pain: "reliability", first_contract_slice: "stabilize one slice", why_this_person: "owns reliability", email_best: "a@b.ca", linkedin_url: "https://linkedin.com/in/x", contract_bucket: "short_term", lit_up_case: "yes" }, play).score;
  const thin = scoreLead({ product: "gnk", title: "CEO", fit_score: 0 }, play).score;
  assert.ok(rich > thin, `rich ${rich} should beat thin ${thin}`);
  assert.ok(rich <= 100 && thin >= 0);
});

// ---- events: bounce / unsubscribe / immutability / dedupe ------------------
test("bounce: invalid + suppress + blocks resend", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test" });
  recordEvent(d, l.id, "bounced", { source: "test" });
  assert.equal(getLead(d, l.id).deliverability_status, "invalid");
});
test("unsubscribe suppresses the address for ALL leads at that address", () => {
  const d = db(); const addr = `shared.${seq + 1}@acme.ca`;
  const a = seedLead({ email_best: addr });
  recordEvent(d, a.id, "sent", { source: "test" });
  recordEvent(d, a.id, "unsubscribe", { source: "test" });
  assert.ok(sendEligibility(d, seedLead({ email_best: addr })).blocked.includes("suppressed_list"));
});
test("activity_events immutable (UPDATE/DELETE blocked)", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test" });
  assert.throws(() => d.prepare("UPDATE activity_events SET type='x' WHERE lead_id=?").run(l.id), /immutable/);
  assert.throws(() => d.prepare("DELETE FROM activity_events WHERE lead_id=?").run(l.id), /immutable/);
});
test("dedupe_key prevents duplicate event insertion", () => {
  const d = db(); const l = seedLead();
  recordEvent(d, l.id, "sent", { source: "test", dedupe_key: "k1" });
  assert.throws(() => recordEvent(d, l.id, "reply", { source: "test", dedupe_key: "k1" }), /UNIQUE|constraint/i);
});

// ---- lineage + concurrency -------------------------------------------------
test("lineage required; cross-cohort inputs rejected", () => {
  assert.throws(() => assertLineage({ cohort_id: null, pipeline_run_id: "r", strategy_version: "v" }), /lineage required/);
  assert.throws(() => assertSameCohort({ id: "x", cohort_id: "c2", strategy_version: "v1" }, { cohort_id: "c1" }), /cross-cohort/);
});
test("concurrency: a second WAL connection sees committed writes", async () => {
  const d = db(); const l = seedLead();
  const { DatabaseSync } = await import("node:sqlite");
  const d2 = new DatabaseSync(process.env.CRM_DB_PATH);
  d2.exec("PRAGMA busy_timeout=5000;");
  recordEvent(d, l.id, "sent", { source: "test" });
  assert.equal(d2.prepare("SELECT stage FROM leads WHERE id=?").get(l.id).stage, "enrolled");
  d2.close();
});
