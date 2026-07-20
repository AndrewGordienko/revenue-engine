// campaign-targets.js — helpers over the campaign_targets table. Targets are per
// (venture, play) account aspirations that keep a venture's pipeline reporting non-null
// before lead sourcing, and are promoted into leads/cohorts by a human, not automatically.
import { db } from "./db.js";
import { MORROW_WINDSOR_TARGETS } from "./campaign-targets-data.js";

const now = () => new Date().toISOString();

// Idempotent seed of the Morrow Windsor-Essex Tier-1 list (UNIQUE venture,play_id,company).
export function seedMorrowWindsorTargets(database = db()) {
  const t = now();
  const ins = database.prepare(`INSERT OR IGNORE INTO campaign_targets
    (venture,play_id,company,domain,tier,region,entity_type,status,source,created_at,updated_at)
    VALUES('morrow',?,?,?,?,?, 'account','proposed','windsor-essex-tier1',?,?)`);
  let added = 0;
  for (const g of MORROW_WINDSOR_TARGETS) {
    const r = ins.run(g.play_id, g.company, g.domain, g.tier, g.region, t, t);
    added += r.changes;
  }
  return { added };
}

export function listCampaignTargets(database = db(), { venture = null, play_id = null, status = null } = {}) {
  const clauses = [];
  const args = [];
  if (venture) { clauses.push("venture=?"); args.push(venture); }
  if (play_id) { clauses.push("play_id=?"); args.push(play_id); }
  if (status) { clauses.push("status=?"); args.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return database.prepare(`SELECT * FROM campaign_targets ${where} ORDER BY play_id, company`).all(...args);
}

export function countTargetsByPlay(database = db(), venture) {
  return database.prepare("SELECT play_id, COUNT(*) n FROM campaign_targets WHERE venture=? GROUP BY play_id").all(venture);
}
