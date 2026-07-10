import { findAgent, publishArtifact } from "../src/bus.js";
import { readLeads } from "../src/leads-store.js";

function norm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function roleCategory(title = "") {
  const text = norm(title);
  if (/\b(ceo|president|chief executive|founder|chair)\b/.test(text)) return "economic_buyer";
  if (/\b(cio|cto|technology|information|data|cyber|platform|digital)\b/.test(text)) return "technical_buyer";
  if (/\b(operations|operating|customer|claims|safety|grid|network|facilities|business solutions)\b/.test(text)) {
    return "product_or_operations_owner";
  }
  return "evaluator_or_router";
}

function segmentContext(segment = "") {
  if (/Telecom/i.test(segment)) {
    return {
      pain: "Power outage context can explain customer-impact patterns and reduce support/NOC guesswork.",
      outcome: "NOC, support, and customer-status workflows get outage status where decisions already happen.",
      firstSlice: "one region or service area where external power status can explain customer-impact patterns",
      budgetOwner: "network operations, customer operations, or technology leadership"
    };
  }
  if (/Insurance/i.test(segment)) {
    return {
      pain: "Claims and property-risk teams often need outage timing and geography without manual map checks.",
      outcome: "Claims triage and customer communications get a repeatable outage-data check.",
      firstSlice: "one claims workflow where outage timing and geography can reduce manual checks",
      budgetOwner: "claims, risk operations, or data leadership"
    };
  }
  if (/Logistics/i.test(segment)) {
    return {
      pain: "Dispatch and depot decisions can be slowed by unclear local power status.",
      outcome: "Route, depot, and exception workflows can flag outage impact earlier.",
      firstSlice: "one depot, route group, or exception workflow where outage status changes field decisions",
      budgetOwner: "operations, dispatch, or customer-experience leadership"
    };
  }
  if (/Property/i.test(segment)) {
    return {
      pain: "Facilities and tenant teams often coordinate outage impact across buildings manually.",
      outcome: "Portfolio teams get alerting and routing for affected buildings or regions.",
      firstSlice: "one portfolio, region, or building group where outage alerts would reduce manual coordination",
      budgetOwner: "property operations, facilities, or tenant-experience leadership"
    };
  }
  if (/Utilities/i.test(segment)) {
    return {
      pain: "Customer, partner, and response workflows need outage data to move cleanly between systems.",
      outcome: "Operational outage context becomes easier to reuse across customer and partner workflows.",
      firstSlice: "one customer-facing or partner-data workflow where outage context has to be clean and current",
      budgetOwner: "grid response, customer operations, or digital operations leadership"
    };
  }
  return {
    pain: "Operations teams need outage visibility in the tools where decisions happen.",
    outcome: "A focused workflow gets cleaner outage data or notification routing.",
    firstSlice: "one focused workflow where outage status changes a decision",
    budgetOwner: "operations, technology, or customer leadership"
  };
}

function companyWebsite(lead) {
  if (lead.company_domain) return `https://${lead.company_domain}`;
  return lead.source_url || "";
}

function groupByCompany(leads) {
  const byCompany = new Map();
  for (const lead of leads) {
    if (!byCompany.has(lead.company)) byCompany.set(lead.company, []);
    byCompany.get(lead.company).push(lead);
  }
  return [...byCompany.entries()].map(([company, people]) => ({ company, people }));
}

function companyPriority(people) {
  if (people.some((lead) => lead.contract_bucket === "short_term")) return "short_term";
  if (people.some((lead) => lead.contract_bucket === "medium_term")) return "medium_term";
  return "long_term";
}

