import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fromRoot } from "./paths.js";

// Project-level knowledge graph shared across every agent in the pipeline.
//
// This is the Node side of the OpenClaw `ontology` skill. The skill's Python CLI
// sandboxes its graph path to the running agent's own workspace, so it cannot by
// itself maintain ONE graph shared across all 32 agents. This module owns the
// authoritative, project-level graph at data/ontology/graph.jsonl using the exact
// same append-only op format the skill reads, so the skill (pointed at the project
// root) and the dashboard/scripts all see the same knowledge graph.
//
// Structural entities (the CRM spine): Company, Person, Deal, Investor,
// Introduction, Conversation.
// Understanding entities (the strategy we've built, besides the raw leads):
// Product (GNK / OutageHub themselves — the graph roots), Segment (ICP / market
// segment), Persona (buyer persona), Offer (service lane / packaged offer),
// Trigger (buying trigger), Insight (strategic lesson from the research agents).
//
// Relations: works_at, buyer_at, has_deal, deal_contact, invested_in,
//            introduced_by, had_conversation, competes_with,
//            has_segment, has_persona, provides_offer, serves_segment,
//            watches_trigger, has_insight, targets_company, in_segment.

export const ONTOLOGY_DIR = fromRoot("data", "ontology");
export const GRAPH_PATH = path.join(ONTOLOGY_DIR, "graph.jsonl");
export const SCHEMA_PATH = path.join(ONTOLOGY_DIR, "schema.yaml");

// Sales-domain schema. Mirrors the shape the skill validates against so
// `python3 ~/.openclaw/skills/ontology/scripts/ontology.py validate` works when
// run from the project root with --graph data/ontology/graph.jsonl.
export const SCHEMA = {
  types: {
    Company: { required: ["name"] },
    Person: { required: ["name"] },
    Deal: {
      required: ["name", "stage"],
      stage_enum: [
        "new",
        "researching",
        "to_contact",
        "contacted",
        "replied",
        "won",
        "lost"
      ]
    },
    Investor: { required: ["name"] },
    Introduction: { required: ["name"] },
    Conversation: { required: ["summary"] },
    Product: { required: ["name"] },
    Segment: { required: ["name"] },
    Persona: { required: ["name"] },
    Offer: { required: ["name"] },
    Trigger: { required: ["name"] },
    Insight: { required: ["name"] },
    Pain: { required: ["name"] },
    Proof: { required: ["name"] },
    Rule: { required: ["name"] },
    Metric: { required: ["name"] }
  },
  relations: {
    works_at: { from_types: ["Person"], to_types: ["Company"], cardinality: "many_to_one" },
    buyer_at: { from_types: ["Person"], to_types: ["Company"] },
    has_deal: { from_types: ["Company"], to_types: ["Deal"] },
    deal_contact: { from_types: ["Deal"], to_types: ["Person"] },
    invested_in: { from_types: ["Investor"], to_types: ["Company"] },
    introduced_by: { from_types: ["Person"], to_types: ["Person", "Introduction"] },
    had_conversation: { from_types: ["Person", "Deal"], to_types: ["Conversation"] },
    competes_with: { from_types: ["Company"], to_types: ["Company"] },
    has_segment: { from_types: ["Product"], to_types: ["Segment"] },
    has_persona: { from_types: ["Product", "Segment"], to_types: ["Persona"] },
    provides_offer: { from_types: ["Product"], to_types: ["Offer"] },
    serves_segment: { from_types: ["Offer"], to_types: ["Segment"] },
    watches_trigger: { from_types: ["Product", "Segment"], to_types: ["Trigger"] },
    has_insight: { from_types: ["Product"], to_types: ["Insight"] },
    targets_company: { from_types: ["Product"], to_types: ["Company"] },
    in_segment: { from_types: ["Company"], to_types: ["Segment"] },
    has_pain: { from_types: ["Segment", "Product"], to_types: ["Pain"] },
    addresses_pain: { from_types: ["Offer"], to_types: ["Pain"] },
    has_proof: { from_types: ["Product", "Offer"], to_types: ["Proof"] },
    has_rule: { from_types: ["Product"], to_types: ["Rule"] },
    has_metric: { from_types: ["Product"], to_types: ["Metric"] },
    learns_from: { from_types: ["Product"], to_types: ["Company"] }
  }
};

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function hash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

// Deterministic ids so re-running backfill / live recording upserts the same
// entity instead of accumulating duplicates. The graph loader keeps the last
// `create` for a given id, so repeated creates behave as upserts.
export function companyId({ product = "gnk", domain, name }) {
  const key = slug(domain) || slug(name);
  return `comp_${hash(`${product}:${key}`)}`;
}

