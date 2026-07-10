import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendMessage,
  findAgent,
  publishArtifact,
  readMessages,
  readState,
  setAgentStatus
} from "./bus.js";
import { readLeads } from "./leads-store.js";
import { graphSummary, loadGraph } from "./ontology.js";
import { recordArtifactToOntology } from "./ontology-record.js";
import { recordArtifactToLeadMemory } from "./lead-memory-record.js";
import { readMemoryEvents, reduceLeadMemory } from "./lead-memory.js";
import { fromRoot } from "./paths.js";
import { PORTFOLIO_STRATEGY, SALES_PLAYS, SEQUENCE_POLICIES, STRATEGY_VERSION } from "./sales-plays.js";

// Agents that do live public web research and benefit from querying several
// search engines and combining the results (multi-search-engine skill).
const RESEARCH_AGENT_SUFFIXES = [
  "company-context",
  "icp-contact-profile",
  "boutique-growth-playbook",
  "offer-map",
  "revenue-strategy",
  "account-sourcing",
  "account-scoring",
  "contact-discovery",
  "client-dossier",
  "outreach-angle",
  "email-finder",
  "market-coverage",
  "lead-persona-profile",
  "demand-radar"
];

function isResearchAgent(agent) {
  return RESEARCH_AGENT_SUFFIXES.some((suffix) => agent.slug.endsWith(suffix));
}

// Agents that should avoid re-surfacing people already in the CRM so repeated
// prospecting rounds accumulate NEW leads instead of the same handful.
const DEDUP_AWARE_AGENT_SUFFIXES = ["account-sourcing", "contact-discovery"];
// Send prompts inline rather than via a file the agent must read. Large file
// reads make the codex harness run a "compact" task that has been failing on the
// gateway; the model's context window (400k) easily holds these prompts inline.
const MAX_DIRECT_MESSAGE_CHARS = 500000;

function isDedupAwareAgent(agent) {
  return DEDUP_AWARE_AGENT_SUFFIXES.some((suffix) => agent.slug.endsWith(suffix));
}

function productForAgent(agent) {
  if ((agent.brands || []).length > 1) return "portfolio";
  return agent.slug.startsWith("outagehub-") ? "outagehub" : "gnk";
}

function commercialTargetFor(registry, agent) {
  if ((agent.brands || []).length > 1) {
    return {
      portfolio: registry.portfolioStrategy,
      brands: {
        gnk: registry.commercialTarget,
        outagehub: registry.commercialTargets?.outagehub
      }
    };
  }
  return (
    agent.commercialTarget ||
    (agent.commercialTargetKey ? registry.commercialTargets?.[agent.commercialTargetKey] : null) ||
    registry.commercialTarget ||
    null
  );
}

async function buildExclusionBlock(agent) {
  if (!isDedupAwareAgent(agent)) return "";
  const leads = await readLeads(productForAgent(agent));
  if (!leads.length) return "";
  const known_companies = [...new Set(leads.map((l) => l.company).filter(Boolean))];
  const known_people = [...new Set(leads.map((l) => l.name).filter(Boolean))];
  return [
    "",
    "Leads already captured in the CRM. Do NOT return any of these companies or people again — find genuinely NEW accounts and named contacts that each have a fresh, verifiable public trigger event:",
    JSON.stringify({ known_companies, known_people }, null, 2)
  ].join("\n");
}

const execFileAsync = promisify(execFile);

// Agents flagged with `"execution": "api-key"` in the registry are run through
// the embedded local agent (`openclaw agent --local`) which talks to the OpenAI
// API directly with the API key, instead of the default Gateway route that runs
// the model through the codex harness (chatgpt.com/backend-api/codex). The codex
// remote "compact" step has been unreliable on the gateway, so these agents skip
// it entirely. `--local` reads the key from the process env, so we resolve it
// here and inject it into the child rather than requiring a manual shell export.
function usesApiKeyRuntime(agent) {
  return agent.execution === "api-key" || agent.execution === "local";
}

