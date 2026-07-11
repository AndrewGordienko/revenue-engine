// Builds the fixed acceptance benchmark: 20 GNK + 20 OutageHub accounts spanning
// good fits, bad fits, ambiguous owners, false triggers, missing email evidence,
// and unsupported pain hypotheses. Deterministic (no randomness) so re-running
// produces byte-identical benchmark/accounts.json.
import fs from "node:fs";
import path from "node:path";

// label: good_fit | bad_fit | ambiguous | false_trigger | missing_email | unsupported_pain
// expected_play: the play a correct system assigns; expected_pursue: whether the
// account should advance past qualification.
const GNK = [
  { company: "Northstar AI", title: "VP Engineering", trigger: "launched an agentic workflow product and is hiring ML engineers", play: "GNK-AI-01", label: "good_fit" },
  { company: "Copilot Labs", title: "CTO", trigger: "announced an LLM copilot initiative that needs production controls", play: "GNK-AI-01", label: "good_fit" },
  { company: "Vector Model Co", title: "Head of AI", trigger: "genai prototype stuck before production deployment", play: "GNK-AI-01", label: "good_fit" },
  { company: "Harbour Systems", title: "VP Engineering", trigger: "public incident and a backend reliability migration underway", play: "GNK-BE-01", label: "good_fit" },
  { company: "Platform Nine", title: "Platform Lead", trigger: "scaling problems and a fragile integration on a critical api", play: "GNK-BE-01", label: "good_fit" },
  { company: "Legacy Freight", title: "Engineering Manager", trigger: "legacy modernization and a troubled contractor rewrite", play: "GNK-BE-01", label: "good_fit" },
  { company: "Ops Ledger", title: "COO", trigger: "expensive manual workflow across spreadsheets needs automation", play: "GNK-DATA-01", label: "good_fit" },
  { company: "Recon Data", title: "Head of Operations", trigger: "manual reconciliation and reporting pipeline pain", play: "GNK-DATA-01", label: "good_fit" },
  { company: "Flowbridge", title: "Director of Business Systems", trigger: "data automation across brittle operations handoffs", play: "GNK-DATA-01", label: "good_fit" },
  { company: "Ambiguous Corp", title: "Founder", trigger: "growing fast and thinking about engineering help", play: "GNK-BE-01", label: "ambiguous", pursue: false },
  { company: "Rebrand Inc", title: "CMO", trigger: "announced a new logo and website rebrand", play: "GNK-BE-01", label: "false_trigger", pursue: false },
  { company: "Holiday Retail", title: "Store Manager", trigger: "posted updated holiday opening hours", play: "GNK-BE-01", label: "false_trigger", pursue: false },
  { company: "NoMail AI", title: "VP Engineering", trigger: "shipped an ai agent platform, but no contact email found", play: "GNK-AI-01", label: "missing_email", noEmail: true },
  { company: "Ghost Platform", title: "Platform Lead", trigger: "backend scaling work but no reachable owner email", play: "GNK-BE-01", label: "missing_email", noEmail: true },
  { company: "Assumed Pain Co", title: "CEO", trigger: "hiring one junior developer", play: "GNK-BE-01", label: "unsupported_pain", pursue: false },
  { company: "Maybe Data", title: "Analyst", trigger: "mentioned spreadsheets once in a blog", play: "GNK-DATA-01", label: "unsupported_pain", pursue: false },
  { company: "Enterprise Giant", title: "SVP", trigger: "massive org, no specific team or initiative", play: "GNK-BE-01", label: "bad_fit", pursue: false },
  { company: "Agent Forge", title: "CTO", trigger: "building agentic ai tooling and needs deployment safety", play: "GNK-AI-01", label: "good_fit" },
  { company: "Reliability One", title: "VP Engineering", trigger: "latency and performance incidents on core platform", play: "GNK-BE-01", label: "good_fit" },
  { company: "Manual Mills", title: "COO", trigger: "operations team drowning in manual data workflow handoffs", play: "GNK-DATA-01", label: "good_fit" },
];

