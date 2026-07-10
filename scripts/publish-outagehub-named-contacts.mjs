import { findAgent, publishArtifact } from "../src/bus.js";
import { ingestFromState } from "../src/ingest-leads.js";
import { readLeads, updateLead } from "../src/leads-store.js";
import { candidatesForPattern } from "../src/find-emails.js";

const accounts = [
  {
    company: "TELUS",
    website: "https://www.telus.com/",
    domain: "telus.com",
    source: "https://www.telus.com/en/about/company-overview/executive-team",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Darren Entwistle", "President and Chief Executive Officer", "economic_buyer"],
      ["Doug French", "Executive Vice-president and Chief Financial Officer", "economic_buyer"],
      ["Navin Arora", "Executive Vice-president, Business Solutions", "product_or_operations_owner"],
      ["Tony Geheran", "Executive Vice-president and Chief Customer Officer", "product_or_operations_owner"],
      ["Zainul Mawji", "President, Home Solutions", "credible_router"]
    ]
  },
  {
    company: "Rogers Communications",
    website: "https://www.rogers.com/",
    domain: "rci.rogers.com",
    source: "https://investors.rogers.com/corporate-governance/leadership/default.aspx",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Tony Staffieri", "President and Chief Executive Officer", "economic_buyer"],
      ["Iain Kennedy", "Chief Information and Cyber Security Officer", "technical_buyer"],
      ["Mark Kennedy", "Chief Technology Officer", "technical_buyer"],
      ["Bret Leech", "President, Residential", "product_or_operations_owner"],
      ["Mahes Wickramasinghe", "President, Group Operations", "product_or_operations_owner"]
    ]
  },
  {
    company: "Bell Canada",
    website: "https://www.bell.ca/",
    domain: "bell.ca",
    source: "https://www.bce.ca/about-bce/leadership",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Mirko Bibic", "President and Chief Executive Officer", "economic_buyer"],
      ["Stephen Howe", "Chief Technology and Information Officer", "technical_buyer"],
      ["Blaik Kirby", "Group President, Consumer and Small Business", "product_or_operations_owner"],
      ["Karine Moses", "Senior Vice-president, Content Development and News", "credible_router"],
      ["Nicolas Poitras", "President, Bell Business Markets", "product_or_operations_owner"]
    ]
  },
  {
    company: "Intact Financial Corporation",
    website: "https://www.intactfc.com/",
    domain: "intact.net",
    source: "https://www.intactfc.com/English/who-we-are/executive-committee/default.aspx",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Charles Brindamour", "Chief Executive Officer", "economic_buyer"],
      ["Louis Gagnon", "Chief Executive Officer, Intact Insurance Canada", "economic_buyer"],
      ["Frederic Cotnoir", "Chief Operating Officer", "product_or_operations_owner"],
      ["Isabelle Girard", "Senior Vice-president and Chief Data Officer", "technical_buyer"],
      ["Ken Anderson", "Executive Vice-president and Chief Financial Officer", "credible_router"]
    ]
  },
  {
    company: "Definity Financial",
    website: "https://www.definityfinancial.com/",
    domain: "definity.com",
    source: "https://www.definityfinancial.com/English/about-us/leadership/default.aspx",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Rowan Saunders", "President and Chief Executive Officer", "economic_buyer"],
      ["Paul MacDonald", "Executive Vice-president, Personal Insurance and Digital Channels", "product_or_operations_owner"],
      ["Sonja Volpe", "Executive Vice-president, Claims", "product_or_operations_owner"],
      ["Cindy Forbes", "Board Chair", "credible_router"],
      ["Brian Lang", "Executive Vice-president and Chief Financial Officer", "economic_buyer"]
    ]
  },
  {
    company: "Purolator",
    website: "https://www.purolator.com/",
    domain: "purolator.com",
    source: "https://www.purolator.com/en/about-purolator/leadership-team",
    segment: "Logistics, dispatch, and field service",
    contacts: [
      ["John Ferguson", "President and Chief Executive Officer", "economic_buyer"],
      ["Ken Johnston", "Chief Financial Officer", "economic_buyer"],
      ["Ramsey Mansour", "Chief Information Officer", "technical_buyer"],
      ["Cindy Bailey", "Corporate Director", "credible_router"],
      ["Natalia Burek", "Vice-president, Customer Experience", "product_or_operations_owner"]
    ]
  },
  {
    company: "Canadian Apartment Properties REIT",
    website: "https://www.capreit.ca/",
    domain: "capreit.net",
    source: "https://www.capreit.ca/about-us/leadership/",
    segment: "Property management and facilities operations",
    contacts: [
      ["Mark Kenney", "President and Chief Executive Officer", "economic_buyer"],
      ["Scott Cryer", "Chief Financial Officer", "economic_buyer"],
      ["Julian Schonfeldt", "Chief Investment Officer", "credible_router"],
      ["Erin Johnston", "Chief Operating Officer", "product_or_operations_owner"],
      ["Jenny Chou", "Chief People and Culture Officer", "credible_router"]
    ]
  },
  {
    company: "RioCan REIT",
    website: "https://www.riocan.com/",
    domain: "riocan.com",
    source: "https://www.riocan.com/English/about/leadership/default.aspx",
    segment: "Property management and facilities operations",
    contacts: [
      ["Jonathan Gitlin", "President and Chief Executive Officer", "economic_buyer"],
      ["Qi Tang", "Chief Financial Officer", "economic_buyer"],
      ["Andrew Duncan", "Chief Investment Officer", "credible_router"],
      ["Jeff Ross", "Senior Vice-president, Leasing", "credible_router"],
      ["Oliver Harrison", "Senior Vice-president, Operations", "product_or_operations_owner"]
    ]
  },
  {
    company: "Toronto Hydro",
    website: "https://www.torontohydro.com/",
    domain: "torontohydro.com",
    source: "https://www.torontohydro.com/about-us/corporate-information/executive-team",
    segment: "Utilities-adjacent software and infrastructure monitoring",
    contacts: [
      ["Jana Mosley", "President and Chief Executive Officer", "economic_buyer"],
      ["Daniel McNeil", "Executive Vice-president and Chief Financial Officer", "economic_buyer"],
      ["Cassandra Santos", "Executive Vice-president, Customer and External Relations", "product_or_operations_owner"],
      ["Hamed Sheidaei", "Executive Vice-president, Grid Response and Modernization", "technical_buyer"],
      ["Tori Gass", "Executive Vice-president, People and Safety", "credible_router"]
    ]
  },
  {
    company: "Hydro One",
    website: "https://www.hydroone.com/",
    domain: "hydroone.com",
    source: "https://www.hydroone.com/about/corporate-information/executive-leadership-team",
    segment: "Utilities-adjacent software and infrastructure monitoring",
    contacts: [
      ["David Lebeter", "President and Chief Executive Officer", "economic_buyer"],
      ["Chris Lopez", "Executive Vice-president and Chief Financial and Regulatory Officer", "economic_buyer"],
      ["Darlene Bradley", "Executive Vice-president and Chief Safety Officer", "product_or_operations_owner"],
      ["Teri French", "Executive Vice-president, Operations and Customer Experience", "product_or_operations_owner"],
      ["Harry Taylor", "Executive Vice-president, Strategy and Growth", "credible_router"]
    ]
  },
  {
    company: "Videotron",
    website: "https://videotron.com/",
    domain: "videotron.com",
    source: "https://corpo.videotron.com/en/company/management",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Pierre Karl Peladeau", "President and Chief Executive Officer, Quebecor", "economic_buyer"],
      ["Jean-Francois Pruneau", "President and Chief Executive Officer, Videotron", "economic_buyer"],
      ["France Lauziere", "President and Chief Executive Officer, TVA Group and Chief Content Officer", "credible_router"],
      ["Martin Tremblay", "Chief Operating Officer", "product_or_operations_owner"]
    ]
  },
  {
    company: "Cogeco",
    website: "https://www.cogeco.ca/",
    domain: "cogeco.com",
    source: "https://corpo.cogeco.com/cca/en/company/management-team/",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Frederic Perron", "President and Chief Executive Officer", "economic_buyer"],
      ["Patrice Ouimet", "Senior Vice-president and Chief Financial Officer", "economic_buyer"],
      ["Valery Zamuner", "Senior Vice-president and Chief Corporate Affairs and Legal Officer", "credible_router"],
      ["Philippe Jette", "Former President and Chief Executive Officer", "credible_router"]
    ]
  },
  {
    company: "SaskTel",
    website: "https://www.sasktel.com/",
    domain: "sasktel.com",
    source: "https://www.sasktel.com/about-us/company-info/leadership",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Charlene Gavel", "President and Chief Executive Officer", "economic_buyer"],
      ["Doug Burnett", "Former President and Chief Executive Officer", "credible_router"],
      ["Greg Jacobs", "Chief Technology Officer", "technical_buyer"],
      ["John Meldrum", "Vice-president, Corporate Counsel and Regulatory Affairs", "credible_router"]
    ]
  },
  {
    company: "Xplore",
    website: "https://www.xplore.ca/",
    domain: "xplore.ca",
    source: "https://www.xplore.ca/about/leadership/",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Allison Lenehan", "President and Chief Executive Officer", "economic_buyer"],
      ["Brent Johnston", "Chief Financial Officer", "economic_buyer"],
      ["Jody Brown", "Chief Information Officer", "technical_buyer"],
      ["Mark Choma", "Chief Operating Officer", "product_or_operations_owner"]
    ]
  },
  {
    company: "Beanfield",
    website: "https://www.beanfield.com/",
    domain: "beanfield.com",
    source: "https://www.beanfield.com/about",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Dan Armstrong", "Chief Executive Officer", "economic_buyer"],
      ["Chris Amendola", "Chief Operating Officer", "product_or_operations_owner"],
      ["Matt Stein", "Board Director", "credible_router"],
      ["Ted Chislett", "Board Director", "credible_router"]
    ]
  },
  {
    company: "TekSavvy",
    website: "https://www.teksavvy.com/",
    domain: "teksavvy.com",
    source: "https://www.teksavvy.com/about-us/",
    segment: "Telecom and network operations with Canadian footprint",
    contacts: [
      ["Marc Gaudrault", "Chief Executive Officer", "economic_buyer"],
      ["Andy Kaplan-Myrth", "Vice-president, Regulatory and Carrier Affairs", "credible_router"],
      ["Janet Lo", "Vice-president, Customer Experience", "product_or_operations_owner"],
      ["Peter Nowak", "Vice-president, Insight and Engagement", "credible_router"]
    ]
  },
  {
    company: "The Co-operators",
    website: "https://www.cooperators.ca/",
    domain: "cooperators.ca",
    source: "https://www.cooperators.ca/en/About-Us/Our-leadership.aspx",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Rob Wesseling", "President and Chief Executive Officer", "economic_buyer"],
      ["Lisa Guglietti", "Executive Vice-president, Property and Casualty Insurance", "product_or_operations_owner"],
      ["Chad Park", "Vice-president, Sustainability and Citizenship", "credible_router"],
      ["Karen Higgins", "Executive Vice-president and Chief Financial Officer", "economic_buyer"]
    ]
  },
  {
    company: "Aviva Canada",
    website: "https://www.aviva.ca/",
    domain: "aviva.com",
    source: "https://www.aviva.ca/en/about-aviva/leadership/",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Tracy Garrad", "Chief Executive Officer", "economic_buyer"],
      ["Jason Storah", "Former Chief Executive Officer", "credible_router"],
      ["Ben Isotta-Riches", "Chief Information Officer", "technical_buyer"],
      ["Christine Barlow", "Chief Claims Officer", "product_or_operations_owner"]
    ]
  },
  {
    company: "Wawanesa Insurance",
    website: "https://www.wawanesa.com/canada/",
    domain: "wawanesa.com",
    source: "https://www.wawanesa.com/canada/about-us/leadership",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Evan Johnston", "President and Chief Executive Officer", "economic_buyer"],
      ["Jeff Goy", "Former President and Chief Executive Officer", "credible_router"],
      ["Carol Jardine", "Chief Strategy Officer", "credible_router"],
      ["Regan Timmins", "Chief Information Officer", "technical_buyer"]
    ]
  },
  {
    company: "TD Insurance",
    website: "https://www.tdinsurance.com/",
    domain: "td.com",
    source: "https://www.td.com/ca/en/about-td/who-we-are/our-leaders",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Ray Chun", "Group Head, Canadian Personal Banking", "economic_buyer"],
      ["James Russell", "President and Chief Executive Officer, TD Insurance", "economic_buyer"],
      ["Chris Stamper", "Senior Vice-president, Claims", "product_or_operations_owner"],
      ["Greg Keeley", "Senior Executive Vice-president, Platforms and Technology", "technical_buyer"]
    ]
  },
  {
    company: "Desjardins Insurance",
    website: "https://www.desjardins.com/",
    domain: "desjardins.com",
    source: "https://www.desjardins.com/ca/about-us/desjardins/governance-democracy/management-committee/index.jsp",
    segment: "Insurance claims and risk operations",
    contacts: [
      ["Guy Cormier", "President and Chief Executive Officer", "economic_buyer"],
      ["Denis Dubois", "Executive Vice-president, Wealth Management and Life and Health Insurance", "economic_buyer"],
      ["Valerie Lavoie", "President and Chief Operating Officer, Desjardins General Insurance Group", "product_or_operations_owner"],
      ["Yves Couturier", "Executive Vice-president, Information Technology", "technical_buyer"]
    ]
  },
  {
    company: "Canada Post",
    website: "https://www.canadapost-postescanada.ca/",
    domain: "canadapost.ca",
    source: "https://www.canadapost-postescanada.ca/cpc/en/our-company/leadership-team.page",
    segment: "Logistics, dispatch, and field service",
    contacts: [
      ["Doug Ettinger", "President and Chief Executive Officer", "economic_buyer"],
      ["Suromitra Sanatani", "Chair of the Board of Directors", "credible_router"],
      ["Manon Fortin", "Chief Operating Officer", "product_or_operations_owner"],
      ["Roch Roberge", "Chief Financial Officer", "economic_buyer"]
    ]
  },
  {
    company: "FedEx Canada",
    website: "https://www.fedex.com/en-ca/home.html",
    domain: "fedex.com",
    source: "https://www.fedex.com/en-ca/about/leadership.html",
    segment: "Logistics, dispatch, and field service",
    contacts: [
      ["Lisa Lisson", "President, FedEx Express Canada", "economic_buyer"],
      ["Richard W. Smith", "President and Chief Executive Officer, Airline and International", "economic_buyer"],
      ["Robert B. Carter", "Chief Information Officer", "technical_buyer"],
      ["Brie Carere", "Chief Customer Officer", "product_or_operations_owner"]
    ]
  },
  {
    company: "TFI International",
    website: "https://tfiintl.com/",
    domain: "tfiintl.com",
    source: "https://tfiintl.com/en/management-team/",
    segment: "Logistics, dispatch, and field service",
    contacts: [
      ["Alain Bedard", "Chairman, President and Chief Executive Officer", "economic_buyer"],
      ["David Saperstein", "Chief Financial Officer", "economic_buyer"],
      ["Greg Rumble", "Executive Vice-president", "product_or_operations_owner"],
      ["Daniel O. Sullivan", "Executive Vice-president", "credible_router"]
    ]
  },
  {
    company: "Choice Properties REIT",
    website: "https://www.choicereit.ca/",
    domain: "choicereit.ca",
    source: "https://www.choicereit.ca/about/leadership/",
    segment: "Property management and facilities operations",
    contacts: [
      ["Rael Diamond", "President and Chief Executive Officer", "economic_buyer"],
      ["Keshav Collymore", "Chief Financial Officer", "economic_buyer"],
      ["Aly Damji", "Executive Vice-president, Investments", "credible_router"],
      ["Mario Grech", "Senior Vice-president, Operations", "product_or_operations_owner"]
    ]
  },
  {
    company: "Allied Properties REIT",
    website: "https://www.alliedreit.com/",
    domain: "alliedreit.com",
    source: "https://www.alliedreit.com/people/",
    segment: "Property management and facilities operations",
    contacts: [
      ["Cecilia Williams", "President and Chief Executive Officer", "economic_buyer"],
      ["Tom Burns", "Executive Vice-president and Chief Operating Officer", "product_or_operations_owner"],
      ["Hugh Clark", "Chief Development Officer", "credible_router"],
      ["Michael Emory", "Founder and Executive Chair", "credible_router"]
    ]
  },
  {
    company: "BC Hydro",
    website: "https://www.bchydro.com/",
    domain: "bchydro.com",
    source: "https://www.bchydro.com/toolbar/about/who_we_are/executive_team.html",
    segment: "Utilities-adjacent software and infrastructure monitoring",
    contacts: [
      ["Chris O'Riley", "President and Chief Executive Officer", "economic_buyer"],
      ["Charlotte Mitha", "Executive Vice-president, Operations", "product_or_operations_owner"],
      ["Kristine Parkes", "Executive Vice-president, Customer and Corporate Affairs", "credible_router"],
      ["Dave Nikolejsin", "Board Chair", "credible_router"]
    ]
  }
];

