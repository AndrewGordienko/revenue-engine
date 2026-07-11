import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-"));
process.env.CRM_DB_PATH = path.join(temp, "smoke.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db, _closeForTest } = await import("./db.js");
const { readRegistry } = await import("./bus.js");
const { seedSmokeAccounts, runSmokeFixture, buildSmokeReport, evaluateSmokeGates, groundingSupported } = await import("./smoke-harness.js");
const { upsertLeads } = await import("./leads-store.js");
const { setStage } = await import("./crm-model.js");
const { approveOutreachCohort, approveOutreachMessage, queueOutreachMessage } = await import("./outreach-queue.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");

const artifactsPath = path.join(temp, "smoke-artifacts.json");
let registry;

before(async () => {
  registry = await readRegistry();
  await seedSmokeAccounts(db());
  runSmokeFixture(db(), artifactsPath);
});
after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

test("smoke report shows six accounts fully prepared but nothing approved/drafted/sent", () => {
  const report = buildSmokeReport(db(), artifactsPath);
  assert.equal(report.totals.accounts, 6);
  assert.equal(report.totals.commercial_dossiers, 6);
  assert.equal(report.totals.reviewed_sequences, 6);
  assert.equal(report.totals.approved_messages, 0);
  assert.equal(report.totals.gmail_drafts, 0);
  assert.equal(report.totals.messages_sent, 0);
  // Every lead carries one brand + one play, verified evidence, and no gaps.
  for (const lead of report.leads) {
    assert.match(lead.play, /^(GNK|OHUB)-/);
    assert.equal(lead.email_evidence_status, "verified");
    assert.equal(lead.commercial_dossier_status, "produced");
    assert.equal(lead.approval_status, "pending_approval");
    assert.deepEqual(lead.blocking_gaps, []);
  }
});

test("all nine hard acceptance gates pass", () => {
  const { gates, all_pass } = evaluateSmokeGates(db(), artifactsPath, registry);
  const failed = gates.filter((g) => g.pass !== true).map((g) => g.gate);
  assert.deepEqual(failed, [], `failing gates: ${failed.join("; ")}`);
  assert.equal(all_pass, true);
});

test("GNK yields four touches and OutageHub five", () => {
  const report = buildSmokeReport(db(), artifactsPath);
  assert.ok(report.leads.filter((l) => l.play.startsWith("GNK")).every((l) => l.sequence_touch_count === 4));
  assert.ok(report.leads.filter((l) => l.play.startsWith("OHUB")).every((l) => l.sequence_touch_count === 5));
});

test("evidence gate: grounding must be non-empty and within the dossier's approved evidence", () => {
  const dossier = { approved_evidence: ["https://ok.example/a", "https://ok.example/b"] };
  assert.equal(groundingSupported(dossier, [{ grounding_used: ["https://ok.example/a"] }]), true);
  assert.equal(groundingSupported(dossier, [{ grounding_used: ["https://evil.example/x"] }]), false, "out-of-evidence URL is unsupported");
  assert.equal(groundingSupported(dossier, [{ grounding_used: [] }]), false, "empty grounding is unsupported");
  // Every fixture dossier's claims map to sources inside approved evidence.
  const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
  for (const l of artifacts.leads) {
    const approved = new Set(l.dossier.approved_evidence);
    assert.ok(l.dossier.claims.length > 0);
    for (const c of l.dossier.claims) {
      assert.ok(c.source_urls.length > 0 && c.source_urls.every((u) => approved.has(u)), `claim mapped to approved evidence: ${c.text}`);
    }
  }
});

test("a guessed-email lead cannot reach an approvable message (end-to-end)", async () => {
  const cohortId = "gnk-gnk-be-01-guessprobe";
  await upsertLeads([{
    name: "Guess Probe", title: "CTO", company: "Guessy", company_domain: "guessy.example", product: "gnk", play_id: "GNK-BE-01",
    email_best: "cto@guessy.example", email_status: "guessed", // guessed, not verified
    address_found_or_guessed: "guessed", deliverability_status: "unchecked", recipient_jurisdiction: "US",
    legal_basis: "published_business_address", legal_basis_evidence: { address_published: true, role_relevant: true },
    source_url: "https://guessy.example", why_this_person: "owns backend", trigger_event: "backend migration",
  }], "gnk", { cohort_id: cohortId, play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "smoke" });
  const database = db();
  const lead = database.prepare("SELECT id FROM leads WHERE company_domain='guessy.example'").get();
  setStage(database, lead.id, "researched");
  approveOutreachCohort(cohortId, { approved_by: "smoke", rules: { play_id: "GNK-BE-01" } }, database);
  const msg = queueOutreachMessage({ lead_id: lead.id, touch_number: 1, recipient: "cto@guessy.example", subject: "x", body: "y", review_status: "ready", evidence: ["https://guessy.example"] }, database);
  assert.throws(() => approveOutreachMessage(msg.id, { approved_by: "smoke" }, database), /cannot be approved|deliverability/i);
});
