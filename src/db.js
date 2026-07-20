// db.js — canonical CRM store on SQLite (node:sqlite, WAL + transactions).
// This is the ONLY writable source of truth. Legacy JSONL files are read-only.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { SALES_PLAYS } from "./sales-plays.js";
import { COMMERCIAL_OFFERS } from "./offers-data.js";
import { MORROW_WINDSOR_TARGETS } from "./campaign-targets-data.js";

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
  // One-time rebuild of the pre-release active_motions table when it predates the
  // sales-state-machine shape (no account_key column). Safe: active_motions is only
  // introduced in this work stream and is guaranteed empty in any real DB, and the
  // next_actions/outreach_messages FK columns that reference it are still all NULL.
  {
    const am = d.prepare("PRAGMA table_info(active_motions)").all().map((r) => r.name);
    if (am.length && !am.includes("account_key")) d.exec("DROP TABLE active_motions");
  }
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

  -- First-degree relationship catalogue imported from the operator's own
  -- LinkedIn data export/text capture. Kept separate from leads until reviewed.
  CREATE TABLE IF NOT EXISTS linkedin_connections (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_key          TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    headline              TEXT,
    connected_on          TEXT,
    profile_url           TEXT NOT NULL,
    profile_status        TEXT NOT NULL DEFAULT 'search',
    primary_product       TEXT NOT NULL DEFAULT 'other',
    relationship_intent   TEXT NOT NULL DEFAULT 'other',
    relationship_role     TEXT NOT NULL DEFAULT 'network_only',
    classification_confidence TEXT NOT NULL DEFAULT 'unmatched',
    classification_score  INTEGER NOT NULL DEFAULT 0,
    product_scores        TEXT NOT NULL DEFAULT '{}',
    classification_reason TEXT,
    classification_source TEXT NOT NULL DEFAULT 'rules',
    review_status         TEXT NOT NULL DEFAULT 'new',
    contacted_at          TEXT,
    contact_channel       TEXT,
    linked_lead_id        TEXT REFERENCES leads(id),
    source_file           TEXT,
    source_line           INTEGER,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS linkedin_connections_product ON linkedin_connections(primary_product, review_status);
  CREATE INDEX IF NOT EXISTS linkedin_connections_name ON linkedin_connections(name);

  CREATE TABLE IF NOT EXISTS linkedin_connection_drafts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id     INTEGER NOT NULL REFERENCES linkedin_connections(id) ON DELETE CASCADE,
    draft_type        TEXT NOT NULL, -- connection_request|warm_introduction|research_call
    body              TEXT NOT NULL,
    character_count   INTEGER NOT NULL,
    generation_source TEXT NOT NULL DEFAULT 'rules',
    template_version  TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE(connection_id,draft_type)
  );
  CREATE INDEX IF NOT EXISTS linkedin_connection_drafts_connection ON linkedin_connection_drafts(connection_id,draft_type);

  CREATE TABLE IF NOT EXISTS linkedin_connection_research (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id       INTEGER NOT NULL REFERENCES linkedin_connections(id) ON DELETE CASCADE,
    researched_name     TEXT NOT NULL,
    saved_headline      TEXT,
    current_role        TEXT,
    current_company     TEXT,
    proposed_intent     TEXT NOT NULL,
    proposed_role       TEXT,
    confidence          TEXT NOT NULL,
    reason              TEXT,
    source_urls         TEXT NOT NULL DEFAULT '[]',
    researched_at       TEXT NOT NULL,
    imported_at         TEXT NOT NULL,
    UNIQUE(connection_id)
  );

  CREATE TABLE IF NOT EXISTS linkedin_conversations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_key          TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    profile_url           TEXT,
    headline              TEXT,
    product               TEXT NOT NULL DEFAULT 'other',
    connection_id         INTEGER REFERENCES linkedin_connections(id),
    linked_lead_id        TEXT REFERENCES leads(id),
    status                TEXT NOT NULL DEFAULT 'waiting',
    response_theme        TEXT NOT NULL DEFAULT 'no_reply',
    summary               TEXT,
    next_action           TEXT,
    follow_up_at          TEXT,
    meeting_at            TEXT,
    meeting_timezone      TEXT,
    meeting_label         TEXT,
    meeting_status        TEXT NOT NULL DEFAULT 'none',
    contact_details       TEXT NOT NULL DEFAULT '{}',
    manual_notes          TEXT,
    workflow_source       TEXT NOT NULL DEFAULT 'rules',
    message_count         INTEGER NOT NULL DEFAULT 0,
    inbound_count         INTEGER NOT NULL DEFAULT 0,
    outbound_count        INTEGER NOT NULL DEFAULT 0,
    first_message_at      TEXT,
    last_message_at       TEXT,
    last_inbound_at       TEXT,
    last_outbound_at      TEXT,
    source_file           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS linkedin_conversations_workflow ON linkedin_conversations(product,status,follow_up_at);
  CREATE INDEX IF NOT EXISTS linkedin_conversations_name ON linkedin_conversations(name);

  CREATE TABLE IF NOT EXISTS linkedin_messages (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id       INTEGER NOT NULL REFERENCES linkedin_conversations(id) ON DELETE CASCADE,
    fingerprint           TEXT NOT NULL UNIQUE,
    sender_name           TEXT NOT NULL,
    direction             TEXT NOT NULL,
    sent_at               TEXT NOT NULL,
    sent_at_label         TEXT,
    body                  TEXT NOT NULL,
    source_line           INTEGER,
    created_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS linkedin_messages_conversation ON linkedin_messages(conversation_id,sent_at);

  -- Founder operating loop. Every open relationship/deal has one explicit next
  -- action or a terminal state; these records drive the Today screen.
  CREATE TABLE IF NOT EXISTS next_actions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type     TEXT NOT NULL, -- conversation|meeting|opportunity|lead
    entity_id       TEXT NOT NULL,
    action_type     TEXT NOT NULL,
    due_at          TEXT,
    owner           TEXT NOT NULL DEFAULT 'Andrew',
    status          TEXT NOT NULL DEFAULT 'open', -- open|completed|cancelled
    priority        INTEGER NOT NULL DEFAULT 50,
    reason          TEXT,
    source_event_id INTEGER REFERENCES activity_events(event_id),
    source_key      TEXT UNIQUE,
    completed_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS next_actions_due ON next_actions(status,due_at,priority DESC);
  CREATE INDEX IF NOT EXISTS next_actions_entity ON next_actions(entity_type,entity_id,status);
  CREATE UNIQUE INDEX IF NOT EXISTS next_actions_one_open_entity
    ON next_actions(entity_type,entity_id) WHERE status='open';

  CREATE TABLE IF NOT EXISTS conversation_outcomes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES linkedin_conversations(id) ON DELETE CASCADE,
    primary_outcome TEXT NOT NULL,
    secondary_tags  TEXT NOT NULL DEFAULT '[]',
    confidence      TEXT NOT NULL DEFAULT 'inferred',
    confirmed_by    TEXT,
    correction_text TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(conversation_id)
  );

  CREATE TABLE IF NOT EXISTS experiments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    venture         TEXT NOT NULL,
    play_id         TEXT,
    segment         TEXT,
    hypothesis      TEXT NOT NULL,
    variants        TEXT NOT NULL DEFAULT '[]',
    start_at        TEXT,
    stop_rule       TEXT,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS experiment_assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id   INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    variant         TEXT NOT NULL,
    assigned_at     TEXT NOT NULL,
    UNIQUE(experiment_id,entity_type,entity_id)
  );

  CREATE TABLE IF NOT EXISTS qualification_snapshots (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id    INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    venture           TEXT NOT NULL,
    fields             TEXT NOT NULL DEFAULT '{}',
    buyer_evidence     TEXT NOT NULL DEFAULT '{}',
    result             TEXT NOT NULL DEFAULT 'incomplete',
    missing_evidence   TEXT NOT NULL DEFAULT '[]',
    confirmed_by       TEXT,
    created_at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_signals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    venture           TEXT NOT NULL,
    theme_key         TEXT NOT NULL,
    company           TEXT,
    signal_type       TEXT NOT NULL,
    statement         TEXT NOT NULL,
    source_url        TEXT,
    observed_at       TEXT,
    freshness         TEXT NOT NULL DEFAULT 'current',
    created_at        TEXT NOT NULL,
    UNIQUE(venture,theme_key,statement,source_url)
  );

  CREATE TABLE IF NOT EXISTS market_theses (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    venture                TEXT NOT NULL,
    theme_key              TEXT NOT NULL,
    thesis                 TEXT NOT NULL,
    buyer_roles            TEXT NOT NULL DEFAULT '[]',
    buyer_problem          TEXT,
    offer_implication      TEXT,
    supporting_evidence    TEXT NOT NULL DEFAULT '[]',
    contradicting_evidence TEXT NOT NULL DEFAULT '[]',
    confidence             TEXT NOT NULL DEFAULT 'directional',
    status                 TEXT NOT NULL DEFAULT 'proposed',
    approved_by            TEXT,
    reviewed_at            TEXT,
    review_at              TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    UNIQUE(venture,theme_key)
  );

  CREATE TABLE IF NOT EXISTS target_matches (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    venture               TEXT NOT NULL,
    theme_key             TEXT NOT NULL,
    entity_type           TEXT NOT NULL,
    entity_id             TEXT NOT NULL,
    components            TEXT NOT NULL DEFAULT '{}',
    reason                TEXT,
    evidence_gaps         TEXT NOT NULL DEFAULT '[]',
    recommended_angle     TEXT,
    status                TEXT NOT NULL DEFAULT 'proposed',
    confirmed_by          TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    UNIQUE(venture,theme_key,entity_type,entity_id)
  );

  CREATE TABLE IF NOT EXISTS message_observations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id            INTEGER REFERENCES linkedin_messages(id) ON DELETE CASCADE,
    conversation_id       INTEGER REFERENCES linkedin_conversations(id) ON DELETE CASCADE,
    venture               TEXT NOT NULL,
    play_id               TEXT,
    touch_number          INTEGER,
    message_type          TEXT,
    word_count            INTEGER,
    length_bucket         TEXT,
    ask_type              TEXT,
    trigger_type          TEXT,
    outcome               TEXT,
    sent_at               TEXT,
    created_at            TEXT NOT NULL,
    UNIQUE(message_id)
  );

  CREATE TABLE IF NOT EXISTS message_learnings (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    venture               TEXT NOT NULL,
    rule_key              TEXT NOT NULL,
    statement             TEXT NOT NULL,
    supporting_counts     TEXT NOT NULL DEFAULT '{}',
    confidence            TEXT NOT NULL DEFAULT 'observational',
    status                TEXT NOT NULL DEFAULT 'proposed',
    approved_by           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    UNIQUE(venture,rule_key)
  );

  -- Active motion: the first-class unit of the operating loop. A motion binds one
  -- relationship (lead) at one account to exactly one venture + play + cohort + owner
  -- inside an explicit open/expiry window, and carries the SALES STATE MACHINE. Only
  -- real events advance status. A motion is OPEN while closed_at IS NULL. Everything a
  -- founder is asked to do in "Today" belongs to an open motion; the historical archive
  -- never gets a motion, so it can never manufacture open work. Channel is LinkedIn only.
  CREATE TABLE IF NOT EXISTS active_motions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id           TEXT NOT NULL REFERENCES leads(id),
    account_key       TEXT NOT NULL,                 -- normalized company identity
    venture           TEXT NOT NULL CHECK (venture IN ('gnk','outagehub','morrow')),
    play_id           TEXT NOT NULL,
    strategy_version  TEXT NOT NULL,
    cohort_id         TEXT REFERENCES cohorts(cohort_id),
    channel           TEXT NOT NULL DEFAULT 'linkedin' CHECK (channel = 'linkedin'),
    motion_type       TEXT NOT NULL DEFAULT 'revenue'
                        CHECK (motion_type IN ('revenue','design_partner')),
    owner             TEXT NOT NULL DEFAULT 'Andrew',
    status            TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
                        'candidate','evidence_ready','approved','contacted','replied',
                        'meeting_confirmed','qualified','proposal_review','signed',
                        'active_delivery','nurture','closed_no_fit','suppressed')),
    source_signal_id  TEXT,
    opened_at         TEXT NOT NULL,
    expires_at        TEXT NOT NULL,
    last_touch_at     TEXT,
    next_action_id    INTEGER,
    close_reason      TEXT,
    closed_at         TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS active_motions_venture ON active_motions(venture, status);
  CREATE INDEX IF NOT EXISTS active_motions_open    ON active_motions(closed_at, venture);
  -- At most one OPEN motion per account+venture+play, and per lead. "Open" = not closed.
  CREATE UNIQUE INDEX IF NOT EXISTS active_motions_one_open_per_account_play
    ON active_motions(account_key, venture, play_id) WHERE closed_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS active_motions_one_open_per_lead
    ON active_motions(lead_id) WHERE closed_at IS NULL;

  -- Deliberate campaign targets per (venture, play). Lets a venture whose plays
  -- predate lead sourcing (e.g. Morrow's Windsor-Essex list) report a non-null
  -- target set. These are aspirations, not leads; promotion happens elsewhere.
  CREATE TABLE IF NOT EXISTS campaign_targets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    venture       TEXT NOT NULL CHECK (venture IN ('gnk','outagehub','morrow')),
    play_id       TEXT NOT NULL,
    company       TEXT NOT NULL,
    domain        TEXT,
    tier          TEXT,
    region        TEXT,
    entity_type   TEXT NOT NULL DEFAULT 'account',
    status        TEXT NOT NULL DEFAULT 'proposed',
    source        TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    UNIQUE(venture, play_id, company)
  );

  -- LinkedIn-native draft: the ONE canonical outreach artifact for the live loop.
  -- No fake email recipient/subject. Every draft belongs to an active motion and its
  -- current pipeline run. The writer, approval UI, completion predicate, manual-send
  -- action, and metrics all consume THIS object. Draft -> approve -> copy -> record
  -- sent -> (reply stops future touches). Sending is always manual; the row only ever
  -- records what the founder did on LinkedIn.
  CREATE TABLE IF NOT EXISTS outreach_drafts_v2 (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    motion_id             INTEGER NOT NULL REFERENCES active_motions(id),
    lead_id               TEXT NOT NULL REFERENCES leads(id),
    venture               TEXT NOT NULL,          -- denormalized from the motion for scoping
    cohort_id             TEXT,
    pipeline_run_id       TEXT,
    strategy_version      TEXT NOT NULL,
    channel               TEXT NOT NULL DEFAULT 'linkedin' CHECK (channel = 'linkedin'),
    message_kind          TEXT NOT NULL DEFAULT 'connection_note' CHECK (
                            message_kind IN ('connection_note','direct_message','follow_up','reply')),
    touch_number          INTEGER NOT NULL,
    linkedin_profile_url  TEXT NOT NULL,
    body                  TEXT NOT NULL,
    evidence_json         TEXT NOT NULL DEFAULT '[]',
    writer_version        TEXT,
    review_status         TEXT NOT NULL DEFAULT 'pending' CHECK (
                            review_status IN ('pending','approved','rejected')),
    approved_body         TEXT,
    approved_at           TEXT,
    approved_by           TEXT,
    rejection_reason      TEXT,
    copied_at             TEXT,
    sent_at               TEXT,
    stopped_at            TEXT,
    stopped_reason        TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    UNIQUE(motion_id, touch_number)
  );
  CREATE INDEX IF NOT EXISTS outreach_drafts_v2_motion ON outreach_drafts_v2(motion_id, touch_number);
  CREATE INDEX IF NOT EXISTS outreach_drafts_v2_review ON outreach_drafts_v2(venture, review_status);

  -- Erasable message bodies. activity_events is an immutable commercial ledger, but a
  -- private LinkedIn message body is PII that must be deletable without disturbing the
  -- ledger. The immutable event stores only metadata + a body_ref into this table; the
  -- body row can be deleted for privacy while the commercial event survives.
  CREATE TABLE IF NOT EXISTS erasable_message_bodies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    motion_id    INTEGER REFERENCES active_motions(id),
    lead_id      TEXT,
    direction    TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    body         TEXT NOT NULL,
    sentiment    TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS erasable_bodies_motion ON erasable_message_bodies(motion_id);

  -- Commercial offers: the priced thing a proposal/contract is made of, kept SEPARATE
  -- from sales plays. Many plays can sell one standardized offer. Booked revenue (the
  -- cash line) is sourced only from contracts, which reference an offer.
  CREATE TABLE IF NOT EXISTS commercial_offers (
    offer_id       TEXT NOT NULL,
    offer_version  TEXT NOT NULL,
    venture        TEXT NOT NULL CHECK (venture IN ('gnk','outagehub','morrow')),
    name           TEXT NOT NULL,
    pricing_model  TEXT NOT NULL,
    amount_min     REAL,
    amount_max     REAL,
    term_months    INTEGER,
    spec_json      TEXT NOT NULL DEFAULT '{}',
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL,
    PRIMARY KEY (offer_id, offer_version)
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
  addColumn(d, "meetings", "confirmation_status", "TEXT DEFAULT 'unconfirmed'");
  addColumn(d, "meetings", "time_confidence", "TEXT DEFAULT 'unknown'");
  addColumn(d, "meetings", "intent", "TEXT DEFAULT 'research'");
  addColumn(d, "meetings", "outcome", "TEXT");
  addColumn(d, "meetings", "outcome_captured_at", "TEXT");
  addColumn(d, "meetings", "source_conversation_id", "INTEGER");
  addColumn(d, "meetings", "source_key", "TEXT");
  addColumn(d, "linkedin_conversations", "play_id", "TEXT");
  addColumn(d, "linkedin_conversations", "profile_url", "TEXT");
  // Channel-neutral outreach. LinkedIn is the default channel until verified email
  // evidence exists; email path keeps its recipient/subject/body columns. Channel
  // values are validated in the app layer (queueOutreachMessage) — SQLite ADD COLUMN
  // cannot carry a CHECK reliably across versions, so we don't rely on one here.
  addColumn(d, "outreach_messages", "channel", "TEXT NOT NULL DEFAULT 'linkedin'");
  addColumn(d, "outreach_messages", "connection_note", "TEXT");
  addColumn(d, "outreach_messages", "profile_url", "TEXT");
  addColumn(d, "outreach_messages", "active_motion_id", "INTEGER REFERENCES active_motions(id)");
  // next_actions belong to an active motion; open work is only generated when
  // active_motion_id IS NOT NULL. `source` classifies why the action exists.
  addColumn(d, "next_actions", "active_motion_id", "INTEGER REFERENCES active_motions(id)");
  addColumn(d, "next_actions", "source", "TEXT");
  const seedPlay = d.prepare(`INSERT OR IGNORE INTO sales_plays
    (play_id,strategy_version,brand,name,spec,created_at) VALUES(?,?,?,?,?,?)`);
  const seededAt = new Date().toISOString();
  for (const play of SALES_PLAYS) {
    seedPlay.run(play.play_id, play.strategy_version, play.brand, play.name, JSON.stringify(play), seededAt);
  }
  const seedOffer = d.prepare(`INSERT OR IGNORE INTO commercial_offers
    (offer_id,offer_version,venture,name,pricing_model,amount_min,amount_max,term_months,spec_json,active,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,1,?)`);
  for (const o of COMMERCIAL_OFFERS) {
    seedOffer.run(o.offer_id, o.offer_version, o.venture, o.name, o.pricing_model, o.amount_min ?? null, o.amount_max ?? null, o.term_months ?? null, JSON.stringify(o.spec || {}), seededAt);
  }
  addColumn(d, "opportunities", "offer_id", "TEXT");
  addColumn(d, "opportunities", "offer_version", "TEXT");
  // Seed the Morrow Windsor-Essex Tier-1 campaign targets so Morrow pipeline reporting is
  // non-null before lead sourcing. Idempotent via UNIQUE(venture,play_id,company).
  const seedTarget = d.prepare(`INSERT OR IGNORE INTO campaign_targets
    (venture,play_id,company,domain,tier,region,entity_type,status,source,created_at,updated_at)
    VALUES('morrow',?,?,?,?,?, 'account','proposed','windsor-essex-tier1',?,?)`);
  for (const g of MORROW_WINDSOR_TARGETS) {
    seedTarget.run(g.play_id, g.company, g.domain, g.tier, g.region, seededAt, seededAt);
  }
  // Activation fields on the existing market_signals table: an account-scoped, expiring
  // signal that can prioritize/activate an account. Additive — does not disturb the base
  // (venture, theme_key, company, signal_type, statement, source_url) shape.
  addColumn(d, "market_signals", "account_key", "TEXT");
  addColumn(d, "market_signals", "confidence", "REAL");
  addColumn(d, "market_signals", "expires_at", "TEXT");
  addColumn(d, "linkedin_connections", "contacted_at", "TEXT");
  addColumn(d, "linkedin_connections", "contact_channel", "TEXT");
  addColumn(d, "linkedin_connections", "relationship_intent", "TEXT DEFAULT 'other'");
  addColumn(d, "linkedin_connections", "relationship_role", "TEXT DEFAULT 'network_only'");
  addColumn(d, "linkedin_connections", "classification_confidence", "TEXT DEFAULT 'unmatched'");
  d.exec("CREATE UNIQUE INDEX IF NOT EXISTS meetings_source_key ON meetings(source_key) WHERE source_key IS NOT NULL;");
  d.prepare(`INSERT INTO meta(key,value) VALUES('schema_version','2')
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run();
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