function buildRevenueStrategy(leads) {
  return {
    strategy_summary:
      "Use a traction-first OHUB motion: short-cycle API/notification pilots for reachable operators, medium-cycle integrations for larger systems, and utility/municipal accounts as qualified expansion or partner pipeline.",
    revenue_math: {
      minimum_monthly_contract_value_usd: 1000,
      company_monthly_revenue_floor_usd: 80000,
      seller_commission_rate: 0.1,
      seller_monthly_income_target_usd: 10000,
      seller_required_closed_revenue_usd: 100000,
      minimum_deals_for_company_floor: 80,
      minimum_deals_for_seller_target: 100,
      notes: [
        "$1k/month API access is the smallest viable first contract.",
        "$5k/month notification setup is the best traction wedge.",
        "$10k+/month custom integrations are expansion or high-fit direct-buyer opportunities."
      ]
    },
    deal_tiers: [
      {
        tier: "small",
        monthly_value_range_usd: [1000, 5000],
        likely_sales_cycle: "1-4 weeks when buyer is an operator with a concrete notification or data need.",
        buyer_path: "Direct operator, customer operations lead, technical owner, or founder/executive router.",
        best_first_contract_shape: "API access or one notification workflow scoped to one region, portfolio, team, or depot.",
        portfolio_role: "short_term",
        fit_signals: ["named operator", "email candidate", "clear outage-sensitive workflow", "low procurement drag"],
        disqualifiers: ["only generic procurement route", "no named owner", "no recurring Canadian operational exposure"]
      },
      {
        tier: "medium",
        monthly_value_range_usd: [5000, 15000],
        likely_sales_cycle: "1-3 months when integration or managed alerting touches internal systems.",
        buyer_path: "Operations, technology, data, customer experience, claims, facilities, or network leadership.",
        best_first_contract_shape: "Managed alerting or a narrow integration into an existing workflow.",
        portfolio_role: "medium_expansion_pipeline",
        fit_signals: ["multi-region or multi-site workflow", "technical buyer reachable", "internal system handoff"],
        disqualifiers: ["unclear owner", "outage data is only a curiosity", "no path to budget"]
      },
      {
        tier: "large",
        monthly_value_range_usd: [15000, 50000],
        likely_sales_cycle: "3+ months unless a narrow first slice bypasses broad procurement.",
        buyer_path: "Executive sponsor plus technical/operator owner.",
        best_first_contract_shape: "Partner-data, customer-communications, or operational integration pilot.",
        portfolio_role: "large_nurture_pipeline",
        fit_signals: ["national footprint", "high operational exposure", "strategic data/integration owner"],
        disqualifiers: ["generic vendor intake only", "unqualified utility partnership assumptions", "no proof asset"]
      }
    ],
    company_size_boundaries: {
      too_small: "No recurring Canadian operational exposure or no plausible $1k/month budget.",
      target_small: "Founder/operator-led teams where outage visibility affects support, dispatch, claims, or facilities decisions.",
      target_medium: "Multi-location or multi-region operators with reachable operations/technology ownership.",
      target_large: "Large enterprises only when a specific team owner or router is visible.",
      too_large: "Accounts where the only route is broad procurement and no bounded first workflow is visible."
    },
    target_industry_logic: {
      primary_filter: "Recurring Canadian outage-sensitive workflow plus reachable buyer.",
      industries_to_prefer: ["Telecom and network", "Insurance and claims", "Logistics and dispatch", "Property and facilities"],
      industries_to_deprioritize: ["municipal accounts without named emergency owner", "utilities where the route is only generic procurement"],
      why_industry_is_secondary: "The same industry can be weak or strong depending on owner reachability and the first workflow."
    },
    portfolio_strategy: {
      near_term_send_list: `${leads.filter((lead) => lead.contract_bucket === "short_term").length} current OHUB leads are short-term traction candidates.`,
      medium_expansion_pipeline: `${leads.filter((lead) => lead.contract_bucket === "medium_term").length} current OHUB leads are medium-term routing or expansion candidates.`,
      large_nurture_pipeline: "Use only when there is a specific owner or partner-data path.",
      monthly_operating_target: "Prioritize verified email candidates and short-term named operators before adding more account-only rows.",
      seller_operating_target: "Work enough short/medium candidates to support repeated $1k-$10k first contracts without mentioning economics externally."
    },
    sourcing_rules: [
      "Prefer named operators with direct relevance to outage-sensitive workflows.",
      "Prefer telecom, insurance, logistics, and property/facilities for faster traction.",
      "Treat utility and municipal accounts as medium unless a specific owner and workflow are identified.",
      "Do not source account-only rows without a credible path to named contact enrichment."
    ],
    scoring_rules: [
      "Reward sequence-ready named contacts.",
      "Reward short-cycle notification/API wedges.",
      "Penalize generic procurement routes.",
      "Penalize missing owner, missing workflow, or unsupported official-partnership assumptions."
    ],
    seller_commission_plan: {
      internal_use_only: true,
      what_to_optimize_for: ["fast first contracts", "clear owner reachability", "repeatable notification/API wedges"],
      what_not_to_say_to_prospects: ["commission", "quota", "cash-flow needs", "revenue floor", "seller target"]
    },
    open_questions: ["Which guessed emails verify cleanly?", "Which segments reply fastest after the first 20 sends?"],
    source_notes: ["Generated from current OHUB CRM buckets, sequence-ready contacts, and existing OutageHub positioning artifacts."]
  };
}

