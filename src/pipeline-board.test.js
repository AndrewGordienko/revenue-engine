// Proves the Pipeline board: the revenue and design-partner funnels never merge, Won/Partner
// is populated ONLY from a signed contract (a bare 'signed' status is not Won), cards land in
// the right column, stalled cards are flagged, and stage moves are gated (never silent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "board-"));
process.env.CRM_DB_PATH = path.join(temp, "board.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion, advanceMotion } = await import("./active-motions.js");
const { recordMotionEvent } = await import("./linkedin-events.js");
const { recordContractSigned } = await import("./offers.js");
const { buildBoard, stageGate } = await import("./pipeline-board.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

async function motionAt(database, { name, domain, product, play_id, status }) {
  const cohort = `${product}-${play_id.toLowerCase()}`;
  await upsertLeads([{ name, title: "VP", company: name, company_domain: domain }], product, { cohort_id: cohort, play_id, strategy_version: STRATEGY_VERSION, stage: "test" });
  const lead = database.prepare("SELECT * FROM leads WHERE product=? AND name=?").get(product, name);
  const m = openMotion(database, { lead_id: lead.id, venture: product, play_id, cohort_id: cohort, status: "approved" });
  const order = ["approved", "contacted", "replied", "qualified", "proposal_review"];
  const target = order.indexOf(status);
  for (let i = 1; i <= target; i++) advanceMotion(database, m.id, order[i]);
  return { lead, motion: db().prepare("SELECT * FROM active_motions WHERE id=?").get(m.id) };
}

let signedNoContract, signedWithContract;
before(async () => {
  const database = db();
  await motionAt(database, { name: "A Contacted", domain: "a.io", product: "gnk", play_id: "GNK-AI-01", status: "contacted" });
  await motionAt(database, { name: "B Replied", domain: "b.io", product: "gnk", play_id: "GNK-BE-01", status: "replied" });
  // C: reach proposal_review then sign via a bare event (NO contract created).
  signedNoContract = (await motionAt(database, { name: "C NoContract", domain: "c.io", product: "gnk", play_id: "GNK-DATA-01", status: "proposal_review" })).motion;
  recordMotionEvent(database, { motion_id: signedNoContract.id, type: "contract_signed" });
  // D: reach proposal_review then sign WITH a real contract.
  signedWithContract = (await motionAt(database, { name: "D Won", domain: "d.io", product: "outagehub", play_id: "OHUB-ISP-01", status: "proposal_review" })).motion;
  recordContractSigned(database, { motion_id: signedWithContract.id, offer_id: "OHUB-EVAL-01", one_time: 12000, start_date: "2026-08-01" });
  // E: a fresh Morrow motion (Targeted).
  await motionAt(database, { name: "E Targeted", domain: "e.io", product: "morrow", play_id: "MORROW-COPACK-01", status: "approved" });
});

test("the revenue and design-partner funnels are distinct and never share columns", () => {
  const gnk = buildBoard(db(), { venture: "gnk" });
  const morrow = buildBoard(db(), { venture: "morrow" });
  assert.equal(gnk.funnel_type, "revenue");
  assert.equal(morrow.funnel_type, "design_partner");
  assert.deepEqual(gnk.columns.map((c) => c.key), ["contacted", "replied", "call", "proposal", "won"]);
  assert.deepEqual(morrow.columns.map((c) => c.key), ["targeted", "connected", "workflow", "site_walk", "fit_memo", "partner"]);
});

test("cards land in the right column", () => {
  const gnk = buildBoard(db(), { venture: "gnk" });
  const col = (k) => gnk.columns.find((c) => c.key === k).cards.map((x) => x.person);
  assert.ok(col("contacted").includes("A Contacted"));
  assert.ok(col("replied").includes("B Replied"));
  const morrow = buildBoard(db(), { venture: "morrow" });
  assert.ok(morrow.columns.find((c) => c.key === "targeted").cards.some((x) => x.person === "E Targeted"));
});

test("Won is populated ONLY from a signed contract", () => {
  const gnk = buildBoard(db(), { venture: "gnk" });
  const won = gnk.columns.find((c) => c.key === "won").cards;
  assert.ok(!won.some((x) => x.motion_id === signedNoContract.id), "a bare signed status is NOT won");
  const ohub = buildBoard(db(), { venture: "outagehub" });
  const ohubWon = ohub.columns.find((c) => c.key === "won").cards;
  assert.ok(ohubWon.some((x) => x.motion_id === signedWithContract.id), "the contracted deal IS won");
  assert.equal(ohubWon.find((x) => x.motion_id === signedWithContract.id).amount, 12000);
});

test("stalled cards are flagged after 10 days in stage", () => {
  const database = db();
  const m = database.prepare("SELECT m.id FROM active_motions m JOIN leads l ON l.id=m.lead_id WHERE l.name='A Contacted'").get();
  database.prepare("UPDATE active_motions SET updated_at=? WHERE id=?").run(new Date(Date.now() - 15 * 864e5).toISOString(), m.id);
  const card = buildBoard(db(), { venture: "gnk" }).columns.find((c) => c.key === "contacted").cards.find((x) => x.person === "A Contacted");
  assert.equal(card.stalled, true);
  assert.ok(card.days_in_stage >= 15);
});

test("stage moves are gated: forward columns require a micro-form; Targeted has no gate", () => {
  assert.deepEqual(stageGate("call"), { requires_evidence: true, required_form: "confirm_meeting", target_column: "call" });
  assert.equal(stageGate("won").required_form, "contract");
  assert.equal(stageGate("targeted").requires_evidence, false);
});
