// Named pipelines replace the old "run every non-optional agent for a brand"
// behavior. Each pipeline runs exactly one execution tier, so strategy research
// stops being regenerated for every prospect and the live per-lead path shrinks
// to the lead-tier critical agents.
import { STRATEGY_VERSION } from "./sales-plays.js";

export const PIPELINES = {
  "strategy:refresh": {
    tiers: ["control"],
    respectFreshness: true,
    description: "Refresh the versioned Brand Commercial Policy (Demand Radar, context, ICP, offers, industry, revenue). Skips agents whose artifact is current and not stale.",
  },
  "cohort:build": {
    tiers: ["cohort"],
    respectFreshness: false,
    description: "Build one approved cohort: demand/trigger sourcing, account qualification, buyer discovery, contact/evidence verification.",
  },
  "lead:prepare": {
    tiers: ["lead"],
    criticalOnly: true,
    respectFreshness: false,
    description: "Prepare shortlisted leads: Commercial Dossier, sequence writer, sequence reviewer. Roughly three model calls per serious lead.",
  },
  // Convenience chain: same reduced tiers, in order, freshness-aware.
  "full": {
    chain: ["strategy:refresh", "cohort:build", "lead:prepare"],
    description: "Run strategy:refresh → cohort:build → lead:prepare in order (freshness-aware).",
  },
};

export function agentBrand(agent) {
  if ((agent.brands || []).length > 1) return "shared";
  return agent.slug.startsWith("outagehub-") ? "outagehub" : "gnk";
}

export function normalizeProduct(product) {
  return product === "ohub" || product === "outagehub" ? "outagehub" : "gnk";
}

export function selectPipelineAgents(registry, pipelineName, product) {
  const def = PIPELINES[pipelineName];
  if (!def || def.chain) throw new Error(`not a single-tier pipeline: ${pipelineName}`);
  const p = normalizeProduct(product);
  return registry.agents
    .filter((agent) => def.tiers.includes(agent.executionTier))
    .filter((agent) => { const brand = agentBrand(agent); return brand === "shared" || brand === p; })
    .filter((agent) => !def.criticalOnly || agent.criticalPath)
    .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));
}

// An agent is fresh when its published artifact is on the current strategy
// version AND it ran within its staleAfterHours budget. Fresh control-tier agents
// are skipped so preparing a lead never re-runs market strategy.
export function isAgentFresh(state, agent, nowMs = Date.now()) {
  const artifact = state.artifacts?.[agent.slug];
  if (!artifact || artifact.strategy_version !== STRATEGY_VERSION) return false;
  const agentState = state.agents?.[agent.id] || Object.values(state.agents || {}).find((entry) => entry.slug === agent.slug);
  const lastRunAt = agentState?.lastRunAt;
  if (!lastRunAt) return false;
  const ageHours = (nowMs - new Date(lastRunAt).getTime()) / 3_600_000;
  return Number.isFinite(ageHours) && ageHours <= (agent.staleAfterHours ?? 0);
}

// Returns the ordered execution plan: which agents run and which are skipped
// (and why). This is what the CLI and the Agent Health view consume.
export function planPipeline(registry, state, pipelineName, product, { force = false, nowMs = Date.now() } = {}) {
  const def = PIPELINES[pipelineName];
  if (!def) throw new Error(`unknown pipeline: ${pipelineName}`);
  if (def.chain) {
    return def.chain.flatMap((name) => planPipeline(registry, state, name, product, { force, nowMs }));
  }
  return selectPipelineAgents(registry, pipelineName, product).map((agent) => {
    const fresh = def.respectFreshness && !force && isAgentFresh(state, agent, nowMs);
    return { pipeline: pipelineName, slug: agent.slug, tier: agent.executionTier, criticalPath: agent.criticalPath, run: !fresh, skipReason: fresh ? "fresh" : null };
  });
}
