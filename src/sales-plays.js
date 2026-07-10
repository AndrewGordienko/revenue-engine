// Versioned commercial strategy. The two brands share infrastructure, evidence,
// and CRM controls, but never pricing, offers, proof, funnel math, or sequences.
export const STRATEGY_VERSION = "plan-2026-07-11";

export const PORTFOLIO_STRATEGY = {
  immediate_revenue_target_usd: 40000,
  allocation: { gnk: 0.6, outagehub: 0.3, revenue_engine: 0.1 },
  brands: {
    gnk: {
      immediate_purpose: "Generate cash and high-trust relationships.",
      target_30_day: "One signed $40k-$60k senior engineering engagement.",
      long_term_model: "Two to four recurring engineering ownership pods.",
      positioning: "A senior engineering strike team that takes business-critical software and AI projects from stuck or risky to working production systems in four to six weeks.",
      method: ["Shape", "Build", "Prove", "Transfer"],
      acquisition_mix: ["warm introductions", "triggered outbound", "referral and delivery partners"],
      continuation: "Sprint → three-month ownership pod → managed platform/AI reliability retainer.",
    },
    outagehub: {
      immediate_purpose: "Prove repeatable product demand through paid implementations and pilots.",
      target_30_day: "Three to four paid pilots/evaluations worth $40k in booked first-month revenue.",
      target_mrr_horizon: "Reach $40k MRR in 60-120 days through six high-value customers, not eighty low-price subscriptions.",
      long_term_model: "Six to ten high-value recurring operational or embedded customers.",
      positioning: "A Canadian power-event intelligence layer that tells operational systems which locations are affected, how confident the event is, what changed, and who needs to respond.",
      conversion: "Paid pilot → written success review → annual recurring agreement.",
    },
  },
};

export const DEMAND_SIGNAL_TYPES = [
  "job_posting", "executive_hire", "funding", "product_launch", "incident",
  "status_page", "migration", "technical_deprecation", "public_roadmap",
  "regulatory_change", "customer_complaint", "partnership",
];

const gnkCommon = {
  brand: "gnk",
  strategy_version: STRATEGY_VERSION,
  engagement_shape: {
    duration: "4-6 weeks",
    payment: "50% deposit or first month paid before delivery starts",
    method: ["Shape", "Build", "Prove", "Transfer"],
    required_terms: ["defined first outcome", "acceptance criteria", "client responsibilities", "explicit exclusions", "change control", "continuation path"],
    fallback_offer: { name: "Paid Shaping Engagement", duration: "1 week", min: 7500, max: 12500, credited_to_sprint: true },
  },
};

const pilotTerms = {
  duration: "30-day evaluation",
  required_terms: ["one region or site portfolio", "one operational decision", "API, webhook, or notification delivery", "written success criteria", "paid implementation", "annual conversion decision"],
  commercial_rules: ["implementation priced separately", "minimum platform fee", "annual agreement preferred", "no bespoke feature unless funded", "at least 70% of funded integration must be reusable"],
};