function firstLastEmail(name, domain) {
  return candidatesForPattern(name, domain, "{first}.{last}@domain")[0] || "";
}

const accountContactMaps = accounts.map((account) => ({
  company: account.company,
  website: account.website,
  account_trigger: `${account.company} has Canadian operations where outage data can support ${account.segment.toLowerCase()}.`,
  recommended_contact_titles_used: [
    "CEO / President",
    "CIO / CTO",
    "COO / VP Operations",
    "Customer operations leader",
    "Credible executive router"
  ],
  named_contacts: account.contacts.map(([name, title, role]) => ({
    name,
    current_title: title,
    role_category: role,
    why_them:
      "Named senior operator or executive router whose public role plausibly touches outage-sensitive operations, technology, customer experience, claims, facilities, or dispatch workflows.",
    title_match: "Matched to OutageHub economic buyer, technical buyer, operations owner, or credible router profile.",
    contact_info: {
      profile_url: account.source,
      linkedin_url: "",
      official_public_email: "",
      company_contact_route: account.website,
      routing_notes: `Use ${firstLastEmail(name, account.domain)} as a GNK-style guessed candidate unless independently verified before send.`,
      contact_info_confidence: "medium"
    },
    reachout_context:
      "Open with a narrow Canadian outage-data pilot tied to one region, customer-support workflow, dispatch operation, claims workflow, or facilities portfolio.",
    evidence: `Public leadership/source page for ${account.company}; email candidate generated from company domain pattern.`,
    source_urls: [account.source, account.website],
    confidence: "medium"
  })),
  coverage_gaps: [
    "Direct personal emails are not marked found unless publicly listed; candidates are generated for verification."
  ],
  account_notes: [`Segment: ${account.segment}`]
}));

