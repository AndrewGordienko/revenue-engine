import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "draft-only-"));
process.env.CRM_DB_PATH = path.join(temp, "crm.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";
delete process.env.OUTBOUND_SENDING_ENABLED; // draft-only is the default

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads, readLeads } = await import("./leads-store.js");
const { setStage, getLead } = await import("./crm-model.js");
const { approveOutreachCohort, approveOutreachMessage, createProviderDraft, queueOutreachMessage, sendApprovedDraft } = await import("./outreach-queue.js");
const { buildPipelineReport } = await import("./pipeline-report.js");
const { GmailProvider } = await import("./google-workspace.js");
const { assertSendingUnsupported, OUTBOUND_SENDING_SUPPORTED } = await import("./outbound-guard.js");
const { getCohort } = await import("./lineage.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");

before(() => { fs.rmSync(process.env.CRM_DB_PATH, { force: true }); });
after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

// A provider whose send method must NEVER be reached in draft-only mode.
class ExplodingGmail {
  async createDraft() { return { draft_id: "draft-x", message_id: "m-x", thread_id: "t-x" }; }
  async sendDraft() { throw new Error("PROVIDER_SEND_REACHED: this must never run in draft-only mode"); }
}

test("sending is unsupported in this build and cannot be enabled by configuration", () => {
  process.env.OUTBOUND_SENDING_ENABLED = "1"; // must have no effect whatsoever
  assert.equal(OUTBOUND_SENDING_SUPPORTED, false);
  assert.throws(() => assertSendingUnsupported("x"), /OUTBOUND_SENDING_UNSUPPORTED/);
  delete process.env.OUTBOUND_SENDING_ENABLED;
});

test("GmailProvider.sendDraft throws unconditionally, even with OUTBOUND_SENDING_ENABLED=1", async () => {
  const gmail = new GmailProvider({ env: { OUTBOUND_SENDING_ENABLED: "1" } });
  await assert.rejects(() => gmail.sendDraft("draft-x"), /OUTBOUND_SENDING_UNSUPPORTED/);
});

test("cohort approval forces auto_send off and human approval on, even if a caller asks otherwise", async () => {
  const database = db();
  const cohortId = "gnk-ai-draftonly-cohort";
  await upsertLeads([{
    name: "Dana Fox", title: "CTO", company: "Vector", company_domain: "vector.example", product: "gnk", play_id: "GNK-AI-01",
    email_best: "dana@vector.example", email_status: "found", verified: true, email_source_type: "published", email_source_url: "https://vector.example/team",
    deliverability_status: "deliverable", deliverability_checked_at: new Date().toISOString(), recipient_jurisdiction: "US",
    legal_basis: "express_consent", legal_basis_evidence: { consent_source: "test", consent_at: new Date().toISOString() },
    source_url: "https://vector.example/team", why_this_person: "Owns production", trigger_event: "AI launch",
  }], "gnk", { cohort_id: cohortId, play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "synthetic" });
  approveOutreachCohort(cohortId, { approved_by: "founder", rules: { auto_send: true, human_message_approval_required: false, note: "attempted override" } }, database);
  const rules = JSON.parse(getCohort(database, cohortId).rules);
  assert.equal(rules.auto_send, false, "auto_send is forced off");
  assert.equal(rules.human_message_approval_required, true, "human approval is forced on");
});

test("creating a Gmail draft never marks the lead contacted and never records a sent event", async () => {
  const database = db();
  const [lead] = await readLeads("gnk");
  setStage(database, lead.id, "researched");
  setStage(database, lead.id, "route_ready");
  const msg = queueOutreachMessage({ lead_id: lead.id, touch_number: 1, recipient: lead.email_best, subject: "Vector production workflow", body: "Grounded first touch", review_status: "ready", evidence: ["https://vector.example/launch"] }, database);
  approveOutreachMessage(msg.id, { approved_by: "founder" }, database);
  await createProviderDraft(msg.id, new ExplodingGmail(), database);

  const after = getLead(database, lead.id);
  assert.equal(after.stage, "route_ready", "a draft must not advance the lead to a contacted/enrolled state");
  const report = buildPipelineReport(database).cohorts.find((row) => row.play_id === "GNK-AI-01");
  assert.equal(report.messages_sent, 0, "no sent event is recorded merely because a draft exists");
});

test("sendApprovedDraft refuses unconditionally, even with confirmation and the env flag set", async () => {
  process.env.OUTBOUND_SENDING_ENABLED = "1"; // must have no effect
  const database = db();
  const messages = database.prepare("SELECT id FROM outreach_messages WHERE status='provider_draft' LIMIT 1").all();
  assert.ok(messages.length, "a provider draft exists to attempt sending");
  await assert.rejects(
    () => sendApprovedDraft(messages[0].id, new ExplodingGmail(), { confirmed: true }, database),
    /OUTBOUND_SENDING_UNSUPPORTED/,
    "sending must be blocked before the provider send method is reached"
  );
  delete process.env.OUTBOUND_SENDING_ENABLED;
});