function buildAccountScoring(leads) {
  const groups = groupByCompany(leads.filter((lead) => lead.source_agent === "outagehub-contact-discovery"));
  const ranked = groups.map(({ company, people }, index) => {
    const priority = companyPriority(people);
    const segment = people[0]?.segment || "";
    const ctx = segmentContext(segment);
    const score = priority === "short_term" ? 88 : 76;
    return {
      rank: index + 1,
      account_name: company,
      website: companyWebsite(people[0]),
      score,
      fit_tier: priority === "short_term" ? "strong" : "medium",
      contract_value_fit: priority === "short_term" ? "strong" : "medium",
      "why_1k/5k/10k+_floor_is_plausible": ctx.pain,
      deal_tier: priority === "short_term" ? "small_fast_cycle" : "medium_expansion",
      expected_monthly_value_range_usd: priority === "short_term" ? [1000, 10000] : [5000, 25000],
      cash_flow_priority: priority === "short_term" ? "near_term" : "medium_term",
      seller_commission_estimate: "Internal only; do not mention in outreach.",
      sales_cycle_hypothesis: priority === "short_term" ? "1-4 weeks if email verifies and owner responds." : "1-3 months with routing and qualification.",
      procurement_risk: /Utilities|Municipal/i.test(segment) ? "high" : "medium",
      portfolio_role: priority === "short_term" ? "near_term_send_list" : "medium_expansion_pipeline",
      why_not_too_small_or_large: "The first step is scoped to one outage-sensitive workflow.",
      reachable_path_score: people.some((lead) => lead.email_best) ? 4 : 2,
      path_to_buyer: people.map((lead) => `${lead.name}, ${lead.title}`).slice(0, 3).join("; "),
      email_viability: people.some((lead) => lead.email_best) ? "medium" : "weak",
      matched_fit_signals: [segment, "named contacts", "sequence-ready outreach"],
      matched_disqualifiers: [],
      reason: ctx.outcome,
      recommended_offer_angle: ctx.firstSlice,
      recommended_contacts: people.map((lead) => lead.title).slice(0, 5),
      next_action: "Verify guessed email and send the first-touch sequence."
    };
  });

  ranked.sort((a, b) => b.score - a.score || a.account_name.localeCompare(b.account_name));
  ranked.forEach((account, index) => {
    account.rank = index + 1;
  });
  return {
    scoring_summary: `Scored ${ranked.length} OHUB named-contact accounts from the current traction pipeline.`,
    input_status: {
      status: "ready",
      accounts_received: ranked.length,
      accounts_scored: ranked.length,
      top_n: Math.min(10, ranked.length),
      notes: ["Backfilled from current OHUB CRM and sequence-ready contacts."]
    },
    scorecard: [
      { criterion: "workflow_fit", weight: 35, how_to_score: "Outage-sensitive recurring Canadian workflow." },
      { criterion: "buyer_reachability", weight: 35, how_to_score: "Named buyer/operator and usable email/routing path." },
      { criterion: "traction_speed", weight: 30, how_to_score: "Short API/notification wedge before larger integration." }
    ],
    ranked_accounts: ranked,
    top_accounts: ranked.slice(0, 10).map((account) => account.account_name),
    not_recommended: [],
    open_questions: ["Verify guessed emails before send.", "Use reply data to tune short/medium buckets."],
    source_notes: ["Generated from data/leads-outagehub.jsonl after traction rebucketing."]
  };
}

