# SalesV3 2.0 Full System Handoff

## Product, UI/UX, data, agent architecture, operating logic, implementation history, current state, and roadmap

Date: 16 July 2026  
Workspace: `/Users/andrewgordienko/Documents/salesv3`  
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
| LinkedIn connections | 765 | Cleaned relationship inventory from `connections.txt` |
| CRM leads | 229 | Original venture leads plus relationship leads created from conversations |
| LinkedIn conversations | 33 | Person-level threads from `allchats.txt` |
| LinkedIn messages | 111 | 83 outbound and 28 inbound |
| Canonical activity events | 155 | Immutable event history; 83 LinkedIn sent and 28 LinkedIn reply events |
| Open next actions | 32 | Exactly one open action per active thread/entity |
| Conversation outcomes | 33 | One response/outcome record per imported conversation |
| Meeting candidates | 6 | All currently inferred; 0 confirmed |
| Opportunities | 0 | None yet because the qualification gate has not been satisfied |
| Experiments | 0 | Registry implemented; no live experiment launched yet |
| Qualification snapshots | 0 | Gate implemented; no buyer-qualified evidence recorded yet |
| Automated tests | 88 passing | Full suite, zero failures on 16 July 2026 |

Any-reply rate is 36.4% (12 of 33). Human-confirmed qualified-reply rate is 0.0% (0 of 33). The gap is intentional: replies, corrections, referrals, research interest, meetings, and buying intent are not treated as equivalent.

## 3. What was built during this work

### Phase A: unify the three venture lead systems

The original question was whether GNK, OutageHub, and Morrow LinkedIn contacts were truly in one place. The audit found one canonical SQLite CRM and venture-aware code, but the UI/API and imported relationship data were not yet fully reconciled. Morrow was added as a first-class venture across registry, pipeline, lead storage, profile/message preparation, and dashboard filtering.

### Phase B: clean and catalogue `connections.txt`

The source file is approximately 118 KB and 6,914 lines. Parsing removes LinkedIn chrome and malformed spacing, reconstructs person records, normalizes names, preserves Unicode, deduplicates identities, and stores the result in `linkedin_connections`.

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

### Phase D: clean and import `allchats.txt`

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

The result is 33 people and 111 messages, not 10,000 separate CRM objects. The raw source remains the provenance layer; the normalized message table is the queryable relationship history.

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

Current reconciliation is exact: 83 source outbound messages correspond to 83 canonical sent events, and 28 source inbound messages correspond to 28 canonical reply events. The import can be rerun without duplicating events.

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
| Today | Founder command surface | Six commercial metrics; active next-action queue; meeting confirmation/outcome actions; pipeline by venture; any-reply vs qualified-reply learning. | Clear live work before adding lead inventory. |
| Leads | Canonical CRM inspection | Funnel/bucket filters, searchable lead list, evidence, identity confidence, contact data, stage, memory, notes, and activity. | Understand one prospect and its provenance. |
| Outreach | Email-era and lead outreach workbench | Selected lead, message sequence, evidence, review state, composition, and meeting controls. | Prepare drafts; this remains secondary to LinkedIn-first motion. |
| LinkedIn | Manual message workbench | Venture filters, exact/search profile state, connection note, first DM, follow-up, call rationale, validation, copy controls. | Prepare a short verified note and send it manually in LinkedIn. |
| Connections | Network inventory | Search, venture/review filters, headline and date, profile lookup/confirmation, contacted and dismissed states. | Catalogue and triage the existing network without pretending every connection is a lead. |
| Conversations | Relationship intelligence | Full message history, outcome taxonomy, workflow state, dates, contact details, notes, lessons, qualification gate. | Respond, learn, and decide the next commercial action. |
| Approvals | Human-control checkpoint | Cohort approvals, message approve/reject, evidence review, provider draft creation, Gmail sync. | Preserve manual approval and prevent autonomous sending. |
| Calendar | Commitments and next actions | Only confirmed meetings plus canonical actions; unconfirmed text-derived calls are excluded. | See real commitments, not optimistic inference. |
| System health | Workflow and agent diagnostics | Six visible workflows first; freshness/blockers/critical path; complete 56-agent registry progressively disclosed. | Debug the machine without making agent count the business KPI. |
| Knowledge | Evidence and ontology explorer | Structured artifacts, entities, relationships, venture scope, lead memory, provenance. | Inspect why the system believes something. |
| Activity | Audit trail | Recent immutable commercial and system events. | Verify what happened and when. |
| Run | Live-smoke and orchestration diagnostics | Preflight, isolated cohorts, pipeline execution, assertion results. | Validate the end-to-end machinery safely. |

### The Today page in words

Imagine a page headed **Founder revenue operating system** with the subtitle **What needs your attention today**. Directly beneath it is a horizontal scorecard:

`Live replies | Meetings - 7 days | Qualified opportunities | Proposals outstanding | Paid commitments | Overdue actions`

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

The qualification button is intentionally absent until `qualified_commercial_interest` has been explicitly human-confirmed.

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

Imports replies, classifies response type, preserves the full thread, updates workflow state, and creates the next action. This is primarily deterministic application code in `linkedin-chats.js` and `founder-ops.js`, with the reply classifier as a bounded helper. It is not a free-running reply agent.

### 5. Meeting and Deal Assistant

Maintains meeting candidates, confirmation, briefs, outcomes, qualification evidence, opportunity stages, scope, proposal events, and follow-up. This is deterministic code with explicit human gates.

### 6. Learning Analyst

Separates any reply from qualified progression, aggregates corrections/objections, compares ventures and experiment variants, and reports pipeline conversion. This is built from canonical queries, conversation analysis, experiments, and pipeline reporting rather than a narrative-only agent.

## 7. End-to-end operating loop

`connections.txt / target evidence`

&darr; parse, normalize, deduplicate, classify, preserve raw lineage

`LinkedIn relationship catalogue`

&darr; human review, profile confirmation, venture/play assignment

`Signal Scout + Account Qualifier`

&darr; verified trigger, problem-owner hypothesis, evidence-backed dossier

`Outreach Assistant`

&darr; deterministic quality gate + human approval + manual send

`allchats.txt / future official exports`

&darr; parse, fingerprint, direction, timestamp confidence, person/thread linking

`LinkedIn messages and conversations`

&darr; idempotent founder sync

`Immutable sent/reply events + outcome + exactly one next action`

&darr; human response classification and meeting confirmation

`Meeting held + structured outcome`

&darr; buyer-confirmed qualification gate

`Qualified opportunity -> scoped -> proposal -> commitment -> contract`

&darr; conversion and experiment learning

`Updated venture, buyer, trigger, problem, offer, and message policy`

## 8. Architecture

### Layered view

1. **Raw input layer:** `connections.txt`, `allchats.txt`, official exports, public evidence, provider responses, and agent source notes.
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

Schema version 2 extends rather than replaces the original CRM. The database contains 21 application tables.

### `activity_events`

Immutable append-only commercial event log; source of truth for sent, reply, meeting, proposal, contract, and safety events.

Columns: `event_id [PK]`, `lead_id [required]`, `type [required]`, `occurred_at [required]`, `recorded_at [required]`, `cohort_id`, `pipeline_run_id`, `source [required]`, `payload`, `dedupe_key`.

### `cohorts`

Versioned groups of leads governed by one venture, play, strategy version, and approval policy.

Columns: `cohort_id [PK]`, `product [required]`, `strategy_version [required]`, `created_at [required]`, `note`, `play_id`, `status`, `rules`, `approved_at`, `approved_by`.

### `contracts`

Won revenue and recurring-revenue records linked to opportunities.

Columns: `id [PK]`, `opportunity_id`, `lead_id`, `brand`, `mrr`, `one_time`, `start_date`, `renewal_date`, `scope`, `created_at [required]`, `contract_type`, `implementation_cost`, `status`, `parent_contract_id`, `ended_at`.

### `conversation_outcomes`

Human-confirmable response taxonomy and correction/learning fields.

Columns: `id [PK]`, `conversation_id [required]`, `primary_outcome [required]`, `secondary_tags [required]`, `confidence [required]`, `confirmed_by`, `correction_text`, `created_at [required]`, `updated_at [required]`.

### `experiment_assignments`

Pre-send assignment of a lead or conversation to an experiment variant.

Columns: `id [PK]`, `experiment_id [required]`, `entity_type [required]`, `entity_id [required]`, `variant [required]`, `assigned_at [required]`.

### `experiments`

Defined outreach hypotheses, segments, variants, dates, and stopping rules.

Columns: `id [PK]`, `venture [required]`, `play_id`, `segment`, `hypothesis [required]`, `variants [required]`, `start_at`, `stop_rule`, `status [required]`, `created_at [required]`, `updated_at [required]`.

### `leads`

Canonical prospect/person records and materialized lifecycle state.

Columns: `id [PK]`, `product [required]`, `cohort_id [required]`, `pipeline_run_id [required]`, `strategy_version [required]`, `company`, `company_domain`, `name`, `title`, `linkedin_url`, `identity_key [required]`, `identity_confidence [required]`, `email_best`, `email_status`, `address_found_or_guessed`, `email_source_type`, `email_source_url`, `deliverability_status`, `deliverability_checked_at`, `recipient_jurisdiction`, `legal_basis`, `legal_basis_evidence`, `role_relevance_note`, `do_not_contact`, `unsubscribed_at`, `stage [required]`, `suppressed`, `needs_review`, `review_reasons`, `source_stores`, `research`, `created_at [required]`, `updated_at [required]`, `play_id`, `score`, `score_breakdown`.