async function resolveOpenAiApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  try {
    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    if (auth.OPENAI_API_KEY) return auth.OPENAI_API_KEY;
  } catch {
    // fall through to the error below
  }
  throw new Error(
    "No OpenAI API key available for api-key runtime. Set OPENAI_API_KEY or store it in ~/.codex/auth.json."
  );
}

function extractJson(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
  }

  throw new Error("Agent response did not contain a JSON object.");
}

const EMAIL_REVIEWER_BAD_BODY_PATTERNS = [
  "I'm Andrew, one of the founders at G&K Software.",
  "I am Andrew, one of the founders at G&K Software.",
  "For context, G&K is",
  "https://gnksoftware.com",
  "The place I'd be curious about is",
  "meaningful product signal",
  "Zero Networks's",
  "security-control",
  "Pinwheel is actively hiring a Senior Platform Engineer for Integrations Tooling to eliminate recurring platform problems and improve the integrations platform",
  "One useful way to look at Pinwheel is actively hiring",
  "the short version is that Pinwheel is actively hiring",
  "current engineering hiring signal",
  "If the integrations tooling role and offer",
  "backend, platform, infrastructure, workflow, modernization, and rescue work",
  "outside senior pair",
  "high-risk infrastructure boundary",
  "high-risk infrastructure slice",
  "highest-risk infrastructure slice",
  "fully owned internally",
  "The first thing I would not do",
  "bounded slice",
  "technical rescue read",
  "first contract slice",
  "contract slice"
];

function findEmailBodyQualityHits(artifact) {
  const hits = [];
  for (const sequence of artifact.improved_person_email_sequences || []) {
    for (const email of sequence.emails || []) {
      for (const pattern of EMAIL_REVIEWER_BAD_BODY_PATTERNS) {
        if ((email.body || "").includes(pattern)) {
          hits.push({
            company: sequence.company,
            person_name: sequence.person_name,
            touch_number: email.touch_number,
            pattern
          });
        }
      }
    }
  }
  return hits;
}

function expectedSequenceTouches(agent) {
  return SEQUENCE_POLICIES[productForAgent(agent)]?.touch_count || 0;
}

function validateEmailReviewerArtifact(agent, artifact) {
  const sequences = artifact.improved_person_email_sequences || [];
  if (!sequences.length) {
    throw new Error("Email reviewer full artifact has no improved_person_email_sequences.");
  }

  const expectedTouches = expectedSequenceTouches(agent);
  const wrongTouchCounts = sequences
    .filter((sequence) => (sequence.emails || []).length !== expectedTouches)
    .map((sequence) => `${sequence.company}/${sequence.person_name}`);
  if (wrongTouchCounts.length) {
    throw new Error(`Email reviewer sequences without exactly ${expectedTouches} touches: ${wrongTouchCounts.slice(0, 10).join(", ")}`);
  }

  const bodyQualityHits = findEmailBodyQualityHits(artifact);
  if (bodyQualityHits.length) {
    throw new Error(`Email reviewer body quality gate failed: ${JSON.stringify(bodyQualityHits.slice(0, 10))}`);
  }
}

function enforceSequencePolicy(agent, artifact) {
  const sequenceKey = agent.slug.endsWith("email-sequence-reviewer")
    ? "improved_person_email_sequences"
    : agent.slug.endsWith("email-sequence-drafter")
      ? "person_email_sequences"
      : null;
  if (!sequenceKey) return artifact;
  const sequences = artifact[sequenceKey] || [];
  const expected = expectedSequenceTouches(agent);
  const wrong = sequences.filter((sequence) => (sequence.emails || []).length !== expected);
  if (wrong.length) {
    throw new Error(`${agent.slug} violated the binding ${expected}-touch policy for: ${wrong.slice(0, 10).map((s) => `${s.company}/${s.person_name}`).join(", ")}`);
  }
  return artifact;
}

