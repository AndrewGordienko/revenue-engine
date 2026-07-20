// pipeline-board.js — the venture kanban. GNK/OutageHub share a REVENUE funnel; Morrow has
// its own DESIGN-PARTNER funnel. The two are NEVER summed (separate boards, separate calls).
// Won/Partner is sourced only from a signed contract. Stage moves are GATED: the board can
// never silently advance a card — moving to a stage returns the micro-form that must be
// filled (which records the real evidence event).
import { db } from "./db.js";
import { normalizeVenture } from "./active-motions.js";

const DAY = 864e5;

export const REVENUE_COLUMNS = [
  { key: "contacted", label: "Contacted", statuses: ["contacted"] },
  { key: "replied", label: "Replied", statuses: ["replied"] },
  { key: "call", label: "Call", statuses: ["meeting_confirmed", "qualified"] },
  { key: "proposal", label: "Proposal", statuses: ["proposal_review"] },
  { key: "won", label: "Won", statuses: ["signed", "active_delivery"], requiresContract: true },
];
export const DESIGN_PARTNER_COLUMNS = [
  { key: "targeted", label: "Targeted", statuses: ["candidate", "evidence_ready", "approved"] },
  { key: "connected", label: "Connected", statuses: ["contacted", "replied"] },
  { key: "workflow", label: "Workflow convo", statuses: ["meeting_confirmed"] },
  { key: "site_walk", label: "Site walk", statuses: ["qualified"] },
  { key: "fit_memo", label: "Fit memo", statuses: ["proposal_review"] },
  { key: "partner", label: "Partner", statuses: ["signed", "active_delivery"], requiresContract: true },
];

export function boardColumns(venture) {
  return normalizeVenture(venture) === "morrow" ? DESIGN_PARTNER_COLUMNS : REVENUE_COLUMNS;
}

// The micro-form a target column requires. A forward move is never silent: the founder
// must supply the evidence the stage means. `null` = no gate (e.g. Targeted / backward).
const FORM_FOR_COLUMN = {
  contacted: "record_send", replied: "paste_reply", call: "confirm_meeting", proposal: "proposal", won: "contract",
  targeted: null, connected: "paste_reply", workflow: "confirm_meeting", site_walk: "qualification", fit_memo: "proposal", partner: "contract",
};
export function stageGate(targetColumn) {
  const form = FORM_FOR_COLUMN[targetColumn];
  return { requires_evidence: Boolean(form), required_form: form || null, target_column: targetColumn };
}

// Build the kanban for ONE venture. Won/Partner is populated from contracts, not from a
// bare 'signed' status, so a signed-without-contract motion never counts as won.
export function buildBoard(database = db(), { venture, now = null } = {}) {
  const v = normalizeVenture(venture);
  const cols = boardColumns(v);
  const ref = now ? new Date(now) : new Date();
  const motions = database.prepare(
    "SELECT m.*, l.name, l.company, l.title FROM active_motions m JOIN leads l ON l.id=m.lead_id WHERE m.venture=? AND m.closed_at IS NULL"
  ).all(v);
  const contractLeads = new Set(database.prepare("SELECT DISTINCT lead_id FROM contracts").all().map((r) => r.lead_id));
  const oppByLead = new Map(database.prepare("SELECT lead_id, amount_mrr, amount_one_time FROM opportunities").all().map((o) => [o.lead_id, o]));
  const wonKey = cols[cols.length - 1].key;
  const index = Object.fromEntries(cols.map((c, i) => [c.key, i]));
  const columns = cols.map((c) => ({ key: c.key, label: c.label, cards: [] }));

  for (const m of motions) {
    let ci;
    if (contractLeads.has(m.lead_id)) ci = index[wonKey];
    else {
      const col = cols.find((c) => !c.requiresContract && c.statuses.includes(m.status));
      if (!col) continue; // pre-board / nurture / closed — not on the funnel
      ci = index[col.key];
    }
    const daysInStage = Math.max(0, Math.floor((ref - new Date(m.updated_at)) / DAY));
    const opp = oppByLead.get(m.lead_id);
    const amount = opp ? (Number(opp.amount_mrr) || 0) + (Number(opp.amount_one_time) || 0) : null;
    columns[ci].cards.push({
      motion_id: m.id, lead_id: m.lead_id, person: m.name, company: m.company, title: m.title,
      status: m.status, days_in_stage: daysInStage, stalled: daysInStage > 10,
      amount: ci >= index[wonKey] - 1 ? amount : null, // amounts shown from Proposal onward
    });
  }
  for (const c of columns) c.cards.sort((a, b) => (b.stalled - a.stalled) || b.days_in_stage - a.days_in_stage);
  return { venture: v, funnel_type: v === "morrow" ? "design_partner" : "revenue", columns, active_deals: columns.reduce((n, c) => n + c.cards.length, 0) };
}
