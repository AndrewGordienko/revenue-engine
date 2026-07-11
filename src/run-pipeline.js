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
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
