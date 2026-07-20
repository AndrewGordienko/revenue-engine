# SalesV3 Full System and Sales-Operating-System Audit

**Audit date:** 20 July 2026  
**Repository state audited:** the current local working tree, including uncommitted and untracked work  
**Purpose:** a self-contained, paste-ready description that can be given to another LLM or human advisor for critical review  
**Privacy posture of this document:** sanitized. It reports aggregate counts and architecture, but intentionally omits prospect names, personal message contents, email addresses, credentials, tokens, and private source data.

---

## 1. Executive conclusion

SalesV3 is an ambitious and unusually well-instrumented internal revenue cockpit. It combines a three-venture sales strategy, a canonical SQLite CRM, a LinkedIn relationship archive, a founder work queue, a gated commercial lifecycle, an agent research system, and a draft-only outbound layer. The engineering has several strong safety and provenance ideas that are worth preserving.

The system is not yet a reliable end-to-end sales operating system. It is best described as an **advanced internal prototype with a strong control model, a large historical relationship dataset, and an incomplete operational loop**.

The key mismatch is this:

> The system has a great deal of data and automation structure, but it has not yet converted that structure into a small, trustworthy daily work queue or any canonical commercial pipeline.

As of the audit:

- There are **572 canonical leads**, **766 LinkedIn connections**, **376 conversation records**, and **2,620 imported LinkedIn messages**.
- There are **331 open next actions**, of which approximately **270 are overdue** at the time of inspection.
- There are **11 inferred meeting candidates**, but all remain proposed/unconfirmed.
- There are **0 opportunities, 0 contracts, 0 queued outreach messages, 0 confirmed qualified commercial outcomes, and $0 canonical booked revenue/MRR**.
- The deterministic test suite passes **91/91 tests**, and the engineering acceptance command passes.
- The persisted smoke assertion fails **4 of 9 gates** because its current smoke database is empty/unprepared.
- The scheduled live controller is installed and enabled, but has failed **8 consecutive runs**.
- The six-account live loop is **0/6 complete**. Five accounts remain seeded and one prepared; none reached pending approval.
- The controller currently stops on the shared Demand Radar agent before it reaches the actual account work.
- More importantly, the GNK and OutageHub live `lead:prepare` path produces LinkedIn-message artifacts, while the post-pipeline promotion and live completion checks still require an email-sequence-reviewer artifact that is excluded from that critical path. From a clean state, those two flows do not meet.

This means the immediate priority is not more agents, more leads, or more historical data. It is to make one narrow commercial loop coherent and measurable:

1. choose a venture and one play;
2. choose a small active cohort;
3. produce one channel-appropriate message;
4. put it behind a human approval gate;
5. record the manual send;
6. capture reply, meeting, qualification, proposal, and payment;
7. report conversion using a defined time window and unique denominators.

Until that loop works on real accounts, the system should not be treated as a production revenue engine.

### Overall maturity assessment

These scores are judgment calls, not automated grades:

| Area | Assessment | Why |
|---|---:|---|
| Offer and play definition | 7/10 | Clear offers, prices, audiences, sequences, and fallback shapes exist for all three ventures. |
| Safety and lifecycle controls | 8/10 | Draft-only email, cohort/play locks, evidence gates, immutable events, suppression checks, and gated opportunity states are strong. |
| CRM/data architecture | 6/10 | SQLite is a sensible canonical store, but parallel projections, identity debt, enum drift, and historical imports reduce trust. |
| Founder workflow | 4/10 | The six-view cockpit is directionally good, but 331 open actions and historical action inflation prevent a genuinely focused daily queue. |
| Agent architecture | 4/10 | The tiering and contracts are thoughtful; the graph is too large, costly to reason about, currently blocked, and internally disconnected at promotion. |
| Measurement and learning | 2/10 | Several headline rates use invalid denominators or no time window; no experiments are active; no qualified pipeline exists. |
| Operational reliability | 2/10 | The controller has failed eight times and the real six-account loop is 0/6. |
| Security and privacy | 3/10 | Localhost and ignored runtime data help, but there is no app auth/CSRF protection, PII is duplicated in plaintext, and message bodies enter immutable logs. |
| Commercial evidence | 1/10 | There is extensive engagement history but no canonical opportunity, proposal, contract, or revenue record. |

---

## 2. Audit scope, method, and confidence

### What was reviewed

The audit covered:

- repository structure, package scripts, documentation, and working-tree state;
- the sales strategy and commercial play definitions;
- the browser UI and its six active destinations;
- dashboard HTTP/API routes and side effects;
- SQLite schema, invariants, triggers, migrations, and current aggregate data;
- LinkedIn connection and message import, classification, conversation analysis, and action generation;
- lead, opportunity, contract, meeting, and next-action lifecycle logic;
- the 56-agent registry, prompts/contracts, model choices, execution tiers, pipeline planner, and runtime runner;
- the live-smoke manifest, controller, current run status, and promotion handoff;
- Google/Gmail/Calendar and manual LinkedIn interaction boundaries;
- testing, acceptance gates, syntax checks, database integrity, privacy, security, performance, and documentation drift.

### Verification performed

- `npm test`: **91 passed, 0 failed**.
- `npm run acceptance`: **all engineering gates passed**.
- `node src/validate-agents.js`: **agent communication protocol OK for 56 agents**.
- `node --check public/app.js`: passed.
- `node --check src/dashboard-server.js`: passed.
- SQLite `PRAGMA integrity_check`: **ok**.
- SQLite foreign-key check: no violations returned.
- `npm run smoke:assert`: **failed 4 gates** against the current persisted smoke database.
- `npm run loop:report`: **0/6 live accounts complete**.
- `npm run controller:status`: installed/enabled; last run error; **8 consecutive errors**.
- The dashboard server and the main JSON endpoints were exercised locally. The root page and sampled APIs returned HTTP 200 during inspection.

### Important limitation

A visual click-through with the in-app browser could not be completed because no attachable in-app browser session was available. UI behavior was therefore audited from the application source, API payloads, route behavior, and static/runtime inspection rather than a full visual QA pass.

### Confidence labels used here

- **Observed:** confirmed directly from current code, database, command output, or API output.
- **Inferred:** a reasoned explanation of why an observed state exists; it should be validated before remediation.
- **Strategic judgment:** a recommendation about what should be prioritized.

---

## 3. What the system is trying to be

SalesV3 is a private, founder-operated, LinkedIn-first sales and relationship operating system for three ventures:

1. **GNK** — a senior engineering delivery/consulting business.
2. **OutageHub** — an outage-data and operational-context product/service.
3. **Morrow** — an adaptive robotics/software venture, currently framed around research/design-partner discovery as much as direct selling.

The intended user is the founder, not a sales team. The intended unit of work is the **next action**, not the contact record. The intended commercial truth is a **paid commitment**, not a lead count or a positive reply.

The current primary UI has six destinations:

- **Work** — what the founder should do now;
- **Network** — relationship and conversation context;
- **Playbooks** — venture strategy, plays, market themes, and target matches;
- **Pipeline** — funnel, outcomes, learning, and economics;
- **Calendar** — calls and meeting preparation;
- **System** — agent health, integrations, controls, and advanced operational views.

A venture switch scopes much of the UI to GNK, OutageHub, Morrow, or Other. The intended strategic invariant is strict brand separation: one relationship should be routed to one venture and one play at a time.

### Explicit non-goals or safety boundaries

- The system does **not** send automated email.
- LinkedIn outreach is manual: copy/edit a draft, send it yourself, then record the send.
- A generated message is not a sent message.
- A meeting candidate is not a confirmed meeting.
- A positive or friendly reply is not a qualified opportunity.
- An opportunity cannot become won without a signed contract and booked start date.
- Current source code is designed to stop at human approval for automated preparation.

These distinctions are among the strongest parts of the design.

---

## 4. Portfolio sales strategy

### 4.1 Portfolio-level target and allocation

The current code centers on an immediate **$40,000 commercial target**, but portfolio allocation is not governed consistently across documents:

- Current strategy code allocates effort approximately **GNK 60%, OutageHub 30%, revenue-engine work 10%**.
- A newer founder-centric implementation brief describes **GNK 45%, Morrow 40%, OutageHub 15%** founder-time allocation.

This is not a minor documentation difference. Those allocations imply very different daily queues and different definitions of success. The system needs one authoritative portfolio policy with an owner, effective date, and explicit distinction between:

- founder time;
- automation/research budget;
- near-term cash target;
- longer-term venture discovery.

### 4.2 Current play catalog

The active strategy version is `plan-2026-07-11`.

| Venture | Play | Commercial shape | Primary motion |
|---|---|---|---|
| GNK | `GNK-AI-01` Production AI Workflow Sprint | $40k–$60k | Sell a bounded production AI workflow outcome. |
| GNK | `GNK-BE-01` Backend Risk & Stabilization | $35k–$50k | Resolve a consequential backend/reliability bottleneck. |
| GNK | `GNK-DATA-01` Data & Operations Automation | $40k–$60k | Automate a costly data/operations workflow. |
| OutageHub | `OHUB-ISP-01` ISP/telecom operations pilot | $7.5k–$15k implementation plus $2.5k–$5k/month | Add external outage context to an operator workflow. |
| OutageHub | `OHUB-EMBED-01` embedded/data-partner pilot | $15k–$30k implementation plus $7.5k–$15k/month | Embed outage context into a partner product or data workflow. |
| OutageHub | `OHUB-FAC-01` facilities/property pilot | $5k–$15k implementation plus $1.5k–$5k/month | Add outage context to a facilities or operational monitoring workflow. |
| Morrow | `MORROW-COPACK-01` co-packer design-partner pilot | $15k–$50k pilot, then roughly $5k–$12k/month per cell | Validate adaptive automation in high-mix packing/kitting. |
| Morrow | `MORROW-CPG-01` CPG/manufacturer design-partner pilot | $15k–$50k pilot, then roughly $5k–$12k/month per cell | Validate a repeatable robotic-workflow wedge. |

