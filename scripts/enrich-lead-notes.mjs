import fs from "node:fs/promises";

const GENERATED_SOURCE = "lead_context_enrichment_v1";
const NOW = new Date().toISOString();
const LEAD_TARGETS = [
  { filePath: "data/leads-gnk.jsonl", product: "gnk" },
  { filePath: "data/leads.jsonl", product: "gnk" },
  { filePath: "data/leads-outagehub.jsonl", product: "outagehub" }
];

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstName(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function sentence(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatList(items = [], indent = "") {
  const values = items.filter((item) => item != null && item !== "");
  if (!values.length) return "";
  return values.map((item) => `${indent}- ${sentence(item)}`).join("\n");
}

function formatObjectRows(obj = {}, indent = "") {
  return Object.entries(obj)
    .filter(([, value]) => value != null && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => {
      const label = key.replace(/_/g, " ");
      if (Array.isArray(value)) return `${indent}- ${label}: ${value.map(sentence).join("; ")}`;
      if (typeof value === "object") return `${indent}- ${label}: ${JSON.stringify(value)}`;
      return `${indent}- ${label}: ${value}`;
    })
    .join("\n");
}

function section(title, body) {
  const text = String(body || "").trim();
  return text ? `\n\n## ${title}\n${text}` : "";
}

function companyKey(record) {
  return norm(record?.company || record?.account_name || "");
}

function personKey(record) {
  return `${companyKey(record)}|${norm(record?.name || record?.person_name || record?.contact?.name || "")}`;
}

function leadPersonKey(lead) {
  return `${norm(lead.company)}|${norm(lead.name)}`;
}

function makeIndexes(state, reviewerFull, product = "gnk") {
  const artifacts = state.artifacts || {};
  const slug = (suffix) => `${product}-${suffix}`;
  const reviewerArtifact = artifacts[slug("email-sequence-reviewer")] || {};
  const reviewerSource = {
    ...reviewerArtifact,
    ...reviewerFull,
    person_sequence_reviews: reviewerFull.person_sequence_reviews || reviewerArtifact.person_sequence_reviews || [],
    improved_person_email_sequences: reviewerFull.improved_person_email_sequences || reviewerArtifact.improved_person_email_sequences || []
  };
  const index = {
    accountSourcing: new Map(),
    accountScoring: new Map(),
    contactMap: new Map(),
    contactPerson: new Map(),
    priorityContact: new Map(),
    companyDossier: new Map(),
    personDossier: new Map(),
    standaloneDossier: new Map(),
    outreachCompany: new Map(),
    outreachPerson: new Map(),
    outreachStandalonePerson: new Map(),
    draftCompany: new Map(),
    draftPerson: new Map(),
    sequence: new Map(),
    review: new Map(),
    reviewSequence: new Map(),
    emailFinder: new Map(),
    emailCompany: new Map()
  };

  for (const account of artifacts[slug("account-sourcing")]?.target_accounts || []) {
    index.accountSourcing.set(companyKey(account), account);
  }
  for (const account of artifacts[slug("account-scoring")]?.ranked_accounts || []) {
    index.accountScoring.set(norm(account.account_name), account);
  }
  for (const map of artifacts[slug("contact-discovery")]?.account_contact_maps || []) {
    index.contactMap.set(companyKey(map), map);
    for (const person of map.named_contacts || []) {
      index.contactPerson.set(`${companyKey(map)}|${norm(person.name)}`, { map, person });
    }
  }
  for (const person of artifacts[slug("contact-discovery")]?.contacts_to_prioritize || []) {
    index.priorityContact.set(personKey(person), person);
  }
  for (const dossier of artifacts[slug("client-dossier")]?.company_contact_dossiers || []) {
    index.companyDossier.set(companyKey(dossier), dossier);
    for (const person of dossier.people || []) {
      index.personDossier.set(`${companyKey(dossier)}|${norm(person.name)}`, { dossier, person });
    }
  }
  for (const dossier of artifacts[slug("client-dossier")]?.dossiers || []) {
    index.standaloneDossier.set(personKey(dossier), dossier);
  }
  for (const map of artifacts[slug("outreach-angle")]?.company_outreach_maps || []) {
    index.outreachCompany.set(companyKey(map), map);
    for (const person of map.people || []) {
      index.outreachPerson.set(`${companyKey(map)}|${norm(person.person_name || person.name)}`, { map, person });
    }
  }
  for (const person of artifacts[slug("outreach-angle")]?.person_dossiers || []) {
    index.outreachStandalonePerson.set(personKey(person), person);
  }
  for (const draft of artifacts[slug("email-drafter")]?.company_email_drafts || []) {
    index.draftCompany.set(companyKey(draft), draft);
    if (draft.primary_contact?.name) {
      index.draftPerson.set(`${companyKey(draft)}|${norm(draft.primary_contact.name)}`, {
        draft,
        email: draft.primary_email,
        contact: draft.primary_contact,
        kind: "primary"
      });
    }
    for (const alt of draft.alternate_contact_emails || []) {
      index.draftPerson.set(`${companyKey(draft)}|${norm(alt.to_name)}`, {
        draft,
        email: alt,
        contact: { name: alt.to_name, title: alt.title, role_category: alt.role_category },
        kind: "alternate"
      });
    }
  }
  for (const sequence of artifacts[slug("email-sequence-drafter")]?.person_email_sequences || []) {
    index.sequence.set(personKey(sequence), sequence);
  }
  for (const review of reviewerSource.person_sequence_reviews || []) {
    index.review.set(personKey(review), review);
  }
  for (const sequence of reviewerSource.improved_person_email_sequences || []) {
    index.reviewSequence.set(personKey(sequence), sequence);
  }
  for (const result of artifacts[slug("email-finder")]?.results || []) {
    index.emailFinder.set(personKey(result), result);
  }
  for (const map of artifacts[slug("email-finder")]?.company_email_maps || []) {
    index.emailCompany.set(companyKey(map), map);
  }
  return index;
}

function sectionLeadBasics(lead) {
  return [
    `Lead: ${lead.name || "(unknown)"}${lead.title ? `, ${lead.title}` : ""}${lead.company ? ` at ${lead.company}` : ""}`,
    `CRM bucket: ${lead.contract_bucket || ""}`,
    `Bucket reason: ${lead.contract_bucket_reason || ""}`,
    `Stage: ${lead.stage || ""}`,
    `Fit score: ${lead.fit_score ?? ""}`,
    `Confidence: ${lead.confidence || ""}`,
    `Segment: ${lead.segment || ""}`,
    `Trigger event: ${lead.trigger_event || ""}`,
    `Outreach angle: ${lead.outreach_angle || ""}`,
    `Source agent: ${lead.source_agent || ""}`,
    `Source URL: ${lead.source_url || ""}`,
    `LinkedIn/source route: ${lead.linkedin_or_source || ""}`,
    `Email best: ${lead.email_best || ""}`,
    `Email status: ${lead.email_status || ""}`,
    `Email pattern: ${lead.email_pattern || ""}`,
    `Email candidates: ${(lead.email_candidates || []).join(", ")}`
  ].filter((line) => !line.endsWith(": ") && !line.endsWith(": ")).join("\n");
}

function sectionAccountSourcing(account) {
  if (!account) return "";
  return formatObjectRows({
    company_description: account.company_description,
    icp_segment: account.icp_segment,
    fit_reason: account.fit_reason,
    fit_score: account.fit_score,
    contract_value_hypothesis: account.contract_value_hypothesis,
    contract_value_fit: account.contract_value_fit,
    deal_tier_hypothesis: account.deal_tier_hypothesis,
    expected_monthly_value_range_usd: account.expected_monthly_value_range_usd,
    sales_cycle_hypothesis: account.sales_cycle_hypothesis,
    procurement_risk: account.procurement_risk,
    portfolio_role: account.portfolio_role,
    why_not_too_small: account.why_not_too_small,
    why_not_too_large: account.why_not_too_large,
    seller_commission_potential: account.seller_commission_potential,
    trigger_event: account.trigger_event,
    reachable_path: account.reachable_path,
    recommended_contact_titles: account.recommended_contact_titles,
    outreach_angle: account.outreach_angle,
    confidence: account.confidence,
    source_urls: account.source_urls
  });
}

function sectionAccountScoring(account) {
  if (!account) return "";
  return formatObjectRows({
    rank: account.rank,
    score: account.score,
    fit_tier: account.fit_tier,
    contract_value_fit: account.contract_value_fit,
    why_40k_floor_is_plausible: account.why_40k_floor_is_plausible,
    deal_tier: account.deal_tier,
    expected_monthly_value_range_usd: account.expected_monthly_value_range_usd,
    cash_flow_priority: account.cash_flow_priority,
    seller_commission_estimate: account.seller_commission_estimate,
    sales_cycle_hypothesis: account.sales_cycle_hypothesis,
    procurement_risk: account.procurement_risk,
    portfolio_role: account.portfolio_role,
    why_not_too_small_or_large: account.why_not_too_small_or_large,
    reachable_path_score: account.reachable_path_score,
    path_to_buyer: account.path_to_buyer,
    email_viability: account.email_viability,
    matched_fit_signals: account.matched_fit_signals,
    matched_disqualifiers: account.matched_disqualifiers,
    reason: account.reason,
    recommended_offer_angle: account.recommended_offer_angle,
    recommended_contacts: account.recommended_contacts,
    next_action: account.next_action
  });
}

function sectionContactDiscovery(match, priorityContact, contactMap) {
  const parts = [];
  if (contactMap) {
    parts.push(formatObjectRows({
      account_trigger: contactMap.account_trigger,
      recommended_contact_titles_used: contactMap.recommended_contact_titles_used,
      account_notes: contactMap.account_notes,
      coverage_gaps: contactMap.coverage_gaps
    }));
  }
  if (match?.person) {
    parts.push(formatObjectRows({
      name: match.person.name,
      current_title: match.person.current_title,
      role_category: match.person.role_category,
      why_them: match.person.why_them,
      title_match: match.person.title_match,
      contact_info: match.person.contact_info,
      reachout_context: match.person.reachout_context,
      evidence: match.person.evidence,
      source_urls: match.person.source_urls,
      confidence: match.person.confidence
    }));
  }
  if (priorityContact) {
    parts.push(formatObjectRows({
      priority_reason: priorityContact.priority_reason,
      contract_relevance: priorityContact.contract_relevance,
      contact_info: priorityContact.contact_info,
      reachout_context: priorityContact.reachout_context,
      suggested_outreach_angle: priorityContact.suggested_outreach_angle,
      source_urls: priorityContact.source_urls
    }));
  }
  return parts.filter(Boolean).join("\n");
}

function sectionDossier(companyDossier, personMatch, standaloneDossier) {
  const parts = [];
  if (companyDossier) {
    parts.push("Account context:\n" + formatObjectRows(companyDossier.account_context || {}, "  "));
    if (companyDossier.coverage_gaps?.length) parts.push("Coverage gaps:\n" + formatList(companyDossier.coverage_gaps, "  "));
  }
  if (personMatch?.person) {
    parts.push("Person dossier:\n" + formatObjectRows({
      current_title: personMatch.person.current_title,
      role_category: personMatch.person.role_category,
      why_this_person: personMatch.person.why_this_person,
      contact_info: personMatch.person.contact_info,
      reachout_context: personMatch.person.reachout_context,
      best_email_angle: personMatch.person.best_email_angle,
      first_conversation_to_test: personMatch.person.first_conversation_to_test,
      claims_to_avoid: personMatch.person.claims_to_avoid,
      source_urls: personMatch.person.source_urls
    }, "  "));
  }
  if (standaloneDossier) {
    parts.push("Offer alignment and conversation path:\n" + formatObjectRows({
      account_context: standaloneDossier.account_context,
      contact: standaloneDossier.contact,
      offer_alignment: standaloneDossier.offer_alignment,
      path_to_conversation: standaloneDossier.path_to_conversation,
      detailed_notes: standaloneDossier.detailed_notes,
      conversation_hypotheses: standaloneDossier.conversation_hypotheses,
      discovery_questions: standaloneDossier.discovery_questions,
      outreach_angle: standaloneDossier.outreach_angle,
      claims_to_avoid: standaloneDossier.claims_to_avoid,
      evidence_gaps: standaloneDossier.evidence_gaps,
      source_urls: standaloneDossier.source_urls
    }, "  "));
  }
  return parts.filter(Boolean).join("\n\n");
}

function sectionOutreach(companyMap, personMatch, standalonePerson) {
  const parts = [];
  if (companyMap) {
    parts.push("Account outreach map:\n" + formatObjectRows({
      account_priority: companyMap.account_priority,
      account_trigger: companyMap.account_trigger,
      why_40k_month_is_plausible: companyMap.why_40k_month_is_plausible,
      best_first_contract_slice: companyMap.best_first_contract_slice,
      coverage_gaps: companyMap.coverage_gaps
    }, "  "));
  }
  if (personMatch?.person) {
    parts.push("Person outreach prep:\n" + formatObjectRows({
      title: personMatch.person.title,
      role_category: personMatch.person.role_category,
      contact_info: personMatch.person.contact_info,
      why_this_person: personMatch.person.why_this_person,
      reachout_context: personMatch.person.reachout_context,
      specific_opener: personMatch.person.specific_opener,
      follow_on_bridge: personMatch.person.follow_on_bridge,
      contract_ask: personMatch.person.contract_ask,
      reply_path: personMatch.person.reply_path,
      email_prep_notes: personMatch.person.email_prep_notes,
      claims_to_avoid: personMatch.person.claims_to_avoid,
      confidence: personMatch.person.confidence,
      source_urls: personMatch.person.source_urls
    }, "  "));
  }
  if (standalonePerson) {
    parts.push("Standalone angle dossier:\n" + formatObjectRows({
      priority: standalonePerson.priority,
      account_trigger: standalonePerson.account_trigger,
      person_relevance: standalonePerson.person_relevance,
      product_relevant_pain: standalonePerson.gnk_relevant_pain || standalonePerson.outagehub_relevant_pain,
      specific_opener: standalonePerson.specific_opener,
      follow_on_bridge: standalonePerson.follow_on_bridge,
      contract_ask: standalonePerson.contract_ask,
      reply_path: standalonePerson.reply_path,
      get_through_reasoning: standalonePerson.get_through_reasoning,
      why_this_angle: standalonePerson.why_this_angle,
      confidence: standalonePerson.confidence,
      source_urls: standalonePerson.source_urls
    }, "  "));
  }
  return parts.filter(Boolean).join("\n\n");
}

function sectionEmailDraft(match, draftCompany) {
  const parts = [];
  if (match?.draft) {
    parts.push(formatObjectRows({
      draft_kind: match.kind,
      primary_contact: match.draft.primary_contact,
      recommended_subject: match.email?.recommended_subject || match.draft.recommended_subject,
      subject_options: match.draft.subject_options,
      when_to_use: match.email?.when_to_use,
      why_this_version: match.email?.why_this_version,
      grounding_used: match.email?.grounding_used,
      assumptions_avoided: match.email?.assumptions_avoided,
      send_notes: match.draft.send_notes,
      coverage_gaps: match.draft.coverage_gaps,
      source_urls: match.draft.source_urls
    }));
    if (match.email?.body) parts.push(`First-touch body kept for context:\n${match.email.body}`);
  } else if (draftCompany) {
    parts.push(formatObjectRows({
      company_recommended_subject: draftCompany.recommended_subject,
      subject_options: draftCompany.subject_options,
      send_notes: draftCompany.send_notes,
      coverage_gaps: draftCompany.coverage_gaps,
      source_urls: draftCompany.source_urls
    }));
  }
  return parts.filter(Boolean).join("\n\n");
}

function sectionEmailFinder(person, company) {
  const parts = [];
  if (person) {
    parts.push("Person email finder result:\n" + formatObjectRows({
      email_pattern: person.email_pattern,
      email_best: person.email_best,
      email_candidates: person.email_candidates,
      email_status: person.email_status,
      confidence: person.confidence,
      evidence: person.evidence,
      source_urls: person.source_urls
    }, "  "));
  }
  if (company) {
    parts.push("Company email pattern context:\n" + formatObjectRows({
      company_domain: company.company_domain,
      pattern_decision: company.pattern_decision,
      email_pattern_evidence: company.email_pattern_evidence,
      public_route: company.public_route,
      coverage_gaps: company.coverage_gaps
    }, "  "));
  }
  return parts.filter(Boolean).join("\n\n");
}

function sectionSequence(sequence, review, reviewedSequence) {
  const seq = reviewedSequence || sequence;
  if (!seq && !review) return "";
  const parts = [];
  if (review) {
    parts.push("Reviewer summary:\n" + formatObjectRows({
      overall_score_before: review.overall_score_before,
      overall_score_after: review.overall_score_after,
      strongest_touch: review.strongest_touch,
      weakest_touch: review.weakest_touch,
      main_issues: review.main_issues,
      changes_made: review.changes_made,
      send_readiness: review.send_readiness
    }, "  "));
  }
  if (seq) {
    parts.push("Sequence metadata:\n" + formatObjectRows({
      role_category: seq.role_category,
      contact_route: seq.contact_route,
      email_address: seq.email_address,
      email_address_status: seq.email_address_status,
      sequence_priority: seq.sequence_priority,
      sequence_strategy: seq.sequence_strategy,
      coverage_gaps: seq.coverage_gaps,
      source_urls: seq.source_urls,
      review_score: seq.review_score,
      send_readiness: seq.send_readiness
    }, "  "));
    const touches = (seq.emails || []).map((email) => {
      return [
        `Touch ${email.touch_number} (${email.touch_key || ""}, ${email.send_day || ""})`,
        `Objective: ${email.objective || ""}`,
        `Subject: ${email.recommended_subject || ""}`,
        `Subject options: ${(email.subject_options || []).join(" | ")}`,
        `Why this touch: ${email.why_this_touch || ""}`,
        `Reviewer notes: ${email.review_notes || ""}`,
        `Grounding used: ${(email.grounding_used || []).map(sentence).join(" | ")}`,
        `Assumptions avoided: ${(email.assumptions_avoided || []).map(sentence).join(" | ")}`,
        `Stop/continue rule: ${email.stop_or_continue_rule || ""}`,
        `Body:\n${email.body || ""}`
      ].filter((line) => !line.endsWith(": ") && line !== "Body:\n").join("\n");
    });
    if (touches.length) parts.push("Full sequence touch context:\n" + touches.join("\n\n"));
  }
  return parts.filter(Boolean).join("\n\n");
}

function buildNote(lead, index) {
  const key = leadPersonKey(lead);
  const co = norm(lead.company);
  const chunks = [`# Verbose lead context generated from collected sales artifacts\nGenerated at: ${NOW}`];

  chunks.push(section("CRM lead fields", sectionLeadBasics(lead)));
  chunks.push(section("Account sourcing rationale", sectionAccountSourcing(index.accountSourcing.get(co))));
  chunks.push(section("Account scoring rationale", sectionAccountScoring(index.accountScoring.get(co))));
  chunks.push(section("Contact discovery and routing", sectionContactDiscovery(index.contactPerson.get(key), index.priorityContact.get(key), index.contactMap.get(co))));
  chunks.push(section("Client dossier and offer fit", sectionDossier(index.companyDossier.get(co), index.personDossier.get(key), index.standaloneDossier.get(key))));
  chunks.push(section("Outreach angle and email prep", sectionOutreach(index.outreachCompany.get(co), index.outreachPerson.get(key), index.outreachStandalonePerson.get(key))));
  chunks.push(section("Email finding and address evidence", sectionEmailFinder(index.emailFinder.get(key), index.emailCompany.get(co))));
  chunks.push(section("Draft email context", sectionEmailDraft(index.draftPerson.get(key), index.draftCompany.get(co))));
  chunks.push(section("Sequence and reviewer context", sectionSequence(index.sequence.get(key), index.review.get(key), index.reviewSequence.get(key))));

  return chunks.filter(Boolean).join("");
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readLeads(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function writeLeads(filePath, leads) {
  await fs.writeFile(filePath, `${leads.map((lead) => JSON.stringify(lead)).join("\n")}\n`);
}

const state = await readJsonIfExists("data/state.json", { artifacts: {} });
const reviewerFull = await readJsonIfExists("data/artifacts/gnk-email-sequence-reviewer-full.json", {});

const results = [];
for (const { filePath, product } of LEAD_TARGETS) {
  let leads;
  try {
    leads = await readLeads(filePath);
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }

  const index = makeIndexes(state, product === "gnk" ? reviewerFull : {}, product);
  let updated = 0;
  for (const lead of leads) {
    const preserved = (lead.notes || []).filter((note) => note?.source !== GENERATED_SOURCE);
    const text = buildNote(lead, index);
    lead.notes = [
      ...preserved,
      {
        at: NOW,
        source: GENERATED_SOURCE,
        text
      }
    ];
    lead.updated_at = NOW;
    updated += 1;
  }
  await writeLeads(filePath, leads);
  results.push({ filePath, product, updated });
}

console.log(JSON.stringify({ ok: true, generated_source: GENERATED_SOURCE, results }, null, 2));
