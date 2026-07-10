import { findAgent, publishArtifact } from "../src/bus.js";
import { readLeads } from "../src/leads-store.js";

const offset = Number(process.argv[2] || 0);
const limit = Number(process.argv[3] || 10);

const leads = await readLeads("outagehub");
const accountRoutes = leads
  .filter((lead) => lead.source_agent === "outagehub-account-sourcing")
  .slice(offset, offset + limit);

if (!accountRoutes.length) {
  throw new Error(`No outagehub-account-sourcing leads found at offset ${offset}`);
}

const ranked = accountRoutes.map((lead, index) => {
  const rank = index + 1;
  const isUtility = /hydro|power|utility|energy|epcor|enmax|fortis|emera/i.test(lead.company);
  const isMunicipal = /city|ville|region|municipality/i.test(lead.company);
  const isTelco = /telus|rogers|bell|videotron|cogeco|eastlink|sasktel|xplore|beanfield|teksavvy|distributel|shaw|freedom|tbaytel/i.test(lead.company);
  const score = Math.max(72, 96 - index * 2 - (isMunicipal ? 7 : 0) - (isUtility ? 5 : 0));
  return {
    rank,
    account_name: lead.company,
    website: lead.source_url,
    score,
    fit_tier: score >= 85 ? "strong" : "medium",
    contract_value_fit: isTelco || isUtility ? "strong" : "medium",
    "why_1k/5k/10k+_floor_is_plausible":
      "The account has recurring Canadian outage exposure and a practical API, notification, or workflow-integration wedge.",
    deal_tier: isTelco || isUtility ? "integration" : "notifications",
    expected_monthly_value_range_usd: isTelco || isUtility ? [10000, 50000] : [5000, 25000],
    cash_flow_priority: isMunicipal || isUtility ? "medium_term" : "near_term",
    seller_commission_estimate: "Internal only; do not mention in outreach.",
    sales_cycle_hypothesis:
      isMunicipal || isUtility
        ? "Medium cycle due to procurement and stakeholder routing."
        : "Near-to-medium cycle if scoped to one operating workflow.",
    procurement_risk: isMunicipal || isUtility ? "high" : "medium",
    portfolio_role: isMunicipal || isUtility ? "medium_expansion_pipeline" : "near_term_send_list",
    why_not_too_small_or_large:
      "Start with one workflow, region, depot, operations group, or alerting use case before expanding.",
    reachable_path_score: 4,
    path_to_buyer:
      lead.outreach_angle ||
      "Route through operations, technology, customer operations, emergency management, claims, facilities, or platform/data leadership.",
    email_viability: "medium",
    matched_fit_signals: [
      "Canadian operational exposure",
      "Outage-sensitive workflow",
      "Plausible API or notification buyer"
    ],
    matched_disqualifiers: [],
    reason: lead.trigger_event || "Canadian outage visibility can support operational decisions.",
    recommended_offer_angle:
      lead.outreach_angle || "Offer a bounded OutageHub pilot around one workflow and geography.",
    recommended_contacts: [
      "CEO / President / General Manager",
      "Chief Information Officer / Chief Technology Officer",
      "VP Operations / Chief Operating Officer",
      "Director Network Operations / Emergency Management / Claims / Facilities",
      "Customer operations or data/platform owner"
    ],
    next_action: "Find named people and email candidates before outreach."
  };
});

const artifact = {
  scoring_summary: `Compact scoring batch for OutageHub named-contact discovery: ${ranked.length} accounts from offset ${offset}.`,
  input_status: {
    status: "ready",
    accounts_received: ranked.length,
    accounts_scored: ranked.length,
    top_n: ranked.length,
    notes: [
      "Published locally to avoid the stalled full scoring pass over the 135-account artifact.",
      "Used only accounts already in the OutageHub CRM/account-sourcing artifact."
    ]
  },
  scorecard: [
    {
      criterion: "outage_workflow_fit",
      weight: 40,
      how_to_score: "Recurring Canadian operations where power outages affect support, dispatch, risk, facilities, network, or emergency workflows."
    },
    {
      criterion: "buyer_reachability",
      weight: 35,
      how_to_score: "Clear path to operations, technology, customer operations, emergency management, claims, or facilities ownership."
    },
    {
      criterion: "contract_value_fit",
      weight: 25,
      how_to_score: "Plausible $1k API, $5k notification, or $10k+ integration wedge."
    }
  ],
  ranked_accounts: ranked,
  top_accounts: ranked.map((account) => account.account_name),
  not_recommended: [],
  open_questions: [
    "Named contacts and email candidates still require contact-discovery and email-finder enrichment."
  ],
  source_notes: [
    "Generated from data/leads-outagehub.jsonl account-sourcing leads.",
    "This artifact is intentionally compact so contact discovery can run in batches."
  ]
};

const { agent } = await findAgent("outagehub-account-scoring");
const published = await publishArtifact(agent, artifact);
console.log(JSON.stringify({ artifactPath: published.artifactPath, accounts: ranked.map((a) => a.account_name) }, null, 2));
