import { readLeads } from "./leads-store.js";
import { readState } from "./bus.js";
import { mapResearchArtifact, isResearchSlug } from "./research-record.js";
import {
  SCHEMA,
  companyId,
  conversationId,
  dealId,
  productId,
  ensureOntology,
  graphSummary,
  loadGraph,
  personId,
  rebuildGraph,
  writeSchemaYaml
} from "./ontology.js";

const PRODUCTS = ["gnk", "outagehub"];

// Stages that imply a real conversation / touch happened.
const CONVERSATION_STAGES = new Set(["contacted", "replied", "won", "lost"]);

function entityOp(id, type, properties, timestamp) {
  const cleaned = {};
  for (const [key, value] of Object.entries(properties)) {
    const empty =
      value == null || value === "" || (Array.isArray(value) && value.length === 0);
    if (!empty) cleaned[key] = value;
  }
  return {
    op: "create",
    entity: { id, type, properties: cleaned, created: timestamp, updated: timestamp },
    timestamp
  };
}

function relateOp(from, rel, to, timestamp, properties = {}) {
  return { op: "relate", from, rel, to, properties, timestamp };
}

// Build the full op list from the CRM leads for one product. Deterministic ids
// mean re-running this produces a stable graph.
const PRODUCT_DISPLAY = { gnk: "GNK", outagehub: "OutageHub" };

function buildProductOps(product, leads, ops, seen) {
  // The product self-node is the center of the mindmap; every discovered company
  // hangs off it via targets_company so the strategy cluster and the CRM spine
  // are one connected graph.
  const rootId = productId(product);
  const rootTs = "1970-01-01T00:00:00.000Z";
  if (!seen.has(rootId)) {
    seen.add(rootId);
    ops.push(
      entityOp(rootId, "Product", { name: PRODUCT_DISPLAY[product] || product, product, is_self: true }, rootTs)
    );
  }

  for (const lead of leads) {
    const ts = lead.updated_at || lead.created_at || "1970-01-01T00:00:00.000Z";
    const companyName = lead.company || lead.company_domain;
    if (!companyName && !lead.name) continue;

    const cId = companyId({ product, domain: lead.company_domain, name: companyName });
    if (companyName && !seen.has(cId)) {
      seen.add(cId);
      ops.push(
        entityOp(
          cId,
          "Company",
          {
            name: companyName,
            domain: lead.company_domain,
            website: lead.source_url,
            segment: lead.segment,
            product
          },
          ts
        )
      );
      ops.push(relateOp(rootId, "targets_company", cId, ts));
    }

    const pId = personId({ email: lead.email_best, name: lead.name, company: companyName, product });
    if (lead.name && !seen.has(pId)) {
      seen.add(pId);
      ops.push(
        entityOp(
          pId,
          "Person",
          {
            name: lead.name,
            title: lead.title,
            email: lead.email_best,
            email_status: lead.email_status,
            confidence: lead.confidence,
            product
          },
          ts
        )
      );
      if (companyName) {
        ops.push(relateOp(pId, "works_at", cId, ts));
        // Decision-maker titles are treated as the likely buyer at the account.
        if (/\b(ceo|founder|co-?founder|cto|chief|vp|head|president|coo|cio|owner)\b/i.test(lead.title || "")) {
          ops.push(relateOp(pId, "buyer_at", cId, ts));
        }
      }
    }

    // One deal per (company, person, product) capturing the opportunity state.
    if (companyName && lead.name) {
      const dId = dealId({ product, company: companyName, person: lead.name });
      if (!seen.has(dId)) {
        seen.add(dId);
        ops.push(
          entityOp(
            dId,
            "Deal",
            {
              name: `${companyName} — ${lead.name}`,
              product,
              stage: lead.stage || "new",
              contract_bucket: lead.contract_bucket,
              fit_score: lead.fit_score,
              trigger: lead.trigger_event,
              outreach_angle: lead.outreach_angle,
              lead_id: lead.id
            },
            ts
          )
        );
        ops.push(relateOp(cId, "has_deal", dId, ts));
        ops.push(relateOp(dId, "deal_contact", pId, ts));

        // Previous conversations: derive one from the lead stage + notes when a
        // touch has actually happened.
        const notes = Array.isArray(lead.notes) ? lead.notes : [];
        if (CONVERSATION_STAGES.has(lead.stage) || notes.length) {
          const convId = conversationId(`${dId}:${lead.stage}`);
          const noteText = notes
            .map((n) => (typeof n === "string" ? n : n?.text))
            .filter(Boolean)
            .join(" | ");
          ops.push(
            entityOp(
              convId,
              "Conversation",
              {
                summary: noteText || `Lead reached stage "${lead.stage}".`,
                stage: lead.stage,
                channel: "email",
                at: lead.updated_at,
                product
              },
              ts
            )
          );
          ops.push(relateOp(dId, "had_conversation", convId, ts));
        }
      }
    }
  }
}

