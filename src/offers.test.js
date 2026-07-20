// Proves commercial offers are seeded + separate from plays, and that a signed contract
// is the ONLY source of booked revenue: recordContractSigned writes a contract, marks a
// won opportunity carrying the offer, advances the motion to signed, and the account then
// reads "won". Amounts are explicit and gated (start_date + a positive amount required).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "offers-"));
process.env.CRM_DB_PATH = path.join(temp, "offers.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion, advanceMotion, getMotion } = await import("./active-motions.js");
const { listOffers, getOffer, recordContractSigned } = await import("./offers.js");
const { accountStage } = await import("./loop-status.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

let lead, motion;
before(async () => {
  const database = db();
  await upsertLeads([{ name: "Ken Pod", title: "CTO", company: "Podco", company_domain: "podco.io" }], "gnk", { cohort_id: "off-1", play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  lead = database.prepare("SELECT * FROM leads WHERE product='gnk' AND name='Ken Pod'").get();
  database.prepare("UPDATE leads SET linkedin_url='https://linkedin.com/in/kenpod' WHERE id=?").run(lead.id);
  motion = openMotion(database, { lead_id: lead.id, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "off-1", status: "approved" });
});

test("offers are seeded, separate from plays, and scoped by venture", () => {
  const database = db();
  assert.equal(listOffers(database).length, 7, "all seven standardized offers seeded");
  const gnk = listOffers(database, { venture: "gnk" });
  assert.ok(gnk.some((o) => o.offer_id === "GNK-POD-01" && o.amount_min === 20000 && o.pricing_model === "recurring"));
  assert.ok(listOffers(database, { venture: "morrow" }).some((o) => o.offer_id === "MORROW-PILOT-01"));
  assert.equal(getOffer(database, "GNK-SHAPE-01").amount_min, 7500);
  assert.equal(getOffer(database, "NOPE"), null);
});

test("recordContractSigned books revenue, wins the opportunity, and signs the motion", () => {
  const database = db();
  // Walk the motion to proposal_review (contract signing gates on it).
  advanceMotion(database, motion.id, "contacted");
  advanceMotion(database, motion.id, "replied");
  advanceMotion(database, motion.id, "qualified");
  advanceMotion(database, motion.id, "proposal_review");

  const res = recordContractSigned(database, { motion_id: motion.id, offer_id: "GNK-POD-01", mrr: 20000, start_date: "2026-08-01" });
  assert.ok(res.contract_id && res.opportunity_id);
  const contract = database.prepare("SELECT * FROM contracts WHERE id=?").get(res.contract_id);
  assert.equal(contract.mrr, 20000);
  assert.equal(contract.brand, "gnk");
  assert.equal(contract.start_date, "2026-08-01");
  const opp = database.prepare("SELECT * FROM opportunities WHERE id=?").get(res.opportunity_id);
  assert.equal(opp.stage, "won");
  assert.equal(opp.offer_id, "GNK-POD-01");
  assert.equal(getMotion(database, motion.id).status, "signed");
  assert.equal(accountStage(database, lead), "won", "a contract makes the account read won");
  // Cash line reads only from contracts.
  assert.equal(database.prepare("SELECT COALESCE(SUM(mrr),0) s FROM contracts").get().s, 20000);
});

test("contract signing fails closed without a start date, a positive amount, or a matching-venture offer", async () => {
  const database = db();
  await upsertLeads([{ name: "Zoe Two", title: "COO", company: "Zoeco", company_domain: "zoeco.io" }], "gnk", { cohort_id: "off-2", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  const l2 = database.prepare("SELECT * FROM leads WHERE product='gnk' AND name='Zoe Two'").get();
  const m2 = openMotion(database, { lead_id: l2.id, venture: "gnk", play_id: "GNK-BE-01", cohort_id: "off-2", status: "approved" });
  assert.throws(() => recordContractSigned(database, { motion_id: m2.id, offer_id: "GNK-POD-01", mrr: 20000 }), /start_date is required/);
  assert.throws(() => recordContractSigned(database, { motion_id: m2.id, offer_id: "GNK-POD-01", start_date: "2026-08-01" }), /mrr or one_time/);
  assert.throws(() => recordContractSigned(database, { motion_id: m2.id, offer_id: "OHUB-EVAL-01", one_time: 10000, start_date: "2026-08-01" }), /is outagehub, not gnk/);
});
