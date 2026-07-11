// Draft-only smoke CLI. Defaults to an isolated data/smoke.db so it never touches
// the real CRM. Usage:
//   npm run smoke:seed      # seed the six synthetic accounts
//   npm run smoke:fixture   # produce dossiers + sequences, queue for approval
//   npm run smoke:report    # print the smoke report
//   npm run smoke:assert    # enforce the nine hard acceptance gates
import path from "node:path";

process.env.CRM_DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "smoke.db");
process.env.LEAD_MEMORY_DIR = process.env.LEAD_MEMORY_DIR || path.join(process.cwd(), "data", "smoke-memory");
process.env.SENDER_UNSUBSCRIBE_READY = process.env.SENDER_UNSUBSCRIBE_READY || "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = process.env.REVENUE_EVENT_SKIP_ONTOLOGY || "1";

const artifactsPath = path.join(path.dirname(process.env.CRM_DB_PATH), "smoke-artifacts.json");
const { readRegistry } = await import("./bus.js");
const { db } = await import("./db.js");
const harness = await import("./smoke-harness.js");

const command = process.argv[2];
switch (command) {
  case "seed": {
    const seeded = await harness.seedSmokeAccounts(db());
    console.log(`seeded ${seeded.length} smoke accounts into ${process.env.CRM_DB_PATH}`);
    break;
  }
  case "fixture": {
    const artifacts = harness.runSmokeFixture(db(), artifactsPath);
    console.log(`produced ${artifacts.leads.length} dossiers + sequences; queued for approval (nothing approved/drafted/sent).`);
    break;
  }
  case "report": {
    console.log(JSON.stringify(harness.buildSmokeReport(db(), artifactsPath), null, 2));
    break;
  }
  case "assert": {
    const { gates, all_pass } = harness.evaluateSmokeGates(db(), artifactsPath, await readRegistry());
    for (const g of gates) console.log(`${g.pass === true ? "PASS" : g.pass === null ? "SKIP" : "FAIL"}  ${g.gate}${g.detail ? ` — ${g.detail}` : ""}`);
    console.log(`\nall gates pass: ${all_pass}`);
    process.exit(all_pass ? 0 : 1);
    break;
  }
  default:
    console.error("Usage: node src/smoke-cli.js seed|fixture|report|assert");
    process.exit(1);
}
