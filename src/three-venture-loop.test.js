// CAPSTONE: from an EMPTY database, drive the full LinkedIn-only loop for all three
// ventures in parallel and prove the binding invariants:
//   promote → pending motion-bound draft (NO email state) → approve → record send →
//   paste reply → exactly one next action at each step, funnels never merge, honest zeros.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "threeventure-"));
process.env.CRM_DB_PATH = path.join(temp, "loop.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { getOpenMotionForLead, getMotion } = await import("./active-motions.js");
const { promoteLinkedInMessages } = await import("./promote-linkedin.js");
const { listDrafts, approveDraft } = await import("./linkedin-drafts.js");
const { recordSend, pasteReply } = await import("./linkedin-events.js");
const { accountStage, loopCompleteForRun } = await import("./loop-status.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

const RUN = "run-capstone-1";
const VENTURES = [
  { venture: "gnk", play_id: "GNK-AI-01", name: "Al Gnk", company: "GnkAcct", domain: "gnkacct.io", motion_type: "revenue" },
  { venture: "outagehub", play_id: "OHUB-ISP-01", name: "Oli Ohub", company: "OhubAcct", domain: "ohubacct.io", motion_type: "revenue" },
  { venture: "morrow", play_id: "MORROW-COPACK-01", name: "Mo Morrow", company: "MorrowAcct", domain: "morrowacct.io", motion_type: "design_partner" },
];

const state = {}; // venture -> { lead, draft }
before(async () => {
  const database = db();
  for (const v of VENTURES) {
    await upsertLeads([{ name: v.name, title: "VP Ops", company: v.company, company_domain: v.domain }], v.venture, {
      cohort_id: `${v.venture}-cap`, play_id: v.play_id, strategy_version: STRATEGY_VERSION, stage: "test",
    });
    const lead = database.prepare("SELECT * FROM leads WHERE product=? AND name=?").get(v.venture === "outagehub" ? "outagehub" : v.venture, v.name);
    database.prepare("UPDATE leads SET linkedin_url=? WHERE id=?").run(`https://linkedin.com/in/${v.venture}`, lead.id);
    const artifact = { linkedin_connection_messages: [{
      person_name: v.name, company: v.company, linkedin_url: `https://linkedin.com/in/${v.venture}`,
      connection_message: `Hi ${v.name.split(" ")[0]} — saw the workflow pain; worth a look?`,
      evidence_urls: [`https://${v.domain}/jobs`], generation_model: "gpt-x",
    }] };
    const res = promoteLinkedInMessages(artifact, v.venture, database, { pipeline_run_id: RUN });
    assert.equal(res.drafts_queued, 1, `${v.venture}: one draft queued`);
    state[v.venture] = { lead };
  }
});

test("promotion lands exactly one pending, motion-bound draft per venture — and NO email state", () => {
  const database = db();
  assert.equal(database.prepare("SELECT COUNT(*) c FROM outreach_messages").get().c, 0, "the email queue stays empty");
  for (const v of VENTURES) {
    const drafts = listDrafts(database, { lead_id: state[v.venture].lead.id });
    assert.equal(drafts.length, 1, `${v.venture}: one draft`);
    const d = drafts[0];
    assert.equal(d.review_status, "pending");
    assert.equal(d.channel, "linkedin");
    assert.ok(d.linkedin_profile_url && !("recipient" in d) && !("subject" in d), "LinkedIn-native, no email fields");
    const motion = getOpenMotionForLead(database, state[v.venture].lead.id);
    assert.ok(motion, `${v.venture}: a motion was opened`);
    assert.equal(motion.status, "approved", "promoter opens the motion at 'approved'");
    assert.equal(motion.venture, v.venture);
    state[v.venture].draft = d;
    state[v.venture].motion = motion;
  }
});

test("at the pending stage only the CURRENT run completes; a stale run does not", () => {
  const database = db();
  for (const v of VENTURES) {
    const lead = state[v.venture].lead;
    assert.equal(loopCompleteForRun(database, lead, RUN), true, `${v.venture}: current run complete`);
    assert.equal(loopCompleteForRun(database, lead, "stale-run"), false, `${v.venture}: stale run NOT complete`);
    assert.equal(accountStage(database, lead), "pending_approval");
  }
});

test("the revenue and design-partner funnels never merge (motion_type is venture-correct)", () => {
  const database = db();
  for (const v of VENTURES) {
    assert.equal(getMotion(database, state[v.venture].motion.id).motion_type, v.motion_type, `${v.venture}: ${v.motion_type}`);
  }
});

test("full loop per venture: approve -> record send -> paste reply, one action at each step", () => {
  const database = db();
  const openActions = (motionId) => database.prepare("SELECT * FROM next_actions WHERE entity_type='motion' AND entity_id=? AND status='open'").all(String(motionId));
  for (const v of VENTURES) {
    const { draft, motion, lead } = state[v.venture];
    approveDraft(database, draft.id);
    const sent = recordSend(database, { draft_id: draft.id });
    assert.equal(sent.motion_status, "contacted", `${v.venture}: contacted after send`);
    assert.equal(accountStage(database, lead), "sent");
    let actions = openActions(motion.id);
    assert.equal(actions.length, 1, `${v.venture}: one action after send`);
    assert.equal(actions[0].action_type, "send_next_touch");

    const reply = pasteReply(database, { motion_id: motion.id, text: "Interested — tell me more.", sentiment: "positive" });
    assert.equal(reply.motion_status, "replied", `${v.venture}: replied after paste`);
    assert.ok(reply.stopped_drafts >= 0);
    assert.equal(accountStage(database, lead), "replied");
    actions = openActions(motion.id);
    assert.equal(actions.length, 1, `${v.venture}: still exactly one action after reply`);
    assert.equal(actions[0].action_type, "respond_to_reply");
  }
});

test("honest zeros — no contracts and no booked revenue exist until one is signed", () => {
  const database = db();
  assert.equal(database.prepare("SELECT COUNT(*) c FROM contracts").get().c, 0);
  assert.equal(database.prepare("SELECT COALESCE(SUM(mrr),0)+COALESCE(SUM(one_time),0) s FROM contracts").get().s, 0);
  assert.equal(database.prepare("SELECT COUNT(*) c FROM opportunities").get().c, 0);
});
