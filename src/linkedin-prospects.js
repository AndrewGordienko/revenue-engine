import fs from "node:fs/promises";
import { fromRoot } from "./paths.js";

const MESSAGE_MANIFEST = fromRoot("data", "inputs", "linkedin-connection-messages.json");
const SHARED_STATE = fromRoot("data", "state.json");
const DIRECT_PROFILE = /^https:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[a-z0-9%_-]+\/?$/i;
const FORBIDDEN_DASH = /[\u2013\u2014]/;

function clean(value) {
  return String(value || "").replace(FORBIDDEN_DASH, ",").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function key(name, company) {
  return `${name}|${company}`.toLowerCase();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function firstName(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (/^(dr\.?|mr\.?|mrs\.?|ms\.?)$/i.test(parts[0])) return parts[1] || "there";
  return parts[0] || "there";
}

function observedSignal(lead) {
  const trigger = typeof lead.trigger_event === "object"
    ? lead.trigger_event?.summary || lead.trigger_event?.description || ""
    : lead.trigger_event;
  return clean(trigger || lead.why_now || lead.outreach_angle || "The role is close to an active operating workflow");
}

function whyThisPerson(lead) {
  return clean(lead.why_this_person || lead.owner_hypothesis || `${lead.title || "This role"} is a plausible owner or evaluator for the workflow`);
}

function gnkValue(lead) {
  const text = `${lead.title || ""} ${lead.trigger_event || ""} ${lead.why_now || ""} ${lead.likely_current_pain || ""}`.toLowerCase();
  if (/incident|outage|reliab|failover|kubernetes|production troubleshooting/.test(text)) return "Run a senior reliability sprint on one risky infrastructure slice, then hand it back with tests, runbooks and clear ownership.";
  if (/ai gateway|agent|model|machine learning|underwriting|drafting/.test(text)) return "Own one production AI workflow, including integration, evals, fallback, observability and a clean handoff.";
  if (/integration|excel|api|mcp|data flow|event-driven/.test(text)) return "Stabilise one integration or data-flow slice and hand it back with tests, observability and runbooks.";
  if (/privacy|security|compliance|consent|bank|regulated/.test(text)) return "Deliver one compliance-sensitive backend workflow with explicit controls, auditability and handoff.";
  if (/moderni|legacy|platform/.test(text)) return "Modernise one high-risk backend or platform slice without pulling the internal team off its roadmap.";
  if (/product|launch|workflow/.test(text)) return "Take one complex product workflow from scope through production and leave the internal team a clean handoff.";
  return "Put a senior engineering pod around one bounded backend or platform priority and deliver it through production.";
}

function outagehubValue(lead) {
  const text = `${lead.title || ""} ${lead.segment || ""} ${lead.trigger_event || ""} ${lead.likely_current_pain || ""}`.toLowerCase();
  if (/claim|insurance|underwriting|risk/.test(text)) return "Pilot outage verification inside one claims triage workflow, with alerts routed into the tools the team already uses.";
  if (/dispatch|logistics|fleet|courier|shipping|transport|route/.test(text)) return "Put outage alerts into dispatch decisions for one depot, lane or operating region, without adding another dashboard.";
  if (/property|facility|building|resident|tenant|farm|plant|maintenance/.test(text)) return "Pilot site-level outage alerts and escalation for one facility or portfolio slice, using the team's existing channels.";
  if (/pharmacy|health|care|patient/.test(text)) return "Pilot outage alerts inside one fulfilment, facility or patient-update workflow to reduce manual status checks.";
  if (/network|telecom|isp|data cent|incident|systems architect/.test(text)) return "Put Canadian outage context into incident triage for one site or region, with API or notification delivery.";
  if (/customer success|support|customer-status/.test(text)) return "Embed outage context in one customer-status workflow so teams can route updates with less manual checking.";
  return "Pilot Canadian outage alerts inside one recurring operational decision, delivered by API or notification rather than another dashboard.";
}

function morrowValue(lead) {
  const text = `${lead.title || ""} ${lead.segment || ""} ${lead.trigger_event || ""} ${lead.likely_current_pain || ""}`.toLowerCase();
  if (/kit|assembly|fulfil|fulfill|3pl|co-?pack/.test(text)) return "Test one variable kitting, repacking or fulfilment job with adaptive robotics before redesigning the line.";
  if (/food|plant|production|packag|automation/.test(text)) return "Test one changeover-heavy secondary-packing job with adaptive robotics alongside the existing line.";
  return "Test one high-mix packing workflow with adaptive robotics before committing to fixed automation.";
}

function compactSignal(lead) {
  const text = observedSignal(lead)
    .replace(/^on [a-z]+ \d{1,2}, \d{4}, /i, "")
    .replace(/^the company /i, "")
    .replace(/^public /i, "");
  const firstSentence = text.split(/(?<=[.!?])\s/)[0];
  const words = firstSentence.split(/\s+/);
  return words.slice(0, 24).join(" ");
}

function fitMessage(message) {
  const normalized = String(message || "").replace(FORBIDDEN_DASH, ",").replace(/\s+/g, " ").trim();
  if (normalized.length <= 299) return normalized;
  const clipped = normalized.slice(0, 298);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 220 ? boundary : 298).replace(/[,;:]$/, "")}.`;
}

function fallbackMessage(lead, product, value) {
  const first = firstName(lead.name);
  const signal = compactSignal(lead);
  const action = value.split(/[.!?]/)[0];
  const brand = product === "gnk" ? "GNK" : product === "outagehub" ? "OutageHub" : "Morrow";
  return fitMessage(`Hi ${first}, saw ${signal}. ${brand} can ${action.charAt(0).toLowerCase()}${action.slice(1)}. Open to connecting?`);
}

function directMessageSet(lead, product) {
  const first = firstName(lead.name);
  const signal = compactSignal(lead).split(/\s+/).slice(0, 18).join(" ");
  const brand = product === "gnk" ? "GNK" : product === "outagehub" ? "OutageHub" : "Morrow";
  const description = product === "gnk"
    ? "helps teams finish one consequential production software project with a senior delivery team"
    : product === "outagehub"
      ? "provides external Canadian power-event context that complements internal operational systems"
      : "develops adaptive robotic software for high-mix packing and kitting workflows";
  const hypothesis = product === "gnk"
    ? "a production delivery bottleneck may be competing with the internal roadmap"
    : product === "outagehub"
      ? "external outage context may still require manual checking during operational incidents"
      : "workflow variation may make conventional fixed automation difficult to justify";
  const firstMessage = `Hi ${first}, I reached out because ${signal}. I run ${brand}, which ${description}. My operating hypothesis is that ${hypothesis}. Would you be open to a 20-minute call to compare how this works today and whether there is a useful next step?`;
  const followUp = `Hi ${first}, one clarification on my earlier note: I am testing whether ${hypothesis}, not assuming that it is. Would you be open to a short call next week to compare the current process and see whether the idea is relevant?`;
  return {
    first_message: firstMessage.replace(FORBIDDEN_DASH, ","),
    follow_up: followUp.replace(FORBIDDEN_DASH, ","),
    call_rationale: `Validate whether ${hypothesis}; identify the operating owner, consequence, timing, and commercial path.`,
  };
}

function words(value) { return String(value || "").trim().split(/\s+/).filter(Boolean).length; }

export function validateLinkedinMessageContract(item) {
  const errors = [];
  if (!item.message || item.message.length > 300) errors.push("connection note must be at most 300 characters");
  if (words(item.first_message) < 55 || words(item.first_message) > 90) errors.push("first message must be 55-90 words");
  if (words(item.follow_up) < 35 || words(item.follow_up) > 60) errors.push("follow-up must be 35-60 words");
  const combined = `${item.message || ""} ${item.first_message || ""} ${item.follow_up || ""}`;
  if (FORBIDDEN_DASH.test(combined)) errors.push("message contains an em dash or en dash");
  if (/\bgiven your background\b/i.test(combined)) errors.push("generic opening");
  if (/\bjust checking in\b/i.test(combined)) errors.push("empty follow-up");
  if (!/\b(open to|open to a|would you be open)\b/i.test(item.first_message || "")) errors.push("first message lacks one bounded call ask");
  return errors;
}

function validateGeneratedMessage(item, expectedProfile) {
  if (!item) return false;
  if (item.linkedin_url !== expectedProfile) return false;
  if (!item.connection_message || item.connection_message.length > 299) return false;
  if (FORBIDDEN_DASH.test(item.connection_message)) return false;
  return true;
}

export async function buildLinkedinProspects(leads, product, limit = 30) {
  if (!["gnk", "outagehub", "morrow"].includes(product)) return [];

  const [generated, sharedState] = await Promise.all([
    readJson(MESSAGE_MANIFEST, {}),
    readJson(SHARED_STATE, {})
  ]);
  const writerArtifact = sharedState.artifacts?.[`${product}-email-drafter`];
  const busMessages = writerArtifact?.linkedin_connection_messages || [];
  const generatedItems = (generated[product]?.length ? generated[product] : busMessages);
  const generatedByKey = new Map(generatedItems.map((item) => [key(item.person_name, item.company), item]));
  const messageAgentSummary = writerArtifact?.linkedin_message_summary || "";
  const verifiedLeads = leads
    .filter((lead) => DIRECT_PROFILE.test(lead.linkedin_or_source || ""))
    .sort((a, b) => (Number(a.linkedin_rank) || 9999) - (Number(b.linkedin_rank) || 9999)
      || (Number(b.fit_score) || 0) - (Number(a.fit_score) || 0));

  return verifiedLeads.slice(0, limit).map((sourceLead, index) => {
    const lead = sourceLead;
    const value = product === "gnk" ? gnkValue(lead) : product === "outagehub" ? outagehubValue(lead) : morrowValue(lead);
    const generatedItem = generatedByKey.get(key(lead.name, lead.company));
    const hasGenerated = validateGeneratedMessage(generatedItem, lead.linkedin_or_source);
    const message = hasGenerated ? generatedItem.connection_message : fallbackMessage(lead, product, value);
    const direct = directMessageSet(lead, product);

    return {
      id: sourceLead.id || `${product}-${index + 1}`,
      rank: index + 1,
      name: lead.name,
      title: lead.title || "Role verified in CRM",
      company: lead.company,
      segment: lead.segment || (product === "gnk" ? "software and platform engineering" : "outage-sensitive operations"),
      fit_score: Number(lead.fit_score) || null,
      observed_signal: hasGenerated ? clean(generatedItem.observed_signal) : observedSignal(lead),
      why_now: hasGenerated ? clean(generatedItem.observed_signal) : observedSignal(lead),
      why_this_person: hasGenerated ? clean(generatedItem.why_this_person) : whyThisPerson(lead),
      what_we_can_do: hasGenerated ? clean(generatedItem.what_we_can_do) : value,
      profile_url: lead.linkedin_or_source,
      profile_status: "verified",
      profile_verified_at: lead.linkedin_verified_at || null,
      message,
      ...direct,
      message_length: message.length,
      message_source: hasGenerated ? "gpt-5.6" : "grounded fallback",
      message_agent_summary: messageAgentSummary,
      evidence_urls: hasGenerated ? generatedItem.evidence_urls || [] : [lead.source_url, lead.linkedin_or_source].filter(Boolean)
    };
  });
}

export function validateLinkedinProspects(prospects, expectedCount = 30) {
  const errors = [];
  if (prospects.length !== expectedCount) errors.push(`expected ${expectedCount} prospects, found ${prospects.length}`);
  for (const item of prospects) {
    if (!DIRECT_PROFILE.test(item.profile_url)) errors.push(`${item.name}: profile is not a direct LinkedIn /in/ URL`);
    if (item.message_length > 299) errors.push(`${item.name}: message is ${item.message_length} characters`);
    if (FORBIDDEN_DASH.test(item.message)) errors.push(`${item.name}: message contains an em dash or en dash`);
    if (!item.what_we_can_do) errors.push(`${item.name}: missing value hypothesis`);
    for (const error of validateLinkedinMessageContract(item)) errors.push(`${item.name}: ${error}`);
  }
  return errors;
}
