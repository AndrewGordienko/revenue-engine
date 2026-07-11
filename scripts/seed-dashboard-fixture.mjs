if (process.env.ALLOW_FIXTURE_SEED !== "1" || !process.env.CRM_DB_PATH) {
  throw new Error("Fixture seeding requires ALLOW_FIXTURE_SEED=1 and an explicit CRM_DB_PATH");
}
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db } = await import("../src/db.js");
const { upsertLeads, readLeads } = await import("../src/leads-store.js");
const { setStage } = await import("../src/crm-model.js");
const { approveOutreachCohort, approveOutreachMessage, queueOutreachMessage } = await import("../src/outreach-queue.js");
const { recordRevenueEvent } = await import("../src/revenue-events.js");
const { openOpportunity, recordContractSigned, setOppStage } = await import("../src/opportunities.js");
const { STRATEGY_VERSION } = await import("../src/sales-plays.js");

const database = db();
const cohortId = "gnk-ai-dashboard-fixture";
const common = {
  title: "VP Engineering", product: "gnk", play_id: "GNK-AI-01",
  email_status: "found", verified: true, deliverability_status: "deliverable", deliverability_checked_at: new Date().toISOString(), recipient_jurisdiction: "US",
  legal_basis: "express_consent", legal_basis_evidence: { consent_source: "dashboard fixture", consent_at: new Date().toISOString() },
  source_url: "https://fixture.example/team", trigger_event: "Production AI workflow announced", why_this_person: "Owns production engineering",
};
await upsertLeads([
  { ...common, name: "Alex Morgan", company: "Northstar Systems", company_domain: "northstar.example", email_best: "alex@northstar.example" },
  { ...common, name: "Jordan Lee", company: "Harbour Operations", company_domain: "harbour.example", email_best: "jordan@harbour.example" },
], "gnk", { cohort_id: cohortId, play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "dashboard-fixture" });
approveOutreachCohort(cohortId, { approved_by: "fixture", rules: { play_id: "GNK-AI-01", auto_send: false, human_message_approval_required: true } }, database);

const leads = await readLeads("gnk");
const alex = leads.find((lead) => lead.name === "Alex Morgan");
const jordan = leads.find((lead) => lead.name === "Jordan Lee");
for (const lead of [alex, jordan]) { setStage(database, lead.id, "researched"); setStage(database, lead.id, "route_ready"); }

queueOutreachMessage({ lead_id: alex.id, touch_number: 1, recipient: alex.email_best, subject: "Northstar production workflow", body: "Grounded fixture outreach awaiting founder approval.", review_status: "ready", evidence: ["https://fixture.example/launch"] }, database);
const sent = queueOutreachMessage({ lead_id: jordan.id, touch_number: 1, recipient: jordan.email_best, subject: "Harbour production workflow", body: "Grounded fixture outreach already approved.", review_status: "ready", evidence: ["https://fixture.example/launch"] }, database);
approveOutreachMessage(sent.id, { approved_by: "fixture" }, database);
await recordRevenueEvent({ lead_id: jordan.id, type: "sent", source: "provider-sync", dedupe_key: "fixture:sent", payload: { outreach_message_id: sent.id, subject: sent.subject } }, database);
await recordRevenueEvent({ lead_id: jordan.id, type: "reply", source: "provider-sync", dedupe_key: "fixture:reply", payload: { subject: sent.subject, body: "Yes, this is relevant. Let's schedule time next week." } }, database);
await recordRevenueEvent({ lead_id: jordan.id, type: "meeting", source: "calendar-sync", dedupe_key: "fixture:meeting", payload: { starts_at: "2026-07-15T10:00:00.000Z" } }, database);

const opportunity = openOpportunity(database, jordan.id, {});
setOppStage(database, opportunity.id, "qualified", { qualification: { problem: "production AI controls", consequence: "launch risk", owner: "Jordan", timing: "now", decision_path: "CTO", next_step: "proposal" } });
setOppStage(database, opportunity.id, "solution_defined", { solution: { solution: "Production AI Workflow Sprint", success_metrics: "controlled workflow in production", price: "$50k", responsibilities: "GNK delivery, client access" } });
setOppStage(database, opportunity.id, "proposal", { next_step_at: "2026-07-16T10:00:00.000Z" });
recordContractSigned(database, opportunity.id, { one_time: 50000, start_date: "2026-07-20", implementation_cost: 15000, contract_type: "sprint" });

console.log(JSON.stringify({ ok: true, cohort_id: cohortId, leads: [alex.id, jordan.id] }, null, 2));