The database contains **16 play rows**, not eight, because it retains both `plan-2026-07-10` and `plan-2026-07-11` versions. Keeping history is sensible. However, the current seeding behavior uses `INSERT OR IGNORE`; editing a play without bumping its version may leave the database with stale content. Version discipline is therefore mandatory.

### 4.3 Venture-specific sales motions

#### GNK

The commercial objective is one meaningful $40k–$60k engagement in roughly 30 days. The preferred sale is a fixed-scope sprint with a 50% deposit or the first month paid up front. If a buyer is not ready for the full engagement, the fallback is a one-week shaping engagement around $7.5k–$12.5k. A successful sprint can continue into an ownership pod or retainer.

The four-touch sequence is designed around days 1, 4, 10, and 18:

1. observed trigger and relevant outcome;
2. technical point of view;
3. bounded result or shaping option;
4. direct close or routing request.

#### OutageHub

The objective is three to four paid pilots, approximately $40k in first-month booked work, and a path toward $40k MRR over 60–120 days. The motion combines implementation revenue with recurring subscription/data revenue.

The five-touch sequence uses approximately days 1, 4, 9, 16, and 25:

1. one operational workflow and observed signal;
2. evidence or proof framing;
3. implementation and success definition;
4. annual economics/value;
5. direct close or router request.

#### Morrow

The immediate objective is two to three design partners and one paid pilot. The primary channel policy says LinkedIn first, with connection notes constrained to around 300 characters and a four-touch pattern around days 1, 3, 7, and 14.

Morrow is strategically different from the other ventures. Many imported relationships are classified as research, operator, or workflow-learning relationships rather than buyers. That is a good distinction, but it needs explicit conversion rules from research conversation to design-partner qualification.

### 4.4 Strategy gaps

1. **Morrow lacks `campaignTargets` in the active sales-play configuration.** The pipeline report therefore produces a null target for Morrow even though commercial targets exist elsewhere.
2. **Time allocation conflicts across current documents.** The UI cannot produce a trustworthy portfolio queue until this is resolved.
3. **The sales plays are clearer than the proof assets.** The system describes claims, triggers, and offers extensively, but no canonical case-study/proof inventory is modeled as a first-class governed object.
4. **Research, relationship development, and active pipeline are blended in reporting.** This is most visible in Morrow.
5. **The stated 30-day campaign targets are compared with years of historical message events.** The strategic intent and the measurement implementation do not align.

---

## 5. Intended end-to-end operating loop

The intended flow can be summarized as:

```text
Portfolio policy
  -> venture play
  -> market/trigger research
  -> play-locked cohort
  -> account scoring
  -> buyer/contact discovery
  -> evidence and dossier
  -> channel-appropriate draft
  -> human approval
  -> manual LinkedIn send or external draft creation
  -> canonical sent event
  -> reply/outcome classification
  -> next action / meeting
  -> qualification
  -> defined solution and proposal
  -> signed contract + booked start
  -> revenue and learning
```

The system has code for almost every box. The problem is not the absence of components; it is the coherence between them.

### Current reality by stage

| Stage | Current reality |
|---|---|
| Portfolio and offers | Defined, but portfolio allocation conflicts. |
| Research and historical network | Large amount of data and many agent artifacts. |
| Active cohort | Several cohorts exist, but the live six-account cohorts remain draft. |
| Account/contact evidence | Mixed; LinkedIn identity is relatively good, email evidence is not. |
| Message creation | LinkedIn and legacy email paths coexist. |
| Human approval queue | Empty. |
| Recorded outreach | Historical LinkedIn archive exists; current live-smoke loop has sent nothing. |
| Replies and outcomes | Historical replies are imported and inferred, but none are confirmed qualified commercial interest. |
| Meetings | Eleven candidates, none confirmed in the canonical workflow. |
| Opportunities/proposals | None. |
| Contracts/revenue | None. |

---

## 6. Technical architecture

### 6.1 Stack

- **Runtime:** Node.js ES modules; package requires Node `>=22.5.0`.
- **Database:** built-in `node:sqlite`, SQLite in WAL mode.
- **Web app:** vanilla browser JavaScript and CSS; no client framework.
- **HTTP server:** Node HTTP server, bound to `127.0.0.1`, default port `8796`, with limited port fallback.
- **Visualization:** a vendored force-graph browser bundle.
- **Agent runtime:** OpenClaw workspaces plus direct OpenAI-backed agent execution.
- **External integrations:** Gmail draft creation/sync and Google Calendar meeting creation when configured; manual LinkedIn operation and official LinkedIn CSV export import.
- **Dependencies:** no declared third-party npm runtime dependencies; most code uses Node built-ins.

### 6.2 Major runtime components

```text
Browser SPA (public/app.js)
        |
        v
Local dashboard HTTP/API server (src/dashboard-server.js)
        |
        +--> Canonical SQLite CRM (data/crm.db)
        |      - leads, conversations, actions, meetings
        |      - events, opportunities, contracts, cohorts
        |      - LinkedIn archive and learning projections
        |
        +--> Sales policy and founder operations
        |      - sales plays
        |      - next-action generation
        |      - qualification/proposal controls
        |
        +--> Agent pipeline runner
        |      - agents/registry.json
        |      - OpenClaw workspaces
        |      - model calls
        |      - artifact validation
        |
        +--> Shared agent projections
        |      - data/state.json
        |      - data/messages.jsonl
        |      - data/artifacts/*
        |      - ontology graph
        |      - lead memory JSONL
        |
        +--> Post-pipeline adapters
        |      - sourced artifact -> CRM lead
        |      - reviewed sequence -> pending approval
        |
        +--> External/manual actions
               - create Gmail draft (never send)
               - create Calendar event
               - copy/edit LinkedIn message and record manual send
```

### 6.3 Source-of-truth hierarchy

The intended hierarchy is:

1. **SQLite CRM** — canonical writable commercial state.
2. **Immutable activity events** — canonical evidence for contact/reply progression.
3. **Agent artifact bus** — generated research and draft outputs.
4. **Ontology and per-lead memory** — reusable context/projections for agents.
5. **Legacy JSONL files** — read-only compatibility/import inputs.

In practice, there are too many semi-authoritative representations:

- `data/crm.db`;
- `data/state.json`;
- `data/messages.jsonl`;
- `data/artifacts/*`;
- `data/ontology/graph.jsonl`;
- product-specific lead-memory JSONL;
- legacy lead JSONL files;
- generated message manifests;
- official LinkedIn CSV exports;
- imported LinkedIn tables.

The SQLite CRM should remain the only canonical commercial state. Every other store should have a clearly documented direction, owner, rebuild procedure, retention policy, and staleness indicator.

### 6.4 Repository size and complexity

The working directory is roughly **3.9 GB**, primarily because of agent/OpenClaw runtime directories and artifacts. The primary source/docs/registry surface is approximately **21,000 lines**, with several high-complexity files:

- `public/app.js`: approximately 3,800 lines;
- `agents/registry.json`: approximately 2,820 lines;
- the existing full handoff document: approximately 1,600 lines;
- `src/run-agent.js`: approximately 900 lines;
- `src/dashboard-server.js`: approximately 900 lines;
- `src/founder-ops.js`: approximately 700 lines;
- `src/db.js`: approximately 570 lines.

The SPA still contains many older render functions and legacy concepts that are no longer part of the six primary destinations. This increases the chance that UI behavior, labels, and metrics drift from the current operating model.

---

## 7. User interface and founder workflow

### 7.1 Work

The Work view is meant to answer the best possible question: **what should the founder do next?** It uses next actions derived from conversation state, meetings, and commercial stages.

Current problems:

- There are **331 open actions**, which is far beyond a usable founder queue.
- Roughly **270 are overdue** at audit time.
- The current composition is approximately:
  - 159 follow-ups;
  - 59 revisit-on-new-trigger watchlist items;
  - 53 decide-next-step items;
  - 45 replies;
  - 11 meeting confirmations;
  - 4 referral actions.
- Full historical message import created actions for old conversations. The generator often treats an old outbound thread with fewer than two messages as a due follow-up and an old inbound thread as requiring a current decision.
- Historical archive synchronization increased the queue dramatically: an older handoff described only 32 actions, while the current canonical state has 331 open actions.

The Work view is therefore functioning more like an **unfiltered historical exception list** than a daily operating queue.

Recommended rule: an item should appear in Today only if it is attached to an active relationship/campaign, has a real due date, is not superseded, and is inside a defined recency window. Everything else should be Inbox, Backlog, Watchlist, or Archive.

### 7.2 Network

The Network view has strong raw material:

- official LinkedIn connections and message history;
- direct LinkedIn profile URLs;
- product and play classification;
- conversation direction and response state;
- inferred outcome and action;
- identity-match metadata;
- relationship roles such as buyer, router, operator, research contact, or needs context.

