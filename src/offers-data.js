// offers-data.js — the standardized commercial offers, as pure data (no imports) so both
// db.js (seeding) and offers.js (helpers) can read it without an import cycle. Offers are
// SEPARATE from sales plays: a play is a buyer-problem hypothesis; an offer is the priced
// thing you sign. The commercial target is 2× GNK-POD-01 = $40k/mo booked run-rate.
export const COMMERCIAL_OFFERS = [
  { offer_id: "GNK-POD-01", offer_version: "v1", venture: "gnk", name: "Senior Delivery Pod", pricing_model: "recurring", amount_min: 20000, amount_max: 20000, term_months: 3, spec: { unit: "month", shape: "2 senior engineers + technical-lead oversight, 90-day minimum, billed in advance" } },
  { offer_id: "GNK-FULL-01", offer_version: "v1", venture: "gnk", name: "Full Strike Team", pricing_model: "recurring", amount_min: 35000, amount_max: 45000, term_months: 3, spec: { unit: "month", shape: "most/all of the four-person team, 90-day minimum" } },
  { offer_id: "GNK-SHAPE-01", offer_version: "v1", venture: "gnk", name: "Paid Shaping Week", pricing_model: "one_time", amount_min: 7500, amount_max: 7500, term_months: null, spec: { unit: "engagement", shape: "5-day technical read + bounded plan + acceptance criteria; creditable toward delivery within 14 days" } },
  { offer_id: "OHUB-EVAL-01", offer_version: "v1", venture: "outagehub", name: "Outage-Correlation Evaluation", pricing_model: "one_time", amount_min: 7500, amount_max: 15000, term_months: null, spec: { unit: "engagement", shape: "30-day paid evaluation: retrospective correlation + live matching + before/after report" } },
  { offer_id: "OHUB-FEED-01", offer_version: "v1", venture: "outagehub", name: "Operational Outage Feed", pricing_model: "recurring", amount_min: 2500, amount_max: 5000, term_months: null, spec: { unit: "month", shape: "recurring operational feed after a successful evaluation" } },
  { offer_id: "OHUB-EMBED-01", offer_version: "v1", venture: "outagehub", name: "Embedded Outage Intelligence", pricing_model: "recurring_plus_implementation", amount_min: 15000, amount_max: 30000, term_months: null, spec: { unit: "implementation", monthly_min: 7500, monthly_max: 15000 } },
  { offer_id: "MORROW-PILOT-01", offer_version: "v1", venture: "morrow", name: "High-Mix Packing Pilot", pricing_model: "pilot_then_recurring", amount_min: 15000, amount_max: 50000, term_months: null, spec: { unit: "pilot", monthly_min: 5000, monthly_max: 12000, monthly_unit: "month_per_cell" } },
];
