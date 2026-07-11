# Revenue Engine

This repo is a shared revenue-engine workspace for two deliberately different sales motions: GNK high-trust engineering sprints and OutageHub paid operational pilots.

## What is here

- `agents/registry.json` defines the agents and their output contracts.
- `data/messages.jsonl` is the append-only project bus for agent events and handoffs.
- `data/state.json` is the current shared state that the dashboard reads.
- `openclaw-workspaces/` contains repo-local OpenClaw workspaces for each agent.
- `src/setup-openclaw.js` registers agents with OpenClaw.
- `src/run-agent.js` runs an agent and publishes its output into the bus/state.
- `src/pipeline-capacity.js` calculates brand-specific account, meeting, proposal, and win targets.
- `src/reply-classifier.js` turns replies and objections into deterministic pipeline actions.
- `src/pipeline-report.js` reports outcomes by product, cohort, and sales play.
- `src/revenue-events.js` is the canonical sent/reply/meeting/outcome event path.
- `src/outreach-queue.js` enforces cohort approval, message approval, provider drafts, and stop-on-reply.
- `src/google-workspace.js` integrates Gmail drafts/thread sync and Google Calendar free/busy/events.
- `src/dashboard-server.js` serves the dashboard and JSON APIs.
- `NOTES.md` captures project operating notes, including the exact-target ICP doctrine for agent output quality.

## Commands

```sh
npm run setup
npm run research:radar
npm run research:gnk
npm run research:icp
npm run research:growth
npm run research:offer
npm run research:capacity
npm run research:accounts
npm run research:score
npm run research:contacts
npm run research:persona
npm run research:dossier
npm run research:angles
npm run research:sequence
npm run research:emails
npm run research:drafts
npm run find:emails
npm run plan:capacity
npm run guess:emails
npm run apply:email-patterns
npm run pipeline:gnk
npm run validate:agents
npm run openai:status
npm run dashboard
npm run classify:reply -- "Yes, let's discuss this next week"
npm run report:pipeline
npm test
```

The dashboard defaults to `http://127.0.0.1:8792/`.

## Active commercial motions

GNK targets one signed $40k-$60k engagement in 30 days through warm introductions, observable triggers, and partners. Its four-touch triggered-outbound sequence supports trust; it is not a volume quota. The only external sprint offers are Production AI Workflow, Backend Risk and Stabilization, and Data and Operations Automation. A paid one-week shaping engagement is the fallback.

OutageHub targets $40k of booked first-month revenue through three to four paid pilots. Implementation is priced separately, every pilot proves one decision workflow for 30 days, and the close creates an annual conversion decision. Its five-touch sequence sells operational proof and implementation, not a generic map or low-price API.

The shared Revenue Demand Radar watches hiring, leadership, funding, launches, incidents, migrations, deprecations, roadmaps, regulation, complaints, and partnerships, then assigns each signal to exactly one brand and sales play.

## Revenue-loop controls

The immutable CRM event log is the source of truth. Lead memory is a projection for agents and operators:

```text
provider event → CRM activity_event → reply classification → stage transition
→ future-touch stop → lead-memory projection → pipeline report → next action
```

New cohorts begin in `draft`. A founder must approve one exact sales play and the cohort rules. Reviewed messages then enter `pending_approval`; each message requires separate approval before the system can create a Gmail draft. Automatic sending is deliberately disabled. After the human sends from Gmail, mailbox sync records the canonical sent event and immediately stops future touches when a reply, bounce, or unsubscribe arrives.

The Approvals dashboard shows cohort rules, message approvals, provider drafts, and Google integration status. The Overview shows actual versus target for verified contacts, sends, replies, meetings, qualified opportunities, proposals, wins, revenue, MRR, and implementation margin.

### Sending is not implemented (draft-only by construction)

Outbound sending is **intentionally not part of this build** — not merely disabled by a flag. There is deliberately no configuration switch that turns it on, so accidental sending is impossible through configuration alone:

- `GmailProvider.sendDraft()` and `sendApprovedDraft()` throw unconditionally (`src/outbound-guard.js`), before any network call.
- There is no `/send` API action; the outreach route accepts only `approve | reject | draft`.
- Cohorts are forced to `auto_send: false`, and creating a Gmail draft never marks a lead contacted (a `sent` event is only recorded from a real Gmail sent message observed via sync).

The engine researches, verifies contacts, writes and reviews sequences, queues for approval, and can create Gmail **drafts** — you send from Gmail yourself. Sending will be reintroduced only in a dedicated, explicitly reviewed change.

## Agent operating model

Agents are tiered so the live per-lead path stays small. Each registry agent declares an `executionTier` (`control | cohort | lead | deterministic`), `criticalPath`, `cadence`, and freshness/cost/runtime budgets, enforced by `npm run validate:agents`.

```text
strategy:refresh (control, weekly/monthly)  →  cohort:build (per approved cohort)  →  lead:prepare (3 lead agents)
```

Named pipelines replace the old run-everything sequence:

```sh
npm run strategy:refresh -- gnk     # control tier, skips fresh artifacts
npm run cohort:build:gnk            # cohort tier
npm run lead:prepare -- gnk         # Commercial Dossier → unified writer → reviewer (~3 model calls)
node src/run-pipeline.js lead:prepare gnk --dry-run
```

Sequence shape is deterministic (`src/sequence-skeleton.js`) from `SEQUENCE_POLICIES`; `client-dossier` is the Commercial Dossier (absorbs the outreach angle) and `email-drafter` is the unified sequence writer. The **Agents** dashboard view (`/api/agent-health`) shows each agent's tier, freshness, schema status, downstream consumers, unconsumed fields, and current blocker.