function buildClientDossier(leads) {
  const groups = groupByCompany(leads.filter((lead) => lead.source_agent === "outagehub-contact-discovery"));
  const companyDossiers = groups.map(({ company, people }) => {
    const first = people[0] || {};
    const ctx = segmentContext(first.segment);
    const priority = companyPriority(people);
    return {
      company,
      website: companyWebsite(first),
      account_context: {
        known_trigger: first.trigger_event || `${company} fits ${first.segment || "OutageHub ICP"}.`,
        fit_reason: ctx.pain,
        "why_1k/5k/10k+_month_is_plausible": ctx.outcome,
        deal_tier: priority === "short_term" ? "small_fast_cycle" : "medium_expansion",
        expected_monthly_value_range_usd: priority === "short_term" ? [1000, 10000] : [5000, 25000],
        sales_cycle_hypothesis: priority === "short_term" ? "Short if email verifies and owner engages." : "Medium with routing and qualification.",
        procurement_risk: /Utilities|Municipal/i.test(first.segment) ? "high" : "medium",
        portfolio_role: priority === "short_term" ? "near_term_send_list" : "medium_expansion_pipeline",
        best_first_contract_slice: ctx.firstSlice,
        confidence: "medium"
      },
      people: people.map((lead) => ({
        name: lead.name,
        current_title: lead.title,
        role_category: roleCategory(lead.title),
        why_this_person: `${lead.title} is a plausible route to ${ctx.budgetOwner}.`,
        contact_info: {
          profile_url: lead.source_url || "",
          linkedin_url: lead.linkedin_or_source || "",
          official_public_email: lead.email_status === "found" ? lead.email_best : "",
          company_contact_route: companyWebsite(lead),
          routing_notes: lead.email_best ? `${lead.email_best} is ${lead.email_status || "unknown"}; verify before sending.` : "Use company route.",
          contact_info_confidence: lead.email_best ? "medium" : "low"
        },
        reachout_context: lead.outreach_angle || ctx.outcome,
        best_email_angle: ctx.firstSlice,
        first_conversation_to_test: `Whether ${ctx.firstSlice} is owned, useful, and easy to pilot.`,
        claims_to_avoid: ["official utility partnership", "complete national coverage", "guaranteed accuracy", "internal pain claims"],
        source_urls: [lead.source_url, lead.linkedin_or_source].filter(Boolean)
      })),
      coverage_gaps: people.some((lead) => lead.email_status === "guessed") ? ["Email candidates are guessed and need verification."] : []
    };
  });

  const dossiers = companyDossiers.flatMap((company) =>
    company.people.map((person) => {
      const ctx = company.account_context;
      return {
        company: company.company,
        website: company.website,
        account_context: {
          known_trigger: ctx.known_trigger,
          fit_reason: ctx.fit_reason,
          relevant_segment: company.company,
          confidence: ctx.confidence
        },
        contact: {
          name: person.name,
          current_title: person.current_title,
          role_category: person.role_category,
          why_this_person: person.why_this_person,
          source_urls: person.source_urls
        },
        offer_alignment: {
          matched_offer_segment: ctx.portfolio_role,
          likely_current_pain: ctx.fit_reason,
          desired_outcome: ctx["why_1k/5k/10k+_month_is_plausible"],
          why_now: ctx.known_trigger,
          first_offer: ctx.best_first_contract_slice,
          commercial_case: {
            "why_1k/5k/10k+_month_is_plausible": ctx["why_1k/5k/10k+_month_is_plausible"],
            contract_sized_work: ctx.best_first_contract_slice,
            likely_budget_owner: person.role_category
          },
          proof_needed: ["email verification", "first workflow owner confirmation", "pilot acceptance criteria"]
        },
        path_to_conversation: {
          best_route: person.contact_info.official_public_email || person.contact_info.routing_notes,
          contact_info: person.contact_info,
          email_viability: person.contact_info.contact_info_confidence,
          routing_notes: person.contact_info.routing_notes
        },
        detailed_notes: [person.reachout_context],
        conversation_hypotheses: [`${ctx.best_first_contract_slice} may be a practical first test.`],
        discovery_questions: [
          "Where is outage status checked today?",
          "Who owns that workflow?",
          "What would make an outage alert/API response useful enough to pilot?"
        ],
        outreach_angle: person.best_email_angle,
        claims_to_avoid: person.claims_to_avoid,
        evidence_gaps: company.coverage_gaps,
        source_urls: person.source_urls
      };
    })
  );

  return {
    dossier_summary: `Built sales dossiers for ${companyDossiers.length} OHUB companies and ${dossiers.length} named people.`,
    company_contact_dossiers: companyDossiers,
    dossiers,
    contact_offer_alignment: dossiers.map((dossier) => ({
      company: dossier.company,
      person_name: dossier.contact.name,
      offer: dossier.offer_alignment.first_offer,
      role_category: dossier.contact.role_category
    })),
    outreach_notes: ["Use short-term bucket first.", "Verify guessed emails before sending.", "Route CEOs carefully to the actual workflow owner."],
    evidence_gaps: ["Most emails are guessed candidates, not publicly verified personal emails."],
    open_questions: ["Which segment replies fastest?", "Which guessed domains verify cleanly?"],
    source_notes: ["Generated from OHUB contact-discovery leads and reviewed sequence artifact."]
  };
}

