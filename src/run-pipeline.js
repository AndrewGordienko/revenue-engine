// CLI runner for the named pipelines. Usage:
//   node src/run-pipeline.js <pipeline> <product> [--force] [--dry-run]
// e.g. node src/run-pipeline.js strategy:refresh gnk
//      node src/run-pipeline.js cohort:build outagehub
//      node src/run-pipeline.js lead:prepare gnk --dry-run
import { spawn } from "node:child_process";
import { readRegistry, readState } from "./bus.js";
import { fromRoot } from "./paths.js";
import { PIPELINES, planPipeline, normalizeProduct } from "./pipelines.js";
import { isLiveSmokeMode, requireCohortForLiveSmoke } from "./smoke-live.js";
import { ingestFromState } from "./ingest-leads.js";
import { promoteSequencesFromState } from "./promote-sequences.js";

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
  const liveMode = process.argv.includes("--live") || isLiveSmokeMode();

  // Fail closed: in live-smoke mode a cohort-scoped pipeline must be given --cohort
  // so it cannot run over the whole shared CRM.
  requireCohortForLiveSmoke(pipelineName, cohort, liveMode);

  if (!pipelineName || !PIPELINES[pipelineName]) {
    console.error(`Unknown pipeline: ${pipelineName || "(none)"}`);
    console.error(`Available: ${Object.keys(PIPELINES).join(", ")}`);
    process.exit(1);
  }

  const registry = await readRegistry();
  const state = await readState();
  const plan = planPipeline(registry, state, pipelineName, product, { force });

  console.log(`\n[pipeline] ${pipelineName} · ${product}${force ? " · force" : ""}${cohort ? ` · cohort ${cohort}` : ""}${liveMode ? " · live-smoke" : ""}`);
  for (const step of plan) {
    console.log(`  ${step.run ? "run " : "skip"} ${step.slug} (${step.tier}${step.criticalPath ? "/critical" : ""})${step.skipReason ? ` — ${step.skipReason}` : ""}`);
  }
  const toRun = plan.filter((step) => step.run);
  console.log(`[pipeline] ${toRun.length}/${plan.length} agents will run${dryRun ? " (dry run — nothing executed)" : ""}\n`);
  if (dryRun) return;

  for (const step of toRun) {
    console.log(`\n[pipeline] → ${step.slug}${cohort ? ` (scope ${cohort})` : ""}`);
    await runAgent(step.slug, cohort);
  }

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

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
