// Writes the per-agent OpenClaw workspace docs (AGENTS.md, TOOLS.md, IDENTITY.md,
// USER.md, HEARTBEAT.md) from the registry. These files are generated and
// gitignored, so CI (and a fresh clone) must scaffold them before running
// validate:agents. Unlike `npm run setup`, this does NOT shell out to the
// `openclaw` CLI — it only writes local files, so it runs anywhere.
import { readRegistry } from "./bus.js";
import { writeWorkspaceDocs } from "./setup-openclaw.js";

const registry = await readRegistry();
for (const agent of registry.agents) {
  await writeWorkspaceDocs(agent);
}
console.log(`scaffolded workspace docs for ${registry.agents.length} agents`);
