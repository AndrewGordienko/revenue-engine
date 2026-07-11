// Initializes the manual live-agent smoke: validates the manifest and seeds an
// isolated per-brand cohort group (one play-locked cohort per account). Runs
// against the real CRM (no db override) because the live agents work these leads.
//   npm run smoke:live:init -- --manifest data/inputs/live-smoke-accounts.json
import { db } from "./db.js";
import { loadManifest, validateManifest, initLiveSmoke, assertManifestScope, manifestPath } from "./smoke-live.js";

function flag(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

const file = flag("--manifest") || manifestPath();
const accounts = loadManifest(file);
const { ok, problems } = validateManifest(accounts);
if (!ok) {
  console.error(`Invalid live-smoke manifest (${file}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const database = db();
const { seeded, groups } = await initLiveSmoke(accounts, database);
for (const group of groups) {
  const { ok: isolated, leaked } = assertManifestScope(database, group, accounts);
  if (!isolated) {
    console.error(`cohort group ${group} contains non-manifest leads: ${leaked.join(", ")}`);
    process.exit(1);
  }
}
console.log(JSON.stringify({ manifest: file, groups, seeded }, null, 2));
console.log(`\nNext: approve each cohort in the dashboard, then:`);
for (const group of groups) console.log(`  npm run pipeline -- lead:prepare ${group.replace("-live-smoke", "")} --cohort ${group}`);
