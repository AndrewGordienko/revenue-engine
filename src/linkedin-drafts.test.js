// Proves the LinkedIn-native draft object + the P0 promoter: a linkedin_connection_messages
// artifact becomes pending, motion-bound drafts in outreach_drafts_v2 — no email shape,
// draft-only, fail-closed on unmatched/no-play/no-profile, idempotent on re-run.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lidrafts-"));
process.env.CRM_DB_PATH = path.join(temp, "lidrafts.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { openMotion, closeMotion } = await import("./active-motions.js");
const {
  queueDraft, getDraft, listDrafts, editDraft, approveDraft, rejectDraft,
  markDraftCopied, markDraftSent, stopDraftsForMotion,
} = await import("./linkedin-drafts.js");
const { promoteLinkedInMessages, matchLead } = await import("./promote-linkedin.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

async function seedLead(database, { name, company, domain, product, play_id, cohort_id, linkedin_url }) {
  await upsertLeads([{ name, title: "VP Ops", company, company_domain: domain }], product, {
    cohort_id, play_id, strategy_version: STRATEGY_VERSION, stage: "test",
  });
  const id = database.prepare("SELECT id FROM leads WHERE product=? AND name=?").get(product, name).id;
  if (linkedin_url) database.prepare("UPDATE leads SET linkedin_url=? WHERE id=?").run(linkedin_url, id);
  return id;
}

let mLead1, mLead2, mLeadNoLI, pLead1, pLead2, pLeadNoPlay;
before(async () => {
  const database = db();
  mLead1 = await seedLead(database, { name: "Mona One", company: "Mod One", domain: "modone.ai", product: "gnk", play_id: "GNK-AI-01", cohort_id: "m-1", linkedin_url: "https://linkedin.com/in/monaone" });
  mLead2 = await seedLead(database, { name: "Moe Two", company: "Mod Two", domain: "modtwo.io", product: "gnk", play_id: "GNK-BE-01", cohort_id: "m-2", linkedin_url: "https://linkedin.com/in/moetwo" });
  mLeadNoLI = await seedLead(database, { name: "Nel NoLink", company: "Dark Co", domain: "darkco.io", product: "gnk", play_id: "GNK-DATA-01", cohort_id: "m-3" });
  pLead1 = await seedLead(database, { name: "Pia One", company: "Acme Prod", domain: "acme.com", product: "gnk", play_id: "GNK-AI-01", cohort_id: "p-1", linkedin_url: "https://linkedin.com/in/pia" });
  pLead2 = await seedLead(database, { name: "Quinn Two", company: "Beta Labs", domain: "beta.io", product: "gnk", play_id: "GNK-BE-01", cohort_id: "p-2", linkedin_url: "https://linkedin.com/in/quinn" });
  pLeadNoPlay = await seedLead(database, { name: "Ned NoPlay", company: "Freefirm", domain: "freefirm.io", product: "gnk", cohort_id: "p-none" });
});

test("queueDraft creates a pending LinkedIn draft with the lead's profile + stored evidence", () => {
  const database = db();
  const m = openMotion(database, { lead_id: mLead1, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "m-1" });
  const draft = queueDraft(database, { motion_id: m.id, touch_number: 1, body: "Hi Mona — saw your data role posting.", evidence: [{ source_url: "https://modone.ai/jobs" }], writer_version: "gpt-x" });
  assert.equal(draft.review_status, "pending");
  assert.equal(draft.channel, "linkedin");
  assert.equal(draft.message_kind, "connection_note");
  assert.equal(draft.venture, "gnk");
  assert.equal(draft.linkedin_profile_url, "https://linkedin.com/in/monaone");
  assert.equal(JSON.parse(draft.evidence_json).length, 1);
  assert.ok(!draft.recipient && !draft.subject, "no email recipient/subject fields exist on this object");
});

test("queueDraft fails closed without a body, on a closed motion, and without any profile URL", () => {
  const database = db();
  const m = openMotion(database, { lead_id: mLead2, venture: "gnk", play_id: "GNK-BE-01", cohort_id: "m-2" });
  assert.throws(() => queueDraft(database, { motion_id: m.id, touch_number: 1, body: "  " }), /body is required/);
  const noli = openMotion(database, { lead_id: mLeadNoLI, venture: "gnk", play_id: "GNK-DATA-01", cohort_id: "m-3" });
  assert.throws(() => queueDraft(database, { motion_id: noli.id, touch_number: 1, body: "hi" }), /no LinkedIn profile URL/);
  const closed = closeMotion(database, noli.id, { status: "closed_no_fit" });
  assert.throws(() => queueDraft(database, { motion_id: closed.id, touch_number: 1, body: "hi", linkedin_profile_url: "https://x" }), /is closed/);
});

test("queueDraft is idempotent on (motion, touch): re-queue overwrites body and resets to pending", () => {
  const database = db();
  const m = database.prepare("SELECT id FROM active_motions WHERE lead_id=? AND closed_at IS NULL").get(mLead1);
  const first = listDrafts(database, { motion_id: m.id })[0];
  approveDraft(database, first.id);
  const requeued = queueDraft(database, { motion_id: m.id, touch_number: 1, body: "Rewritten opener." });
  assert.equal(requeued.id, first.id, "same row, not a duplicate");
  assert.equal(requeued.body, "Rewritten opener.");
  assert.equal(requeued.review_status, "pending", "re-queue resets an approved draft to pending");
  assert.equal(requeued.approved_at, null);
});

test("approve -> edit-approved-body -> mark sent; copy stamps copied_at without changing state", () => {
  const database = db();
  const m = database.prepare("SELECT id FROM active_motions WHERE lead_id=? AND closed_at IS NULL").get(mLead1);
  const d = listDrafts(database, { motion_id: m.id })[0];
  const approved = approveDraft(database, d.id, { approved_by: "Andrew" });
  assert.equal(approved.review_status, "approved");
  assert.equal(approved.approved_body, approved.body, "approved_body defaults to the current body");
  const edited = editDraft(database, d.id, { body: "Final edited text." });
  assert.equal(edited.approved_body, "Final edited text.", "editing an approved draft updates approved_body");
  const copied = markDraftCopied(database, d.id);
  assert.ok(copied.copied_at && copied.review_status === "approved", "copy does not change review state");
  const sent = markDraftSent(database, d.id);
  assert.ok(sent.sent_at);
  assert.equal(markDraftSent(database, d.id).sent_at, sent.sent_at, "mark sent is idempotent");
});

test("reject requires a reason; stopDraftsForMotion halts unsent drafts", () => {
  const database = db();
  // mLead2 already has an open motion from the "fails closed" test — reuse it.
  const motionId = database.prepare("SELECT id FROM active_motions WHERE lead_id=? AND closed_at IS NULL").get(mLead2).id;
  const d = queueDraft(database, { motion_id: motionId, touch_number: 2, message_kind: "follow_up", body: "Following up." });
  assert.throws(() => rejectDraft(database, d.id, {}), /reason is required/);
  const stopped = stopDraftsForMotion(database, motionId, { reason: "reply_received" });
  assert.ok(stopped >= 1, "at least one unsent draft stopped");
  assert.ok(getDraft(database, d.id).stopped_at, "the follow-up is stopped");
});

test("matchLead resolves name+company within the venture", () => {
  const database = db();
  assert.equal(matchLead(database, "gnk", { person_name: "Pia One", company: "Acme Prod" }).id, pLead1);
  assert.equal(matchLead(database, "gnk", { person_name: "Nobody", company: "Nowhere Inc" }), null);
});

test("promoteLinkedInMessages queues motion-bound pending drafts and skips with explicit reasons", () => {
  const database = db();
  const artifact = { linkedin_connection_messages: [
    { person_name: "Pia One", company: "Acme Prod", linkedin_url: "https://linkedin.com/in/pia", connection_message: "Hi Pia — saw the platform hiring.", evidence_urls: ["https://acme.com/jobs"], generation_model: "gpt-x" },
    { person_name: "Quinn Two", company: "Beta Labs", linkedin_url: "https://linkedin.com/in/quinn", connection_message: "Hi Quinn — the migration post caught my eye.", evidence_urls: [], generation_model: "gpt-x" },
    { person_name: "Ghost User", company: "Nonexistent Inc", linkedin_url: "https://x", connection_message: "hi" },
    { person_name: "Ned NoPlay", company: "Freefirm", linkedin_url: "https://li/ned", connection_message: "hi" },
  ] };
  const res = promoteLinkedInMessages(artifact, "gnk", database);
  assert.equal(res.drafts_queued, 2);
  assert.equal(res.accounts_queued, 2);
  assert.equal(res.skipped_reasons.no_matching_lead, 1);
  assert.equal(res.skipped_reasons.lead_has_no_play, 1);
  // The two queued drafts are pending and bound to a fresh 'approved'-status motion.
  const d1 = listDrafts(database, { lead_id: pLead1 })[0];
  assert.equal(d1.review_status, "pending");
  const motion = database.prepare("SELECT * FROM active_motions WHERE id=?").get(d1.motion_id);
  assert.equal(motion.status, "approved");
  assert.equal(motion.venture, "gnk");
});

test("promotion is idempotent — a second run does not duplicate drafts", () => {
  const database = db();
  const artifact = { linkedin_connection_messages: [
    { person_name: "Pia One", company: "Acme Prod", linkedin_url: "https://linkedin.com/in/pia", connection_message: "Hi Pia — updated opener.", evidence_urls: [], generation_model: "gpt-x" },
  ] };
  const before = listDrafts(database, { lead_id: pLead1 }).length;
  promoteLinkedInMessages(artifact, "gnk", database);
  const after = listDrafts(database, { lead_id: pLead1 }).length;
  assert.equal(after, before, "re-promotion upserts the same draft, never duplicates");
  assert.equal(listDrafts(database, { lead_id: pLead1 })[0].body, "Hi Pia, updated opener."); // em dash stripped at queue time
});

test("listDrafts scopes by venture and review_status", () => {
  const database = db();
  const all = listDrafts(database, { venture: "gnk" });
  assert.ok(all.length >= 2 && all.every((d) => d.venture === "gnk"));
  const pending = listDrafts(database, { venture: "gnk", review_status: "pending" });
  assert.ok(pending.every((d) => d.review_status === "pending"));
});