export function personId({ email, name, company, product = "gnk" }) {
  const key = slug(email) || `${slug(name)}|${slug(company)}`;
  return `pers_${hash(`${product}:${key}`)}`;
}

export function dealId({ product = "gnk", company, person }) {
  return `deal_${hash(`${product}:${slug(company)}:${slug(person)}`)}`;
}

export function investorId(name) {
  return `inve_${hash(slug(name))}`;
}

export function conversationId(seed) {
  return `conv_${hash(slug(seed))}`;
}

// The self/product root node every strategic entity hangs off of. Stable per
// product so GNK and OutageHub each have one center for the mindmap.
export function productId(product = "gnk") {
  return `prod_${slug(product)}`;
}

export function segmentId(product, name) {
  return `seg_${hash(`${product}:${slug(name)}`)}`;
}

export function personaId(product, name) {
  return `pers_role_${hash(`${product}:${slug(name)}`)}`;
}

export function offerId(product, name) {
  return `offr_${hash(`${product}:${slug(name)}`)}`;
}

export function triggerId(product, name) {
  return `trig_${hash(`${product}:${slug(name)}`)}`;
}

export function insightId(product, kind, name) {
  return `inst_${hash(`${product}:${slug(kind)}:${slug(name)}`)}`;
}

export function painId(product, name) {
  return `pain_${hash(`${product}:${slug(name)}`)}`;
}

export function proofId(product, name) {
  return `prf_${hash(`${product}:${slug(name)}`)}`;
}

export function ruleId(product, kind, name) {
  return `rule_${hash(`${product}:${slug(kind)}:${slug(name)}`)}`;
}

export function metricId(product, name) {
  return `mtr_${hash(`${product}:${slug(name)}`)}`;
}

function cleanProps(props = {}) {
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    const empty =
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (!empty) out[key] = value;
  }
  return out;
}

export async function ensureOntology() {
  await fs.mkdir(ONTOLOGY_DIR, { recursive: true });
  try {
    await fs.access(SCHEMA_PATH);
  } catch {
    await writeSchemaYaml(SCHEMA);
  }
  try {
    await fs.access(GRAPH_PATH);
  } catch {
    await fs.writeFile(GRAPH_PATH, "");
  }
}

// Minimal YAML emitter for the schema (avoids a YAML dependency in the Node
// side; the shape is simple and fixed).
function toYaml(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => `${pad}- ${JSON.stringify(item)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, val]) => {
        if (val && typeof val === "object") {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: ${JSON.stringify(val)}`;
      })
      .join("\n");
  }
  return `${pad}${JSON.stringify(value)}`;
}

