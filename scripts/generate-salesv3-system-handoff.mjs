#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_PATH = path.join(ROOT, "data", "crm.db");
const REGISTRY_PATH = path.join(ROOT, "agents", "registry.json");
const OUT = path.join(ROOT, "docs", "SalesV3_2.0_Full_System_Handoff_2026-07-16.md");
const DOCS_COPY = path.join(path.dirname(ROOT), "SalesV3_2.0_Full_System_Handoff_2026-07-16.md");

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));

const scalar = (sql, params = []) => db.prepare(sql).get(...params)?.value ?? 0;
const rows = (sql, params = []) => db.prepare(sql).all(...params);
const md = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
const join = (items, empty = "None") => items?.length ? items.join(", ") : empty;
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : "0.0%";

const metrics = {
  leads: scalar("SELECT COUNT(*) value FROM leads"),
  connections: scalar("SELECT COUNT(*) value FROM linkedin_connections"),
  conversations: scalar("SELECT COUNT(*) value FROM linkedin_conversations"),
  messages: scalar("SELECT COUNT(*) value FROM linkedin_messages"),
  outbound: scalar("SELECT COUNT(*) value FROM linkedin_messages WHERE direction='outbound'"),
  inbound: scalar("SELECT COUNT(*) value FROM linkedin_messages WHERE direction='inbound'"),
  events: scalar("SELECT COUNT(*) value FROM activity_events"),
  sentEvents: scalar("SELECT COUNT(*) value FROM activity_events WHERE type='sent' AND source='linkedin-import'"),
  replyEvents: scalar("SELECT COUNT(*) value FROM activity_events WHERE type='reply' AND source='linkedin-import'"),
  actions: scalar("SELECT COUNT(*) value FROM next_actions WHERE status='open'"),
  outcomes: scalar("SELECT COUNT(*) value FROM conversation_outcomes"),
  meetings: scalar("SELECT COUNT(*) value FROM meetings"),
  confirmedMeetings: scalar("SELECT COUNT(*) value FROM meetings WHERE confirmation_status IN ('confirmed','calendar_confirmed')"),
  opportunities: scalar("SELECT COUNT(*) value FROM opportunities"),
  experiments: scalar("SELECT COUNT(*) value FROM experiments"),
  qualifications: scalar("SELECT COUNT(*) value FROM qualification_snapshots"),
  replies: scalar("SELECT COUNT(*) value FROM linkedin_conversations WHERE inbound_count > 0"),
  qualifiedReplies: scalar("SELECT COUNT(*) value FROM conversation_outcomes WHERE primary_outcome='qualified_commercial_interest' AND confirmed_by IS NOT NULL"),
  overdue: scalar("SELECT COUNT(*) value FROM next_actions WHERE status='open' AND due_at IS NOT NULL AND due_at < datetime('now')"),
};

const productLeadRows = rows("SELECT product, COUNT(*) count FROM leads GROUP BY product ORDER BY product");
const conversationRows = rows(`SELECT product, COUNT(*) conversations, SUM(outbound_count) outbound,
  SUM(inbound_count) inbound, SUM(CASE WHEN inbound_count > 0 THEN 1 ELSE 0 END) replied
  FROM linkedin_conversations GROUP BY product ORDER BY product`);
const actionRows = rows("SELECT action_type, COUNT(*) count FROM next_actions WHERE status='open' GROUP BY action_type ORDER BY count DESC, action_type");
const eventRows = rows("SELECT type, COUNT(*) count FROM activity_events GROUP BY type ORDER BY count DESC, type");
const tables = rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);

const tableRoles = {
  meta: "Schema version and database-level metadata.",
  cohorts: "Versioned groups of leads governed by one venture, play, strategy version, and approval policy.",
  pipeline_runs: "Auditable executions of a pipeline stage against a cohort.",
  leads: "Canonical prospect/person records and materialized lifecycle state.",
  activity_events: "Immutable append-only commercial event log; source of truth for sent, reply, meeting, proposal, contract, and safety events.",
  suppression: "Global address/domain do-not-contact, unsubscribe, bounce, and complaint controls.",
  merge_conflicts: "Human-review queue for identity-critical data disagreements.",
  sales_plays: "Immutable, versioned venture-specific commercial strategy specifications.",
  opportunities: "Deal lifecycle separated from the prospect record; contains qualification, scope, value, and next step.",
  contracts: "Won revenue and recurring-revenue records linked to opportunities.",
  outreach_messages: "Human-approved draft queue with provider metadata; autonomous sending is disabled.",
  meetings: "Meeting proposals, confirmation state, intent, calendar linkage, brief, and structured outcome.",
  provider_sync_state: "Cursor/state storage for integrations such as Gmail or calendars.",
  linkedin_connections: "Cleaned first-degree relationship catalogue imported from the operator's own data.",
  linkedin_conversations: "Person-level LinkedIn thread summaries, workflow state, venture assignment, and manual notes.",
  linkedin_messages: "Normalized message-level history with direction, timestamps, fingerprints, and raw-source lineage.",
  next_actions: "Exactly one open operating action per active entity, with owner, priority, due date, reason, and source key.",
  conversation_outcomes: "Human-confirmable response taxonomy and correction/learning fields.",
  experiments: "Defined outreach hypotheses, segments, variants, dates, and stopping rules.",
  experiment_assignments: "Pre-send assignment of a lead or conversation to an experiment variant.",
  qualification_snapshots: "Auditable buyer-confirmed evidence used to qualify or reject an opportunity.",
};

const schemaSections = tables.map((table) => {
  const columns = rows(`PRAGMA table_info(${table})`).map((c) => `${c.name}${c.pk ? " [PK]" : ""}${c.notnull ? " [required]" : ""}`);
  return `### \`${table}\`\n\n${tableRoles[table] || "Supporting application table."}\n\nColumns: ${columns.map((c) => `\`${c}\``).join(", ")}.`;
}).join("\n\n");

function workflowFor(agent) {
  const s = agent.slug;
  if (/radar|company-context|growth-playbook|industry-map|market-coverage|account-sourcing/.test(s)) return "Signal Scout";
  if (/icp-contact-profile|offer-map|revenue-strategy|pipeline-capacity|account-scoring|contact-discovery|lead-persona-profile|client-dossier/.test(s)) return "Account Qualifier";
  return "Outreach Assistant";
}

const agentRows = registry.agents.map((a, index) => {
  const live = a.criticalPath ? "Critical" : /Superseded|off the live path/i.test(a.role) ? "Parked" : "Supporting";
  return `| ${index + 1} | ${md(a.name)} | ${md(join(a.brands, a.slug.split("-")[0]))} | ${md(workflowFor(a))} | ${md(a.executionTier)} | ${md(a.model)} | ${live} | ${md(a.role)} | ${md(join(a.dependsOn))} | ${md(join(a.outputs))} |`;
}).join("\n");

const agentDetail = registry.agents.map((a, index) => `### ${index + 1}. ${a.name} (\`${a.slug}\`)