function buildOutreachAngle(dossier) {
  const companyMaps = dossier.company_contact_dossiers.map((company) => ({
    company: company.company,
    website: company.website,
    account_priority: company.account_context.portfolio_role,
    account_trigger: {
      summary: company.account_context.known_trigger,
      date: "2026-07-08",
      source_url: company.website
    },
    "why_1k/5k/10k+_month_is_plausible": company.account_context["why_1k/5k/10k+_month_is_plausible"],
    deal_tier: company.account_context.deal_tier,
    portfolio_role: company.account_context.portfolio_role,
    best_first_contract_slice: company.account_context.best_first_contract_slice,
    people: company.people.map((person) => ({
      person_name: person.name,
      title: person.current_title,
      role_category: person.role_category,
      contact_info: person.contact_info,
      why_this_person: person.why_this_person,
      reachout_context: person.reachout_context,
      specific_opener: `I came across ${company.company} while mapping Canadian teams where outage visibility can affect ${company.account_context.best_first_contract_slice}.`,
      follow_on_bridge: "The useful first conversation is whether outage data should live in an API, notification rule, or existing operational workflow.",
      contract_ask: `Test ${company.account_context.best_first_contract_slice}.`,
      reply_path: person.contact_info.routing_notes,
      email_prep_notes: [person.best_email_angle, person.why_this_person],
      claims_to_avoid: person.claims_to_avoid,
      confidence: person.contact_info.contact_info_confidence,
      source_urls: person.source_urls
    })),
    coverage_gaps: company.coverage_gaps
  }));

  return {
    angle_summary: `Built person-level OHUB outreach angles for ${companyMaps.reduce((sum, map) => sum + map.people.length, 0)} named people.`,
    input_status: {
      has_client_dossier: true,
      has_contact_discovery: true,
      has_account_scoring: true,
      notes: ["Backfilled after deterministic OHUB CRM and sequence generation."]
    },
    company_outreach_maps: companyMaps,
    person_dossiers: companyMaps.flatMap((map) =>
      map.people.map((person) => ({
        company: map.company,
        person_name: person.person_name,
        title: person.title,
        profile_url: person.contact_info.profile_url,
        priority: map.account_priority,
        account_trigger: map.account_trigger,
        person_relevance: person.why_this_person,
        outagehub_relevant_pain: person.reachout_context,
        specific_opener: person.specific_opener,
        follow_on_bridge: person.follow_on_bridge,
        contract_ask: person.contract_ask,
        reply_path: person.reply_path,
        get_through_reasoning: person.why_this_person,
        why_this_angle: "Connects company segment, person role, and one bounded outage-data workflow.",
        confidence: person.confidence,
        source_urls: person.source_urls
      }))
    ),
    angle_patterns: [
      "Role + outage-sensitive workflow",
      "Router ask for exact workflow owner",
      "API/notification first test before integration"
    ],
    claims_to_avoid: ["official utility partnership", "complete national coverage", "guaranteed accuracy", "internal pain claims"],
    open_questions: ["Which openers earn replies by segment?"],
    source_notes: ["Generated from OHUB client dossier and current sequence-ready CRM."]
  };
}

