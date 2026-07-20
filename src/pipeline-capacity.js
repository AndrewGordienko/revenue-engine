import { findAgent, publishArtifact, readRegistry, readState } from "./bus.js";
import { readLeads } from "./leads-store.js";
import { STRATEGY_VERSION } from "./sales-plays.js";

const DEFAULT_ASSUMPTIONS = {
  workingDaysPerMonth: 22,
  sequenceTouchesPerLead: 7,
  positiveReplyRate: 0.025,
  positiveReplyToQualifiedConversationRate: 0.5,
  qualifiedConversationToClosedDealRate: 0.25,
  pipelineInventoryBufferRate: 0.25,
  sendReadyBufferRate: 0.15,
  expectedNewLeadsPerProspectingRound: 40,
  maxRecommendedProspectingRounds: 40,
  contractBucketSplit: {
    short_term: 0.6,
    medium_term: 0.3,
    long_term: 0.1
  }
};

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function ceil(value) {
  return Math.ceil(Number(value) || 0);
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function commercialValue(commercialTarget, camelKey, snakeKey, fallback) {
  return num(commercialTarget?.[camelKey], num(commercialTarget?.[snakeKey], fallback));
}

function commercialTargetFor(registry, agent) {
  return (
    agent?.commercialTarget ||
    (agent?.commercialTargetKey ? registry.commercialTargets?.[agent.commercialTargetKey] : null) ||
    registry.commercialTarget ||
    {}
  );
}

function productForAgent(agent) {
  if (agent?.slug?.startsWith("outagehub-")) return "outagehub";
  if (agent?.slug?.startsWith("morrow-")) return "morrow";
  return "gnk";
}

function bucketCounts(leads) {
  const counts = { short_term: 0, medium_term: 0, long_term: 0 };
  for (const lead of leads) {
    if (lead.contract_bucket in counts) counts[lead.contract_bucket] += 1;
  }
  return counts;
}

function bucketTarget(total, split, bucket) {
  return ceil(total * num(split[bucket], DEFAULT_ASSUMPTIONS.contractBucketSplit[bucket]));
}

export function calculatePipelineCapacity({ registry, state, leads, agent = null }) {
  const commercialTarget = commercialTargetFor(registry, agent);
  const campaign = commercialTarget.campaignTargets || null;
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    ...(commercialTarget.outboundCapacityAssumptions || {}),
    contractBucketSplit: {
      ...DEFAULT_ASSUMPTIONS.contractBucketSplit,
      ...(commercialTarget.outboundCapacityAssumptions?.contractBucketSplit || {})
    }
  };

  const minimumContractValueUsd = commercialValue(
    commercialTarget,
    "minimumMonthlyContractValueUsd",
    "minimum_monthly_contract_value_usd",
    40000
  );
  const planningContractValueUsd = commercialValue(
    commercialTarget,
    "capacityPlanningMonthlyContractValueUsd",
    "capacity_planning_monthly_contract_value_usd",
    minimumContractValueUsd
  );
  const companyRevenueFloorUsd = commercialValue(
    commercialTarget,
    "monthlyRevenueFloorUsd",
    "company_monthly_revenue_floor_usd",
    40000
  );
  const sellerRequiredClosedRevenueUsd = commercialValue(
    commercialTarget,
    "sellerRequiredClosedRevenueForTargetUsd",
    "seller_required_closed_revenue_usd",
    40000
  );
  const targetClosedRevenueUsd = campaign?.bookedRevenueUsd || Math.max(companyRevenueFloorUsd, sellerRequiredClosedRevenueUsd);
  const requiredClosedDeals = campaign?.paidWins || ceil(targetClosedRevenueUsd / planningContractValueUsd);
  const emailToClosedDealRate =
    num(assumptions.positiveReplyRate, DEFAULT_ASSUMPTIONS.positiveReplyRate) *
    num(
      assumptions.positiveReplyToQualifiedConversationRate,
      DEFAULT_ASSUMPTIONS.positiveReplyToQualifiedConversationRate
    ) *
    num(
      assumptions.qualifiedConversationToClosedDealRate,
      DEFAULT_ASSUMPTIONS.qualifiedConversationToClosedDealRate
    );

  // Campaign targets take precedence over reverse-engineering a pure cold-email
  // funnel. GNK combines warm, triggered, and partner routes; OutageHub works a
  // finite design-partner account list. A "first touch" is one named contact.
  const researchedAccountsRequired = campaign?.researchedAccounts || null;
  const contactsPerAccount = campaign?.contactsPerAccount || 1;
  const monthlyFirstTouchesRequired = researchedAccountsRequired
    ? ceil(researchedAccountsRequired * contactsPerAccount)
    : ceil(requiredClosedDeals / emailToClosedDealRate);
  const dailyFirstTouchesRequired = ceil(monthlyFirstTouchesRequired / assumptions.workingDaysPerMonth);
  const monthlySequenceEmailsRequired = monthlyFirstTouchesRequired * assumptions.sequenceTouchesPerLead;
  const dailyTotalEmailsRequired = ceil(monthlySequenceEmailsRequired / assumptions.workingDaysPerMonth);
  const sendReadyLeadsRequired = campaign ? monthlyFirstTouchesRequired : ceil(monthlyFirstTouchesRequired * (1 + assumptions.sendReadyBufferRate));
  const totalLeadsRequired = campaign ? monthlyFirstTouchesRequired : ceil(monthlyFirstTouchesRequired * (1 + assumptions.pipelineInventoryBufferRate));

  const currentTotal = leads.length;
  const currentWithEmail = leads.filter((lead) => lead.email_best && lead.deliverability_status === "deliverable" && lead.address_found_or_guessed !== "guessed").length;
  const currentSequenceReady = leads.filter((lead) => {
    return lead.email_best && (lead.email_subject || lead.email_body || lead.stage === "to_contact");
  }).length;
  const currentBuckets = bucketCounts(leads);

  const buckets = Object.keys(DEFAULT_ASSUMPTIONS.contractBucketSplit).map((bucket) => {
    const target = bucketTarget(totalLeadsRequired, assumptions.contractBucketSplit, bucket);
    return {
      bucket,
      target,
      current: currentBuckets[bucket] || 0,
      gap: Math.max(0, target - (currentBuckets[bucket] || 0)),
      split: assumptions.contractBucketSplit[bucket]
    };
  });

  const leadGap = Math.max(0, totalLeadsRequired - currentTotal);
  const recommendedRounds = Math.min(
    assumptions.maxRecommendedProspectingRounds,
    Math.max(1, ceil(leadGap / assumptions.expectedNewLeadsPerProspectingRound))
  );

  return {
    strategy_version: STRATEGY_VERSION,
    capacity_summary: campaign
      ? `${productForAgent(agent) === "gnk" ? "One-deal" : "Paid-pilot"} campaign: research ${researchedAccountsRequired} accounts, map ${monthlyFirstTouchesRequired} named contacts, create ${campaign.bookedMeetings} meetings, ${campaign.qualifiedConversations} qualified conversations, ${campaign.proposals} proposals, and ${requiredClosedDeals} paid win${requiredClosedDeals === 1 ? "" : "s"} worth ${targetClosedRevenueUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`
      : `Maintain about ${totalLeadsRequired} total leads, ${sendReadyLeadsRequired} send-ready leads, ${dailyFirstTouchesRequired} new first-touch emails per working day, and about ${dailyTotalEmailsRequired} total sequence emails per working day.`,
    revenue_goal: {
      minimum_contract_value_usd: minimumContractValueUsd,
      capacity_planning_monthly_contract_value_usd: planningContractValueUsd,
      company_revenue_floor_usd: companyRevenueFloorUsd,
      seller_required_closed_revenue_usd: sellerRequiredClosedRevenueUsd,
      target_closed_revenue_usd: targetClosedRevenueUsd,
      required_closed_deals: requiredClosedDeals
    },
    campaign_targets: campaign ? {
      ...campaign,
      named_contacts: monthlyFirstTouchesRequired,
      meetings_to_proposal_rate: campaign.proposals / campaign.bookedMeetings,
      qualified_to_proposal_rate: campaign.proposals / campaign.qualifiedConversations,
      proposal_to_win_rate: campaign.paidWins / campaign.proposals,
    } : null,
    conversion_assumptions: {
      working_days_per_month: assumptions.workingDaysPerMonth,
      sequence_touches_per_lead: assumptions.sequenceTouchesPerLead,
      positive_reply_rate: assumptions.positiveReplyRate,
      positive_reply_to_qualified_conversation_rate: assumptions.positiveReplyToQualifiedConversationRate,
      qualified_conversation_to_closed_deal_rate: assumptions.qualifiedConversationToClosedDealRate,
      email_to_closed_deal_rate: emailToClosedDealRate,
      notes: [
        campaign
          ? "The active campaign uses explicit account, meeting, proposal, and win targets; email conversion is diagnostic, not the primary capacity driver."
          : `Email-to-close is modeled as ${pct(assumptions.positiveReplyRate)} positive replies x ${pct(assumptions.positiveReplyToQualifiedConversationRate)} qualified conversations x ${pct(assumptions.qualifiedConversationToClosedDealRate)} closes.`,
        "Tune these assumptions in agents/registry.json commercialTarget.outboundCapacityAssumptions when real reply and close data exists."
      ]
    },
    pipeline_targets: {
      monthly_first_touch_emails_required: monthlyFirstTouchesRequired,
      daily_first_touch_emails_required: dailyFirstTouchesRequired,
      monthly_sequence_emails_required: monthlySequenceEmailsRequired,
      daily_total_sequence_emails_required: dailyTotalEmailsRequired,
      send_ready_leads_required: sendReadyLeadsRequired,
      total_leads_required: totalLeadsRequired,
      current_total_leads: currentTotal,
      current_send_ready_leads: currentWithEmail,
      current_sequence_ready_leads: currentSequenceReady,
      total_lead_gap: leadGap,
      send_ready_gap: Math.max(0, sendReadyLeadsRequired - currentWithEmail)
    },
    bucket_targets: buckets,
    recommended_split: {
      contract_buckets: assumptions.contractBucketSplit,
      role_mix: {
        economic_buyer: 0.45,
        technical_buyer: 0.3,
        product_or_operations_owner: 0.15,
        evaluator_or_router: 0.1
      },
      deal_tiers: {
        small_fast_cycle: 0.75,
        medium_expansion: 0.2,
        large_nurture: 0.05
      }
    },
    recommended_prospecting: {
      motion: campaign ? (productForAgent(agent) === "gnk" ? "one-deal high-trust campaign" : "paid design-partner pilot campaign") : "outbound inventory",
      target_total_leads: totalLeadsRequired,
      target_send_ready_leads: sendReadyLeadsRequired,
      current_total_leads: currentTotal,
      lead_gap: leadGap,
      expected_new_leads_per_round: assumptions.expectedNewLeadsPerProspectingRound,
      rounds_to_run: recommendedRounds,
      instruction: campaign
        ? "Fill the finite named-account campaign, verify an owner and router, then move only evidence-backed accounts toward meetings and proposals."
        : "Prospecting should fill to target_total_leads, then email finding and sequence drafting should raise current_send_ready_leads to target_send_ready_leads."
    },
    operating_rules: [
      campaign
        ? "Do not inflate activity beyond the named-account campaign; improve trigger, buyer, proof, and proposal quality first."
        : "Use pipeline_targets.total_leads_required as the standing inventory target.",
      `Keep about ${pct(assumptions.contractBucketSplit.short_term)} of the working list in short_term contract-bucket leads until reply data says otherwise.`,
      "Treat daily_first_touch_emails_required as a pacing indicator across approved channels, not an email quota.",
      "Treat daily_total_sequence_emails_required as the total daily workload once follow-ups are running.",
      "If send_ready_gap is positive, prioritize email finding and sequence drafting before adding low-confidence long_term leads."
    ],
    source_notes: [
      `Calculated locally from agents/registry.json commercialTarget, current data/state.json, and data/leads-${productForAgent(agent)}.jsonl.`,
      state.updatedAt ? `Shared state updated at ${state.updatedAt}.` : "Shared state has no updatedAt timestamp."
    ]
  };
}

export async function buildPipelineCapacityArtifact(registry, agent = null) {
  const [state, leads] = await Promise.all([readState(), readLeads(productForAgent(agent))]);
  return calculatePipelineCapacity({ registry, state, leads, agent });
}

export async function recommendedProspectPlan(agentSlug = "gnk-pipeline-capacity") {
  const registry = await readRegistry();
  const agent = registry.agents.find((candidate) => candidate.slug === agentSlug || candidate.id === agentSlug);
  const artifact = await buildPipelineCapacityArtifact(registry, agent);
  return artifact.recommended_prospecting;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { registry, agent } = await findAgent(process.argv[2] || "gnk-pipeline-capacity");
  buildPipelineCapacityArtifact(registry, agent)
    .then((artifact) => publishArtifact(agent, artifact))
    .then((published) => {
      console.log(JSON.stringify(published, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}