export async function writeSchemaYaml(schema = SCHEMA) {
  await fs.mkdir(ONTOLOGY_DIR, { recursive: true });
  await fs.writeFile(SCHEMA_PATH, `${toYaml(schema)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

export async function appendOp(record) {
  await fs.mkdir(ONTOLOGY_DIR, { recursive: true });
  await fs.appendFile(GRAPH_PATH, `${JSON.stringify(record)}\n`);
}

// Reduce the op log to the current entity/relation state (same semantics as the
// skill's load_graph).
export async function loadGraph() {
  let raw = "";
  try {
    raw = await fs.readFile(GRAPH_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { entities: new Map(), relations: [] };
    throw error;
  }

  const entities = new Map();
  let relations = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    switch (record.op) {
      case "create": {
        entities.set(record.entity.id, record.entity);
        break;
      }
      case "update": {
        const entity = entities.get(record.id);
        if (entity) {
          entity.properties = { ...entity.properties, ...record.properties };
          entity.updated = record.timestamp;
        }
        break;
      }
      case "delete": {
        entities.delete(record.id);
        break;
      }
      case "relate": {
        const exists = relations.some(
          (r) => r.from === record.from && r.rel === record.rel && r.to === record.to
        );
        if (!exists) {
          relations.push({
            from: record.from,
            rel: record.rel,
            to: record.to,
            properties: record.properties || {}
          });
        }
        break;
      }
      case "unrelate": {
        relations = relations.filter(
          (r) => !(r.from === record.from && r.rel === record.rel && r.to === record.to)
        );
        break;
      }
      default:
        break;
    }
  }

  return { entities, relations };
}

// Upsert: append a create for a fixed id (last write wins on load). Merges
// against the current in-memory graph so we only carry non-empty props forward.
export async function upsertEntity(graph, { id, type, properties }) {
  const props = cleanProps(properties);
  const existing = graph.entities.get(id);
  const timestamp = nowIso();
  const merged = existing ? { ...existing.properties, ...props } : props;
  const entity = {
    id,
    type,
    properties: merged,
    created: existing?.created || timestamp,
    updated: timestamp
  };
  graph.entities.set(id, entity);
  await appendOp({ op: "create", entity, timestamp });
  return entity;
}

export async function relate(graph, from, rel, to, properties = {}) {
  if (!from || !to) return;
  const exists = graph.relations.some((r) => r.from === from && r.rel === rel && r.to === to);
  if (exists) return;
  graph.relations.push({ from, rel, to, properties });
  await appendOp({ op: "relate", from, rel, to, properties, timestamp: nowIso() });
}

// Rewrite the whole graph from a fresh op list (used by backfill, which rebuilds
// derived data rather than growing the append log forever).
export async function rebuildGraph(ops) {
  await fs.mkdir(ONTOLOGY_DIR, { recursive: true });
  const body = ops.map((op) => JSON.stringify(op)).join("\n");
  await fs.writeFile(GRAPH_PATH, body ? `${body}\n` : "");
}

export function queryEntities(graph, { type, where = {} } = {}) {
  const results = [];
  for (const entity of graph.entities.values()) {
    if (type && entity.type !== type) continue;
    let match = true;
    for (const [key, value] of Object.entries(where)) {
      if (entity.properties?.[key] !== value) {
        match = false;
        break;
      }
    }
    if (match) results.push(entity);
  }
  return results;
}

export function getRelated(graph, id, rel = null, direction = "outgoing") {
  const results = [];
  for (const r of graph.relations) {
    const outgoing = r.from === id;
    const incoming = r.to === id;
    if (direction === "outgoing" && !outgoing) continue;
    if (direction === "incoming" && !incoming) continue;
    if (direction === "both" && !outgoing && !incoming) continue;
    if (rel && r.rel !== rel) continue;
    const otherId = outgoing ? r.to : r.from;
    const other = graph.entities.get(otherId);
    if (other) results.push({ relation: r.rel, direction: outgoing ? "outgoing" : "incoming", entity: other });
  }
  return results;
}

// Relative visual weight per type — drives node size in the 3D view so the
// product root and the structural spine read as the center of the mindmap.
const TYPE_WEIGHT = {
  Product: 26,
  Segment: 10,
  Offer: 8,
  Persona: 7,
  Pain: 6,
  Company: 6,
  Investor: 6,
  Trigger: 5,
  Proof: 5,
  Metric: 5,
  Rule: 4,
  Insight: 4,
  Deal: 3,
  Person: 3,
  Introduction: 3,
  Conversation: 2
};

function nodeLabel(entity) {
  const p = entity.properties || {};
  const base = p.name || p.summary || entity.id;
  return String(base).length > 90 ? `${String(base).slice(0, 87)}…` : String(base);
}

function entityProduct(entity) {
  const p = entity.properties || {};
  if (p.product) return p.product;
  return null;
}

// Project the reduced graph into a { nodes, links } view for the 3D frontend.
// When `product` is set, only that product's subgraph (plus its Product root and
// any relations that stay inside the set) is returned.
export function toGraphView(graph, product = null) {
  const keep = new Set();
  const rootId = product ? productId(product) : null;

  for (const entity of graph.entities.values()) {
    if (!product) {
      keep.add(entity.id);
      continue;
    }
    if (entity.id === rootId) {
      keep.add(entity.id);
      continue;
    }
    if (entityProduct(entity) === product) keep.add(entity.id);
  }

  // Second pass: pull in relation endpoints (e.g. product-less Conversations or
  // Introductions) that connect two already-kept entities, so nothing dangles.
  for (const r of graph.relations) {
    if (keep.has(r.from) && graph.entities.has(r.to)) keep.add(r.to);
    if (keep.has(r.to) && graph.entities.has(r.from)) keep.add(r.from);
  }

  const nodes = [];
  for (const id of keep) {
    const entity = graph.entities.get(id);
    if (!entity) continue;
    nodes.push({
      id: entity.id,
      type: entity.type,
      label: nodeLabel(entity),
      val: TYPE_WEIGHT[entity.type] || 3,
      product: entityProduct(entity),
      properties: entity.properties || {}
    });
  }

  const links = [];
  for (const r of graph.relations) {
    if (keep.has(r.from) && keep.has(r.to)) {
      links.push({ source: r.from, target: r.to, rel: r.rel });
    }
  }

  const byType = {};
  for (const node of nodes) byType[node.type] = (byType[node.type] || 0) + 1;

  return {
    product,
    nodes,
    links,
    meta: { nodes: nodes.length, links: links.length, byType }
  };
}

export function graphSummary(graph) {
  const byType = {};
  for (const entity of graph.entities.values()) {
    byType[entity.type] = (byType[entity.type] || 0) + 1;
  }
  const byRel = {};
  for (const r of graph.relations) {
    byRel[r.rel] = (byRel[r.rel] || 0) + 1;
  }
  return {
    entities: graph.entities.size,
    relations: graph.relations.length,
    byType,
    byRel
  };
}
