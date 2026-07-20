// Proves the deterministic account-activation score: 30/25/20/15/10 caps, the >=70 gate,
// the two hard rules (no source URL => 0 trigger points; no LinkedIn route => cannot
// activate), that the promoter refuses a scored-below-70 lead, and that signals are
// account-scoped and expire.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "score-"));
process.env.CRM_DB_PATH = path.join(temp, "score.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { scoreAccount, scoreAndStore, canActivate, ACTIVATION_THRESHOLD } = await import("./account-score.js");
const { recordSignal, listActiveSignals } = await import("./signals.js");
const { promoteLinkedInMessages } = await import("./promote-linkedin.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

const STRONG = {
  relationship: "direct_trust",
  trigger: { type: "incident_or_reliability_problem", source_url: "https://x.com/incident" },
  proof: "direct",
  access: { owner_named: true, router_named: true, linkedin_route: true },
  timing: { active_within_90d: true },
};

test("a fully-evidenced strong account scores 100 and activates", () => {
  const r = scoreAccount(STRONG);
  assert.equal(r.total, 100);
  assert.equal(r.tier, "activate");
  assert.deepEqual(r.breakdown, { relationship: 30, trigger: 25, proof: 20, access: 15, timing: 10 });
});

test("no source URL => zero trigger points even for a strong trigger type", () => {
  const r = scoreAccount({ ...STRONG, trigger: { type: "incident_or_reliability_problem" } });
  assert.equal(r.breakdown.trigger, 0);
  assert.equal(r.total, 75, "100 minus the 25 trigger points");
});

test("dimension caps hold and a thin account falls below the bar", () => {
  const access = scoreAccount({ access: { owner_named: true, router_named: true, linkedin_route: true } }).breakdown.access;
  assert.equal(access, 15, "access caps at 15 even with all three");
  const thin = scoreAccount({ relationship: "cold", proof: "adjacent", timing: { active_within_90d: false } });
  assert.ok(thin.total < ACTIVATION_THRESHOLD);
  assert.notEqual(thin.tier, "activate");
});

test("scoreAndStore persists total + breakdown; canActivate enforces route AND >=70", async () => {
  const database = db();
  await upsertLeads([{ name: "Sam Score", title: "CTO", company: "ScoreCo", company_domain: "scoreco.io" }], "gnk", { cohort_id: "s-1", play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  const lead = database.prepare("SELECT * FROM leads WHERE name='Sam Score'").get();
  database.prepare("UPDATE leads SET linkedin_url='https://linkedin.com/in/samscore' WHERE id=?").run(lead.id);
  const r = scoreAndStore(database, lead, STRONG);
  assert.equal(r.total, 100);
  const stored = database.prepare("SELECT score, score_breakdown FROM leads WHERE id=?").get(lead.id);
  assert.equal(stored.score, 100);
  assert.equal(JSON.parse(stored.score_breakdown).tier, "activate");
  // route + 100 => ok
  assert.equal(canActivate(database.prepare("SELECT * FROM leads WHERE id=?").get(lead.id)).ok, true);
  // score 50 => blocked
  database.prepare("UPDATE leads SET score=50 WHERE id=?").run(lead.id);
  const blocked = canActivate(database.prepare("SELECT * FROM leads WHERE id=?").get(lead.id));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasons.includes("below_activation_threshold"));
  // no route => blocked
  assert.equal(canActivate({ linkedin_url: "", score: 90 }).ok, false);
  // not-yet-scored + route => passes (scored later during cohort:build)
  assert.equal(canActivate({ linkedin_url: "https://linkedin.com/in/x", score: null }).ok, true);
});

test("the promoter refuses to activate a scored-below-70 lead", async () => {
  const database = db();
  await upsertLeads([{ name: "Lo Score", title: "COO", company: "LoCo", company_domain: "loco.io" }], "gnk", { cohort_id: "s-2", play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  const lead = database.prepare("SELECT * FROM leads WHERE name='Lo Score'").get();
  database.prepare("UPDATE leads SET linkedin_url='https://linkedin.com/in/loscore', score=40 WHERE id=?").run(lead.id);
  const artifact = { linkedin_connection_messages: [{ person_name: "Lo Score", company: "LoCo", linkedin_url: "https://linkedin.com/in/loscore", connection_message: "Hi Lo — worth a look?" }] };
  const res = promoteLinkedInMessages(artifact, "gnk", database);
  assert.equal(res.drafts_queued, 0);
  assert.equal(res.skipped_reasons.below_activation_threshold, 1);
});

test("signals are account-scoped and expire", () => {
  const database = db();
  recordSignal(database, { venture: "gnk", account_key: "scoreco.io", signal_type: "new_executive", statement: "New CTO hired", source_url: "https://x.com/cto", confidence: 0.8, expires_at: "2099-01-01T00:00:00Z" });
  recordSignal(database, { venture: "gnk", account_key: "scoreco.io", signal_type: "multiple_relevant_jobs", statement: "3 platform roles open", source_url: "https://x.com/jobs", expires_at: "2000-01-01T00:00:00Z" });
  const live = listActiveSignals(database, "scoreco.io");
  assert.equal(live.length, 1, "the expired signal is excluded");
  assert.equal(live[0].signal_type, "new_executive");
});