### `linkedin_connections`

Cleaned first-degree relationship catalogue imported from the operator's own data.

Columns: `id [PK]`, `identity_key [required]`, `name [required]`, `headline`, `connected_on`, `profile_url [required]`, `profile_status [required]`, `primary_product [required]`, `classification_score [required]`, `product_scores [required]`, `classification_reason`, `classification_source [required]`, `review_status [required]`, `linked_lead_id`, `source_file`, `source_line`, `created_at [required]`, `updated_at [required]`, `contacted_at`, `contact_channel`.

### `linkedin_conversations`

Person-level LinkedIn thread summaries, workflow state, venture assignment, and manual notes.

Columns: `id [PK]`, `identity_key [required]`, `name [required]`, `headline`, `product [required]`, `connection_id`, `linked_lead_id`, `status [required]`, `response_theme [required]`, `summary`, `next_action`, `follow_up_at`, `meeting_at`, `meeting_timezone`, `meeting_label`, `meeting_status [required]`, `contact_details [required]`, `manual_notes`, `workflow_source [required]`, `message_count [required]`, `inbound_count [required]`, `outbound_count [required]`, `first_message_at`, `last_message_at`, `last_inbound_at`, `last_outbound_at`, `source_file`, `created_at [required]`, `updated_at [required]`, `play_id`.

### `linkedin_messages`

Normalized message-level history with direction, timestamps, fingerprints, and raw-source lineage.

Columns: `id [PK]`, `conversation_id [required]`, `fingerprint [required]`, `sender_name [required]`, `direction [required]`, `sent_at [required]`, `sent_at_label`, `body [required]`, `source_line`, `created_at [required]`.

### `meetings`

Meeting proposals, confirmation state, intent, calendar linkage, brief, and structured outcome.

Columns: `id [PK]`, `lead_id [required]`, `opportunity_id`, `status [required]`, `starts_at [required]`, `ends_at [required]`, `timezone [required]`, `attendees [required]`, `provider`, `provider_event_id`, `conference_url`, `brief`, `created_at [required]`, `updated_at [required]`, `confirmation_status`, `time_confidence`, `intent`, `outcome`, `outcome_captured_at`, `source_conversation_id`, `source_key`.

### `merge_conflicts`

Human-review queue for identity-critical data disagreements.

Columns: `id [PK]`, `lead_id [required]`, `field [required]`, `kept`, `discarded`, `from_store`, `identity_critical`, `resolved`, `created_at [required]`.

### `meta`

Schema version and database-level metadata.

Columns: `key [PK]`, `value`.

### `next_actions`

Exactly one open operating action per active entity, with owner, priority, due date, reason, and source key.

Columns: `id [PK]`, `entity_type [required]`, `entity_id [required]`, `action_type [required]`, `due_at`, `owner [required]`, `status [required]`, `priority [required]`, `reason`, `source_event_id`, `source_key`, `completed_at`, `created_at [required]`, `updated_at [required]`.

### `opportunities`

Deal lifecycle separated from the prospect record; contains qualification, scope, value, and next step.

Columns: `id [PK]`, `lead_id [required]`, `play_id`, `cohort_id`, `stage [required]`, `amount_mrr`, `amount_one_time`, `probability_source`, `next_step`, `next_step_at`, `close_date`, `loss_reason`, `qualification`, `solution`, `created_at [required]`, `updated_at [required]`.

### `outreach_messages`

Human-approved draft queue with provider metadata; autonomous sending is disabled.

Columns: `id [PK]`, `lead_id [required]`, `cohort_id [required]`, `pipeline_run_id [required]`, `strategy_version [required]`, `message_type [required]`, `touch_number`, `recipient [required]`, `subject [required]`, `body [required]`, `review_status`, `evidence`, `scheduled_at`, `status [required]`, `approved_at`, `approved_by`, `rejected_at`, `rejection_reason`, `provider`, `provider_draft_id`, `provider_message_id`, `provider_thread_id`, `sent_at`, `stopped_at`, `stopped_reason`, `created_at [required]`, `updated_at [required]`.

### `pipeline_runs`

Auditable executions of a pipeline stage against a cohort.

Columns: `pipeline_run_id [PK]`, `cohort_id [required]`, `product [required]`, `strategy_version [required]`, `stage [required]`, `status [required]`, `started_at [required]`, `completed_at`, `metadata`.

### `provider_sync_state`

Cursor/state storage for integrations such as Gmail or calendars.

Columns: `provider [PK] [required]`, `key [PK] [required]`, `value`, `updated_at [required]`.

### `qualification_snapshots`

Auditable buyer-confirmed evidence used to qualify or reject an opportunity.

Columns: `id [PK]`, `opportunity_id [required]`, `venture [required]`, `fields [required]`, `buyer_evidence [required]`, `result [required]`, `missing_evidence [required]`, `confirmed_by`, `created_at [required]`.

### `sales_plays`

Immutable, versioned venture-specific commercial strategy specifications.

Columns: `play_id [PK] [required]`, `strategy_version [PK] [required]`, `brand [required]`, `name [required]`, `spec [required]`, `created_at [required]`.

### `suppression`

Global address/domain do-not-contact, unsubscribe, bounce, and complaint controls.

Columns: `value [PK] [required]`, `scope [PK] [required]`, `reason [required]`, `created_at [required]`.

### Important constraints

- `activity_events` has database triggers that reject UPDATE and DELETE.
- `dedupe_key` prevents duplicate canonical events.
- A partial unique index permits only one open `next_actions` row for a given entity.
- Venture/play/cohort/run lineage is checked before artifacts or leads cross stages.
- Suppression applies globally at address or domain scope.
- Opportunity stages cannot be skipped and won requires a signed contract event.
- LinkedIn import inference cannot silently overwrite human-confirmed outcomes.

## 10. API surface

The dashboard server is a small Node HTTP service with static files and explicit JSON routes. Representative and newly important endpoints are below.

| Method | Endpoint | Responsibility |
|---|---|---|
| GET | /api/founder-overview | Today scorecard, action queue, pipeline by venture, and learning rates. |
| GET | /api/founder-reconciliation | Source-to-canonical message counts, orphan and ambiguity checks, and next-action completeness. |
| POST | /api/founder-sync | Idempotently converts imported LinkedIn messages to canonical events and derives outcomes/actions/candidates. |
| GET | /api/next-actions | Returns open founder work ordered by urgency and priority. |
| POST | /api/next-actions/:id | Complete, snooze, pause, close, or suppress an action/entity. |
| GET/POST | /api/experiments | Lists or creates controlled outreach experiments. |
| POST | /api/experiments/:id/assign | Assigns a lead/conversation to a variant before outreach. |
| POST | /api/opportunities/qualify | Creates a qualified opportunity only from human-confirmed commercial interest plus complete evidence. |
| POST | /api/opportunities/:id/scope | Moves a qualified deal to scoped after boundaries, success measures, price, responsibilities, and decision date exist. |
| POST | /api/opportunities/:id/proposal-sent | Records proposal delivery, canonical event, and dated follow-up. |
| GET | /api/meetings | Lists canonical meetings with confirmation and intent. |
| POST | /api/meetings/:id/confirm | Turns an inferred candidate into an explicitly confirmed meeting. |
| POST | /api/meetings/:id/outcome | Captures problem, process, consequence, owner, timing, budget path, next step, and corrections. |
| GET | /api/call-brief | Builds a one-page brief from verified lead and relationship evidence. |
| GET | /api/linkedin-connections | Searches and filters the 765-person relationship catalogue. |
| PATCH | /api/linkedin-connections/:id | Persists venture, review status, contacted/dismissed state, and profile confirmation. |
| GET | /api/linkedin-conversations | Returns cleaned threads, messages, outcomes, summaries, and learning aggregates. |
| PATCH | /api/linkedin-conversations/:id | Persists workflow status, notes, dates, venture, and confirmed response outcome. |
| GET | /api/linkedin-prospects | Returns venture-specific profile/message workbench records and validation results. |
| GET | /api/leads | Returns canonical lead records and CRM statistics. |
| GET | /api/leads.csv | Exports CRM lead data. |
| GET | /api/pipeline-report | Builds the venture/cohort funnel and commercial metrics from canonical state. |
| GET | /api/agent-health | Evaluates freshness, dependency health, blockers, tiers, and critical-path status for all agents. |
| GET | /api/agents | Returns registry and artifact information for the technical agent graph. |
| GET | /api/lead-memory | Returns a relationship/lead memory view and evidence timeline. |
| GET | /api/ontology | Returns the knowledge graph/ontology representation. |
| GET/POST | /api/outreach-queue | Reads or creates human-review outbound drafts. |
| POST | /api/outreach-queue/:id/approve\|reject\|draft | Human decision and provider-draft creation; never autonomous send. |
| GET/POST | /api/smoke-live | Runs and reports the isolated live-smoke validation path. |
| GET | /api/activity-events | Conceptual activity surface; the current UI receives recent events through state/messages endpoints. |

Mutation endpoints validate body shape and return explicit errors. The UI reloads canonical state after consequential actions rather than relying solely on optimistic client state.

## 11. Source/module map