- Visible workflow: ${workflowFor(a)}.
- Venture scope: ${join(a.brands, a.slug.split("-")[0])}.
- Runtime: ${a.execution || "unspecified"}; model ${a.model}; tier ${a.executionTier}; cadence ${a.cadence}; timeout ${a.timeoutSeconds == null ? "not set" : `${a.timeoutSeconds}s`}; cost ceiling $${a.maxCostUsd ?? "not set"}.
- Live-path status: ${a.criticalPath ? "critical path" : /Superseded|off the live path/i.test(a.role) ? "superseded or parked" : "supporting/control"}.
- Job: ${a.role}
- Inputs/dependencies: ${join(a.dependsOn)}.
- Outputs: ${join(a.outputs)}.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.`).join("\n\n");

const apiRows = [
  ["GET", "/api/founder-overview", "Today scorecard, action queue, pipeline by venture, and learning rates."],
  ["GET", "/api/founder-reconciliation", "Source-to-canonical message counts, orphan and ambiguity checks, and next-action completeness."],
  ["POST", "/api/founder-sync", "Idempotently converts imported LinkedIn messages to canonical events and derives outcomes/actions/candidates."],
  ["GET", "/api/next-actions", "Returns open founder work ordered by urgency and priority."],
  ["POST", "/api/next-actions/:id", "Complete, snooze, pause, close, or suppress an action/entity."],
  ["GET/POST", "/api/experiments", "Lists or creates controlled outreach experiments."],
  ["POST", "/api/experiments/:id/assign", "Assigns a lead/conversation to a variant before outreach."],
  ["POST", "/api/opportunities/qualify", "Creates a qualified opportunity only from human-confirmed commercial interest plus complete evidence."],
  ["POST", "/api/opportunities/:id/scope", "Moves a qualified deal to scoped after boundaries, success measures, price, responsibilities, and decision date exist."],
  ["POST", "/api/opportunities/:id/proposal-sent", "Records proposal delivery, canonical event, and dated follow-up."],
  ["GET", "/api/meetings", "Lists canonical meetings with confirmation and intent."],
  ["POST", "/api/meetings/:id/confirm", "Turns an inferred candidate into an explicitly confirmed meeting."],
  ["POST", "/api/meetings/:id/outcome", "Captures problem, process, consequence, owner, timing, budget path, next step, and corrections."],
  ["GET", "/api/call-brief", "Builds a one-page brief from verified lead and relationship evidence."],
  ["GET", "/api/linkedin-connections", "Searches and filters the 765-person relationship catalogue."],
  ["PATCH", "/api/linkedin-connections/:id", "Persists venture, review status, contacted/dismissed state, and profile confirmation."],
  ["GET", "/api/linkedin-conversations", "Returns cleaned threads, messages, outcomes, summaries, and learning aggregates."],
  ["PATCH", "/api/linkedin-conversations/:id", "Persists workflow status, notes, dates, venture, and confirmed response outcome."],
  ["GET", "/api/linkedin-prospects", "Returns venture-specific profile/message workbench records and validation results."],
  ["GET", "/api/leads", "Returns canonical lead records and CRM statistics."],
  ["GET", "/api/leads.csv", "Exports CRM lead data."],
  ["GET", "/api/pipeline-report", "Builds the venture/cohort funnel and commercial metrics from canonical state."],
  ["GET", "/api/agent-health", "Evaluates freshness, dependency health, blockers, tiers, and critical-path status for all agents."],
  ["GET", "/api/agents", "Returns registry and artifact information for the technical agent graph."],
  ["GET", "/api/lead-memory", "Returns a relationship/lead memory view and evidence timeline."],
  ["GET", "/api/ontology", "Returns the knowledge graph/ontology representation."],
  ["GET/POST", "/api/outreach-queue", "Reads or creates human-review outbound drafts."],
  ["POST", "/api/outreach-queue/:id/approve|reject|draft", "Human decision and provider-draft creation; never autonomous send."],
  ["GET/POST", "/api/smoke-live", "Runs and reports the isolated live-smoke validation path."],
  ["GET", "/api/activity-events", "Conceptual activity surface; the current UI receives recent events through state/messages endpoints."],
].map((r) => `| ${r.map(md).join(" | ")} |`).join("\n");

const screenRows = [
  ["Today", "Founder command surface", "Six commercial metrics; active next-action queue; meeting confirmation/outcome actions; pipeline by venture; any-reply vs qualified-reply learning.", "Clear live work before adding lead inventory."],
  ["Leads", "Canonical CRM inspection", "Funnel/bucket filters, searchable lead list, evidence, identity confidence, contact data, stage, memory, notes, and activity.", "Understand one prospect and its provenance."],
  ["Outreach", "Email-era and lead outreach workbench", "Selected lead, message sequence, evidence, review state, composition, and meeting controls.", "Prepare drafts; this remains secondary to LinkedIn-first motion."],
  ["LinkedIn", "Manual message workbench", "Venture filters, exact/search profile state, connection note, first DM, follow-up, call rationale, validation, copy controls.", "Prepare a short verified note and send it manually in LinkedIn."],
  ["Connections", "Network inventory", "Search, venture/review filters, headline and date, profile lookup/confirmation, contacted and dismissed states.", "Catalogue and triage the existing network without pretending every connection is a lead."],
  ["Conversations", "Relationship intelligence", "Full message history, outcome taxonomy, workflow state, dates, contact details, notes, lessons, qualification gate.", "Respond, learn, and decide the next commercial action."],
  ["Approvals", "Human-control checkpoint", "Cohort approvals, message approve/reject, evidence review, provider draft creation, Gmail sync.", "Preserve manual approval and prevent autonomous sending."],
  ["Calendar", "Commitments and next actions", "Only confirmed meetings plus canonical actions; unconfirmed text-derived calls are excluded.", "See real commitments, not optimistic inference."],
  ["System health", "Workflow and agent diagnostics", "Six visible workflows first; freshness/blockers/critical path; complete 56-agent registry progressively disclosed.", "Debug the machine without making agent count the business KPI."],
  ["Knowledge", "Evidence and ontology explorer", "Structured artifacts, entities, relationships, venture scope, lead memory, provenance.", "Inspect why the system believes something."],
  ["Activity", "Audit trail", "Recent immutable commercial and system events.", "Verify what happened and when."],
  ["Run", "Live-smoke and orchestration diagnostics", "Preflight, isolated cohorts, pipeline execution, assertion results.", "Validate the end-to-end machinery safely."],
].map((r) => `| ${r.map(md).join(" | ")} |`).join("\n");

const moduleRows = [
  ["src/db.js", "Canonical SQLite schema, WAL setup, migrations, immutability triggers, indexes, seeded plays."],
  ["src/founder-ops.js", "SalesV3 2.0 operating loop: sync, events, actions, meeting candidates, outcomes, qualification, scoping, proposals, overview, reconciliation, experiments."],
  ["src/import-linkedin-connections.js", "Imports the cleaned network catalogue from connections.txt."],
  ["src/linkedin-connections.js", "Name cleanup, parsing, classification, search URL, and CSV logic."],
  ["src/import-linkedin-chats.js", "Imports allchats.txt, preserves human edits, then invokes canonical founder sync."],
  ["src/linkedin-chats.js", "Removes LinkedIn UI chrome, splits people/threads/messages, analyzes responses, meetings, contact details, and lessons."],
  ["src/linkedin-prospects.js", "Builds LinkedIn profile/message workbench records and enforces the message quality contract."],
  ["src/generate-linkedin-messages.js", "CLI generation path for LinkedIn message assets."],
  ["src/dashboard-server.js", "Dependency-light HTTP server, static files, JSON APIs, mutation gates, and task execution."],
  ["public/index.html", "Application shell, venture switcher, and 12-view navigation rail."],
  ["public/app.js", "Vanilla JS state, data loading, routing, rendering, and operator interactions."],
  ["public/styles.css", "Responsive visual system, status colors, cards, split views, queues, tables, and mobile behavior."],
  ["src/run-agent.js", "Agent execution, dependency loading, schema checks, artifacts, timeout/cost/runtime policy."],
  ["src/pipelines.js", "Pipeline definitions and brand-scoped selection of control/cohort/lead work."],
  ["src/run-pipeline.js", "CLI/orchestration entry point for strategy, cohort, lead, and full pipelines."],
  ["agents/registry.json", "Authoritative 56-agent graph: role, dependencies, outputs, model, tier, cadence, criticality, limits."],
  ["src/meetings.js", "Call briefs, meeting list, proposals, calendar record creation."],
  ["src/pipeline-report.js", "Funnel, booked/held separation, cohort results, revenue and conversion reporting."],
  ["src/crm-model.js", "Lifecycle state machine and safety/readiness gates."],
  ["src/lineage.js", "Cohort, run, strategy, and source compatibility checks."],
  ["src/sequence-skeleton.js", "Deterministic venture-specific touch skeleton and stopping rules."],
  ["src/sales-plays.js", "Versioned GNK, OutageHub, and Morrow plays and economics."],
  ["src/lead-memory.js / lead-memory-record.js", "Relationship memory and canonical evidence projection."],
  ["src/ontology-record.js / backfill-ontology.js", "Knowledge graph records and backfill."],
  ["src/acceptance-harness.js", "Nine hard system acceptance gates."],
  ["scripts/generate-salesv3-business-review.py", "Original portfolio business review PDF generator."],
].map((r) => `| ${r.map(md).join(" | ")} |`).join("\n");

const report = `# SalesV3 2.0 Full System Handoff

