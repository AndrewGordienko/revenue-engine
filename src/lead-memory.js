import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fromRoot } from "./paths.js";

// Per-lead memory: a durable, append-only event log — separate from the knowledge
// graph (which deliberately excludes the raw lead pipeline). Each lead accumulates
// an interaction timeline (sends, replies, stage changes, meetings, notes) and a
// growing "what we know" understanding that agents read before acting and add to
// after research, so nothing is re-derived each run.
//
// Same robust shape as the ontology graph: one JSONL file per product, one event
// per line, reduced to state on read. Never rewritten in place, so history stays.

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : "gnk";
}

function memoryPath(product = "gnk") {
  const root = process.env.LEAD_MEMORY_DIR || fromRoot("data");
  return path.join(root, `lead-memory-${normalizeProduct(product)}.jsonl`);
}

// note        — free text (operator)
// stage_change— funnel move { from, to }
// email_sent  — { touch_number, subject, angle, channel }
// reply       — inbound { sentiment, summary, text }
// meeting     — { summary, when }
// understanding — accumulating knowledge { key, value, confidence } (latest wins)
// research    — { summary, findings, source }
// outcome     — learning signal { result, angle, subject, segment }
export const MEMORY_EVENT_TYPES = [
  "note",
  "stage_change",
  "email_sent",
  "reply",
  "meeting",
  "understanding",
  "research",
  "outcome"
];

// Understanding keys that carry forward as the lead's living profile. Free-form
// keys are allowed too; these just get first-class treatment in the UI order.
export const UNDERSTANDING_KEYS = [
  "persona",
  "pain_confirmed",
  "objection",
  "routing",
  "timing",
  "interest",
  "next_step"
];

function newId() {
  return `mem_${crypto.randomBytes(6).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

export async function appendMemory(product, event) {
  const record = {
    id: event.id || newId(),
    lead_id: event.lead_id,
    type: event.type,
    at: event.at || nowIso(),
    actor: event.actor || "system",
    payload: event.payload || {}
  };
  if (!record.lead_id) throw new Error("lead-memory event needs lead_id");
  if (!MEMORY_EVENT_TYPES.includes(record.type)) {
    throw new Error(`lead-memory event has unknown type: ${record.type}`);
  }
  const file = memoryPath(product);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(record)}\n`);
  return record;
}

export async function readMemoryEvents(product, leadId = null) {
  let raw = "";
  try {
    raw = await fs.readFile(memoryPath(product), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (!leadId || record.lead_id === leadId) out.push(record);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

// Reduce a lead's events into a timeline + current understanding + outcomes.
export function reduceLeadMemory(events) {
  const timeline = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const understanding = {};
  const outcomes = [];
  const counts = {};
  for (const event of timeline) {
    counts[event.type] = (counts[event.type] || 0) + 1;
    if (event.type === "understanding" && event.payload?.key) {
      // Latest write wins; keep the history in the timeline.
      understanding[event.payload.key] = {
        value: event.payload.value,
        confidence: event.payload.confidence || null,
        source: event.actor,
        at: event.at
      };
    }
    if (event.type === "outcome" || event.type === "reply") outcomes.push(event);
  }
  return {
    timeline,
    understanding,
    outcomes,
    counts,
    total: timeline.length,
    lastAt: timeline.length ? timeline[timeline.length - 1].at : null
  };
}

export async function leadMemory(product, leadId) {
  return reduceLeadMemory(await readMemoryEvents(product, leadId));
}

// leadId -> { total, lastAt, counts } for list badges.
export async function memorySummary(product) {
  const events = await readMemoryEvents(product);
  const byLead = {};
  for (const event of events) {
    (byLead[event.lead_id] ||= []).push(event);
  }
  const out = {};
  for (const [leadId, evs] of Object.entries(byLead)) {
    const reduced = reduceLeadMemory(evs);
    out[leadId] = { total: reduced.total, lastAt: reduced.lastAt, counts: reduced.counts };
  }
  return out;
}

// Convenience: record an understanding fact (used by agents + the API).
export async function rememberUnderstanding(product, leadId, key, value, opts = {}) {
  if (!value) return null;
  return appendMemory(product, {
    lead_id: leadId,
    type: "understanding",
    actor: opts.actor || "system",
    payload: { key, value, confidence: opts.confidence || null }
  });
}