| File or area | Responsibility |
|---|---|
| src/db.js | Canonical SQLite schema, WAL setup, migrations, immutability triggers, indexes, seeded plays. |
| src/founder-ops.js | SalesV3 2.0 operating loop: sync, events, actions, meeting candidates, outcomes, qualification, scoping, proposals, overview, reconciliation, experiments. |
| src/import-linkedin-connections.js | Imports the cleaned network catalogue from connections.txt. |
| src/linkedin-connections.js | Name cleanup, parsing, classification, search URL, and CSV logic. |
| src/import-linkedin-chats.js | Imports allchats.txt, preserves human edits, then invokes canonical founder sync. |
| src/linkedin-chats.js | Removes LinkedIn UI chrome, splits people/threads/messages, analyzes responses, meetings, contact details, and lessons. |
| src/linkedin-prospects.js | Builds LinkedIn profile/message workbench records and enforces the message quality contract. |
| src/generate-linkedin-messages.js | CLI generation path for LinkedIn message assets. |
| src/dashboard-server.js | Dependency-light HTTP server, static files, JSON APIs, mutation gates, and task execution. |
| public/index.html | Application shell, venture switcher, and 12-view navigation rail. |
| public/app.js | Vanilla JS state, data loading, routing, rendering, and operator interactions. |
| public/styles.css | Responsive visual system, status colors, cards, split views, queues, tables, and mobile behavior. |
| src/run-agent.js | Agent execution, dependency loading, schema checks, artifacts, timeout/cost/runtime policy. |
| src/pipelines.js | Pipeline definitions and brand-scoped selection of control/cohort/lead work. |
| src/run-pipeline.js | CLI/orchestration entry point for strategy, cohort, lead, and full pipelines. |
| agents/registry.json | Authoritative 56-agent graph: role, dependencies, outputs, model, tier, cadence, criticality, limits. |
| src/meetings.js | Call briefs, meeting list, proposals, calendar record creation. |
| src/pipeline-report.js | Funnel, booked/held separation, cohort results, revenue and conversion reporting. |
| src/crm-model.js | Lifecycle state machine and safety/readiness gates. |
| src/lineage.js | Cohort, run, strategy, and source compatibility checks. |
| src/sequence-skeleton.js | Deterministic venture-specific touch skeleton and stopping rules. |
| src/sales-plays.js | Versioned GNK, OutageHub, and Morrow plays and economics. |
| src/lead-memory.js / lead-memory-record.js | Relationship memory and canonical evidence projection. |
| src/ontology-record.js / backfill-ontology.js | Knowledge graph records and backfill. |
| src/acceptance-harness.js | Nine hard system acceptance gates. |
| scripts/generate-salesv3-business-review.py | Original portfolio business review PDF generator. |

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
| 1 | Revenue Demand Radar | gnk, outagehub | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Aggregate current market signals, cluster funded problems, and route named accounts to the correct GNK or OutageHub sales play without blending the two motions. | None | radar_summary, signal_clusters, named_account_signals, offer_demand, durability_assessment, trigger_monitor, recommended_cohorts, source_notes |
| 2 | GNK Company Context | gnk | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Research the GNK site and maintain the shared truth about what GNK does. | None | company_summary, service_lanes, target_pressures, sales_implications, open_questions, source_notes |
| 3 | GNK ICP Contact Profile | gnk | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn GNK company context into ideal customer profiles and contact targeting guidance. | gnk-company-context | icp_summary, priority_segments, buyer_personas, contact_titles, trigger_events, fit_signals, disqualifiers, commercial_floor_signals, reachability_signals, outreach_angles, open_questions, source_notes |
| 4 | GNK Boutique Growth Playbook | gnk | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Research how successful software boutiques and consultancies acquired clients and translate the lessons into GNK sales strategy policy. | gnk-company-context, gnk-icp-contact-profile | playbook_summary, companies_studied, historical_patterns, targeting_lessons, offer_lessons, credibility_lessons, sales_motion_lessons, response_generation_lessons, strategic_gaps_for_gnk, agent_policy_updates, experiments_to_run, claims_to_avoid, open_questions, source_notes |
| 5 | GNK Offer Map | gnk | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn GNK company and ICP context into per-segment pain, outcome, proof, and why-buy-now offer maps. | gnk-company-context, gnk-icp-contact-profile, gnk-boutique-growth-playbook | offer_map_summary, segment_offer_maps, cross_segment_offer_principles, urgency_triggers, proof_assets_to_build, claims_to_avoid, open_questions, source_notes |
| 6 | GNK Industry Map | gnk | Signal Scout | control | openai/gpt-5.5 | Supporting | Enumerate every industry that fits the ICP and give a deep per-industry playbook to find companies and people (ICP -> industries -> companies -> people). | revenue-demand-radar, gnk-company-context, gnk-icp-contact-profile, gnk-offer-map | industry_map_summary, total_industries, industries, coverage_gaps, recommended_sourcing_order, open_questions, source_notes |
| 7 | GNK Revenue Strategy | gnk | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn GNK commercial targets, commission economics, and company-size constraints into deal-tier sourcing and scoring policy. | gnk-company-context, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-offer-map | strategy_summary, revenue_math, deal_tiers, company_size_boundaries, target_industry_logic, portfolio_strategy, sourcing_rules, scoring_rules, seller_commission_plan, open_questions, source_notes |
| 8 | GNK Pipeline Capacity | gnk | Account Qualifier | control | local/deterministic | Supporting | Calculate required pipeline inventory, daily outbound volume, and lead-bucket refill targets from GNK revenue goals. | gnk-revenue-strategy | capacity_summary, revenue_goal, conversion_assumptions, pipeline_targets, bucket_targets, recommended_split, recommended_prospecting, operating_rules, source_notes |
| 9 | GNK Account Sourcing | gnk | Signal Scout | cohort | openai/gpt-5.4-mini | Critical | Source named target accounts that match GNK ICP guidance and have a timely public trigger event. | revenue-demand-radar, gnk-company-context, gnk-industry-map, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-offer-map, gnk-revenue-strategy, gnk-pipeline-capacity | sourcing_summary, search_strategy, target_accounts, near_misses, open_questions, source_notes |
| 10 | GNK Account Scoring | gnk | Account Qualifier | cohort | openai/gpt-5.4-mini | Critical | Rank input accounts against GNK fit signals and disqualifiers, returning scored accounts with reasons and top-N recommendations. | gnk-company-context, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-offer-map, gnk-revenue-strategy, gnk-pipeline-capacity, gnk-account-sourcing | scoring_summary, input_status, scorecard, ranked_accounts, top_accounts, not_recommended, open_questions, source_notes |
| 11 | GNK Contact Discovery | gnk | Account Qualifier | cohort | openai/gpt-5.4-mini | Critical | Find named working problem owners, evaluators, and credible routers at top accounts, avoiding unreachable executive-only targets. | gnk-company-context, gnk-account-scoring, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity | discovery_summary, search_strategy, account_contact_maps, contacts_to_prioritize, contacts_to_avoid, open_questions, source_notes |
| 12 | GNK Lead Persona Profile | gnk | Account Qualifier | lead | openai/gpt-5.4-mini | Critical | Research each discovered lead's individual culture, mindset, communication style, and perspective, and attach that vibe read to the lead and knowledge graph. | gnk-contact-discovery, gnk-icp-contact-profile | persona_summary, search_strategy, person_personas, cross_persona_patterns, claims_to_avoid, open_questions, source_notes |
| 13 | GNK Client Dossier | gnk | Account Qualifier | lead | openai/gpt-5.4-mini | Critical | Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output. | gnk-contact-discovery, gnk-lead-persona-profile, gnk-offer-map, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity | dossier_summary, company_contact_dossiers, dossiers, contact_offer_alignment, outreach_notes, evidence_gaps, open_questions, source_notes, recommended_angle, claims_allowed, claims_forbidden |
| 14 | GNK Outreach Angle | gnk | Outreach Assistant | lead | openai/gpt-5.4-mini | Critical | Produce the evidence-backed per-person outreach angle that connects a current signal and owned workflow to one concrete GNK engagement. | gnk-client-dossier, gnk-lead-persona-profile, gnk-contact-discovery, gnk-account-scoring, gnk-account-sourcing, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity, gnk-offer-map, gnk-icp-contact-profile, gnk-company-context | angle_summary, input_status, company_outreach_maps, person_dossiers, angle_patterns, claims_to_avoid, open_questions, source_notes |
| 15 | GNK Sequence Strategy | gnk | Outreach Assistant | deterministic | openai/gpt-5.4-mini | Parked | [Superseded — off the live path] Legacy sequence-shape strategist; sequence shape is now generated deterministically from SEQUENCE_POLICIES. | gnk-outreach-angle, gnk-client-dossier, gnk-contact-discovery, gnk-account-scoring, gnk-account-sourcing, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity, gnk-offer-map, gnk-icp-contact-profile, gnk-company-context | sequence_summary, strategic_point_of_view, sequence_architecture, touch_plan, persona_variants, timing_and_exit_rules, anti_spam_rules, handoff_to_drafter, claims_to_avoid, open_questions, source_notes |
| 16 | GNK Email Finder | gnk | Outreach Assistant | cohort | openai/gpt-5.4-mini | Critical | Infer each company's email format from public evidence and produce likely email candidates for CRM leads. | gnk-contact-discovery, gnk-revenue-strategy, gnk-pipeline-capacity | email_summary, company_email_maps, results, source_notes |
| 17 | GNK LinkedIn Message Writer | gnk | Outreach Assistant | lead | openai/gpt-5.6 | Critical | Write hyper-tailored LinkedIn connection requests under 300 characters, grounded in verified profiles, person research, the Commercial Dossier, and outreach angle. | gnk-client-dossier, gnk-lead-persona-profile, gnk-outreach-angle, gnk-contact-discovery, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity | linkedin_message_summary, linkedin_connection_messages, claims_to_avoid, source_notes |
| 18 | GNK Email Sequence Drafter | gnk | Outreach Assistant | lead | openai/gpt-5.5 | Parked | [Superseded — off the live path] Draft four-touch, high-trust GNK sequences that use trigger evidence, buyer context, the selected sprint, and the approved first-touch voice. | gnk-email-drafter, gnk-sequence-strategy, gnk-email-finder, gnk-outreach-angle, gnk-client-dossier, gnk-contact-discovery, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity | sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes |
| 19 | GNK Email Sequence Reviewer | gnk | Outreach Assistant | lead | openai/gpt-5.5 | Supporting | Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's four-touch sequences; only 'ready' passes. | gnk-email-drafter, gnk-email-finder, gnk-client-dossier, gnk-contact-discovery, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity | review_summary, quality_rubric, global_findings, person_sequence_reviews, improved_person_email_sequences, recommended_send_order, reviewer_rules, claims_to_avoid, source_notes |
| 20 | OutageHub Company Context | outagehub | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Research the OutageHub site and maintain the shared truth about what OutageHub does. | None | company_summary, service_lanes, target_pressures, sales_implications, open_questions, source_notes |
| 21 | OutageHub ICP Contact Profile | outagehub | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn OutageHub company context into ideal customer profiles and contact targeting guidance. | outagehub-company-context | icp_summary, priority_segments, buyer_personas, contact_titles, trigger_events, fit_signals, disqualifiers, commercial_floor_signals, reachability_signals, outreach_angles, open_questions, source_notes |
| 22 | OutageHub API Growth Playbook | outagehub | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Research how successful API, data, and alerting products acquired clients and translate the lessons into OutageHub sales strategy policy. | outagehub-company-context, outagehub-icp-contact-profile | playbook_summary, companies_studied, historical_patterns, targeting_lessons, offer_lessons, credibility_lessons, sales_motion_lessons, response_generation_lessons, strategic_gaps_for_gnk, agent_policy_updates, experiments_to_run, claims_to_avoid, open_questions, source_notes |
| 23 | OutageHub Offer Map | outagehub | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn OutageHub company and ICP context into per-segment pain, outcome, proof, and why-buy-now offer maps. | outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook | offer_map_summary, segment_offer_maps, cross_segment_offer_principles, urgency_triggers, proof_assets_to_build, claims_to_avoid, open_questions, source_notes |
| 24 | OutageHub Industry Map | outagehub | Signal Scout | control | openai/gpt-5.5 | Supporting | Enumerate every industry that fits the ICP and give a deep per-industry playbook to find companies and people (ICP -> industries -> companies -> people). | revenue-demand-radar, outagehub-company-context, outagehub-icp-contact-profile, outagehub-offer-map | industry_map_summary, total_industries, industries, excluded_because_data_source, coverage_gaps, recommended_sourcing_order, open_questions, source_notes |
| 25 | OutageHub Market Coverage | outagehub | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Map Canadian industries, account types, coverage gaps, and realistic short/medium/long sales motions for OutageHub. | outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map | market_coverage_summary, coverage_sources, industry_segments, portfolio_policy, bucket_overrides, sourcing_expansion_plan, claims_to_avoid, open_questions, source_notes |
| 26 | OutageHub Revenue Strategy | outagehub | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn OutageHub commercial targets, commission economics, and company-size constraints into deal-tier sourcing and scoring policy. | outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map, outagehub-market-coverage | strategy_summary, revenue_math, deal_tiers, company_size_boundaries, target_industry_logic, portfolio_strategy, sourcing_rules, scoring_rules, seller_commission_plan, open_questions, source_notes |
| 27 | OutageHub Pipeline Capacity | outagehub | Account Qualifier | control | local/deterministic | Supporting | Calculate required pipeline inventory, daily outbound volume, and lead-bucket refill targets from OutageHub revenue goals. | outagehub-revenue-strategy, outagehub-market-coverage | capacity_summary, revenue_goal, conversion_assumptions, pipeline_targets, bucket_targets, recommended_split, recommended_prospecting, operating_rules, source_notes |
| 28 | OutageHub Account Sourcing | outagehub | Signal Scout | cohort | openai/gpt-5.4-mini | Critical | Source named target accounts that match OutageHub ICP guidance and have a timely public trigger event. | revenue-demand-radar, outagehub-company-context, outagehub-industry-map, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map, outagehub-market-coverage, outagehub-revenue-strategy, outagehub-pipeline-capacity | sourcing_summary, search_strategy, target_accounts, near_misses, open_questions, source_notes |
| 29 | OutageHub Account Scoring | outagehub | Account Qualifier | cohort | openai/gpt-5.4-mini | Critical | Rank input accounts against OutageHub fit signals and disqualifiers, returning scored accounts with reasons and top-N recommendations. | outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map, outagehub-market-coverage, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-account-sourcing | scoring_summary, input_status, scorecard, ranked_accounts, top_accounts, not_recommended, open_questions, source_notes |
| 30 | OutageHub Contact Discovery | outagehub | Account Qualifier | cohort | openai/gpt-5.4-mini | Critical | Find named outage-workflow owners, evaluators, and credible routers at top accounts, avoiding unreachable executive-only targets. | outagehub-company-context, outagehub-account-scoring, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage | discovery_summary, search_strategy, account_contact_maps, contacts_to_prioritize, contacts_to_avoid, open_questions, source_notes |
| 31 | OutageHub Lead Persona Profile | outagehub | Account Qualifier | lead | openai/gpt-5.4-mini | Critical | Research each discovered lead's individual culture, mindset, communication style, and perspective, and attach that vibe read to the lead and knowledge graph. | outagehub-contact-discovery, outagehub-icp-contact-profile | persona_summary, search_strategy, person_personas, cross_persona_patterns, claims_to_avoid, open_questions, source_notes |
| 32 | OutageHub Client Dossier | outagehub | Account Qualifier | lead | openai/gpt-5.4-mini | Critical | Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output. | outagehub-contact-discovery, outagehub-lead-persona-profile, outagehub-offer-map, outagehub-market-coverage, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity | dossier_summary, company_contact_dossiers, dossiers, contact_offer_alignment, outreach_notes, evidence_gaps, open_questions, source_notes, recommended_angle, claims_allowed, claims_forbidden |
| 33 | OutageHub Outreach Angle | outagehub | Outreach Assistant | lead | openai/gpt-5.4-mini | Critical | Produce the evidence-backed per-person outreach angle that connects a current signal and owned workflow to one concrete OutageHub pilot. | outagehub-client-dossier, outagehub-lead-persona-profile, outagehub-contact-discovery, outagehub-account-scoring, outagehub-account-sourcing, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-offer-map, outagehub-market-coverage, outagehub-icp-contact-profile, outagehub-company-context | angle_summary, input_status, company_outreach_maps, person_dossiers, angle_patterns, claims_to_avoid, open_questions, source_notes |
| 34 | OutageHub Sequence Strategy | outagehub | Outreach Assistant | deterministic | openai/gpt-5.4-mini | Parked | [Superseded — off the live path] Legacy sequence-shape strategist; sequence shape is now generated deterministically from SEQUENCE_POLICIES. | outagehub-outreach-angle, outagehub-client-dossier, outagehub-contact-discovery, outagehub-account-scoring, outagehub-account-sourcing, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-offer-map, outagehub-market-coverage, outagehub-icp-contact-profile, outagehub-company-context | sequence_summary, strategic_point_of_view, sequence_architecture, touch_plan, persona_variants, timing_and_exit_rules, anti_spam_rules, handoff_to_drafter, claims_to_avoid, open_questions, source_notes |
| 35 | OutageHub Email Finder | outagehub | Outreach Assistant | cohort | openai/gpt-5.4-mini | Critical | Infer each company's email format from public evidence and produce likely email candidates for CRM leads. | outagehub-contact-discovery, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage | email_summary, company_email_maps, results, source_notes |
| 36 | OutageHub LinkedIn Message Writer | outagehub | Outreach Assistant | lead | openai/gpt-5.6 | Critical | Write hyper-tailored LinkedIn connection requests under 300 characters, grounded in verified profiles, person research, the Commercial Dossier, and outreach angle. | outagehub-client-dossier, outagehub-lead-persona-profile, outagehub-outreach-angle, outagehub-contact-discovery, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage | linkedin_message_summary, linkedin_connection_messages, claims_to_avoid, source_notes |
| 37 | OutageHub Email Sequence Drafter | outagehub | Outreach Assistant | lead | openai/gpt-5.5 | Parked | [Superseded — off the live path] Draft five-touch OutageHub paid-pilot sequences tied to one operational decision, proof path, implementation boundary, and annual conversion. | outagehub-email-drafter, outagehub-sequence-strategy, outagehub-email-finder, outagehub-outreach-angle, outagehub-client-dossier, outagehub-contact-discovery, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage | sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes |
| 38 | OutageHub Email Sequence Reviewer | outagehub | Outreach Assistant | lead | openai/gpt-5.5 | Supporting | Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's five-touch sequences; only 'ready' passes. | outagehub-email-drafter, outagehub-email-finder, outagehub-client-dossier, outagehub-contact-discovery, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage | review_summary, quality_rubric, global_findings, person_sequence_reviews, improved_person_email_sequences, recommended_send_order, reviewer_rules, claims_to_avoid, source_notes |
| 39 | Morrow Company Context | morrow | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Research the Morrow site and maintain the shared truth about what Morrow does. | None | company_summary, service_lanes, target_pressures, sales_implications, open_questions, source_notes |
| 40 | Morrow ICP Contact Profile | morrow | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn Morrow company context into ideal customer profiles and contact targeting guidance. | morrow-company-context | icp_summary, priority_segments, buyer_personas, contact_titles, trigger_events, fit_signals, disqualifiers, commercial_floor_signals, reachability_signals, outreach_angles, open_questions, source_notes |
| 41 | Morrow Deployment Growth Playbook | morrow | Signal Scout | control | openai/gpt-5.4-mini | Supporting | Research how successful co-packers, fulfillment, and CPG manufacturers acquired clients and translate the lessons into Morrow sales strategy policy. | morrow-company-context, morrow-icp-contact-profile | playbook_summary, companies_studied, historical_patterns, targeting_lessons, offer_lessons, credibility_lessons, sales_motion_lessons, response_generation_lessons, strategic_gaps_for_gnk, agent_policy_updates, experiments_to_run, claims_to_avoid, open_questions, source_notes |
| 42 | Morrow Offer Map | morrow | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn Morrow company and ICP context into per-segment pain, outcome, proof, and why-buy-now offer maps. | morrow-company-context, morrow-icp-contact-profile, morrow-boutique-growth-playbook | offer_map_summary, segment_offer_maps, cross_segment_offer_principles, urgency_triggers, proof_assets_to_build, claims_to_avoid, open_questions, source_notes |
| 43 | Morrow Industry Map | morrow | Signal Scout | control | openai/gpt-5.5 | Supporting | Enumerate every industry that fits the ICP and give a deep per-industry playbook to find companies and people (ICP -> industries -> companies -> people). | revenue-demand-radar, morrow-company-context, morrow-icp-contact-profile, morrow-offer-map | industry_map_summary, total_industries, industries, coverage_gaps, recommended_sourcing_order, open_questions, source_notes |
| 44 | Morrow Revenue Strategy | morrow | Account Qualifier | control | openai/gpt-5.4-mini | Supporting | Turn Morrow commercial targets, commission economics, and company-size constraints into deal-tier sourcing and scoring policy. | morrow-company-context, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-offer-map | strategy_summary, revenue_math, deal_tiers, company_size_boundaries, target_industry_logic, portfolio_strategy, sourcing_rules, scoring_rules, seller_commission_plan, open_questions, source_notes |
| 45 | Morrow Pipeline Capacity | morrow | Account Qualifier | control | local/deterministic | Supporting | Calculate required pipeline inventory, daily outbound volume, and lead-bucket refill targets from Morrow revenue goals. | morrow-revenue-strategy | capacity_summary, revenue_goal, conversion_assumptions, pipeline_targets, bucket_targets, recommended_split, recommended_prospecting, operating_rules, source_notes |
| 46 | Morrow Account Sourcing | morrow | Signal Scout | cohort | openai/gpt-5.4-mini | Critical | Source named target accounts that match Morrow ICP guidance and have a timely public trigger event. | revenue-demand-radar, morrow-company-context, morrow-industry-map, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-offer-map, morrow-revenue-strategy, morrow-pipeline-capacity | sourcing_summary, search_strategy, target_accounts, near_misses, open_questions, source_notes |
| 47 | Morrow Account Scoring | morrow | Account Qualifier | cohort | openai/gpt-5.4-mini | Critical | Rank input accounts against Morrow fit signals and disqualifiers, returning scored accounts with reasons and top-N recommendations. | morrow-company-context, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-offer-map, morrow-revenue-strategy, morrow-pipeline-capacity, morrow-account-sourcing | scoring_summary, input_status, scorecard, ranked_accounts, top_accounts, not_recommended, open_questions, source_notes |
| 48 | Morrow Contact Discovery | morrow | Account Qualifier | cohort | openai/gpt-5.4-mini | Critical | Find named working problem owners, evaluators, and credible routers at top accounts, avoiding unreachable executive-only targets. | morrow-company-context, morrow-account-scoring, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity | discovery_summary, search_strategy, account_contact_maps, contacts_to_prioritize, contacts_to_avoid, open_questions, source_notes |
| 49 | Morrow Lead Persona Profile | morrow | Account Qualifier | lead | openai/gpt-5.4-mini | Supporting | Research each discovered lead's individual culture, mindset, communication style, and perspective, and attach that vibe read to the lead and knowledge graph. | morrow-contact-discovery, morrow-icp-contact-profile | persona_summary, search_strategy, person_personas, cross_persona_patterns, claims_to_avoid, open_questions, source_notes |
| 50 | Morrow Client Dossier | morrow | Account Qualifier | lead | openai/gpt-5.4-mini | Critical | Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output. | morrow-contact-discovery, morrow-offer-map, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity | dossier_summary, company_contact_dossiers, dossiers, contact_offer_alignment, outreach_notes, evidence_gaps, open_questions, source_notes, recommended_angle, claims_allowed, claims_forbidden |
| 51 | Morrow Outreach Angle | morrow | Outreach Assistant | lead | openai/gpt-5.4-mini | Parked | [Superseded — off the live path] Produce a per-person outreach dossier with one specific opener tied to that person's trigger, role, and likely pain. | morrow-client-dossier, morrow-lead-persona-profile, morrow-contact-discovery, morrow-account-scoring, morrow-account-sourcing, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity, morrow-offer-map, morrow-icp-contact-profile, morrow-company-context | angle_summary, input_status, company_outreach_maps, person_dossiers, angle_patterns, claims_to_avoid, open_questions, source_notes |
| 52 | Morrow Sequence Strategy | morrow | Outreach Assistant | deterministic | openai/gpt-5.4-mini | Parked | [Superseded — off the live path] Legacy sequence-shape strategist; sequence shape is now generated deterministically from SEQUENCE_POLICIES. | morrow-outreach-angle, morrow-client-dossier, morrow-contact-discovery, morrow-account-scoring, morrow-account-sourcing, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity, morrow-offer-map, morrow-icp-contact-profile, morrow-company-context | sequence_summary, strategic_point_of_view, sequence_architecture, touch_plan, persona_variants, timing_and_exit_rules, anti_spam_rules, handoff_to_drafter, claims_to_avoid, open_questions, source_notes |
| 53 | Morrow Email Finder | morrow | Outreach Assistant | cohort | openai/gpt-5.4-mini | Critical | Infer each company's email format from public evidence and produce likely email candidates for CRM leads. | morrow-contact-discovery, morrow-revenue-strategy, morrow-pipeline-capacity | email_summary, company_email_maps, results, source_notes |
| 54 | Morrow Email Drafter | morrow | Outreach Assistant | lead | openai/gpt-5.5 | Critical | Unified sequence writer: produce the complete four-touch per-person sequence on the deterministic skeleton, grounded in the Commercial Dossier and verified contact. | morrow-email-finder, morrow-client-dossier, morrow-contact-discovery, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity | sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes |
| 55 | Morrow Email Sequence Drafter | morrow | Outreach Assistant | lead | openai/gpt-5.5 | Parked | [Superseded — off the live path] Draft four-touch, high-trust Morrow sequences that use trigger evidence, buyer context, the selected sprint, and the approved first-touch voice. | morrow-email-drafter, morrow-sequence-strategy, morrow-email-finder, morrow-outreach-angle, morrow-client-dossier, morrow-contact-discovery, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity | sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes |
| 56 | Morrow Email Sequence Reviewer | morrow | Outreach Assistant | lead | openai/gpt-5.5 | Critical | Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's four-touch sequences; only 'ready' passes. | morrow-email-drafter, morrow-email-finder, morrow-client-dossier, morrow-contact-discovery, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity | review_summary, quality_rubric, global_findings, person_sequence_reviews, improved_person_email_sequences, recommended_send_order, reviewer_rules, claims_to_avoid, source_notes |

