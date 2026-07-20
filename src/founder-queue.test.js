// Proves the Today backend: HARD CAP 15, active-motion-only admission (historical orphan
// actions never appear and land in Archive), the [today-3d, today] due window, ordering
// (replies before follow-ups before approved drafts), scorecard denominators, and buckets.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "queue-"));
process.env.CRM_DB_PATH = path.join(temp, "queue.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion } = await import("./active-motions.js");
const { queueDraft, approveDraft } = await import("./linkedin-drafts.js");
const { recordSend, pasteReply } = await import("./linkedin-events.js");
const { buildTodayQueue, buildScorecard, buildBuckets, updateAction, TODAY_CAP } = await import("./founder-queue.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

const now = () => new Date().toISOString();
async function seedLead(database, { name, company, domain, product, play_id, cohort_id }) {
  await upsertLeads([{ name, title: "VP Ops", company, company_domain: domain }], product, { cohort_id, play_id, strategy_version: STRATEGY_VERSION, stage: "test" });
  const id = database.prepare("SELECT id FROM leads WHERE product=? AND name=?").get(product, name).id;
  database.prepare("UPDATE leads SET linkedin_url=? WHERE id=?").run(`https://linkedin.com/in/${name.replace(/\W/g, "").toLowerCase()}`, id);
  return id;
}
function approvedDraftMotion(database, leadId, venture, play_id, cohort_id) {
  const m = openMotion(database, { lead_id: leadId, venture, play_id, cohort_id, status: "approved" });
  const d = queueDraft(database, { motion_id: m.id, touch_number: 1, body: "Hi — worth a look?" });
  approveDraft(database, d.id);
  return m;
}

before(async () => {
  const database = db();
  // GNK: 17 motions each with an approved, unsent draft (always-admitted) -> tests the cap.
  for (let i = 0; i < 17; i++) {
    const id = await seedLead(database, { name: `Gnk ${i}`, company: `GnkCo${i}`, domain: `gnk${i}.io`, product: "gnk", play_id: "GNK-AI-01", cohort_id: "q-gnk" });
    approvedDraftMotion(database, id, "gnk", "GNK-AI-01", "q-gnk");
  }
  // OutageHub: one motion sent + replied (respond_to_reply due now, send_next_touch in future),
  // plus one motion with an approved draft.
  const oid = await seedLead(database, { name: "Ohub Reply", company: "OhubCo", domain: "ohub1.io", product: "outagehub", play_id: "OHUB-ISP-01", cohort_id: "q-oh" });
  const om = openMotion(database, { lead_id: oid, venture: "outagehub", play_id: "OHUB-ISP-01", cohort_id: "q-oh", status: "approved" });
  const od = approveDraft(database, queueDraft(database, { motion_id: om.id, touch_number: 1, body: "Hi Ohub" }).id);
  recordSend(database, { draft_id: od.id });
  pasteReply(database, { motion_id: om.id, text: "Interested", sentiment: "positive" });
  const oid2 = await seedLead(database, { name: "Ohub Draft", company: "OhubCo2", domain: "ohub2.io", product: "outagehub", play_id: "OHUB-EMBED-01", cohort_id: "q-oh2" });
  approvedDraftMotion(database, oid2, "outagehub", "OHUB-EMBED-01", "q-oh2");
  // Morrow: two motions with manually-controlled due dates (one today, one 10 days ago).
  for (const [i, offsetDays] of [[0, 0], [1, -10]]) {
    const id = await seedLead(database, { name: `Mor ${i}`, company: `MorCo${i}`, domain: `mor${i}.io`, product: "morrow", play_id: "MORROW-COPACK-01", cohort_id: "q-mor" });
    const m = openMotion(database, { lead_id: id, venture: "morrow", play_id: "MORROW-COPACK-01", cohort_id: "q-mor", status: "approved" });
    const due = new Date(Date.now() + offsetDays * 864e5).toISOString();
    database.prepare(`INSERT INTO next_actions(entity_type,entity_id,action_type,due_at,owner,status,priority,reason,source_key,active_motion_id,source,created_at,updated_at)
      VALUES('motion',?,?,?,'Andrew','open',120,?,?,?,'reply',?,?)`).run(String(m.id), "respond_to_reply", due, "reply", `q:${m.id}`, m.id, now(), now());
  }
  // A GNK motion sent but NOT replied — leaves a future send_next_touch (a backlog item).
  const gsid = await seedLead(database, { name: "Gnk Sent", company: "GnkSent", domain: "gnksent.io", product: "gnk", play_id: "GNK-BE-01", cohort_id: "q-gnk2" });
  const gsm = openMotion(database, { lead_id: gsid, venture: "gnk", play_id: "GNK-BE-01", cohort_id: "q-gnk2", status: "approved" });
  const gsd = approveDraft(database, queueDraft(database, { motion_id: gsm.id, touch_number: 1, body: "Hi" }).id);
  recordSend(database, { draft_id: gsd.id });
  // An orphan historical action (no motion) — must never reach Today, lands in Archive.
  database.prepare(`INSERT INTO next_actions(entity_type,entity_id,action_type,due_at,owner,status,priority,reason,source_key,created_at,updated_at)
    VALUES('conversation','999','follow_up',?, 'Andrew','open',50,'historical','orphan-1',?,?)`).run(now(), now(), now());
});

test("Today is hard-capped at 15 with honest overflow", () => {
  const database = db();
  const q = buildTodayQueue(database, { venture: "gnk" });
  assert.equal(q.admitted, 17);
  assert.equal(q.items.length, TODAY_CAP);
  assert.equal(q.overflow, 2);
  assert.ok(q.items.every((it) => it.venture === "gnk"));
});

test("replies sort before approved drafts; a future follow-up is NOT in Today", () => {
  const database = db();
  const q = buildTodayQueue(database, { venture: "outagehub" });
  assert.equal(q.items[0].action_type, "respond_to_reply", "the reply leads the queue");
  assert.ok(q.items.some((it) => it.kind === "draft"), "the approved draft is present");
  // The send_next_touch created by recordSend is due in the future -> excluded from Today.
  assert.ok(!q.items.some((it) => it.action_type === "send_next_touch"));
});

test("the [today-3d, today] window admits today and excludes a 10-day-old action", () => {
  const database = db();
  const q = buildTodayQueue(database, { venture: "morrow" });
  assert.equal(q.items.length, 1, "only the due-today action is admitted");
});

test("historical orphan actions never reach Today and are counted in Archive", () => {
  const database = db();
  for (const v of ["gnk", "outagehub", "morrow"]) {
    assert.ok(buildTodayQueue(database, { venture: v }).items.every((it) => it.motion_id), "every Today item is motion-bound");
  }
  assert.ok(buildBuckets(database).archive >= 1, "the orphan action is in Archive");
});

test("scorecard counts carry window, denominator, cohort, and confirmation", () => {
  const database = db();
  const s = buildScorecard(database, { venture: "outagehub", window: "30d" });
  assert.ok(s.sends.value >= 1 && s.replies.value >= 1);
  assert.equal(s.sends.cohort, "active motions");
  assert.equal(s.sends.confirmed, true);
  assert.equal(s.replies.denominator_of, "sends");
  assert.ok(s.sends.window.label.includes("30 days"));
});

test("updateAction snoozes (moves due_at), skips (needs reason), and completes", async () => {
  const database = db();
  const id = await seedLead(database, { name: "Act Item", company: "ActCo", domain: "act.io", product: "morrow", play_id: "MORROW-CPG-01", cohort_id: "q-act" });
  const m = openMotion(database, { lead_id: id, venture: "morrow", play_id: "MORROW-CPG-01", cohort_id: "q-act", status: "approved" });
  const mk = (type) => database.prepare(`INSERT INTO next_actions(entity_type,entity_id,action_type,due_at,owner,status,priority,reason,source_key,active_motion_id,source,created_at,updated_at)
    VALUES('motion',?,?,?, 'Andrew','open',50,'r',?,?,'system',?,?) RETURNING id`).get(String(m.id), type, now(), `k:${m.id}:${type}:${Math.random()}`, m.id, now(), now()).id;
  const a1 = mk("send_next_touch");
  const before = database.prepare("SELECT due_at FROM next_actions WHERE id=?").get(a1).due_at;
  const snoozed = updateAction(database, a1, "snooze", { until: "+3d" });
  assert.ok(snoozed.due_at > before, "snooze pushes due_at out");
  assert.throws(() => updateAction(database, a1, "skip", {}), /reason/);
  assert.equal(updateAction(database, a1, "skip", { reason: "Bad timing" }).status, "cancelled");
  const a2 = mk("decide_next_step"); // one-open-per-motion: a1 now cancelled, so a2 is allowed
  assert.equal(updateAction(database, a2, "complete", {}).status, "completed");
});

test("buckets separate inbox/backlog/watchlist/archive", () => {
  const database = db();
  assert.ok(buildBuckets(database, { venture: "outagehub" }).inbox >= 1, "the outagehub reply is in inbox");
  assert.ok(buildBuckets(database, { venture: "gnk" }).backlog >= 1, "the sent-not-replied motion's future follow-up is in backlog");
});
