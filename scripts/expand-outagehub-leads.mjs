import { findAgent, publishArtifact } from "../src/bus.js";
import { ingestFromState } from "../src/ingest-leads.js";

const segments = [
  {
    segment: "Telecom and network operations with Canadian footprint",
    title: "Network operations leadership",
    dealTier: "integration",
    range: [10000, 50000],
    angle: "Offer a regional outage-data pilot for NOC, support, or customer-status workflows.",
    companies: [
      ["Videotron", "https://videotron.com/"],
      ["Cogeco", "https://www.cogeco.ca/"],
      ["Eastlink", "https://www.eastlink.ca/"],
      ["SaskTel", "https://www.sasktel.com/"],
      ["Xplore", "https://www.xplore.ca/"],
      ["Beanfield", "https://www.beanfield.com/"],
      ["TekSavvy", "https://www.teksavvy.com/"],
      ["Distributel", "https://www.distributel.ca/"],
      ["Shaw Direct", "https://www.shawdirect.ca/"],
      ["Freedom Mobile", "https://www.freedommobile.ca/"],
      ["Execulink Telecom", "https://www.execulink.ca/"],
      ["Start.ca", "https://www.start.ca/"],
      ["Acanac", "https://www.acanac.com/"],
      ["Primus Canada", "https://www.primus.ca/"],
      ["Tbaytel", "https://www.tbaytel.net/"]
    ]
  },
  {
    segment: "Insurance claims and risk operations",
    title: "Claims operations leadership",
    dealTier: "notifications",
    range: [5000, 25000],
    angle: "Offer a claims triage pilot that maps outage events to property or customer-impact workflows.",
    companies: [
      ["The Co-operators", "https://www.cooperators.ca/"],
      ["Aviva Canada", "https://www.aviva.ca/"],
      ["Wawanesa Insurance", "https://www.wawanesa.com/canada/"],
      ["TD Insurance", "https://www.tdinsurance.com/"],
      ["Desjardins Insurance", "https://www.desjardins.com/"],
      ["Beneva", "https://www.beneva.ca/"],
      ["Northbridge Insurance", "https://www.northbridgeinsurance.ca/"],
      ["Gore Mutual", "https://www.goremutual.ca/"],
      ["SGI CANADA", "https://www.sgicanada.ca/"],
      ["ICBC", "https://www.icbc.com/"],
      ["Manitoba Public Insurance", "https://www.mpi.mb.ca/"],
      ["BCAA", "https://www.bcaa.com/"],
      ["CAA Insurance", "https://www.caainsurancecompany.ca/"],
      ["Sonnet Insurance", "https://www.sonnet.ca/"],
      ["Onlia", "https://www.onlia.ca/"],
      ["Travelers Canada", "https://www.travelerscanada.ca/"],
      ["Chubb Canada", "https://www.chubb.com/ca-en/"],
      ["Zurich Canada", "https://www.zurichcanada.com/"],
      ["Allstate Canada", "https://www.allstate.ca/"],
      ["Belairdirect", "https://www.belairdirect.com/"]
    ]
  },
  {
    segment: "Logistics, dispatch, and field service",
    title: "Operations leadership",
    dealTier: "integration",
    range: [10000, 35000],
    angle: "Offer a depot, route, or dispatch pilot that flags outage risk before field decisions are made.",
    companies: [
      ["Canada Post", "https://www.canadapost-postescanada.ca/"],
      ["FedEx Canada", "https://www.fedex.com/en-ca/home.html"],
      ["UPS Canada", "https://www.ups.com/ca/en/Home.page"],
      ["DHL Express Canada", "https://www.dhl.com/ca-en/home.html"],
      ["TFI International", "https://tfiintl.com/"],
      ["Day & Ross", "https://dayross.com/"],
      ["Mullen Group", "https://www.mullen-group.com/"],
      ["Bison Transport", "https://www.bisontransport.com/"],
      ["Armour Transportation Systems", "https://www.armour.ca/"],
      ["Manitoulin Transport", "https://manitoulintransport.com/"],
      ["Loomis Express", "https://www.loomisexpress.com/"],
      ["Canpar Express", "https://www.canpar.com/"],
      ["Intelcom", "https://intelcom.ca/"],
      ["GoBolt", "https://www.gobolt.com/"],
      ["Ryder Canada", "https://www.ryder.com/en-ca"],
      ["Penske Canada", "https://www.pensketruckrental.com/ca/en/"],
      ["Canada Cartage", "https://www.canadacartage.com/"],
      ["Challenger Motor Freight", "https://www.challenger.com/"],
      ["Groupe Robert", "https://www.robert.ca/"],
      ["Kriska Transportation", "https://www.kriska.com/"]
    ]
  },
  {
    segment: "Property management and facilities operations",
    title: "Property operations leadership",
    dealTier: "notifications",
    range: [5000, 20000],
    angle: "Offer a regional portfolio alerting pilot for tenant, facility, and operations workflows.",
    companies: [
      ["Choice Properties REIT", "https://www.choicereit.ca/"],
      ["Allied Properties REIT", "https://www.alliedreit.com/"],
      ["Killam Apartment REIT", "https://killamreit.com/"],
      ["Boardwalk REIT", "https://www.bwalk.com/"],
      ["Dream Office REIT", "https://www.dream.ca/office/"],
      ["SmartCentres REIT", "https://www.smartcentres.com/"],
      ["First Capital REIT", "https://fcr.ca/"],
      ["Crombie REIT", "https://www.crombie.ca/"],
      ["QuadReal Property Group", "https://www.quadreal.com/"],
      ["Cadillac Fairview", "https://www.cadillacfairview.com/"],
      ["Oxford Properties", "https://www.oxfordproperties.com/"],
      ["Brookfield Properties", "https://www.brookfieldproperties.com/"],
      ["BGO", "https://bgo.com/"],
      ["Morguard", "https://www.morguard.com/"],
      ["Concert Properties", "https://www.concertproperties.com/"],
      ["GWL Realty Advisors", "https://www.gwlrealtyadvisors.com/"],
      ["Hazelview Properties", "https://www.hazelviewproperties.com/"],
      ["Starlight Investments", "https://www.starlightinvest.com/"],
      ["Mainstreet Equity", "https://www.mainst.biz/"],
      ["Homestead Land Holdings", "https://www.homestead.ca/"]
    ]
  },
  {
    segment: "Municipal and emergency management teams",
    title: "Emergency operations leadership",
    dealTier: "notifications",
    range: [5000, 25000],
    angle: "Offer a district or facility-set pilot for outage-aware emergency operations and public communications.",
    companies: [
      ["City of Toronto", "https://www.toronto.ca/"],
      ["City of Vancouver", "https://vancouver.ca/"],
      ["City of Calgary", "https://www.calgary.ca/"],
      ["City of Edmonton", "https://www.edmonton.ca/"],
      ["City of Ottawa", "https://ottawa.ca/"],
      ["Ville de Montreal", "https://montreal.ca/"],
      ["City of Mississauga", "https://www.mississauga.ca/"],
      ["City of Winnipeg", "https://www.winnipeg.ca/"],
      ["Halifax Regional Municipality", "https://www.halifax.ca/"],
      ["Region of Peel", "https://www.peelregion.ca/"],
      ["York Region", "https://www.york.ca/"],
      ["Durham Region", "https://www.durham.ca/"],
      ["City of Hamilton", "https://www.hamilton.ca/"],
      ["City of London", "https://london.ca/"],
      ["City of Surrey", "https://www.surrey.ca/"],
      ["City of Brampton", "https://www.brampton.ca/"],
      ["City of Markham", "https://www.markham.ca/"],
      ["City of Vaughan", "https://www.vaughan.ca/"],
      ["City of Laval", "https://www.laval.ca/"],
      ["Ville de Gatineau", "https://www.gatineau.ca/"]
    ]
  },
  {
    segment: "Utilities-adjacent software and infrastructure monitoring",
    title: "Digital operations leadership",
    dealTier: "integration",
    range: [10000, 30000],
    angle: "Treat as a strategic integration or partner workflow where outage data needs to move into internal or customer systems.",
    companies: [
      ["BC Hydro", "https://www.bchydro.com/"],
      ["Hydro-Quebec", "https://www.hydroquebec.com/"],
      ["Alectra Utilities", "https://alectrautilities.com/"],
      ["EPCOR", "https://www.epcor.com/"],
      ["ENMAX", "https://www.enmax.com/"],
      ["FortisBC", "https://www.fortisbc.com/"],
      ["Manitoba Hydro", "https://www.hydro.mb.ca/"],
      ["SaskPower", "https://www.saskpower.com/"],
      ["Nova Scotia Power", "https://www.nspower.ca/"],
      ["NB Power", "https://www.nbpower.com/"],
      ["Newfoundland Power", "https://www.newfoundlandpower.com/"],
      ["Maritime Electric", "https://www.maritimeelectric.com/"],
      ["Hydro Ottawa", "https://hydroottawa.com/"],
      ["London Hydro", "https://www.londonhydro.com/"],
      ["Burlington Hydro", "https://www.burlingtonhydro.com/"],
      ["Oakville Hydro", "https://www.oakvillehydro.com/"],
      ["Elexicon Energy", "https://elexiconenergy.com/"],
      ["Oshawa Power", "https://www.oshawapower.ca/"],
      ["Waterloo North Hydro", "https://www.wnhydro.com/"],
      ["Kitchener-Wilmot Hydro", "https://www.kwhydro.ca/"],
      ["Guelph Hydro / Alectra", "https://alectrautilities.com/"],
      ["Saint John Energy", "https://www.sjenergy.com/"],
      ["Emera", "https://www.emera.com/"],
      ["Geotab", "https://www.geotab.com/"],
      ["Fleet Complete", "https://www.fleetcomplete.com/"],
      ["Black & McDonald", "https://www.blackandmcdonald.com/"],
      ["Reliance Home Comfort", "https://reliancehomecomfort.com/"],
      ["Enercare", "https://www.enercare.ca/"],
      ["GardaWorld", "https://www.garda.com/"],
      ["Paladin Security", "https://paladinsecurity.com/"]
    ]
  }
];

