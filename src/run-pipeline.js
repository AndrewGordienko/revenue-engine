// CLI runner for the named pipelines. Usage:
//   node src/run-pipeline.js <pipeline> <product> [--force] [--dry-run]
// e.g. node src/run-pipeline.js strategy:refresh gnk
//      node src/run-pipeline.js cohort:build outagehub
//      node src/run-pipeline.js lead:prepare gnk --dry-run
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readRegistry, readState } from "./bus.js";
import { db as dbForLedger } from "./db.js";
import { fromRoot } from "./paths.js";
import { PIPELINES, planPipeline, normalizeProduct } from "./pipelines.js";
import { isLiveSmokeMode, requireCohortForLiveSmoke, loadManifest } from "./smoke-live.js";
import { ingestFromState } from "./ingest-leads.js";
import { promoteSequencesFromState } from "./promote-sequences.js";
import { assertPlayConsistency } from "./play-consistency.js";

// Which named pipelines close which side of the loop. cohort:build sources
// accounts -> ingest them into the CRM; lead:prepare writes reviewed sequences
// -> promote them into the pending-approval queue. This is what removes the
// manual "copy JSON / repair the db" step between agents and the CRM.
function pipelineTouches(pipelineName) {
  const def = PIPELINES[pipelineName] || {};
  const names = def.chain || [pipelineName];
  return {
    ingest: names.includes("cohort:build"),
    promote: names.includes("lead:prepare"),
  };
}

