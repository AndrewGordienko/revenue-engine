import fs from "node:fs/promises";
import { readRegistry } from "./bus.js";
import { fromRoot } from "./paths.js";

async function fileExists(filePath) {
  try {
    await fs.access(fromRoot(filePath));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function fileIncludes(filePath, requiredText) {
  try {
    const content = await fs.readFile(fromRoot(filePath), "utf8");
    return content.includes(requiredText);
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function validateAgent(agent, slugSet) {
  const problems = [];
  const requiredFiles = [
    `agents/${agent.slug}/instructions.md`,
    `${agent.workspace}/AGENTS.md`,
    `${agent.workspace}/TOOLS.md`,
    `${agent.workspace}/IDENTITY.md`,
    `${agent.workspace}/USER.md`,
    `${agent.workspace}/HEARTBEAT.md`
  ];

  for (const filePath of requiredFiles) {
    if (!(await fileExists(filePath))) {
      problems.push(`${agent.slug}: missing ${filePath}`);
    }
  }

  for (const dependency of agent.dependsOn || []) {
    if (!slugSet.has(dependency)) {
      problems.push(`${agent.slug}: unknown dependency ${dependency}`);
    }
  }

  if (!(await fileIncludes(`agents/${agent.slug}/instructions.md`, "shared JSON bus"))) {
    problems.push(`${agent.slug}: instructions do not mention the shared JSON bus`);
  }

  if (!(await fileIncludes(`${agent.workspace}/AGENTS.md`, "data/state.json"))) {
    problems.push(`${agent.slug}: AGENTS.md does not point to shared state`);
  }

  if (!(await fileIncludes(`${agent.workspace}/AGENTS.md`, "data/messages.jsonl"))) {
    problems.push(`${agent.slug}: AGENTS.md does not point to message bus`);
  }

  if (!(await fileIncludes(`${agent.workspace}/TOOLS.md`, "data/state.json"))) {
    problems.push(`${agent.slug}: TOOLS.md does not point to shared state`);
  }

  if (!(await fileIncludes(`${agent.workspace}/TOOLS.md`, "data/messages.jsonl"))) {
    problems.push(`${agent.slug}: TOOLS.md does not point to message bus`);
  }

  for (const dependency of agent.dependsOn || []) {
    if (!(await fileIncludes(`${agent.workspace}/TOOLS.md`, dependency))) {
      problems.push(`${agent.slug}: TOOLS.md does not list dependency ${dependency}`);
    }
  }

  return problems;
}

async function main() {
  const registry = await readRegistry();
  const slugSet = new Set(registry.agents.map((agent) => agent.slug));
  const bySlug = new Map(registry.agents.map((agent) => [agent.slug, agent]));
  const idSet = new Set();
  const sequenceSet = new Set();
  const problems = [];

  for (const agent of registry.agents) {
    if (idSet.has(agent.id)) {
      problems.push(`${agent.slug}: duplicate id ${agent.id}`);
    }
    idSet.add(agent.id);

    if (sequenceSet.has(agent.sequence)) {
      problems.push(`${agent.slug}: duplicate sequence ${agent.sequence}`);
    }
    sequenceSet.add(agent.sequence);

    problems.push(...(await validateAgent(agent, slugSet)));
    if (!Array.isArray(agent.outputs) || !agent.outputs.length) problems.push(`${agent.slug}: outputs must be a non-empty array`);
    for (const dependency of agent.dependsOn || []) {
      const upstream = bySlug.get(dependency);
      if (upstream && Number(upstream.sequence) >= Number(agent.sequence)) {
        problems.push(`${agent.slug}: dependency ${dependency} must run earlier (${upstream.sequence} >= ${agent.sequence})`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }

  console.log(`agent communication protocol ok (${registry.agents.length} agents)`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
