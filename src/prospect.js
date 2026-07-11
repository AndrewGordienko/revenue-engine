import { spawn } from "node:child_process";
import { readState } from "./bus.js";
import { fromRoot } from "./paths.js";
import { ingestFromState } from "./ingest-leads.js";
import { readLeads } from "./leads-store.js";
import { findEmails } from "./find-emails.js";
import { recommendedProspectPlan } from "./pipeline-capacity.js";
import { STRATEGY_VERSION } from "./sales-plays.js";

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : "gnk";
}

function agentSlug(product, suffix) {
  return `${product}-${suffix}`;
}

// Upstream context agents (refreshed once at the start of a prospecting run).
const CONTEXT_AGENT_SUFFIXES = [
  "company-context",
  "icp-contact-profile",
  "boutique-growth-playbook",
  "offer-map",
  "industry-map",
  "market-coverage",
  "revenue-strategy",
  "pipeline-capacity"
];
// Lead-producing agents: re-run every round to surface more accounts and people.
const PROSPECT_AGENT_SUFFIXES = ["account-sourcing", "account-scoring", "contact-discovery", "client-dossier"];

function runAgent(slug) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["src/run-agent.js", slug], { cwd: fromRoot(), stdio: "inherit" });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${slug} exited ${code}`))));
  });
}

async function refreshContext({ force, product }) {
  let state = await readState();
  if (force || state.artifacts?.["revenue-demand-radar"]?.strategy_version !== STRATEGY_VERSION) {
    console.log("[prospect] context: revenue-demand-radar");
    await runAgent("revenue-demand-radar");
    state = await readState();
  }
  for (const suffix of CONTEXT_AGENT_SUFFIXES) {
    if (suffix === "market-coverage" && product !== "outagehub") continue;
    const slug = agentSlug(product, suffix);
    if (force || suffix === "pipeline-capacity" || state.artifacts?.[slug]?.strategy_version !== STRATEGY_VERSION) {
      console.log(`[prospect] context: ${slug}`);
      await runAgent(slug);
      state = await readState();
    }
  }
}

async function main() {
  const product = normalizeProduct(process.argv[2]);
  const plan = await recommendedProspectPlan(agentSlug(product, "pipeline-capacity"));
  const target = Number(process.argv[3] || plan.target_total_leads);
  const maxRounds = Number(process.argv[4] || plan.rounds_to_run || 6);

  console.log(
    `[prospect] ${product}: target ${target} leads, up to ${maxRounds} rounds ` +
      `(capacity plan says ${plan.target_send_ready_leads} send-ready leads)`
  );
  await refreshContext({ force: false, product });

  let round = 0;
  while (round < maxRounds) {
    round += 1;
    console.log(`\n[prospect] === round ${round} ===`);

    for (const suffix of PROSPECT_AGENT_SUFFIXES) {
      const slug = agentSlug(product, suffix);
      console.log(`[prospect] run ${slug}`);
      await runAgent(slug);
    }

    const result = await ingestFromState(product);
    const leads = await readLeads(product);
    console.log(
      `[prospect] round ${round}: +${result.added} new, ${result.updated} updated, ${leads.length}/${target} total`
    );

    if (leads.length >= target) {
      console.log(`[prospect] target reached at ${leads.length} leads`);
      break;
    }
  }

  console.log(`\n[prospect] finding emails...`);
  try {
    const emails = await findEmails({ limit: 500, product });
    console.log(`[prospect] emails: processed ${emails.processed}, updated ${emails.updated} (${emails.mode})`);
  } catch (error) {
    // Email finding is a best-effort enrichment; a provider capacity error must
    // never fail a prospecting run whose leads are already saved.
    console.error(`[prospect] email finding failed (leads are safe): ${error.message}`);
  }

  const finalLeads = await readLeads(product);
  console.log(`\n[prospect] done. ${finalLeads.length} leads in CRM.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
