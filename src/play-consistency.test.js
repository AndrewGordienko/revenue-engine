// Regression tests for the fail-closed play-consistency gate and the promotion
// cohort-conflict guard. A manifest play that disagrees with the CRM must block
// the run unless an explicit evidence-backed decision authorizes the change, and
// promotion must never queue a lead under a play its cohort is not locked to.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "playcheck-"));
process.env.CRM_DB_PATH = path.join(temp, "playcheck.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { checkPlayConsistency, assertPlayConsistency } = await import("./play-consistency.js");
const { promoteReviewerArtifact } = await import("./promote-sequences.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

// Seed one account already assigned GNK-BE-01 in the CRM.
async function seedBE01() {
  await upsertLeads([{
    name: "Chris Boehm", title: "Field CTO", company: "Zero Networks", company_domain: "zeronetworks.com",
    play_id: "GNK-BE-01", email_best: "chris@zeronetworks.com", verified: true, address_found_or_guessed: "verified",
    source_url: "https://zeronetworks.com",
  }], "gnk", { cohort_id: "gnk-be-01-seed", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "test" });
}

const M_CONFLICT = [{ product: "gnk", play_id: "GNK-DATA-01", company: "Zero Networks", domain: "zeronetworks.com", buyer: "Chris Boehm" }];
const M_AGREE = [{ product: "gnk", play_id: "GNK-BE-01", company: "Zero Networks", domain: "zeronetworks.com", buyer: "Chris Boehm" }];

test("manifest play conflicting with an existing CRM play FAILS CLOSED with no decision", async () => {
  await seedBE01();
  const result = checkPlayConsistency(db(), M_CONFLICT, []);
  assert.equal(result.ok, false);
  assert.equal(result.blocking.length, 1);
  assert.equal(result.accounts[0].status, "conflict");
  assert.throws(() => assertPlayConsistency(db(), M_CONFLICT, []), /FAILED CLOSED/);
});

test("an exact, evidence-backed decision resolves the conflict; nothing else does", () => {
  const good = [{ company: "Zero Networks", domain: "zeronetworks.com", from_play: "GNK-BE-01", to_play: "GNK-DATA-01", decided_by: "operator", rationale: "evidence..." }];
  assert.equal(checkPlayConsistency(db(), M_CONFLICT, good).accounts[0].status, "resolved");

  // Reversed direction must NOT resolve (a decision is not reusable backwards).
  const reversed = [{ company: "Zero Networks", domain: "zeronetworks.com", from_play: "GNK-DATA-01", to_play: "GNK-BE-01", decided_by: "operator", rationale: "evidence..." }];
  assert.equal(checkPlayConsistency(db(), M_CONFLICT, reversed).accounts[0].status, "conflict");

  // A decision with no rationale / no approver must NOT resolve.
  const empty = [{ company: "Zero Networks", domain: "zeronetworks.com", from_play: "GNK-BE-01", to_play: "GNK-DATA-01" }];
  assert.equal(checkPlayConsistency(db(), M_CONFLICT, empty).accounts[0].status, "conflict");
});

test("matching manifest and CRM play passes; an unknown play fails closed", () => {
  assert.equal(checkPlayConsistency(db(), M_AGREE, []).accounts[0].status, "ok");
  const bogus = [{ product: "gnk", play_id: "GNK-NOPE-99", company: "Zero Networks", domain: "zeronetworks.com" }];
  const r = checkPlayConsistency(db(), bogus, []);
  assert.equal(r.ok, false);
  assert.equal(r.accounts[0].status, "unknown_play");
});

test("every distinct CRM play must be reconciled, not just the first row", async () => {
  // Add a second Zero Networks lead sourced under a DIFFERENT play (legacy-import shape).
  await upsertLeads([{
    name: "Benny Lakunishok", title: "CEO", company: "Zero Networks", company_domain: "zeronetworks.com",
    play_id: "GNK-AI-01", email_best: "benny@zeronetworks.com", verified: true, address_found_or_guessed: "verified",
    source_url: "https://zeronetworks.com",
  }], "gnk", { cohort_id: "gnk-ai-01-seed", play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "test" });

  // Manifest BE-01 now conflicts with the AI-01 duplicate; a decision covering only
  // one of several differing plays is not enough.
  const onlyData = [{ company: "Zero Networks", domain: "zeronetworks.com", from_play: "GNK-DATA-01", to_play: "GNK-BE-01", decided_by: "op", rationale: "x" }];
  const r = checkPlayConsistency(db(), M_AGREE, onlyData);
  assert.equal(r.accounts[0].status, "conflict");
  assert.match(r.accounts[0].reason, /GNK-AI-01/);

  // Covering the AI-01 duplicate too reconciles it (status 'resolved': a difference
  // existed but an approved decision authorized it; 'ok' is reserved for no diff).
  const both = [...onlyData, { company: "Zero Networks", domain: "zeronetworks.com", from_play: "GNK-AI-01", to_play: "GNK-BE-01", decided_by: "op", rationale: "x" }];
  const reconciled = checkPlayConsistency(db(), M_AGREE, both);
  assert.equal(reconciled.accounts[0].status, "resolved");
  assert.equal(reconciled.ok, true);
});

test("promotion never queues a lead whose play conflicts with its play-locked cohort", async () => {
  const database = db();
  // Seed a lead into a cohort locked to GNK-BE-01, then drift the lead's play to
  // GNK-DATA-01 (a data error). Promotion must refuse to queue it under either play.
  await upsertLeads([{
    name: "Drift Person", title: "CTO", company: "DriftCo", company_domain: "driftco.example",
    play_id: "GNK-BE-01", email_best: "cto@driftco.example", verified: true, address_found_or_guessed: "verified",
    source_url: "https://driftco.example",
  }], "gnk", { cohort_id: "gnk-driftco", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  const lead = database.prepare("SELECT id FROM leads WHERE company_domain='driftco.example'").get();
  database.prepare("UPDATE leads SET play_id='GNK-DATA-01' WHERE id=?").run(lead.id);

  const seq = {
    company: "DriftCo", website: "https://driftco.example", person_name: "Drift Person",
    email_address: "cto@driftco.example", send_readiness: "needs_human_review",
    emails: [{ touch_number: 1, recommended_subject: "s", body: "b", grounding_used: ["https://driftco.example"] }],
  };
  const summary = promoteReviewerArtifact({ improved_person_email_sequences: [seq] }, "gnk", database);
  assert.equal(summary.accounts_queued, 0);
  assert.equal(summary.results[0].reason, "play_conflicts_with_cohort");
});
