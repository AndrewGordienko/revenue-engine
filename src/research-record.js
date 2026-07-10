import {
  companyId,
  insightId,
  metricId,
  offerId,
  painId,
  personaId,
  productId,
  proofId,
  ruleId,
  segmentId,
  triggerId
} from "./ontology.js";

// Fold ALL the knowledge the agents gathered into one connected graph: what the
// product is, who the ICP is, the offers, the pains, the triggers, the proof, the
// rules, the metrics, the strategy — and how it all connects — so the graph is a
// map of everything we've learned on the way to the actual leads (which are also
// on the graph, because sourcing is just another agent).
//
// mapResearchArtifact() is pure: it returns a normalized { entities, relations }
// bundle. Deterministic ids mean re-running an agent upserts the same nodes.

const PRODUCT_NAMES = { gnk: "GNK", outagehub: "OutageHub" };
const MAX_PER_FIELD = 14;

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// A short, human node label; the full text lives in properties.detail.
function conciseLabel(text, max = 46) {
  const s = clean(text).replace(/^(strong fit|good fit|moderate fit|weak fit)\s*[:—-]\s*/i, "");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : max).trim()}…`;
}

// Pull a label + full detail from a string OR a shaped object.
function labelAndDetail(item, keys = []) {
  if (item == null) return null;
  if (typeof item === "string") {
    const head = item.split(/:\s/)[0];
    const useHead = head && head.length >= 10 && head.length <= 58 && head !== item;
    return { label: conciseLabel(useHead ? head : item), detail: clean(item) };
  }
  if (typeof item === "object") {
    let label = null;
    for (const k of keys) {
      if (typeof item[k] === "string" && item[k].trim()) {
        label = item[k];
        break;
      }
    }
    if (!label) {
      const firstString = Object.values(item).find((v) => typeof v === "string" && v.trim());
      label = firstString || JSON.stringify(item);
    }
    const detail = Object.entries(item)
      .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n");
    return { label: conciseLabel(label), detail };
  }
  return { label: conciseLabel(String(item)), detail: clean(String(item)) };
}

export function mapResearchArtifact(product, slug, artifact) {
  if (!artifact || typeof artifact !== "object") return { entities: [], relations: [] };
  const entities = [];
  const relations = [];
  const seen = new Set();

  const rootId = productId(product);
  const push = (entity) => {
    if (seen.has(entity.id)) return entity.id;
    seen.add(entity.id);
    entities.push(entity);
    return entity.id;
  };
  const link = (from, rel, to) => {
    if (from && to) relations.push({ from, rel, to });
  };

  push({
    id: rootId,
    type: "Product",
    properties: {
      name: PRODUCT_NAMES[product] || product,
      product,
      summary: artifact.company_summary || artifact.icp_summary || undefined,
      is_self: true
    }
  });

  // Factories: create a typed node from a label/detail and connect it.
  const makeSegment = (ld, source) => {
    const id = segmentId(product, ld.label);
    push({ id, type: "Segment", properties: { name: ld.label, detail: ld.detail, product, source } });
    link(rootId, "has_segment", id);
    return id;
  };
  const makePersona = (ld, source) => {
    const id = personaId(product, ld.label);
    push({ id, type: "Persona", properties: { name: ld.label, detail: ld.detail, product, source } });
    link(rootId, "has_persona", id);
    return id;
  };
  const makeOffer = (ld, source) => {
    const id = offerId(product, ld.label);
    push({ id, type: "Offer", properties: { name: ld.label, detail: ld.detail, product, source } });
    link(rootId, "provides_offer", id);
    return id;
  };
  const makeTrigger = (ld, source) => {
    const id = triggerId(product, ld.label);
    push({ id, type: "Trigger", properties: { name: ld.label, detail: ld.detail, product, source } });
    link(rootId, "watches_trigger", id);
    return id;
  };
  const makePain = (ld, source) => {
    const id = painId(product, ld.label);
    push({ id, type: "Pain", properties: { name: ld.label, detail: ld.detail, product, source } });
    return id;
  };
  const makeProof = (ld, source) => {
    const id = proofId(product, ld.label);
    push({ id, type: "Proof", properties: { name: ld.label, detail: ld.detail, product, source } });
    link(rootId, "has_proof", id);
    return id;
  };
  const makeRule = (ld, kind) => {
    const id = ruleId(product, kind, ld.label);
    push({ id, type: "Rule", properties: { name: ld.label, detail: ld.detail, product, kind } });
    link(rootId, "has_rule", id);
    return id;
  };
  const makeMetric = (ld, source) => {
    const id = metricId(product, ld.label);
    push({ id, type: "Metric", properties: { name: ld.label, detail: ld.detail, product, source } });
    link(rootId, "has_metric", id);
    return id;
  };
  const makeInsight = (ld, kind) => {
    const id = insightId(product, kind, ld.label);
    push({ id, type: "Insight", properties: { name: ld.label, detail: ld.detail, product, kind } });
    link(rootId, "has_insight", id);
    return id;
  };

  // Iterate an artifact field (array of strings/objects) through a factory.
  const each = (field, keys, make) => {
    asArray(artifact[field]).slice(0, MAX_PER_FIELD).forEach((item) => {
      const ld = labelAndDetail(item, keys);
      if (ld && ld.label) make(ld, item);
    });
  };

  const base = slug.replace(/^(gnk|outagehub)-/, "");

  switch (base) {
    case "company-context": {
      each("service_lanes", [], (ld) => makeOffer(ld, "company-context"));
      each("target_pressures", [], (ld) => makeInsight(ld, "market-pressure"));
      each("sales_implications", [], (ld) => makeInsight(ld, "sales-implication"));
      break;
    }

    case "icp-contact-profile": {
      each("priority_segments", ["segment", "name"], (ld) => makeSegment(ld, "icp"));
      each("buyer_personas", ["persona", "name", "role"], (ld) => makePersona(ld, "icp"));
      each("contact_titles", [], (ld) => makePersona(ld, "titles"));
      each("trigger_events", ["trigger", "name"], (ld) => makeTrigger(ld, "icp"));
      each("fit_signals", [], (ld) => makeInsight(ld, "fit-signal"));
      each("commercial_floor_signals", [], (ld) => makeInsight(ld, "floor-signal"));
      each("reachability_signals", [], (ld) => makeInsight(ld, "reachability"));
      each("outreach_angles", [], (ld) => makeInsight(ld, "outreach-angle"));
      each("disqualifiers", [], (ld) => makeRule(ld, "disqualifier"));
      break;
    }

    case "offer-map": {
      asArray(artifact.segment_offer_maps).slice(0, MAX_PER_FIELD).forEach((map) => {
        if (!map || typeof map !== "object") return;
        const segId = makeSegment(labelAndDetail(map, ["segment"]), "offer-map");
        const offerLd = labelAndDetail(
          { first_offer: map.first_offer, value_layer: map.value_layer },
          ["first_offer", "value_layer"]
        );
        let offId = null;
        if (offerLd?.label) {
          offId = makeOffer(offerLd, "offer-map");
          link(offId, "serves_segment", segId);
        }
        if (map.current_pain) {
          const painNodeId = makePain(labelAndDetail(map.current_pain), "offer-map");
          link(segId, "has_pain", painNodeId);
          if (offId) link(offId, "addresses_pain", painNodeId);
        }
        asArray(map.primary_contacts).slice(0, 3).forEach((contact) => {
          const pLd = labelAndDetail(contact);
          if (pLd?.label) link(segId, "has_persona", makePersona(pLd, "offer-map"));
        });
        if (map.proof_needed) {
          const prfId = makeProof(labelAndDetail(map.proof_needed), "offer-map");
          if (offId) link(offId, "has_proof", prfId);
        }
      });
      each("cross_segment_offer_principles", [], (ld) => makeInsight(ld, "offer-principle"));
      each("urgency_triggers", ["trigger", "name"], (ld) => makeTrigger(ld, "offer-map"));
      each("proof_assets_to_build", [], (ld) => makeProof(ld, "offer-map"));
      each("claims_to_avoid", [], (ld) => makeRule(ld, "claim-to-avoid"));
      break;
    }

    case "account-sourcing": {
      asArray(artifact.target_accounts).slice(0, MAX_PER_FIELD).forEach((account) => {
        if (!account || typeof account !== "object" || !account.company) return;
        const domain = clean(account.website).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const cId = companyId({ product, domain, name: account.company });
        push({
          id: cId,
          type: "Company",
          properties: {
            name: account.company,
            domain,
            website: account.website,
            segment: account.icp_segment,
            fit_reason: account.fit_reason,
            fit_score: account.fit_score,
            deal_tier: account.deal_tier_hypothesis,
            trigger: account.trigger_event?.summary || account.trigger_event,
            product,
            source: "account-sourcing"
          }
        });
        link(rootId, "targets_company", cId);
        if (account.icp_segment) {
          const segId = makeSegment(labelAndDetail(account.icp_segment), "account-sourcing");
          link(cId, "in_segment", segId);
        }
        const trig = account.trigger_event?.summary || account.trigger_event;
        if (trig) makeTrigger(labelAndDetail(trig), "account-sourcing");
      });
      break;
    }

    case "revenue-strategy": {
      each("deal_tiers", ["tier", "name"], (ld) => makeMetric(ld, "deal-tier"));
      each("sourcing_rules", [], (ld) => makeRule(ld, "sourcing-rule"));
      each("scoring_rules", [], (ld) => makeRule(ld, "scoring-rule"));
      if (artifact.revenue_math) makeMetric({ label: "Revenue math", detail: labelAndDetail(artifact.revenue_math).detail }, "revenue-math");
      if (artifact.company_size_boundaries)
        makeMetric({ label: "Company size boundaries", detail: labelAndDetail(artifact.company_size_boundaries).detail }, "size-boundaries");
      if (artifact.target_industry_logic) makeInsight(labelAndDetail(artifact.target_industry_logic, ["primary_filter"]), "industry-logic");
      if (artifact.portfolio_strategy) makeInsight({ label: "Portfolio strategy", detail: labelAndDetail(artifact.portfolio_strategy).detail }, "portfolio-strategy");
      if (artifact.strategy_summary) makeInsight({ label: conciseLabel(artifact.strategy_summary), detail: clean(artifact.strategy_summary) }, "revenue-strategy");
      break;
    }

    case "sequence-strategy": {
      if (artifact.strategic_point_of_view)
        makeInsight(labelAndDetail(artifact.strategic_point_of_view, ["core_thesis"]), "sequence-thesis");
      if (artifact.sequence_architecture)
        makeInsight({ label: "Sequence architecture", detail: labelAndDetail(artifact.sequence_architecture).detail }, "sequence-architecture");
      each("touch_plan", ["working_name", "objective"], (ld) => makeInsight(ld, "touch"));
      each("anti_spam_rules", [], (ld) => makeRule(ld, "anti-spam"));
      each("claims_to_avoid", [], (ld) => makeRule(ld, "claim-to-avoid"));
      break;
    }

    case "boutique-growth-playbook": {
      asArray(artifact.companies_studied).slice(0, MAX_PER_FIELD).forEach((c) => {
        if (!c || !c.company) return;
        const cId = companyId({ product, name: c.company });
        push({
          id: cId,
          type: "Company",
          properties: { name: c.company, product, role: "comparable", detail: labelAndDetail(c).detail, source: "growth-playbook" }
        });
        link(rootId, "learns_from", cId);
      });
      each("historical_patterns", ["pattern"], (ld) => makeInsight(ld, "growth-pattern"));
      each("targeting_lessons", ["lesson"], (ld) => makeInsight(ld, "targeting-lesson"));
      each("offer_lessons", ["lesson"], (ld) => makeInsight(ld, "offer-lesson"));
      each("sales_motion_lessons", ["lesson"], (ld) => makeInsight(ld, "sales-motion-lesson"));
      each("credibility_lessons", ["lesson"], (ld) => makeProof(ld, "credibility"));
      each("response_generation_lessons", ["lesson"], (ld) => makeInsight(ld, "response-lesson"));
      each("strategic_gaps_for_gnk", ["gap"], (ld) => makeInsight(ld, "strategic-gap"));
      each("experiments_to_run", ["experiment"], (ld) => makeInsight(ld, "experiment"));
      each("claims_to_avoid", [], (ld) => makeRule(ld, "claim-to-avoid"));
      break;
    }

    case "pipeline-capacity": {
      if (artifact.capacity_summary) makeInsight({ label: conciseLabel(artifact.capacity_summary), detail: clean(artifact.capacity_summary) }, "capacity");
      if (artifact.revenue_goal) makeMetric({ label: "Revenue goal", detail: labelAndDetail(artifact.revenue_goal).detail }, "revenue-goal");
      if (artifact.pipeline_targets) makeMetric({ label: "Pipeline targets", detail: labelAndDetail(artifact.pipeline_targets).detail }, "pipeline-targets");
      if (artifact.conversion_assumptions) makeMetric({ label: "Conversion assumptions", detail: labelAndDetail(artifact.conversion_assumptions).detail }, "conversion");
      each("operating_rules", [], (ld) => makeRule(ld, "operating-rule"));
      break;
    }

    case "market-coverage": {
      each("priority_segments", ["segment", "name"], (ld) => makeSegment(ld, "market-coverage"));
      each("coverage_gaps", [], (ld) => makeInsight(ld, "coverage-gap"));
      each("segments", ["segment", "name"], (ld) => makeSegment(ld, "market-coverage"));
      break;
    }

    // Execution-layer agents (email drafting/finding/reviewing): fold their
    // durable RULES into the graph (voice, send, quality), not every email.
    case "email-drafter":
      each("style_rules", [], (ld) => makeRule(ld, "style-rule"));
      each("claims_to_avoid", [], (ld) => makeRule(ld, "claim-to-avoid"));
      break;
    case "email-sequence-drafter":
      each("global_send_rules", [], (ld) => makeRule(ld, "send-rule"));
      each("claims_to_avoid", [], (ld) => makeRule(ld, "claim-to-avoid"));
      break;
    case "email-sequence-reviewer":
      each("reviewer_rules", [], (ld) => makeRule(ld, "reviewer-rule"));
      each("quality_rubric", ["criterion"], (ld) => makeInsight(ld, "quality-criterion"));
      break;

    default:
      return { entities: entities.slice(0, 1), relations: [] };
  }

  return { entities, relations };
}

// Slugs whose artifacts contribute knowledge to the graph.
export const RESEARCH_SLUG_SUFFIXES = [
  "company-context",
  "icp-contact-profile",
  "offer-map",
  "account-sourcing",
  "revenue-strategy",
  "sequence-strategy",
  "boutique-growth-playbook",
  "pipeline-capacity",
  "market-coverage",
  "email-drafter",
  "email-sequence-drafter",
  "email-sequence-reviewer"
];

export function isResearchSlug(slug) {
  return RESEARCH_SLUG_SUFFIXES.some((suffix) => slug.endsWith(suffix));
}
