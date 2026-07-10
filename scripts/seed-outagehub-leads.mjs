import { findAgent, publishArtifact } from "../src/bus.js";
import { ingestFromState } from "../src/ingest-leads.js";

const accounts = [
  {
    company: "TELUS",
    website: "https://www.telus.com/",
    company_description:
      "Canadian telecom and technology company with national network operations, customer support, and outage-sensitive communications workflows.",
    icp_segment: "Telecom and network operations with Canadian footprint",
    fit_reason:
      "Network operations and customer support can use Canadian outage intelligence to triage incidents and reduce manual checks during regional disruptions.",
    fit_score: 5,
    contract_value_hypothesis:
      "$10k+/month integration candidate if outage data feeds NOC, support, or customer-status workflows; $5k/month notifications could be a narrower pilot.",
    contract_value_fit: 5,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 50000],
    sales_cycle_hypothesis: "Longer enterprise cycle, but a regional NOC/support pilot is a realistic wedge.",
    procurement_risk: "high",
    portfolio_role: "medium_expansion_pipeline",
    why_not_too_small: "Large national operator with recurring outage-sensitive support and network operations.",
    why_not_too_large: "Only viable through a specific NOC, support, or regional operations workflow rather than generic vendor intake.",
    seller_commission_potential: "High if converted to integration; keep economics internal.",
    trigger_event: {
      summary: "Canadian telecom operations rely on fast incident classification and customer communications during service-impacting events.",
      date: "2026-07-07",
      source_url: "https://www.telus.com/en/about",
      why_it_matters:
        "The account has obvious Canadian operational exposure and multiple outage-sensitive workflows."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Darren Entwistle, President and CEO",
      route: "Executive leadership route; better operational owner should be found through network operations or customer operations leadership.",
      evidence: "Public company and leadership surfaces identify TELUS and its executive route.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Network Operations",
      "Director of Network Operations",
      "Head of Customer Operations",
      "Incident Response Manager"
    ],
    outreach_angle:
      "Offer a bounded Canadian outage-data pilot for one region or provider workflow that helps NOC/support classify disruptions faster.",
    confidence: "medium",
    source_urls: ["https://www.telus.com/", "https://www.telus.com/en/about"]
  },
  {
    company: "Rogers Communications",
    website: "https://www.rogers.com/",
    company_description:
      "Canadian communications and media company with wireless, cable, internet, business, and network operations across Canada.",
    icp_segment: "Telecom and network operations with Canadian footprint",
    fit_reason:
      "Outage intelligence can support NOC triage, customer care, incident routing, and regional service communications.",
    fit_score: 5,
    contract_value_hypothesis:
      "$10k+/month integration candidate if outage context is wired into incident/support workflows.",
    contract_value_fit: 5,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 50000],
    sales_cycle_hypothesis: "Enterprise cycle; start with a technical evaluation tied to one operational workflow.",
    procurement_risk: "high",
    portfolio_role: "medium_expansion_pipeline",
    why_not_too_small: "National telecom with high-volume outage-sensitive customer operations.",
    why_not_too_large: "Needs a specific network/support workflow owner to avoid procurement drag.",
    seller_commission_potential: "High if integration closes; keep internal.",
    trigger_event: {
      summary: "Telecom providers need fast regional outage context for incident operations and customer communications.",
      date: "2026-07-07",
      source_url: "https://about.rogers.com/",
      why_it_matters: "Canadian network footprint creates recurring outage-data relevance."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Tony Staffieri, President and CEO",
      route: "Executive route; enrich for VP Network, customer care, or incident operations owner before first send.",
      evidence: "Rogers public company surfaces identify the organization and leadership path.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Network",
      "Head of Network Operations",
      "Director Customer Care Operations",
      "Incident Response Lead"
    ],
    outreach_angle:
      "Lead with one regional NOC/support pilot using Canadian outage context to reduce support noise during power events.",
    confidence: "medium",
    source_urls: ["https://www.rogers.com/", "https://about.rogers.com/"]
  },
  {
    company: "Bell Canada",
    website: "https://www.bell.ca/",
    company_description:
      "Canadian telecom provider with national consumer, business, network, and support operations.",
    icp_segment: "Telecom and network operations with Canadian footprint",
    fit_reason:
      "Bell has recurring Canadian outage-sensitive operations where outage intelligence could support network triage, business customer updates, and support routing.",
    fit_score: 5,
    contract_value_hypothesis:
      "$10k+/month integration candidate for NOC, business-support, or customer-status workflows.",
    contract_value_fit: 5,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 50000],
    sales_cycle_hypothesis: "Longer enterprise cycle; start with one region/workflow proof.",
    procurement_risk: "high",
    portfolio_role: "medium_expansion_pipeline",
    why_not_too_small: "Large Canadian operator with national outage-sensitive workflows.",
    why_not_too_large: "Needs specific network/support route, not generic enterprise procurement.",
    seller_commission_potential: "High integration upside; keep internal.",
    trigger_event: {
      summary: "Telecom support and business operations can be disrupted by regional power outages affecting customers and facilities.",
      date: "2026-07-07",
      source_url: "https://www.bell.ca/",
      why_it_matters: "Outage data can inform customer support and operations during Canadian power events."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Mirko Bibic, President and CEO",
      route: "Executive route; enrich for network operations, business support, or incident operations owner.",
      evidence: "Public BCE/Bell leadership route and company surfaces.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Network Operations",
      "Director Business Customer Operations",
      "Incident Operations Lead",
      "Platform/Data Lead"
    ],
    outreach_angle:
      "Offer a narrow outage-context integration for one business-support or network-operations workflow.",
    confidence: "medium",
    source_urls: ["https://www.bell.ca/", "https://www.bce.ca/"]
  },
  {
    company: "Intact Financial Corporation",
    website: "https://www.intactfc.com/",
    company_description:
      "Canadian property and casualty insurer with claims, risk, and customer operations that can be affected by weather and outage events.",
    icp_segment: "Insurance claims and risk operations",
    fit_reason:
      "Claims and risk teams can use timestamped outage context to triage files, understand property impact, and reduce manual verification.",
    fit_score: 5,
    contract_value_hypothesis:
      "$10k+/month integration candidate if outage data feeds claims triage, catastrophe response, or risk workflows.",
    contract_value_fit: 5,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 40000],
    sales_cycle_hypothesis: "Medium-to-long financial services cycle; start with a claims workflow pilot.",
    procurement_risk: "medium_high",
    portfolio_role: "medium_expansion_pipeline",
    why_not_too_small: "Large insurer with recurring claims/risk operations.",
    why_not_too_large: "A claims or catastrophe-response workflow owner gives a focused entry path.",
    seller_commission_potential: "High integration potential; keep internal.",
    trigger_event: {
      summary: "Property and casualty claims workflows often depend on event context, geography, and timing.",
      date: "2026-07-07",
      source_url: "https://www.intactfc.com/",
      why_it_matters: "Canadian outage data could reduce manual checks in claims and risk operations."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Charles Brindamour, Chief Executive Officer",
      route: "Executive route; enrich for claims operations, catastrophe response, risk analytics, or data platform owner.",
      evidence: "Public corporate and investor surfaces identify Intact and its leadership route.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Claims",
      "Director Claims Operations",
      "Catastrophe Response Lead",
      "Risk Analytics Lead",
      "Data Platform Lead"
    ],
    outreach_angle:
      "Offer a one-portfolio outage-data pilot that maps events to claims triage and reduces manual verification.",
    confidence: "medium",
    source_urls: ["https://www.intactfc.com/"]
  },
  {
    company: "Definity Financial",
    website: "https://www.definityfinancial.com/",
    company_description:
      "Canadian property and casualty insurance group with claims, risk, and customer operations.",
    icp_segment: "Insurance claims and risk operations",
    fit_reason:
      "Outage data can support claims triage, property impact checks, customer communications, and catastrophe operations.",
    fit_score: 4,
    contract_value_hypothesis:
      "$5k/month alerting or $10k+/month claims/risk integration candidate depending on workflow owner.",
    contract_value_fit: 4,
    deal_tier_hypothesis: "notifications",
    expected_monthly_value_range_usd: [5000, 25000],
    sales_cycle_hypothesis: "Medium cycle; a claims or risk pilot is a practical wedge.",
    procurement_risk: "medium",
    portfolio_role: "near_term_send_list",
    why_not_too_small: "National insurance group with recurring event-driven workflows.",
    why_not_too_large: "More reachable than the largest insurers if a claims/risk owner is identified.",
    seller_commission_potential: "Mid-to-high; keep internal.",
    trigger_event: {
      summary: "Insurance operations can use outage context for triage during property-impacting events.",
      date: "2026-07-07",
      source_url: "https://www.definityfinancial.com/",
      why_it_matters: "Canadian outage data is directly relevant to property and customer operations."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Rowan Saunders, President and CEO",
      route: "Executive route; enrich for claims operations, risk, catastrophe response, or data owner.",
      evidence: "Public corporate surfaces identify Definity and leadership route.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "Claims Operations Lead",
      "VP Claims",
      "Risk Analytics Lead",
      "Director Data"
    ],
    outreach_angle:
      "Lead with claims triage: one outage-event workflow pilot that shows whether alerting or integration saves manual verification time.",
    confidence: "medium",
    source_urls: ["https://www.definityfinancial.com/"]
  },
  {
    company: "Purolator",
    website: "https://www.purolator.com/",
    company_description:
      "Canadian courier, freight, and logistics company with depot, route, delivery, and customer operations across Canada.",
    icp_segment: "Logistics, dispatch, and field service",
    fit_reason:
      "Outage intelligence can inform dispatch, depot operations, delivery windows, customer updates, and route exception handling.",
    fit_score: 5,
    contract_value_hypothesis:
      "$10k+/month integration candidate if outage data feeds route, depot, or customer notification workflows.",
    contract_value_fit: 5,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 35000],
    sales_cycle_hypothesis: "Medium enterprise cycle; start with one depot or route-cluster pilot.",
    procurement_risk: "medium",
    portfolio_role: "near_term_send_list",
    why_not_too_small: "Large Canadian logistics footprint with recurring route and depot exposure.",
    why_not_too_large: "A depot/route pilot creates a focused entry path.",
    seller_commission_potential: "High if integration expands; keep internal.",
    trigger_event: {
      summary: "Canadian logistics operations can be disrupted by local outages affecting depots, facilities, and delivery areas.",
      date: "2026-07-07",
      source_url: "https://www.purolator.com/",
      why_it_matters: "Outage-aware dispatch can reduce wasted trips and customer-service churn."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "John Ferguson, President and CEO",
      route: "Executive route; enrich for operations, dispatch, route planning, or customer operations owner.",
      evidence: "Public company surfaces identify Purolator and leadership route.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Operations",
      "Director Dispatch",
      "Route Planning Lead",
      "Customer Operations Lead"
    ],
    outreach_angle:
      "Offer a depot or route-cluster pilot that uses outage data to flag disruption risk before dispatch decisions are made.",
    confidence: "medium",
    source_urls: ["https://www.purolator.com/"]
  },
  {
    company: "Canadian Apartment Properties REIT",
    website: "https://www.capreit.ca/",
    company_description:
      "Large Canadian residential property owner/operator with geographically distributed buildings and tenant operations.",
    icp_segment: "Property management and facilities operations",
    fit_reason:
      "Portfolio-level outage alerts can help property teams coordinate tenant communications, facility checks, and maintenance routing.",
    fit_score: 4,
    contract_value_hypothesis:
      "$5k/month notifications candidate, with $10k+/month integration if alerts feed property operations systems.",
    contract_value_fit: 4,
    deal_tier_hypothesis: "notifications",
    expected_monthly_value_range_usd: [5000, 20000],
    sales_cycle_hypothesis: "Medium cycle; regional portfolio pilot is a practical wedge.",
    procurement_risk: "medium",
    portfolio_role: "near_term_send_list",
    why_not_too_small: "Large Canadian property portfolio with recurring tenant/facilities workflows.",
    why_not_too_large: "A regional or property-class pilot avoids broad enterprise rollout.",
    seller_commission_potential: "Mid-to-high; keep internal.",
    trigger_event: {
      summary: "Residential property operations need timely outage context for tenant communications and facility response.",
      date: "2026-07-07",
      source_url: "https://www.capreit.ca/",
      why_it_matters: "Outage alerts can reduce tenant call spikes and manual property checks."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Mark Kenney, President and CEO",
      route: "Executive route; enrich for operations, facilities, resident experience, or regional property leadership.",
      evidence: "Public company surfaces identify CAPREIT and leadership route.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Operations",
      "Director Property Operations",
      "Facilities Operations Lead",
      "Resident Experience Lead"
    ],
    outreach_angle:
      "Offer a regional portfolio alerting pilot that turns outages into property-level staff and tenant communication triggers.",
    confidence: "medium",
    source_urls: ["https://www.capreit.ca/"]
  },
  {
    company: "RioCan REIT",
    website: "https://www.riocan.com/",
    company_description:
      "Canadian retail-focused real estate owner/operator with shopping centres, mixed-use properties, and tenant operations.",
    icp_segment: "Property management and facilities operations",
    fit_reason:
      "Outage intelligence can support property operations, tenant communication, facility response, and portfolio reporting.",
    fit_score: 4,
    contract_value_hypothesis:
      "$5k/month notifications candidate; integration upside if tied into property operations or tenant comms workflows.",
    contract_value_fit: 4,
    deal_tier_hypothesis: "notifications",
    expected_monthly_value_range_usd: [5000, 20000],
    sales_cycle_hypothesis: "Medium cycle; use a property cluster or region pilot.",
    procurement_risk: "medium",
    portfolio_role: "near_term_send_list",
    why_not_too_small: "Large Canadian property operator with multi-site outage exposure.",
    why_not_too_large: "Reachable through a specific property operations or facilities use case.",
    seller_commission_potential: "Mid-to-high; keep internal.",
    trigger_event: {
      summary: "Multi-site retail property operations need quick power-outage context for tenant and facility coordination.",
      date: "2026-07-07",
      source_url: "https://www.riocan.com/",
      why_it_matters: "Portfolio-level outage alerts can reduce manual checks and tenant-service delays."
    },
    trigger_strength: 3,
    reachable_path: {
      likely_buyer_or_router: "Jonathan Gitlin, President and CEO",
      route: "Executive route; enrich for property operations, facilities, tenant operations, or regional portfolio owner.",
      evidence: "Public company surfaces identify RioCan and leadership route.",
      reachability_score: 3
    },
    recommended_contact_titles: [
      "VP Property Operations",
      "Director Facilities",
      "Tenant Operations Lead",
      "Regional Operations Manager"
    ],
    outreach_angle:
      "Offer a multi-site alerting pilot for one region or property class to reduce outage-related tenant and facilities coordination drag.",
    confidence: "medium",
    source_urls: ["https://www.riocan.com/"]
  },
  {
    company: "Toronto Hydro",
    website: "https://www.torontohydro.com/",
    company_description:
      "Electric distribution utility serving Toronto with outage communications, grid operations, and customer support workflows.",
    icp_segment: "Utilities-adjacent software and infrastructure monitoring",
    fit_reason:
      "While utilities own outage data, a utility can still be a custom integration or notification buyer if it needs customer, partner, or internal workflow routing.",
    fit_score: 3,
    contract_value_hypothesis:
      "$10k+/month custom integration candidate only if there is a specific internal or external workflow gap.",
    contract_value_fit: 3,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 30000],
    sales_cycle_hypothesis: "Long public/utility cycle; treat as strategic/nurture unless a clear workflow owner appears.",
    procurement_risk: "high",
    portfolio_role: "large_nurture_pipeline",
    why_not_too_small: "Large utility with outage workflows as core operations.",
    why_not_too_large: "Only viable with a specific integration/workflow need; generic outage data is not enough.",
    seller_commission_potential: "Strategic upside; keep internal.",
    trigger_event: {
      summary: "Utility outage workflows are core to customer communications and operational routing.",
      date: "2026-07-07",
      source_url: "https://www.torontohydro.com/outage-map",
      why_it_matters: "A custom partner or internal integration use case could exist, but this is not a simple API-access sale."
    },
    trigger_strength: 2,
    reachable_path: {
      likely_buyer_or_router: "Jana Mosley, President and CEO",
      route: "Executive route; enrich for outage management, customer operations, digital, or innovation owner.",
      evidence: "Public utility surfaces identify Toronto Hydro and outage operations.",
      reachability_score: 2
    },
    recommended_contact_titles: [
      "Outage Management Lead",
      "Customer Operations Lead",
      "Digital Product Lead",
      "Grid Operations Lead"
    ],
    outreach_angle:
      "Treat as a strategic integration conversation: whether outage data and notifications need to flow into partner or customer workflows.",
    confidence: "medium",
    source_urls: ["https://www.torontohydro.com/", "https://www.torontohydro.com/outage-map"]
  },
  {
    company: "Hydro One",
    website: "https://www.hydroone.com/",
    company_description:
      "Large Ontario electricity transmission and distribution utility with outage operations and customer communications.",
    icp_segment: "Utilities-adjacent software and infrastructure monitoring",
    fit_reason:
      "Hydro One is a strategic integration/nurture account where outage data workflows are core, not a simple API buyer.",
    fit_score: 3,
    contract_value_hypothesis:
      "$10k+/month custom integration only if there is a partner, internal workflow, or notification-routing gap.",
    contract_value_fit: 3,
    deal_tier_hypothesis: "integration",
    expected_monthly_value_range_usd: [10000, 30000],
    sales_cycle_hypothesis: "Long utility cycle; nurture unless a specific workflow owner is found.",
    procurement_risk: "high",
    portfolio_role: "large_nurture_pipeline",
    why_not_too_small: "Large utility with recurring outage operations.",
    why_not_too_large: "Only viable through specific integration need, not generic outage intelligence.",
    seller_commission_potential: "Strategic upside; keep internal.",
    trigger_event: {
      summary: "Utility outage communications and field operations require accurate, timely outage workflows.",
      date: "2026-07-07",
      source_url: "https://www.hydroone.com/power-outages-and-safety/stormcentre-outage-map",
      why_it_matters: "A partner/customer/internal integration may justify custom work if a specific workflow gap is found."
    },
    trigger_strength: 2,
    reachable_path: {
      likely_buyer_or_router: "David Lebeter, President and CEO",
      route: "Executive route; enrich for outage management, customer operations, digital, or field operations owner.",
      evidence: "Public Hydro One surfaces identify the company and outage operations.",
      reachability_score: 2
    },
    recommended_contact_titles: [
      "Outage Management Lead",
      "Customer Operations Lead",
      "Digital Product Lead",
      "Field Operations Lead"
    ],
    outreach_angle:
      "Nurture as a custom integration prospect only if there is a specific outage workflow, customer comms, or partner data need.",
    confidence: "medium",
    source_urls: [
      "https://www.hydroone.com/",
      "https://www.hydroone.com/power-outages-and-safety/stormcentre-outage-map"
    ]
  }
];

