# Six-account draft-only smoke runbook

Two modes validate the reduced revenue path without ever sending email.

## 1. Deterministic fixture mode (no credentials — runs in CI)

Exercises the real CRM lineage, approval queue, and pipeline reporting with
synthetic agent artifacts (Commercial Dossier + unified-writer sequence built in
code). No OpenClaw credentials, no LLM calls, no network.

```sh
npm run smoke:seed      # 6 synthetic accounts on reserved .example domains
npm run smoke:fixture   # produce dossiers + 4/5-touch sequences, queue for approval
npm run smoke:report    # per-lead + portfolio report
npm run smoke:assert    # enforce the nine hard acceptance gates (exit 1 on failure)
```

By default this uses an isolated `data/smoke.db` and never touches the real CRM.
`npm test` runs the same fixture + gates in a temp database, and CI runs the CLI
trio on every push/PR.

### Hard acceptance gates (`smoke:assert`)

1. zero send-capable API routes exist
2. zero sent events produced
3. all public claims have source evidence
4. guessed emails cannot become approval-ready
5. GNK gets exactly four touches
6. OutageHub gets exactly five touches
7. every lead has one brand and one play
8. no critical agent depends on a superseded agent
9. fixture end-state clean (6 dossiers, 0 approved / 0 drafts / 0 sent)

## 2. Manual live-agent mode (operator-selected real accounts)

Run the real agents against six operator-chosen accounts (3 GNK, 3 OutageHub).
This needs OpenClaw credentials. The run is **scoped to a manifest** so it only
ever touches those six accounts, and **it stops at the approval queue** — Gmail
draft creation is a separate manual action per message after you read it, and
there is no send path at all.

Run it from **Run** in the dashboard. That action and the OpenClaw Revenue
Controller invoke the same resumable canonical orchestrator. It validates the
manifest and plays, checks credentials, initializes the isolated cohorts,
freshens strategy, runs both full brand pipelines, ingests/promotes the results,
and writes the final loop report.

The debugging fallback is a single command:

```sh
npm run smoke:live
```

To install the weekday OpenClaw controller (it only researches, verifies,
prepares, and queues; approval and sending remain human-only):

```sh
npm run controller:install
```

Pass `-- --disabled` only when you intentionally want to install it without the
weekday schedule. The controller is intentionally draft-only. It never approves a cohort or
message, creates no send route, and stops at `pending_approval`. A restart
resumes safely and skips completed stages; conflicts are written to the Run
dashboard for human resolution.

Presence of `data/inputs/live-smoke-accounts.json` (or `LIVE_SMOKE=1`) turns on
live-smoke mode. The `--cohort` scope limits each agent's lead context to the
manifest accounts and injects an allow-list constraint; the approval queue is
hard-scoped because the live cohort group contains only manifest leads.

Then inspect, in the dashboard:

- **Run** view — preflight/credential readiness, cohort stage, active agent,
  elapsed time, completed accounts, conflicts, retry/resume, and final report.
- **Approvals** view — the reviewed sequences sitting in `pending_approval`.
- For each lead, read the Commercial Dossier, the full 4/5-touch sequence, and the
  reviewer's readiness + score before approving anything.

Nothing sends. After you approve a message you may optionally create a **Gmail
draft** for it (a separate manual button), then send it yourself from Gmail. Do
not assemble the full 30-day cohort until the six real accounts have been read and
prompt-quality problems fixed.
