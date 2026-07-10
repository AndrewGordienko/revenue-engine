// opportunities.js — the Opportunity + Contract lifecycle (Business Plan §38/§41).
// An opportunity is a deal in its OWN state machine, separate from the prospect
// record. It is opened only when buyer engagement justifies it (§40.2 #25), and
// 'won' can only be reached by recording a signed contract with a booked start.
import { tx } from "./db.js";
import { getLead } from "./crm-model.js";

const now = () => new Date().toISOString();

export const OPP_STAGES = ["discovery", "qualified", "solution_defined", "proposal", "contracting", "won", "lost"];

export const OPP_TRANSITIONS = {
  discovery: ["qualified", "lost"],
  qualified: ["solution_defined", "lost"],
  solution_defined: ["proposal", "lost"],
  proposal: ["contracting", "won", "lost"],
  contracting: ["won", "lost"],
  won: [],
  lost: [],
};

// 'won' is reachable only through recordContractSigned (§41: signed contract + booked start).
const OPP_ENTRY_GATES = {
  qualified: (opp, patch) => {
    const q = patch.qualification || parse(opp.qualification);
    const need = ["problem", "consequence", "owner", "timing", "decision_path", "next_step"];
    const missing = need.filter((k) => !q || !q[k]);
    return missing.length ? `qualification missing: ${missing.join(", ")}` : null;
  },
  solution_defined: (opp, patch) => {
    const s = patch.solution || parse(opp.solution);
    const need = ["solution", "success_metrics", "price", "responsibilities"];
    const missing = need.filter((k) => !s || !s[k]);
    return missing.length ? `solution missing: ${missing.join(", ")}` : null;
  },
  proposal: (opp, patch) => {
    const s = patch.solution || parse(opp.solution);
    if (!s || !s.success_metrics || !s.price) return "proposal requires a defined solution with success_metrics and price";
    if (!(patch.next_step_at || opp.next_step_at)) return "proposal requires a scheduled proposal-review meeting (next_step_at)";
    return null;
  },
  lost: (opp, patch) => (patch.loss_reason || opp.loss_reason ? null : "lost requires a loss_reason"),
};

function parse(v) { try { return v == null ? null : JSON.parse(v); } catch { return null; } }
export function getOpp(d, id) { return d.prepare("SELECT * FROM opportunities WHERE id=?").get(id); }

// Open a deal. Requires the prospect to be 'engaged' (a captured human reply).
export function openOpportunity(d, leadId, { play_id, amount_mrr = null, amount_one_time = null, next_step = null } = {}) {
  const lead = getLead(d, leadId);
  if (!lead) throw new Error(`no such lead: ${leadId}`);
  if (lead.stage !== "engaged")
    throw new Error(`cannot open opportunity: prospect ${leadId} is '${lead.stage}', must be 'engaged'`);
  const t = now();
  const info = d.prepare(`INSERT INTO opportunities(lead_id,play_id,cohort_id,stage,amount_mrr,amount_one_time,probability_source,next_step,created_at,updated_at)
    VALUES(?,?,?,'discovery',?,?,'stage_model',?,?,?)`).run(leadId, play_id || lead.play_id, lead.cohort_id, amount_mrr, amount_one_time, next_step, t, t);
  return getOpp(d, Number(info.lastInsertRowid));
}

// Gated manual advance. 'won' is refused here — use recordContractSigned.
export function setOppStage(d, oppId, toStage, patch = {}) {
  const opp = getOpp(d, oppId);
  if (!opp) throw new Error(`no such opportunity: ${oppId}`);
  if (!OPP_STAGES.includes(toStage)) throw new Error(`unknown opportunity stage: ${toStage}`);
  if (toStage === "won") throw new Error("'won' can only be set by recordContractSigned");
  const allowed = OPP_TRANSITIONS[opp.stage] || [];
  if (!allowed.includes(toStage))
    throw new Error(`illegal opportunity transition ${opp.stage} -> ${toStage} (allowed: ${allowed.join(", ") || "none"})`);
  const gate = OPP_ENTRY_GATES[toStage];
  if (gate) { const reason = gate(opp, patch); if (reason) throw new Error(`cannot enter '${toStage}': ${reason}`); }

  const sets = ["stage=@stage", "updated_at=@t"];
  const params = { id: oppId, stage: toStage, t: now() };
  if (patch.qualification) { sets.push("qualification=@q"); params.q = JSON.stringify(patch.qualification); }
  if (patch.solution) { sets.push("solution=@s"); params.s = JSON.stringify(patch.solution); }
  if (patch.next_step) { sets.push("next_step=@ns"); params.ns = patch.next_step; }
  if (patch.next_step_at) { sets.push("next_step_at=@nsa"); params.nsa = patch.next_step_at; }
  if (patch.loss_reason) { sets.push("loss_reason=@lr"); params.lr = patch.loss_reason; }
  if (patch.close_date) { sets.push("close_date=@cd"); params.cd = patch.close_date; }
  d.prepare(`UPDATE opportunities SET ${sets.join(",")} WHERE id=@id`).run(params);
  return getOpp(d, oppId);
}

// The §41 'won' gate: a signed contract with a booked start creates the Contract
// and moves the opportunity to won atomically.
export function recordContractSigned(d, oppId, { mrr = null, one_time = null, start_date, renewal_date = null, scope = null, brand = null, contract_type = null, implementation_cost = null, parent_contract_id = null } = {}) {
  const opp = getOpp(d, oppId);
  if (!opp) throw new Error(`no such opportunity: ${oppId}`);
  if (!["proposal", "contracting"].includes(opp.stage))
    throw new Error(`cannot sign: opportunity is '${opp.stage}', must be proposal/contracting`);
  if (!start_date) throw new Error("won requires a booked start_date");
  if (mrr == null && one_time == null) throw new Error("won requires mrr or one_time revenue");
  const lead = getLead(d, opp.lead_id);
  return tx((db) => {
    const info = db.prepare(`INSERT INTO contracts(opportunity_id,lead_id,brand,mrr,one_time,start_date,renewal_date,scope,contract_type,implementation_cost,status,parent_contract_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?)`).run(oppId, opp.lead_id, brand || lead?.product || null, mrr, one_time, start_date, renewal_date, scope, contract_type, implementation_cost, parent_contract_id, now());
    db.prepare("UPDATE opportunities SET stage='won', close_date=@cd, updated_at=@t WHERE id=@id").run({ id: oppId, cd: start_date, t: now() });
    return { opportunity: getOpp(db, oppId), contract_id: Number(info.lastInsertRowid) };
  });
}
