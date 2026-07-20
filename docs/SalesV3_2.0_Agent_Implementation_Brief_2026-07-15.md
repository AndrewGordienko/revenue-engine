# SalesV3 2.0: Founder Revenue Operating System

Date: 15 July 2026  
Scope: GNK, OutageHub, and Morrow  
Status: authoritative implementation brief, normalized from the founder review

## Executive decision

SalesV3 will become Andrew's LinkedIn-first founder revenue cockpit and commercial memory. It will preserve the canonical CRM, raw provenance, suppression, venture boundaries, human approval, relationship memory, and deterministic controls. It will stop presenting lead volume, connection volume, agent volume, or any-reply rate as primary success.

The primary product object is the next action. The primary business KPI is paid commitment.

The operating loop is:

1. Detect a verified trigger or warm route.
2. Qualify the account and person against one venture and play.
3. Prepare a short human message and call rationale.
4. Require Andrew's approval and manual sending.
5. Import the conversation into canonical business events.
6. Surface the next action at the right time.
7. Prepare and record the call.
8. Qualify, disqualify, refer, pause, or open an opportunity.
9. Create a bounded project, evaluation, or pilot scope from buyer-confirmed evidence.
10. Learn from progression to payment rather than replies alone.

## Portfolio roles

| Venture | Role | Near-term commercial proof |
| --- | --- | --- |
| GNK | Cash engine and delivery proof | One paid $35k-$60k production sprint or $7.5k-$12.5k shaping engagement |
| OutageHub | Recurring external data asset | One bounded paid evaluation with an implementation and recurring path |
| Morrow | Long-term design-partner and robotics bet | One paid 4-8 week design-partner pilot around a bounded workflow |
| SalesV3 | Internal leverage | Reliable commercial memory and founder follow-through; not a fourth company |

Founder selling time for the initial sprint: GNK 45%, Morrow 40%, OutageHub 15%.

## Six visible workflows

The technical agent graph may remain underneath during migration, but the operator sees only:

1. Signal Scout.
2. Account Qualifier.
3. Outreach Assistant.
4. Conversation Triage.
5. Meeting and Deal Assistant.
6. Learning Analyst.

Andrew approves and sends messages, runs calls, confirms inferred facts, and decides whether to propose, pause, close, or suppress.

## LinkedIn operating contract

Every first message contains one verified reason now, one short venture description, one problem hypothesis, and one bounded ask.

- Connection note: maximum 300 characters.
- First message: normally 55-90 words.
- Follow-up: normally 35-60 words.
- One problem, one value proposition, one ask.
- No unsupported fact, feature list, speculative architecture, fake compliment, generic opening, fragmented prose, em dash, or "just checking in."
- Touch two occurs four to seven business days after touch one.
- Touch three requires a new trigger, useful artifact, referral context, or active relationship.
- Silent cold contacts pause after touch two.
- Human approval and sending remain mandatory.

Reply reporting distinguishes neutral/polite, correction, objection, current-process disclosure, problem acknowledgment, timing signal, referral, call proposed, call booked, qualified commercial interest, and negative/suppress.

## Canonical pipeline

0. Target.
1. Contacted.
2. Engaged.
3. Discovery booked.
4. Discovery completed.
5. Qualified opportunity.
6. Scoped.
7. Proposal sent.
8. Commercial commitment.
9. Won, lost, paused, referred, or research-only.

A positive reply or learning call must not create an opportunity automatically. Qualification requires buyer-confirmed pain, consequence, owner, timing, commercial path, and next step.

Every open conversation and opportunity has exactly one dated next action, future trigger, pause-until date, closed reason, or suppression.

## Minimal data additions

- `next_actions`: entity, action, due time, owner, status, priority, reason, source event.
- `conversation_outcomes`: primary outcome, secondary tags, confidence, confirmation, correction.
- `experiments`: venture, play, segment, hypothesis, variants, start and stop rules.
- `experiment_assignments`: entity, experiment, variant, assignment time.
- `qualification_snapshots`: venture-specific fields, buyer evidence, result, missing evidence.

Existing activity, meeting, opportunity, contract, outreach, LinkedIn connection, conversation, and message tables remain canonical. Imported LinkedIn events retain raw provenance and idempotent keys.

## Founder dashboard

The main surface contains:

- live conversations requiring a response;
- meetings in the next seven days;
- qualified opportunities;
- outstanding proposals;
- booked revenue and MRR;
- overdue next actions;
- the Today queue;
- pipeline progression by venture;
- qualified-reply and meeting-to-qualified learning.

Connection, lead, agent, test, and classifier counts move to Network Inventory and System Health.

## Epics

### P0-A Canonical LinkedIn synchronization