However, nearly all connection-review records remain `new`; only a small number have been dismissed and none are in a fully reviewed/qualified state. The system has imported and classified the archive faster than the founder can validate it.

### 7.3 Playbooks

The Playbooks view combines:

- hardcoded venture strategy;
- play definitions and economics;
- market theses;
- target matches derived from classified connections;
- agent-generated strategy artifacts.

There are nine market theses and 648 proposed target matches, but zero market signals. All target matches remain proposed rather than human-confirmed. Because sync logic retains older matches and adds new top-ranked sets, 648 should not be interpreted as 648 validated targets.

### 7.4 Pipeline

The Pipeline view attempts to show historical activity, reply/outcome learning, campaign targets, and commercial economics. It is the least trustworthy primary view because its denominators and windows are not consistently defined. Specific measurement issues are documented later.

The most reliable pipeline statement today is simple: **zero canonical opportunities, proposals, contracts, or booked revenue**.

### 7.5 Calendar

The Calendar view surfaces meeting candidates, call preparation, and canonical meeting records. Eleven candidate meetings were inferred from conversations, but all are still proposed and unconfirmed. There are no confirmed meetings in the operating loop.

Creating a Google Calendar meeting is a real external side effect and can send calendar updates. This action is reachable from the local application and deserves stronger authentication/confirmation controls than ordinary local edits.

### 7.6 System

The System view includes agent health, integration status, test status, ontology, and advanced/legacy operational views. It is useful for diagnosis, but it can create false assurance:

- the UI hardcodes `91 passing` and a last-verified date of 16 July 2026;
- 91 tests do currently pass, but the displayed verification date is stale and the smoke assertion fails;
- agent health reports only 11 fresh agents and around 50 blocked agents;
- the current scheduled controller has failed eight times;
- several workflow summaries are inferred from registry names rather than actual completed end-to-end work.

System health should be calculated at request time from explicit checks, with separate states for unit tests, integration fixture, live pipeline, controller, data freshness, and commercial loop.

---

## 8. Canonical data model

The SQLite database currently has 28 main tables.

### 8.1 Core targeting and campaign structure

| Table | Role | Current count |
|---|---|---:|
| `leads` | Canonical person/account prospect record | 572 |
| `sales_plays` | Versioned venture offers and motion definitions | 16 |
| `cohorts` | Play-locked groups of prospects | 12 |
| `target_matches` | Thesis/play-to-connection recommendations | 648 |

### 8.2 Commercial progression

| Table | Role | Current count |
|---|---|---:|
| `activity_events` | Immutable sent/reply/meeting/commercial evidence log | 2,664 |
| `opportunities` | Separate deal state machine | 0 |
| `contracts` | Signed/active commercial commitments | 0 |
| `meetings` | Proposed/confirmed meeting records | 11 |
| `qualification_snapshots` | Structured qualification history | 0 |
| `pipeline_runs` | Recorded pipeline executions | 24 |

### 8.3 Messaging and compliance

| Table | Role | Current count |
|---|---|---:|
| `outreach_messages` | Generated messages awaiting review/approval/draft | 0 |
| `suppression` | Address/domain suppression list | 0 |

### 8.4 LinkedIn relationship archive

| Table | Role | Current count |
|---|---|---:|
| `linkedin_connections` | Official connection catalog plus classification | 766 |
| `linkedin_conversations` | Per-person thread projection | 376 |
| `linkedin_messages` | Imported individual messages | 2,620 |
| `linkedin_connection_drafts` | Connection/outreach draft records | 312 |
| `linkedin_connection_research` | Enrichment/research records | 314 |
| `conversation_outcomes` | Inferred/human outcome layer | 376 |
| `message_observations` | Outbound-message feature/learning records | 1,544 |
| `message_learnings` | Higher-level learning records | 3 |

### 8.5 Strategy and experimentation

| Table | Role | Current count |
|---|---|---:|
| `market_theses` | Venture market hypotheses | 9 |
| `market_signals` | Time-stamped external evidence | 0 |
| `experiments` | Formal message/motion experiments | 0 |
| `experiment_assignments` | Lead/conversation-to-variant assignments | 0 |

### 8.6 Operations and integration

| Table | Role | Current count |
|---|---|---:|
| `next_actions` | Founder work queue | 374 total; 331 open, 43 cancelled |
| `provider_sync_state` | External provider cursors/status | 0 |
| `merge_conflicts` | Identity/data consolidation conflicts | 140 |
| `meta` | Schema/import/sync metadata | 10 |

### 8.7 Lifecycle design

Prospect lifecycle:

```text
target -> researched -> route_ready -> enrolled -> engaged
   |          |             |             |
   +----------+-------------+-------------+--> disqualified or nurture

nurture -> target or researched
contact_evidence_missing -> route_ready or enrolled after manual evidence
```

Important gates:

- `enrolled` may only be materialized by a canonical `sent` event;
- `engaged` may only be materialized by a canonical `reply` event;
- route readiness requires a play, contact evidence, deliverability freshness, known jurisdiction, legal-basis evidence, and no suppression;
- actual email send eligibility additionally requires sender/unsubscribe infrastructure and no unresolved prior contact.

Opportunity lifecycle:

```text
discovery -> qualified -> solution_defined -> proposal -> contracting -> won
    |            |                |             |            |
    +------------+----------------+-------------+----------> lost
```

Important gates:

- an opportunity can only open from an engaged prospect;
- qualification requires problem, consequence, owner, timing, decision path, and next step;
- solution definition requires solution, success metrics, price, and responsibilities;
- proposal requires a defined solution and scheduled proposal-review step;
- `won` can only be produced by a signed contract with a booked start date and revenue value.

This separation between person progression and deal progression is good design.

### 8.8 Database strengths

- WAL mode and a busy timeout support concurrent local readers/writers.
- Foreign keys are enabled and currently clean.
- Activity events are protected from update and deletion by database triggers.
- Event dedupe keys reduce duplicate imports.
- A partial unique index limits a lead to one open next action.
- Cohorts are locked to plays after approval.
- Source, evidence, cohort, and pipeline lineage are present in many important paths.
- Official LinkedIn imports use source hashes/keys to be repeatable.
- Opportunity and contract transitions are enforced in code and tested.

### 8.9 Database weaknesses

- `leads.identity_key` is not unique. There are currently **five duplicate identity groups**, representing five extra lead rows.
- There are **140 unresolved merge conflicts**, including a smaller critical subset.
- Many status/stage fields are comments or application conventions rather than database `CHECK` constraints.
- Several references are polymorphic text/JSON and cannot be protected by foreign keys.
- JSON columns are weakly typed and validated inconsistently.
- The migration pattern is incremental `CREATE IF NOT EXISTS` plus `addColumn`, with a broadly fixed schema version of `2`, rather than ordered, reversible, auditable migrations.
- Direct SQL in founder workflows inserts commercial activity-event types such as `opportunity_qualified`, `scope_agreed`, and `proposal_sent`, while `crm-model.js` exposes a narrower prospect event enumeration. The database accepts both because event type has no `CHECK` constraint.
- Opportunity-stage vocabulary drifts across files. The authoritative opportunity module uses `solution_defined` and `proposal`; founder reporting also recognizes legacy/alternate values such as `scoped`, `proposal_sent`, and `commercial_commitment`.
- Keeping message bodies inside immutable event payloads creates a conflict between audit immutability and future privacy deletion/redaction requirements.

---

## 9. Current data and commercial snapshot

All counts below are observed aggregates from the current local database and intentionally omit personal identities.

### 9.1 Leads by venture and prospect stage

| Venture | Total | Target | Enrolled | Engaged | Contact evidence missing |
|---|---:|---:|---:|---:|---:|
| GNK | 316 | 83 | 101 | 119 | 13 |
| Morrow | 56 | 28 | 10 | 18 | 0 |
| OutageHub | 199 | 40 | 108 | 20 | 31 |
| Unknown | 1 | 1 | 0 | 0 | 0 |
| **Total** | **572** | **152** | **219** | **157** | **44** |

This stage distribution mostly reflects imported historical LinkedIn events, not a current, deliberately managed campaign.

### 9.2 Identity and contact evidence

- 92 leads are labeled strong identity matches; 480 are weak.
- 489 leads are marked as needing review.
- 44 are blocked/contact-evidence-missing.
- Only 61 leads have an email address in the observed aggregate, and all 61 are labeled guessed.
- No observed email address is verified or supported as a published business address.
- Current email outreach therefore cannot legitimately reach send-ready state, which is the correct behavior.

### 9.3 LinkedIn connections

| Classification | Count |
|---|---:|
| GNK | 243 |
| Morrow | 86 |
| OutageHub | 95 |
| Other | 342 |
| **Total** | **766** |

All stored LinkedIn profiles use direct or confirmed profile routes rather than search-result URLs. That is a meaningful data-quality improvement.

The archive remains mostly unreviewed. Almost all review statuses are `new`, with only a small number dismissed and none fully qualified through a formal review state.

### 9.4 Conversations and messages

- 376 conversation projections.
- 2,620 individual LinkedIn messages:
  - 1,544 outbound;
  - 1,076 inbound.
- Archive date range: approximately October 2018 through 15 July 2026.
- The canonical activity-event count reconciles exactly to:
  - 1,544 `sent` events;
  - 1,076 `reply` events;
  - 44 `contact_evidence_missing` migration events;
  - 2,664 total.

Distinct conversation summary for the three active ventures:

