// db.js — canonical CRM store on SQLite (node:sqlite, WAL + transactions).
// This is the ONLY writable source of truth. Legacy JSONL files are read-only.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");

let _db = null;
export function db() {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL;");
  _db.exec("PRAGMA foreign_keys = ON;");
  _db.exec("PRAGMA busy_timeout = 5000;"); // survive concurrent writers
  migrate(_db);
  return _db;
}

// Run fn inside a transaction; roll back on throw. node:sqlite has no wrapper.
export function tx(fn) {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn(d);
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

function migrate(d) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS cohorts (
    cohort_id        TEXT PRIMARY KEY,
    product          TEXT NOT NULL,
    strategy_version TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    note             TEXT
  );

  CREATE TABLE IF NOT EXISTS pipeline_runs (
    pipeline_run_id  TEXT PRIMARY KEY,
    cohort_id        TEXT NOT NULL REFERENCES cohorts(cohort_id),
    product          TEXT NOT NULL,
    strategy_version TEXT NOT NULL,
    stage             TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'running',
    started_at        TEXT NOT NULL,
    completed_at      TEXT,
    metadata          TEXT
  );
  CREATE INDEX IF NOT EXISTS pipeline_runs_cohort ON pipeline_runs(cohort_id, started_at);

  CREATE TABLE IF NOT EXISTS leads (
    id                     TEXT PRIMARY KEY,
    product                TEXT NOT NULL,
    cohort_id              TEXT NOT NULL REFERENCES cohorts(cohort_id),
    pipeline_run_id        TEXT NOT NULL,
    strategy_version       TEXT NOT NULL,
    company                TEXT,
    company_domain         TEXT,
    name                   TEXT,
    title                  TEXT,
    linkedin_url           TEXT,
    identity_key           TEXT NOT NULL,
    identity_confidence    TEXT NOT NULL,          -- strong | weak
    email_best             TEXT,
    email_status           TEXT DEFAULT 'unknown',
    address_found_or_guessed TEXT,                 -- verified | published | guessed | null
    email_source_type      TEXT,
    email_source_url       TEXT,
    deliverability_status  TEXT DEFAULT 'unchecked', -- deliverable|risky|invalid|catch_all|unknown|unchecked
    deliverability_checked_at TEXT,
    recipient_jurisdiction TEXT DEFAULT 'unknown', -- CA|UK|US|AU|unknown
    legal_basis            TEXT,                   -- enumerated, see crm-model
    legal_basis_evidence   TEXT,                   -- JSON object
    role_relevance_note    TEXT,
    do_not_contact         INTEGER DEFAULT 0,
    unsubscribed_at        TEXT,
    stage                  TEXT NOT NULL DEFAULT 'target',  -- materialized from events + gated transitions
    suppressed             INTEGER DEFAULT 0,      -- materialized
    needs_review           INTEGER DEFAULT 0,
    review_reasons         TEXT,                   -- JSON array
    source_stores          TEXT,                   -- JSON array
    research               TEXT,                   -- JSON blob of remaining research fields
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS leads_identity ON leads(identity_key);
  CREATE INDEX IF NOT EXISTS leads_cohort   ON leads(cohort_id);
  CREATE INDEX IF NOT EXISTS leads_stage    ON leads(product, stage);

  -- Immutable, append-only activity log. Buyer stages are derived from this.
  CREATE TABLE IF NOT EXISTS activity_events (
    event_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id         TEXT NOT NULL REFERENCES leads(id),
    type            TEXT NOT NULL,   -- sent|delivered|bounced|reply|unsubscribe|meeting|proposal|contract_signed|contact_evidence_missing|note
    occurred_at     TEXT NOT NULL,
    recorded_at     TEXT NOT NULL,
    cohort_id       TEXT,
    pipeline_run_id TEXT,
    source          TEXT NOT NULL,   -- dashboard|agent|migration|mailbox-sync|test
    payload         TEXT,            -- JSON
    dedupe_key      TEXT UNIQUE      -- guards against duplicate event insertion
  );
  CREATE INDEX IF NOT EXISTS events_lead ON activity_events(lead_id, occurred_at);

  -- Enforce immutability at the DB layer.
  CREATE TRIGGER IF NOT EXISTS activity_events_no_update
    BEFORE UPDATE ON activity_events
    BEGIN SELECT RAISE(ABORT, 'activity_events is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS activity_events_no_delete
    BEFORE DELETE ON activity_events
    BEGIN SELECT RAISE(ABORT, 'activity_events is immutable'); END;

  -- Global suppression: unsubscribe / hard bounce / manual DNC / complaint.
  CREATE TABLE IF NOT EXISTS suppression (
    value      TEXT NOT NULL,       -- address or domain
    scope      TEXT NOT NULL,       -- address | domain
    reason     TEXT NOT NULL,       -- unsubscribe|hard_bounce|manual_dnc|complaint
    created_at TEXT NOT NULL,
    PRIMARY KEY (value, scope)
  );

  -- Identity-critical merge conflicts flagged for human review.
  CREATE TABLE IF NOT EXISTS merge_conflicts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id           TEXT NOT NULL,
    field             TEXT NOT NULL,
    kept              TEXT,
    discarded         TEXT,
    from_store        TEXT,
    identity_critical INTEGER DEFAULT 0,
    resolved          INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL
  );

  -- Versioned commercial strategy (Business Plan §36–37). Immutable per version:
  -- (play_id, strategy_version) is the key; a revision inserts a new row.
  CREATE TABLE IF NOT EXISTS sales_plays (
    play_id          TEXT NOT NULL,
    strategy_version TEXT NOT NULL,
    brand            TEXT NOT NULL,
    name             TEXT NOT NULL,
    spec             TEXT NOT NULL,           -- JSON: full §37 schema
    created_at       TEXT NOT NULL,
    PRIMARY KEY (play_id, strategy_version)
  );

  -- Opportunity: a deal in its own lifecycle, opened only when buyer engagement
  -- justifies it (§38). Separate from the prospect record.
  CREATE TABLE IF NOT EXISTS opportunities (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id           TEXT NOT NULL REFERENCES leads(id),
    play_id           TEXT,
    cohort_id         TEXT,
    stage             TEXT NOT NULL DEFAULT 'discovery', -- discovery|qualified|solution_defined|proposal|contracting|won|lost
    amount_mrr        REAL,
    amount_one_time   REAL,
    probability_source TEXT,                  -- 'stage_model' | 'manual' | null (never LLM confidence)
    next_step         TEXT,
    next_step_at      TEXT,
    close_date        TEXT,
    loss_reason       TEXT,
    qualification     TEXT,                   -- JSON: problem/consequence/owner/timing/decision_path/next_step
    solution          TEXT,                   -- JSON: solution/success_metrics/price/responsibilities
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS opps_lead ON opportunities(lead_id);
  CREATE INDEX IF NOT EXISTS opps_stage ON opportunities(stage);

  -- Contract: the customer/revenue record created when an opportunity is won.
  CREATE TABLE IF NOT EXISTS contracts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER REFERENCES opportunities(id),
    lead_id        TEXT REFERENCES leads(id),
    brand          TEXT,
    mrr            REAL,
    one_time       REAL,
    start_date     TEXT,
    renewal_date   TEXT,
    scope          TEXT,
    created_at     TEXT NOT NULL
  );

  -- Human-approved outbound queue. Nothing reaches a provider before approval;
  -- replies atomically stop every future touch for the lead.
  CREATE TABLE IF NOT EXISTS outreach_messages (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id             TEXT NOT NULL REFERENCES leads(id),
    cohort_id           TEXT NOT NULL REFERENCES cohorts(cohort_id),
    pipeline_run_id     TEXT NOT NULL,
    strategy_version    TEXT NOT NULL,
    message_type        TEXT NOT NULL DEFAULT 'sequence_touch',
    touch_number        INTEGER,
    recipient           TEXT NOT NULL,
    subject             TEXT NOT NULL,
    body                TEXT NOT NULL,
    review_status       TEXT,
    evidence            TEXT,
    scheduled_at        TEXT,
    status              TEXT NOT NULL DEFAULT 'pending_approval',
    approved_at         TEXT,
    approved_by         TEXT,
    rejected_at         TEXT,
    rejection_reason    TEXT,
    provider            TEXT,
    provider_draft_id   TEXT,
    provider_message_id TEXT,
    provider_thread_id  TEXT,
    sent_at             TEXT,
    stopped_at          TEXT,
    stopped_reason      TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE(lead_id, message_type, touch_number)
  );
  CREATE INDEX IF NOT EXISTS outreach_status ON outreach_messages(status, scheduled_at);
  CREATE INDEX IF NOT EXISTS outreach_lead ON outreach_messages(lead_id, created_at);

  CREATE TABLE IF NOT EXISTS meetings (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id           TEXT NOT NULL REFERENCES leads(id),
    opportunity_id    INTEGER REFERENCES opportunities(id),
    status            TEXT NOT NULL DEFAULT 'proposed',
    starts_at         TEXT NOT NULL,
    ends_at           TEXT NOT NULL,
    timezone          TEXT NOT NULL,
    attendees         TEXT NOT NULL,
    provider          TEXT,
    provider_event_id TEXT,
    conference_url    TEXT,
    brief             TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meetings_lead ON meetings(lead_id, starts_at);

  CREATE TABLE IF NOT EXISTS provider_sync_state (
    provider   TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(provider, key)
  );
  `);

  // Additive columns on leads for play attachment + within-play scoring.
  addColumn(d, "leads", "play_id", "TEXT");
  addColumn(d, "leads", "score", "INTEGER");
  addColumn(d, "leads", "score_breakdown", "TEXT");
  addColumn(d, "contracts", "contract_type", "TEXT");
  addColumn(d, "contracts", "implementation_cost", "REAL");
  addColumn(d, "contracts", "status", "TEXT DEFAULT 'active'");
  addColumn(d, "contracts", "parent_contract_id", "INTEGER");
  addColumn(d, "contracts", "ended_at", "TEXT");
  addColumn(d, "cohorts", "play_id", "TEXT");
  addColumn(d, "cohorts", "status", "TEXT DEFAULT 'draft'");
  addColumn(d, "cohorts", "rules", "TEXT");
  addColumn(d, "cohorts", "approved_at", "TEXT");
  addColumn(d, "cohorts", "approved_by", "TEXT");
  addColumn(d, "outreach_messages", "review_status", "TEXT");
  addColumn(d, "outreach_messages", "evidence", "TEXT");
  addColumn(d, "meetings", "brief", "TEXT");
  const v = d.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  if (!v) d.prepare("INSERT INTO meta(key,value) VALUES('schema_version','1')").run();
}

// SQLite has no ADD COLUMN IF NOT EXISTS; check pragma first.
function addColumn(d, table, col, type) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  if (!cols.includes(col)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}

// Test/reset helper: close and null the singleton so a fresh path can be opened.
export function _closeForTest() {
  if (_db) { _db.close(); _db = null; }
}
