// Proves People (search-first, paged, asserts NO work; Person page unified timeline) and
// Review (per-venture revenue funnel with denominators, a SEPARATE Morrow scorecard never
// summed with revenue, and a cash line sourced ONLY from contracts — honest $0 until signed).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "people-"));
process.env.CRM_DB_PATH = path.join(temp, "people.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion, advanceMotion } = await import("./active-motions.js");
const { queueDraft, approveDraft } = await import("./linkedin-drafts.js");
const { recordSend, pasteReply } = await import("./linkedin-events.js");
const { recordContractSigned } = await import("./offers.js");
const { buildPeopleIndex, buildPersonPage } = await import("./people-view.js");
const { buildReview } = await import("./review-view.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

async function seedLead(database, { name, company, domain, product, play_id, cohort_id }) {
  await upsertLeads([{ name, title: "VP Ops", company, company_domain: domain }], product, { cohort_id, play_id, strategy_version: STRATEGY_VERSION, stage: "test" });
  const id = database.prepare("SELECT id FROM leads WHERE product=? AND name=?").get(product, name).id;
  database.prepare("UPDATE leads SET linkedin_url=? WHERE id=?").run(`https://linkedin.com/in/${name.replace(/\W/g, "").toLowerCase()}`, id);
  return id;
}

let heroLead;
before(async () => {
  const database = db();
  // 30 gnk leads (to test paging), one of which we drive through the funnel.
  for (let i = 0; i < 30; i++) await seedLead(database, { name: `Person ${i}`, company: `Co ${i}`, domain: `co${i}.io`, product: "gnk", play_id: "GNK-AI-01", cohort_id: "pr-gnk" });
  heroLead = database.prepare("SELECT id FROM leads WHERE name='Person 0'").get().id;
  const m = openMotion(database, { lead_id: heroLead, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "pr-gnk", status: "approved" });
  const d = approveDraft(database, queueDraft(database, { motion_id: m.id, touch_number: 1, body: "Hi Person 0" }).id);
  recordSend(database, { draft_id: d.id });
  pasteReply(database, { motion_id: m.id, text: "Sounds interesting", sentiment: "positive" });
  // A morrow account that reaches a signed pilot (contract) — feeds the cash line + partners.
  const mid = await seedLead(database, { name: "Morrow Won", company: "MorrowWon", domain: "mw.io", product: "morrow", play_id: "MORROW-COPACK-01", cohort_id: "pr-mor" });
  const mm = openMotion(database, { lead_id: mid, venture: "morrow", play_id: "MORROW-COPACK-01", cohort_id: "pr-mor", status: "approved" });
  for (const s of ["contacted", "replied", "qualified", "proposal_review"]) advanceMotion(database, mm.id, s);
  recordContractSigned(database, { motion_id: mm.id, offer_id: "MORROW-PILOT-01", one_time: 25000, start_date: "2026-09-01" });
});

test("People is search-first and paged, and asserts NO work (no due dates in rows)", () => {
  const database = db();
  const p1 = buildPeopleIndex(database, { venture: "gnk", page: 1, pageSize: 25 });
  assert.equal(p1.total, 30);
  assert.equal(p1.rows.length, 25);
  assert.equal(buildPeopleIndex(database, { venture: "gnk", page: 2, pageSize: 25 }).rows.length, 5);
  assert.ok(p1.rows.every((r) => !("due_at" in r) && !("next_action_due" in r)), "no work/due fields asserted in People");
  const search = buildPeopleIndex(database, { query: "Person 0" });
  assert.ok(search.rows.some((r) => r.name === "Person 0"));
});

test("the Person page shows a unified, time-ordered thread with the reply body", () => {
  const database = db();
  const page = buildPersonPage(database, heroLead);
  assert.equal(page.lead.name, "Person 0");
  assert.equal(page.stage, "replied");
  assert.ok(page.motion && page.motion.status === "replied");
  const types = page.timeline.map((e) => e.type);
  assert.ok(types.includes("linkedin_message_sent") && types.includes("linkedin_reply_received"));
  assert.ok(page.timeline.some((e) => (e.detail || "").includes("Sounds interesting")), "the erasable reply body is joined into the thread");
  // Newest first.
  const ats = page.timeline.map((e) => e.at).filter(Boolean);
  assert.deepEqual(ats, [...ats].sort((a, b) => String(b).localeCompare(String(a))));
});

test("Review keeps the two funnels separate and never sums them", () => {
  const database = db();
  const r = buildReview(db(), { venture: null, window: "30d" });
  assert.equal(r.revenue.gnk.kind, "revenue");
  assert.equal(r.morrow.kind, "design_partner");
  assert.ok(r.revenue.gnk.sends.value >= 1, "gnk had a send");
  assert.equal(r.revenue.gnk.replies.denominator_of, "sends");
  // Morrow's partners live only on the morrow scorecard, never in a revenue 'won'.
  assert.equal(r.morrow.partners.value, 1);
  assert.equal(r.revenue.gnk.won.value, 0, "gnk has no won (no gnk contract)");
});

test("the cash line comes ONLY from contracts and is honest", () => {
  const database = db();
  const all = buildReview(db(), { venture: null });
  assert.equal(all.cash_line.booked, 25000, "the single morrow contract");
  assert.equal(all.cash_line.target, 40000);
  assert.equal(all.cash_line.source, "contracts");
  // A venture with no contract shows an honest zero.
  assert.equal(buildReview(db(), { venture: "gnk" }).cash_line.booked, 0);
  assert.equal(buildReview(db(), { venture: "outagehub" }).cash_line.booked, 0);
});
