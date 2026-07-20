// Seed a starter set of Morrow prospects into the morrow product scope so the
// localhost Prospect Desk has real, tailored connection notes to show.
//
// Source: the Morrow business plan target list plus the verified contact import.
// Role targets remain in the research copy, but CRM people are always named and
// use direct LinkedIn profiles so rerunning this seed cannot recreate placeholders.
import fs from "node:fs/promises";
import { upsertLeads } from "../src/leads-store.js";

const COPACKERS = "Co-packer / fulfillment";
const MANUFACTURER = "CPG / food manufacturer";

const starterLeads = [
  {
    name: "Parth Pandya",
    title: "Plant Automation Manager",
    company: "Ya YA Foods",
    segment: MANUFACTURER,
    fit_score: 5,
    why_now: "Existing plant automation, but variable secondary-packing tasks likely remain manual. Parth owns automation and is the plan's first manufacturing call.",
    why_this_person: "Plant Automation Manager — feels the labour and changeover pain and can get you into the facility.",
    likely_current_pain: "Variable secondary packing that stays manual despite line automation.",
    outreach_angle: "Ask which secondary-packing/kitting tasks stay manual despite the plant's automation, and why.",
  },
  {
    name: "Continuous Improvement Manager",
    title: "Continuous Improvement / Automation owner — find on LinkedIn",
    company: "Links Warehousing & Fulfillment",
    segment: COPACKERS,
    fit_score: 5,
    why_now: "Subscription boxes, club packs, sample packs, gift sets, rework and assembly — high-mix changeover-heavy work fixed automation can't justify.",
    likely_current_pain: "Constantly changing kitting and repack configurations done by hand.",
  },
  {
    name: "Operations Manager",
    title: "Operations / kitting owner — find on LinkedIn",
    company: "McKenna Logistics Centres",
    segment: COPACKERS,
    fit_score: 4,
    why_now: "Custom packaging and kitting; explicitly describes manual sorting and kit assembly as a cost.",
    likely_current_pain: "Manual sorting and kit assembly across custom client requirements.",
  },
  {
    name: "Packaging Manager",
    title: "Packaging / co-pack owner — find on LinkedIn",
    company: "GBT Logistics & Packaging",
    segment: COPACKERS,
    fit_score: 4,
    why_now: "Secondary co-packing: labelling, kitting, shrink-wrapping and retail-ready packaging.",
    likely_current_pain: "Retail-ready repack and kitting that shifts by retailer and SKU.",
  },
  {
    name: "Continuous Improvement Manager",
    title: "Continuous Improvement owner — find on LinkedIn",
    company: "Co-Pak Packaging",
    segment: COPACKERS,
    fit_score: 4,
    why_now: "Contract co-packer with high-mix secondary packaging that changes by client program.",
    likely_current_pain: "Frequent program changeovers on manual packing lines.",
  },
  {
    name: "Fulfillment Operations Manager",
    title: "Fulfillment operations owner — find on LinkedIn",
    company: "ShipHype",
    segment: COPACKERS,
    fit_score: 3,
    why_now: "3PL/fulfillment with kitting and custom packing across many small brands — constant variation.",
    likely_current_pain: "Per-brand kitting and custom packing with no economical fixed automation.",
  },
  {
    name: "Operations Manager",
    title: "Operations / packing owner — find on LinkedIn",
    company: "RGX Group",
    segment: COPACKERS,
    fit_score: 3,
    why_now: "Contract packaging and fulfillment with variable secondary-packing programs.",
    likely_current_pain: "Manual repack and kitting that changes with each account.",
  },
  {
    name: "Manufacturing Engineering Manager",
    title: "Manufacturing engineering / automation owner — find on LinkedIn",
    company: "Metro Supply Chain (Contract Packaging)",
    segment: COPACKERS,
    fit_score: 4,
    why_now: "Already uses automation and robotics — excellent validation account for where fixed automation stops being economical.",
    likely_current_pain: "High-mix jobs that existing case-packers can't absorb.",
  },
  {
    name: "Plant Automation Manager",
    title: "Plant automation owner — find on LinkedIn",
    company: "Give & Go Prepared Foods",
    segment: MANUFACTURER,
    fit_score: 4,
    why_now: "CPG bakery manufacturer with variety packs and secondary packing that stays manual despite line automation.",
    likely_current_pain: "Variety-pack assembly and secondary packing done by hand.",
  },
  {
    name: "Production Manager",
    title: "Production / packaging owner — find on LinkedIn",
    company: "Tradition Fine Foods",
    segment: MANUFACTURER,
    fit_score: 3,
    why_now: "Food manufacturer with variable secondary packing and multipacks that change by retailer.",
    likely_current_pain: "Multipack and insert work that changes too often for fixed automation.",
  },
];

