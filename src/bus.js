import fs from "node:fs/promises";
import path from "node:path";
import { fromRoot } from "./paths.js";

const messagesPath = fromRoot("data", "messages.jsonl");
const statePath = fromRoot("data", "state.json");
const artifactsDir = fromRoot("data", "artifacts");

async function ensureDataDirs() {
  await fs.mkdir(path.dirname(messagesPath), { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
}

export async function readRegistry() {
  const raw = await fs.readFile(fromRoot("agents", "registry.json"), "utf8");
  return JSON.parse(raw);
}

export async function findAgent(slugOrId) {
  const registry = await readRegistry();
  const agent = registry.agents.find((candidate) => {
    return candidate.slug === slugOrId || candidate.id === slugOrId;
  });

  if (!agent) {
    throw new Error(`Unknown agent: ${slugOrId}`);
  }

  return { registry, agent };
}

export async function readState() {
  await ensureDataDirs();

  try {
    const raw = await fs.readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return {
      project: "salesv3",
      updatedAt: null,
      agents: {},
      artifacts: {},
      runs: []
    };
  }
}

export async function writeState(state) {
  await ensureDataDirs();
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  return nextState;
}

export async function appendMessage(message) {
  await ensureDataDirs();
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    ...message
  };

  await fs.appendFile(messagesPath, `${JSON.stringify(event)}\n`);
  return event;
}

export async function readMessages(limit = 200) {
  await ensureDataDirs();

  try {
    const raw = await fs.readFile(messagesPath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-limit);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return [];
  }
}

export async function publishArtifact(agent, artifact) {
  await ensureDataDirs();

  const now = new Date().toISOString();
  const artifactName = `${agent.slug}-${now.replace(/[:.]/g, "-")}.json`;
  const artifactPath = path.join(artifactsDir, artifactName);
  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  const state = await readState();
  const relativeArtifactPath = path.relative(fromRoot(), artifactPath);
  const run = {
    agentId: agent.id,
    slug: agent.slug,
    status: "complete",
    artifactPath: relativeArtifactPath,
    completedAt: now
  };

  state.agents[agent.id] = {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    status: "complete",
    lastRunAt: now,
    lastArtifactPath: relativeArtifactPath
  };
  state.artifacts[agent.slug] = artifact;
  state.runs = [...(state.runs || []), run].slice(-50);
  await writeState(state);

  await appendMessage({
    type: "artifact",
    from: agent.id,
    to: "project",
    summary: `${agent.name} published ${artifactName}`,
    payload: {
      artifactPath: relativeArtifactPath,
      artifact
    }
  });

  return { artifactPath: relativeArtifactPath, artifact };
}

export async function setAgentStatus(agent, status, details = {}) {
  const state = await readState();
  const now = new Date().toISOString();

  const nextAgentState = {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    ...(state.agents[agent.id] || {}),
    status,
    updatedAt: now,
    ...details
  };

  if (status !== "failed" && !("reason" in details)) {
    delete nextAgentState.reason;
  }

  state.agents[agent.id] = nextAgentState;

  await writeState(state);
  await appendMessage({
    type: "status",
    from: agent.id,
    to: "project",
    summary: `${agent.name} status: ${status}`,
    payload: details
  });
}
