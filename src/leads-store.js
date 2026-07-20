// leads-store.js — SQLite-backed. Preserves the historical API (readLeads,
// upsertLeads, updateLead, leadStats, leadsToCsv, makeLead, leadKey) so the
// dashboard and every script are repointed at the canonical crm.db at once.
// Writes route through the gated model in crm-model.js; the legacy JSONL files
// are read-only and no longer a source of truth.
import { db, tx } from "./db.js";
import {
  identity, getLead, rowToLead, sendEligibility, recordEvent, setStage,
  STAGES, ALLOWED_TRANSITIONS, STAGE_REQUIRES_EVENT,
} from "./crm-model.js";
import { appendMemory } from "./lead-memory.js";
import { STRATEGY_VERSION } from "./sales-plays.js";
import { completePipelineRun, createPipelineLineage } from "./lineage.js";

async function safeMemory(product, event) {
  try { await appendMemory(product, event); } catch { /* side channel */ }
}

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : value === "morrow" ? "morrow" : "gnk";
}

// Legacy stage vocabulary the dashboard UI still speaks.
export const LEAD_STAGES = ["new", "researching", "to_contact", "contacted", "replied", "won", "lost"];
export const CONTRACT_BUCKETS = ["short_term", "medium_term", "long_term"];

// canonical prospect stage -> legacy dashboard vocabulary (display + writes).
const CANON_TO_LEGACY = {
  target: "new", researched: "researching", route_ready: "to_contact",
  enrolled: "contacted", engaged: "replied", disqualified: "lost",
  nurture: "new", contact_evidence_missing: "contacted",
};

const now = () => new Date().toISOString();
const slug = (v) => String(v || "").toLowerCase().trim().replace(/\s+/g, " ");

// ---- lead-shape helpers (kept from the JSONL implementation) ----------------
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
function sentence(v) { return String(v || "").replace(/\s+/g, " ").trim().replace(/[.。]+$/, ""); }
function inferLitUpCase(lead = {}) {
  const person = sentence(`${lead.name || "This contact"}${lead.title ? `, ${lead.title}` : ""}`);
  const company = sentence(lead.company);
  const trigger = sentence(lead.why_now || lead.trigger_event);
  const relevance = sentence(lead.why_this_person || lead.owner_hypothesis);
  const pain = sentence(lead.likely_current_pain);
  const sliceV = sentence(lead.first_contract_slice);
  if (!company || (!trigger && !relevance && !pain && !sliceV)) return "";
  const parts = [trigger ? `At ${company}, ${person} is relevant now because ${trigger}` : `${person} at ${company}`];
  if (relevance) parts.push(`Person fit: ${relevance}`);
  if (pain) parts.push(`Likely pressure: ${pain}`);
  if (sliceV) parts.push(`First slice: ${sliceV}`);
  return parts.join(". ");
}
function defaultBucketReason(lead = {}) {
  const bucket = lead.contract_bucket || inferContractBucket(lead);
  if (normalizeProduct(lead.product) === "outagehub" && /\b(ceo|chief|president|board|executive)\b/i.test(lead.title || ""))
    return "Named executive/router only; find the manager, director, or lead who owns the outage-sensitive workflow before treating this as send-ready.";
  if (bucket === "short_term") return "High-fit decision maker with a current trigger and direct email.";
  if (bucket === "medium_term") return "Credible fit, but needs more warming, routing, or timing before a fast close.";
  return "Keep warm or use as a router/evaluator while stronger buying paths develop.";
}
function normalizeLead(lead = {}) {
  const contract_bucket = CONTRACT_BUCKETS.includes(lead.contract_bucket) ? lead.contract_bucket : inferContractBucket(lead);
  return { ...lead, lit_up_case: lead.lit_up_case || inferLitUpCase(lead), contract_bucket, contract_bucket_reason: lead.contract_bucket_reason || defaultBucketReason({ ...lead, contract_bucket }) };
}

export function leadKey(lead) {
  const nameCompany = `nc:${slug(lead.name)}|${slug(lead.company)}`;
  if (slug(lead.name) || slug(lead.company)) return nameCompany;
  const email = slug(lead.email_best);
  return email ? `email:${email}` : nameCompany;
}