### Acceptance harness

`npm run acceptance` runs the agent scorecard against the 40-account benchmark (`npm run benchmark:build`): the deterministic classifier benchmark, `>=2/3` stability, field-consumption report, and the engineering gates (`<=6` critical lead calls, zero cross-brand leakage, strategy off the critical path, no guessed-email send-ready, deterministic stability, good-fit accuracy).

### Draft-only smoke

`npm run smoke:seed && npm run smoke:fixture && npm run smoke:assert` runs a six-account (3 GNK + 3 OutageHub) draft-only fixture smoke through the real lineage, approval queue, and reporting with no credentials — enforcing nine hard gates (no send routes, no sent events, 4/5 touches per brand, one brand+play per lead, guessed emails unapprovable, clean end-state). The credentialed six-account loop is operated from the dashboard **Run** action or the OpenClaw Revenue Controller; `npm run smoke:live` remains the single-command debugging fallback. See [`docs/smoke-runbook.md`](docs/smoke-runbook.md).

### Google Workspace

Copy `.env.example` into your secret environment and provide either `GOOGLE_ACCESS_TOKEN` or the client ID, client secret, and refresh token. The OAuth grant needs Gmail compose/read access and Calendar free-busy/event access. Credentials are never stored in this repository.

For a disposable visual fixture:

```sh
CRM_DB_PATH=/tmp/salesv3-fixture.db \
LEAD_MEMORY_DIR=/tmp/salesv3-fixture-memory \
ALLOW_FIXTURE_SEED=1 npm run fixture:dashboard

CRM_DB_PATH=/tmp/salesv3-fixture.db \
LEAD_MEMORY_DIR=/tmp/salesv3-fixture-memory \
npm run dashboard
```

## OpenClaw Skills

Two OpenClaw skills are wired into the agents (installed into the shared managed skills directory by `npm run setup`):

- **`multi-search-engine`** — the web-research agents (company context, account sourcing, contact discovery, client dossier, email finder, etc.) are instructed to query several engines and cross-check results instead of trusting one provider. This block is injected centrally in `src/run-agent.js`, so no per-agent instruction files change.
- **`ontology`** — a shared, typed knowledge graph of `Company`, `Person`, `Deal`, `Investor`, `Introduction`, and `Conversation` entities (with `works_at` / `buyer_at` / `has_deal` / `deal_contact` / `invested_in` / `introduced_by` / `had_conversation` relations). Agents query the graph instead of parsing Markdown, and the runner records sourcing/contact output into it automatically.

The authoritative graph lives at `data/ontology/graph.jsonl` (schema in `data/ontology/schema.yaml`). It uses the exact op format the skill reads, so the skill's own CLI (run from the project root) sees the same graph.

```sh
npm run ontology:backfill                                  # rebuild the graph from the CRM leads
npm run ontology                                           # graph stats
npm run ontology -- query --type Company --where '{"product":"gnk"}'
npm run ontology -- related --id <company_id> --rel has_deal
npm run ontology:validate                                  # validate via the ontology skill
```

## Agent Communication

Agents communicate through the project JSON bus, not by reading each other's Markdown files. Each run receives:

- declared upstream dependency status from `agents/registry.json`
- recent relevant events from `data/messages.jsonl`
- upstream artifacts from `data/state.json`
- declared input files, when an agent needs local account data

When an agent finishes, `src/run-agent.js` publishes its artifact to `data/state.json`, appends an artifact event to `data/messages.jsonl`, and sends handoff events to downstream agents that declare it in `dependsOn`.

## Lead Persona Profile Agent

After contact discovery, the `gnk-lead-persona-profile` and `outagehub-lead-persona-profile` agents
research each **named person** and capture their individual culture, mindset, communication style, and
perspective — the "vibe" of the lead. Targeting the CEO of a national enterprise is a different culture
and tempo than a manager at a startup, so this read tells the outreach agents how to sound to that
specific person. The read is written back in two places:

- **Lead records** — `persona_vibe`, `culture_context`, `mindset`, `communication_style`, `perspective`,
  `decision_style`, `tone_guidance` (visible in the dashboard lead detail and CSV export).
- **Knowledge tree** — the person's `Person` node in `data/ontology/graph.jsonl` gets the vibe properties,
  plus a per-person `Insight` node (`kind: lead-persona`) so the read shows up in the 3D graph.

The `outreach-angle` stage depends on this agent, so the vibe influences the generated messaging.

```sh
npm run research:persona        # GNK
npm run research:ohub:persona   # OutageHub
```

### API-key runtime (not codex)

These persona agents are flagged `"execution": "api-key"` in `agents/registry.json`. Unlike the other
agents, which run through the OpenClaw Gateway (the codex runtime), they run the **embedded local agent**
(`openclaw agent --local`), which talks to the OpenAI API directly. This skips the codex remote "compact"
step that has been failing on the gateway. The runner reads the OpenAI key from `OPENAI_API_KEY` or, if
unset, from `~/.codex/auth.json`, and injects it into the child process — no manual shell export needed.

## OpenAI API

The registered agents use `openai/gpt-5.4-mini` by default. Verify the active OpenAI route with:

```sh
npm run openai:status
```

To replace or add an OpenAI API key for OpenClaw, run:

```sh
openclaw models auth paste-api-key --provider openai --profile-id openai:manual
```

Runtime state and credentials live under `.openclaw-agents/`, which is intentionally ignored by git.