| Venture | Conversations | Contacted conversations | Conversations with inbound | Naive historical response ratio |
|---|---:|---:|---:|---:|
| GNK | 161 | 152 | 69 | 45.4% |
| Morrow | 42 | 41 | 26 | 63.4% |
| OutageHub | 130 | 129 | 19 | 14.7% |

These ratios are still not campaign conversion rates because they span years, do not consistently prove that the inbound message followed the recorded outbound campaign, and do not use cohort/time-window attribution.

The 43 `Other` conversations are especially important: almost all contain inbound history while only one contains outbound history. The current global code divides conversations with any inbound by conversations with outbound, producing a nonsensical 4,300% `Other` response rate and inflating the overall response metric.

### 9.5 Inferred outcomes

All 376 conversation outcomes are currently inferred; none are human-confirmed.

| Outcome | Count |
|---|---:|
| No reply | 219 |
| Neutral | 67 |
| Positive | 57 |
| Objection | 18 |
| Referral | 13 |
| Negative | 2 |

There are **zero confirmed `qualified_commercial_interest` outcomes**. A positive tone should not be treated as sales qualification.

### 9.6 Meetings and next actions

- 11 meeting candidates exist.
- All 11 are proposed rather than confirmed.
- The candidates are currently framed primarily as research conversations.
- There are no confirmed calendar meetings in the live operating loop.
- There are 331 open next actions and 43 cancelled actions.
- The founder overview returned roughly 272 actionable-work items and 59 watchlist items.

### 9.7 Commercial truth

| Commercial object | Count/value |
|---|---:|
| Qualified opportunities | 0 |
| Proposals | 0 |
| Contracts | 0 |
| Booked one-time revenue | $0 |
| Booked MRR | $0 |
| Outreach messages in approval queue | 0 |
| Formal experiments | 0 |

This is the most important baseline in the audit. Historical conversation volume is not current pipeline.

---

## 10. LinkedIn import, identity, classification, and action generation

### 10.1 Import approach

The system prefers an official LinkedIn data export rather than scraping. Import metadata records source counts, timestamps, and a source hash. The last major official import occurred on 16 July 2026.

The import pipeline:

1. parses connection and message CSVs, including multiline messages;
2. normalizes LinkedIn profile URLs;
3. matches or creates CRM lead records;
4. groups messages into person-level conversations;
5. materializes sent/reply events;
6. classifies venture, play, role, outcome, and next action;
7. preserves selected human workflow overrides on resync.

This is a sensible foundation and the parser/import behavior has meaningful test coverage.

### 10.2 Classification layers

Connections are classified through a mixture of:

- confirmed conversation evidence;
- deterministic rules;
- CRM identity matches;
- imported research/enrichment;
- human overrides.

Confidence buckets include strong, probable, possible, unmatched, and unresolved. Morrow relationships are intentionally distinguished as research/operator/workflow contacts rather than automatically treated as buyers.

### 10.3 Identity debt

The system still has substantial identity uncertainty:

- 480 of 572 lead records are weak identity matches;
- five identity-key duplicate groups remain;
- 140 merge conflicts are unresolved;
- a large portion of connection records remain `needs_context` or otherwise unreviewed;
- product and play assignment can persist even when a connection is later reclassified.

### 10.4 Cross-venture play leakage in live conversation projections

The current conversation table violates the intended one-venture/one-play invariant:

- Morrow conversations include several GNK play IDs.
- OutageHub conversations include several GNK play IDs.
- Other conversations include GNK, OutageHub, and Morrow play IDs.

This does not mean the registry's static play classifier leaks across brands—the acceptance benchmark for that classifier passes. It means the **persisted conversation projection** has stale or conflicting assignments.

The likely cause is that sync logic preserves an existing `play_id` when a conversation's product classification changes, and only infers a new play when the field is empty. This is an inference and should be confirmed with a migration test before changing data.

### 10.5 Historical action inflation

The current action generator does not apply a strong campaign-recency policy. Old inbound messages can become current replies/decisions, and old short outbound threads can become overdue follow-ups. A full archive import therefore turns historical relationship records into today's work.

Recommended model:

- `relationship_history`: complete archive, never itself a task;
- `active_motion`: explicit venture, play, cohort, owner, opened date, and expiry;
- `next_action`: only generated for active motions or explicit promises;
- `watchlist`: event-triggered, undated, not counted as overdue;
- `archive`: no current action.

### 10.6 Message learning

The system creates one `message_observation` per outbound message and derives simple features such as length and ask style. This is a promising event-learning foundation, but the current dataset is confounded by:

- multi-year historical messages;
- multiple ventures and contexts;
- inconsistent play assignment;
- no formal experiment assignments;
- inferred rather than confirmed outcomes;
- message-level counts where the sales question is often lead-, thread-, or cohort-level.

No message-learning recommendation should be treated as causal until attribution is tightened.

---

## 11. Agent system

### 11.1 Registry shape

The registry contains **56 agents**:

- 1 shared Demand Radar;
- 18 GNK agents;
- 19 OutageHub agents;
- 18 Morrow agents.

By execution tier:

| Tier | Count | Intended cadence |
|---|---:|---|
| Control | 23 | Brand/market policy, refreshed when stale |
| Cohort | 12 | Account and contact sourcing for a selected cohort |
| Lead | 18 | Person-specific dossier, angle, message, and review |
| Deterministic | 3 | Stable local sequence/policy logic |

By model/runtime declaration:

| Runtime/model | Count |
|---|---:|
| OpenAI GPT-5.4-mini | 41 |
| OpenAI GPT-5.5 | 10 |
| OpenAI GPT-5.6 | 2 |
| Local/deterministic | 3 |

Fifty-three agents are declared as API-key executions; the three deterministic agents do not have an API execution mode. This differs from older documentation that described most agents as gateway-based. The registry and runner should be treated as current truth.

### 11.2 Mirrored functional graph

The venture-specific graph is largely mirrored.

#### Shared

- `revenue-demand-radar`

#### GNK

- Control: company context, ICP/contact profile, boutique growth playbook, offer map, industry map, revenue strategy, pipeline capacity.
- Cohort: account sourcing, account scoring, contact discovery, email finder.
- Lead: lead persona profile, client dossier, outreach angle, email drafter/LinkedIn writer, legacy email-sequence drafter, email-sequence reviewer.
- Deterministic: sequence strategy.

#### OutageHub

- Control: company context, ICP/contact profile, boutique growth playbook, offer map, industry map, market coverage, revenue strategy, pipeline capacity.
- Cohort: account sourcing, account scoring, contact discovery, email finder.
- Lead: lead persona profile, client dossier, outreach angle, email drafter/LinkedIn writer, legacy email-sequence drafter, email-sequence reviewer.
- Deterministic: sequence strategy.

#### Morrow

- Control: company context, ICP/contact profile, boutique growth playbook, offer map, industry map, revenue strategy, pipeline capacity.
- Cohort: account sourcing, account scoring, contact discovery, email finder.
- Lead: lead persona profile, client dossier, outreach angle, email drafter, email-sequence drafter, email-sequence reviewer.
- Deterministic: sequence strategy.

### 11.3 Critical-path design

There are 23 critical-path agents:

- GNK: four cohort agents and four lead agents;
- OutageHub: four cohort agents and four lead agents;
- Morrow: four cohort agents and three lead agents.

The `lead:prepare` planner is constrained to critical lead agents:

- GNK: persona, dossier, angle, LinkedIn message writer — four model calls.
- OutageHub: persona, dossier, angle, LinkedIn message writer — four model calls.
- Morrow: dossier, email drafter, email reviewer — three model calls.

The acceptance harness correctly enforces a maximum of six critical lead calls and currently observes a maximum of four.

### 11.4 Named pipelines

| Pipeline | Selection | Intended role |
|---|---|---|
| `strategy:refresh` | Control tier, freshness-aware | Refresh market, ICP, offer, and commercial policy. |
| `cohort:build` | Cohort tier | Source, score, and verify a bounded cohort. |
| `lead:prepare` | Critical lead tier only | Prepare a small number of selected leads. |
| `full` | Chain of the three above | Convenience end-to-end preparation run. |

Freshness is based on the current strategy version plus the agent's last-run timestamp and stale-after-hours budget. Completed artifacts can also be skipped during a resumed live run.

### 11.5 Runner behavior

The agent runner:

- loads registry, current shared state, dependencies, sales policy, scoped lead context, ontology, and lead memory;
- builds a direct prompt, capped at roughly 500,000 characters;
- executes an OpenClaw agent locally with an API credential resolved from the environment or local Codex authentication;
- extracts JSON from the response;
- validates required output fields and special message/reviewer contracts;
- checks strategy version, dependency freshness, identity, sourcing reachability, and some evidence rules;
- publishes state, bus messages, durable artifacts, ontology operations, and lead-memory updates;
- records wall-clock runtime, with runtime-per-account as a proxy because token/cost usage is not surfaced.

### 11.6 Agent-system strengths

- Explicit tiering stops strategy research from being intentionally rerun per lead.
- Version/freshness checks reduce accidental use of stale policy.
- Per-brand prompts and play rules reduce static cross-brand leakage.
- Cohort scoping and live-manifest checks fail closed.
- Artifact contracts are tested.
- Direct profile/identity and source-evidence checks are stronger than typical experimental agent systems.
- Runtime artifacts are durable, making interrupted runs resumable in principle.
- The deterministic scorer has a labeled benchmark and stable output.

### 11.7 Agent-system weaknesses

