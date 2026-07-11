import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { buildAgentHealth } = await import("./agent-health.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");

const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "agents", "registry.json"), "utf8"));

test("agent health reports every agent and groups them by tier", () => {
  const health = buildAgentHealth(registry, { artifacts: {}, agents: {} }, Date.parse("2026-07-11T12:00:00Z"));
  assert.equal(health.summary.total, registry.agents.length);
  assert.equal(health.summary.byTier.lead + health.summary.byTier.cohort + health.summary.byTier.control + health.summary.byTier.deterministic, registry.agents.length);
  // With no artifacts, everything is blocked as "never run".
  assert.equal(health.summary.blocked, registry.agents.length);
  assert.ok(health.agents.every((a) => a.blocker === "never run"));
});

test("a current, recently-run agent with no stale deps is fresh and unblocked", () => {
  const radar = registry.agents.find((a) => a.slug === "revenue-demand-radar");
  const now = Date.parse("2026-07-11T12:00:00Z");
  const state = {
    artifacts: { "revenue-demand-radar": { strategy_version: STRATEGY_VERSION, radar_summary: "x", observed_window: {}, signal_clusters: [], named_account_signals: [], offer_demand: [], durability_assessment: [], trigger_monitor: {}, recommended_cohorts: [], source_notes: [] } },
    agents: { [radar.id]: { slug: "revenue-demand-radar", status: "complete", lastRunAt: "2026-07-11T09:00:00Z" } },
  };
  const health = buildAgentHealth(registry, state, now);
  const row = health.agents.find((a) => a.slug === "revenue-demand-radar");
  assert.equal(row.fresh, true);
  assert.equal(row.current, true);
  assert.equal(row.blocker, null);
  assert.equal(row.schemaPass, true);
});