async function maybeLoadLargeOutputArtifact(agent, artifact, runStartedAt) {
  if (!agent.slug.endsWith("email-sequence-reviewer")) return artifact;

  if (artifact.improved_person_email_sequences?.length) {
    validateEmailReviewerArtifact(agent, artifact);
    return artifact;
  }

  const fullArtifactPath = fromRoot("data", "artifacts", `${agent.slug}-full.json`);
  const stat = await fs.stat(fullArtifactPath);
  if (stat.mtimeMs < runStartedAt) {
    throw new Error(`Email reviewer full artifact was not updated by this run: ${fullArtifactPath}`);
  }

  const fullArtifact = JSON.parse(await fs.readFile(fullArtifactPath, "utf8"));
  validateEmailReviewerArtifact(agent, fullArtifact);
  return fullArtifact;
}

function annotateAgentArtifact(agent, artifact, modelUsed) {
  const sourceNotes = Array.isArray(artifact.source_notes) ? artifact.source_notes : [];
  return {
    ...artifact,
    generation_method: "openclaw_agent",
    generation_model: modelUsed,
    source_notes: [
      ...sourceNotes,
      `Generated by ${agent.id} using ${modelUsed}.`
    ]
  };
}

// National / Fortune-500-scale enterprises where only executives are public.
// Sourcing that lands here produces C-suite contacts, so we drop these accounts
// to near_misses deterministically even if the model ignores the instruction.
const ENTERPRISE_BLOCKLIST = [
  "rogers",
  "bell canada",
  "bce",
  "telus",
  "hydro one",
  "hydro-québec",
  "hydro quebec",
  "bc hydro",
  "enbridge",
  "intact",
  "definity",
  "wawanesa",
  "aviva",
  "manulife",
  "sun life",
  "royal bank",
  "rbc",
  "td bank",
  "toronto-dominion",
  "scotiabank",
  "bank of montreal",
  "bmo",
  "cibc",
  "loblaw",
  "metro inc",
  "empire company",
  "sobeys",
  "canadian tire",
  "purolator",
  "canada post",
  "canadian national",
  "canadian pacific"
];