#### A. A noncritical agent blocks the whole live pipeline

The shared Demand Radar is labeled `criticalPath: false`, but `strategy:refresh` still selects it. The pipeline executes steps sequentially and aborts on any agent failure, regardless of the critical-path flag. The live controller currently fails on this agent before reaching account work.

The acceptance report also identifies almost all Demand Radar output fields as unconsumed. In other words, a nominally noncritical, largely unconsumed research agent is the current single point of failure for the entire live loop.

#### B. GNK/OutageHub generation and promotion contracts do not meet

Observed current path:

```text
lead:prepare
  -> runs gnk/outagehub email-drafter
  -> these now output linkedin_connection_messages
  -> post-pipeline promotion calls promoteSequencesFromState()
  -> promotion reads <brand>-email-sequence-reviewer
  -> expects improved_person_email_sequences
```

But the GNK and OutageHub email-sequence reviewers are noncritical and excluded from `lead:prepare`. The live completion predicate also checks reviewer sequences and pending-approval outreach records.

Consequences:

- on a clean state, `lead:prepare` can generate valid LinkedIn messages but promotion finds no reviewer artifact and queues nothing;
- if an old reviewer artifact exists, promotion can read stale output from a different path/run;
- the live loop can never prove current LinkedIn preparation complete using its email-reviewer-based completion predicate;
- tests cover the individual LinkedIn writer path and the individual reviewer-to-queue path, but not their actual composition in the current `full` plan.

This is a structural integration defect, not merely a failed model call.

#### C. Morrow is on a different and incomplete channel path

Morrow's critical lead path still uses an email drafter and email reviewer even though the sales policy says LinkedIn first. Separate deterministic Morrow connection-draft code exists, but it is not normalized into the same pipeline contract as GNK/OutageHub.

Morrow also:

- lacks active campaign targets in the reporting config;
- has no live-smoke manifest accounts;
- is excluded from the scheduled live controller;
- has no completed current agent artifacts in health reporting;
- is represented operationally mainly by imported LinkedIn history and rule-based drafts.

#### D. Artifact validation is narrower than the apparent assurance

The runtime validates required top-level keys and several special cases, but it is not a comprehensive JSON Schema validation system. A payload can satisfy field presence while containing low-quality, inconsistent, or semantically weak content. Multi-source research is largely prompt-enforced rather than independently verified.

#### E. Cost and data-governance visibility is incomplete

- No token or model-cost ledger is available.
- Up to 53 agents can send prospect/company context to an external model provider.
- There is no visible per-field redaction/minimization policy before prompt construction.
- Model, prompt, and artifact lineage exist partially but are not presented as a complete audit record per recommendation.
- A 500,000-character prompt cap is very large and can hide severe context/cost inefficiency.

#### F. Operational graph is too large for the current outcome

Fifty-six agents, 56 workspaces, multiple models, multiple projections, and a multi-gigabyte local runtime are supporting a system with no current approval queue or opportunity. The graph should be simplified around the smallest proven revenue loop before more specialized agents are added.

---

## 12. Live-smoke loop and scheduled controller

### 12.1 Live mode

The presence of `data/inputs/live-smoke-accounts.json` turns on live-smoke restrictions. In this mode, any account-touching `cohort:build`, `lead:prepare`, or `full` pipeline must include an explicit `--cohort`; otherwise it fails closed. This is a strong safety boundary, but the activation mechanism is surprising because merely leaving the manifest file in place changes generic CLI behavior.

The manifest contains six named accounts:

- three GNK accounts, one per current GNK play;
- three OutageHub accounts, one per current OutageHub play;
- no Morrow accounts.

One account has an explicitly approved play change; the other five reconcile directly. Names are intentionally omitted from this paste-safe report.

### 12.2 Current live-loop status

Current aggregate status:

- 0 of 6 reached `pending_approval`;
- 5 remain `seeded`;
- 1 is `prepared`;
- all six cohorts are still draft;
- 0 messages are pending approval;
- 0 messages are approved, drafted, or sent;
- 0 replies, meetings, opportunities, or wins exist in this live run.

### 12.3 Controller

The controller is:

- installed;
- enabled;
- scheduled for 09:00 on weekdays;
- configured to run preflight, initialization, GNK, OutageHub, and a report;
- draft-only and intended to stop at human approval;
- not configured to run Morrow;
- configured with no result-delivery channel.

Current health:

- last status: error;
- consecutive errors: 8;
- last run duration: about 32 seconds;
- failure occurred at the first selected agent, the shared Demand Radar;
- the stored diagnostic is a large truncated command/prompt, not a concise root-cause code.

### 12.4 Retry and diagnosis

The supervisor retries failures classified as transient up to two additional times and attempts to resume completed artifacts. This is directionally good. However:

- error classification is based largely on output text;
- the exact model/runtime failure is obscured by a huge command dump;
- failed agent, exit status, provider error class, retryability reason, and model request ID are not normalized into structured diagnostics;
- a control-agent failure prevents cohort and lead work;
- controller delivery is disabled, so failures can recur silently unless the founder opens System or runs a status command.

### 12.5 Configuration drift

The controller source includes an older comment suggesting installation is disabled by default, while the current constant enables it by default. Operational comments and defaults should not disagree for a scheduled process with model cost and CRM side effects.

---

## 13. Outbound, approval, and integrations

### 13.1 Email safety

The code contains unusually strong email safety controls:

- `OUTBOUND_SENDING_SUPPORTED` is false.
- Gmail send methods throw unconditionally, even if an environment flag attempts to enable them.
- No send-capable HTTP API route exists.
- A generated sequence enters a pending human-review state rather than sending.
- Creating a Gmail draft never records a sent event.
- Cohort approval forces human approval and disables auto-send.
- Guessed email addresses cannot satisfy the evidence/legal-basis gates.
- Deliverability must be fresh.
- Jurisdiction, legal-basis evidence, suppression, unsubscribe, and duplicate-contact checks exist.
- Replies, bounces, and unsubscribes can stop or suppress further contact.

The draft-only invariant is directly tested and should be preserved.

### 13.2 Email path is currently inert

The database contains zero outreach queue records. All observed email addresses are guessed and none has current verified deliverability/legal-basis evidence. Even if the agent path were fixed, the email route should remain blocked until legitimate contact evidence and jurisdiction-specific policy are available.

The legal/compliance gates are technical policy controls, not legal advice. Their jurisdiction model is intentionally narrow and should be reviewed by qualified counsel before any real email program.

### 13.3 LinkedIn path

LinkedIn messages are generated for manual use. The UI supports copying/editing and explicitly recording a manual send. It does not call LinkedIn to transmit a message. This is safer, easier to reason about, and better aligned with the current relationship-led strategy.

The key missing link is a canonical LinkedIn-specific approval object/state. Reusing the email `outreach_messages` reviewer path creates the current contract mismatch. The system needs either:

- a channel-neutral `outreach_messages` model that supports LinkedIn and email with channel-specific gates; or
- a dedicated LinkedIn draft/review/record-send state machine.

### 13.4 Gmail integration

When configured, Gmail can:

- create drafts;
- sync Sent/Inbox history;
- translate actual sent/reply events into the CRM.

It cannot send through this build. Credentials live outside the repository, which is appropriate. Provider-sync state is currently empty.

### 13.5 Google Calendar integration

The system can create calendar meetings and optionally send attendee updates. This is a meaningful external action. It should require:

- authenticated operator identity;
- an explicit final confirmation showing attendee, time zone, duration, and update behavior;
- idempotency protection;
- an audit event that excludes unnecessary personal message content.

---

## 14. API surface

The local server exposes broad read and mutation capabilities. Routes can be grouped as follows.

### System and agent state

- shared state and bus messages;
- agent registry, run status, health, integration status, ontology, and smoke status;
- pipeline starts and task-status checks.

### CRM and research

- lead list/update/import/CSV;
- prospect/research views;
- email-finding operations;
- lead memory and ontology context.

### Revenue operations

- pipeline report and revenue events;
- cohort approval;
- outreach review/approval/draft actions;
- Gmail synchronization.

### Founder operations

- founder overview and reconciliation/sync;
- next-action updates;
- experiments and assignments;
- opportunity qualification, scoping, and proposal actions;
- meeting proposal, confirmation, booking, outcome, and call brief.

### LinkedIn

- prospect desk;
- connections list/update;
- conversations list/update;
- pasted chat import;
- manual sent-event recording.

### API weaknesses

- No authentication or role-based authorization.
- No CSRF token or Origin/Host policy for state-changing requests.
- No API versioning or formal OpenAPI/schema contract.
- No rate limiting.
- Request-body buffering is globally unbounded; a route-specific size check occurs only after the entire body is read.
- Invalid JSON is silently converted to `{}`, which can allow default actions instead of an explicit 400 response.
- List APIs return large unpaginated datasets.
- Several UI callers catch failures and substitute empty arrays/objects, potentially presenting partial state as healthy empty state.
- Errors and response envelopes are inconsistent.

---

## 15. Measurement and reporting audit

### 15.1 Response-rate denominator bug

The founder overview counts:

- contacted = conversations with outbound;
- any replies = all conversations with inbound.

It does not require the inbound and outbound to belong to the same contacted conversation before forming the ratio. The `Other` segment therefore reports an impossible rate because it contains many inbound-only archived threads.

Correct minimum definition:

```text
response_rate = unique conversations in cohort
                with a sent campaign touch before first inbound reply
                / unique conversations in cohort with a sent campaign touch
```