function buildSequenceStrategy() {
  return {
    sequence_summary:
      "Use a seven-touch founder-led OHUB sequence: contextual opener, workflow pressure, focused first test, handoff/process, routing, useful diagnostic, and clean close.",
    strategic_point_of_view: {
      core_thesis: "OHUB sells fastest when outage data is tied to one operational decision path, not presented as a generic data feed.",
      why_5_to_7_touches: "Different buyers need different proof: relevance, workflow framing, scope, risk control, routing, and diagnostic value.",
      how_to_avoid_spam: "Each touch must add a new reason to reply and stop immediately on no, route, or meeting request.",
      outagehub_positioning: "Canadian outage intelligence for API access, notifications, and focused integrations into operational systems.",
      sales_influences: ["specific diagnosis", "bounded wedge", "useful follow-up", "founder-written restraint"]
    },
    sequence_architecture: {
      default_touch_count: 7,
      acceptable_range: "5-7",
      primary_conversion_goal: "Start a conversation about one outage-data workflow.",
      secondary_conversion_goals: ["get routed to exact owner", "earn permission to send a checklist", "validate segment pain"],
      message_arc: ["why this company", "why this workflow", "small first test", "risk-control process", "route", "diagnostic", "clean close"],
      when_to_stop_early: ["clear no", "referral", "meeting request", "pause request", "new owner identified"]
    },
    touch_plan: [
      {
        touch_number: 1,
        working_name: "trigger_opener",
        objective: "Introduce OHUB through company workflow fit.",
        buyer_question_it_answers: "Why are you reaching out to me?",
        angle: "Company/person-specific outage-sensitive workflow.",
        evidence_to_use: ["segment", "role", "source URL"],
        offer_or_cta: "Open to a conversation over the next couple of weeks?",
        what_changes_from_previous_touch: "First contact.",
        sample_subject_patterns: ["Outage visibility for [Company]", "Outage data for [workflow]"],
        avoid: ["claiming internal pain", "claiming partnership"]
      },
      {
        touch_number: 2,
        working_name: "pressure_frame",
        objective: "Frame where outage data usually gets messy.",
        buyer_question_it_answers: "Why would this matter operationally?",
        angle: "Data has to reach the decision point, not just exist.",
        evidence_to_use: ["workflow", "role"],
        offer_or_cta: "Compare notes on where the workflow lives today.",
        what_changes_from_previous_touch: "Adds operational framing.",
        sample_subject_patterns: ["Where outage data usually gets messy"],
        avoid: ["saying they are struggling"]
      },
      {
        touch_number: 3,
        working_name: "focused_first_pass",
        objective: "Name the smallest useful pilot.",
        buyer_question_it_answers: "What exactly would we test?",
        angle: "One workflow, geography, provider set, and success criteria.",
        evidence_to_use: ["first_contract_slice"],
        offer_or_cta: "Send a short first-pass outline.",
        what_changes_from_previous_touch: "Moves from why to scope.",
        sample_subject_patterns: ["A focused first pass"],
        avoid: ["big transformation framing"]
      },
      {
        touch_number: 4,
        working_name: "process_proof",
        objective: "Reduce buyer risk without invented case studies.",
        buyer_question_it_answers: "How would this avoid becoming vendor work?",
        angle: "Discovery, small data flow, test, notes, handoff.",
        evidence_to_use: ["system owner", "workflow"],
        offer_or_cta: "Send scope-and-handoff outline.",
        what_changes_from_previous_touch: "Explains delivery shape.",
        sample_subject_patterns: ["How we would keep it low-risk"],
        avoid: ["invented proof"]
      },
      {
        touch_number: 5,
        working_name: "router_angle",
        objective: "Make routing easy.",
        buyer_question_it_answers: "What if I am not the owner?",
        angle: "Ask for exact owner of the outage-data workflow.",
        evidence_to_use: ["recipient role"],
        offer_or_cta: "Who owns this internally?",
        what_changes_from_previous_touch: "Switches from meeting ask to routing ask.",
        sample_subject_patterns: ["Right person for this?"],
        avoid: ["pressuring the wrong recipient"]
      },
      {
        touch_number: 6,
        working_name: "useful_diagnostic",
        objective: "Offer a forwardable checklist.",
        buyer_question_it_answers: "Can I get value without a meeting?",
        angle: "Provider/geography/field/trigger checklist.",
        evidence_to_use: ["segment", "workflow"],
        offer_or_cta: "Send checklist.",
        what_changes_from_previous_touch: "Offers artifact instead of conversation.",
        sample_subject_patterns: ["Checklist idea"],
        avoid: ["attachment bait", "generic checklist"]
      },
      {
        touch_number: 7,
        working_name: "clean_close",
        objective: "Close gracefully.",
        buyer_question_it_answers: "Will you keep chasing me?",
        angle: "Park the thread unless relevant later.",
        evidence_to_use: ["segment", "workflow"],
        offer_or_cta: "Should I leave this here?",
        what_changes_from_previous_touch: "Permission-based exit.",
        sample_subject_patterns: ["Happy to park this"],
        avoid: ["breakup theatrics", "guilt"]
      }
    ],
    persona_variants: [
      {
        persona: "economic_buyer",
        sequence_emphasis: "Business risk, fast pilot, routing to owner.",
        strongest_touches: [1, 3, 5],
        language_to_use: ["one workflow", "customer or operational decision", "right owner"],
        language_to_avoid: ["deep technical implementation", "price-first copy"]
      },
      {
        persona: "technical_buyer",
        sequence_emphasis: "API, fields, handoff, integration boundary.",
        strongest_touches: [2, 3, 4, 6],
        language_to_use: ["API response", "data flow", "test cases", "handoff"],
        language_to_avoid: ["magic accuracy", "black-box claims"]
      },
      {
        persona: "product_or_operations_owner",
        sequence_emphasis: "Workflow, notification trigger, operational decision.",
        strongest_touches: [1, 2, 3, 6],
        language_to_use: ["alerts", "routing", "field decisions", "customer status"],
        language_to_avoid: ["generic data feed"]
      }
    ],
    timing_and_exit_rules: {
      recommended_spacing: ["Day 1", "Day 3", "Day 7", "Day 11", "Day 16", "Day 22", "Day 30"],
      channel_notes: ["Use email first; use LinkedIn only for routing or light follow-up."],
      stop_conditions: ["no", "unsubscribe", "referral", "meeting", "pause"],
      recycle_conditions: ["new outage event", "new role", "new facility/region expansion", "new public workflow signal"]
    },
    anti_spam_rules: ["No fake urgency.", "No just-bumping.", "No invented proof.", "No repeated CTA without new context."],
    handoff_to_drafter: {
      default_sequence_length: 7,
      drafting_priorities: ["role relevance", "workflow specificity", "claim restraint", "email verification warning"],
      required_fields_per_email: ["subject", "body", "touch_key", "objective", "assumptions_avoided"],
      follow_up_state_machine: ["context", "pressure", "scope", "process", "route", "diagnostic", "close"],
      quality_bar: ["specific enough to forward", "low pressure", "no unsupported claims"]
    },
    claims_to_avoid: ["official utility partnership", "complete national coverage", "guaranteed accuracy", "internal pain claims"],
    open_questions: ["Which segment should receive the first 20 sends?"],
    source_notes: ["Backfilled from current OHUB sequence and CRM operating model."]
  };
}

