import { readState } from "./bus.js";
import { upsertLeads } from "./leads-store.js";

function domainFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function firstUrl(...candidates) {
  return candidates.flat().find((value) => typeof value === "string" && value.startsWith("http")) || "";
}

// "Matt Aitken, CEO" -> { name: "Matt Aitken", title: "CEO" }
function splitNameTitle(value) {
  if (typeof value !== "string" || !value.trim()) return { name: "", title: "" };
  const [name, ...rest] = value.split(",");
  return { name: name.trim(), title: rest.join(",").trim() };
}

function looksLikeNamedPerson(name) {
  const value = String(name || "").trim();
  if (!value) return false;
  if (/\b(team|owner|lead|manager|director|advisor|operations|product|platform|engineering|claims|support|facilities|router|buyer|contact|department|role|or)\b/i.test(value)) {
    return false;
  }
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 5 && parts.every((part) => /^[A-Z][A-Za-z'.-]+$/.test(part));
}

function emailStatus(email) {
  return email ? "found" : "unknown";
}

function personKey(company, name) {
  return `${String(company || "").toLowerCase().trim()}|${String(name || "").toLowerCase().trim()}`;
}

function buildPersonContextIndex(artifacts, productPrefix) {
  const slug = (suffix) => `${productPrefix}-${suffix}`;
  const byPerson = new Map();

  for (const dossier of artifacts[slug("client-dossier")]?.company_contact_dossiers || []) {
    const account = dossier.account_context || {};
    for (const person of dossier.people || []) {
      byPerson.set(personKey(dossier.company, person.name), {
        why_now: account.known_trigger || "",
        lit_up_case: person.lit_up_case || "",
        why_this_person: person.why_this_person || "",
        owner_hypothesis: person.exact_owner_hypothesis || person.role_category || "",
        likely_current_pain: person.likely_current_pain || "",
        first_contract_slice: dossier.best_first_contract_slice || "",
        reply_path: person.contact_info?.routing_notes || person.contact_info?.company_contact_route || "",
        contact_route: person.contact_info?.company_contact_route || "",
        outreach_angle: person.best_email_angle || person.reachout_context || ""
      });
    }
  }

  for (const map of artifacts[slug("outreach-angle")]?.company_outreach_maps || []) {
    for (const person of map.people || []) {
      byPerson.set(personKey(map.company, person.person_name), {
        ...(byPerson.get(personKey(map.company, person.person_name)) || {}),
        why_now: map.account_trigger?.summary || "",
        lit_up_case: person.lit_up_case || "",
        why_this_person: person.why_this_person || "",
        owner_hypothesis: person.exact_owner_hypothesis || person.role_category || "",
        likely_current_pain: person.follow_on_bridge || "",
        first_contract_slice: map.best_first_contract_slice || person.contract_ask || "",
        reply_path: person.reply_path || "",
        contact_route: person.contact_info?.company_contact_route || "",
        outreach_angle: person.specific_opener || person.follow_on_bridge || ""
      });
    }
  }

  for (const person of artifacts[slug("outreach-angle")]?.person_dossiers || []) {
    byPerson.set(personKey(person.company, person.person_name), {
      ...(byPerson.get(personKey(person.company, person.person_name)) || {}),
      why_now: person.account_trigger?.summary || "",
      lit_up_case: person.lit_up_case || "",
      why_this_person: person.person_relevance || "",
      owner_hypothesis: person.exact_owner_hypothesis || "",
      likely_current_pain: person.gnk_relevant_pain || "",
      first_contract_slice: person.contract_ask || "",
      reply_path: person.reply_path || person.get_through_reasoning || "",
      outreach_angle: person.specific_opener || person.follow_on_bridge || ""
    });
  }

  // Persona/vibe read (lead-persona-profile). Merges onto the same person so the
  // culture/mindset/tone fields ride along with the lead built from discovery.
  for (const person of artifacts[slug("lead-persona-profile")]?.person_personas || []) {
    byPerson.set(personKey(person.company, person.person_name), {
      ...(byPerson.get(personKey(person.company, person.person_name)) || {}),
      persona_vibe: person.vibe_summary || "",
      culture_context: person.culture_context || "",
      mindset: person.mindset || "",
      communication_style: person.communication_style || "",
      perspective: person.perspective || "",
      decision_style: person.decision_style || "",
      tone_guidance: person.tone_guidance || "",
      persona_avoid: person.what_to_avoid || "",
      persona_confidence: person.confidence || ""
    });
  }

  return byPerson;
}

// Persona/vibe fields to copy from a person-context entry onto a lead.
const PERSONA_FIELDS = [
  "persona_vibe",
  "culture_context",
  "mindset",
  "communication_style",
  "perspective",
  "decision_style",
  "tone_guidance",
  "persona_avoid",
  "persona_confidence"
];

function personaFields(context = {}) {
  const out = {};
  for (const field of PERSONA_FIELDS) {
    if (context[field]) out[field] = context[field];
  }
  return out;
}

// Pull one lead per named person (and the likely buyer on each sourced account).
export function extractLeads(state, productPrefix = "gnk") {
  const artifacts = state.artifacts || {};
  const leads = [];
  const slug = (suffix) => `${productPrefix}-${suffix}`;
  const personContext = buildPersonContextIndex(artifacts, productPrefix);
  const playByCompany = new Map(
    (artifacts[slug("account-sourcing")]?.target_accounts || [])
      .filter((account) => account.company && account.play_id)
      .map((account) => [String(account.company).toLowerCase().trim(), account.play_id])
  );
  const playFor = (company, explicit = null) => explicit || playByCompany.get(String(company || "").toLowerCase().trim()) || null;

  // 1. Named contacts from contact discovery (richest source).
  for (const map of artifacts[slug("contact-discovery")]?.account_contact_maps || []) {
    const domain = domainFromUrl(map.website);
    for (const person of map.named_contacts || []) {
      const info = person.contact_info || {};
      const email = info.official_public_email || "";
      const context = personContext.get(personKey(map.company, person.name)) || {};
      leads.push({
        play_id: playFor(map.company, map.play_id),
        name: person.name,
        title: person.current_title,
        company: map.company,
        company_domain: domain,
        linkedin_or_source: info.linkedin_url || info.profile_url || "",
        source_url: firstUrl(info.profile_url, info.linkedin_url, person.source_urls, map.website),
        email_best: email,
        email_status: emailStatus(email),
        trigger_event: map.account_trigger || "",
        why_now: context.why_now || map.account_trigger || "",
        lit_up_case: context.lit_up_case || person.lit_up_case || "",
        why_this_person: context.why_this_person || person.why_them || "",
        owner_hypothesis: context.owner_hypothesis || person.exact_owner_hypothesis || person.title_match || person.role_category || "",
        likely_current_pain: context.likely_current_pain || person.likely_current_pain || "",
        first_contract_slice: context.first_contract_slice || person.first_contract_slice || "",
        reply_path: context.reply_path || info.routing_notes || "",
        contact_route: context.contact_route || info.company_contact_route || "",
        outreach_angle: context.outreach_angle || person.reachout_context || "",
        confidence: person.confidence || info.contact_info_confidence || "",
        ...personaFields(context),
        source_agent: slug("contact-discovery")
      });
    }
  }

  // 2. People from full dossiers.
  for (const dossier of artifacts[slug("client-dossier")]?.company_contact_dossiers || []) {
    const domain = domainFromUrl(dossier.website);
    for (const person of dossier.people || []) {
      const info = person.contact_info || {};
      const email = info.official_public_email || "";
      const context = personContext.get(personKey(dossier.company, person.name)) || {};
      leads.push({
        play_id: playFor(dossier.company, dossier.play_id),
        name: person.name,
        title: person.current_title,
        company: dossier.company,
        company_domain: domain,
        linkedin_or_source: info.linkedin_url || info.profile_url || "",
        source_url: firstUrl(info.profile_url, info.linkedin_url, person.source_urls, dossier.website),
        email_best: email,
        email_status: emailStatus(email),
        trigger_event: dossier.account_context?.known_trigger || "",
        why_now: context.why_now || dossier.account_context?.known_trigger || "",
        lit_up_case: context.lit_up_case || person.lit_up_case || "",
        why_this_person: context.why_this_person || person.why_this_person || "",
        owner_hypothesis: context.owner_hypothesis || person.exact_owner_hypothesis || person.role_category || "",
        likely_current_pain: context.likely_current_pain || person.likely_current_pain || "",
        first_contract_slice: context.first_contract_slice || dossier.best_first_contract_slice || "",
        reply_path: context.reply_path || info.routing_notes || "",
        contact_route: context.contact_route || info.company_contact_route || "",
        outreach_angle: context.outreach_angle || person.best_email_angle || person.reachout_context || "",
        ...personaFields(context),
        source_agent: slug("client-dossier")
      });
    }
  }

  // 3. Likely buyer named on each sourced account (seed even before contact discovery runs).
  for (const account of artifacts[slug("account-sourcing")]?.target_accounts || []) {
    const { name, title } = splitNameTitle(account.reachable_path?.likely_buyer_or_router);
    if (!looksLikeNamedPerson(name)) continue;
    leads.push({
      play_id: playFor(account.company, account.play_id),
      name,
      title,
      company: account.company,
      company_domain: domainFromUrl(account.website),
      source_url: firstUrl(account.trigger_event?.source_url, account.website, account.source_urls),
      email_status: "unknown",
      segment: account.icp_segment || "",
      fit_score: account.fit_score ?? "",
      trigger_event: account.trigger_event?.summary || "",
      why_now: account.trigger_event?.why_it_matters || account.fit_reason || "",
      lit_up_case: account.reachable_path?.manager_lit_up_hypothesis || "",
      why_this_person: account.reachable_path?.manager_lit_up_hypothesis || account.reachable_path?.evidence || "",
      owner_hypothesis: account.reachable_path?.exact_workflow_or_system || account.reachable_path?.likely_buyer_or_router || "",
      likely_current_pain: account.contract_value_hypothesis || "",
      first_contract_slice: account.contract_value_hypothesis || "",
      reply_path: account.reachable_path?.route || "",
      contact_route: account.reachable_path?.route || "",
      outreach_angle: account.outreach_angle || "",
      confidence: account.confidence || "",
      source_agent: slug("account-sourcing")
    });
  }

  // 4. Persona/vibe read as standalone enrichment records. These upsert-merge onto
  // the existing lead for that person (keyed by name+company), carrying the culture,
  // mindset, communication, and tone fields even when discovery isn't re-extracted
  // in this pass. Only people with a real source URL are kept by the filter below.
  for (const person of artifacts[slug("lead-persona-profile")]?.person_personas || []) {
    if (!person.person_name || !person.company) continue;
    leads.push({
      play_id: playFor(person.company, person.play_id),
      name: person.person_name,
      title: person.current_title || "",
      company: person.company,
      source_url: firstUrl(person.source_urls),
      persona_vibe: person.vibe_summary || "",
      culture_context: person.culture_context || "",
      mindset: person.mindset || "",
      communication_style: person.communication_style || "",
      perspective: person.perspective || "",
      decision_style: person.decision_style || "",
      tone_guidance: person.tone_guidance || "",
      persona_avoid: person.what_to_avoid || "",
      persona_confidence: person.confidence || "",
      source_agent: slug("lead-persona-profile")
    });
  }

  // Only keep leads that have a name and a real source URL (guards against invented contacts).
  const cleaned = leads.filter((lead) => lead.name && lead.source_url);
  // Durable guard: OutageHub pulls outage data FROM power/utility companies —
  // they are data sources, never customers. Never ingest them as leads, even if a
  // stale upstream artifact still contains them.
  if (productPrefix === "outagehub") {
    return cleaned.filter((lead) => !isPowerCompany(lead.company));
  }
  return cleaned;
}

export function isPowerCompany(company) {
  return /\bhydro\b|power generation|\bpower\b|\belectric|\butilit|\bgrid\b|\bipp\b/i.test(company || "");
}

export async function ingestFromState(productPrefix = process.argv[2] || "gnk") {
  const state = await readState();
  const leads = extractLeads(state, productPrefix);
  const groups = new Map();
  for (const lead of leads) {
    const key = lead.play_id || "triage";
    (groups.get(key) || groups.set(key, []).get(key)).push(lead);
  }
  const runs = [];
  for (const [play, group] of groups) {
    runs.push(await upsertLeads(group, productPrefix, {
      play_id: play === "triage" ? null : play,
      stage: "artifact-ingest",
      source_store: "agent-artifacts",
      note: `${productPrefix} ${play} artifact cohort`,
    }));
  }
  return {
    added: runs.reduce((sum, run) => sum + run.added, 0),
    updated: runs.reduce((sum, run) => sum + run.updated, 0),
    total: runs.at(-1)?.total || 0,
    runs,
  };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  ingestFromState()
    .then((result) => {
      console.log(`Ingested leads: +${result.added} new, ${result.updated} updated, ${result.total} total.`);
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}
