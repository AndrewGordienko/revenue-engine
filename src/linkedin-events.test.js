// Proves the canonical LinkedIn event loop: Record-sent and Paste-reply drive the motion
// state machine with EXACTLY one transition + one canonical event each, keep exactly one
// open next action per motion, refuse to attribute a reply with no prior send, and keep
// reply bodies erasable without disturbing the immutable ledger.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lievents-"));
process.env.CRM_DB_PATH = path.join(temp, "lievents.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion, getMotion } = await import("./active-motions.js");
const { queueDraft, approveDraft, getDraft } = await import("./linkedin-drafts.js");
const { recordSend, pasteReply, recordMotionEvent, eraseMessageBody } = await import("./linkedin-events.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

async function seedLead(database, { name, company, domain, play_id, cohort_id, linkedin_url }) {
  await upsertLeads([{ name, title: "VP Ops", company, company_domain: domain }], "gnk", { cohort_id, play_id, strategy_version: STRATEGY_VERSION, stage: "test" });
  const id = database.prepare("SELECT id FROM leads WHERE product='gnk' AND name=?").get(name).id;
  if (linkedin_url) database.prepare("UPDATE leads SET linkedin_url=? WHERE id=?").run(linkedin_url, id);
  return id;
}
const openActions = (database, motionId) => database.prepare("SELECT * FROM next_actions WHERE entity_type='motion' AND entity_id=? AND status='open'").all(String(motionId));
const sentEvents = (database, motionId) => database.prepare("SELECT COUNT(*) c FROM activity_events WHERE type='linkedin_message_sent' AND payload LIKE ?").get(`%"motion_id":${motionId}%`).c;

let m1, m2, m3, draft1, replyBodyRef;
before(async () => {
  const database = db();
  const l1 = await seedLead(database, { name: "Eve One", company: "Ev One", domain: "evone.ai", play_id: "GNK-AI-01", cohort_id: "e-1", linkedin_url: "https://linkedin.com/in/eveone" });
  const l2 = await seedLead(database, { name: "Fay Two", company: "Fay Two", domain: "faytwo.io", play_id: "GNK-AI-01", cohort_id: "e-2", linkedin_url: "https://linkedin.com/in/faytwo" });
  const l3 = await seedLead(database, { name: "Gia Three", company: "Gia Three", domain: "giathree.io", play_id: "GNK-AI-01", cohort_id: "e-3", linkedin_url: "https://linkedin.com/in/giathree" });
  m1 = openMotion(database, { lead_id: l1, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "e-1", status: "approved" });
  m2 = openMotion(database, { lead_id: l2, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "e-2", status: "approved" });
  m3 = openMotion(database, { lead_id: l3, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "e-3", status: "approved" });
  draft1 = approveDraft(database, queueDraft(database, { motion_id: m1.id, touch_number: 1, body: "Hi Eve — saw the platform hiring." }).id);
});

test("recordSend advances approved->contacted, writes one event, schedules the next touch", () => {
  const database = db();
  const res = recordSend(database, { draft_id: draft1.id });
  assert.equal(res.motion_status, "contacted");
  assert.equal(res.event, "linkedin_message_sent");
  const m = getMotion(database, m1.id);
  assert.equal(m.status, "contacted");
  assert.ok(m.last_touch_at, "last_touch_at stamped");
  assert.equal(sentEvents(database, m1.id), 1, "exactly one canonical sent event");
  assert.ok(getDraft(database, draft1.id).sent_at, "draft stamped sent");
  const actions = openActions(database, m1.id);
  assert.equal(actions.length, 1, "exactly one open next action");
  assert.equal(actions[0].action_type, "send_next_touch");
  assert.equal(actions[0].active_motion_id, m1.id);
});

test("recordSend is idempotent — a second call adds no event and no transition", () => {
  const database = db();
  const res = recordSend(database, { draft_id: draft1.id });
  assert.equal(res.already_sent, true);
  assert.equal(sentEvents(database, m1.id), 1, "still exactly one sent event");
  assert.equal(getMotion(database, m1.id).status, "contacted");
});

test("recordSend refuses a draft that is not approved", () => {
  const database = db();
  const pending = queueDraft(database, { motion_id: m1.id, touch_number: 2, message_kind: "follow_up", body: "Following up." });
  assert.throws(() => recordSend(database, { draft_id: pending.id }), /must be approved/);
});

test("sending the last touch schedules a decide-next-step action", () => {
  const database = db();
  const last = approveDraft(database, queueDraft(database, { motion_id: m2.id, touch_number: 4, message_kind: "follow_up", body: "Closing the loop." }).id);
  recordSend(database, { draft_id: last.id });
  const actions = openActions(database, m2.id);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action_type, "decide_next_step");
});

test("pasteReply refuses to attribute a reply with no prior send", () => {
  const database = db();
  assert.throws(() => pasteReply(database, { motion_id: m3.id, text: "Interested!" }), /no prior send/);
});

test("pasteReply attributes to the send, advances to replied, stops drafts, leaves ONE action", () => {
  const database = db();
  const res = pasteReply(database, { motion_id: m1.id, text: "Yes — what would a first sprint look like?", sentiment: "positive" });
  assert.equal(res.motion_status, "replied");
  assert.ok(res.stopped_drafts >= 1, "the pending follow-up draft was stopped");
  replyBodyRef = res.body_ref;
  const stored = database.prepare("SELECT * FROM erasable_message_bodies WHERE id=?").get(replyBodyRef);
  assert.equal(stored.direction, "inbound");
  assert.equal(stored.sentiment, "positive");
  const actions = openActions(database, m1.id);
  assert.equal(actions.length, 1, "the send_next_touch action was replaced, not duplicated");
  assert.equal(actions[0].action_type, "respond_to_reply");
});

test("recordMotionEvent walks the mid-funnel: meeting -> qualified -> proposal -> signed", () => {
  const database = db();
  assert.equal(recordMotionEvent(database, { motion_id: m1.id, type: "meeting_confirmed" }).status, "meeting_confirmed");
  assert.equal(recordMotionEvent(database, { motion_id: m1.id, type: "qualification_confirmed" }).status, "qualified");
  assert.equal(recordMotionEvent(database, { motion_id: m1.id, type: "proposal_reviewed" }).status, "proposal_review");
  assert.equal(recordMotionEvent(database, { motion_id: m1.id, type: "contract_signed" }).status, "signed");
});

test("a reply body is erasable while the immutable event survives", () => {
  const database = db();
  const eventsBefore = database.prepare("SELECT COUNT(*) c FROM activity_events WHERE type='linkedin_reply_received'").get().c;
  const removed = eraseMessageBody(database, replyBodyRef);
  assert.equal(removed, 1);
  assert.equal(database.prepare("SELECT COUNT(*) c FROM erasable_message_bodies WHERE id=?").get(replyBodyRef).c, 0, "body deleted");
  assert.equal(database.prepare("SELECT COUNT(*) c FROM activity_events WHERE type='linkedin_reply_received'").get().c, eventsBefore, "immutable event survives");
});
