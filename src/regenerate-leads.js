import { spawn } from "node:child_process";
import { ingestFromState } from "./ingest-leads.js";
import { leadStats } from "./leads-store.js";
import { fromRoot } from "./paths.js";

// Re-run the lead-producing research chain for one or more products, then
// re-ingest the resulting leads. This is the "new cycle": sourcing now biases
// toward reachable-sized companies and contact discovery hard-gates C-suite
// fallback, so the regenerated leads should be real operational owners.
//
//   node src/regenerate-leads.js outagehub
//   node src/regenerate-leads.js outagehub gnk
//
// Upstream strategy artifacts (company-context, icp, offer, revenue, capacity)
// are reused from state; only the sourcing -> outreach chain is regenerated.

// Full chain, or a trimmed chain via REGEN_STEPS. The first three agents are the
// ones that actually produce people/leads; client-dossier and outreach-angle only
// enrich existing leads, so a fast lead run can skip them and enrich later.
const FULL_CHAIN = [
  "account-sourcing",
  "account-scoring",
  "contact-discovery",
  "lead-persona-profile",
  "client-dossier",
  "outreach-angle"
];
const CHAIN = process.env.REGEN_STEPS
  ? process.env.REGEN_STEPS.split(",").map((s) => s.trim()).filter(Boolean)
  : FULL_CHAIN;

function normalizeProduct(value) {
  return value === "ohub" || value === "outagehub" ? "outagehub" : value === "morrow" ? "morrow" : "gnk";
}

function runAgent(slug) {
  return new Promise((resolve, reject) => {
    console.log(`\n[regen] running ${slug}`);
    const child = spawn("node", ["src/run-agent.js", slug], {
      cwd: fromRoot(),
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${slug} exited with code ${code}`));
    });
  });
}

async function regenerateProduct(product) {
  console.log(`\n===== regenerating ${product} =====`);
  for (const step of CHAIN) {
    await runAgent(`${product}-${step}`);
    // Trickle leads into the CRM as each agent publishes, so outreach can start
    // before the whole chain finishes. Ingest is an idempotent upsert, so this
    // is safe to call repeatedly and never clobbers stage/notes on existing leads.
    try {
      const step_result = await ingestFromState(product);
      console.log(
        `[regen] ${product} after ${step}: +${step_result.added} new, ${step_result.updated} updated, ${step_result.total} total`
      );
    } catch (error) {
      console.error(`[regen] ingest after ${step} failed: ${error.message}`);
    }
  }
  const result = await ingestFromState(product);
  const stats = await leadStats(null, product);
  console.log(
    `\n[regen] ${product} ingested +${result.added} new, ${result.updated} updated, ${result.total} total`
  );
  console.log(`[regen] ${product} stats: ${JSON.stringify(stats)}`);
  return { product, ...result, stats };
}

async function main() {
  const products = (process.argv.slice(2).length ? process.argv.slice(2) : ["outagehub"]).map(
    normalizeProduct
  );
  const unique = [...new Set(products)];
  const results = [];
  for (const product of unique) {
    results.push(await regenerateProduct(product));
  }
  console.log(`\n[regen] done: ${JSON.stringify(results.map((r) => ({ product: r.product, total: r.total })))}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
