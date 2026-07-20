import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeLinkedinConversation, buildOutreachInsights, parseLinkedinChatsText } from "./linkedin-chats.js";

const PAGE = `0 notifications total
Conversation List
Load more conversations
Alex Smith
VP Engineering
Open the options list in your conversation with Alex Smith and Andrew Gordienko

Tuesday
Andrew Gordienko sent the following message at 3:00 PM
View Andrew’s profileAndrew Gordienko
Andrew Gordienko   3:00 PM
Would Thursday at 2:00 p.m. ET work for a quick call?

Alex Smith sent the following message at 3:15 PM
View Alex’s profileAlex Smith
Alex Smith   3:15 PM
Sure, that works. alex@example.com

Today
Andrew Gordienko sent the following messages at 5:00 PM
View Andrew’s profileAndrew Gordienko
Andrew Gordienko   5:00 PM
Just sent the calendar invite. Looking forward to speaking then!

Maximize compose field
`;

test("chat cleanup removes LinkedIn chrome and extracts person-level messages", () => {
  const conversations = parseLinkedinChatsText(PAGE);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].name, "Alex Smith");
  assert.equal(conversations[0].headline, "VP Engineering");
  assert.equal(conversations[0].messages.length, 3);
  assert.deepEqual(conversations[0].messages.map((message) => message.direction), ["outbound", "inbound", "outbound"]);
  assert.equal(conversations[0].messages[0].sent_at, "2026-07-14T15:00:00");
  assert.doesNotMatch(conversations[0].messages[1].body, /View Alex/);
});

test("a compact copied thread can use a person-name hint", () => {
  const compact = `Today
View Alex Smith’s profile
Alex Smith 6:00 PM
Thanks Andrew, I can send the workflow notes tomorrow.
React with`;
  const conversations = parseLinkedinChatsText(compact, { referenceDay: "2026-07-16", nameHint: "Alex Smith" });
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].name, "Alex Smith");
  assert.equal(conversations[0].messages.length, 1);
  assert.equal(conversations[0].messages[0].direction, "inbound");
  const inferred = parseLinkedinChatsText(compact, { referenceDay: "2026-07-16" });
  assert.equal(inferred[0].name, "Alex Smith");
  assert.equal(inferred[0].messages[0].fingerprint, conversations[0].messages[0].fingerprint);
});

test("conversation analysis extracts scheduled calls, contact details, and response learnings", () => {
  const conversation = parseLinkedinChatsText(PAGE)[0];
  const analyzed = { ...conversation, ...analyzeLinkedinConversation(conversation, { product: "gnk" }) };
  assert.equal(analyzed.status, "meeting_booked");
  assert.equal(analyzed.meeting_status, "scheduled");
  assert.equal(analyzed.meeting_at, "2026-07-16T14:00:00");
  assert.deepEqual(analyzed.contact_details.emails, ["alex@example.com"]);
  const insights = buildOutreachInsights([analyzed]);
  assert.equal(insights.replied, 1);
  assert.equal(insights.scheduled, 1);
  assert.equal(insights.by_product.gnk.meetings, 1);
});