function buildEmailFinder(leads) {
  const named = leads.filter((lead) => lead.source_agent === "outagehub-contact-discovery");
  const groups = groupByCompany(named);
  const maps = groups.map(({ company, people }) => {
    const domain = people.find((lead) => lead.company_domain)?.company_domain || "";
    return {
      company,
      company_domain: domain,
      pattern_decision: {
        pattern: "{first}.{last}@domain",
        decision_type: "probable_pattern",
        confidence: "low",
        why_this_pattern: "Matches the generated OHUB CRM candidates; requires verification before sending.",
        alternatives_considered: ["{first}@domain", "{f}{last}@domain", "{first}{l}@domain"]
      },
      email_pattern_evidence: "Generated candidate pattern from current CRM; not public verification.",
      public_route: companyWebsite(people[0]),
      people: people.map((lead) => ({
        name: lead.name,
        title: lead.title,
        email_best: lead.email_best || "",
        email_candidates: lead.email_candidates || [],
        email_status: lead.email_status || "unknown",
        confidence: lead.confidence || "medium",
        evidence: "CRM-generated email candidate; verify before send.",
        source_urls: [lead.source_url, lead.linkedin_or_source].filter(Boolean)
      })),
      coverage_gaps: ["No deliverability verification performed."]
    };
  });
  return {
    email_summary: `Mapped email candidates for ${named.length} OHUB named contacts across ${groups.length} companies.`,
    company_email_maps: maps,
    results: maps.flatMap((map) =>
      map.people.map((person) => ({
        name: person.name,
        company: map.company,
        company_domain: map.company_domain,
        email_pattern: "{first}.{last}@domain",
        email_best: person.email_best,
        email_candidates: person.email_candidates,
        email_status: person.email_status,
        confidence: person.confidence,
        evidence: person.evidence,
        source_urls: person.source_urls
      }))
    ),
    source_notes: ["Backfilled from OHUB CRM email candidates; guessed addresses must be verified before sending."]
  };
}