export const SALES_PLAYS = [
  {
    ...gnkCommon,
    play_id: "GNK-AI-01",
    name: "Production AI Workflow Sprint",
    target_account_definition: "A team with a valuable AI prototype or workflow that is not safe, controlled, or integrated enough for production.",
    hard_disqualifiers: ["vague desire to add AI", "prototype/demo only", "no system or data access", "no accountable owner", "no production consequence"],
    buyer_roles: { economic: "COO", technical: "CTO/VP Engineering", product: "VP Product", router: "Head of Engineering" },
    trigger_types: ["announced AI initiative", "AI/ML hiring", "agent project", "compliance/review pressure", "product launch"],
    problem_hypothesis: "The workflow is stuck between prototype and production because integration, evaluation, permissions, human approval, audit, fallback, or ownership is unresolved.",
    first_offer: "Production AI Workflow Sprint: one workflow integrated, evaluated, controlled, deployed, and transferred in four to six weeks.",
    price: { model: "one_time", min: 40000, max: 60000, unit: "sprint" },
    proof_required: ["production AI control checklist", "eval set and acceptance thresholds", "delivery/security process", "relevant case study"],
    discovery_questions: ["Which steps are deterministic, AI-suited, or must never be automated?", "What thresholds define acceptable output?", "Where must a human approve?", "What happens on failure?"],
    success_metrics: ["one controlled production workflow", "eval thresholds met", "approval/audit/fallback in place", "internal handoff accepted"],
    expansion_path: "Three-month workflow ownership pod → managed AI reliability retainer.",
  },
  {
    ...gnkCommon,
    play_id: "GNK-BE-01",
    name: "Backend Risk and Stabilization Sprint",
    target_account_definition: "A company with a business-critical backend, incident, scaling issue, migration, fragile integration, legacy boundary, or troubled build.",
    hard_disqualifiers: ["staff augmentation request", "broad rewrite without a bounded production outcome", "no access", "no measurable business or reliability consequence"],
    buyer_roles: { economic: "CTO", technical: "VP Engineering/Platform Lead", product: null, router: "Engineering Manager" },
    trigger_types: ["public incident", "platform/reliability hiring", "migration", "major integration", "new CTO", "stalled vendor project"],
    problem_hypothesis: "A critical system boundary is unsafe or expensive to change and is consuming senior attention while a delivery or reliability commitment is at risk.",
    first_offer: "Backend Risk and Stabilization Sprint on one critical path, including tests, observability, rollback, deployment, and transfer.",
    price: { model: "one_time", min: 35000, max: 50000, unit: "sprint" },
    proof_required: ["backend rescue/stabilization case study", "delivery and access process", "measurable reliability evidence"],
    discovery_questions: ["Which path is hardest or riskiest to change?", "What incident, deadline, scale, or migration makes it urgent?", "What measurable threshold means stabilized?"],
    success_metrics: ["critical path stabilized in production", "tests/observability/rollback accepted", "risk reduced against baseline", "next ownership decision documented"],
    expansion_path: "Three-month platform ownership pod → managed reliability retainer.",
  },
  {
    ...gnkCommon,
    play_id: "GNK-DATA-01",
    name: "Data and Operations Automation Sprint",
    target_account_definition: "An operations-heavy company with an expensive workflow crossing spreadsheets, manual handoffs, or brittle business systems.",
    hard_disqualifiers: ["one-off automation task", "no measurable operational cost", "no owner", "no usable data/system access"],
    buyer_roles: { economic: "COO", technical: "Head of Engineering", product: null, router: "Director of Business Systems/Operations" },
    trigger_types: ["operations hiring", "scale-up", "systems migration", "data-quality pressure", "customer complaints", "manual process growth"],
    problem_hypothesis: "A business-critical workflow still crosses manual handoffs, creating delay, rework, errors, and avoidable operating cost.",
    first_offer: "Data and Operations Automation Sprint: map the workflow and put the highest-cost handoff into production with controls and transfer.",
    price: { model: "one_time", min: 40000, max: 60000, unit: "sprint" },
    proof_required: ["before/after workflow case study", "delivery process", "reusable code and operating notes"],
    discovery_questions: ["Which handoff is most expensive?", "What is the current time/error/cost baseline?", "Who owns each input and output?"],
    success_metrics: ["one high-cost handoff automated in production", "time/error/cost improvement measured", "operating handoff accepted"],
    expansion_path: "Three-month operations-systems ownership pod across adjacent workflows.",
  },
  {
    play_id: "OHUB-ISP-01",
    brand: "outagehub",
    strategy_version: STRATEGY_VERSION,
    name: "Operational Pilot — Regional ISP/Telecom",
    target_account_definition: "A regional Canadian ISP/telecom whose NOC, support, or service-delivery team needs external power context for triage and communications.",
    hard_disqualifiers: ["no Canadian footprint", "outage data is only a curiosity", "expects replacement of internal telemetry", "procurement-only route"],
    buyer_roles: { economic: "Head of Network Operations", technical: "Platform/Solutions Architect", operational: "NOC Manager/Service Delivery", router: "Customer Operations" },
    trigger_types: ["footprint expansion", "acquisition", "incident", "support pressure", "network operations hiring", "customer complaint"],
    problem_hypothesis: "NOC/support teams manually cross-check external power status, slowing incident explanation, routing, and customer communications.",
    first_offer: "Paid operational pilot for one region, asset/customer set, and triage or communication decision.",
    price: { model: "recurring_plus_implementation", implementation: { min: 7500, max: 15000, unit: "one_time" }, recurring: { min: 2500, max: 5000, unit: "month" } },
    pilot_terms: pilotTerms,
    proof_required: ["coverage report for footprint", "sample normalized payload", "confidence/freshness behavior", "delivery and limitation page"],
    discovery_questions: ["Which decision changes when external power is confirmed?", "Which region and systems should be tested?", "What coverage, confidence, and freshness are decision-grade?"],
    success_metrics: ["useful coverage/freshness", "fewer manual checks", "faster incident explanation/routing", "annual conversion decision"],
    expansion_path: "Annual operations contract expanding by region, sites, workflows, and support-system integration.",
  },
  {
    play_id: "OHUB-EMBED-01",
    brand: "outagehub",
    strategy_version: STRATEGY_VERSION,
    name: "Embedded Evaluation — Software Platform",
    target_account_definition: "A Canadian-exposed facilities, property, emergency-notification, IoT, support, insurance, or operations platform that can embed outage intelligence for downstream users.",
    hard_disqualifiers: ["no Canadian downstream exposure", "no product/engineering owner", "one-off map integration", "custom fork below funding threshold"],
    buyer_roles: { economic: "VP Product", technical: "CTO/VP Engineering/Solutions Architect", product: "Head of Product", router: "Platform Lead" },
    trigger_types: ["Canada expansion", "roadmap dependency", "integration hiring", "customer commitment", "product launch", "new partnership"],
    problem_hypothesis: "The platform needs maintained Canadian power-event context inside one customer workflow, but owning the normalized data layer would distract the product team.",
    first_offer: "Paid embedded evaluation for one downstream workflow, including implementation, coverage proof, webhook/API delivery, and rollout recommendation.",
    price: { model: "recurring_plus_implementation", implementation: { min: 15000, max: 30000, unit: "one_time" }, recurring: { min: 7500, max: 15000, unit: "month" } },
    pilot_terms: pilotTerms,
    proof_required: ["API docs and samples", "error/freshness/confidence behavior", "integration example", "coverage and limitation report"],
    discovery_questions: ["Which downstream workflow consumes outage state first?", "What fields, delivery behavior, and service expectations matter?", "How many customers/regions could follow?"],
    success_metrics: ["one workflow integrated", "coverage/freshness accepted", "reusable implementation", "annual rollout recommendation accepted"],
    expansion_path: "Annual embedded contract expanding by downstream customers, regions, volume, and workflows.",
  },
  {
    play_id: "OHUB-FAC-01",
    brand: "outagehub",
    strategy_version: STRATEGY_VERSION,
    name: "Portfolio Monitoring Pilot — Multi-site Operations",
    target_account_definition: "A Canadian multi-site operator with outage-sensitive warehouses, cold storage, greenhouses, care facilities, telecom sites, property, or field-service locations.",
    hard_disqualifiers: ["single site", "no Canadian exposure", "no operational owner", "one-off map lookup", "manual monitoring service expectation"],
    buyer_roles: { economic: "Regional Operations", technical: "Business Systems", operational: "Facilities/Field Operations Director", router: "Emergency Preparedness" },
    trigger_types: ["portfolio expansion", "facilities hiring", "weather readiness", "generator/maintenance program", "incident", "regulatory change"],
    problem_hypothesis: "Operators manually chase outage status across sites, delaying escalation, dispatch, and stakeholder communications.",
    first_offer: "Paid portfolio-monitoring pilot for a defined site set, one escalation decision, and webhook or alert workflow.",
    price: { model: "recurring_plus_implementation", implementation: { min: 5000, max: 15000, unit: "one_time" }, recurring: { min: 1500, max: 5000, unit: "month" } },
    pilot_terms: pilotTerms,
    proof_required: ["site coverage/matching report", "confidence and stale-event controls", "incident timeline", "delivery/audit history"],
    discovery_questions: ["Which sites and decision should be tested first?", "Who responds and through which system?", "What false/stale alert tolerance is acceptable?"],
    success_metrics: ["sites mapped", "actionable events detected", "false/stale alerts controlled", "operator time reduced", "annual conversion decision"],
    expansion_path: "Annual portfolio contract expanding by sites, regions, analytics, and workflows.",
  },
];

export const SEQUENCE_POLICIES = {
  gnk: {
    touch_count: 4,
    send_days: [1, 4, 10, 18],
    motion: "high-trust, trigger-led founder outreach supporting warm introductions and partner routes",
    touches: ["specific trigger and relevant sprint", "useful technical point of view", "acceptance/outcome shape or paid shaping option", "router-friendly close"],
  },
  outagehub: {
    touch_count: 5,
    send_days: [1, 4, 9, 16, 25],
    motion: "workflow-led paid-pilot sale with technical and operational proof",
    touches: ["observed workflow and pilot hypothesis", "coverage/confidence proof", "implementation and success criteria", "annual expansion economics", "router-friendly close"],
  },
};

export const PLAYS_BY_ID = Object.fromEntries(SALES_PLAYS.map((p) => [p.play_id, p]));
export const PLAYS_BY_BRAND = SALES_PLAYS.reduce((m, p) => ((m[p.brand] ||= []).push(p.play_id), m), {});