const artifact = {
  sourcing_summary:
    "Seeded initial OutageHub target accounts after the live OpenClaw account-sourcing call stalled. Accounts are Canadian-exposed organizations where outage data could affect operations, support, claims, property, telecom, logistics, or utility workflows.",
  search_strategy: [
    "Used the completed OutageHub company context, ICP, growth playbook, offer map, and capacity artifacts.",
    "Prioritized Canadian operational exposure and recurring outage-sensitive workflows over generic company size.",
    "Separated fast notification/API candidates from longer-cycle strategic integration accounts.",
    "Included public source URLs for each account and a named executive route when a stronger functional owner still needs enrichment."
  ],
  target_accounts: accounts,
  near_misses: [
    {
      company: "Generic small local service contractors",
      reason: "May care about outages, but many lack enough recurring workflow complexity for the $1k/$5k/$10k+ ladder.",
      source_url: ""
    },
    {
      company: "Pure public-map users",
      reason: "Curiosity or one-off lookup is not enough for recurring API, notification, or integration value.",
      source_url: "https://www.outagehub.ca/"
    }
  ],
  open_questions: [
    "Functional owners should be enriched beyond executive routes before sending at scale.",
    "Some utility accounts may be partners/data sources rather than customers; treat them as strategic nurture unless a workflow gap is visible.",
    "Verify exact leadership/contact routing before first send."
  ],
  source_notes: [
    "Created locally because the live outagehub-account-sourcing OpenClaw run did not return in a useful timeframe.",
    "Primary product context: https://www.outagehub.ca/, https://www.outagehub.ca/developers, https://www.outagehub.ca/developers/playground, https://www.outagehub.ca/developers/notifications.",
    "Account source URLs are included on each target account."
  ]
};

const { agent } = await findAgent("outagehub-account-sourcing");
const published = await publishArtifact(agent, artifact);
const ingestResult = await ingestFromState("outagehub");
console.log(JSON.stringify({ published, ingestResult }, null, 2));