// makeLead returns the legacy in-memory shape (used by callers pre-insert).
export function makeLead(input = {}) {
  const t = now();
  const lead = {
    id: `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name || "", title: input.title || "", company: input.company || "",
    company_domain: input.company_domain || "", linkedin_or_source: input.linkedin_or_source || "",
    source_url: input.source_url || "", email_best: input.email_best || "",
    email_candidates: input.email_candidates || [], email_pattern: input.email_pattern || "",
    email_status: input.email_status || "unknown", segment: input.segment || "", fit_score: input.fit_score ?? "",
    trigger_event: input.trigger_event || "", why_now: input.why_now || "",
    lit_up_case: input.lit_up_case || inferLitUpCase(input), why_this_person: input.why_this_person || "",
    owner_hypothesis: input.owner_hypothesis || "", likely_current_pain: input.likely_current_pain || "",
    first_contract_slice: input.first_contract_slice || "", reply_path: input.reply_path || "",
    contact_route: input.contact_route || "", outreach_angle: input.outreach_angle || "",
    stage: input.stage || "new", notes: input.notes || [], verified: input.verified ?? false,
    confidence: input.confidence || "", contract_bucket: input.contract_bucket || "",
    contract_bucket_reason: input.contract_bucket_reason || "", source_agent: input.source_agent || "",
    email_subject: input.email_subject || "", email_body: input.email_body || "",
    persona_vibe: input.persona_vibe || "", culture_context: input.culture_context || "",
    mindset: input.mindset || "", communication_style: input.communication_style || "",
    perspective: input.perspective || "", decision_style: input.decision_style || "",
    tone_guidance: input.tone_guidance || "", persona_avoid: input.persona_avoid || "",
    persona_confidence: input.persona_confidence || "", product: normalizeProduct(input.product),
    created_at: t, updated_at: t,
  };
  return normalizeLead(lead);
}

// ---- DB row -> legacy-shaped lead object the dashboard expects --------------
const CONTROL_OUT = [
  "cohort_id", "pipeline_run_id", "strategy_version", "identity_key", "identity_confidence",
  "address_found_or_guessed", "email_source_type", "email_source_url", "deliverability_status",
  "deliverability_checked_at", "recipient_jurisdiction", "legal_basis", "needs_review",
  "play_id", "score", "score_breakdown",
];
function rowToLegacy(d, row) {
  const lead = rowToLead(row);
  const research = lead.research || {};
  const el = sendEligibility(d, lead);
  const out = {
    ...research,
    id: lead.id, product: lead.product,
    name: lead.name || "", title: lead.title || "", company: lead.company || "",
    company_domain: lead.company_domain || "", email_best: lead.email_best || "",
    email_status: lead.email_status || "unknown",
    linkedin_or_source: lead.linkedin_url || research.linkedin_or_source || "",
    source_url: lead.email_source_url || research.source_url || "",
    verified: lead.address_found_or_guessed === "verified",
    stage: CANON_TO_LEGACY[lead.stage] || "new", // dashboard vocabulary
    crm_stage: lead.stage, // canonical truth
    notes: research.notes || [],
    // control/compliance surface (new columns the UI can start showing)
    suppressed: lead.suppressed, send_blocked: !el.ok, blocked_reasons: el.blocked,
    review_reasons: lead.review_reasons || [],
    created_at: lead.created_at, updated_at: lead.updated_at,
  };
  for (const c of CONTROL_OUT) out[c] = lead[c];
  return normalizeLead(out);
}

export async function readLeads(product = "gnk") {
  const d = db();
  const rows = d.prepare("SELECT * FROM leads WHERE product=? ORDER BY created_at").all(normalizeProduct(product));
  return rows.map((r) => rowToLegacy(d, r));
}

// ---- writes ----------------------------------------------------------------
const MERGEABLE = [
  "name", "title", "company", "company_domain", "email_status", "email_candidates", "email_pattern",
  "segment", "fit_score", "trigger_event", "why_now", "lit_up_case", "why_this_person", "owner_hypothesis",
  "likely_current_pain", "first_contract_slice", "reply_path", "contact_route", "outreach_angle",
  "source_agent", "confidence", "contract_bucket", "contract_bucket_reason", "email_subject", "email_body",
  "persona_vibe", "culture_context", "mindset", "communication_style", "perspective", "decision_style",
  "tone_guidance", "persona_avoid", "persona_confidence", "notes",
];

function insertLead(d, lead, extra) {
  const id = lead.id || `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ident = identity({ ...lead, id });
  const research = {};
  for (const f of MERGEABLE) if (lead[f] != null && lead[f] !== "") research[f] = lead[f];
  research.source_url = lead.source_url || null;
  const t = now();
  d.prepare(`INSERT INTO leads
    (id,product,cohort_id,pipeline_run_id,strategy_version,company,company_domain,name,title,linkedin_url,
     identity_key,identity_confidence,email_best,email_status,address_found_or_guessed,email_source_type,email_source_url,
     deliverability_status,deliverability_checked_at,recipient_jurisdiction,legal_basis,legal_basis_evidence,role_relevance_note,stage,needs_review,review_reasons,source_stores,research,created_at,updated_at)
    VALUES (@id,@product,@cohort_id,@pipeline_run_id,@strategy_version,@company,@company_domain,@name,@title,@linkedin_url,
     @identity_key,@identity_confidence,@email_best,@email_status,@address_found_or_guessed,@email_source_type,@email_source_url,
     @deliverability_status,@deliverability_checked_at,@recipient_jurisdiction,@legal_basis,@legal_basis_evidence,@role,'target',@needs_review,'[]',@source_stores,@research,@t,@t)`).run({
    id, product: normalizeProduct(lead.product), cohort_id: extra.cohort_id, pipeline_run_id: extra.pipeline_run_id,
    strategy_version: extra.strategy_version, company: lead.company || null, company_domain: lead.company_domain || null,
    name: lead.name || null, title: lead.title || null,
    linkedin_url: /linkedin\.com\/in\//i.test(lead.linkedin_or_source || "") ? lead.linkedin_or_source : null,
    identity_key: ident.key, identity_confidence: ident.confidence, email_best: lead.email_best || null,
    email_status: lead.email_status || "unknown",
    address_found_or_guessed: lead.address_found_or_guessed || (lead.email_best ? (lead.verified ? "verified" : "guessed") : null),
    email_source_type: lead.email_source_type || (lead.email_best ? (lead.verified ? "verified" : "guessed_pattern") : null),
    email_source_url: lead.email_source_url || lead.source_url || null,
    deliverability_status: lead.deliverability_status || "unchecked",
    deliverability_checked_at: lead.deliverability_checked_at || null,
    recipient_jurisdiction: lead.recipient_jurisdiction || extra.jurisdiction,
    legal_basis: lead.legal_basis || null,
    legal_basis_evidence: lead.legal_basis_evidence
      ? (typeof lead.legal_basis_evidence === "string" ? lead.legal_basis_evidence : JSON.stringify(lead.legal_basis_evidence))
      : null,
    role: lead.why_this_person || null, needs_review: extra.needs_review ? 1 : 0,
    source_stores: JSON.stringify([extra.source_store || "ingest"]), research: JSON.stringify(research), t,
  });
  if (extra.play_id) d.prepare("UPDATE leads SET play_id=? WHERE id=?").run(extra.play_id, id);
  return id;
}

// Ingest/enrichment: strong-identity match updates in place; otherwise inserts a
// new lead (weak matches are NOT auto-merged — flagged for review). Lineage is
// always non-null and product/strategy specific. New cohorts remain draft until
// an operator approves one exact sales play and its targeting rules.
export async function upsertLeads(incoming = [], product = "gnk", options = {}) {
  const d = db();
  const p = normalizeProduct(product);
  const lineage = createPipelineLineage(d, {
    product: p,
    play_id: options.play_id || null,
    cohort_id: options.cohort_id || null,
    pipeline_run_id: options.pipeline_run_id || null,
    strategy_version: options.strategy_version || STRATEGY_VERSION,
    stage: options.stage || "ingest",
    note: options.note || `${p} leads awaiting cohort approval`,
    metadata: { incoming_count: incoming.length, source_store: options.source_store || "ingest" },
  });
  let added = 0, updated = 0;
  try {
    tx((database) => {
      for (const raw of incoming) {
        const lead = { ...raw, product: p };
        const ident = identity({ ...lead, id: lead.id || "x" });
        const jur = jurisdictionFor(lead, p);
        let match = null;
        if (ident.confidence === "strong")
          match = database.prepare("SELECT id FROM leads WHERE identity_key=? AND product=?").get(ident.key, p);
        if (match) {
          const cur = getLead(database, match.id);
          const research = { ...(cur.research || {}) };
          for (const f of MERGEABLE) if (lead[f] != null && lead[f] !== "") research[f] = lead[f];
          applyCanonicalEmailPatch(database, cur, lead);
          database.prepare("UPDATE leads SET research=@research, updated_at=@t WHERE id=@id")
            .run({ research: JSON.stringify(research), t: now(), id: match.id });
          updated++;
        } else {
          const needs_review = ident.confidence === "weak" || !lineage.play_id;
          insertLead(database, lead, { ...lineage, jurisdiction: jur, needs_review, source_store: options.source_store || "ingest" });
          added++;
        }
      }
    });
    completePipelineRun(d, lineage.pipeline_run_id, "complete");
  } catch (error) {
    completePipelineRun(d, lineage.pipeline_run_id, "failed");
    throw error;
  }
  return { added, updated, total: d.prepare("SELECT COUNT(*) n FROM leads WHERE product=?").get(p).n, ...lineage };
}

const CANONICAL_EMAIL_FIELDS = [
  "email_best", "email_status", "address_found_or_guessed", "email_source_type", "email_source_url",
  "deliverability_status", "deliverability_checked_at", "recipient_jurisdiction", "legal_basis",
  "legal_basis_evidence", "role_relevance_note",
];

function applyCanonicalEmailPatch(database, current, patch) {
  const values = {};
  for (const field of CANONICAL_EMAIL_FIELDS) {
    if (!(field in patch)) continue;
    values[field] = field === "legal_basis_evidence" && typeof patch[field] !== "string"
      ? JSON.stringify(patch[field])
      : patch[field] || null;
  }
  if ("verified" in patch && !("address_found_or_guessed" in values)) {
    values.address_found_or_guessed = patch.verified ? "verified" : (patch.email_best || current.email_best ? "guessed" : null);
  }
  if (patch.email_best && ["guessed", "inferred"].includes(patch.email_status) && !("address_found_or_guessed" in values)) {
    values.address_found_or_guessed = "guessed";
    if (!("email_source_type" in values)) values.email_source_type = patch.email_status === "inferred" ? "inferred_pattern" : "guessed_pattern";
  }
  if (patch.source_url && !("email_source_url" in values)) values.email_source_url = patch.source_url;
  if (values.email_best && values.email_best !== current.email_best && !("deliverability_status" in values)) {
    values.deliverability_status = "unchecked";
    values.deliverability_checked_at = null;
  }
  const entries = Object.entries(values);
  if (!entries.length) return;
  const params = { id: current.id, t: now() };
  const sets = entries.map(([field, value]) => { params[field] = value; return `${field}=@${field}`; });
  const next = { ...current, ...values };
  const ident = identity(next);
  sets.push("identity_key=@identity_key", "identity_confidence=@identity_confidence", "updated_at=@t");
  params.identity_key = ident.key;
  params.identity_confidence = ident.confidence;
  database.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id=@id`).run(params);
}

// Dashboard/CLI patch. Stage changes route through the gated model so the UI
// can no longer set an unearned stage; non-stage fields update the research blob.
export async function updateLead(id, patch = {}, product = "gnk") {
  const d = db();
  const p = normalizeProduct(product);
  const cur = getLead(d, id);
  if (!cur) throw new Error(`Unknown lead: ${id}`);
  if (cur.product !== p) throw new Error(`lead ${id} belongs to ${cur.product}, not ${p}`);
  const priorStage = CANON_TO_LEGACY[cur.stage];

  if (patch.stage && LEAD_STAGES.includes(patch.stage) && patch.stage !== priorStage) {
    applyLegacyStageChange(d, cur, patch.stage, patch.actor || "operator");
    await safeMemory(p, { lead_id: id, type: "stage_change", actor: patch.actor || "operator", payload: { from: priorStage, to: patch.stage } });
  }

  const research = { ...(cur.research || {}) };
  applyCanonicalEmailPatch(d, cur, patch);
  let touched = false;
  if (patch.contract_bucket && CONTRACT_BUCKETS.includes(patch.contract_bucket)) { research.contract_bucket = patch.contract_bucket; touched = true; }
  if (typeof patch.note === "string" && patch.note.trim()) {
    research.notes = [...(research.notes || []), { at: now(), text: patch.note.trim() }];
    touched = true;
    recordEvent(d, id, "note", { source: "dashboard", payload: { text: patch.note.trim() } });
    await safeMemory(p, { lead_id: id, type: "note", actor: patch.actor || "operator", payload: { text: patch.note.trim() } });
  }
  for (const f of MERGEABLE) if (f in patch) { research[f] = patch[f]; touched = true; }
  if (touched) d.prepare("UPDATE leads SET research=?, updated_at=? WHERE id=?").run(JSON.stringify(research), now(), id);

  return rowToLegacy(d, d.prepare("SELECT * FROM leads WHERE id=?").get(id));
}

// Translate a dashboard stage click into the correct gated action against the
// prospect lifecycle. Deal progression (won/lost) lives on the opportunity record.
function applyLegacyStageChange(d, lead, legacyStage, actor) {
  switch (legacyStage) {
    case "contacted":
      // A human asserting a real send happened → immutable manual 'sent' event
      // (bypasses the automated-send eligibility gate; moves prospect to enrolled).
      recordEvent(d, lead.id, "sent", { source: "dashboard-manual", payload: { actor, note: "manual contact logged from dashboard" } });
      return;
    case "replied":
      recordEvent(d, lead.id, "reply", { source: "dashboard", payload: { actor } });
      return;
    case "won":
      throw new Error("'won' is tracked on the opportunity record: open an opportunity and record a signed contract");
    case "lost":
      return void setStage(d, lead.id, "disqualified");
    case "to_contact":
      return void moveToward(d, lead.id, "route_ready"); // enforces research+route readiness
    case "researching":
      return void moveToward(d, lead.id, "researched");
    case "new":
      if (lead.stage === "nurture") setStage(d, lead.id, "target");
      return;
    default:
      throw new Error(`unsupported stage change: ${legacyStage}`);
  }
}
// Move through a legal, gated transition when a direct edge exists.
function moveToward(d, id, target) {
  const cur = getLead(d, id);
  if (cur.stage === target) return;
  if ((ALLOWED_TRANSITIONS[cur.stage] || []).includes(target) && !STAGE_REQUIRES_EVENT[target]) setStage(d, id, target);
  else throw new Error(`illegal transition ${cur.stage} -> ${target}`);
}

function jurisdictionFor(lead, product) {
  const dom = (lead.company_domain || "").toLowerCase();
  if (dom.endsWith(".ca")) return "CA";
  if (dom.endsWith(".co.uk") || dom.endsWith(".uk")) return "UK";
  if (dom.endsWith(".com.au") || dom.endsWith(".au")) return "AU";
  return product === "outagehub" ? "CA" : "unknown";
}
function today() { return new Date().toISOString().slice(0, 10); }

// ---- stats & export (legacy-compatible) ------------------------------------
export async function leadStats(inputLeads = null, product = "gnk") {
  const leads = inputLeads || (await readLeads(product));
  const byStage = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0]));
  const byBucket = Object.fromEntries(CONTRACT_BUCKETS.map((b) => [b, 0]));
  const byEmail = { found: 0, inferred: 0, guessed: 0, unknown: 0 };
  for (const lead of leads) {
    if (lead.stage in byStage) byStage[lead.stage] += 1;
    if (lead.contract_bucket in byBucket) byBucket[lead.contract_bucket] += 1;
    if (lead.email_status in byEmail) byEmail[lead.email_status] += 1;
  }
  return { total: leads.length, with_email: leads.filter((l) => l.email_best).length, byStage, byBucket, byEmail };
}

export function leadsToCsv(leads) {
  const cols = ["name", "title", "company", "company_domain", "email_best", "email_status", "email_candidates",
    "segment", "fit_score", "trigger_event", "why_now", "lit_up_case", "why_this_person", "owner_hypothesis",
    "likely_current_pain", "first_contract_slice", "reply_path", "contact_route", "outreach_angle", "contract_bucket",
    "contract_bucket_reason", "persona_vibe", "culture_context", "mindset", "communication_style", "perspective",
    "decision_style", "tone_guidance", "stage", "crm_stage", "send_blocked", "email_subject", "email_body", "source_url"];
  const escape = (v) => `"${(Array.isArray(v) ? v.join(" | ") : String(v ?? "")).replace(/"/g, '""')}"`;
  return [cols.join(","), ...leads.map((l) => cols.map((c) => escape(l[c])).join(","))].join("\n");
}