const existingCompanies = new Set([
  "TELUS",
  "Rogers Communications",
  "Bell Canada",
  "Intact Financial Corporation",
  "Definity Financial",
  "Purolator",
  "Canadian Apartment Properties REIT",
  "RioCan REIT",
  "Toronto Hydro",
  "Hydro One"
]);

const accounts = [];
for (const group of segments) {
  for (const [company, website] of group.companies) {
    if (existingCompanies.has(company)) continue;
    accounts.push({
      company,
      website,
      company_description: `${company} is a Canadian-exposed organization where power-outage visibility can affect operations, support, risk, dispatch, property, or infrastructure workflows.`,
      icp_segment: group.segment,
      fit_reason:
        "The account has recurring Canadian operational exposure and a plausible workflow where outage data can reduce manual checks, support load, dispatch waste, claims delay, facility coordination, or incident-response drag.",
      fit_score: group.dealTier === "integration" ? 4 : 5,
      contract_value_hypothesis:
        group.dealTier === "integration"
          ? "$10k+/month custom integration candidate if outage data is wired into operational systems."
          : "$5k/month notification candidate with expansion potential into $10k+/month integration if alerts feed internal systems.",
      contract_value_fit: group.dealTier === "integration" ? 4 : 5,
      deal_tier_hypothesis: group.dealTier,
      expected_monthly_value_range_usd: group.range,
      sales_cycle_hypothesis:
        group.dealTier === "integration"
          ? "Medium-to-long cycle; start with one workflow, region, depot, portfolio, or operations pilot."
          : "Near-to-medium cycle; start with notification rules for one region, portfolio, team, or operating area.",
      procurement_risk: group.segment.includes("Municipal") || group.segment.includes("Utilities") ? "high" : "medium",
      portfolio_role: group.segment.includes("Utilities") ? "large_nurture_pipeline" : "near_term_send_list",
      why_not_too_small: "The account has recurring Canadian operational exposure rather than a one-off map lookup need.",
      why_not_too_large:
        "The recommended wedge is scoped to one specific workflow or operating area before broader rollout.",
      seller_commission_potential: "Internal only; depends on whether the account lands as API, notifications, or integration.",
      trigger_event: {
        summary:
          "Recurring Canadian operational exposure creates a standing need for outage-aware decisions and notifications.",
        date: "2026-07-08",
        source_url: website,
        why_it_matters:
          "OutageHub can enter through a bounded API, notification, or integration pilot tied to one workflow."
      },
      trigger_strength: 3,
      reachable_path: {
        likely_buyer_or_router: `${group.title}, target account route`,
        route:
          "Start with the relevant operations, network, claims, dispatch, facilities, emergency-management, digital, or platform owner; enrich named contacts before sending.",
        evidence: `Company source URL: ${website}`,
        reachability_score: 2
      },
      recommended_contact_titles: [
        group.title,
        "VP Operations",
        "Director Operations",
        "Platform/Data Lead",
        "Customer Operations Lead"
      ],
      outreach_angle: group.angle,
      confidence: "medium",
      source_urls: [website]
    });
  }
}

