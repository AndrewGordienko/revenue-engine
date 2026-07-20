import { db } from "./db.js";

const STAGE_RANK = { discovery: 0, qualified: 1, solution_defined: 2, proposal: 3, contracting: 4, won: 5, lost: -1 };
const PROSPECT_RESEARCHED = new Set(["researched", "route_ready", "enrolled", "engaged", "disqualified"]);

function parse(value) { try { return value ? JSON.parse(value) : {}; } catch { return {}; } }
const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = (value, places = 2) => value == null ? null : Number(value.toFixed(places));

export function buildPipelineReport(database = db(), registry = null) {
  const leads = database.prepare("SELECT * FROM leads").all();
  const events = database.prepare("SELECT * FROM activity_events").all();
  const opportunities = database.prepare("SELECT * FROM opportunities").all();
  const contracts = database.prepare("SELECT * FROM contracts").all();
  const meetings = database.prepare("SELECT * FROM meetings").all();
  const opportunityById = new Map(opportunities.map((opp) => [opp.id, opp]));
  const keys = [...new Set(leads.map((lead) => `${lead.product}|${lead.cohort_id}|${lead.play_id || "unassigned"}`))];

  const cohorts = keys.map((key) => {
    const [product, cohort_id, play_id] = key.split("|");
    const cohortLeads = leads.filter((lead) => lead.product === product && lead.cohort_id === cohort_id && (lead.play_id || "unassigned") === play_id);
    const leadIds = new Set(cohortLeads.map((lead) => lead.id));
    const cohortEvents = events.filter((event) => leadIds.has(event.lead_id));
    const cohortOpps = opportunities.filter((opp) => leadIds.has(opp.lead_id) && (opp.play_id || "unassigned") === play_id);
    const oppIds = new Set(cohortOpps.map((opp) => opp.id));
    const cohortContracts = contracts.filter((contract) => oppIds.has(contract.opportunity_id));
    const positiveReplies = cohortEvents.filter((event) => event.type === "reply" && parse(event.payload).classification?.is_positive).length;
    const contractValues = cohortContracts.map((contract) => (Number(contract.one_time) || 0) + (Number(contract.mrr) || 0) * 12);
    const daysToClose = cohortContracts.map((contract) => {
      const opp = opportunityById.get(contract.opportunity_id);
      return opp ? (new Date(contract.created_at) - new Date(opp.created_at)) / 86400000 : null;
    }).filter((value) => Number.isFinite(value) && value >= 0);
    const marginContracts = cohortContracts.filter((contract) => contract.one_time != null && contract.implementation_cost != null && Number(contract.one_time) > 0);
    const implementationMargin = marginContracts.reduce((sum, contract) => sum + Number(contract.one_time) - Number(contract.implementation_cost), 0);
    const implementationRevenue = marginContracts.reduce((sum, contract) => sum + Number(contract.one_time), 0);
    const recurring = cohortContracts.filter((contract) => Number(contract.mrr) > 0);

    return {
      product,
      cohort_id,
      play_id,
      researched_accounts: new Set(cohortLeads.filter((lead) => PROSPECT_RESEARCHED.has(lead.stage)).map((lead) => lead.company_domain || lead.company)).size,
      verified_contacts: cohortLeads.filter((lead) => lead.deliverability_status === "deliverable" && lead.address_found_or_guessed !== "guessed" && lead.deliverability_checked_at && Date.now() - new Date(lead.deliverability_checked_at).getTime() <= 90 * 86400000).length,
      messages_sent: cohortEvents.filter((event) => event.type === "sent").length,
      positive_replies: positiveReplies,
      meetings_booked: meetings.filter((meeting) => leadIds.has(meeting.lead_id) && meeting.status === "booked"
        && ["human_confirmed", "calendar_confirmed"].includes(meeting.confirmation_status)).length,
      meetings_held: meetings.filter((meeting) => leadIds.has(meeting.lead_id) && meeting.status === "held").length,
      qualified_opportunities: cohortOpps.filter((opp) => opp.qualification || STAGE_RANK[opp.stage] >= STAGE_RANK.qualified).length,
      proposals: cohortOpps.filter((opp) => STAGE_RANK[opp.stage] >= STAGE_RANK.proposal || (opp.stage === "lost" && opp.solution && opp.next_step_at)).length,
      wins: cohortOpps.filter((opp) => opp.stage === "won").length,
      average_contract_value_usd: round(avg(contractValues), 0),
      average_days_to_close: round(avg(daysToClose), 1),
      implementation_gross_margin: implementationRevenue ? round(implementationMargin / implementationRevenue, 3) : null,
      expansion_mrr_usd: cohortContracts.filter((contract) => contract.parent_contract_id != null).reduce((sum, contract) => sum + (Number(contract.mrr) || 0), 0),
      recurring_contract_retention: recurring.length ? round(recurring.filter((contract) => contract.status === "active").length / recurring.length, 3) : null,
      booked_one_time_usd: cohortContracts.reduce((sum, contract) => sum + (Number(contract.one_time) || 0), 0),
      booked_mrr_usd: cohortContracts.reduce((sum, contract) => sum + (Number(contract.mrr) || 0), 0),
    };
  });

  const products = ["gnk", "outagehub", "morrow"].map((product) => {
    const rows = cohorts.filter((row) => row.product === product);
    const sum = (field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
    const actual = {
      researched_accounts: sum("researched_accounts"), verified_contacts: sum("verified_contacts"), messages_sent: sum("messages_sent"),
      positive_replies: sum("positive_replies"), meetings_booked: sum("meetings_booked"), meetings_held: sum("meetings_held"), qualified_opportunities: sum("qualified_opportunities"),
      proposals: sum("proposals"), wins: sum("wins"), booked_one_time_usd: sum("booked_one_time_usd"), booked_mrr_usd: sum("booked_mrr_usd"),
      expansion_mrr_usd: sum("expansion_mrr_usd"),
    };
    const marginRows = rows.filter((row) => row.implementation_gross_margin != null && row.booked_one_time_usd > 0);
    actual.implementation_gross_margin = marginRows.length
      ? round(marginRows.reduce((total, row) => total + row.implementation_gross_margin * row.booked_one_time_usd, 0) / marginRows.reduce((total, row) => total + row.booked_one_time_usd, 0), 3)
      : null;
    const ratio = (a, b) => b ? round(a / b, 3) : null;
    const target = product === "gnk"
      ? registry?.commercialTarget?.campaignTargets
      : registry?.commercialTargets?.[product]?.campaignTargets;
    return {
      product,
      target: target || null,
      actual,
      conversion: {
        positive_reply_rate: ratio(actual.positive_replies, actual.messages_sent),
        reply_to_meeting_rate: ratio(actual.meetings_booked, actual.positive_replies),
        meeting_to_qualified_rate: ratio(actual.qualified_opportunities, actual.meetings_held),
        qualified_to_proposal_rate: ratio(actual.proposals, actual.qualified_opportunities),
        proposal_to_win_rate: ratio(actual.wins, actual.proposals),
      },
    };
  });
  return { generated_at: new Date().toISOString(), dimensions: ["product", "cohort_id", "play_id"], products, cohorts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(buildPipelineReport(), null, 2));
}