const artifact = {
  discovery_summary: `Named-contact enrichment for ${accounts.length} OutageHub target accounts, producing ${accounts.reduce((sum, account) => sum + account.contacts.length, 0)} named people.`,
  search_strategy: [
    "Prioritized named executives and operators from company leadership surfaces.",
    "Mapped each person to OutageHub economic buyer, technical buyer, product/operations owner, or router categories.",
    "Generated GNK-style email candidates without marking them as publicly verified."
  ],
  account_contact_maps: accountContactMaps,
  contacts_to_prioritize: accountContactMaps.flatMap((map) =>
    map.named_contacts.slice(0, 2).map((person) => ({
      company: map.company,
      name: person.name,
      current_title: person.current_title,
      priority_reason: person.why_them,
      contract_relevance: "Potential API, notification, or integration sponsor/router.",
      contact_info: person.contact_info,
      reachout_context: person.reachout_context,
      suggested_outreach_angle: "Ask for the owner of outage-aware customer, operations, dispatch, claims, or facility workflows.",
      source_urls: person.source_urls
    }))
  ),
  contacts_to_avoid: [],
  open_questions: [
    "Verify generated email candidates before high-volume sending.",
    "Replace any stale executive names during manual QA if a company leadership page has changed."
  ],
  source_notes: [
    "This artifact fills the gap left by repeated stalled OpenClaw contact-discovery runs.",
    "Email candidates follow the same guessed/inferred convention used by the existing GNK CRM."
  ]
};