async function publish(slug, artifact) {
  const { agent } = await findAgent(slug);
  const published = await publishArtifact(agent, artifact);
  return { slug, artifactPath: published.artifactPath };
}

const leads = await readLeads("outagehub");
const stateModule = await import("../src/bus.js");
const currentState = await stateModule.readState();
const sequences = currentState.artifacts?.["outagehub-email-sequence-reviewer"]?.improved_person_email_sequences || [];

const revenue = buildRevenueStrategy(leads);
const scoring = buildAccountScoring(leads);
const dossier = buildClientDossier(leads);
const outreach = buildOutreachAngle(dossier);
const strategy = buildSequenceStrategy();
const emailFinder = buildEmailFinder(leads);

const published = [];
published.push(await publish("outagehub-revenue-strategy", revenue));
published.push(await publish("outagehub-account-scoring", scoring));
published.push(await publish("outagehub-client-dossier", dossier));
published.push(await publish("outagehub-outreach-angle", outreach));
published.push(await publish("outagehub-sequence-strategy", strategy));
published.push(await publish("outagehub-email-finder", emailFinder));

console.log(
  JSON.stringify(
    {
      ok: true,
      published,
      leads: leads.length,
      sequencePeople: sequences.length,
      skipped: ["outagehub-email-drafter: GPT/OpenClaw must write outreach emails; deterministic backfill is disabled."]
    },
    null,
    2
  )
);
