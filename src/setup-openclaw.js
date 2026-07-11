import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { readRegistry, readState, appendMessage, setAgentStatus } from "./bus.js";
import { fromRoot } from "./paths.js";

const execFileAsync = promisify(execFile);

async function openclaw(args) {
  const { stdout } = await execFileAsync("openclaw", args, {
    cwd: fromRoot(),
    maxBuffer: 1024 * 1024 * 8
  });
  return stdout;
}

// Skills the whole pipeline depends on, installed into the shared managed skills
// directory so every salesv3 agent can see them.
const REQUIRED_SKILLS = ["multi-search-engine", "ontology"];

async function skillEligible(agentId, slug) {
  try {
    const stdout = await openclaw(["skills", "check", "--agent", agentId, "--json"]);
    const report = JSON.parse(stdout.slice(stdout.indexOf("{")));
    return Array.isArray(report.eligible) && report.eligible.includes(slug);
  } catch {
    return false;
  }
}

async function ensureSkills(registry) {
  const probeAgent = registry.agents[0];
  if (!probeAgent) return;
  for (const slug of REQUIRED_SKILLS) {
    if (await skillEligible(probeAgent.id, slug)) {
      console.log(`Skill already available: ${slug}`);
      continue;
    }
    try {
      await openclaw(["skills", "install", slug, "--global"]);
      console.log(`Installed skill: ${slug}`);
    } catch (error) {
      console.warn(`Could not install skill ${slug}: ${error.message}`);
    }
  }
}

async function listAgents() {
  const stdout = await openclaw(["agents", "list", "--json"]);
  const jsonStart = stdout.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`OpenClaw did not return an agent list:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart));
}

export function workspaceDocs(agent) {
  const instructionsPath = fromRoot(`agents/${agent.slug}/instructions.md`);
  const statePath = fromRoot("data/state.json");
  const messagesPath = fromRoot("data/messages.jsonl");
  const registryPath = fromRoot("agents/registry.json");
  const dependencies = agent.dependsOn || [];
  const sources = agent.sourceUrls || [];
  const projectDescription =
    agent.projectDescription ||
    "The user is building a GNK/OpenClaw sales intelligence pipeline.";

  return {
    "AGENTS.md": `# ${agent.name} Workspace

You are the ${agent.name} agent for the \`salesv3\` repo.

Read and follow:

- \`${instructionsPath}\`

Shared project state:

- \`${statePath}\`
- \`${messagesPath}\`

When you finish a run, produce the JSON object requested by the output contract so the runner can publish it to the shared JSON bus.
`,
    "TOOLS.md": `# TOOLS.md

Project files:

- Agent registry: \`${registryPath}\`
- Shared state: \`${statePath}\`
- Message bus: \`${messagesPath}\`

Primary sources:
${sources.map((sourceUrl) => `- \`${sourceUrl}\``).join("\n") || "- none"}

Helpful upstream artifacts:
${dependencies.map((dependency) => `- \`${dependency}\` in \`${statePath}\``).join("\n") || "- none"}

Skills:

- \`multi-search-engine\` — search several engines and combine results for company, contact, and trigger research instead of trusting one provider.
- \`ontology\` — the shared knowledge graph at \`data/ontology/graph.jsonl\`. Query what is already known about a Company, Person, Deal, Investor, or Conversation before producing new claims:
  \`python3 ~/.openclaw/skills/ontology/scripts/ontology.py query --type Company --where '{"product":"gnk"}' --graph data/ontology/graph.jsonl\`
`,
    "IDENTITY.md": `# IDENTITY.md

Agent id: \`${agent.id}\`
Agent slug: \`${agent.slug}\`
Role: ${agent.role}
Model: \`${agent.model}\`
`,
    "USER.md": `# USER.md

${projectDescription} Optimize for practical outbound sales work, grounded evidence, and clean JSON handoffs through the shared bus.
`,
    "HEARTBEAT.md": `# HEARTBEAT.md

- Check \`${statePath}\` before work.
- Check \`${messagesPath}\` for recent handoffs.
- Return valid JSON matching the requested output contract.
`
  };
}

export async function writeWorkspaceDocs(agent) {
  const workspace = fromRoot(agent.workspace);
  await fs.mkdir(workspace, { recursive: true });
  const docs = workspaceDocs(agent);
  for (const [fileName, content] of Object.entries(docs)) {
    await fs.writeFile(path.join(workspace, fileName), content);
  }
}

async function main() {
  const registry = await readRegistry();
  await ensureSkills(registry);
  const existing = await listAgents();
  const existingIds = new Set(existing.map((agent) => agent.id));

  for (const agent of registry.agents) {
    const workspace = fromRoot(agent.workspace);
    const agentDir = fromRoot(agent.agentDir);
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(path.dirname(agentDir), { recursive: true });
    await writeWorkspaceDocs(agent);

    if (agent.runner === "local") {
      await setAgentStatus(agent, "registered", { workspace, agentDir, localRunner: true });
      console.log(`Local agent registered: ${agent.id}`);
      continue;
    }

    if (existingIds.has(agent.id)) {
      const state = await readState();
      const currentAgentState = state.agents?.[agent.id];
      if (currentAgentState?.status !== "complete") {
        await setAgentStatus(agent, "registered", { workspace, agentDir, alreadyExisted: true });
      }
      console.log(`OpenClaw agent already registered: ${agent.id}`);
      continue;
    }

    try {
      await openclaw([
        "agents",
        "add",
        agent.id,
        "--non-interactive",
        "--workspace",
        workspace,
        "--agent-dir",
        agentDir,
        "--model",
        agent.model,
        "--json"
      ]);
    } catch (error) {
      const output = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
      if (/already exists/i.test(output)) {
        await setAgentStatus(agent, "registered", { workspace, agentDir, alreadyExisted: true });
        console.log(`OpenClaw agent already registered: ${agent.id}`);
        continue;
      }
      throw error;
    }

    await setAgentStatus(agent, "registered", { workspace, agentDir, alreadyExisted: false });
    await appendMessage({
      type: "setup",
      from: "setup-openclaw",
      to: agent.id,
      summary: `Registered OpenClaw agent ${agent.id}`,
      payload: { workspace, agentDir, model: agent.model }
    });
    console.log(`Registered OpenClaw agent: ${agent.id}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