It also needs a defined observation window and minimum time-to-reply maturity.

### 15.2 Campaign target versus historical archive

The pipeline report compares all historical events, some dating to 2018, with a 30-day campaign target. It counts message events rather than consistently counting unique leads or conversations. This makes the displayed volume and positive-reply progress unsuitable for campaign management.

Required dimensions for every funnel number:

- venture;
- play;
- cohort/campaign;
- channel;
- event date window;
- unique entity being counted;
- attribution rule;
- maturity cutoff;
- human-confirmed versus inferred outcome.

### 15.3 Researched-account artifact

The pipeline report can add an undefined company value to a JavaScript `Set` when conversation-linked leads have no company. This can create a researched-account count even when no real account identity supports it.

### 15.4 Morrow target gap

Morrow's pipeline target is null because its strategy definition lacks the campaign-target shape consumed by reporting.

### 15.5 Message versus conversation attribution

The pipeline report's product message and positive-reply counts diverge substantially from the conversation view because they use message-level/event-level joins and historical lead/play assignment. Without a single metric specification, two screens can both appear precise while answering different questions.

### 15.6 Agent/System health

The UI's 91-test status is hardcoded. The current 91 tests do pass, but a live health display must not be a static label. The current persisted smoke assertion fails, and the scheduled live job is unhealthy; those facts should be first-class.

### 15.7 Learning validity

There are no formal experiment records or variant assignments. The system should avoid claims such as “this message works” based only on historical positive replies. At minimum, learning needs:

- a frozen cohort;
- one primary hypothesis;
- controlled variant assignment;
- a defined outcome and observation window;
- unique-thread attribution;
- enough samples to avoid anecdotal conclusions;
- a human-confirmed commercial outcome beyond sentiment.

### 15.8 Recommended canonical metrics

The initial executive dashboard should contain only:

1. active cohort size;
2. reviewed contacts with valid channel evidence;
3. manual sends recorded this week;
4. unique replies attributable to those sends;
5. qualified conversations;
6. confirmed meetings;
7. scoped opportunities;
8. proposals reviewed with buyers;
9. signed contracts;
10. booked one-time revenue and MRR;
11. founder actions due today;
12. operational-loop health.

Everything else should be a drill-down, not a headline KPI.

---

## 16. Testing, reliability, and observability

### 16.1 What is tested well

The 91-test suite covers:

- deterministic classifier quality and stability;
- critical-path size and registry output consumption;
- prospect and opportunity lifecycle gates;
- activity-event immutability and deduplication;
- legal-basis, jurisdiction, deliverability, suppression, and duplicate-contact checks;
- draft-only Gmail behavior;
- cohort and play consistency;
- LinkedIn connection/message parsing and imports;
- conversation analysis;
- manual send event behavior;
- source/evidence contracts;
- live-smoke manifest validation and retry classification;
- direct reviewer-artifact promotion into an approval queue;
- synthetic end-to-end opportunity progression.

This is a meaningful engineering asset.

### 16.2 Current command results

| Check | Result |
|---|---|
| Unit/integration test command | 91/91 passed |
| Engineering acceptance | Passed |
| Agent communication validation | Passed for 56 agents |
| JS syntax checks | Passed |
| SQLite integrity | Passed |
| SQLite foreign keys | Passed |
| Persisted smoke assertion | Failed 4/9 gates |
| Real six-account live loop | 0/6 complete |
| Scheduled controller | Error, 8 consecutive failures |

The smoke assertion failures are:

- GNK does not currently show exactly four fixture touches;
- OutageHub does not currently show exactly five fixture touches;
- the persisted fixture does not currently prove one brand/one play per lead;
- the expected clean six-dossier fixture end state is absent.

The smoke report shows zero fixture accounts, indicating the persisted smoke database has not been seeded/prepared for that assertion. The automated test suite does exercise an isolated synthetic version successfully. This is a tooling/fixture reproducibility problem, while the separate live-loop failure is a real operational problem.

### 16.3 Important coverage gap

Tests prove two separate components:

1. `lead:prepare` can select the current LinkedIn writer path;
2. a supplied email-reviewer artifact can be promoted into the queue.

They do not prove that the actual current `full` pipeline generates the same artifact that its post-pipeline adapter consumes. A new integration test should start from empty state, execute the planned agent outputs as fixtures, run the real post-adapter, and assert that a current-channel draft reaches the human gate without reading stale artifacts.

### 16.4 Observability gaps

- Controller failures do not have a normalized error code/provider cause.
- No notifications are delivered for the scheduled controller.
- Agent token usage and cost are absent.
- Model request IDs and provider latency are not captured consistently.
- The UI does not separate stale, blocked, never-run, failed, and commercially irrelevant artifacts clearly enough.
- A noncritical agent is operationally blocking despite its label.
- There is no single trace ID that connects cohort, lead, agent run, artifact, draft, manual send, reply, meeting, opportunity, and contract.

---

## 17. Security, privacy, and compliance

### 17.1 Positive controls

- The server binds to loopback rather than all network interfaces.
- Runtime data and credentials are largely ignored by Git.
- No obvious committed credential was found in the reviewed non-runtime source/config surface.
- Email sending is technically unsupported.
- LinkedIn is manual rather than automated.
- Source provenance and legal-basis fields exist.
- Suppression and unsubscribe concepts exist.
- External credentials are stored outside the repository.

### 17.2 Localhost is not an authorization model

The dashboard has no authentication, authorization, session, Origin validation, or CSRF protection. Localhost reduces remote exposure, but it does not protect against:

- another local process or user;
- a malicious browser page issuing state-changing requests to localhost;
- DNS-rebinding-style browser attacks;
- accidental exposure through port forwarding, tunnels, or future bind changes.

This matters because POST routes can mutate CRM state, approve cohorts, start costly agent runs, create Gmail drafts, and create calendar meetings. A cross-site form can often issue a POST even if browser same-origin policy prevents reading the response. Silently treating invalid JSON as `{}` makes default-action routes more dangerous.

### 17.3 Plaintext personal data

The CRM database, shared state, message bus, ontology graph, and official LinkedIn exports are stored in plaintext. Several inspected data files had ordinary world-readable file permissions (`0644`) rather than owner-only permissions.

The data includes:

- contact identities and profile URLs;
- full private message bodies;
- relationship classifications;
- inferred sentiment/outcomes;
- meeting details;
- possibly email addresses and legal-basis evidence.

On a multi-user machine or broad backup system, this is avoidable exposure.

### 17.4 PII duplication and deletion conflict

Private message bodies are duplicated across:

- official CSV exports;
- `linkedin_messages`;
- conversation projections;
- activity-event payloads;
- API responses and founder overview payloads;
- potentially state/artifact/ontology/lead-memory context.

Activity events are database-immutable, including payloads. If payloads contain full personal messages, the system cannot selectively redact/delete that text without rebuilding or bypassing its immutability guarantees. A better model is:

- immutable event metadata and hashes/references;
- erasable/encrypted message content in a separately governed store;
- explicit retention periods;
- a tested deletion/export procedure.

### 17.5 Model-provider data flow

The agent runner can include lead, account, artifact, ontology, and memory context in prompts sent to an external model provider. There is no clearly defined redaction/minimization layer or data-classification policy in front of the 53 API-backed agents.

Before scaling, define:

- which fields may leave the machine;
- which message contents are prohibited;
- whether private LinkedIn messages may be used;
- retention/training settings for the provider account;
- per-agent minimum necessary context;
- an audit log of model, prompt class, data classes, and result;
- a way to delete/reprocess affected artifacts.

### 17.6 Git and backup risk

Runtime data is ignored, but `.gitignore` has local changes that allowlist some contact/message-related JSON files. That makes accidental PII commits easier. The current official export is untracked/ignored, which is good.

Backups appear manual and local, including pre-consolidation database and JSON snapshots. There is no documented automated encrypted backup, SQLite-consistent snapshot procedure, retention schedule, or tested restore. Copying a live WAL database incorrectly can produce incomplete backups.

### 17.7 Performance as privacy surface

The main GNK dashboard startup fetched roughly **7.2 MB** across about 15 API responses during local inspection. Large payloads included shared state, all leads, conversations, founder overview, connections, messages, playbooks, and registry data. Message content is duplicated across responses.

This causes:

- slow initial load and repeated parsing;
- unnecessary exposure of personal data to every main view;
- larger memory footprint;
- harder debugging because unrelated endpoint failures are hidden by fallbacks.

Use server-side pagination, field selection, per-view fetching, summaries by default, and explicit expansion for message bodies.

### 17.8 Compliance caveat

The code's CASL/PECR-shaped gates are thoughtful engineering controls, but compliance depends on facts, jurisdiction, message content, business relationship, platform terms, and legal interpretation. This audit does not make a legal determination. Keep the system draft/manual until counsel reviews the intended real-world outreach process.

---

## 18. Documentation and repository-state audit

### 18.1 Working tree

The audit was performed against a heavily modified working tree, not only the last commit. At inspection:

- approximately 33 tracked files were modified;
- changes totaled roughly 4,153 additions and 671 deletions;
- many Morrow, LinkedIn, founder-workflow, documentation, script, and data files were untracked;
- major modified files included the SPA, styles, dashboard server, database layer, and agent registry.

This is a reproducibility and loss-risk issue. The user's changes were not altered except for adding this audit document and normal test/runtime effects. Before architectural remediation, create a deliberate checkpoint branch/commit after reviewing PII and generated files.

