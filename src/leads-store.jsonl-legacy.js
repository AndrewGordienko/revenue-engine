import fs from "node:fs/promises";
import path from "node:path";
import { fromRoot } from "./paths.js";
import { appendMemory } from "./lead-memory.js";

// Mirror CRM funnel actions into the lead's memory timeline. Best-effort: memory
// must never break a lead write.
async function safeMemory(product, event) {
  try {
    await appendMemory(product, event);
  } catch {
    // ignore — memory is a side channel
  }
}

const legacyLeadsPath = fromRoot("data", "leads.jsonl");

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : value === "morrow" ? "morrow" : "gnk";
}

function leadsPath(product = "gnk") {
  return fromRoot("data", `leads-${normalizeProduct(product)}.jsonl`);
}

export const LEAD_STAGES = [
  "new",
  "researching",
  "to_contact",
  "contacted",
  "replied",
  "won",
  "lost"
];

export const CONTRACT_BUCKETS = [
  "short_term",
  "medium_term",
  "long_term"
];

// Fields we let an ingest/enrichment pass overwrite. Stage, notes, id and
// created_at are owned by the CRM and never clobbered by a re-run.
const MERGEABLE_FIELDS = [
  "name",
  "title",
  "company",
  "company_domain",
  "linkedin_or_source",
  "source_url",
  "email_best",
  "email_candidates",
  "email_pattern",
  "email_status",
  "segment",
  "fit_score",
  "trigger_event",
  "why_now",
  "lit_up_case",
  "why_this_person",
  "owner_hypothesis",
  "likely_current_pain",
  "first_contract_slice",
  "reply_path",
  "contact_route",
  "outreach_angle",
  "source_agent",
  "verified",
  "confidence",
  "contract_bucket",
  "contract_bucket_reason",
  "email_subject",
  "email_body",
  "product",
  "persona_vibe",
  "culture_context",
  "mindset",
  "communication_style",
  "perspective",
  "decision_style",
  "tone_guidance",
  "persona_avoid",
  "persona_confidence"
];

function inferContractBucket(input = {}) {
  const fit = Number(input.fit_score) || 0;
  const title = slug(input.title);
  const text = slug(`${input.segment} ${input.trigger_event} ${input.outreach_angle}`);
  const hasEmail = Boolean(input.email_best);
  const isDecisionMaker = /\b(ceo|founder|co-founder|cto|chief|vp|head|president|coo|cio)\b/.test(title);
  const isEvaluator = /\b(engineer|manager|marketing|scientist|lead)\b/.test(title) && !isDecisionMaker;
  const urgentTrigger = /\b(incident|outage|hiring|posted|active|senior|staff|backend|platform|integration|modernization|funding|series|launch|appointed|acquisition|compliance|risk)\b/.test(text);
  const isOutageHub = normalizeProduct(input.product) === "outagehub";
  const isBroadExecutive = /\b(ceo|chief|president|board|executive)\b/.test(title);

  if (isOutageHub && isBroadExecutive) return "long_term";

  if (fit >= 5 && hasEmail && isDecisionMaker && urgentTrigger) return "short_term";
  if (fit >= 5 && isDecisionMaker && urgentTrigger) return "medium_term";
  if (fit >= 4 && (isDecisionMaker || urgentTrigger)) return "medium_term";
  if (hasEmail && isDecisionMaker && urgentTrigger) return "medium_term";
  if (isEvaluator || !hasEmail || fit < 4) return "long_term";
  return "medium_term";
}

function defaultBucketReason(lead = {}) {
  const bucket = lead.contract_bucket || inferContractBucket(lead);
  if (normalizeProduct(lead.product) === "outagehub" && /\b(ceo|chief|president|board|executive)\b/i.test(lead.title || "")) {
    return "Named executive/router only; find the manager, director, or lead who owns the outage-sensitive workflow before treating this as send-ready.";
  }
  if (bucket === "short_term") return "High-fit decision maker with a current trigger and direct email.";
  if (bucket === "medium_term") return "Credible fit, but needs more warming, routing, or timing before a fast close.";
  return "Keep warm or use as a router/evaluator while stronger buying paths develop.";
}

function sentence(value) {
  return String(value || "").replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");
}