// Fold the strategic research artifacts into the same op list so a rebuild
// reconstructs BOTH the lead spine and the understanding graph deterministically.
function buildResearchOps(artifacts, ops, seen) {
  const ts = "1970-01-01T00:00:00.000Z";
  let nodes = 0;
  for (const [slug, artifact] of Object.entries(artifacts || {})) {
    if (!isResearchSlug(slug)) continue;
    const product = slug.startsWith("outagehub-") ? "outagehub" : "gnk";
    const { entities, relations } = mapResearchArtifact(product, slug, artifact);
    for (const entity of entities) {
      // Deterministic ids: last create wins on load, so re-emitting a shared
      // node (e.g. the Product root) across artifacts is a harmless upsert.
      ops.push(entityOp(entity.id, entity.type, entity.properties, ts));
      if (!seen.has(entity.id)) {
        seen.add(entity.id);
        nodes += 1;
      }
    }
    for (const link of relations) {
      ops.push(relateOp(link.from, link.rel, link.to, ts));
    }
  }
  return nodes;
}

const STOPWORDS = new Set([
  "with", "that", "this", "from", "have", "into", "their", "software", "companies",
  "company", "custom", "team", "teams", "fit", "strong", "good", "and", "the", "for",
  "where", "which", "tied", "real", "risk", "product", "products", "business"
]);

function tokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

// Connect every discovered/lead Company into the ICP Segment it best matches, so
// the accounts hang under the right part of the ICP structure rather than only
// off the product root. Token-overlap match against Segment node text.
function linkCompaniesToSegments(ops, product) {
  const segments = [];
  const companies = [];
  for (const op of ops) {
    if (op.op !== "create" || op.entity?.properties?.product !== product) continue;
    const e = op.entity;
    if (e.type === "Segment") {
      segments.push({ id: e.id, tokens: tokens(`${e.properties.name} ${e.properties.detail || ""}`) });
    } else if (e.type === "Company" && e.properties.segment) {
      companies.push({ id: e.id, tokens: tokens(e.properties.segment) });
    }
  }
  if (!segments.length || !companies.length) return 0;

  const ts = "1970-01-01T00:00:00.000Z";
  let linked = 0;
  for (const company of companies) {
    let best = null;
    let bestScore = 0;
    for (const segment of segments) {
      let score = 0;
      for (const t of company.tokens) if (segment.tokens.has(t)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = segment;
      }
    }
    if (best && bestScore >= 2) {
      ops.push(relateOp(company.id, "in_segment", best.id, ts));
      linked += 1;
    }
  }
  return linked;
}

async function main() {
  await ensureOntology();
  await writeSchemaYaml(SCHEMA);

  const ops = [];
  const seen = new Set();
  let totalLeads = 0;
  for (const product of PRODUCTS) {
    const leads = await readLeads(product);
    totalLeads += leads.length;
    buildProductOps(product, leads, ops, seen);
  }

  const state = await readState();
  const researchNodes = buildResearchOps(state.artifacts, ops, seen);

  let companySegmentLinks = 0;
  for (const product of PRODUCTS) {
    companySegmentLinks += linkCompaniesToSegments(ops, product);
  }

  await rebuildGraph(ops);
  const graph = await loadGraph();
  const summary = graphSummary(graph);

  console.log(
    JSON.stringify(
      {
        source_leads: totalLeads,
        research_nodes: researchNodes,
        company_segment_links: companySegmentLinks,
        graph_path: "data/ontology/graph.jsonl",
        ...summary
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
