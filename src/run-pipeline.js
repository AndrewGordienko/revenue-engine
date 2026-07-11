// CLI runner for the named pipelines. Usage:
//   node src/run-pipeline.js <pipeline> <product> [--force] [--dry-run]
// e.g. node src/run-pipeline.js strategy:refresh gnk
//      node src/run-pipeline.js cohort:build outagehub
//      node src/run-pipeline.js lead:prepare gnk --dry-run
import { spawn } from "node:child_process";
import { readRegistry, readState } from "./bus.js";
import { fromRoot } from "./paths.js";
import { PIPELINES, planPipeline, normalizeProduct } from "./pipelines.js";

function runAgent(slug) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["src/run-agent.js", slug], { cwd: fromRoot(), stdio: "inherit" });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${slug} exited with code ${code}`))));
  });
}

async function main() {
  const pipelineName = process.argv[2];
  const product = normalizeProduct(process.argv[3] || "gnk");
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  if (!pipelineName || !PIPELINES[pipelineName]) {
    console.error(`Unknown pipeline: ${pipelineName || "(none)"}`);
    console.error(`Available: ${Object.keys(PIPELINES).join(", ")}`);
    process.exit(1);
  }

  const registry = await readRegistry();
  const state = await readState();
  const plan = planPipeline(registry, state, pipelineName, product, { force });

  console.log(`\n[pipeline] ${pipelineName} · ${product}${force ? " · force" : ""}`);
  for (const step of plan) {
    console.log(`  ${step.run ? "run " : "skip"} ${step.slug} (${step.tier}${step.criticalPath ? "/critical" : ""})${step.skipReason ? ` — ${step.skipReason}` : ""}`);
  }
  const toRun = plan.filter((step) => step.run);
  console.log(`[pipeline] ${toRun.length}/${plan.length} agents will run${dryRun ? " (dry run — nothing executed)" : ""}\n`);
  if (dryRun) return;

  for (const step of toRun) {
    console.log(`\n[pipeline] → ${step.slug}`);
    await runAgent(step.slug);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