test("chat import links the connection, marks it contacted, and preserves human workflow edits", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salesv3-chats-"));
  process.env.CRM_DB_PATH = path.join(dir, "crm.db");
  const { db, _closeForTest } = await import("./db.js");
  const { importLinkedinChats } = await import("./import-linkedin-chats.js");
  const database = db();
  const now = "2026-07-15T12:00:00.000Z";
  database.prepare(`INSERT INTO linkedin_connections
    (identity_key,name,headline,connected_on,profile_url,primary_product,product_scores,created_at,updated_at)
    VALUES('linkedin-connection:alex smith|2026-07-14','Alex Smith','VP Engineering','2026-07-14',
    'https://www.linkedin.com/search/results/people/?keywords=Alex','gnk','{}',?,?)`).run(now, now);
  const firstImport = importLinkedinChats(database, PAGE);
  const conversation = database.prepare("SELECT * FROM linkedin_conversations WHERE name='Alex Smith'").get();
  assert.ok(conversation.connection_id);
  assert.equal(conversation.message_count, 3);
  assert.equal(conversation.meeting_status, "scheduled");
  assert.ok(database.prepare("SELECT contacted_at FROM linkedin_connections WHERE name='Alex Smith'").get().contacted_at);
  assert.equal(firstImport.canonical.canonical_sent, 2);
  assert.equal(firstImport.canonical.canonical_replies, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM activity_events WHERE source='linkedin-import'").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM next_actions WHERE status='open'").get().count, 1);
  assert.equal(database.prepare("SELECT confirmation_status FROM meetings").get().confirmation_status, "unconfirmed");

  database.prepare("UPDATE linkedin_conversations SET status='closed',follow_up_at=NULL,workflow_source='human' WHERE id=?").run(conversation.id);
  const secondImport = importLinkedinChats(database, PAGE);
  const preserved = database.prepare("SELECT status,follow_up_at FROM linkedin_conversations WHERE id=?").get(conversation.id);
  assert.equal(preserved.status, "closed");
  assert.equal(preserved.follow_up_at, null);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM linkedin_messages").get().count, 3);
  assert.equal(secondImport.canonical.events_added, 0);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM activity_events WHERE source='linkedin-import'").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM next_actions WHERE status='open'").get().count, 0);

  const incremental = `Today
View Alex Smith’s profile
Alex Smith 6:00 PM
Thanks Andrew, I can send the workflow notes tomorrow.
React with`;
  importLinkedinChats(database, incremental, { referenceDay: "2026-07-16", nameHint: "Alex Smith", sourceFile: "dashboard-paste" });
  const refreshed = database.prepare("SELECT status,message_count FROM linkedin_conversations WHERE id=?").get(conversation.id);
  assert.notEqual(refreshed.status, "closed");
  assert.equal(refreshed.message_count, 4);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM linkedin_messages WHERE conversation_id=?").get(conversation.id).count, 4);

  const { qualifyConversationOpportunity, scopeOpportunity, markProposalSent, createExperiment, assignExperiment, listExperiments, founderOverview, recordManualLinkedinMessage } = await import("./founder-ops.js");
  const { buildPlaybooks } = await import("./playbooks.js");
  const t = new Date().toISOString();
  database.prepare(`INSERT INTO conversation_outcomes
    (conversation_id,primary_outcome,secondary_tags,confidence,confirmed_by,created_at,updated_at)
    VALUES(?,'qualified_commercial_interest','[]','confirmed','Andrew',?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET primary_outcome='qualified_commercial_interest',confirmed_by='Andrew'`).run(conversation.id, t, t);
  assert.throws(() => qualifyConversationOpportunity(conversation.id, {}, database), /Qualification is missing/);
  const opportunity = qualifyConversationOpportunity(conversation.id, {
    problem: "Integration launch is blocked",
    consequence: "Customer revenue is delayed",
    owner: "Alex",
    timing: "This quarter",
    commercial_path: "VP budget approval",
    next_step: "Review a bounded sprint",
  }, database);
  assert.equal(opportunity.stage, "qualified");
  assert.equal(database.prepare("SELECT COUNT(*) count FROM qualification_snapshots WHERE opportunity_id=?").get(opportunity.id).count, 1);
  assert.throws(() => scopeOpportunity(opportunity.id, {}, database), /Scope is missing/);
  const scoped = scopeOpportunity(opportunity.id, {
    scope: "Own one blocked integration through production",
    exclusions: "No platform rewrite",
    timeline: "Four weeks",
    responsibilities: "GNK delivers; buyer provides access and an owner",
    success_metrics: "Integration accepted in production",
    price: "$40,000",
    next_step: "Review the written scope",
    decision_date: "2026-07-22T12:00:00.000Z",
  }, database);
  assert.equal(scoped.stage, "solution_defined");
  assert.throws(() => markProposalSent(opportunity.id, {}, database), /explicit next step/);
  const proposed = markProposalSent(opportunity.id, { next_step: "Decision call", next_step_at: "2026-07-24T12:00:00.000Z" }, database);
  assert.equal(proposed.stage, "proposal");
  assert.equal(database.prepare("SELECT COUNT(*) count FROM activity_events WHERE type='proposal_sent' AND lead_id=?").get(proposed.lead_id).count, 1);
  const experiment = createExperiment({
    venture: "gnk",
    hypothesis: "Short trigger-led messages create more qualified conversations.",
    variants: ["short", "control"],
    stop_rule: "Stop after 30 assigned conversations or 30 days.",
  }, database);
  assignExperiment(experiment.id, { entity_type: "conversation", entity_id: conversation.id, variant: "short" }, database);
  const experimentReport = listExperiments(database)[0];
  assert.equal(experimentReport.results.short.assigned, 1);
  assert.equal(experimentReport.results.short.qualified_replies, 1);
  assert.match(experimentReport.sample_warning, /small sample/i);

  database.prepare(`INSERT INTO next_actions
    (entity_type,entity_id,action_type,due_at,owner,status,priority,reason,source_key,created_at,updated_at)
    VALUES('lead',?,'revisit_on_new_trigger','2020-01-01T00:00:00.000Z','Andrew','open',20,
      'Watch for a new trigger.','test:watch',?,?)`).run(proposed.lead_id, t, t);
  const overview = founderOverview(database);
  assert.equal(overview.watchlist.length, 1);
  assert.ok(overview.work_actions.every((action) => action.action_type !== "revisit_on_new_trigger"));
  assert.equal(overview.metrics.watchlist, 1);
  assert.equal(overview.metrics.overdue_actions, overview.work_actions.filter((action) => action.due_at && action.due_at < overview.generated_at).length);

  const playbooks = buildPlaybooks(database);
  assert.match(playbooks.ventures.gnk.belief, /production bottleneck/i);
  assert.equal(playbooks.ventures.gnk.evidence.conversations, 1);
  assert.equal(playbooks.ventures.gnk.evidence.replies, 1);
  assert.ok(playbooks.ventures.gnk.themes.length >= 3);
  assert.ok(playbooks.portfolio_message_length.short.conversations >= 1);

  const recorded = recordManualLinkedinMessage(conversation.id, { body: "Thanks Alex. I will send the concise scope we discussed." }, database);
  assert.equal(recorded.message.direction, "outbound");
  assert.equal(recorded.conversation.status, "waiting");
  assert.equal(database.prepare("SELECT COUNT(*) count FROM linkedin_messages WHERE conversation_id=?").get(conversation.id).count, 5);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM activity_events WHERE source='linkedin-import' AND type='sent'").get().count, 3);

  _closeForTest();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.CRM_DB_PATH;
});
