// signals.js — account-scoped, expiring market signals. A signal is time-stamped evidence
// that may activate or prioritize an account; it is NONBLOCKING (a failed research refresh
// never stops an already-approved motion). Signals feed the trigger dimension of the
// deterministic account score; they do not themselves open motions.
import { db } from "./db.js";

const now = () => new Date().toISOString();

export const SIGNAL_TYPES = [
  "warm_referral", "new_executive", "multiple_relevant_jobs", "migration_or_deprecation",
  "incident_or_reliability_problem", "launch_or_integration_deadline", "manual_workflow_evidence", "partner_overflow",
];

// Record a signal against an account. Idempotent on the base table's UNIQUE
// (venture,theme_key,statement,source_url); re-recording refreshes account_key/confidence/expiry.
export function recordSignal(database, { venture, account_key, signal_type, statement, source_url = null, company = null, theme_key = null, confidence = 0.5, occurred_at = null, expires_at = null } = {}) {
  if (!venture || !account_key || !signal_type || !statement) throw new Error("recordSignal requires venture, account_key, signal_type, statement");
  const t = now();
  const key = theme_key || signal_type;
  database.prepare(`INSERT INTO market_signals
    (venture,theme_key,company,signal_type,statement,source_url,observed_at,freshness,account_key,confidence,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?, 'current', ?,?,?,?)
    ON CONFLICT(venture,theme_key,statement,source_url) DO UPDATE SET
      account_key=excluded.account_key, confidence=excluded.confidence, expires_at=excluded.expires_at, observed_at=excluded.observed_at`)
    .run(venture, key, company, signal_type, statement, source_url, occurred_at || t, account_key, confidence, expires_at, t);
  return database.prepare("SELECT * FROM market_signals WHERE venture=? AND theme_key=? AND statement=? AND (source_url IS ? OR source_url=?)").get(venture, key, statement, source_url, source_url);
}

// Live signals for an account (not expired).
export function listActiveSignals(database, accountKey, { at = null } = {}) {
  const ref = at || now();
  return database.prepare("SELECT * FROM market_signals WHERE account_key=? AND (expires_at IS NULL OR expires_at > ?) ORDER BY observed_at DESC").all(accountKey, ref);
}

export function listActiveSignalsForVenture(database = db(), venture, { at = null } = {}) {
  const ref = at || now();
  return database.prepare("SELECT * FROM market_signals WHERE venture=? AND (expires_at IS NULL OR expires_at > ?) ORDER BY observed_at DESC").all(venture, ref);
}