Map conversations and messages to canonical relationship leads, create idempotent sent/reply events, preserve provenance, queue inferred meetings for confirmation, report ambiguity, and backfill all current evidence.

Acceptance: 83 sent and 28 reply events reconcile to the 111-message source; reruns add zero duplicates; ambiguous identity never resolves silently; every event links to raw provenance.

### P0-B Today and next actions

Add one open action per active thread, ordered by live reply, meeting, promised follow-up, proposal, referral, and deliberate follow-up. Support complete, snooze, pause, close, and suppress.

Acceptance: every open thread has an action or terminal state; the daily queue can be cleared without agent pages; completed actions create canonical events.

### P0-C Meetings and outcomes

Require human or calendar confirmation, time-zone confirmation, meeting intent, a verified brief, structured outcome fields, and a 24-hour reminder.

Acceptance: inferred text never becomes a confirmed meeting by itself; research calls do not create opportunities; held meetings require an outcome.

### P1-A Qualification discipline

Install shared stages and venture-specific qualification cards. Record qualified, disqualified, paused, research-only, and referred paths. Prevent unqualified proposal generation unless Andrew records an override reason.

### P1-B LinkedIn outreach assistant

Prepare a connection note, first message, follow-up, and call rationale from one verified trigger. Enforce the message contract deterministically and require manual copy/send.

### P1-C Agent graph compression

Map 56 technical agents to six visible workflows, archive noncritical blocked agents, replace agent count with workflow freshness, and require every active artifact to have a consumer and decision.

### P1-D Experiment registry

Track venture, play, segment, hypothesis, variant, assignment, touch, reply type, meeting, qualification, proposal, and payment with sample-size warnings.

### P1-E Proposal and pilot scoping

Create GNK shaping/sprint, OutageHub evaluation, and Morrow design-partner templates from buyer-confirmed evidence only. Require problem, scope, exclusions, timeline, responsibilities, measures, price, decision date, and follow-up.

### P2-A Relationship and referral graph

Preserve relationship strength, prior company, mutual context, introducer, route, and referral conversion.

### P2-B Founder scorecard

Report paid commitments, booked revenue/MRR, qualified pipeline, conversion, operating control, and falsified assumptions. End weekly review with one revenue priority, one learning priority, one system fix, and one stop-doing decision.

## Thirty-day sequence

### Days 1-3

Reconcile 33 conversations and 111 messages, queue four booked and two proposed calls for confirmation, give every thread an action or terminal state, answer Samuel Eboh, work the Charlie Harland referral, and freeze broad ingestion/agent creation.

### Days 4-7

Install pipeline stages, meeting intents, qualification cards, flagship offers, call briefs, the Today view, and workflow-oriented system health.

### Week 2

Run a controlled test with 45 existing high-confidence people, 15 per venture. Tag relationship strength, venture, play, persona, trigger, opener, length, ask, touch, outcome, and next action.

### Week 3

Complete calls, capture outcomes within 24 hours, identify repeated problems, qualify consequence/owner/timing/budget/implementation, and make at least three evidence-supported commercial asks.

### Week 4

Work proposal blockers to a decision, record no-decisions honestly, compare ventures on qualified conversion/cycle/deal size/founder energy, and target one paid commitment.

## Acceptance gates

Data:

- Imports are idempotent and preserve raw provenance.
- Cross-venture leakage remains zero.
- Identity ambiguity never silently resolves.
- Low-confidence meeting times require confirmation.

Messaging:

- No guessed facts, wrong company/role, feature-list first touch, generic filler, or em dash.
- Connection note stays below 300 characters.
- Human approval is required.

Pipeline:

- No opportunity without qualification evidence.
- No open thread without next action or terminal state.
- No held meeting without an outcome reminder.
- No proposal without scope, measures, price, and next step.

Management:

- Dashboard events reconcile to source evidence.
- Metrics separate by venture and play.
- Any reply and qualified reply are never conflated.
- Agent and lead volume are not primary success metrics.

## Stop doing for 30 days

Do not add agents, broad lead volume, autonomous sending, Gmail cold automation, unlimited follow-up, portfolio-wide buyer messaging, or new specialist roles. Do not review all 359 Other connections, treat research as pipeline, report polite replies as traction, or let product work replace the daily selling block.

## Final decision standard

SalesV3 must answer without manual reconstruction:

1. Who needs Andrew's attention today, and why?
2. Which venture, buyer, trigger, and message creates qualified conversations?
3. Which calls reveal repeated, costly, buyer-owned problems?
4. Which qualified opportunities received a direct commercial ask?
5. What converted to payment?
6. What assumption was disproved?
7. What should stop next month?
