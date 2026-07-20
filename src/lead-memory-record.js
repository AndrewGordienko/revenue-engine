import { readLeads } from "./leads-store.js";
import { appendMemory, rememberUnderstanding } from "./lead-memory.js";

// Bridge agent artifacts into per-lead memory. When a research agent produces a
// per-person read, we resolve it to a CRM lead and append understanding/research
// to that lead's timeline — so the next agent (and the operator) build on it
// instead of re-deriving. Best-effort: a mapping miss never fails a run.

function productForSlug(slug) {
  return slug.startsWith("outagehub-") ? "outagehub" : slug.startsWith("morrow-") ? "morrow" : "gnk";
}

function norm(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Build a name+company -> lead_id resolver from the current CRM.
async function leadResolver(product) {
  const leads = await readLeads(product);
  const byNameCompany = new Map();
  const byName = new Map();
  for (const lead of leads) {
    const n = norm(lead.name);
    if (!n) continue;
    byNameCompany.set(`${n}|${norm(lead.company)}`, lead.id);
    if (!byName.has(n)) byName.set(n, lead.id);
  }
  return (name, company) =>
    byNameCompany.get(`${norm(name)}|${norm(company)}`) || byName.get(norm(name)) || null;
}

async function recordLeadPersonas(product, artifact, resolve) {
  const personas = Array.isArray(artifact.person_personas) ? artifact.person_personas : [];
  let recorded = 0;
  for (const persona of personas) {
    const leadId = resolve(persona.person_name, persona.company);
    if (!leadId) continue;
    const value = [
      persona.vibe_summary,
      persona.communication_style && `Communicate: ${persona.communication_style}`,
      persona.tone_guidance && `Tone: ${persona.tone_guidance}`
    ]
      .filter(Boolean)
      .join(" — ");
    if (!value) continue;
    await rememberUnderstanding(product, leadId, "persona", value, {
      actor: "agent:lead-persona-profile",
      confidence: persona.confidence
    });
    recorded += 1;
  }
  return recorded;
}

async function recordDossiers(product, artifact, resolve) {
  // Client dossiers connect account context + likely pain + first conversation.
  const dossiers =
    (Array.isArray(artifact.client_dossiers) && artifact.client_dossiers) ||
    (Array.isArray(artifact.dossiers) && artifact.dossiers) ||
    [];
  let recorded = 0;
  for (const d of dossiers) {
    const leadId = resolve(d.contact_name || d.person_name, d.company);
    if (!leadId) continue;
    const summary = [
      d.likely_current_pain && `Pain: ${d.likely_current_pain}`,
      d.first_conversation && `First conversation: ${d.first_conversation}`,
      d.first_contract_slice && `First slice: ${d.first_contract_slice}`
    ]
      .filter(Boolean)
      .join("\n");
    if (!summary) continue;
    await appendMemory(product, {
      lead_id: leadId,
      type: "research",
      actor: "agent:client-dossier",
      payload: { summary, source: "client-dossier" }
    });
    recorded += 1;
  }
  return recorded;
}

// Returns a short note, or null when the agent isn't one we bridge.
export async function recordArtifactToLeadMemory(agent, artifact) {
  if (!agent?.slug || !artifact) return null;
  const product = productForSlug(agent.slug);
  const resolve = await leadResolver(product);

  if (agent.slug.endsWith("lead-persona-profile")) {
    const n = await recordLeadPersonas(product, artifact, resolve);
    return n ? `recorded ${n} persona reads into lead memory` : null;
  }
  if (agent.slug.endsWith("client-dossier")) {
    const n = await recordDossiers(product, artifact, resolve);
    return n ? `recorded ${n} dossiers into lead memory` : null;
  }
  return null;
}
