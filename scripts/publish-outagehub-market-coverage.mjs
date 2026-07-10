import { findAgent, publishArtifact } from "../src/bus.js";
import { readLeads } from "../src/leads-store.js";

const leads = await readLeads("outagehub");

function countWhere(predicate) {
  return leads.filter(predicate).length;
}

function companiesFor(segment) {
  return [...new Set(leads.filter((lead) => lead.segment === segment).map((lead) => lead.company))]
    .sort()
    .slice(0, 20);
}

const artifact = {
  market_coverage_summary:
    "OutageHub should not treat national carriers, major utilities, crown/postal/logistics organizations, or broad public-sector accounts as short-term just because a named executive exists. The short-term motion should focus on regional operators and mid-market teams with a reachable workflow owner and low procurement drag; the current CRM is heavy on enterprise logos, so short-term coverage is underbuilt.",
  coverage_sources: [
    {
      name: "CRTC telecommunications services and provider resources",
      url: "https://crtc.gc.ca/",
      why_it_matters: "Useful source path for Canadian telecom, ISP, and wireless-provider coverage."
    },
    {
      name: "Canadian Telecommunications Association",
      url: "https://canadatelecoms.ca/",
      why_it_matters: "Industry association context for Canadian wireless, internet, and telecom operators."
    },
    {
      name: "Competitive Network Operators of Canada",
      url: "https://cnoc.ca/",
      why_it_matters: "Coverage path for independent and competitive network operators beyond Bell/Rogers/TELUS."
    },
    {
      name: "Insurance Bureau of Canada",
      url: "https://www.ibc.ca/",
      why_it_matters: "Canadian property/casualty insurer ecosystem and claims/risk workflow context."
    },
    {
      name: "Canadian Trucking Alliance",
      url: "https://cantruck.ca/",
      why_it_matters: "Coverage path for Canadian transport, route, depot, and dispatch operators."
    },
    {
      name: "BOMA Canada",
      url: "https://bomacanada.ca/",
      why_it_matters: "Coverage path for building owners, managers, and facilities operations."
    },
    {
      name: "Canadian Urban Transit Association",
      url: "https://cutaactu.ca/",
      why_it_matters: "Coverage path for transit and municipal operations teams where power disruptions affect service."
    }
  ],
  industry_segments: [
    {
      segment: "Regional telecom, ISP, wireless ISP, and fibre operators",
      sales_motion: "short_term",
      why_outagehub_matters:
        "Regional network/support teams can use outage data to explain customer-impact patterns, reduce manual checks, and route outage-related support faster.",
      likely_buyers: ["VP Network Operations", "Director NOC", "Head of Customer Operations", "CTO", "Founder/GM"],
      best_first_offer: "$1k API evaluation or $5k managed notification pilot for one service area.",
      sales_cycle_expectation: "2-6 weeks when the owner is reachable.",
      procurement_drag: "low-to-medium",
      short_term_fit_rules: ["regional or independent operator", "named network/support owner", "service area in Canada", "email or direct routing path"],
      medium_term_fit_rules: ["larger regional carrier", "requires NOC/support integration", "multiple regions or brands"],
      long_term_fit_rules: ["national carrier", "only executive/procurement route", "no team-level owner"],
      account_types_to_cover: ["independent ISPs", "wireless ISPs", "regional fibre operators", "rural broadband providers", "business internet providers"],
      example_accounts: ["Beanfield", "TekSavvy", "Start.ca", "Execulink", "Tbaytel", "Novus", "Acanac", "Primus", "Vianet", "Storm Internet"],
      accounts_already_in_crm: companiesFor("Telecom and network"),
      coverage_gaps: ["Need more independent/regional provider contacts below national-carrier scale."],
      disqualifiers: ["Bell/Rogers/TELUS enterprise path with no NOC owner", "generic support inbox only"]
    },
    {
      segment: "Property management, facilities, multi-site operators, and REIT operating teams",
      sales_motion: "short_term",
      why_outagehub_matters:
        "Facilities teams can use outage alerts to coordinate tenants, buildings, security, and maintenance without checking utility maps manually.",
      likely_buyers: ["VP Property Operations", "Director Facilities", "Regional Operations Director", "Tenant Experience Lead"],
      best_first_offer: "$5k notification pilot for a portfolio, region, or building class.",
      sales_cycle_expectation: "2-8 weeks for regional/mid-market operators; longer for public REITs.",
      procurement_drag: "medium",
      short_term_fit_rules: ["private/regional operator", "multi-building portfolio", "ops/facilities contact", "tenant communication need"],
      medium_term_fit_rules: ["public REIT", "large property group", "needs regional approval"],
      long_term_fit_rules: ["very large institutional owner with no ops route"],
      account_types_to_cover: ["private property managers", "student housing", "seniors housing", "industrial parks", "retail plaza operators", "condo management"],
      example_accounts: ["Minto", "Hazelview", "Starlight", "Homestead", "Mainstreet", "Concert Properties", "Morguard", "GWL Realty Advisors"],
      accounts_already_in_crm: companiesFor("Property and facilities"),
      coverage_gaps: ["Current CRM skews to public REITs; add private/regional facilities operators."],
      disqualifiers: ["no recurring building operations", "only investor-relations route"]
    },
    {
      segment: "Restoration, field service, security monitoring, and home/commercial services",
      sales_motion: "short_term",
      why_outagehub_matters:
        "Dispatch-heavy teams can use outage data to prioritize calls, explain service interruptions, and trigger customer/staff notifications.",
      likely_buyers: ["VP Operations", "Dispatch Director", "Customer Operations Lead", "Regional GM"],
      best_first_offer: "$1k-$5k API/notification pilot for dispatch or customer exception workflows.",
      sales_cycle_expectation: "2-6 weeks if the operator owns dispatch decisions.",
      procurement_drag: "low-to-medium",
      short_term_fit_rules: ["dispatch team", "multi-region service footprint", "customer outage calls create workload", "reachable operations owner"],
      medium_term_fit_rules: ["large national brand", "requires call-centre integration"],
      long_term_fit_rules: ["only franchise-level route or no central ops owner"],
      account_types_to_cover: ["restoration firms", "HVAC/home services", "security monitoring", "generator services", "facility maintenance"],
      example_accounts: ["Reliance Home Comfort", "Enercare", "GardaWorld", "Paladin Security", "FirstOnSite", "ServiceMaster Restore", "Black & McDonald"],
      accounts_already_in_crm: ["Reliance Home Comfort", "Enercare", "GardaWorld", "Paladin Security", "Black & McDonald"],
      coverage_gaps: ["This is likely undercovered and should be a core short-term sourcing lane."],
      disqualifiers: ["single-location contractor", "no centralized dispatch or customer ops"]
    },
    {
      segment: "Insurance, claims, and property-risk teams",
      sales_motion: "medium_term",
      why_outagehub_matters:
        "Claims teams can use outage time/geography to triage property events and customer communications, but large carriers have procurement and compliance drag.",
      likely_buyers: ["Claims Operations", "Property Claims", "Risk/Data Operations", "Innovation/Digital Claims"],
      best_first_offer: "$5k claims workflow pilot before larger integration.",
      sales_cycle_expectation: "1-3 months for mid-market insurers; longer for national carriers.",
      procurement_drag: "medium-to-high",
      short_term_fit_rules: ["regional/mutual insurer", "named claims ops owner", "pilot without core-system integration"],
      medium_term_fit_rules: ["large insurer", "requires claims-system evaluation"],
      long_term_fit_rules: ["generic executive route only", "no claims owner"],
      account_types_to_cover: ["mutual insurers", "regional P&C", "claims administrators", "property-risk teams"],
      example_accounts: ["Gore Mutual", "SGI CANADA", "Northbridge", "Beneva", "CAA Insurance", "Sonnet", "Onlia"],
      accounts_already_in_crm: companiesFor("Insurance and claims"),
      coverage_gaps: ["Need more mutual/regional insurers, not only national carriers."],
      disqualifiers: ["life-only insurer", "no property/claims workflow"]
    },
    {
      segment: "Logistics, courier, route, depot, and transport operators",
      sales_motion: "medium_term",
      why_outagehub_matters:
        "Dispatch and depot teams can use outage context for route decisions and customer exceptions; national firms need team-level routing.",
      likely_buyers: ["VP Operations", "Dispatch Director", "Customer Experience", "Regional Operations"],
      best_first_offer: "$5k route/depot alerting pilot.",
      sales_cycle_expectation: "4-10 weeks for regional carriers; longer for Canada Post/FedEx/UPS.",
      procurement_drag: "medium",
      short_term_fit_rules: ["regional carrier", "named operations/dispatch owner", "one depot/region pilot"],
      medium_term_fit_rules: ["large private carrier", "multi-region workflow"],
      long_term_fit_rules: ["crown/national enterprise with only executive route"],
      account_types_to_cover: ["regional couriers", "LTL carriers", "cold chain", "last-mile delivery", "fleet operators"],
      example_accounts: ["Day & Ross", "Armour", "Manitoulin", "Canada Cartage", "Challenger", "Groupe Robert", "Kriska"],
      accounts_already_in_crm: companiesFor("Logistics and dispatch"),
      coverage_gaps: ["Need regional carrier ops contacts, not only CEOs of national firms."],
      disqualifiers: ["broker-only", "no operational fleet or dispatch"]
    },
    {
      segment: "Utilities, municipalities, emergency management, and public-sector operations",
      sales_motion: "long_term",
      why_outagehub_matters:
        "Strategically relevant but slow: these accounts need careful partner/data positioning and usually have procurement, regulatory, or reputational constraints.",
      likely_buyers: ["Emergency Management", "Customer Operations", "Digital Operations", "Grid Response", "CIO"],
      best_first_offer: "Partner-data workflow or public-communications pilot, only with a named team owner.",
      sales_cycle_expectation: "3-12 months unless a narrow team owner is already engaged.",
      procurement_drag: "high",
      short_term_fit_rules: ["rare: named team owner plus pilot authority"],
      medium_term_fit_rules: ["specific department owner and non-procurement pilot path"],
      long_term_fit_rules: ["generic procurement, public utility, municipality, national public-sector brand"],
      account_types_to_cover: ["municipal emergency management", "transit operations", "utility customer comms", "critical facilities"],
      example_accounts: ["Toronto Hydro", "Hydro One", "BC Hydro", "Hydro Ottawa", "City of Toronto", "City of Calgary", "TransLink", "TTC"],
      accounts_already_in_crm: [...companiesFor("Utilities and grid"), ...companiesFor("Municipal and emergency management teams")],
      coverage_gaps: ["Keep for credibility and strategic pipeline, but do not use to fill short-term traction."],
      disqualifiers: ["official partnership assumptions", "generic procurement only"]
    }
  ],
  portfolio_policy: {
    short_term:
      "Source regional telecom/ISP, field service/security/restoration, and private facilities/property operators with reachable workflow owners.",
    medium_term:
      "Work mid-market insurers, logistics firms, public REITs, and larger regional operators where routing is needed but a pilot is plausible.",
    long_term:
      "Keep national carriers, major utilities, large public-sector, and crown/national logistics accounts as strategic pipeline unless a team-level pilot owner appears.",
    how_to_treat_large_logos:
      "Bell, Rogers, TELUS, Hydro One, Toronto Hydro, Canada Post, FedEx, and similar logos are not short-term by default. They need a specific team owner, narrow first workflow, and routing proof.",
    how_to_find_unmissed_accounts:
      "Use industry association/member directories and regional provider lists by province, then enrich named operators before adding to Outreach."
  },
  bucket_overrides: [
    { match: "Bell Canada", bucket: "long_term", reason: "National carrier; procurement/routing drag unless a specific NOC/support owner is identified." },
    { match: "Rogers Communications", bucket: "long_term", reason: "National carrier; treat as strategic enterprise unless team-specific owner appears." },
    { match: "TELUS", bucket: "long_term", reason: "National carrier; not an easy close from executive route." },
    { match: "Hydro One", bucket: "long_term", reason: "Major utility; strategic/public-sector procurement path." },
    { match: "Toronto Hydro", bucket: "long_term", reason: "Utility; valuable but slow unless a specific customer/grid workflow owner routes in." },
    { match: "Canada Post", bucket: "long_term", reason: "Crown/national logistics account; do not treat as short-term." },
    { match: "FedEx Canada", bucket: "long_term", reason: "Large enterprise logistics; requires team-level owner." }
  ],
  sourcing_expansion_plan: [
    {
      priority: 1,
      segment: "Regional telecom, ISP, wireless ISP, and fibre operators",
      search_paths: ["CNOC/member lists", "province + independent ISP", "rural broadband provider Canada", "business fibre provider Canada"],
      target_account_count: 100,
      named_contact_strategy: "Find CTO, NOC, VP Network, support operations, or founder/GM.",
      why_this_fills_a_gap: "Current telecom coverage overweights national carriers; regional providers are more likely to buy a narrow API/notification pilot."
    },
    {
      priority: 2,
      segment: "Restoration, field service, security monitoring, and home/commercial services",
      search_paths: ["restoration companies Canada", "security monitoring Canada operations", "generator service Canada", "facility maintenance Canada"],
      target_account_count: 80,
      named_contact_strategy: "Find VP Operations, dispatch, regional GM, customer operations, or technology owner.",
      why_this_fills_a_gap: "Likely shortest path to operational notification use cases."
    },
    {
      priority: 3,
      segment: "Private property/facilities and multi-site operators",
      search_paths: ["BOMA Canada members", "property management companies Canada", "condo management Canada", "student housing Canada"],
      target_account_count: 80,
      named_contact_strategy: "Find property operations, facilities, tenant experience, or regional operations leaders.",
      why_this_fills_a_gap: "Current property coverage is public-REIT heavy; private operators may have less procurement drag."
    },
    {
      priority: 4,
      segment: "Regional logistics and fleet operators",
      search_paths: ["Canadian Trucking Alliance members", "regional courier Canada", "last mile delivery Canada", "LTL carrier Canada"],
      target_account_count: 60,
      named_contact_strategy: "Find dispatch, operations, customer experience, and regional depot owners.",
      why_this_fills_a_gap: "Route/depot outage context is clearer for regional operators than crown/national accounts."
    }
  ],
  claims_to_avoid: [
    "Do not imply Bell/Rogers/TELUS will be fast to close.",
    "Do not claim official utility partnership or complete national coverage.",
    "Do not treat account-route rows as send-ready people.",
    "Do not call a lead short-term unless an owner, workflow, and low-friction wedge are visible."
  ],
  open_questions: [
    "Which regional ISP/provider directories expose named NOC or operations owners?",
    "Which field-service/security/restoration companies publish direct operations leadership contacts?",
    "Which guessed email domains verify before sending?"
  ],
  source_notes: [
    `Current CRM counts before expansion: ${leads.length} rows, ${countWhere((lead) => lead.source_agent === "outagehub-contact-discovery")} named contacts.`,
    "This artifact is a deterministic market coverage backfill and should guide future sourcing/contact-discovery runs."
  ]
};

const { agent } = await findAgent("outagehub-market-coverage");
const published = await publishArtifact(agent, artifact);
console.log(JSON.stringify({ artifactPath: published.artifactPath, segments: artifact.industry_segments.length }, null, 2));