### 18.2 Documentation drift

- The 16 July full handoff is useful but predates the latest official LinkedIn import and therefore understates conversations, messages, actions, and leads.
- An older sales-approach report reflects a more email-centric system and obsolete activity assumptions.
- The business plan covers GNK and OutageHub more fully than Morrow.
- The current UI test badge uses a hardcoded verification date.
- README descriptions of agent execution mode do not match the current registry/runner.
- Controller comments do not match the enabled-by-default constant.
- Strategy allocation differs between code and a newer founder-centric brief.

The project needs one short authoritative operating specification and generated status appendices. Historical reports should be explicitly labeled superseded rather than left to compete as current truth.

### 18.3 API/code maintainability

- `public/app.js` is a large monolith with primary and legacy views interleaved.
- `src/dashboard-server.js` is a large route switch without formal route schemas or middleware boundaries.
- The agent registry repeats large mirrored definitions; cloning creates drift, especially visible in Morrow's channel path.
- Schema evolution is not represented as ordered migrations.
- Several statuses have parallel vocabularies.
- Static UI configuration contains operator-specific details that should be runtime configuration.

---

## 19. Prioritized findings

### P0 — restore one coherent commercial loop

#### P0.1 The scheduled live pipeline is not operational

**Evidence:** 0/6 live accounts complete; eight consecutive controller errors; current failure at Demand Radar.  
**Impact:** automation cannot prepare real work reliably.  
**Recommendation:** remove noncritical research from the blocking path; capture the exact provider error; run a one-account, one-play supervised canary; alert the founder on failure.

#### P0.2 The generated artifact and promotion artifact do not match for GNK/OutageHub

**Evidence:** critical `lead:prepare` generates `linkedin_connection_messages`; promotion and live completion read `improved_person_email_sequences` from an excluded reviewer.  
**Impact:** clean live runs cannot reach the intended human approval gate.  
**Recommendation:** define a channel-neutral draft contract or a LinkedIn-specific review contract, make the completion predicate consume it, and add a clean-state integration test.

#### P0.3 The founder work queue is not operationally usable

**Evidence:** 331 open actions, around 270 overdue, largely inflated by historical archive import.  
**Impact:** genuine replies and commitments are obscured; the system increases rather than reduces founder cognitive load.  
**Recommendation:** introduce explicit active-motion/recency rules; archive historical actions; cap Today; separate watchlist from due work; require an owner and due date.

#### P0.4 Commercial reporting does not yet represent a sales funnel

**Evidence:** impossible response rates, multi-year events compared with 30-day targets, message-versus-thread denominator drift, zero canonical opportunities.  
**Impact:** decisions may optimize misleading numbers.  
**Recommendation:** replace headline metrics with cohort-, channel-, time-, and unique-entity-defined metrics; display zero qualified pipeline clearly.

### P1 — make the data and operating controls trustworthy

#### P1.1 Cross-venture play leakage exists in persisted conversations

**Evidence:** Morrow, OutageHub, and Other conversations carry conflicting venture play IDs.  
**Impact:** wrong playbooks, drafts, and learning attribution.  
**Recommendation:** add a database/application invariant; produce a dry-run repair report; require explicit migration decisions where human overrides exist.

#### P1.2 Identity debt is material

**Evidence:** 480 weak lead identities, five duplicate groups, 140 unresolved merge conflicts.  
**Impact:** duplicated work, incorrect conversation joins, and unreliable attribution.  
**Recommendation:** build a merge-review queue, make canonical identity unique where safe, and store source-specific aliases separately.

#### P1.3 Morrow is strategically present but operationally incomplete

**Evidence:** no campaign target in report config, no controller/live-smoke coverage, no current agent runs, and a legacy email critical path despite LinkedIn-first policy.  
**Impact:** portfolio allocation and UI imply a mature motion that the runtime does not support.  
**Recommendation:** either explicitly mark Morrow as research-only in this system or give it a complete LinkedIn-first design-partner loop and target schema.

#### P1.4 Noncritical and unconsumed agent outputs still create failure/cost

**Evidence:** Demand Radar is noncritical and largely unconsumed, yet blocks `full`; acceptance also reports unconsumed OutageHub fields.  
**Impact:** avoidable latency, cost, and fragility.  
**Recommendation:** remove unconsumed outputs/agents, or bind them to explicit downstream decisions and make refresh failures degradable.

#### P1.5 App authorization and CSRF controls are absent

**Evidence:** localhost-only server but no authentication/Origin/CSRF guard; high-side-effect POST routes.  
**Impact:** malicious local/web context can mutate data, start model work, or create external drafts/meetings.  
**Recommendation:** add an operator session or strong local token, strict Origin/Host checks, CSRF protection, JSON content-type enforcement, explicit confirmations, and bounded request bodies.

#### P1.6 PII is over-retained and duplicated

**Evidence:** full message bodies in plaintext and immutable event payloads; broad initial API payloads; ordinary file permissions.  
**Impact:** privacy, deletion, backup, and model-governance risk.  
**Recommendation:** create a data inventory and retention policy; separate immutable metadata from erasable content; encrypt/permission sensitive stores; minimize agent prompts and UI payloads.

#### P1.7 Artifact contracts provide incomplete semantic assurance

**Evidence:** required-field checks and prompt-enforced source rules, not comprehensive schemas/evidence verification.  
**Impact:** structurally valid but commercially weak or fabricated output may look healthy.  
**Recommendation:** version JSON Schemas, validate types/enums/URLs/lineage, score evidence quality, and keep human approval for claims.

### P2 — reduce long-term maintenance and reproducibility risk

#### P2.1 Working-tree and runtime state are difficult to reproduce

**Recommendation:** checkpoint code separately from PII/generated data; add a clean setup fixture; document exact runtime versions and migration sequence.

#### P2.2 Schema and enum vocabularies drift

**Recommendation:** introduce ordered migrations, database constraints, one event vocabulary, and one opportunity-stage vocabulary.

#### P2.3 UI and API monoliths are growing

**Recommendation:** split the SPA by the six primary views, separate route modules, and delete or quarantine legacy surfaces.

#### P2.4 Initial payloads are too large

**Recommendation:** paginate leads/conversations/messages, load per view, return aggregates by default, and do not send private message bodies until expanded.

#### P2.5 Backups and restores are manual

**Recommendation:** add an encrypted, SQLite-consistent backup command and a periodic restore test with documented retention.

#### P2.6 Status/docs are partly hardcoded

**Recommendation:** generate health from real checks; mark old handoffs superseded; produce a compact machine-generated state appendix.

---

## 20. Strengths to preserve

The audit should not be read as a recommendation to discard the system. The following choices are unusually good and should survive simplification:

1. **Draft-only email is enforced in code, not only policy.**
2. **Manual LinkedIn sending keeps the founder in control.**
3. **A sent event, reply event, opportunity, and win are distinct states.**
4. **Prospect and opportunity lifecycles are separate.**
5. **Won requires a signed contract and booked start.**
6. **Cohorts are play-locked and cross-play conflicts fail closed.**
7. **Source evidence, identity, and deliverability are treated as gates.**
8. **Immutable, deduplicated event history is a strong audit foundation.**
9. **Official LinkedIn exports are preferable to hidden automation/scraping.**
10. **The deterministic classifier has a real benchmark.**
11. **The critical lead path has a model-call budget.**
12. **The 91-test suite catches meaningful safety regressions.**
13. **The six-view founder-centric information architecture is directionally right.**
14. **Play economics and sequence policy are explicit and versioned.**
15. **The system accurately shows zero canonical revenue rather than inventing it.**

---

## 21. Recommended remediation sequence

### Phase 0: freeze and protect the current state — one day

1. Review the dirty working tree for generated data and PII.
2. Create a safe code checkpoint without committing private exports or runtime credentials.
3. Take a SQLite-consistent encrypted backup.
4. Disable the failing weekday controller until its path is coherent, or leave it enabled only if someone is actively observing and fixing each run.
5. Record the current zero-opportunity/zero-revenue baseline.

### Phase 1: make one GNK LinkedIn loop work — two to five days

Use one venture, one play, and one or two accounts.

1. Define a canonical `channel = linkedin` draft contract.
2. Decide whether `linkedin_connection_drafts` or a channel-neutral `outreach_messages` table owns approval state.
3. Connect the critical LinkedIn writer directly to that review state.
4. Make live completion inspect that same object.
5. Remove Demand Radar from the blocking account path.
6. Add a clean-state integration test for plan -> artifact -> review -> manual-send record.
7. Run it interactively, with no scheduled automation.
8. Record the manual send, reply, and next action end to end.

### Phase 2: rebuild the founder queue — two to four days

1. Add `active_motion` or equivalent campaign participation.
2. Apply a recency/activation cutoff to imported historical conversations.
3. Move 59 trigger-based items to a non-overdue watchlist.
4. Archive/cancel stale generated actions in a reviewed, recoverable migration.
5. Make Today small: replies, promised actions, confirmed call prep, and a capped number of deliberate follow-ups.
6. Show why each action exists and what event will close it.

### Phase 3: repair metrics and data integrity — three to seven days

1. Write metric specifications before queries.
2. Add campaign/cohort/time/channel filters.
3. Fix response attribution to require a prior send in the same thread.
4. Remove undefined companies from account sets.
5. Add Morrow campaign targets or mark Morrow research-only.
6. Dry-run cross-venture play repair.
7. Resolve critical merge conflicts and add safe uniqueness constraints.
8. Add human-confirmation state for conversation outcomes.