function inferLitUpCase(lead = {}) {
  const person = sentence(`${lead.name || "This contact"}${lead.title ? `, ${lead.title}` : ""}`);
  const company = sentence(lead.company);
  const trigger = sentence(lead.why_now || lead.trigger_event);
  const relevance = sentence(lead.why_this_person || lead.owner_hypothesis);
  const pain = sentence(lead.likely_current_pain);
  const slice = sentence(lead.first_contract_slice);
  if (!company || (!trigger && !relevance && !pain && !slice)) return "";

  const parts = [trigger ? `At ${company}, ${person} is relevant now because ${trigger}` : `${person} at ${company}`];
  if (relevance) parts.push(`Person fit: ${relevance}`);
  if (pain) parts.push(`Likely pressure: ${pain}`);
  if (slice) parts.push(`First slice: ${slice}`);
  return parts.join(". ");
}

function normalizeLead(lead = {}) {
  const contract_bucket = CONTRACT_BUCKETS.includes(lead.contract_bucket)
    ? lead.contract_bucket
    : inferContractBucket(lead);
  return {
    ...lead,
    lit_up_case: lead.lit_up_case || inferLitUpCase(lead),
    contract_bucket,
    contract_bucket_reason: lead.contract_bucket_reason || defaultBucketReason({ ...lead, contract_bucket })
  };
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Dedupe key: prefer a real email, else name + company.
export function leadKey(lead) {
  const nameCompany = `nc:${slug(lead.name)}|${slug(lead.company)}`;
  if (slug(lead.name) || slug(lead.company)) return nameCompany;
  const email = slug(lead.email_best);
  if (email) return `email:${email}`;
  return nameCompany;
}

function newId() {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeLead(input = {}) {
  const now = new Date().toISOString();
  const lead = {
    id: newId(),
    name: input.name || "",
    title: input.title || "",
    company: input.company || "",
    company_domain: input.company_domain || "",
    linkedin_or_source: input.linkedin_or_source || "",
    source_url: input.source_url || "",
    email_best: input.email_best || "",
    email_candidates: input.email_candidates || [],
    email_pattern: input.email_pattern || "",
    email_status: input.email_status || "unknown", // found | inferred | guessed | unknown
    segment: input.segment || "",
    fit_score: input.fit_score ?? "",
    trigger_event: input.trigger_event || "",
    why_now: input.why_now || "",
    lit_up_case: input.lit_up_case || inferLitUpCase(input),
    why_this_person: input.why_this_person || "",
    owner_hypothesis: input.owner_hypothesis || "",
    likely_current_pain: input.likely_current_pain || "",
    first_contract_slice: input.first_contract_slice || "",
    reply_path: input.reply_path || "",
    contact_route: input.contact_route || "",
    outreach_angle: input.outreach_angle || "",
    stage: input.stage || "new",
    notes: input.notes || [],
    verified: input.verified ?? false,
    confidence: input.confidence || "",
    contract_bucket: input.contract_bucket || "",
    contract_bucket_reason: input.contract_bucket_reason || "",
    source_agent: input.source_agent || "",
    email_subject: input.email_subject || "",
    email_body: input.email_body || "",
    persona_vibe: input.persona_vibe || "",
    culture_context: input.culture_context || "",
    mindset: input.mindset || "",
    communication_style: input.communication_style || "",
    perspective: input.perspective || "",
    decision_style: input.decision_style || "",
    tone_guidance: input.tone_guidance || "",
    persona_avoid: input.persona_avoid || "",
    persona_confidence: input.persona_confidence || "",
    product: normalizeProduct(input.product),
    created_at: now,
    updated_at: now
  };
  return normalizeLead(lead);
}

export async function readLeads(product = "gnk") {
  const filePath = leadsPath(product);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => normalizeLead({ ...JSON.parse(line), product: normalizeProduct(product) }));
  } catch (error) {
    if (error.code === "ENOENT") {
      if (normalizeProduct(product) === "gnk") {
        try {
          const raw = await fs.readFile(legacyLeadsPath, "utf8");
          return raw
            .split("\n")
            .filter(Boolean)
            .map((line) => normalizeLead({ ...JSON.parse(line), product: "gnk" }));
        } catch (legacyError) {
          if (legacyError.code === "ENOENT") return [];
          throw legacyError;
        }
      }
      return [];
    }
    throw error;
  }
}

async function writeLeads(leads, product = "gnk") {
  const filePath = leadsPath(product);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = leads.map((lead) => JSON.stringify(lead)).join("\n");
  await fs.writeFile(filePath, body ? `${body}\n` : "");
}