// Post-pipeline adapters. Run in-process after the agent subprocesses finish and
// have published their artifacts to the shared state bus.
async function runPostPipeline(pipelineName, product) {
  const touches = pipelineTouches(pipelineName);
  if (touches.ingest) {
    const result = await ingestFromState(product);
    console.log(`[ingest] +${result.added} new, ${result.updated} updated, ${result.total} total leads`);
  }
  if (touches.promote) {
    const summary = await promoteSequencesFromState(product);
    if (!summary) console.log("[promote] no email-sequence-reviewer artifact in state — nothing to queue");
    else console.log(`[promote] ${summary.accounts_queued} accounts queued, ${summary.messages_queued} messages pending approval, ${summary.skipped} skipped (${JSON.stringify(summary.skipped_reasons)})`);
  }
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function completedSince(state, slug, timestamp) {
  if (!timestamp) return false;
  const agent = state.agents?.[slug] || Object.values(state.agents || {}).find((entry) => entry.slug === slug);
  const finished = Date.parse(agent?.lastRunAt || "");
  // A state entry alone is not enough: require the durable artifact too, so a
  // killed agent is retried rather than being silently skipped on resume.
  return Number.isFinite(finished) && finished >= Date.parse(timestamp) && Boolean(state.artifacts?.[slug]);
}

function runAgent(slug, cohort) {
  return new Promise((resolve, reject) => {
    // Pass the live-smoke cohort scope down so run-agent limits the agent's lead
    // context to the manifest accounts.
    const env = { ...process.env, ...(cohort ? { SMOKE_LIVE_COHORT: cohort } : {}) };
    const child = spawn("node", ["src/run-agent.js", slug], { cwd: fromRoot(), stdio: "inherit", env });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${slug} exited with code ${code}`))));
  });
}

async function main() {
  const pipelineName = process.argv[2];
  const product = normalizeProduct(process.argv[3] || "gnk");
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");
  const noIngest = process.argv.includes("--no-ingest");
  const cohort = flagValue("--cohort");
  const resumeSince = flagValue("--resume-since");
  const liveMode = process.argv.includes("--live") || isLiveSmokeMode();

  // Fail closed: in live-smoke mode a cohort-scoped pipeline must be given --cohort
  // so it cannot run over the whole shared CRM.
  requireCohortForLiveSmoke(pipelineName, cohort, liveMode);

  if (!pipelineName || !PIPELINES[pipelineName]) {
    console.error(`Unknown pipeline: ${pipelineName || "(none)"}`);
    console.error(`Available: ${Object.keys(PIPELINES).join(", ")}`);
    process.exit(1);
  }

  // Fail closed on manifest<->CRM play conflicts BEFORE any agent runs. Only the
  // account-touching pipelines (cohort:build / lead:prepare / full) validate plays;
  // strategy:refresh is brand-level and account-agnostic.
  const touchesAccounts = pipelineTouches(pipelineName);
  if (liveMode && (touchesAccounts.ingest || touchesAccounts.promote)) {
    const consistency = assertPlayConsistency(dbForLedger(), loadManifest());
    console.log(`[play-gate] ${consistency.accounts.length} accounts reconciled (` +
      `${consistency.accounts.filter((a) => a.status === "ok").length} ok, ` +
      `${consistency.accounts.filter((a) => a.status === "resolved").length} approved-change, ` +
      `${consistency.accounts.filter((a) => a.status === "new").length} new)`);
  }

  const registry = await readRegistry();
  const state = await readState();
  const plan = planPipeline(registry, state, pipelineName, product, { force }).map((step) => {
    if (step.run && !force && completedSince(state, step.slug, resumeSince)) {
      return { ...step, run: false, skipReason: "completed during interrupted live-smoke run" };
    }
    return step;
  });

  console.log(`\n[pipeline] ${pipelineName} · ${product}${force ? " · force" : ""}${cohort ? ` · cohort ${cohort}` : ""}${liveMode ? " · live-smoke" : ""}`);
  for (const step of plan) {
    console.log(`  ${step.run ? "run " : "skip"} ${step.slug} (${step.tier}${step.criticalPath ? "/critical" : ""})${step.skipReason ? ` — ${step.skipReason}` : ""}`);
  }
  const toRun = plan.filter((step) => step.run);
  console.log(`[pipeline] ${toRun.length}/${plan.length} agents will run${dryRun ? " (dry run — nothing executed)" : ""}\n`);
  if (dryRun) return;

  // Per-agent wall-clock is recorded so cost/runtime can be attributed per account
  // (runtime_ms / accounts in the scoped cohort). Token cost is not yet surfaced by
  // the model gateway; runtime is the honest proxy until it is.
  const timings = [];
  for (const step of toRun) {
    console.log(`\n[pipeline] → ${step.slug}${cohort ? ` (scope ${cohort})` : ""}`);
    const startedAt = Date.now();
    await runAgent(step.slug, cohort);
    timings.push({ slug: step.slug, tier: step.tier, ms: Date.now() - startedAt });
  }
  writeRuntimeLedger({ pipeline: pipelineName, product, cohort, timings });

  // Close the loop: sourced accounts -> CRM leads, reviewed sequences -> approval
  // queue. --no-ingest leaves the artifacts published but does not touch the CRM.
  if (!noIngest) {
    const touches = pipelineTouches(pipelineName);
    if (touches.ingest || touches.promote) {
      console.log(`\n[pipeline] closing the loop (ingest=${touches.ingest}, promote=${touches.promote})`);
      await runPostPipeline(pipelineName, product);
    }
  }
}

// Attribute runtime per account: total agent wall-clock over the number of leads
// in the scoped cohort. Written to data/artifacts so the operator can see the real
// cost shape of a run instead of guessing.
function writeRuntimeLedger({ pipeline, product, cohort, timings }) {
  if (!timings.length) return;
  const totalMs = timings.reduce((n, t) => n + t.ms, 0);
  let accounts = 0;
  try {
    const rows = cohort
      ? dbForLedger().prepare("SELECT COUNT(DISTINCT company_domain) n FROM leads WHERE cohort_id LIKE ?").get(`${cohort}%`)
      : dbForLedger().prepare("SELECT COUNT(DISTINCT company_domain) n FROM leads WHERE product=?").get(product);
    accounts = rows?.n || 0;
  } catch { /* ledger is best-effort */ }
  const ledger = {
    pipeline, product, cohort: cohort || null, recorded_at: new Date().toISOString(),
    total_runtime_ms: totalMs, agents: timings,
    accounts, runtime_ms_per_account: accounts ? Math.round(totalMs / accounts) : null,
    note: "token/model cost pending gateway usage reporting; runtime_ms is the current proxy.",
  };
  const dir = fromRoot("data", "artifacts");
  const file = `${dir}/pipeline-runtime-${product}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  try {
    writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
    console.log(`[runtime] ${Math.round(totalMs / 1000)}s across ${timings.length} agents · ${accounts} accounts · ${ledger.runtime_ms_per_account ?? "?"}ms/account → ${file.split("/").slice(-1)[0]}`);
  } catch (error) {
    console.warn(`[runtime] could not write ledger: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
