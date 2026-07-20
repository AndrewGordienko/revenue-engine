// offers.js — COMMERCIAL OFFERS are what a proposal and contract are made of, and are
// DELIBERATELY separate from sales plays. A play explains the buyer problem, trigger,
// targeting, and message hypothesis; an offer is the priced thing you sign. Many plays
// can sell one standardized offer. Price logic lives here, never in message prompts.
import { db } from "./db.js";
import { getMotion, advanceMotion } from "./active-motions.js";
import { COMMERCIAL_OFFERS } from "./offers-data.js";

const now = () => new Date().toISOString();

export { COMMERCIAL_OFFERS };
export const OFFERS_BY_ID = Object.fromEntries(COMMERCIAL_OFFERS.map((o) => [`${o.offer_id}:${o.offer_version}`, o]));

export function listOffers(database = db(), { venture = null, active = true } = {}) {
  const clauses = [];
  const args = [];
  if (venture) { clauses.push("venture=?"); args.push(venture); }
  if (active) clauses.push("active=1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return database.prepare(`SELECT * FROM commercial_offers ${where} ORDER BY offer_id`).all(...args);
}

export function getOffer(database, offerId, offerVersion = "v1") {
  return database.prepare("SELECT * FROM commercial_offers WHERE offer_id=? AND offer_version=?").get(offerId, offerVersion) || null;
}

// Record a signed contract for a motion. This is the ONLY source of booked revenue (the
// cash line reads contracts). It ensures a won opportunity carrying the offer, inserts a
// contract row, and advances the motion to signed. Amounts are explicit — never inferred.
export function recordContractSigned(database, {
  motion_id, offer_id, offer_version = "v1", mrr = 0, one_time = 0, start_date = null, scope = null,
} = {}) {
  const motion = getMotion(database, motion_id);
  if (!motion) throw new Error(`recordContractSigned: unknown motion ${motion_id}`);
  const offer = getOffer(database, offer_id, offer_version);
  if (!offer) throw new Error(`recordContractSigned: unknown offer ${offer_id}:${offer_version}`);
  if (offer.venture !== motion.venture) throw new Error(`recordContractSigned: offer ${offer_id} is ${offer.venture}, not ${motion.venture}`);
  if (!start_date) throw new Error("recordContractSigned: a booked start_date is required");
  if (!(Number(mrr) > 0 || Number(one_time) > 0)) throw new Error("recordContractSigned: a contract needs mrr or one_time > 0");
  const t = now();

  let opp = database.prepare("SELECT * FROM opportunities WHERE lead_id=? ORDER BY id DESC LIMIT 1").get(motion.lead_id);
  if (!opp) {
    const info = database.prepare(`INSERT INTO opportunities
      (lead_id,play_id,cohort_id,stage,amount_mrr,amount_one_time,probability_source,offer_id,offer_version,created_at,updated_at)
      VALUES(?,?,?, 'won', ?,?, 'manual', ?,?,?,?) RETURNING id`)
      .get(motion.lead_id, motion.play_id, motion.cohort_id, Number(mrr) || 0, Number(one_time) || 0, offer_id, offer_version, t, t);
    opp = database.prepare("SELECT * FROM opportunities WHERE id=?").get(Number(info.id));
  } else {
    database.prepare("UPDATE opportunities SET stage='won', amount_mrr=?, amount_one_time=?, offer_id=?, offer_version=?, updated_at=? WHERE id=?")
      .run(Number(mrr) || 0, Number(one_time) || 0, offer_id, offer_version, t, opp.id);
  }

  const contract = database.prepare(`INSERT INTO contracts
    (opportunity_id,lead_id,brand,mrr,one_time,start_date,scope,created_at)
    VALUES(?,?,?,?,?,?,?,?) RETURNING id`)
    .get(opp.id, motion.lead_id, motion.venture, Number(mrr) || 0, Number(one_time) || 0, start_date, scope || offer.name, t);

  // Immutable event + advance motion to signed (idempotent if already signed).
  database.prepare(`INSERT INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,source,payload,dedupe_key)
    VALUES(?, 'contract_signed', ?,?,?, 'manual_linkedin', ?, ?)`)
    .run(motion.lead_id, t, t, motion.cohort_id, JSON.stringify({ motion_id: motion.id, offer_id, offer_version, mrr, one_time, start_date, contract_id: Number(contract.id) }), `contract:${Number(contract.id)}`);
  if (motion.status !== "signed" && !motion.closed_at) advanceMotion(database, motion.id, "signed");

  return { contract_id: Number(contract.id), opportunity_id: opp.id, motion_id: motion.id, mrr: Number(mrr) || 0, one_time: Number(one_time) || 0 };
}
