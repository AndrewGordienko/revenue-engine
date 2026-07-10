import { readLeads, updateLead } from "../src/leads-store.js";

function norm(value) {
  return String(value || "").toLowerCase();
}

function segmentFor(lead) {
  const text = norm(`${lead.segment} ${lead.company} ${lead.title} ${lead.trigger_event}`);
  if (/hydro|power|utility|energy|grid|epcor|enmax|fortis|emera/.test(text)) return "Utilities and grid";
  if (/telus|rogers|bell|videotron|cogeco|sasktel|xplore|beanfield|teksavvy|telecom|network/.test(text)) return "Telecom and network";
  if (/reit|properties|property|apartment|facilities|building|capreit|riocan|allied|choice/.test(text)) return "Property and facilities";
  if (/post|purolator|fedex|ups|dhl|logistics|dispatch|transport|cartage|freight/.test(text)) return "Logistics and dispatch";
  if (/insurance|claims|intact|definity|co-operators|aviva|wawanesa|td insurance|desjardins/.test(text)) return "Insurance and claims";
  return lead.segment || "Other operations";
}

function roleFor(title) {
  const text = norm(title);
  if (/\b(ceo|president|chief executive|founder|co-founder)\b/.test(text)) return "economic";
  if (/\b(cio|cto|technology|information|data|cyber|platform|digital)\b/.test(text)) return "technical";
  if (/\b(operations|operating|customer|claims|safety|grid|network|facilities|business solutions)\b/.test(text)) return "operator";
  if (/\b(cfo|finance|legal|regulatory|board|chair)\b/.test(text)) return "router";
  return "router";
}

const enterpriseLongCompanies = new Set([
  "telus",
  "rogers communications",
  "bell canada",
  "videotron",
  "cogeco",
  "sasktel",
  "canada post",
  "fedex canada",
  "ups canada",
  "dhl express canada",
  "td insurance",
  "desjardins insurance",
  "intact financial corporation",
  "aviva canada",
  "the co-operators",
  "hydro one",
  "toronto hydro",
  "bc hydro",
  "hydro-quebec",
  "alectra utilities",
  "epcor",
  "enmax",
  "fortisbc",
  "manitoba hydro",
  "saskpower",
  "nova scotia power",
  "nb power"
]);

const mediumEnterpriseCompanies = new Set([
  "xplore",
  "beanfield",
  "teksavvy",
  "distributel",
  "tbaytel",
  "wawanesa insurance",
  "definity financial",
  "purolator",
  "tfi international",
  "day & ross",
  "mullen group",
  "bison transport",
  "choice properties reit",
  "allied properties reit",
  "killam apartment reit",
  "boardwalk reit",
  "riocan reit"
]);

function companyClass(company) {
  const name = norm(company).replace(/\s+/g, " ").trim();
  if (enterpriseLongCompanies.has(name)) return "enterprise_long";
  if (mediumEnterpriseCompanies.has(name)) return "medium_enterprise";
  if (/^city of |^ville de |region of | regional municipality|municipality|county/i.test(company || "")) return "public_sector_long";
  return "midmarket_or_unknown";
}

function bucketFor(lead) {
  if (lead.source_agent !== "outagehub-contact-discovery") {
    return {
      bucket: "medium_term",
      reason: "Target account route only; keep as account context until a named buyer is enriched."
    };
  }

  const segment = segmentFor(lead);
  const role = roleFor(lead.title);
  const hasSequence = Boolean(lead.email_subject || lead.email_body);
  const hasEmail = Boolean(lead.email_best);
  const klass = companyClass(lead.company);

  if (klass === "enterprise_long" || klass === "public_sector_long") {
    return {
      bucket: "long_term",
      reason:
        "Large enterprise, utility, carrier, or public-sector account; keep as strategic/nurture unless a team-level owner and small pilot route are identified."
    };
  }

  if (klass === "medium_enterprise" && hasSequence && hasEmail && ["technical", "operator"].includes(role)) {
    return {
      bucket: "short_term",
      reason:
        `${lead.company} has a named ${role} contact with a sequence and email candidate; work as a short-term pilot wedge while keeping the ask narrow and operational.`
    };
  }

  if (hasSequence && hasEmail && ["technical", "operator"].includes(role)) {
    return {
      bucket: "short_term",
      reason:
        `${segment} ${role} contact at a non-enterprise account; best near-term wedge if the email verifies and the workflow owner is reachable.`
    };
  }

  if (hasSequence && hasEmail && role === "economic") {
    return {
      bucket: "medium_term",
      reason:
        "Executive route is useful, but still needs routing to the exact outage-sensitive workflow owner before treating as short-term."
    };
  }

  if (hasSequence && hasEmail) {
    return {
      bucket: "medium_term",
      reason: "Sequenced named contact with an email candidate, useful as a router while stronger operators are worked first."
    };
  }

  return {
    bucket: "long_term",
    reason: "Needs stronger contact data, verification, or a clearer buying path before daily outbound focus."
  };
}

const leads = await readLeads("outagehub");
const updates = [];

for (const lead of leads) {
  const { bucket, reason } = bucketFor(lead);
  const segment = segmentFor(lead);
  const patch = {
    contract_bucket: bucket,
    contract_bucket_reason: reason,
    segment
  };
  await updateLead(lead.id, patch, "outagehub");
  updates.push({ bucket, segment, source: lead.source_agent });
}

const byBucket = updates.reduce((acc, row) => {
  acc[row.bucket] = (acc[row.bucket] || 0) + 1;
  return acc;
}, {});
const namedByBucket = updates
  .filter((row) => row.source === "outagehub-contact-discovery")
  .reduce((acc, row) => {
    acc[row.bucket] = (acc[row.bucket] || 0) + 1;
    return acc;
  }, {});
const bySegment = updates.reduce((acc, row) => {
  acc[row.segment] = (acc[row.segment] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({ updated: updates.length, byBucket, namedByBucket, bySegment }, null, 2));