// Merge incoming records into the store, deduping by leadKey. Returns counts.
export async function upsertLeads(incoming = [], product = "gnk") {
  const normalizedProduct = normalizeProduct(product);
  const existing = await readLeads(normalizedProduct);
  const byKey = new Map(existing.map((lead) => [leadKey(lead), lead]));
  let added = 0;
  let updated = 0;

  for (const raw of incoming) {
    const candidate = makeLead({ ...raw, product: normalizedProduct });
    const key = leadKey(candidate);
    const prior = byKey.get(key);

    if (!prior) {
      byKey.set(key, candidate);
      added += 1;
      continue;
    }

    const merged = { ...prior };
    for (const field of MERGEABLE_FIELDS) {
      const value = candidate[field];
      const isEmpty =
        value == null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (!isEmpty) merged[field] = value;
    }
    merged.updated_at = new Date().toISOString();
    byKey.set(key, merged);
    updated += 1;
  }

  const next = [...byKey.values()];
  await writeLeads(next, normalizedProduct);
  return { added, updated, total: next.length };
}

export async function updateLead(id, patch = {}, product = "gnk") {
  const normalizedProduct = normalizeProduct(product);
  const leads = await readLeads(normalizedProduct);
  const idx = leads.findIndex((lead) => lead.id === id);
  if (idx === -1) throw new Error(`Unknown lead: ${id}`);

  const lead = leads[idx];
  const priorStage = lead.stage;
  if (patch.stage && LEAD_STAGES.includes(patch.stage)) lead.stage = patch.stage;
  if (patch.contract_bucket && CONTRACT_BUCKETS.includes(patch.contract_bucket)) {
    lead.contract_bucket = patch.contract_bucket;
  }
  if (typeof patch.note === "string" && patch.note.trim()) {
    lead.notes = [...(lead.notes || []), { at: new Date().toISOString(), text: patch.note.trim() }];
    await safeMemory(normalizedProduct, {
      lead_id: id,
      type: "note",
      actor: patch.actor || "operator",
      payload: { text: patch.note.trim() }
    });
  }
  if (patch.stage && LEAD_STAGES.includes(patch.stage) && patch.stage !== priorStage) {
    await safeMemory(normalizedProduct, {
      lead_id: id,
      type: "stage_change",
      actor: patch.actor || "operator",
      payload: { from: priorStage, to: patch.stage }
    });
  }
  for (const field of MERGEABLE_FIELDS) {
    if (field in patch) lead[field] = patch[field];
  }
  lead.updated_at = new Date().toISOString();

  leads[idx] = lead;
  await writeLeads(leads, normalizedProduct);
  return lead;
}

export async function leadStats(inputLeads = null, product = "gnk") {
  const leads = inputLeads || (await readLeads(product));
  const byStage = Object.fromEntries(LEAD_STAGES.map((stage) => [stage, 0]));
  const byBucket = Object.fromEntries(CONTRACT_BUCKETS.map((bucket) => [bucket, 0]));
  const byEmail = { found: 0, inferred: 0, guessed: 0, unknown: 0 };
  for (const lead of leads) {
    if (lead.stage in byStage) byStage[lead.stage] += 1;
    if (lead.contract_bucket in byBucket) byBucket[lead.contract_bucket] += 1;
    if (lead.email_status in byEmail) byEmail[lead.email_status] += 1;
  }
  return {
    total: leads.length,
    with_email: leads.filter((lead) => lead.email_best).length,
    byStage,
    byBucket,
    byEmail
  };
}

export function leadsToCsv(leads) {
  const cols = [
    "name",
    "title",
    "company",
    "company_domain",
    "email_best",
    "email_status",
    "email_candidates",
    "segment",
    "fit_score",
    "trigger_event",
    "why_now",
    "lit_up_case",
    "why_this_person",
    "owner_hypothesis",
    "likely_current_pain",
    "first_contract_slice",
    "reply_path",
    "contact_route",
    "outreach_angle",
    "contract_bucket",
    "contract_bucket_reason",
    "persona_vibe",
    "culture_context",
    "mindset",
    "communication_style",
    "perspective",
    "decision_style",
    "tone_guidance",
    "stage",
    "email_subject",
    "email_body",
    "source_url"
  ];
  const escape = (value) => {
    const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = cols.join(",");
  const rows = leads.map((lead) => cols.map((col) => escape(lead[col])).join(","));
  return [header, ...rows].join("\n");
}