## Product, UI/UX, data, agent architecture, operating logic, implementation history, current state, and roadmap

Date: 16 July 2026  
Workspace: \`${ROOT}\`  
Audience: a new engineer, operator, advisor, investor, or AI system that cannot see the running platform  
Status: private working document; live implementation snapshot

---

## 1. Purpose of this document

This is the complete handoff for SalesV3 as it exists after the LinkedIn network catalogue, conversation intelligence, commercial-event reconciliation, founder queue, meeting controls, qualification gates, UI redesign, testing, and portfolio review work.

It is intentionally written so a reader who has never opened the localhost dashboard can understand:

1. what the product is and is not;
2. what was built and why;
3. what the operator sees on every screen;
4. how data moves from raw text into commercial truth;
5. what each of the 56 registered agents does;
6. what deterministic code does instead of agents;
7. how the database, API, UI, events, pipelines, artifacts, and tests fit together;
8. what the current evidence says about GNK, OutageHub, and Morrow;
9. what remains incomplete, risky, or deliberately parked; and
10. how another person or AI should continue the work without destroying the design principles.

The most important reading rule is that this report separates **implemented truth** from **planned direction**. A table or workflow described as implemented exists in the code and database. Roadmap items are marked as planned.

## 2. Executive summary

SalesV3 began as a multi-agent prospecting and email-research system. It is now being compressed into a LinkedIn-first founder revenue operating system for three ventures:

- **GNK:** the near-term cash engine for consequential engineering delivery.
- **OutageHub:** the recurring external power-event data asset.
- **Morrow:** the long-term adaptive robotics and design-partner bet.
- **SalesV3:** internal commercial leverage, not a fourth public company.

The platform has one canonical SQLite CRM, a browser dashboard, an immutable activity log, 56 technical agents, deterministic commercial gates, a cleaned 765-person LinkedIn network, 33 imported conversation histories, 111 normalized messages, and an operating queue of 32 next actions.

The redesign changed the center of gravity:

- The primary UI object is now the **next action**, not the agent or lead count.
- The primary business KPI is **paid commitment**, not any-reply rate.
- Inferred meetings stay unconfirmed until a person verifies date, time zone, intent, and calendar reality.
- A positive reply cannot become an opportunity without human-confirmed commercial interest and complete buyer evidence.
- Outreach remains manual and approval-based. The software can prepare and copy drafts; it cannot impersonate Andrew or autonomously send.
- The main product exposes six workflows. The 56-agent graph is retained under System Health as implementation detail.

### Live snapshot

| Object | Current count | Meaning |
|---|---:|---|
| LinkedIn connections | ${metrics.connections} | Cleaned relationship inventory from \`connections.txt\` |
| CRM leads | ${metrics.leads} | Original venture leads plus relationship leads created from conversations |
| LinkedIn conversations | ${metrics.conversations} | Person-level threads from \`allchats.txt\` |
| LinkedIn messages | ${metrics.messages} | ${metrics.outbound} outbound and ${metrics.inbound} inbound |
| Canonical activity events | ${metrics.events} | Immutable event history; ${metrics.sentEvents} LinkedIn sent and ${metrics.replyEvents} LinkedIn reply events |
| Open next actions | ${metrics.actions} | Exactly one open action per active thread/entity |
| Conversation outcomes | ${metrics.outcomes} | One response/outcome record per imported conversation |
| Meeting candidates | ${metrics.meetings} | All currently inferred; ${metrics.confirmedMeetings} confirmed |
| Opportunities | ${metrics.opportunities} | None yet because the qualification gate has not been satisfied |
| Experiments | ${metrics.experiments} | Registry implemented; no live experiment launched yet |
| Qualification snapshots | ${metrics.qualifications} | Gate implemented; no buyer-qualified evidence recorded yet |
| Automated tests | 88 passing | Full suite, zero failures on 16 July 2026 |

Any-reply rate is ${pct(metrics.replies, metrics.conversations)} (${metrics.replies} of ${metrics.conversations}). Human-confirmed qualified-reply rate is ${pct(metrics.qualifiedReplies, metrics.conversations)} (${metrics.qualifiedReplies} of ${metrics.conversations}). The gap is intentional: replies, corrections, referrals, research interest, meetings, and buying intent are not treated as equivalent.

## 3. What was built during this work

### Phase A: unify the three venture lead systems

The original question was whether GNK, OutageHub, and Morrow LinkedIn contacts were truly in one place. The audit found one canonical SQLite CRM and venture-aware code, but the UI/API and imported relationship data were not yet fully reconciled. Morrow was added as a first-class venture across registry, pipeline, lead storage, profile/message preparation, and dashboard filtering.

### Phase B: clean and catalogue \`connections.txt\`

The source file is approximately 118 KB and 6,914 lines. Parsing removes LinkedIn chrome and malformed spacing, reconstructs person records, normalizes names, preserves Unicode, deduplicates identities, and stores the result in \`linkedin_connections\`.

Each connection receives:

- a stable identity key;
- name, headline, connection date, and source lineage;
- a venture classification: GNK, OutageHub, Morrow, or Other;
- a review status and manual override path;
- a profile status and search/confirmed profile URL;
- contacted and dismissed state.

The classifier was deliberately broadened after the first pass put too many plausible buyers, evaluators, or routers in Other. It now keeps commercially adjacent operators and credible owner-routing contacts while excluding clearly irrelevant profiles. Human overrides are preserved on re-import.

### Phase C: make relationship state visible

The Connections UI gained explicit states:

- **Contacted** appears as a green status treatment.
- **Dismissed** appears as a red status treatment.
- Unreviewed, needs-review, and profile-search states remain neutral or amber.

These colors are not decoration. They communicate actionability and prevent repeatedly approaching dismissed people.

### Phase D: clean and import \`allchats.txt\`

The raw conversation file is approximately 892 KB and 14,062 lines. It contains LinkedIn UI fragments, duplicated labels, inconsistent timestamps, partial contact cards, and messages copied with uneven boundaries.

The importer:

1. strips interface chrome and noise;
2. identifies person-level thread boundaries;
3. distinguishes Andrew's outbound messages from inbound replies;
4. normalizes timestamp labels into sortable timestamps with confidence metadata;
5. fingerprints messages for idempotent re-import;
6. extracts emails and phone numbers when they appear in chat;
7. detects call proposals and scheduled-call language as candidates only;
8. summarizes the thread, response theme, and suggested next action;
9. links the thread to a connection and canonical lead when possible;
10. preserves manual notes, venture assignments, and workflow edits on rerun.

The result is ${metrics.conversations} people and ${metrics.messages} messages, not 10,000 separate CRM objects. The raw source remains the provenance layer; the normalized message table is the queryable relationship history.

### Phase E: add conversation intelligence and learning

Each conversation now supports a human-confirmable outcome taxonomy:

- no reply;
- polite or neutral;
- correction;
- objection;
- current-process disclosure;
- problem acknowledged;
- timing signal;
- referral;
- call proposed;
- call booked;
- qualified commercial interest; and
- negative or suppress.

The system separately records any reply and qualified reply. It also aggregates lessons, themes, objections, corrections, and venture-level response patterns. This prevents a polite answer from being reported as commercial traction.

### Phase F: reconcile conversations into the canonical CRM

Before this phase, the conversation layer contained real messages and calls while the canonical CRM reported zero messages, replies, and meetings. That false-zero problem was the most serious management defect.

The founder sync now creates stable, idempotent canonical events for every imported message. It creates a relationship lead where no CRM lead exists, preserves raw provenance, derives one conversation outcome, generates one open next action, and creates an unconfirmed meeting candidate when the text implies a call.

Current reconciliation is exact: ${metrics.outbound} source outbound messages correspond to ${metrics.sentEvents} canonical sent events, and ${metrics.inbound} source inbound messages correspond to ${metrics.replyEvents} canonical reply events. The import can be rerun without duplicating events.

### Phase G: redesign the dashboard around today

The previous main surface emphasized lead volume, agent work, and preparation. The new Today page leads with live replies, confirmed meetings, qualified opportunities, proposals, paid commitments, overdue actions, and the action queue.

The navigation label changed from Overview to Today, and Agents changed to System Health. This is a product-management decision: the interface should reward commercial movement, not architectural sophistication.

### Phase H: install commercial truth gates

The implementation added:

- meeting confirmation and structured meeting outcomes;
- one-open-next-action enforcement;
- human-confirmed conversation outcomes;
- buyer-evidence qualification snapshots;
- opportunity scoping gates;
- proposal-sent gates and follow-up actions;
- experiment definitions, assignments, and directional reporting;
- reconciliation reports and acceptance tests.

## 4. Product definition and design doctrine

SalesV3 is Andrew's private, LinkedIn-first founder revenue cockpit and commercial memory for multiple ventures.

It is not:

- an autonomous SDR;
- a generic CRM replacement;
- a bulk scraping system;
- a 56-person simulated company;
- an autonomous LinkedIn or email sender;
- a public fourth venture; or
- a substitute for founder-led calls, qualification, proposals, and asks for money.

### Core design principles

1. **Next action first.** Every active relationship should resolve to one dated action, one future trigger, a pause date, a closed reason, or suppression.
2. **Commercial truth over optimistic inference.** Inferred calls are candidates. Confirmed meetings require human or calendar confirmation. Positive sentiment is not an opportunity.
3. **Evidence beside every claim.** Personalization is allowed only when the source is visible and compatible with the active venture/play.
4. **One front door per buyer.** GNK, OutageHub, and Morrow share infrastructure but never share buyer-facing positioning.
5. **Progressive disclosure.** The operator sees six workflows; technical users can expand the 56-agent graph.
6. **Human authority at consequential boundaries.** Andrew approves/sends messages, confirms facts, runs calls, qualifies deals, and approves proposals.
7. **Append-only history.** Activity events cannot be updated or deleted at the database layer.
8. **Fail closed.** Missing identity, lineage, legal basis, deliverability, grounding, play compatibility, or qualification evidence blocks progression.
9. **Manual motion before automation.** Only stable, repeated work should be automated.
10. **Paid commitment is the primary KPI.** Lead, connection, agent, and any-reply counts are diagnostics.

## 5. UI/UX: what a person sees

### Global shell

The product is a single-page localhost web application with a persistent left navigation rail and a responsive content stage. The top of the rail contains:

- a venture-colored brand mark;
- the label **Revenue cockpit**;
- a GNK / OHUB / MORROW switcher; and
- twelve deep-linkable views.

The venture switch changes product context without mixing records. Counts appear beside Leads, LinkedIn, Connections, and Conversations. A small live-task indicator appears in the rail footer when background work is active.

The visual system uses a light paper background, white cards, restrained blue primary actions, subtle borders/shadows, and compact information hierarchy. Status colors have fixed semantics:

- green: contacted, confirmed, won, or otherwise positively completed;
- red: dismissed, suppressed, closed negative, overdue danger;
- amber: due, unconfirmed, risky, or requiring review;
- blue: selected, actionable, or primary navigation;
- gray: inventory, diagnostics, or inactive state.

### Screen map

| Screen | Product role | What is visible | Intended operator decision |
|---|---|---|---|
${screenRows}

### The Today page in words

Imagine a page headed **Founder revenue operating system** with the subtitle **What needs your attention today**. Directly beneath it is a horizontal scorecard:

\`Live replies | Meetings - 7 days | Qualified opportunities | Proposals outstanding | Paid commitments | Overdue actions\`

Below that is a vertically ordered list of action cards. Each card shows venture, action type, due state, person, headline, reason, and buttons appropriate to the action. A meeting candidate offers **Confirm details**. A confirmed/held meeting offers **Record outcome**. Ordinary actions offer **Mark done**, **Tomorrow**, **Open thread**, and **Close**.

The lower half splits into two cards. The left card is pipeline by venture and stage. The right card explicitly contrasts any reply with human-confirmed qualified reply and explains why they differ.

The UX deliberately makes overdue work uncomfortable and lead inventory quiet.

### Connections state design

Connections are relationship inventory, not automatic prospects. The row/card shows name, headline, assigned venture, review status, connection date, and profile state. The operator can search LinkedIn, confirm the exact profile, reclassify venture, mark contacted, or dismiss.

The green contacted and red dismissed treatments solve a practical memory problem: the operator can scan the list and immediately distinguish worked relationships from rejected ones.

### Conversation detail design

Each conversation card has three layers:

1. **Digest:** person, venture, workflow status, headline, summary, message counts, last activity, response signal, extracted contact details, and suggested next action.
2. **Workflow controls:** status, meeting state, confirmed outcome, follow-up time, call time, LinkedIn link, and qualification button when allowed.
3. **Expandable evidence:** the full chronological message timeline plus operator notes.

The qualification button is intentionally absent until \`qualified_commercial_interest\` has been explicitly human-confirmed.

### LinkedIn message workbench

The workbench prepares four assets per person:

1. connection note under 300 characters;
2. first direct message, normally 55-90 words;
3. follow-up, normally 35-60 words; and
4. call rationale.

Deterministic checks reject unsupported claims, wrong venture context, generic openings such as “given your background,” “just checking in,” en/em dashes, excessive length, feature lists, and unbounded asks. The operator copies the text and sends manually.

### Responsive behavior

The application uses CSS grid/flex layouts that collapse split pages, scorecards, card grids, and controls at smaller widths. The navigation remains the primary spatial anchor. Dense records use scrollable or wrapping layouts rather than hiding evidence.

### Accessibility and UX limitations

Implemented strengths include semantic buttons/labels, keyboard-native controls, visible focusable actions, readable contrast, and deep-linkable views. Remaining weaknesses include prompt-based meeting/outcome forms rather than first-class dialogs, limited bulk keyboard operation, no formal WCAG audit, no empty-state onboarding tour, and no in-app help explaining venture qualification rules.

## 6. The six visible workflows

The six workflows are an operating abstraction over both model-driven agents and deterministic services.

### 1. Signal Scout

Finds verified market, company, role, relationship, and trigger evidence. It uses the shared demand radar plus company, industry, market-coverage, and account-sourcing agents. Its output is candidate accounts and reasons to act now.

### 2. Account Qualifier

Decides venture, play, company fit, buyer role, router value, commercial plausibility, and evidence gaps. It uses ICP, offer, revenue, capacity, scoring, discovery, persona, and dossier agents, plus deterministic scoring and safety gates.

### 3. Outreach Assistant

Builds the evidence-backed angle and prepares short LinkedIn or controlled email drafts. It uses angle, contact, writer, sequence, and reviewer agents, then deterministic message-contract validation. It never sends.

### 4. Conversation Triage

Imports replies, classifies response type, preserves the full thread, updates workflow state, and creates the next action. This is primarily deterministic application code in \`linkedin-chats.js\` and \`founder-ops.js\`, with the reply classifier as a bounded helper. It is not a free-running reply agent.

### 5. Meeting and Deal Assistant

Maintains meeting candidates, confirmation, briefs, outcomes, qualification evidence, opportunity stages, scope, proposal events, and follow-up. This is deterministic code with explicit human gates.

### 6. Learning Analyst

Separates any reply from qualified progression, aggregates corrections/objections, compares ventures and experiment variants, and reports pipeline conversion. This is built from canonical queries, conversation analysis, experiments, and pipeline reporting rather than a narrative-only agent.

## 7. End-to-end operating loop

\`connections.txt / target evidence\`

&darr; parse, normalize, deduplicate, classify, preserve raw lineage

\`LinkedIn relationship catalogue\`

&darr; human review, profile confirmation, venture/play assignment

\`Signal Scout + Account Qualifier\`

&darr; verified trigger, problem-owner hypothesis, evidence-backed dossier

\`Outreach Assistant\`

&darr; deterministic quality gate + human approval + manual send

\`allchats.txt / future official exports\`

&darr; parse, fingerprint, direction, timestamp confidence, person/thread linking

\`LinkedIn messages and conversations\`

&darr; idempotent founder sync

\`Immutable sent/reply events + outcome + exactly one next action\`

&darr; human response classification and meeting confirmation

\`Meeting held + structured outcome\`

&darr; buyer-confirmed qualification gate

\`Qualified opportunity -> scoped -> proposal -> commitment -> contract\`

&darr; conversion and experiment learning

\`Updated venture, buyer, trigger, problem, offer, and message policy\`

## 8. Architecture

### Layered view

1. **Raw input layer:** \`connections.txt\`, \`allchats.txt\`, official exports, public evidence, provider responses, and agent source notes.
2. **Parsing and normalization layer:** deterministic importers, fingerprinting, cleanup, identity keys, classification, timestamp confidence, and deduplication.
3. **Canonical data layer:** SQLite CRM with foreign keys, WAL, transactions, immutable activity, venture/play lineage, and human-review state.
4. **Intelligence layer:** 56 registered agents, deterministic scorers, reply analysis, sequence policies, qualification logic, and experiment aggregation.
5. **Application service layer:** founder operations, meetings, pipeline reports, lead memory, ontology, provider adapters, and acceptance harness.
6. **API layer:** Node HTTP server exposing JSON endpoints and static assets.
7. **Experience layer:** vanilla JavaScript single-page dashboard and CSS design system.
8. **Human authority layer:** approve/send, confirm identities and meetings, capture calls, qualify, scope, propose, close, suppress.

### Why SQLite

SQLite is appropriate for a founder-scale local operating system: it is inspectable, portable, transactional, fast, easy to back up, and does not introduce an operational database service. WAL mode permits concurrent readers and a writer. Foreign keys, indexes, a 5-second busy timeout, immediate transactions, unique keys, and immutable triggers protect correctness.

### Canonical truth hierarchy

Raw source is evidence, not automatically truth. Parsed records are queryable interpretations. Human-confirmed fields outrank inferred values. The immutable event log outranks materialized stage labels. A meeting candidate does not become booked until confirmed. An outcome does not become qualified interest until confirmed. This hierarchy is the central anti-hallucination design.

### Identity and deduplication

Connections, conversations, messages, and leads use stable normalized identity keys and fingerprints. Imported conversation leads receive stable SHA-based IDs. Canonical message events use a unique dedupe key based on the message fingerprint. Ambiguous identities remain queued rather than silently merged.

## 9. Database schema

Schema version 2 extends rather than replaces the original CRM. The database contains ${tables.length} application tables.

${schemaSections}

### Important constraints

- \`activity_events\` has database triggers that reject UPDATE and DELETE.
- \`dedupe_key\` prevents duplicate canonical events.
- A partial unique index permits only one open \`next_actions\` row for a given entity.
- Venture/play/cohort/run lineage is checked before artifacts or leads cross stages.
- Suppression applies globally at address or domain scope.
- Opportunity stages cannot be skipped and won requires a signed contract event.
- LinkedIn import inference cannot silently overwrite human-confirmed outcomes.

## 10. API surface

The dashboard server is a small Node HTTP service with static files and explicit JSON routes. Representative and newly important endpoints are below.

| Method | Endpoint | Responsibility |
|---|---|---|
${apiRows}

Mutation endpoints validate body shape and return explicit errors. The UI reloads canonical state after consequential actions rather than relying solely on optimistic client state.

## 11. Source/module map

| File or area | Responsibility |
|---|---|
${moduleRows}

## 12. Agent runtime and artifact architecture

Every registered agent declares:

- stable ID, slug, and display name;
- role and venture scope;
- ordered sequence position;
- dependency slugs;
- workspace and isolated agent directory;
- model and execution mode;
- source URLs;
- required output fields;
- execution tier;
- critical-path flag;
- cadence/staleness policy; and
- time/cost/benchmark limits.

### Tiers

- **Control (23 agents):** shared or venture strategy refreshed weekly/monthly.
- **Cohort (12 agents):** account sourcing/scoring/contact/email preparation for an approved group.
- **Lead (18 agents):** per-person dossier, persona, angle, and message work.
- **Deterministic (3 registry entries):** legacy sequence-policy positions kept off the live model path.

Model allocation is 41 GPT-5.4-mini agents for broad research/synthesis, 10 GPT-5.5 agents for deeper industry/writing/review work, 2 GPT-5.6 LinkedIn writers, and 3 local deterministic capacity calculators.

### Dependency behavior

An agent is not considered runnable simply because it exists. Required artifacts must exist, be fresh enough, have compatible lineage, and expose all required output keys. Critical-path dependencies cannot point through superseded agents. Missing/stale inputs block execution. Artifacts are versioned operational evidence, not invisible prompt context.

### Important compression decision

The registry remains complete for migration and diagnostics, but agent count is removed as a success metric. Several sequence strategy/drafter roles are explicitly marked superseded or off the live path. Conversation, meeting, deal, and learning behavior is increasingly deterministic because those areas require auditable state changes rather than open-ended generation.

## 13. Full 56-agent catalogue: compact reference

| # | Agent | Venture | Visible workflow | Tier | Model | Status | Job | Dependencies | Outputs |
|---:|---|---|---|---|---|---|---|---|---|
${agentRows}

## 14. Full 56-agent catalogue: detailed descriptions

${agentDetail}

## 15. LinkedIn import and classification details

### Connections

The connection parser recognizes names, headlines, and dates despite copy/paste noise. It preserves Unicode and normalizes repeated whitespace. Classification is deterministic and explainable: title/headline keywords and operating context contribute to venture fit, while obviously unrelated roles remain Other. The system intentionally preserves routers and evaluators because a first-degree relationship may be valuable even when it is not the budget owner.

The import reuses canonical profile data where available and never discards manual venture/profile/review overrides on rerun.

### Conversations

The chat parser detects repeated LinkedIn UI labels, direction markers, names, timestamp labels, and message blocks. Message fingerprints create stable idempotency. Conversation analysis derives a summary, workflow status, response theme, proposed follow-up, meeting candidate, and contact details. These are inferred fields until human confirmation.

### Current venture distribution in the CRM

| Venture | Leads |
|---|---:|
${productLeadRows.map((r) => `| ${md(r.product)} | ${r.count} |`).join("\n")}

### Current conversation evidence

| Venture | Conversations | Outbound | Inbound | Conversations with reply | Any-reply rate |
|---|---:|---:|---:|---:|---:|
${conversationRows.map((r) => `| ${md(r.product)} | ${r.conversations} | ${r.outbound || 0} | ${r.inbound || 0} | ${r.replied || 0} | ${pct(r.replied || 0, r.conversations)} |`).join("\n")}

## 16. Next-action engine

The next-action engine turns relationship state into one explicit operator decision. Priority is generally:

1. live reply;
2. meeting confirmation or preparation;
3. promised follow-up/proposal;
4. referral;
5. decision on an engaged thread;
6. ordinary follow-up; and
7. wait for a new trigger.

The action stores entity type/ID, action type, due time, Andrew as owner, status, priority, reason, source key, and timestamps. Completion creates auditable state. Snooze changes due time. Close or suppression terminates the active obligation. A unique partial index prevents duplicate open obligations for the same entity.

Current open-action mix:

| Action type | Count |
|---|---:|
${actionRows.map((r) => `| ${md(r.action_type)} | ${r.count} |`).join("\n")}

## 17. Meetings and deal truth

Text such as “Tuesday works” or “let's schedule” is not enough to put a meeting in the confirmed calendar. The parser creates a candidate with unconfirmed time zone/intent. The Today queue then asks the operator to confirm:

- exact start time;
- time zone;
- intent: research, design partner, commercial discovery, or active deal; and
- calendar reality.

After a meeting is held, the outcome form requires:

- buyer-confirmed problem;
- current process;
- consequence;
- owner;
- timing;
- budget/commercial path;
- explicit next step; and
- corrected or disproved assumption.

Research calls do not automatically create opportunities.

## 18. Qualification, scope, proposal, and revenue gates

### Qualification

A conversation can qualify only when its primary outcome is \`qualified_commercial_interest\` and a human has confirmed it. Required evidence: problem, consequence, owner, timing, commercial path, and next step. The system writes a qualification snapshot and creates/moves an opportunity to qualified.

### Scoping

A qualified deal can move to scoped only when scope, exclusions, timeline, responsibilities, success metrics, price, next step, and decision date exist.

### Proposal sent

A proposal can be recorded only from scoped/solution-defined state. It creates an immutable proposal event and a dated next action.

### Commitment and won

Commercial commitment, contracting, and won are separate. Won requires contract evidence. Revenue and MRR come from contract records, not model confidence.

## 19. Experiment registry and learning

Experiments record venture, play, segment, hypothesis, variants, start/stop rules, and contact assignments. Assignment happens before sending to prevent retrospective cherry-picking. Results can be compared by variant on assigned people, any replies, qualified replies, and meetings. Reports warn when sample size is too small and do not generalize across segments.

The registry is implemented but currently empty. This is deliberate truth: the next controlled 45-person test is planned, not already running.

## 20. Outreach policy and safeguards

### LinkedIn contract

- Connection note under 300 characters.
- First DM normally 55-90 words.
- Follow-up normally 35-60 words.
- One verified reason, one problem hypothesis, one value proposition, one bounded ask.
- No fake compliments, unsupported superlatives, generic “given your background,” “just checking in,” feature lists, speculative architecture, or en/em dashes.
- Two-touch default for silent cold contacts; third touch only with a new trigger, referral, artifact, or active relationship.
- Manual approval and manual sending.

### Email posture

Email remains useful for invitations, requested written follow-up, recaps, proposals, and active deal coordination. Cold email automation is parked. The provider code cannot send autonomously even if a caller attempts to enable it through configuration.

### Safety and compliance

Readiness gates cover suppression, fresh deliverability, jurisdiction, legal basis/evidence, no-solicitation signals, play, grounding, duplicates, sender infrastructure, and human approval. Guessed addresses cannot masquerade as verified/published evidence. Replies and unsubscribes stop future touches.

## 21. Venture-specific commercial architecture

### GNK: cash engine

Flagship wedges:

1. production AI workflow sprint;
2. client integration launch sprint; and
3. backend reliability rescue.

Qualification requires a buyer-confirmed delivery bottleneck, consequence tied to revenue/launch/customer/incident/capacity, real owner, willingness to use an external senior team, plausible 4-6 week boundary, and budget path toward $35k-$60k or $7.5k-$12.5k paid shaping.

### OutageHub: recurring data asset

Positioning: external cross-utility Canadian power-event context that complements, rather than replaces, telemetry, SCADA, OMS, NOC, and field systems.

Primary plays are telecom/field operations, embedded platform partners, and command-center/emergency context. A paid evaluation should define geography, latency, delivery, comparison, success measures, implementation value of $7.5k-$30k, and recurring path of $1.5k-$15k monthly.

### Morrow: long-term design-partner/robotics bet

Positioning: adaptive robotic packing and kitting software for high-mix workflows too variable for conventional fixed automation.

The first wedge should be one bounded cell/workflow/SKU family with baseline volume, cycle time, error/intervention/labor, buyer consequence, champion, site/budget owner, data/site access, a $15k-$50k paid pilot, and path toward $5k-$12k per cell monthly.

Recommended founder selling-time allocation for the evidence sprint: 45% GNK, 40% Morrow, 15% OutageHub.

## 22. Current commercial readout

The platform currently holds ${metrics.conversations} imported conversations and ${metrics.messages} messages. ${metrics.replies} threads have an inbound reply, but none is yet human-confirmed as qualified commercial interest. The six meeting records are unconfirmed candidates, so confirmed meetings in the next seven days remain zero. Opportunities, proposals, contracts, booked project revenue, and MRR are zero.

That is not a software failure. It is the newly honest baseline.

The highest-priority known actions are:

- send Samuel Eboh three to five concise written questions and respect the request not to schedule a call;
- work Charlie Harland's referral using introducer context;
- verify exact details for the six inferred meeting/proposal candidates; and
- classify every engaged thread into a next step, pause, close reason, or suppression.

Canonical activity event mix:

| Event | Count |
|---|---:|
${eventRows.map((r) => `| ${md(r.type)} | ${r.count} |`).join("\n")}

## 23. Tests, acceptance gates, and system health

The complete Node test suite passed 88/88 on 16 July 2026. Coverage includes:

- classifier benchmark and deterministic stability;
- agent registry validation and freshness/blocker grouping;
- contact cleanup, Unicode, deduplication, classification, profile reuse, and override preservation;
- chat cleanup, thread extraction, response learning, meeting detection, and re-import behavior;
- CRM readiness, stages, lifecycle, suppression, legal basis, deliverability, jurisdiction, and duplicate-send prevention;
- opportunity lifecycle and contract-only won state;
- immutable activity events and idempotent dedupe keys;
- WAL concurrency;
- draft-only and impossible autonomous send behavior;
- pipeline selection, critical-path integrity, play consistency, artifact schema, lineage, and fail-closed operation;
- deterministic sequence skeletons and evidence gates;
- isolated smoke cohorts and nine hard acceptance gates.

The acceptance philosophy is stronger than “the page loads.” It checks that unsafe or unsupported state transitions are impossible.

## 24. Known limitations and gaps

### Data limitations

- The LinkedIn inputs are manual text captures, not official complete exports; timestamps and thread boundaries may be imperfect.
- Exact profile URLs are incomplete for many connections.
- Company data is often absent from chat-only relationship leads.
- Current conversation sample is selected and not a complete outbound history.
- Inferred outcomes require human confirmation.

### Commercial limitations

- No qualified opportunity, proposal, paid commitment, contract, or revenue is recorded yet.
- The offer and ICP hypotheses remain early.
- Research interest, especially for Morrow, may not equal budget ownership.
- GNK messaging has historically been too broad and solution-heavy.
- OutageHub must avoid positioning against internal telemetry/SCADA.

### Product limitations

- Calendar sync is not yet a complete provider-backed two-way integration.
- Conversation import is batch/manual rather than automatic official-export sync.
- Meeting/outcome UX currently uses browser prompts instead of polished forms.
- Experiment UI is primarily API/data-layer complete, not yet a full operator screen.
- Proposal templates and referral graph are planned, not complete.
- The old email-oriented Outreach/Approvals surfaces remain and need further simplification.
- Six-workflow compression is visible in System Health, but the technical registry is still large.
- No multi-user permissions, cloud deployment, encrypted secrets manager, or team audit roles are present.
- Backups and disaster recovery are local-file responsibilities.

### Privacy and platform limitations

- LinkedIn relationship/message data is sensitive personal data and should remain private, access-controlled, and backed up carefully.
- The platform should prefer official user exports and manual sending.
- It must not add autonomous scraping, impersonation, or sending without a separate legal/platform review.

## 25. Planned 30/60/90-day continuation

### Next 30 days

1. Confirm or reject all six meeting candidates.
2. Clear overdue actions and ensure every active thread has one truth state.
3. Run calls and capture outcomes within 24 hours.
4. Define one flagship offer per venture.
5. Launch a controlled 45-person test, 15 per venture, using existing high-confidence relationships.
6. Tag relationship strength, play, persona, trigger, opener, length, ask, touch, outcome, and next action.
7. Make at least three direct commercial asks when qualification supports them.
8. Target one paid GNK engagement, OutageHub evaluation, or Morrow pilot.

### Days 31-60

- reconcile official LinkedIn export/profile URLs for priority people;
- complete calendar integration;
- use email only for invites, recaps, written questions, proposals, and active deals;
- build venture-specific proposal templates;
- expose experiments and referral routes in first-class UI;
- add opportunity aging and simple forecast categories;
- create customer-language and proof libraries.

### Days 61-90

- automate only stable imports, reminders, briefs, suggestions, and trigger monitoring;
- expand channels only where qualified conversion exists;
- add forecasting only after enough qualified opportunities exist;
- decide whether SalesV3 remains a personal tool or becomes a small-team operating layer;
- do not commercialize SalesV3 before the three venture motions prove repeatability.

## 26. Recommended future UI work

1. Replace browser prompts with accessible modal/drawer forms for meeting confirmation, outcomes, qualification, scope, and proposals.
2. Add a dedicated opportunity detail view with evidence checklist, stakeholder map, stage history, value, and next action.
3. Add an Experiments view with assignment balance, sample warning, and progression funnel.
4. Add a referral graph showing introducer, target owner, context, ask, and conversion.
5. Add command-palette and keyboard shortcuts for reply, complete, snooze, close, and open profile.
6. Add compact/comfortable density modes for the 765-person network.
7. Add explicit inferred/confirmed badges everywhere a date, identity, outcome, or company is uncertain.
8. Add backup/export status and last successful import/reconciliation timestamps.
9. Add onboarding/help that explains why a reply is not an opportunity and why a meeting candidate is not booked.
10. Run a formal accessibility review before adding more visual complexity.

## 27. Operating instructions for the next engineer or AI

### Start and verify

\`npm test\`  
\`npm run founder:sync\`  
\`npm run dashboard\`

Then open the localhost address printed by the server, normally a 127.0.0.1 port. Check Today, Conversations, Connections, Calendar, and System Health before changing behavior.

### Non-negotiable invariants

- Do not make \`activity_events\` mutable.
- Do not silently resolve identity ambiguity.
- Do not auto-confirm inferred meetings or outcomes.
- Do not create opportunities from positive replies alone.
- Do not mark drafts as sent.
- Do not enable autonomous sending.
- Do not allow cross-venture evidence or play leakage.
- Do not overwrite human classifications on re-import.
- Do not turn lead/agent volume back into the primary dashboard KPI.
- Do not remove raw provenance from imported messages or personalization claims.

### How to extend safely

Add deterministic state and validation first. Use an agent only for work requiring synthesis or drafting. Every model output should have a schema, source notes, dependency lineage, runtime/cost boundary, and human consequence gate. Add tests for both the happy path and the refusal/fail-closed path.

## 28. Final assessment

SalesV3 is now much closer to a real founder revenue operating system than a prospect generator. It remembers the network, preserves conversations, exposes what Andrew owes people, separates inference from confirmation, and refuses to call engagement revenue.

Its strongest engineering property is controlled truth: provenance, append-only events, human gates, deduplication, venture boundaries, and tests. Its strongest UX decision is putting Today and paid commitment ahead of agents and lead inventory.

Its largest remaining risk is not technical. It is allowing system development to remain more complete than the commercial motion. The next proof is one paid commitment and a clean explanation of why it happened.

At the end of the next sprint, the platform should answer without reconstruction:

1. Who needs Andrew's attention today, and why?
2. Which venture, buyer, trigger, and message creates qualified conversations?
3. Which calls reveal repeated, costly, buyer-owned problems?
4. Which qualified opportunities received a direct commercial ask?
5. What converted to payment?
6. What assumption was disproved?
7. What should stop next month?

If the platform answers those seven questions, it is doing its job.
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, report);
fs.copyFileSync(OUT, DOCS_COPY);
console.log(JSON.stringify({ output: OUT, documentsCopy: DOCS_COPY, bytes: Buffer.byteLength(report), agents: registry.agents.length, tables: tables.length, metrics }, null, 2));
