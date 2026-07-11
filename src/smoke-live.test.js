import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-live-"));
process.env.CRM_DB_PATH = path.join(temp, "crm.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const smokeLive = await import("./smoke-live.js");
const { validateManifest, initLiveSmoke, assertManifestScope, requireCohortForLiveSmoke, filterLeadsToScope, cohortGroupFor } = smokeLive;
const { STRATEGY_VERSION } = await import("./sales-plays.js");

// A valid six-account manifest: exactly 3 per brand, one per active play.
const VALID = [
  { product: "gnk", play_id: "GNK-AI-01", company: "A", domain: "a.example", buyer: "Ann" },
  { product: "gnk", play_id: "GNK-BE-01", company: "B", domain: "b.example", buyer: "Bob" },
  { product: "gnk", play_id: "GNK-DATA-01", company: "C", domain: "c.example", buyer: "Cy" },
  { product: "outagehub", play_id: "OHUB-ISP-01", company: "D", domain: "d.example", buyer: "Dee" },
  { product: "outagehub", play_id: "OHUB-EMBED-01", company: "E", domain: "e.example", buyer: "Eve" },
  { product: "outagehub", play_id: "OHUB-FAC-01", company: "F", domain: "f.example", buyer: "Fin" },
];

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

test("manifest validation enforces 3-per-brand, one-per-play, domain + buyer", () => {
  assert.equal(validateManifest(VALID).ok, true);
  // Missing a play (only 2 GNK) and a missing buyer / domain.
  const bad = [
    { product: "gnk", play_id: "GNK-AI-01", company: "A", domain: "a.example", buyer: "Ann" },
    { product: "gnk", play_id: "GNK-AI-01", company: "A2", domain: "a2.example" }, // dup play, missing buyer
    ...VALID.filter((a) => a.product === "outagehub"),
  ];
  const r = validateManifest(bad);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /missing proposed buyer/.test(p)));
  assert.ok(r.problems.some((p) => /expected exactly one account for GNK-BE-01/.test(p)));
  assert.ok(r.problems.some((p) => /expected exactly 3 accounts/.test(p)));
});

test("an invalid raw product value is rejected, not silently coerced to GNK", () => {
  const bad = [
    { product: "something-wrong", play_id: "GNK-AI-01", company: "X", domain: "x.example", buyer: "Xander" },
    ...VALID.slice(1),
  ];
  const r = validateManifest(bad);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /invalid product something-wrong/.test(p)), "raw product must be rejected");
});

test("every cohort-scoped pipeline fails closed in live-smoke mode without a cohort", () => {
  for (const pipeline of ["cohort:build", "lead:prepare", "full"]) {
    assert.throws(() => requireCohortForLiveSmoke(pipeline, null, true), /requires --cohort/, `${pipeline} must be gated`);
    assert.doesNotThrow(() => requireCohortForLiveSmoke(pipeline, "gnk-live-smoke", true));
    assert.doesNotThrow(() => requireCohortForLiveSmoke(pipeline, null, false)); // not live → allowed
  }
  assert.doesNotThrow(() => requireCohortForLiveSmoke("strategy:refresh", null, true)); // strategy is not cohort-scoped
});

test("init seeds only manifest accounts into isolated cohort groups", async () => {
  const database = db();
  // A pre-existing lead in an unrelated cohort must NOT leak into the live group.
  await upsertLeads([{ name: "Stray", company: "Stray Co", company_domain: "stray.example", product: "gnk", play_id: "GNK-BE-01" }],
    "gnk", { cohort_id: "gnk-unrelated", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION });

  const { seeded, groups } = await initLiveSmoke(VALID, database);
  assert.equal(seeded.length, 6);
  assert.deepEqual(groups.sort(), ["gnk-live-smoke", "outagehub-live-smoke"]);
  for (const group of groups) {
    const { ok, leaked } = assertManifestScope(database, group, VALID);
    assert.equal(ok, true, `no strays in ${group}: ${leaked.join(", ")}`);
  }
  // The stray remains outside the live group.
  const groupLeads = database.prepare("SELECT company_domain FROM leads WHERE cohort_id LIKE 'gnk-live-smoke%'").all().map((r) => r.company_domain);
  assert.ok(!groupLeads.includes("stray.example"));
  assert.equal(groupLeads.length, 3);
});

test("filterLeadsToScope limits leads to the SMOKE_LIVE_COHORT prefix", () => {
  const leads = [
    { company: "A", cohort_id: "gnk-live-smoke-gnk-ai-01" },
    { company: "Stray", cohort_id: "gnk-unrelated" },
  ];
  assert.equal(filterLeadsToScope(leads, {}).length, 2, "no scope → unchanged");
  const scoped = filterLeadsToScope(leads, { SMOKE_LIVE_COHORT: "gnk-live-smoke" });
  assert.deepEqual(scoped.map((l) => l.company), ["A"]);
});
