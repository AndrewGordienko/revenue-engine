// Agent Health model for the dashboard. Combines the registry operating-model
// metadata, the live run state, and the acceptance harness so the dashboard can
// show which agents are current, stale, blocked, or off the live path — instead
// of treating all 38 agents as equally important.
import { STRATEGY_VERSION } from "./sales-plays.js";
import { isAgentFresh } from "./pipelines.js";
import { fieldConsumptionReport } from "./acceptance-harness.js";

export function buildAgentHealth(registry, state, nowMs = Date.now()) {
  const consumers = new Map();
  for (const agent of registry.agents) {
    for (const dep of agent.dependsOn || []) {
      if (!consumers.has(dep)) consumers.set(dep, []);
      consumers.get(dep).push(agent.slug);
    }
  }
  const bySlug = new Map(registry.agents.map((a) => [a.slug, a]));
  const unconsumed = new Map(fieldConsumptionReport(registry).map((r) => [r.slug, r.unconsumed_fields]));

  const agents = registry.agents.map((agent) => {
    const artifact = state.artifacts?.[agent.slug];
    const agentState = state.agents?.[agent.id] || Object.values(state.agents || {}).find((s) => s.slug === agent.slug) || null;
    const lastRunAt = agentState?.lastRunAt || null;
    const status = agentState?.status || (artifact ? "idle" : "never_run");
    const artifactStrategyVersion = artifact?.strategy_version || null;
    const current = artifactStrategyVersion === STRATEGY_VERSION;
    const fresh = isAgentFresh(state, agent, nowMs);
    const schemaPass = artifact ? (agent.outputs || []).every((key) => key in artifact) : null;
    const unconsumedFields = unconsumed.get(agent.slug) || [];
    const staleDeps = (agent.dependsOn || []).filter((dep) => {
      const upstream = bySlug.get(dep);
      return upstream && !isAgentFresh(state, upstream, nowMs);
    });

    let blocker = null;
    if (status === "failed") blocker = agentState?.reason ? String(agentState.reason).slice(0, 160) : "last run failed";
    else if (!artifact) blocker = "never run";
    else if (!current) blocker = `stale strategy version (${artifactStrategyVersion || "none"})`;
    else if (!fresh) blocker = `artifact older than ${agent.staleAfterHours}h`;
    else if (schemaPass === false) blocker = "artifact missing required output fields";
    else if (staleDeps.length) blocker = `waiting on: ${staleDeps.join(", ")}`;

    return {
      slug: agent.slug,
      name: agent.name,
      tier: agent.executionTier,
      criticalPath: agent.criticalPath,
      cadence: agent.cadence,
      benchmarkRequired: agent.benchmarkRequired,
      status,
      lastRunAt,
      artifactStrategyVersion,
      current,
      fresh,
      staleAfterHours: agent.staleAfterHours,
      lastRuntimeSeconds: null, // populated once run-agent records durations
      maxRuntimeSeconds: agent.maxRuntimeSeconds,
      estCostUsd: null, // populated once model usage is tracked per run
      maxCostUsd: agent.maxCostUsd,
      schemaPass,
      downstreamConsumers: consumers.get(agent.slug) || [],
      unconsumedFields,
      blocker,
    };
  });

  const summary = {
    total: agents.length,
    critical: agents.filter((a) => a.criticalPath).length,
    blocked: agents.filter((a) => a.blocker).length,
    fresh: agents.filter((a) => a.fresh).length,
    byTier: {},
  };
  for (const a of agents) summary.byTier[a.tier] = (summary.byTier[a.tier] || 0) + 1;

  return { generated_at: new Date(nowMs).toISOString(), strategy_version: STRATEGY_VERSION, summary, agents };
}