const OHUB = [
  { company: "Northern ISP", title: "NOC Manager", trigger: "regional telecom noc needs external power context for triage", play: "OHUB-ISP-01", label: "good_fit" },
  { company: "FibreLink", title: "Head of Network Operations", trigger: "isp expanding fibre footprint, support pressure during outages", play: "OHUB-ISP-01", label: "good_fit" },
  { company: "Carrier West", title: "Service Delivery Lead", trigger: "wireless carrier connectivity incidents and customer comms", play: "OHUB-ISP-01", label: "good_fit" },
  { company: "FacilitySoft", title: "VP Product", trigger: "facilities software platform wants to embed outage api", play: "OHUB-EMBED-01", label: "good_fit" },
  { company: "PropTech Cloud", title: "CTO", trigger: "saas platform integration to embed Canadian outage data", play: "OHUB-EMBED-01", label: "good_fit" },
  { company: "Notify Systems", title: "Head of Product", trigger: "emergency notification software product needs developer api", play: "OHUB-EMBED-01", label: "good_fit" },
  { company: "ColdChain Co", title: "Facilities Director", trigger: "cold storage warehouse portfolio, outage-sensitive assets", play: "OHUB-FAC-01", label: "good_fit" },
  { company: "GreenGrow", title: "Operations Director", trigger: "greenhouse portfolio needs outage monitoring for maintenance", play: "OHUB-FAC-01", label: "good_fit" },
  { company: "Depot Logistics", title: "Field Operations Director", trigger: "multi-site logistics depots with dispatch during outages", play: "OHUB-FAC-01", label: "good_fit" },
  { company: "Vague Ops", title: "Manager", trigger: "operations of some kind across sites", play: "OHUB-FAC-01", label: "ambiguous", pursue: false },
  { company: "Hydro Producer", title: "Grid Engineer", trigger: "electric utility that generates power (a data source, not a buyer)", play: "OHUB-FAC-01", label: "bad_fit", pursue: false },
  { company: "Rebrand Telecom", title: "CMO", trigger: "telecom announced a marketing rebrand", play: "OHUB-ISP-01", label: "false_trigger", pursue: false },
  { company: "Gala Notice", title: "Events Lead", trigger: "posted about a charity gala", play: "OHUB-EMBED-01", label: "false_trigger", pursue: false },
  { company: "NoReach ISP", title: "NOC Lead", trigger: "isp noc triage fit but no contact email available", play: "OHUB-ISP-01", label: "missing_email", noEmail: true },
  { company: "Hidden Platform", title: "VP Product", trigger: "software platform embed fit but no reachable email", play: "OHUB-EMBED-01", label: "missing_email", noEmail: true },
  { company: "Assumed Outage", title: "CEO", trigger: "has a website, assumed to care about outages", play: "OHUB-FAC-01", label: "unsupported_pain", pursue: false },
  { company: "Single Site", title: "Owner", trigger: "one location, no portfolio", play: "OHUB-FAC-01", label: "unsupported_pain", pursue: false },
  { company: "Telco North", title: "NOC Manager", trigger: "telecom network operations centre outage triage workflow", play: "OHUB-ISP-01", label: "good_fit" },
  { company: "Embed Weather", title: "Solutions Architect", trigger: "iot platform api wants embedded outage intelligence", play: "OHUB-EMBED-01", label: "good_fit" },
  { company: "Warehouse Chain", title: "Regional Operations", trigger: "warehouse portfolio, cold storage outage escalation", play: "OHUB-FAC-01", label: "good_fit" },
];

function toFixture(entry, product, i) {
  return {
    id: `${product}-${String(i + 1).padStart(2, "0")}`,
    product,
    company: entry.company,
    title: entry.title,
    trigger_event: entry.trigger,
    why_now: entry.trigger,
    outreach_angle: entry.trigger,
    segment: entry.company,
    first_contract_slice: entry.trigger,
    email_best: entry.noEmail ? "" : `contact@${entry.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
    label: entry.label,
    expected_play: entry.play,
    expected_pursue: entry.pursue !== false,
  };
}

const fixtures = [
  ...GNK.map((e, i) => toFixture(e, "gnk", i)),
  ...OHUB.map((e, i) => toFixture(e, "outagehub", i)),
];

const outPath = path.join(process.cwd(), "benchmark", "accounts.json");
fs.writeFileSync(outPath, JSON.stringify({ generated_by: "benchmark/build-fixtures.mjs", count: fixtures.length, fixtures }, null, 2) + "\n");
const byLabel = {};
for (const f of fixtures) byLabel[f.label] = (byLabel[f.label] || 0) + 1;
console.log(`wrote ${fixtures.length} fixtures to ${outPath}`);
console.log(JSON.stringify(byLabel, null, 2));