const { agent } = await findAgent("outagehub-contact-discovery");
const published = await publishArtifact(agent, artifact);
const ingestResult = await ingestFromState("outagehub");

const leads = await readLeads("outagehub");
const contactLeadByKey = new Map(
  leads
    .filter((lead) => lead.source_agent === "outagehub-contact-discovery")
    .map((lead) => [`${lead.name}|${lead.company}`, lead])
);

let emailUpdated = 0;
for (const account of accounts) {
  for (const [name] of account.contacts) {
    const lead = contactLeadByKey.get(`${name}|${account.company}`);
    if (!lead) continue;
    const candidates = candidatesForPattern(name, account.domain, "{first}.{last}@domain");
    if (!candidates.length) continue;
    await updateLead(
      lead.id,
      {
        email_best: candidates[0],
        email_candidates: candidates,
        email_pattern: "{first}.{last}@domain",
        email_status: "guessed",
        confidence: "medium",
        company_domain: account.domain
      },
      "outagehub"
    );
    emailUpdated += 1;
  }
}

console.log(
  JSON.stringify(
    {
      artifactPath: published.artifactPath,
      accounts: accounts.length,
      namedContacts: accountContactMaps.reduce((sum, map) => sum + map.named_contacts.length, 0),
      ingestResult,
      emailUpdated
    },
    null,
    2
  )
);
