// Assigns the PR3 agent operating-model metadata (executionTier, criticalPath,
// cadence, freshness/cost/runtime budgets, benchmarkRequired) to every registry
// agent. Idempotent: re-running overwrites the same fields. The tier map is the
// single source of truth for which agents sit on the live per-lead revenue path.
import fs from "node:fs";
import path from "node:path";

const registryPath = path.join(process.cwd(), "agents", "registry.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

// Per-tier defaults. Overrides applied per suffix below.
const TIER_DEFAULTS = {
  control:       { cadence: "monthly",    staleAfterHours: 720, maxRuntimeSeconds: 900, maxCostUsd: 2.0, criticalPath: false, benchmarkRequired: false },
  cohort:        { cadence: "per_cohort",  staleAfterHours: 336, maxRuntimeSeconds: 600, maxCostUsd: 1.0, criticalPath: true,  benchmarkRequired: true  },
  lead:          { cadence: "per_lead",    staleAfterHours: 72,  maxRuntimeSeconds: 300, maxCostUsd: 0.5, criticalPath: true,  benchmarkRequired: true  },
  deterministic: { cadence: "per_lead",    staleAfterHours: 0,   maxRuntimeSeconds: 60,  maxCostUsd: 0.05, criticalPath: false, benchmarkRequired: false },
};

// suffix (slug with brand prefix stripped) -> { tier, ...overrides }
const BY_SUFFIX = {
  // ---- strategy control plane: run weekly/monthly or on strategy-version change
  "company-context":          { tier: "control" },
  "icp-contact-profile":      { tier: "control" },
  "boutique-growth-playbook": { tier: "control" },
  "offer-map":                { tier: "control" },
  "industry-map":             { tier: "control" },
  "market-coverage":          { tier: "control" },
  "revenue-strategy":         { tier: "control" },
  "pipeline-capacity":        { tier: "control", cadence: "weekly", staleAfterHours: 168, maxCostUsd: 0.5, maxRuntimeSeconds: 120 },
  // ---- cohort-building plane: run per approved cohort
  "account-sourcing":         { tier: "cohort" },
  "account-scoring":          { tier: "cohort" },
  "contact-discovery":        { tier: "cohort" },
  "email-finder":             { tier: "cohort" },
  // ---- lead-preparation plane: run only for shortlisted accounts
  "client-dossier":           { tier: "lead" },   // Commercial Dossier (merges outreach-angle)
  "email-drafter":            { tier: "lead" },   // unified sequence writer
  "email-sequence-reviewer":  { tier: "lead" },   // genuine adversarial control — stays separate
  // ---- superseded / off the live path
  "outreach-angle":           { tier: "lead", criticalPath: false, benchmarkRequired: false }, // merged into Commercial Dossier
  "email-sequence-drafter":   { tier: "lead", criticalPath: false, benchmarkRequired: false }, // merged into unified writer
  "sequence-strategy":        { tier: "deterministic" },                                        // skeleton generated from SEQUENCE_POLICIES
  "lead-persona-profile":     { tier: "lead", criticalPath: false, benchmarkRequired: false, cadence: "event_driven", staleAfterHours: 720 }, // optional; top-10 / warm / proposal-stage only
};

function suffixOf(slug) {
  if (slug === "revenue-demand-radar") return "revenue-demand-radar";
  return slug.replace(/^gnk-/, "").replace(/^outagehub-/, "");
}

let applied = 0;
for (const agent of registry.agents) {
  const suffix = suffixOf(agent.slug);
  let profile = BY_SUFFIX[suffix];
  // The shared Demand Radar is a control-plane research agent run weekly.
  if (agent.slug === "revenue-demand-radar") profile = { tier: "control", cadence: "weekly", staleAfterHours: 168 };
  if (!profile) throw new Error(`no tier profile for agent ${agent.slug} (suffix ${suffix})`);
  const merged = { ...TIER_DEFAULTS[profile.tier], ...profile };
  agent.executionTier = profile.tier;
  agent.criticalPath = merged.criticalPath;
  agent.cadence = merged.cadence;
  agent.staleAfterHours = merged.staleAfterHours;
  agent.maxRuntimeSeconds = merged.maxRuntimeSeconds;
  agent.maxCostUsd = merged.maxCostUsd;
  agent.benchmarkRequired = merged.benchmarkRequired;
  applied++;
}

fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

const summary = {};
for (const agent of registry.agents) {
  const key = `${agent.executionTier}${agent.criticalPath ? "/critical" : ""}`;
  summary[key] = (summary[key] || 0) + 1;
}
console.log(`applied tiers to ${applied} agents`);
console.log(JSON.stringify(summary, null, 2));
console.log("critical-path lead agents:", registry.agents.filter((a) => a.criticalPath && a.executionTier === "lead").map((a) => a.slug).join(", "));