## 14. Full 56-agent catalogue: detailed descriptions

### 1. Revenue Demand Radar (`revenue-demand-radar`)

- Visible workflow: Signal Scout.
- Venture scope: gnk, outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence weekly; timeout 1800s; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Aggregate current market signals, cluster funded problems, and route named accounts to the correct GNK or OutageHub sales play without blending the two motions.
- Inputs/dependencies: None.
- Outputs: radar_summary, signal_clusters, named_account_signals, offer_demand, durability_assessment, trigger_monitor, recommended_cohorts, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 2. GNK Company Context (`gnk-company-context`)

- Visible workflow: Signal Scout.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Research the GNK site and maintain the shared truth about what GNK does.
- Inputs/dependencies: None.
- Outputs: company_summary, service_lanes, target_pressures, sales_implications, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 3. GNK ICP Contact Profile (`gnk-icp-contact-profile`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn GNK company context into ideal customer profiles and contact targeting guidance.
- Inputs/dependencies: gnk-company-context.
- Outputs: icp_summary, priority_segments, buyer_personas, contact_titles, trigger_events, fit_signals, disqualifiers, commercial_floor_signals, reachability_signals, outreach_angles, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 4. GNK Boutique Growth Playbook (`gnk-boutique-growth-playbook`)

- Visible workflow: Signal Scout.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Research how successful software boutiques and consultancies acquired clients and translate the lessons into GNK sales strategy policy.
- Inputs/dependencies: gnk-company-context, gnk-icp-contact-profile.
- Outputs: playbook_summary, companies_studied, historical_patterns, targeting_lessons, offer_lessons, credibility_lessons, sales_motion_lessons, response_generation_lessons, strategic_gaps_for_gnk, agent_policy_updates, experiments_to_run, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 5. GNK Offer Map (`gnk-offer-map`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn GNK company and ICP context into per-segment pain, outcome, proof, and why-buy-now offer maps.
- Inputs/dependencies: gnk-company-context, gnk-icp-contact-profile, gnk-boutique-growth-playbook.
- Outputs: offer_map_summary, segment_offer_maps, cross_segment_offer_principles, urgency_triggers, proof_assets_to_build, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 6. GNK Industry Map (`gnk-industry-map`)

- Visible workflow: Signal Scout.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.5; tier control; cadence monthly; timeout 1800s; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Enumerate every industry that fits the ICP and give a deep per-industry playbook to find companies and people (ICP -> industries -> companies -> people).
- Inputs/dependencies: revenue-demand-radar, gnk-company-context, gnk-icp-contact-profile, gnk-offer-map.
- Outputs: industry_map_summary, total_industries, industries, coverage_gaps, recommended_sourcing_order, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 7. GNK Revenue Strategy (`gnk-revenue-strategy`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn GNK commercial targets, commission economics, and company-size constraints into deal-tier sourcing and scoring policy.
- Inputs/dependencies: gnk-company-context, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-offer-map.
- Outputs: strategy_summary, revenue_math, deal_tiers, company_size_boundaries, target_industry_logic, portfolio_strategy, sourcing_rules, scoring_rules, seller_commission_plan, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 8. GNK Pipeline Capacity (`gnk-pipeline-capacity`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: unspecified; model local/deterministic; tier control; cadence weekly; timeout not set; cost ceiling $0.5.
- Live-path status: supporting/control.
- Job: Calculate required pipeline inventory, daily outbound volume, and lead-bucket refill targets from GNK revenue goals.
- Inputs/dependencies: gnk-revenue-strategy.
- Outputs: capacity_summary, revenue_goal, conversion_assumptions, pipeline_targets, bucket_targets, recommended_split, recommended_prospecting, operating_rules, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 9. GNK Account Sourcing (`gnk-account-sourcing`)

- Visible workflow: Signal Scout.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout 1800s; cost ceiling $1.
- Live-path status: critical path.
- Job: Source named target accounts that match GNK ICP guidance and have a timely public trigger event.
- Inputs/dependencies: revenue-demand-radar, gnk-company-context, gnk-industry-map, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-offer-map, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: sourcing_summary, search_strategy, target_accounts, near_misses, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 10. GNK Account Scoring (`gnk-account-scoring`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout not set; cost ceiling $1.
- Live-path status: critical path.
- Job: Rank input accounts against GNK fit signals and disqualifiers, returning scored accounts with reasons and top-N recommendations.
- Inputs/dependencies: gnk-company-context, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-offer-map, gnk-revenue-strategy, gnk-pipeline-capacity, gnk-account-sourcing.
- Outputs: scoring_summary, input_status, scorecard, ranked_accounts, top_accounts, not_recommended, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 11. GNK Contact Discovery (`gnk-contact-discovery`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout 1800s; cost ceiling $1.
- Live-path status: critical path.
- Job: Find named working problem owners, evaluators, and credible routers at top accounts, avoiding unreachable executive-only targets.
- Inputs/dependencies: gnk-company-context, gnk-account-scoring, gnk-icp-contact-profile, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: discovery_summary, search_strategy, account_contact_maps, contacts_to_prioritize, contacts_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 12. GNK Lead Persona Profile (`gnk-lead-persona-profile`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence event_driven; timeout not set; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Research each discovered lead's individual culture, mindset, communication style, and perspective, and attach that vibe read to the lead and knowledge graph.
- Inputs/dependencies: gnk-contact-discovery, gnk-icp-contact-profile.
- Outputs: persona_summary, search_strategy, person_personas, cross_persona_patterns, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 13. GNK Client Dossier (`gnk-client-dossier`)

- Visible workflow: Account Qualifier.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output.
- Inputs/dependencies: gnk-contact-discovery, gnk-lead-persona-profile, gnk-offer-map, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: dossier_summary, company_contact_dossiers, dossiers, contact_offer_alignment, outreach_notes, evidence_gaps, open_questions, source_notes, recommended_angle, claims_allowed, claims_forbidden.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 14. GNK Outreach Angle (`gnk-outreach-angle`)

- Visible workflow: Outreach Assistant.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Produce the evidence-backed per-person outreach angle that connects a current signal and owned workflow to one concrete GNK engagement.
- Inputs/dependencies: gnk-client-dossier, gnk-lead-persona-profile, gnk-contact-discovery, gnk-account-scoring, gnk-account-sourcing, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity, gnk-offer-map, gnk-icp-contact-profile, gnk-company-context.
- Outputs: angle_summary, input_status, company_outreach_maps, person_dossiers, angle_patterns, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 15. GNK Sequence Strategy (`gnk-sequence-strategy`)

- Visible workflow: Outreach Assistant.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier deterministic; cadence per_lead; timeout not set; cost ceiling $0.05.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Legacy sequence-shape strategist; sequence shape is now generated deterministically from SEQUENCE_POLICIES.
- Inputs/dependencies: gnk-outreach-angle, gnk-client-dossier, gnk-contact-discovery, gnk-account-scoring, gnk-account-sourcing, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity, gnk-offer-map, gnk-icp-contact-profile, gnk-company-context.
- Outputs: sequence_summary, strategic_point_of_view, sequence_architecture, touch_plan, persona_variants, timing_and_exit_rules, anti_spam_rules, handoff_to_drafter, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 16. GNK Email Finder (`gnk-email-finder`)

- Visible workflow: Outreach Assistant.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout not set; cost ceiling $1.
- Live-path status: critical path.
- Job: Infer each company's email format from public evidence and produce likely email candidates for CRM leads.
- Inputs/dependencies: gnk-contact-discovery, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: email_summary, company_email_maps, results, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 17. GNK LinkedIn Message Writer (`gnk-email-drafter`)

- Visible workflow: Outreach Assistant.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.6; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Write hyper-tailored LinkedIn connection requests under 300 characters, grounded in verified profiles, person research, the Commercial Dossier, and outreach angle.
- Inputs/dependencies: gnk-client-dossier, gnk-lead-persona-profile, gnk-outreach-angle, gnk-contact-discovery, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: linkedin_message_summary, linkedin_connection_messages, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 18. GNK Email Sequence Drafter (`gnk-email-sequence-drafter`)

- Visible workflow: Outreach Assistant.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Draft four-touch, high-trust GNK sequences that use trigger evidence, buyer context, the selected sprint, and the approved first-touch voice.
- Inputs/dependencies: gnk-email-drafter, gnk-sequence-strategy, gnk-email-finder, gnk-outreach-angle, gnk-client-dossier, gnk-contact-discovery, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 19. GNK Email Sequence Reviewer (`gnk-email-sequence-reviewer`)

- Visible workflow: Outreach Assistant.
- Venture scope: gnk.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: supporting/control.
- Job: Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's four-touch sequences; only 'ready' passes.
- Inputs/dependencies: gnk-email-drafter, gnk-email-finder, gnk-client-dossier, gnk-contact-discovery, gnk-boutique-growth-playbook, gnk-revenue-strategy, gnk-pipeline-capacity.
- Outputs: review_summary, quality_rubric, global_findings, person_sequence_reviews, improved_person_email_sequences, recommended_send_order, reviewer_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 20. OutageHub Company Context (`outagehub-company-context`)

- Visible workflow: Signal Scout.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Research the OutageHub site and maintain the shared truth about what OutageHub does.
- Inputs/dependencies: None.
- Outputs: company_summary, service_lanes, target_pressures, sales_implications, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 21. OutageHub ICP Contact Profile (`outagehub-icp-contact-profile`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn OutageHub company context into ideal customer profiles and contact targeting guidance.
- Inputs/dependencies: outagehub-company-context.
- Outputs: icp_summary, priority_segments, buyer_personas, contact_titles, trigger_events, fit_signals, disqualifiers, commercial_floor_signals, reachability_signals, outreach_angles, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 22. OutageHub API Growth Playbook (`outagehub-boutique-growth-playbook`)

- Visible workflow: Signal Scout.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Research how successful API, data, and alerting products acquired clients and translate the lessons into OutageHub sales strategy policy.
- Inputs/dependencies: outagehub-company-context, outagehub-icp-contact-profile.
- Outputs: playbook_summary, companies_studied, historical_patterns, targeting_lessons, offer_lessons, credibility_lessons, sales_motion_lessons, response_generation_lessons, strategic_gaps_for_gnk, agent_policy_updates, experiments_to_run, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 23. OutageHub Offer Map (`outagehub-offer-map`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn OutageHub company and ICP context into per-segment pain, outcome, proof, and why-buy-now offer maps.
- Inputs/dependencies: outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook.
- Outputs: offer_map_summary, segment_offer_maps, cross_segment_offer_principles, urgency_triggers, proof_assets_to_build, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 24. OutageHub Industry Map (`outagehub-industry-map`)

- Visible workflow: Signal Scout.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.5; tier control; cadence monthly; timeout 1800s; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Enumerate every industry that fits the ICP and give a deep per-industry playbook to find companies and people (ICP -> industries -> companies -> people).
- Inputs/dependencies: revenue-demand-radar, outagehub-company-context, outagehub-icp-contact-profile, outagehub-offer-map.
- Outputs: industry_map_summary, total_industries, industries, excluded_because_data_source, coverage_gaps, recommended_sourcing_order, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 25. OutageHub Market Coverage (`outagehub-market-coverage`)

- Visible workflow: Signal Scout.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Map Canadian industries, account types, coverage gaps, and realistic short/medium/long sales motions for OutageHub.
- Inputs/dependencies: outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map.
- Outputs: market_coverage_summary, coverage_sources, industry_segments, portfolio_policy, bucket_overrides, sourcing_expansion_plan, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 26. OutageHub Revenue Strategy (`outagehub-revenue-strategy`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn OutageHub commercial targets, commission economics, and company-size constraints into deal-tier sourcing and scoring policy.
- Inputs/dependencies: outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map, outagehub-market-coverage.
- Outputs: strategy_summary, revenue_math, deal_tiers, company_size_boundaries, target_industry_logic, portfolio_strategy, sourcing_rules, scoring_rules, seller_commission_plan, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 27. OutageHub Pipeline Capacity (`outagehub-pipeline-capacity`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: unspecified; model local/deterministic; tier control; cadence weekly; timeout not set; cost ceiling $0.5.
- Live-path status: supporting/control.
- Job: Calculate required pipeline inventory, daily outbound volume, and lead-bucket refill targets from OutageHub revenue goals.
- Inputs/dependencies: outagehub-revenue-strategy, outagehub-market-coverage.
- Outputs: capacity_summary, revenue_goal, conversion_assumptions, pipeline_targets, bucket_targets, recommended_split, recommended_prospecting, operating_rules, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 28. OutageHub Account Sourcing (`outagehub-account-sourcing`)

- Visible workflow: Signal Scout.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout 1800s; cost ceiling $1.
- Live-path status: critical path.
- Job: Source named target accounts that match OutageHub ICP guidance and have a timely public trigger event.
- Inputs/dependencies: revenue-demand-radar, outagehub-company-context, outagehub-industry-map, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map, outagehub-market-coverage, outagehub-revenue-strategy, outagehub-pipeline-capacity.
- Outputs: sourcing_summary, search_strategy, target_accounts, near_misses, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 29. OutageHub Account Scoring (`outagehub-account-scoring`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout not set; cost ceiling $1.
- Live-path status: critical path.
- Job: Rank input accounts against OutageHub fit signals and disqualifiers, returning scored accounts with reasons and top-N recommendations.
- Inputs/dependencies: outagehub-company-context, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-offer-map, outagehub-market-coverage, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-account-sourcing.
- Outputs: scoring_summary, input_status, scorecard, ranked_accounts, top_accounts, not_recommended, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 30. OutageHub Contact Discovery (`outagehub-contact-discovery`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout 1800s; cost ceiling $1.
- Live-path status: critical path.
- Job: Find named outage-workflow owners, evaluators, and credible routers at top accounts, avoiding unreachable executive-only targets.
- Inputs/dependencies: outagehub-company-context, outagehub-account-scoring, outagehub-icp-contact-profile, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage.
- Outputs: discovery_summary, search_strategy, account_contact_maps, contacts_to_prioritize, contacts_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 31. OutageHub Lead Persona Profile (`outagehub-lead-persona-profile`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence event_driven; timeout not set; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Research each discovered lead's individual culture, mindset, communication style, and perspective, and attach that vibe read to the lead and knowledge graph.
- Inputs/dependencies: outagehub-contact-discovery, outagehub-icp-contact-profile.
- Outputs: persona_summary, search_strategy, person_personas, cross_persona_patterns, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 32. OutageHub Client Dossier (`outagehub-client-dossier`)

- Visible workflow: Account Qualifier.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output.
- Inputs/dependencies: outagehub-contact-discovery, outagehub-lead-persona-profile, outagehub-offer-map, outagehub-market-coverage, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity.
- Outputs: dossier_summary, company_contact_dossiers, dossiers, contact_offer_alignment, outreach_notes, evidence_gaps, open_questions, source_notes, recommended_angle, claims_allowed, claims_forbidden.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 33. OutageHub Outreach Angle (`outagehub-outreach-angle`)

- Visible workflow: Outreach Assistant.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Produce the evidence-backed per-person outreach angle that connects a current signal and owned workflow to one concrete OutageHub pilot.
- Inputs/dependencies: outagehub-client-dossier, outagehub-lead-persona-profile, outagehub-contact-discovery, outagehub-account-scoring, outagehub-account-sourcing, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-offer-map, outagehub-market-coverage, outagehub-icp-contact-profile, outagehub-company-context.
- Outputs: angle_summary, input_status, company_outreach_maps, person_dossiers, angle_patterns, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 34. OutageHub Sequence Strategy (`outagehub-sequence-strategy`)

- Visible workflow: Outreach Assistant.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier deterministic; cadence per_lead; timeout not set; cost ceiling $0.05.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Legacy sequence-shape strategist; sequence shape is now generated deterministically from SEQUENCE_POLICIES.
- Inputs/dependencies: outagehub-outreach-angle, outagehub-client-dossier, outagehub-contact-discovery, outagehub-account-scoring, outagehub-account-sourcing, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-offer-map, outagehub-market-coverage, outagehub-icp-contact-profile, outagehub-company-context.
- Outputs: sequence_summary, strategic_point_of_view, sequence_architecture, touch_plan, persona_variants, timing_and_exit_rules, anti_spam_rules, handoff_to_drafter, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 35. OutageHub Email Finder (`outagehub-email-finder`)

- Visible workflow: Outreach Assistant.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout not set; cost ceiling $1.
- Live-path status: critical path.
- Job: Infer each company's email format from public evidence and produce likely email candidates for CRM leads.
- Inputs/dependencies: outagehub-contact-discovery, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage.
- Outputs: email_summary, company_email_maps, results, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 36. OutageHub LinkedIn Message Writer (`outagehub-email-drafter`)

- Visible workflow: Outreach Assistant.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.6; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Write hyper-tailored LinkedIn connection requests under 300 characters, grounded in verified profiles, person research, the Commercial Dossier, and outreach angle.
- Inputs/dependencies: outagehub-client-dossier, outagehub-lead-persona-profile, outagehub-outreach-angle, outagehub-contact-discovery, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage.
- Outputs: linkedin_message_summary, linkedin_connection_messages, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 37. OutageHub Email Sequence Drafter (`outagehub-email-sequence-drafter`)

- Visible workflow: Outreach Assistant.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Draft five-touch OutageHub paid-pilot sequences tied to one operational decision, proof path, implementation boundary, and annual conversion.
- Inputs/dependencies: outagehub-email-drafter, outagehub-sequence-strategy, outagehub-email-finder, outagehub-outreach-angle, outagehub-client-dossier, outagehub-contact-discovery, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage.
- Outputs: sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 38. OutageHub Email Sequence Reviewer (`outagehub-email-sequence-reviewer`)

- Visible workflow: Outreach Assistant.
- Venture scope: outagehub.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: supporting/control.
- Job: Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's five-touch sequences; only 'ready' passes.
- Inputs/dependencies: outagehub-email-drafter, outagehub-email-finder, outagehub-client-dossier, outagehub-contact-discovery, outagehub-boutique-growth-playbook, outagehub-revenue-strategy, outagehub-pipeline-capacity, outagehub-market-coverage.
- Outputs: review_summary, quality_rubric, global_findings, person_sequence_reviews, improved_person_email_sequences, recommended_send_order, reviewer_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 39. Morrow Company Context (`morrow-company-context`)

- Visible workflow: Signal Scout.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Research the Morrow site and maintain the shared truth about what Morrow does.
- Inputs/dependencies: None.
- Outputs: company_summary, service_lanes, target_pressures, sales_implications, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 40. Morrow ICP Contact Profile (`morrow-icp-contact-profile`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn Morrow company context into ideal customer profiles and contact targeting guidance.
- Inputs/dependencies: morrow-company-context.
- Outputs: icp_summary, priority_segments, buyer_personas, contact_titles, trigger_events, fit_signals, disqualifiers, commercial_floor_signals, reachability_signals, outreach_angles, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 41. Morrow Deployment Growth Playbook (`morrow-boutique-growth-playbook`)

- Visible workflow: Signal Scout.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Research how successful co-packers, fulfillment, and CPG manufacturers acquired clients and translate the lessons into Morrow sales strategy policy.
- Inputs/dependencies: morrow-company-context, morrow-icp-contact-profile.
- Outputs: playbook_summary, companies_studied, historical_patterns, targeting_lessons, offer_lessons, credibility_lessons, sales_motion_lessons, response_generation_lessons, strategic_gaps_for_gnk, agent_policy_updates, experiments_to_run, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 42. Morrow Offer Map (`morrow-offer-map`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn Morrow company and ICP context into per-segment pain, outcome, proof, and why-buy-now offer maps.
- Inputs/dependencies: morrow-company-context, morrow-icp-contact-profile, morrow-boutique-growth-playbook.
- Outputs: offer_map_summary, segment_offer_maps, cross_segment_offer_principles, urgency_triggers, proof_assets_to_build, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 43. Morrow Industry Map (`morrow-industry-map`)

- Visible workflow: Signal Scout.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.5; tier control; cadence monthly; timeout 1800s; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Enumerate every industry that fits the ICP and give a deep per-industry playbook to find companies and people (ICP -> industries -> companies -> people).
- Inputs/dependencies: revenue-demand-radar, morrow-company-context, morrow-icp-contact-profile, morrow-offer-map.
- Outputs: industry_map_summary, total_industries, industries, coverage_gaps, recommended_sourcing_order, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 44. Morrow Revenue Strategy (`morrow-revenue-strategy`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier control; cadence monthly; timeout not set; cost ceiling $2.
- Live-path status: supporting/control.
- Job: Turn Morrow commercial targets, commission economics, and company-size constraints into deal-tier sourcing and scoring policy.
- Inputs/dependencies: morrow-company-context, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-offer-map.
- Outputs: strategy_summary, revenue_math, deal_tiers, company_size_boundaries, target_industry_logic, portfolio_strategy, sourcing_rules, scoring_rules, seller_commission_plan, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 45. Morrow Pipeline Capacity (`morrow-pipeline-capacity`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: unspecified; model local/deterministic; tier control; cadence weekly; timeout not set; cost ceiling $0.5.
- Live-path status: supporting/control.
- Job: Calculate required pipeline inventory, daily outbound volume, and lead-bucket refill targets from Morrow revenue goals.
- Inputs/dependencies: morrow-revenue-strategy.
- Outputs: capacity_summary, revenue_goal, conversion_assumptions, pipeline_targets, bucket_targets, recommended_split, recommended_prospecting, operating_rules, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 46. Morrow Account Sourcing (`morrow-account-sourcing`)

- Visible workflow: Signal Scout.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout 1800s; cost ceiling $1.
- Live-path status: critical path.
- Job: Source named target accounts that match Morrow ICP guidance and have a timely public trigger event.
- Inputs/dependencies: revenue-demand-radar, morrow-company-context, morrow-industry-map, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-offer-map, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: sourcing_summary, search_strategy, target_accounts, near_misses, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 47. Morrow Account Scoring (`morrow-account-scoring`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout not set; cost ceiling $1.
- Live-path status: critical path.
- Job: Rank input accounts against Morrow fit signals and disqualifiers, returning scored accounts with reasons and top-N recommendations.
- Inputs/dependencies: morrow-company-context, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-offer-map, morrow-revenue-strategy, morrow-pipeline-capacity, morrow-account-sourcing.
- Outputs: scoring_summary, input_status, scorecard, ranked_accounts, top_accounts, not_recommended, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 48. Morrow Contact Discovery (`morrow-contact-discovery`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout 1800s; cost ceiling $1.
- Live-path status: critical path.
- Job: Find named working problem owners, evaluators, and credible routers at top accounts, avoiding unreachable executive-only targets.
- Inputs/dependencies: morrow-company-context, morrow-account-scoring, morrow-icp-contact-profile, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: discovery_summary, search_strategy, account_contact_maps, contacts_to_prioritize, contacts_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 49. Morrow Lead Persona Profile (`morrow-lead-persona-profile`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence event_driven; timeout not set; cost ceiling $0.5.
- Live-path status: supporting/control.
- Job: Research each discovered lead's individual culture, mindset, communication style, and perspective, and attach that vibe read to the lead and knowledge graph.
- Inputs/dependencies: morrow-contact-discovery, morrow-icp-contact-profile.
- Outputs: persona_summary, search_strategy, person_personas, cross_persona_patterns, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 50. Morrow Client Dossier (`morrow-client-dossier`)

- Visible workflow: Account Qualifier.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output.
- Inputs/dependencies: morrow-contact-discovery, morrow-offer-map, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: dossier_summary, company_contact_dossiers, dossiers, contact_offer_alignment, outreach_notes, evidence_gaps, open_questions, source_notes, recommended_angle, claims_allowed, claims_forbidden.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 51. Morrow Outreach Angle (`morrow-outreach-angle`)

- Visible workflow: Outreach Assistant.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Produce a per-person outreach dossier with one specific opener tied to that person's trigger, role, and likely pain.
- Inputs/dependencies: morrow-client-dossier, morrow-lead-persona-profile, morrow-contact-discovery, morrow-account-scoring, morrow-account-sourcing, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity, morrow-offer-map, morrow-icp-contact-profile, morrow-company-context.
- Outputs: angle_summary, input_status, company_outreach_maps, person_dossiers, angle_patterns, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 52. Morrow Sequence Strategy (`morrow-sequence-strategy`)

- Visible workflow: Outreach Assistant.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier deterministic; cadence per_lead; timeout not set; cost ceiling $0.05.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Legacy sequence-shape strategist; sequence shape is now generated deterministically from SEQUENCE_POLICIES.
- Inputs/dependencies: morrow-outreach-angle, morrow-client-dossier, morrow-contact-discovery, morrow-account-scoring, morrow-account-sourcing, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity, morrow-offer-map, morrow-icp-contact-profile, morrow-company-context.
- Outputs: sequence_summary, strategic_point_of_view, sequence_architecture, touch_plan, persona_variants, timing_and_exit_rules, anti_spam_rules, handoff_to_drafter, claims_to_avoid, open_questions, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 53. Morrow Email Finder (`morrow-email-finder`)

- Visible workflow: Outreach Assistant.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.4-mini; tier cohort; cadence per_cohort; timeout not set; cost ceiling $1.
- Live-path status: critical path.
- Job: Infer each company's email format from public evidence and produce likely email candidates for CRM leads.
- Inputs/dependencies: morrow-contact-discovery, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: email_summary, company_email_maps, results, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 54. Morrow Email Drafter (`morrow-email-drafter`)

- Visible workflow: Outreach Assistant.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Unified sequence writer: produce the complete four-touch per-person sequence on the deterministic skeleton, grounded in the Commercial Dossier and verified contact.
- Inputs/dependencies: morrow-email-finder, morrow-client-dossier, morrow-contact-discovery, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 55. Morrow Email Sequence Drafter (`morrow-email-sequence-drafter`)

- Visible workflow: Outreach Assistant.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: superseded or parked.
- Job: [Superseded — off the live path] Draft four-touch, high-trust Morrow sequences that use trigger evidence, buyer context, the selected sprint, and the approved first-touch voice.
- Inputs/dependencies: morrow-email-drafter, morrow-sequence-strategy, morrow-email-finder, morrow-outreach-angle, morrow-client-dossier, morrow-contact-discovery, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: sequence_draft_summary, person_email_sequences, company_sequence_maps, recommended_send_order, global_send_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

### 56. Morrow Email Sequence Reviewer (`morrow-email-sequence-reviewer`)

- Visible workflow: Outreach Assistant.
- Venture scope: morrow.
- Runtime: api-key; model openai/gpt-5.5; tier lead; cadence per_lead; timeout 1800s; cost ceiling $0.5.
- Live-path status: critical path.
- Job: Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's four-touch sequences; only 'ready' passes.
- Inputs/dependencies: morrow-email-drafter, morrow-email-finder, morrow-client-dossier, morrow-contact-discovery, morrow-boutique-growth-playbook, morrow-revenue-strategy, morrow-pipeline-capacity.
- Outputs: review_summary, quality_rubric, global_findings, person_sequence_reviews, improved_person_email_sequences, recommended_send_order, reviewer_rules, claims_to_avoid, source_notes.
- Operational interpretation: its artifact is versioned and consumed only when required dependencies are present, fresh, and compatible with the active venture/play. Missing or stale critical inputs fail closed rather than being silently invented.

## 15. LinkedIn import and classification details

### Connections

The connection parser recognizes names, headlines, and dates despite copy/paste noise. It preserves Unicode and normalizes repeated whitespace. Classification is deterministic and explainable: title/headline keywords and operating context contribute to venture fit, while obviously unrelated roles remain Other. The system intentionally preserves routers and evaluators because a first-degree relationship may be valuable even when it is not the budget owner.

The import reuses canonical profile data where available and never discards manual venture/profile/review overrides on rerun.

### Conversations

The chat parser detects repeated LinkedIn UI labels, direction markers, names, timestamp labels, and message blocks. Message fingerprints create stable idempotency. Conversation analysis derives a summary, workflow status, response theme, proposed follow-up, meeting candidate, and contact details. These are inferred fields until human confirmation.

### Current venture distribution in the CRM

| Venture | Leads |
|---|---:|
| gnk | 106 |
| morrow | 39 |
| outagehub | 83 |
| unknown | 1 |

### Current conversation evidence

| Venture | Conversations | Outbound | Inbound | Conversations with reply | Any-reply rate |
|---|---:|---:|---:|---:|---:|
| gnk | 10 | 22 | 4 | 3 | 30.0% |
| morrow | 11 | 27 | 12 | 5 | 45.5% |
| outagehub | 12 | 34 | 12 | 4 | 33.3% |

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
| revisit_on_new_trigger | 12 |
| follow_up | 8 |
| confirm_meeting | 6 |
| decide_next_step | 4 |
| reply | 1 |
| work_referral | 1 |

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

A conversation can qualify only when its primary outcome is `qualified_commercial_interest` and a human has confirmed it. Required evidence: problem, consequence, owner, timing, commercial path, and next step. The system writes a qualification snapshot and creates/moves an opportunity to qualified.

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

The platform currently holds 33 imported conversations and 111 messages. 12 threads have an inbound reply, but none is yet human-confirmed as qualified commercial interest. The six meeting records are unconfirmed candidates, so confirmed meetings in the next seven days remain zero. Opportunities, proposals, contracts, booked project revenue, and MRR are zero.

That is not a software failure. It is the newly honest baseline.

The highest-priority known actions are:

- send Samuel Eboh three to five concise written questions and respect the request not to schedule a call;
- work Charlie Harland's referral using introducer context;
- verify exact details for the six inferred meeting/proposal candidates; and
- classify every engaged thread into a next step, pause, close reason, or suppression.

Canonical activity event mix:

| Event | Count |
|---|---:|
| sent | 83 |
| contact_evidence_missing | 44 |
| reply | 28 |

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

`npm test`  
`npm run founder:sync`  
`npm run dashboard`

Then open the localhost address printed by the server, normally a 127.0.0.1 port. Check Today, Conversations, Connections, Calendar, and System Health before changing behavior.

### Non-negotiable invariants

- Do not make `activity_events` mutable.
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
