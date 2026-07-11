// Tests for the canonical live-smoke orchestrator: failure classification (retry
// vs stop), and the preflight HARD GATE that must block before any agent runs.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smokelive-"));
process.env.CRM_DB_PATH = path.join(temp, "smokelive.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";
process.env.SMOKE_LIVE_SKIP_CRED_CHECK = "1"; // don't call openclaw in unit tests

const { db, _closeForTest } = await import("./db.js");
const { classifyFailure, preflight, runSmokeLive } = await import("./smoke-live-run.js");
const { retireStaleLiveSmoke, assertManifestScope } = await import("./smoke-live.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

// A valid one-per-play manifest and a conflicting variant.
const VALID = [
  { product: "gnk", play_id: "GNK-AI-01", company: "AlphaAI", domain: "alphaai.example", buyer: "Ada" },
  { product: "gnk", play_id: "GNK-BE-01", company: "BetaBackend", domain: "betabackend.example", buyer: "Ben" },
  { product: "gnk", play_id: "GNK-DATA-01", company: "GammaOps", domain: "gammaops.example", buyer: "Gita" },
  { product: "outagehub", play_id: "OHUB-ISP-01", company: "DeltaISP", domain: "deltaisp.example", buyer: "Dana" },
  { product: "outagehub", play_id: "OHUB-EMBED-01", company: "EpsilonSoft", domain: "epsilonsoft.example", buyer: "Eli" },
  { product: "outagehub", play_id: "OHUB-FAC-01", company: "ZetaCold", domain: "zetacold.example", buyer: "Zoe" },
];

test("failure classification: conflicts stop, transient retries, unknown stops", () => {
  assert.equal(classifyFailure("play consistency check FAILED CLOSED — 1 unresolved account"), "conflict");
  assert.equal(classifyFailure("cross-cohort input: lead 7 is ..."), "conflict");
  assert.equal(classifyFailure("model is at capacity, try again (429)"), "transient");
  assert.equal(classifyFailure("ECONNRESET socket hang up"), "transient");
  assert.equal(classifyFailure("TypeError: undefined is not a function"), "error");
});

test("preflight passes for a valid one-per-play manifest (credentials skipped)", async () => {
  const pf = await preflight(db(), VALID);
  assert.equal(pf.ok, true);
  assert.ok(pf.checks.find((c) => c.name === "manifest_valid").ok);
  assert.ok(pf.checks.find((c) => c.name === "play_consistency").ok);
  assert.ok(pf.checks.find((c) => c.name === "credentials").ok); // skipped -> ok
});

test("preflight FAILS CLOSED on a manifest that breaks one-per-play", async () => {
  const broken = VALID.filter((a) => a.play_id !== "GNK-DATA-01"); // 5 accounts, missing DATA-01
  const pf = await preflight(db(), broken);
  assert.equal(pf.ok, false);
  assert.ok(pf.blockers.some((b) => b.type === "manifest"));
});

test("init self-heals a stale live-smoke lead from a superseded manifest (retire, not delete)", async () => {
  const database = db();
  const { upsertLeads } = await import("./leads-store.js");
  const { STRATEGY_VERSION } = await import("./sales-plays.js");
  // A GNK live-smoke manifest whose DATA-01 slot is StaleCoOld... no: seed a stale
  // lead in the gnk-live-smoke namespace whose domain is NOT in the manifest.
  await upsertLeads([{ name: "Old", company: "OldCo", company_domain: "oldco.example", play_id: "GNK-DATA-01", email_best: "o@oldco.example", verified: true, address_found_or_guessed: "verified", source_url: "https://oldco.example" }],
    "gnk", { cohort_id: "gnk-live-smoke-gnk-data-01", play_id: "GNK-DATA-01", strategy_version: STRATEGY_VERSION, stage: "live-smoke" });
  // A canonical (non-live-smoke) lead for the same company must NOT be touched.
  await upsertLeads([{ name: "Keep", company: "OldCo", company_domain: "oldco.example", play_id: "GNK-BE-01", email_best: "k@oldco.example", verified: true, address_found_or_guessed: "verified", source_url: "https://oldco.example" }],
    "gnk", { cohort_id: "legacy-import", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "test" });

  const manifest = VALID; // OldCo/oldco.example is NOT in VALID
  const retired = retireStaleLiveSmoke(database, manifest);
  assert.ok(retired.some((r) => r.domain === "oldco.example" && r.to.startsWith("retired-")), "stale live-smoke lead retired");
  // The stale lead still exists (moved, not deleted); the canonical lead is untouched.
  assert.ok(database.prepare("SELECT 1 FROM leads WHERE company_domain='oldco.example' AND cohort_id LIKE 'retired-%'").get());
  assert.ok(database.prepare("SELECT 1 FROM leads WHERE company_domain='oldco.example' AND cohort_id='legacy-import'").get(), "canonical non-live-smoke lead untouched");
  assert.equal(assertManifestScope(database, "gnk-live-smoke", manifest).ok, true, "scope is clean after retirement");
});

test("the orchestrator refuses to run agents when preflight is blocked", async () => {
  // A play conflict: seed a CRM lead under a different play than the manifest.
  const { upsertLeads } = await import("./leads-store.js");
  const { STRATEGY_VERSION } = await import("./sales-plays.js");
  await upsertLeads([{ name: "Ada", company: "AlphaAI", company_domain: "alphaai.example", play_id: "GNK-BE-01", email_best: "a@alphaai.example", verified: true, address_found_or_guessed: "verified", source_url: "https://alphaai.example" }],
    "gnk", { cohort_id: "seed", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "test" });

  // Manifest says AlphaAI is GNK-AI-01 -> conflict with the seeded GNK-BE-01, no decision.
  const status = await runSmokeLive({ database: db(), manifest: VALID });
  assert.equal(status.active, false);
  assert.equal(status.current_stage, "blocked");
  assert.ok(status.blockers.some((b) => b.type === "play_conflict"));
  // Only the preflight stage ran — NO init, NO brand pipelines (no agents spawned).
  assert.deepEqual(status.stages.map((s) => s.key), ["preflight"]);
});
