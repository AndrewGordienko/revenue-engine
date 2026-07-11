import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { loadBenchmark, classifierBenchmark, stabilityScore, deterministicScoreStability, fieldConsumptionReport, engineeringGates } = await import("./acceptance-harness.js");

const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "agents", "registry.json"), "utf8"));

test("benchmark has 40 labeled accounts spanning all case types", () => {
  const fixtures = loadBenchmark();
  assert.equal(fixtures.length, 40);
  assert.equal(fixtures.filter((f) => f.product === "gnk").length, 20);
  assert.equal(fixtures.filter((f) => f.product === "outagehub").length, 20);
  for (const label of ["good_fit", "bad_fit", "ambiguous", "false_trigger", "missing_email", "unsupported_pain"]) {
    assert.ok(fixtures.some((f) => f.label === label), `benchmark includes a ${label} case`);
  }
});

test("classifier benchmark: perfect brand isolation and strong good-fit accuracy", () => {
  const cls = classifierBenchmark();
  assert.equal(cls.cross_brand_leaks, 0, "no GNK account maps to an OutageHub play or vice versa");
  assert.equal(cls.missing_email_send_ready, 0, "no missing-email account looks send-ready");
  assert.ok(cls.good_fit_accuracy >= 0.9, `good-fit accuracy ${cls.good_fit_accuracy}`);
});

test("stabilityScore requires >= 2 of 3 agreement", () => {
  const runs = [
    [{ id: "a", decision: "X" }, { id: "b", decision: "P" }],
    [{ id: "a", decision: "X" }, { id: "b", decision: "Q" }],
    [{ id: "a", decision: "X" }, { id: "b", decision: "R" }],
  ];
  const s = stabilityScore(runs);
  assert.equal(s.threshold, 2);
  assert.equal(s.stable_fraction, 0.5, "a is stable (3/3), b is not (1/1/1)");
});

test("the deterministic scorer is perfectly stable across reruns", () => {
  assert.equal(deterministicScoreStability().stable_fraction, 1);
});

test("all PR3 engineering gates pass on the current registry", () => {
  const result = engineeringGates(registry);
  const failed = result.gates.filter((g) => !g.pass).map((g) => g.gate);
  assert.deepEqual(failed, [], `failing gates: ${failed.join("; ")}`);
});

test("no critical-path agent has an orphaned output field", () => {
  const orphanedCritical = fieldConsumptionReport(registry).filter((r) => r.criticalPath && r.unconsumed_fields.length);
  assert.deepEqual(orphanedCritical, [], `orphaned critical outputs: ${JSON.stringify(orphanedCritical)}`);
});
