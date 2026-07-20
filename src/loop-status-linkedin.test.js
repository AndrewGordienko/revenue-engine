// Proves the completion predicate is LinkedIn-native: a pending draft in outreach_drafts_v2
// counts as pending_approval, a recorded send/reply advances the reported stage, and — the
// key guarantee — only a CURRENT-RUN draft satisfies loop completion; a stale draft from a
// previous pipeline run cannot make this run look finished.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "loopstat-"));
process.env.CRM_DB_PATH = path.join(temp, "loopstat.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion } = await import("./active-motions.js");
const { queueDraft, approveDraft, getDraft } = await import("./linkedin-drafts.js");
const { recordSend, pasteReply } = await import("./linkedin-events.js");
const { accountStage, isLoopComplete, loopCompleteForRun } = await import("./loop-status.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

async function seedLead(database, { name, company, domain, linkedin_url }) {
  await upsertLeads([{ name, title: "VP Ops", company, company_domain: domain }], "gnk", { cohort_id: "ls-1", play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  const id = database.prepare("SELECT id FROM leads WHERE product='gnk' AND name=?").get(name).id;
  if (linkedin_url) database.prepare("UPDATE leads SET linkedin_url=? WHERE id=?").run(linkedin_url, id);
  return database.prepare("SELECT * FROM leads WHERE id=?").get(id);
}

let lead, motion;
before(async () => {
  const database = db();
  lead = await seedLead(database, { name: "Ivy One", company: "Ivy Co", domain: "ivy.io", linkedin_url: "https://linkedin.com/in/ivyone" });
  motion = openMotion(database, { lead_id: lead.id, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "ls-1", status: "approved" });
});

test("a pending LinkedIn draft makes the account read pending_approval (loop complete)", () => {
  const database = db();
  queueDraft(database, { motion_id: motion.id, touch_number: 1, body: "Hi Ivy — saw the platform hiring.", pipeline_run_id: "run-A" });
  const stage = accountStage(database, lead);
  assert.equal(stage, "pending_approval");
  assert.ok(isLoopComplete(stage));
});

test("only a CURRENT-RUN draft satisfies completion; a stale run does not", () => {
  const database = db();
  // The draft above belongs to run-A.
  assert.equal(loopCompleteForRun(database, lead, "run-A"), true, "current run is complete");
  assert.equal(loopCompleteForRun(database, lead, "run-B"), false, "a different (stale) run is NOT complete");
});

test("a stopped draft no longer counts as pending", async () => {
  const database = db();
  const l2 = await seedLead(database, { name: "Jo Two", company: "Jo Co", domain: "jo.io", linkedin_url: "https://linkedin.com/in/jotwo" });
  const m2 = openMotion(database, { lead_id: l2.id, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "ls-1", status: "approved" });
  const d = queueDraft(database, { motion_id: m2.id, touch_number: 1, body: "hi", pipeline_run_id: "run-A" });
  assert.equal(accountStage(database, l2), "pending_approval");
  database.prepare("UPDATE outreach_drafts_v2 SET stopped_at=? WHERE id=?").run(new Date().toISOString(), d.id);
  assert.equal(accountStage(database, l2), "seeded", "a stopped draft is no longer pending");
  assert.equal(loopCompleteForRun(database, l2, "run-A"), false);
});

test("recording a send then a reply advances the reported stage via LinkedIn events", () => {
  const database = db();
  const d = getDraft(database, database.prepare("SELECT id FROM outreach_drafts_v2 WHERE motion_id=?").get(motion.id).id);
  approveDraft(database, d.id);
  recordSend(database, { draft_id: d.id });
  assert.equal(accountStage(database, lead), "sent", "linkedin_message_sent reads as sent");
  assert.equal(loopCompleteForRun(database, lead, "run-ANYTHING"), true, "a real send counts regardless of run");
  pasteReply(database, { motion_id: motion.id, text: "Yes, tell me more", sentiment: "positive" });
  assert.equal(accountStage(database, lead), "replied", "linkedin_reply_received reads as replied");
});
