import {
  companyId,
  dealId,
  ensureOntology,
  getRelated,
  insightId,
  loadGraph,
  personId,
  productId,
  queryEntities,
  relate,
  upsertEntity
} from "./ontology.js";
import { isResearchSlug, mapResearchArtifact } from "./research-record.js";

const PRODUCT_DISPLAY = { gnk: "GNK", outagehub: "OutageHub" };

// Make sure the product self-node (the mindmap center) exists before hanging
// discovered companies off it.
async function ensureProductRoot(graph, product) {
  const rootId = productId(product);
  if (!graph.entities.has(rootId)) {
    await upsertEntity(graph, {
      id: rootId,
      type: "Product",
      properties: { name: PRODUCT_DISPLAY[product] || product, product, is_self: true }
    });
  }
  return rootId;
}

// Deterministically record the structured output of the sourcing/contact agents
// into the shared knowledge graph right after they publish. This keeps the graph
// live without relying on the model to remember to call the ontology skill.
// Best-effort by design: callers wrap this so a mapping miss never fails a run.

function productForSlug(slug) {
  return slug.startsWith("outagehub-") ? "outagehub" : slug.startsWith("morrow-") ? "morrow" : "gnk";
}

async function recordAccountSourcing(graph, product, artifact) {
  const rootId = await ensureProductRoot(graph, product);
  const accounts = Array.isArray(artifact.target_accounts) ? artifact.target_accounts : [];
  for (const account of accounts) {
    const name = account.company;
    if (!name) continue;
    const domain = (account.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const cId = companyId({ product, domain, name });
    await relate(graph, rootId, "targets_company", cId);
    await upsertEntity(graph, {
      id: cId,
      type: "Company",
      properties: {
        name,
        domain,
        website: account.website,
        segment: account.icp_segment,
        deal_tier: account.deal_tier_hypothesis,
        trigger: account.trigger_event?.summary,
        product
      }
    });

    const buyer = account.reachable_path?.likely_buyer_or_router;
    // Only model a named individual as a Person; role labels ("VP Eng") stay on
    // the deal as guidance rather than becoming fake people.
    if (buyer && /\s/.test(buyer) && !/^(the |a |ceo|founder|cto|vp|head|team)\b/i.test(buyer)) {
      const pId = personId({ name: buyer, company: name, product });
      await upsertEntity(graph, {
        id: pId,
        type: "Person",
        properties: { name: buyer, product, source: "account-sourcing" }
      });
      await relate(graph, pId, "buyer_at", cId);
    }
  }
  return accounts.length;
}

async function recordContactDiscovery(graph, product, artifact) {
  const rootId = await ensureProductRoot(graph, product);
  const maps = Array.isArray(artifact.account_contact_maps) ? artifact.account_contact_maps : [];
  let contacts = 0;
  for (const map of maps) {
    const name = map.company;
    if (!name) continue;
    const domain = (map.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const cId = companyId({ product, domain, name });
    await relate(graph, rootId, "targets_company", cId);
    await upsertEntity(graph, {
      id: cId,
      type: "Company",
      properties: { name, domain, website: map.website, trigger: map.account_trigger, product }
    });

    const named = Array.isArray(map.named_contacts) ? map.named_contacts : [];
    for (const contact of named) {
      if (!contact.name) continue;
      const email = contact.contact_info?.official_public_email;
      const pId = personId({ email, name: contact.name, company: name, product });
      await upsertEntity(graph, {
        id: pId,
        type: "Person",
        properties: {
          name: contact.name,
          title: contact.current_title,
          role_category: contact.role_category,
          email,
          confidence: contact.confidence,
          product
        }
      });
      await relate(graph, pId, "works_at", cId);
      if (contact.role_category === "economic_buyer" || contact.role_category === "technical_buyer") {
        await relate(graph, pId, "buyer_at", cId);
      }
      const dId = dealId({ product, company: name, person: contact.name });
      await upsertEntity(graph, {
        id: dId,
        type: "Deal",
        properties: {
          name: `${name} — ${contact.name}`,
          product,
          stage: "researching",
          trigger: map.account_trigger
        }
      });
      await relate(graph, cId, "has_deal", dId);
      await relate(graph, dId, "deal_contact", pId);
      contacts += 1;
    }
  }
  return contacts;
}

function norm(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Find the Person node this persona read belongs to. Contact-discovery keys a
// Person by email when it has one, so name+company alone can miss it; match on
// normalized name + the works_at company link instead, and only fall back to a
// name/company-derived id when no existing person matches.
function findPersonId(graph, { name, company, product }) {
  const cId = companyId({ product, name: company });
  const wanted = norm(name);
  for (const person of queryEntities(graph, { type: "Person" })) {
    if (norm(person.properties?.name) !== wanted) continue;
    const worksAt = getRelated(graph, person.id, "works_at").some((r) => r.entity.id === cId);
    if (worksAt) return person.id;
  }
  // No linked match: prefer any same-name person, else derive a fresh id.
  const byName = queryEntities(graph, { type: "Person" }).find(
    (p) => norm(p.properties?.name) === wanted
  );
  return byName?.id || personId({ name, company, product });
}

// Attach the vibe read (culture/mindset/communication/perspective/tone) to each
// person's node, and hang a per-person "lead-persona" Insight off the product
// root so the read is visible as its own node in the knowledge tree.
async function recordLeadPersona(graph, product, artifact) {
  const rootId = await ensureProductRoot(graph, product);
  const personas = Array.isArray(artifact.person_personas) ? artifact.person_personas : [];
  let recorded = 0;
  for (const persona of personas) {
    const name = persona.person_name;
    const company = persona.company;
    if (!name || !company) continue;

    const cId = companyId({ product, name: company });
    const pId = findPersonId(graph, { name, company, product });
    await upsertEntity(graph, {
      id: pId,
      type: "Person",
      properties: {
        name,
        title: persona.current_title,
        product,
        vibe_summary: persona.vibe_summary,
        culture_context: persona.culture_context,
        mindset: persona.mindset,
        communication_style: persona.communication_style,
        perspective: persona.perspective,
        decision_style: persona.decision_style,
        tone_guidance: persona.tone_guidance,
        persona_confidence: persona.confidence,
        persona_source: "lead-persona-profile"
      }
    });
    await relate(graph, pId, "works_at", cId);

    const detail = [
      persona.vibe_summary && `Vibe: ${persona.vibe_summary}`,
      persona.culture_context && `Culture: ${persona.culture_context}`,
      persona.mindset && `Mindset: ${persona.mindset}`,
      persona.communication_style && `Communication: ${persona.communication_style}`,
      persona.perspective && `Perspective: ${persona.perspective}`,
      persona.tone_guidance && `Tone: ${persona.tone_guidance}`
    ]
      .filter(Boolean)
      .join("\n");
    if (detail) {
      const iId = insightId(product, "lead-persona", `${company}:${name}`);
      await upsertEntity(graph, {
        id: iId,
        type: "Insight",
        properties: {
          name: `${name} — vibe`,
          detail,
          product,
          kind: "lead-persona"
        }
      });
      await relate(graph, rootId, "has_insight", iId);
    }
    recorded += 1;
  }
  return recorded;
}

// Upsert the strategic understanding (Product/Segment/Persona/Offer/Trigger/
// Insight) from a research artifact into the shared graph.
async function recordResearch(graph, product, slug, artifact) {
  const { entities, relations } = mapResearchArtifact(product, slug, artifact);
  for (const entity of entities) {
    await upsertEntity(graph, entity);
  }
  for (const link of relations) {
    await relate(graph, link.from, link.rel, link.to);
  }
  return entities.length;
}

// Outcome → strategy feedback: when a lead replies or converts, fold the learning
// ("this angle on this segment got this result") back into the knowledge graph as
// an Insight so the strategy layer improves from real results. Aggregates by
// angle+segment+result via a deterministic id, bumping a running count.
export async function recordOutcomeInsight(product, outcome = {}) {
  const angle = (outcome.angle || "").trim();
  const segment = (outcome.segment || "").trim();
  const result = (outcome.result || "").trim();
  if (!result || (!angle && !segment)) return null;

  await ensureOntology();
  const graph = await loadGraph();
  const rootId = await ensureProductRoot(graph, product);

  const key = `${angle || "unspecified-angle"}|${segment || "unspecified-segment"}|${result}`;
  const iId = insightId(product, "outcome", key);
  const existing = graph.entities.get(iId);
  const count = (existing?.properties?.count || 0) + 1;
  const name = `${result} · ${segment || "any segment"}`;
  const detail = [
    `Result: ${result}`,
    segment && `Segment: ${segment}`,
    angle && `Angle: ${angle}`,
    outcome.company && `Most recent: ${outcome.company}`,
    `Times observed: ${count}`
  ]
    .filter(Boolean)
    .join("\n");

  await upsertEntity(graph, {
    id: iId,
    type: "Insight",
    properties: { name, detail, product, kind: "outcome", result, segment, angle, count }
  });
  await relate(graph, rootId, "has_insight", iId);
  return { id: iId, count };
}

// Returns a short summary string, or null when the agent isn't one we map.
export async function recordArtifactToOntology(agent, artifact) {
  if (!agent?.slug) return null;
  await ensureOntology();
  const product = productForSlug(agent.slug);
  const graph = await loadGraph();

  if (agent.slug.endsWith("account-sourcing")) {
    const n = await recordAccountSourcing(graph, product, artifact);
    return `recorded ${n} companies into ontology`;
  }
  if (agent.slug.endsWith("contact-discovery")) {
    const n = await recordContactDiscovery(graph, product, artifact);
    return `recorded ${n} contacts into ontology`;
  }
  if (agent.slug.endsWith("lead-persona-profile")) {
    const n = await recordLeadPersona(graph, product, artifact);
    return `recorded ${n} persona vibes into ontology`;
  }
  if (isResearchSlug(agent.slug)) {
    const n = await recordResearch(graph, product, agent.slug, artifact);
    return `recorded ${n} understanding nodes into ontology`;
  }
  return null;
}
