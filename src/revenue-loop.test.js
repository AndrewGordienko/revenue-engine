import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "revenue-loop-"));
process.env.CRM_DB_PATH = path.join(temp, "crm.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads, readLeads, updateLead } = await import("./leads-store.js");
const { setStage, getLead } = await import("./crm-model.js");
const { approveOutreachCohort, approveOutreachMessage, createProviderDraft, listOutreachMessages, queueOutreachMessage, syncGmail } = await import("./outreach-queue.js");
const { proposeMeetingTimes, bookMeeting } = await import("./meetings.js");
const { openOpportunity, setOppStage } = await import("./opportunities.js");
const { buildPipelineReport } = await import("./pipeline-report.js");
const { readMemoryEvents } = await import("./lead-memory.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");

before(() => { fs.rmSync(process.env.CRM_DB_PATH, { force: true }); });
after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

class FakeGmail {
  async createDraft() { return { draft_id: "draft-1", message_id: "draft-message-1", thread_id: "thread-1" }; }
  async getThread() {
    return [
      { id: "sent-1", thread_id: "thread-1", labels: ["SENT"], subject: "Production workflow", body: "outbound", occurred_at: "2026-07-11T09:00:00.000Z" },
      { id: "reply-1", thread_id: "thread-1", labels: ["INBOX"], from: "pat@acme.ca", subject: "Re: Production workflow", body: "Yes, this is worth exploring. Let's schedule time next week.", occurred_at: "2026-07-11T10:00:00.000Z" },
    ];
  }
}

class FakeCalendar {
  async createMeeting() { return { event_id: "calendar-1", conference_url: "https://meet.example/calendar-1" }; }
}

test("synthetic prospect travels from approved cohort to booked meeting without state repair", async () => {
  const database = db();
  const cohortId = "gnk-ai-synthetic-2026-07-11";
  const ingest = await upsertLeads([{
    name: "Pat Lee", title: "VP Engineering", company: "Acme", company_domain: "acme.ca", product: "gnk", play_id: "GNK-AI-01",
    email_best: "pat@acme.ca", email_status: "found", verified: true, email_source_type: "published", email_source_url: "https://acme.ca/team",
    deliverability_status: "deliverable", deliverability_checked_at: new Date().toISOString(), recipient_jurisdiction: "CA",
    legal_basis: "published_business_address", legal_basis_evidence: { source_url: "https://acme.ca/team", address_published: true, role_relevant: true, no_solicitation_statement: false },
    source_url: "https://acme.ca/team", why_this_person: "Owns production engineering", trigger_event: "Public AI workflow launch",
  }], "gnk", { cohort_id: cohortId, play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "synthetic" });
  assert.equal(ingest.cohort_id, cohortId);
  const [legacyLead] = await readLeads("gnk");
  await updateLead(legacyLead.id, { email_best: "pat.lee@acme.ca", email_status: "found", verified: true, email_source_type: "published", email_source_url: "https://acme.ca/team", deliverability_status: "deliverable", deliverability_checked_at: new Date().toISOString() }, "gnk");
  assert.equal(getLead(database, legacyLead.id).email_best, "pat.lee@acme.ca", "email address updates canonically");
  assert.equal(getLead(database, legacyLead.id).address_found_or_guessed, "verified", "provenance updates canonically");
  assert.equal(getLead(database, legacyLead.id).deliverability_status, "deliverable", "deliverability updates canonically");

  approveOutreachCohort(cohortId, { approved_by: "founder", rules: { play_id: "GNK-AI-01", auto_send: false } }, database);
  setStage(database, legacyLead.id, "researched");
  setStage(database, legacyLead.id, "route_ready");

  const first = queueOutreachMessage({ lead_id: legacyLead.id, touch_number: 1, recipient: "pat.lee@acme.ca", subject: "Production workflow", body: "Grounded first touch", review_status: "ready", evidence: ["https://acme.ca/launch"] }, database);
  const followup = queueOutreachMessage({ lead_id: legacyLead.id, touch_number: 2, recipient: "pat.lee@acme.ca", subject: "Re: Production workflow", body: "Useful follow-up", review_status: "ready", evidence: ["https://acme.ca/launch"] }, database);
  approveOutreachMessage(first.id, { approved_by: "founder" }, database);
  approveOutreachMessage(followup.id, { approved_by: "founder" }, database);
  await createProviderDraft(first.id, new FakeGmail(), database);
  const sync = await syncGmail(new FakeGmail(), database);
  assert.equal(sync.events_recorded, 2);
  assert.equal(getLead(database, legacyLead.id).stage, "engaged");

  const messages = listOutreachMessages({ lead_id: legacyLead.id }, database);
  assert.equal(messages.find((message) => message.id === followup.id).status, "stopped", "reply stops future touches");
  assert.ok(messages.some((message) => message.message_type === "reply_draft" && message.status === "pending_approval"), "reply creates an approval-gated response draft");

  const proposals = await proposeMeetingTimes({ lead_id: legacyLead.id, provider: null }, database);
  assert.equal(proposals.slots.length, 3);
  const meeting = await bookMeeting({ lead_id: legacyLead.id, ...proposals.slots[0], provider: new FakeCalendar() }, database);
  assert.equal(meeting.status, "booked");
  const brief = JSON.parse(meeting.brief);
  assert.equal(brief.play_id, "GNK-AI-01");
  assert.equal(brief.latest_reply.classification.intent, "positive");

  const opportunity = openOpportunity(database, legacyLead.id, {});
  setOppStage(database, opportunity.id, "qualified", { qualification: { problem: "production workflow", consequence: "launch risk", owner: "Pat", timing: "now", decision_path: "founder approval", next_step: "discovery" } });
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "agents", "registry.json"), "utf8"));
  const report = buildPipelineReport(database, registry).products.find((entry) => entry.product === "gnk");
  assert.equal(report.actual.messages_sent, 1);
  assert.equal(report.actual.positive_replies, 1);
  assert.equal(report.actual.meetings_booked, 1);
  assert.equal(report.actual.meetings_held, 0, "booking is not reported as a held meeting");
  assert.equal(report.actual.qualified_opportunities, 1);

  const memory = await readMemoryEvents("gnk", legacyLead.id);
  assert.ok(memory.some((event) => event.type === "email_sent"));
  assert.ok(memory.some((event) => event.type === "reply" && event.payload.classification.intent === "positive"));
  assert.ok(memory.some((event) => event.type === "meeting"));
});
