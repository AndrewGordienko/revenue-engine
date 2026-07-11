// Prints the agent acceptance report: engineering gates, classifier benchmark,
// deterministic stability, and any orphaned (unconsumed) output fields.
//   node src/run-acceptance.js
import { readRegistry } from "./bus.js";
import { engineeringGates, fieldConsumptionReport, classifierBenchmark } from "./acceptance-harness.js";

const registry = await readRegistry();
const result = engineeringGates(registry);

console.log("=== engineering gates ===");
for (const g of result.gates) console.log(`${g.pass ? "PASS" : "FAIL"}  ${g.gate} — ${g.detail}`);

console.log("\n=== classifier benchmark (deterministic play assignment) ===");
console.log(JSON.stringify(result.classifier, null, 2));

const orphans = fieldConsumptionReport(registry).filter((r) => r.unconsumed_fields.length);
console.log(`\n=== unconsumed output fields (${orphans.length} agents) ===`);
for (const r of orphans) console.log(`  ${r.slug}${r.criticalPath ? " (critical)" : ""}: ${r.unconsumed_fields.join(", ")}`);

console.log(`\nall gates pass: ${result.all_pass}`);
process.exit(result.all_pass ? 0 : 1);
