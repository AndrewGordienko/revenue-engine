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

```sh
# 1. Author the manifest: exactly 3 GNK + 3 OutageHub, one per active play,
#    each with a company domain and proposed buyer. Start from the template:
cp data/inputs/live-smoke-accounts.example.json data/inputs/live-smoke-accounts.json
$EDITOR data/inputs/live-smoke-accounts.json

# 2. Validate + seed the isolated cohort groups (gnk-live-smoke / outagehub-live-smoke).
#    Fails if the manifest is off or any non-manifest lead would leak in.
npm run smoke:live:init -- --manifest data/inputs/live-smoke-accounts.json

# 3. Refresh strategy once (freshness-aware; skips fresh artifacts)
npm run strategy:refresh -- gnk
npm run strategy:refresh -- outagehub

# 4. Build each cohort, SCOPED to the manifest group
npm run pipeline -- cohort:build gnk --cohort gnk-live-smoke
npm run pipeline -- cohort:build outagehub --cohort outagehub-live-smoke

# 5. Approve each cohort in the dashboard Approvals view, then prepare leads
#    (Commercial Dossier -> unified writer -> reviewer). In live-smoke mode
#    lead:prepare FAILS CLOSED unless a --cohort is given.
npm run pipeline -- lead:prepare gnk --cohort gnk-live-smoke
npm run pipeline -- lead:prepare outagehub --cohort outagehub-live-smoke
```

Presence of `data/inputs/live-smoke-accounts.json` (or `LIVE_SMOKE=1`) turns on
live-smoke mode. The `--cohort` scope limits each agent's lead context to the
manifest accounts and injects an allow-list constraint; the approval queue is
hard-scoped because the live cohort group contains only manifest leads.

Then inspect, in the dashboard:

- **Agents** view — every lead-tier agent current, schema-valid, unblocked.
- **Approvals** view — the reviewed sequences sitting in `pending_approval`.
- For each lead, read the Commercial Dossier, the full 4/5-touch sequence, and the
  reviewer's readiness + score before approving anything.

Nothing sends. After you approve a message you may optionally create a **Gmail
draft** for it (a separate manual button), then send it yourself from Gmail. Do
not assemble the full 30-day cohort until the six real accounts have been read and
prompt-quality problems fixed.