### Phase 4: harden local security and privacy — three to seven days

1. Enforce owner-only permissions on sensitive runtime files.
2. Add local authentication/token and CSRF/Origin protection.
3. Require `application/json`; reject invalid/oversized bodies before buffering.
4. Gate external side effects with explicit confirmations and idempotency keys.
5. Paginate and minimize API responses.
6. Remove full message bodies from immutable event payloads.
7. Define retention, deletion, export, backup, and model-provider policies.

### Phase 5: simplify and selectively automate — after real conversion evidence

1. Keep only agents whose outputs cause a measurable downstream decision.
2. Collapse mirrored registry definitions into templates with venture-specific policy.
3. Remove legacy email agents from LinkedIn-first paths.
4. Add model usage/cost tracing.
5. Add controller alerts and structured failure codes.
6. Re-enable scheduling only after repeated canary success.
7. Extend the proven loop to OutageHub.
8. Decide whether Morrow is a sales motion or a research/design-partner motion, then implement one coherent path.

---

## 22. Decisions the founder must make

Technical work alone cannot resolve these questions:

1. What is the authoritative 30-day priority: GNK cash, OutageHub pilots, Morrow design partners, or a defined portfolio split?
2. Is Morrow currently a revenue pipeline or a structured customer-discovery program?
3. Is LinkedIn the only active outbound channel until email evidence/compliance infrastructure exists?
4. What exact event makes a historical relationship “active” again?
5. How many founder actions may appear in Today?
6. What counts as qualified commercial interest, and who confirms it?
7. Which proof claims are approved for each play?
8. Which private message data may be sent to model providers?
9. What retention/deletion promise should apply to imported LinkedIn messages?
10. Should the system remain single-user/local, or is multi-user/remote access planned?
11. What model/API budget is acceptable per researched account and per qualified opportunity?
12. Which venture should be used for the first fully observed real loop?

Recommended default: **GNK, one play, LinkedIn manual, one-week canary, one or two accounts, no scheduled automation, explicit human confirmation at every commercial transition.**

---

## 23. Questions for an external LLM or advisor

The following questions are designed to produce useful criticism rather than generic advice.

### Strategy

1. Given the three venture motions and zero canonical opportunity baseline, which single wedge should be prioritized for the next 30 days and why?
2. Are the offers sufficiently outcome-specific and credible at their stated prices?
3. What proof, risk reversal, and buyer language are missing from each play?
4. Should Morrow be evaluated as sales, customer discovery, or design-partner research at this stage?
5. What portfolio allocation would maximize learning and near-term cash without fragmenting founder attention?

### Sales operations

6. What is the smallest viable founder work queue and prioritization formula?
7. How should historical relationships be reactivated without turning the archive into hundreds of overdue tasks?
8. What qualification framework is appropriate for these founder-led, high-consideration sales?
9. What weekly operating cadence should connect outreach, conversations, proposals, and product learning?
10. What should be deliberately manual until the system produces repeatable conversion?

### Architecture

11. Should LinkedIn and email share a channel-neutral outreach entity or have separate state machines?
12. Which of the 56 agents should be deleted, combined, or made advisory?
13. How would you redesign the artifact contracts so the real pipeline and completion predicate cannot diverge?
14. What is the minimum source-of-truth architecture that preserves provenance without seven parallel projections?
15. Which integrations should be synchronous, queued, or event-driven?

### Data and measurement

16. What exact schema should define campaign, active motion, sent touch, attributed reply, qualification, proposal, and win?
17. Which existing metrics should be removed immediately because they are misleading?
18. How should conversation outcomes be human-confirmed efficiently?
19. What experiment design is realistic at this low sales volume?
20. How should design-partner learning be measured separately from revenue pipeline?

### Security and governance

21. What is the minimum safe localhost authentication/CSRF design for a single-founder app?
22. How should private message content be retained, encrypted, deleted, and minimized before model calls?
23. How should immutable commercial events coexist with privacy erasure requirements?
24. What audit fields are required for every model-generated recommendation?
25. What failure and cost telemetry is necessary before scheduled agent automation is re-enabled?

---

## 24. Paste-ready prompt for another LLM

Copy this entire audit, then add the following prompt after it:

> You are acting as a skeptical CRO, revenue-operations architect, product strategist, data architect, and security reviewer for a founder-led B2B sales system. The audit above is the current observed state. Do not assume that message volume, positive sentiment, or imported historical conversations equal pipeline. Treat signed contracts and booked starts as the final commercial truth. Preserve the system's draft-only, manual LinkedIn, evidence, cohort/play-lock, and lifecycle safety controls.
>
> Please provide:
>
> 1. the five highest-leverage problems, ranked by expected commercial impact and implementation effort;
> 2. any factual inconsistency or hidden assumption you detect in the audit;
> 3. a recommendation for which venture and play to prioritize for 30 days;
> 4. a simplified target architecture with no more components than necessary;
> 5. the minimum viable data model and metric definitions;
> 6. a plan to reduce the 331-action queue to a credible daily workflow;
> 7. a concrete fix for the LinkedIn-writer versus email-reviewer pipeline disconnect;
> 8. which agents to remove, combine, demote, or keep;
> 9. a security/privacy remediation plan appropriate for private LinkedIn messages and external model calls;
> 10. a one-week, 30-day, and 90-day execution plan with observable acceptance criteria;
> 11. the questions you need the founder to answer before making irreversible choices.
>
> Be specific. Cite the exact evidence in the audit behind each recommendation. Separate observed fact, inference, and strategic judgment. Challenge the existing approach rather than merely validating it.

---

## 25. Recommended acceptance criteria for “the system works”

The system should not be declared operational until all of the following are true:

1. One selected venture/play has an approved active cohort of one to five real accounts.
2. A clean pipeline run generates the current channel artifact and places it in the exact human-review state consumed by the UI.
3. No stale artifact can satisfy completion for a new run.
4. The shared Demand Radar can fail without blocking an already-approved account motion.
5. The founder can approve/edit/copy one LinkedIn message and record the manual send.
6. The sent event updates the prospect state exactly once.
7. An imported/manual reply is attributed to the correct prior send and creates one sensible next action.
8. The founder can confirm a meeting and complete a structured qualification.
9. A scoped opportunity can progress to a proposal without direct SQL repair.
10. A signed contract with booked start produces canonical revenue.
11. Every dashboard metric can state cohort, channel, time window, denominator, and confirmation status.
12. Today contains a small, deliberately bounded set of actions.
13. Cross-venture play consistency and identity checks pass on persisted data.
14. Unit tests, clean smoke fixture, live canary, controller, and database integrity are all reported separately and pass.
15. Sensitive files are owner-only; state-changing routes require an authenticated/CSRF-safe operator context.
16. Model calls have data-minimization rules plus model, cost, latency, and trace lineage.
17. The full process succeeds repeatedly before the weekday schedule is re-enabled.

---

## 26. Key files for follow-up review

### Product and strategy

- `README.md`
- `src/sales-plays.js`
- `docs/Founder_Centric_Implementation_Brief_2026-07-15.md`
- `docs/SalesV3_2.0_Full_System_Handoff_2026-07-16.md`
- `SALES-APPROACH-REPORT.md`

### UI and server

- `public/app.js`
- `public/styles.css`
- `src/dashboard-server.js`
- `src/founder-ops.js`

### Data model and lifecycle

- `src/db.js`
- `src/crm-model.js`
- `src/opportunities.js`
- `src/meetings.js`
- `src/outreach-queue.js`

### LinkedIn

- `src/linkedin-connections.js`
- `src/linkedin-chats.js`
- `src/import-linkedin-official-export.js`
- `src/linkedin-prospects.js`
- `src/generate-linkedin-messages.js`
- `src/generate-morrow-connection-drafts.js`

### Agents and live loop

- `agents/registry.json`
- `src/run-agent.js`
- `src/pipelines.js`
- `src/run-pipeline.js`
- `src/promote-sequences.js`
- `src/smoke-live.js`
- `src/smoke-live-run.js`
- `src/revenue-controller.js`
- `src/acceptance-harness.js`

### Sensitive runtime data — inspect locally; do not paste raw

- `data/crm.db`
- `data/state.json`
- `data/messages.jsonl`
- `data/artifacts/`
- `data/ontology/graph.jsonl`
- `data/inputs/live-smoke-accounts.json`
- official LinkedIn export CSV files
- `.openclaw-agents/`

---

## 27. Final assessment

The system's core idea is sound: give a founder one truthful place to manage relationships, next actions, sales plays, and paid outcomes while using AI for bounded research and drafting rather than autonomous sending.

The current implementation has crossed the complexity threshold before proving the basic commercial loop. It has 56 agents and rich historical data, but the scheduled process cannot reach the approval gate, the main action queue is overloaded by archive history, and the headline pipeline metrics do not reliably describe a current campaign.

The right next move is a simplification, not a rewrite:

- preserve the canonical CRM, lifecycle gates, manual sending, evidence controls, and tests;
- choose one venture/play/channel;
- connect one writer to one review object;
- make one tiny cohort flow end to end;
- rebuild the work queue and metrics around active motions;
- harden privacy and local side effects;
- only then add back research breadth and scheduled automation.

If that sequence is followed, SalesV3 can become a genuinely useful founder revenue operating system. If it is not, more agents and more imported data will likely amplify noise faster than they create revenue.
