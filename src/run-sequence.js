import { spawn } from "node:child_process";
import { readRegistry } from "./bus.js";
import { fromRoot } from "./paths.js";

function runAgent(slug) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["src/run-agent.js", slug], {
      cwd: fromRoot(),
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${slug} exited with code ${code}`));
    });
  });
}

async function main() {
  const registry = await readRegistry();
  const agents = [...registry.agents].sort((a, b) => {
    return (a.sequence || 999) - (b.sequence || 999);
  });
  const requested = process.argv[2] || "gnk";
  const productPrefix = requested === "outagehub" || requested === "ohub" ? "outagehub-" : requested === "gnk" ? "gnk-" : null;
  const selectedAgents = productPrefix
    ? agents.filter((agent) => !agent.optional && (agent.slug.startsWith(productPrefix) || (agent.brands || []).includes(requested === "ohub" ? "outagehub" : requested)))
    : agents.filter((agent) => agent.slug === requested || agent.id === requested);

  if (selectedAgents.length === 0) {
    throw new Error(`Unknown agent sequence target: ${requested}`);
  }

  for (const agent of selectedAgents) {
    console.log(`\n[sequence] ${agent.sequence || "-"} ${agent.slug}`);
    await runAgent(agent.slug);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