function namePartLooksReal(value) {
  const name = String(value || "").split(",")[0].trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every((part) => /^[A-Z][A-Za-z'.-]+$/.test(part));
}

function isBlockedEnterprise(company) {
  const value = String(company || "").toLowerCase();
  return ENTERPRISE_BLOCKLIST.some((name) => value.includes(name));
}

// Enforce the sourcing reachability gate on the account-sourcing artifact before
// it is published: an account must name a real operational owner and must not be
// a blocklisted national enterprise. Non-compliant accounts are moved to
// near_misses so the whole downstream chain only ever sees reachable accounts.
function enforceSourcingReachability(agent, artifact) {
  if (!agent.slug.endsWith("account-sourcing")) return artifact;
  const accounts = Array.isArray(artifact.target_accounts) ? artifact.target_accounts : [];
  if (!accounts.length) return artifact;

  const kept = [];
  const demoted = [];
  for (const account of accounts) {
    const buyer = account.reachable_path?.likely_buyer_or_router || "";
    if (isBlockedEnterprise(account.company)) {
      demoted.push({ company: account.company, reason: "National enterprise: only executives are publicly named.", source_url: account.website || "" });
      continue;
    }
    if (!namePartLooksReal(buyer)) {
      demoted.push({ company: account.company, reason: "No real named operational owner in reachable_path.likely_buyer_or_router.", source_url: account.website || "" });
      continue;
    }
    kept.push(account);
  }

  if (!demoted.length) return artifact;
  console.error(`sourcing gate: kept ${kept.length}, demoted ${demoted.length} accounts to near_misses`);
  return {
    ...artifact,
    target_accounts: kept,
    near_misses: [...(Array.isArray(artifact.near_misses) ? artifact.near_misses : []), ...demoted]
  };
}

function buildDependencyStatus(agent, state) {
  return (agent.dependsOn || []).map((slug) => {
    const upstreamAgent = Object.values(state.agents || {}).find((candidate) => candidate.slug === slug);
    return {
      slug,
      present: Boolean(state.artifacts?.[slug]),
      lastRunAt: upstreamAgent?.lastRunAt || null,
      status: upstreamAgent?.status || null,
      artifactKeys: state.artifacts?.[slug] ? Object.keys(state.artifacts[slug]) : []
    };
  });
}

function buildDownstreamConsumers(registry, agent) {
  return registry.agents
    .filter((candidate) => (candidate.dependsOn || []).includes(agent.slug))
    .map((candidate) => ({
      id: candidate.id,
      slug: candidate.slug,
      name: candidate.name,
      sequence: candidate.sequence || null
    }));
}

function filterRelevantMessages(messages, agent) {
  const relevantAgents = new Set([agent.id, agent.slug, ...(agent.dependsOn || [])]);
  return messages.filter((message) => {
    return (
      relevantAgents.has(message.from) ||
      relevantAgents.has(message.to) ||
      message.to === agent.id ||
      message.to === agent.slug ||
      message.to === "project"
    );
  });
}

function summarizeMessage(message) {
  const payload = message.payload || {};
  return {
    id: message.id,
    timestamp: message.timestamp,
    type: message.type,
    from: message.from,
    to: message.to,
    summary: message.summary,
    payloadSummary: {
      protocol: payload.protocol || null,
      artifactSlug: payload.artifactSlug || null,
      artifactPath: payload.artifactPath || null,
      artifactKeys: payload.artifactKeys || (payload.artifact ? Object.keys(payload.artifact) : [])
    }
  };
}

function buildPromptState(state, agent) {
  const relevantArtifactSlugs = new Set(agent.dependsOn || []);
  const artifacts = {};

  for (const slug of relevantArtifactSlugs) {
    if (state.artifacts?.[slug]) {
      artifacts[slug] = state.artifacts[slug];
    }
  }

  const agents = {};
  for (const [id, agentState] of Object.entries(state.agents || {})) {
    agents[id] = {
      id: agentState.id,
      slug: agentState.slug,
      name: agentState.name,
      status: agentState.status,
      lastRunAt: agentState.lastRunAt || null,
      lastArtifactPath: agentState.lastArtifactPath || null,
      updatedAt: agentState.updatedAt || null
    };
  }

  return {
    project: state.project,
    updatedAt: state.updatedAt,
    agents,
    artifacts
  };
}

async function readInputFiles(agent) {
  return Promise.all(
    (agent.inputFiles || []).map(async (inputFile) => {
      try {
        return {
          path: inputFile,
          present: true,
          content: await fs.readFile(fromRoot(inputFile), "utf8")
        };
      } catch (error) {
        if (error.code === "ENOENT") {
          return {
            path: inputFile,
            present: false,
            content: null
          };
        }
        throw error;
      }
    })
  );
}

function buildMultiSearchBlock(agent) {
  if (!isResearchAgent(agent)) return "";
  return [
    "",
    "Research tooling — multi-search-engine skill:",
    "You have the `multi-search-engine` skill installed. Do NOT rely on a single search provider.",
    "For every company, contact, trigger-event, funding, hiring, or incident lookup, query several engines",
    "(Google, DuckDuckGo, Brave, Startpage, Bing, Ecosia, plus WolframAlpha for figures) and combine/cross-check",
    "the results before you trust a fact. Use advanced operators when helpful: site:, filetype:, quoted exact",
    "match, and time filters (tbs=qdr:w / qdr:m) to prefer recent public signals. Corroborate any trigger event",
    "against at least two independent engines/sources, and keep the source URLs in your output."
  ].join("\n");
}

function buildCommercialStrategyBlock(agent) {
  const product = productForAgent(agent);
  const plays = product === "portfolio" ? SALES_PLAYS : SALES_PLAYS.filter((play) => play.brand === product);
  const policy = SEQUENCE_POLICIES[product];
  return [
    "",
    `Binding commercial strategy — ${STRATEGY_VERSION}:`,
    "This block overrides any older pricing, volume, offer, or sequence language elsewhere in the prompt.",
    "GNK and OutageHub share research/CRM infrastructure only; never transfer economics, offers, proof, sequence, or closing motion between them.",
    JSON.stringify({ portfolio: PORTFOLIO_STRATEGY, active_brand: product, sales_plays: plays, sequence_policy: policy }, null, 2),
    product === "gnk"
      ? "Enforce a one-deal, high-trust motion. Prefer warm introductions, observable triggers, and partners. Do not optimize for hundreds of generic cold emails. Only the three listed sprints may be presented externally; the paid one-week shaping engagement is the fallback."
      : product === "outagehub"
        ? "Enforce a paid-pilot motion. Do not lead with a low-price API subscription. Every proposal must separate implementation from recurring fees, name one workflow and success criteria, and create an annual conversion decision."
        : "Research both brands, but assign every signal and cohort to exactly one brand and one active play. Never create a blended portfolio offer."
  ].join("\n");
}

async function buildOntologyBlock(agent) {
  let summary;
  try {
    summary = graphSummary(await loadGraph());
  } catch {
    summary = { entities: 0, relations: 0, byType: {}, byRel: {} };
  }
  const writes = agent.slug.endsWith("account-sourcing") || agent.slug.endsWith("contact-discovery");
  const lines = [
    "",
    "Shared knowledge graph — ontology skill:",
    "The project keeps a structured knowledge graph at `data/ontology/graph.jsonl`. It has two halves:",
    "the CRM spine (Company, Person, Deal, Investor, Introduction, Conversation) and the strategic understanding",
    "we've built besides the raw leads (Product = GNK/OutageHub self-node, Segment, Persona, Offer, Trigger, Insight),",
    "connected by works_at / buyer_at / has_deal / deal_contact / invested_in / introduced_by / had_conversation /",
    "targets_company / has_segment / has_persona / provides_offer / serves_segment / watches_trigger / has_insight.",
    "Prefer querying this graph over re-deriving facts",
    "from Markdown or prior artifacts. Query it with the ontology skill from the project root, e.g.:",
    "  python3 ~/.openclaw/skills/ontology/scripts/ontology.py query --type Company --where '{\"product\":\"gnk\"}' --graph data/ontology/graph.jsonl",
    "  python3 ~/.openclaw/skills/ontology/scripts/ontology.py related --id <company_id> --rel has_deal --graph data/ontology/graph.jsonl",
    "Use it to check what is already known about an account or person (existing deals, prior conversations,",
    "known buyers, investors) before proposing new work, so you build on the graph instead of duplicating it.",
    `Current graph snapshot: ${JSON.stringify(summary)}.`
  ];
  if (writes) {
    lines.push(
      "The runner automatically records the companies and named contacts in your JSON output into this graph,",
      "so keep company names, websites, contact names, titles, emails, and trigger events precise and consistent."
    );
  }
  return lines.join("\n");
}

// Agents that act on specific existing leads benefit from that lead's memory
// (prior touches + accumulated understanding) so they build on it, not re-derive.
const LEAD_MEMORY_AWARE_SUFFIXES = [
  "contact-discovery",
  "account-scoring",
  "client-dossier",
  "outreach-angle",
  "lead-persona-profile",
  "sequence-strategy",
  "email-drafter",
  "email-sequence-drafter",
  "email-sequence-reviewer",
  "email-finder"
];

function isLeadMemoryAwareAgent(agent) {
  return LEAD_MEMORY_AWARE_SUFFIXES.some((suffix) => agent.slug.endsWith(suffix));
}

async function buildLeadMemoryBlock(agent) {
  if (!isLeadMemoryAwareAgent(agent)) return "";
  const product = productForAgent(agent);
  let events = [];
  try {
    events = await readMemoryEvents(product);
  } catch {
    return "";
  }
  if (!events.length) return "";

  const leads = await readLeads(product);
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const byLead = {};
  for (const event of events) (byLead[event.lead_id] ||= []).push(event);

  const digests = [];
  for (const [leadId, evs] of Object.entries(byLead)) {
    const lead = byId.get(leadId);
    if (!lead) continue;
    const reduced = reduceLeadMemory(evs);
    const knows = Object.entries(reduced.understanding).map(
      ([key, value]) => `${key}: ${String(value.value).slice(0, 160)}`
    );
    const last = reduced.timeline[reduced.timeline.length - 1];
    const recent = last ? `${last.type}: ${JSON.stringify(last.payload).slice(0, 140)}` : "";
    digests.push({ lead_id: leadId, who: `${lead.name}${lead.company ? ` @ ${lead.company}` : ""}`, stage: lead.stage, knows, recent });
    if (digests.length >= 40) break;
  }
  if (!digests.length) return "";

  return [
    "",
    "Per-lead memory — what we already know and have done with existing leads:",
    "The CRM keeps a durable per-lead memory (interaction timeline + accumulated understanding) separate from the",
    "strategy graph. Build on it — do NOT re-derive persona, pain, routing, or prior touches already recorded here.",
    "Query one lead in full from the project root:",
    `  npm run lead-memory -- find --name "<person name>" --product ${product}`,
    `  npm run lead-memory -- lead --id <lead_id> --product ${product}`,
    "Leads that already have memory:",
    JSON.stringify(digests, null, 2)
  ].join("\n");
}

async function buildPrompt(registry, agent) {
  const instructions = await fs.readFile(fromRoot("agents", agent.slug, "instructions.md"), "utf8");
  const state = await readState();
  const promptState = buildPromptState(state, agent);
  const dependencyStatus = buildDependencyStatus(agent, state);
  const inputFiles = await readInputFiles(agent);
  const messages = filterRelevantMessages(await readMessages(100), agent).slice(-12).map(summarizeMessage);
  const downstreamConsumers = buildDownstreamConsumers(registry, agent);
  const missingDependencies = dependencyStatus
    .filter((dependency) => !dependency.present)
    .map((dependency) => dependency.slug);
  const communicationContext = {
    protocol: "salesv3-json-bus-v1",
    currentAgent: {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      role: agent.role,
      sequence: agent.sequence || null
    },
    commercialTarget: commercialTargetFor(registry, agent),
    upstreamDependencies: dependencyStatus,
    missingDependencies,
    downstreamConsumers,
    requiredBehavior: [
      "Read upstream artifacts from Current shared project state before producing new claims.",
      "If an upstream dependency is missing, return valid JSON and clearly mark the missing dependency in the output contract.",
      "Preserve source discipline: distinguish observed facts, upstream interpretations, and your new interpretation.",
      "For sales lead artifacts, be hyper-specific: exact company, exact public trigger, exact named person, why that person owns or can route the problem, exact workflow/system pain, narrow value proposition, and first bounded slice.",
      "Do not mark a lead send-ready when the only case is broad company fit, senior title, generic C-suite reachability, or a vague category like platform/workflow/operations without a concrete surface.",
      "Return only the output-contract JSON so the runner can publish it to the shared bus."
    ]
  };

  const exclusionBlock = await buildExclusionBlock(agent);
  const multiSearchBlock = buildMultiSearchBlock(agent);
  const commercialStrategyBlock = buildCommercialStrategyBlock(agent);
  const ontologyBlock = await buildOntologyBlock(agent);
  const leadMemoryBlock = await buildLeadMemoryBlock(agent);

  return [
    instructions,
    commercialStrategyBlock,
    multiSearchBlock,
    ontologyBlock,
    leadMemoryBlock,
    "",
    `Current run date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Agent communication protocol context:",
    JSON.stringify(communicationContext, null, 2),
    "",
    "Recent relevant bus messages:",
    JSON.stringify(messages, null, 2),
    "",
    "Declared input files:",
    JSON.stringify(inputFiles, null, 2),
    "",
    "Current shared project state:",
    JSON.stringify(promptState, null, 2),
    exclusionBlock,
    "",
    "Run now. Visit the source URL if needed, then return only the JSON object from the output contract."
  ].join("\n");
}

async function publishDownstreamHandoffs(registry, agent, published) {
  const consumers = buildDownstreamConsumers(registry, agent);
  await Promise.all(
    consumers.map((consumer) => {
      return appendMessage({
        type: "handoff",
        from: agent.id,
        to: consumer.id,
        summary: `${agent.name} artifact ready for ${consumer.name}`,
        payload: {
          protocol: "salesv3-json-bus-v1",
          artifactSlug: agent.slug,
          artifactPath: published.artifactPath,
          artifactKeys: Object.keys(published.artifact || {})
        }
      });
    })
  );
}

function errorText(error) {
  return `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
}

function isCapacityError(error) {
  return /capacity|rate limit|rate-limit|temporarily unavailable|try again|overloaded|429/i.test(errorText(error));
}

function isCapacityText(text) {
  // `\b429\b` (not a bare `429`) so digits inside URLs/ids like ".../jobs/4290673009"
  // don't read as an HTTP 429. Callers must also gate this to short responses:
  // a full JSON artifact can legitimately contain any of these phrases.
  return /selected model is at capacity|model is at capacity|rate limit|rate-limit|temporarily unavailable|try again|overloaded|\b429\b/i.test(String(text || ""));
}

async function runOpenClawAgentOnce(agent, prompt, modelOverride = null) {
  let message = prompt;

  if (prompt.length > MAX_DIRECT_MESSAGE_CHARS) {
    const runInputsDir = fromRoot("data", "run-inputs");
    await fs.mkdir(runInputsDir, { recursive: true });
    const promptPath = fromRoot(
      "data",
      "run-inputs",
      `${agent.slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`
    );
    await fs.writeFile(promptPath, prompt);
    message = [
      `The full run prompt for ${agent.slug} is too large to pass inline.`,
      `Read this file before doing any work: ${promptPath}`,
      "Treat that file as the complete user message, including the agent instructions, shared project state, dependencies, and output contract.",
      "Return only the JSON object required by that full prompt."
    ].join("\n");
  }

  // Fresh session key per run: these agents inject full project state into the
  // prompt every time, so a stable session would accumulate history and blow the
  // model's context window after a few runs. Each run should start clean.
  const args = [
    "agent",
    "--agent",
    agent.id,
    "--session-key",
    `agent:${agent.id}:${Date.now().toString(36)}`,
    "--message",
    message,
    "--json",
    "--timeout",
    String(agent.timeoutSeconds || 900)
  ];
  if (modelOverride) args.push("--model", modelOverride);
  if (agent.thinking) args.push("--thinking", agent.thinking);

  const execOptions = {
    cwd: fromRoot(),
    maxBuffer: 1024 * 1024 * 16
  };

  // api-key runtime: run the embedded agent locally against the OpenAI API
  // directly, bypassing the codex gateway harness, with the key injected.
  if (usesApiKeyRuntime(agent)) {
    args.push("--local");
    execOptions.env = { ...process.env, OPENAI_API_KEY: await resolveOpenAiApiKey() };
  }

  const { stdout } = await execFileAsync("openclaw", args, execOptions);

  const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const responseText = (
    // Gateway runtime nests the assistant turn under `result`.
    result.result?.payloads?.find((payload) => payload.text)?.text ||
    result.result?.finalAssistantVisibleText ||
    result.result?.finalAssistantRawText ||
    // Local api-key runtime (`--local`) returns `{ payloads, meta }` at top level.
    result.payloads?.find((payload) => payload.text)?.text ||
    result.finalAssistantVisibleText ||
    result.finalAssistantRawText ||
    result.output ||
    result.response ||
    result.message
  );

  // A real gateway capacity notice arrives as a short standalone message. A real
  // artifact is a large JSON payload that may contain capacity-like substrings in
  // its content (URLs, ids, prose), so only treat SHORT responses as capacity errors.
  if (responseText && String(responseText).length < 2000 && isCapacityText(responseText)) {
    throw new Error(responseText);
  }

  return responseText;
}

async function runOpenClawAgent(agent, prompt) {
  const models = [agent.model, ...(agent.modelFallbacks || [])].filter(Boolean);
  let lastError = null;

  for (const model of models) {
    try {
      const response = await runOpenClawAgentOnce(agent, prompt, model);
      return { response, modelUsed: model };
    } catch (error) {
      lastError = error;
      if (!isCapacityError(error)) throw error;
      if (model === models[models.length - 1]) break;
      console.warn(`${agent.slug}: ${model} unavailable; retrying with next real model fallback.`);
    }
  }

  throw lastError;
}

// Best-effort: persist the agent's structured output into the shared knowledge
// graph. Never let a graph write break an otherwise successful run.
async function recordToOntology(agent, artifact) {
  try {
    const note = await recordArtifactToOntology(agent, artifact);
    if (note) console.error(`ontology: ${note}`);
  } catch (error) {
    console.error(`ontology: skipped (${error.message})`);
  }
  // Bridge per-person reads into per-lead memory (timeline + understanding).
  try {
    const note = await recordArtifactToLeadMemory(agent, artifact);
    if (note) console.error(`lead-memory: ${note}`);
  } catch (error) {
    console.error(`lead-memory: skipped (${error.message})`);
  }
}

async function runLocalAgent(registry, agent) {
  if (!agent.slug.endsWith("pipeline-capacity")) {
    throw new Error(`No local runner is configured for ${agent.slug}`);
  }

  const { buildPipelineCapacityArtifact } = await import("./pipeline-capacity.js");
  return buildPipelineCapacityArtifact(registry, agent);
}

async function main() {
  const slug = process.argv[2] || "gnk-company-context";
  const { registry, agent } = await findAgent(slug);
  const state = await readState();
  const dependencyStatus = buildDependencyStatus(agent, state);
  const missingDependencies = dependencyStatus.filter((dependency) => !dependency.present);

  await setAgentStatus(agent, "running");
  await appendMessage({
    type: "handoff",
    from: "operator",
    to: agent.id,
    summary: `Run ${agent.name} against ${agent.sourceUrls.join(", ")}`,
    payload: {
      protocol: "salesv3-json-bus-v1",
      sourceUrls: agent.sourceUrls,
      dependsOn: agent.dependsOn || [],
      missingDependencies: missingDependencies.map((dependency) => dependency.slug)
    }
  });

  if (missingDependencies.length > 0) {
    await appendMessage({
      type: "dependency-warning",
      from: "runner",
      to: agent.id,
      summary: `${agent.name} has missing upstream artifacts`,
      payload: {
        protocol: "salesv3-json-bus-v1",
        missingDependencies
      }
    });
  }

  try {
    if (agent.runner === "local") {
      const artifact = await runLocalAgent(registry, agent);
      const published = await publishArtifact(agent, artifact);
      await publishDownstreamHandoffs(registry, agent, published);
      console.log(JSON.stringify(published, null, 2));
      return;
    }

    const prompt = await buildPrompt(registry, agent);
    const runStartedAt = Date.now();
    const { response, modelUsed } = await runOpenClawAgent(agent, prompt);

    if (!response) {
      throw new Error("OpenClaw did not return an assistant payload.");
    }

    const artifact = enforceSourcingReachability(
      agent,
      enforceSequencePolicy(agent, annotateAgentArtifact(
        agent,
        await maybeLoadLargeOutputArtifact(
          agent,
          extractJson(typeof response === "string" ? response : JSON.stringify(response)),
          runStartedAt
        ),
        modelUsed
      ))
    );
    const published = await publishArtifact(agent, artifact);
    await publishDownstreamHandoffs(registry, agent, published);
    await recordToOntology(agent, artifact);
    console.log(JSON.stringify(published, null, 2));
  } catch (error) {
    await setAgentStatus(agent, "failed", { reason: String(error.message).slice(0, 2000) });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
