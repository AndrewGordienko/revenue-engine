import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { selectPipelineAgents, planPipeline, isAgentFresh } = await import("./pipelines.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { sequenceSkeleton } = await import("./sequence-skeleton.js");

const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "agents", "registry.json"), "utf8"));

test("lead:prepare runs only the lead-tier critical agents (the reduced live path)", () => {
  const slugs = selectPipelineAgents(registry, "lead:prepare", "gnk").map((a) => a.slug);
  assert.deepEqual(slugs, ["gnk-client-dossier", "gnk-email-drafter", "gnk-email-sequence-reviewer"]);
  // The ≤6-model-call gate: approved account → reviewed sequence is 3 lead calls.
  assert.ok(slugs.length <= 6, "per-lead critical path must stay at or under six model calls");
});

test("strategy:refresh selects control-tier agents (incl. shared radar) and no lead/cohort agents", () => {
  const agents = selectPipelineAgents(registry, "strategy:refresh", "gnk");
  const tiers = new Set(agents.map((a) => a.executionTier));
  assert.deepEqual([...tiers], ["control"]);
  assert.ok(agents.some((a) => a.slug === "revenue-demand-radar"), "shared Demand Radar is part of strategy refresh");
  assert.ok(!agents.some((a) => a.executionTier === "lead" || a.executionTier === "cohort"));
});

test("cohort:build selects the four cohort-tier agents for the brand", () => {
  const slugs = selectPipelineAgents(registry, "cohort:build", "outagehub").map((a) => a.slug);
  assert.deepEqual(slugs.sort(), [
    "outagehub-account-scoring", "outagehub-account-sourcing", "outagehub-contact-discovery", "outagehub-email-finder",
  ]);
});

test("sequence skeleton is deterministic and matches each brand's binding policy", () => {
  const gnk = sequenceSkeleton("gnk");
  assert.equal(gnk.touch_count, 4);
  assert.deepEqual(gnk.send_days, [1, 4, 10, 18]);
  assert.deepEqual(gnk.touches.map((t) => t.touch_key), ["trigger_and_outcome", "useful_point_of_view", "method_or_shaping", "router_close"]);
  const ohub = sequenceSkeleton("outagehub");
  assert.equal(ohub.touch_count, 5);
  assert.deepEqual(ohub.send_days, [1, 4, 9, 16, 25]);
  assert.equal(ohub.touches.at(-1).touch_key, "router_close");
  assert.deepEqual(sequenceSkeleton("gnk"), gnk, "same input yields identical skeleton (deterministic)");
});

test("no critical-path agent depends on an off-live-path agent", () => {
  const bySlug = new Map(registry.agents.map((a) => [a.slug, a]));
  const offPath = (agent) => agent.executionTier === "deterministic" || (agent.executionTier === "lead" && !agent.criticalPath);
  for (const agent of registry.agents.filter((a) => a.criticalPath)) {
    for (const dep of agent.dependsOn || []) {
      const upstream = bySlug.get(dep);
      assert.ok(upstream && !offPath(upstream), `${agent.slug} (critical) must not depend on off-path ${dep}`);
    }
  }
});

test("strategy refresh skips fresh agents and reruns stale/off-version ones", () => {
  const radar = registry.agents.find((a) => a.slug === "revenue-demand-radar");
  const now = new Date("2026-07-11T12:00:00.000Z").getTime();
  const freshState = {
    artifacts: { "revenue-demand-radar": { strategy_version: STRATEGY_VERSION } },
    agents: { [radar.id]: { slug: "revenue-demand-radar", lastRunAt: "2026-07-11T06:00:00.000Z" } },
  };
  assert.equal(isAgentFresh(freshState, radar, now), true, "ran 6h ago on current version → fresh");

  const staleState = {
    artifacts: { "revenue-demand-radar": { strategy_version: STRATEGY_VERSION } },
    agents: { [radar.id]: { slug: "revenue-demand-radar", lastRunAt: "2026-07-01T06:00:00.000Z" } },
  };
  assert.equal(isAgentFresh(staleState, radar, now), false, "ran 10 days ago (> 168h) → stale");

  const oldVersion = {
    artifacts: { "revenue-demand-radar": { strategy_version: "plan-2000-01-01" } },
    agents: { [radar.id]: { slug: "revenue-demand-radar", lastRunAt: "2026-07-11T11:00:00.000Z" } },
  };
  assert.equal(isAgentFresh(oldVersion, radar, now), false, "wrong strategy version → not fresh");

  const plan = planPipeline(registry, freshState, "strategy:refresh", "gnk", { nowMs: now });
  const radarStep = plan.find((s) => s.slug === "revenue-demand-radar");
  assert.equal(radarStep.run, false);
  assert.equal(radarStep.skipReason, "fresh");
  assert.equal(planPipeline(registry, freshState, "strategy:refresh", "gnk", { nowMs: now, force: true }).find((s) => s.slug === "revenue-demand-radar").run, true, "--force reruns everything");
});