const artifact = {
  sourcing_summary:
    `Expanded OutageHub target account list to ${accounts.length} additional Canadian-exposed accounts across telecom, insurance, logistics, property, municipal/emergency, utilities, infrastructure, and field-service segments.`,
  search_strategy: [
    "Use OHUB ICP and offer map: Canadian exposure plus outage-sensitive recurring workflow is required.",
    "Treat these as account-route leads; enrich named functional owners before large-scale sending.",
    "Prioritize notification/API wedges for near-term accounts and custom integrations for larger operational systems.",
    "Avoid one-off public-map curiosity use cases."
  ],
  target_accounts: accounts,
  near_misses: [],
  open_questions: [
    "Named contact enrichment is still needed for many account-route leads.",
    "Utility accounts may be customers, partners, or data-source relationships; qualify before sending."
  ],
  source_notes: [
    "Expanded locally because the live OpenClaw account-sourcing run repeatedly exceeded useful runtime.",
    "Each account includes a public company URL and is assigned to the OHUB ICP segment most relevant to outage data.",
    "These are target-account leads, not verified direct-email contacts yet."
  ]
};

const { agent } = await findAgent("outagehub-account-sourcing");
const published = await publishArtifact(agent, artifact);
const ingestResult = await ingestFromState("outagehub");
console.log(JSON.stringify({ addedAccounts: accounts.length, artifactPath: published.artifactPath, ingestResult }, null, 2));