const contactImport = JSON.parse(await fs.readFile(new URL("../data/inputs/morrow-linkedin-contacts.json", import.meta.url), "utf8"));
const primaryContactsByCompany = new Map();
for (const contact of contactImport.contacts) {
  const companyKey = contact.company.toLowerCase();
  if (!primaryContactsByCompany.has(companyKey)) primaryContactsByCompany.set(companyKey, contact);
}

const companySignals = {
  "Think Logistics": "Its Canadian fulfillment operation is scaling inside Arvato, making repeatable handling of variable e-commerce work especially timely.",
  Stalco: "Its custom 3PL programs require specialized handling and operating procedures that can be expensive to automate with fixed equipment.",
  "AMZ Prep": "Amazon's prep changes are increasing labeling, bagging, kitting and compliance work across a rapidly scaling fulfillment network.",
  Shipfusion: "Fast-growing Shopify brands create peak-driven, high-variation fulfillment work where accuracy cannot slip.",
  "18 Wheels Logistics": "The company has publicly run double shifts for co-packing and repacking customers, exposing a clear labor and capacity constraint.",
  "Cosmetica Laboratories": "Contract beauty launches bring changing components, inserts and retail configurations that fixed packing cells struggle to absorb.",
  "Riverside Natural Foods": "A growing multi-site snack operation creates secondary-packaging and variety-format work around already automated production lines.",
  "Give & Go Prepared Foods": "New products and packaging formats create plant trials, changeovers and secondary-packing work alongside high-volume bakery lines.",
  "TreeHouse Foods": "Private-label manufacturing combines high volume with retailer-specific formats and recurring production changeovers.",
  Lassonde: "New beverage production capacity creates an opportunity to isolate secondary-packing tasks that remain manual around the line.",
  "Sofina Foods": "Case-ready food operations have measurable packing capacity, SKU-changeover and machine-efficiency pressure.",
};

function enrichLead(lead, contact) {
  if (!contact) throw new Error(`Missing verified Morrow contact for ${lead.company}`);
  return ({
  ...lead,
  name: contact.name,
  title: contact.title,
  linkedin_or_source: contact.profile_url,
  source_url: contact.source_url || contact.profile_url,
  email_status: "unknown",
  verified: false,
  stage: "new",
  source_agent: "seed-morrow-leads",
  confidence: `linkedin_${contact.role_confidence}`,
  target_role: lead.name,
  linkedin_verified_at: contactImport.verified_at,
  trigger_event: lead.why_now,
  why_this_person: contact.why_this_person || lead.why_this_person,
  });
}

const selectedContacts = new Set();
const enrichedStarter = starterLeads.map((lead) => {
  const contact = primaryContactsByCompany.get(lead.company.toLowerCase());
  if (contact) selectedContacts.add(`${contact.name}|${contact.company}`.toLowerCase());
  return enrichLead(lead, contact);
});

const enrichedAdditional = contactImport.contacts
  .filter((contact) => !selectedContacts.has(`${contact.name}|${contact.company}`.toLowerCase()))
  .map((contact) => {
    const isFulfillment = /logistics|fulfillment|stalco|amz prep|shipfusion/i.test(contact.company);
    const whyNow = companySignals[contact.company]
      || `${contact.company} has variable packing work where a bounded adaptive-robotics pilot can test the economics before fixed automation.`;
    return enrichLead({
      name: contact.title,
      title: contact.title,
      company: contact.company,
      segment: isFulfillment ? COPACKERS : MANUFACTURER,
      fit_score: contact.role_confidence === "high" ? 4 : 3,
      why_now: whyNow,
      why_this_person: contact.why_this_person,
      likely_current_pain: isFulfillment
        ? "Client-specific kitting, labeling and repacking that changes too often for fixed automation."
        : "Changeover-heavy secondary packing that still depends on manual labor around the production line.",
      outreach_angle: `Ask which ${isFulfillment ? "kitting or repacking" : "secondary-packing"} job at ${contact.company} is hardest to automate economically.`,
    }, contact);
  });

const enriched = [...enrichedStarter, ...enrichedAdditional];

const result = await upsertLeads(enriched, "morrow", {
  note: "Morrow starter prospects seeded from the business plan target list",
  source_store: "seed-morrow",
});

console.log(`Morrow leads seeded: +${result.added} added, ${result.updated} updated, ${result.total} total in morrow scope.`);
