// Prospect desk: verified LinkedIn profiles + send-safe notes. Self-contained — seeds
// synthetic verified-profile leads into a temp DB (was coupled to the local CRM, which is
// gitignored, so it failed in a fresh clone / CI). Proves the shape/logic, not "do we have
// 30 real prospects" — that is a live-data question, not a unit test.
import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prospects-"));
process.env.CRM_DB_PATH = path.join(temp, "prospects.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { _closeForTest } = await import("./db.js");
const { upsertLeads, readLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { buildLinkedinProspects, validateLinkedinProspects } = await import("./linkedin-prospects.js");

const N = 3;
const PLAY = { gnk: "GNK-AI-01", outagehub: "OHUB-ISP-01", morrow: "MORROW-COPACK-01" };

for (const product of ["gnk", "outagehub", "morrow"]) {
  const leads = Array.from({ length: N }, (_, i) => ({
    name: `Person ${product} ${i}`, title: "VP Operations", company: `Co ${product} ${i}`, company_domain: `${product}co${i}.io`,
    linkedin_or_source: `https://linkedin.com/in/${product}person${i}`, linkedin_url: `https://linkedin.com/in/${product}person${i}`,
    play_id: PLAY[product], fit_score: 5, segment: "operations",
    likely_current_pain: "manual workflow and reconciliation pain", trigger_event: "scaling operations",
    why_this_person: "owns the workflow that is breaking at scale", source_url: `https://${product}co${i}.io/news`,
  }));
  await upsertLeads(leads, product, { cohort_id: `prospects-${product}`, play_id: PLAY[product], strategy_version: STRATEGY_VERSION, stage: "test" });
}

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

for (const product of ["gnk", "outagehub", "morrow"]) {
  test(`${product} prospect desk has verified profiles and send-safe notes`, async () => {
    const prospects = await buildLinkedinProspects(await readLeads(product), product, N);
    assert.deepEqual(validateLinkedinProspects(prospects, N), []);
    assert.equal(prospects.length, N);
    assert.equal(new Set(prospects.map((item) => item.profile_url)).size, N);

    for (const item of prospects) {
      assert.match(item.profile_url, /^https:\/\/[a-z]{0,3}\.?linkedin\.com\/in\//i);
      assert.equal(item.profile_status, "verified");
      assert.ok(item.observed_signal);
      assert.ok(item.why_this_person);
      assert.ok(item.what_we_can_do);
      assert.ok(item.message.length > 0 && item.message.length <= 299);
      assert.doesNotMatch(item.message, /[–—]/);
    }
  });
}
