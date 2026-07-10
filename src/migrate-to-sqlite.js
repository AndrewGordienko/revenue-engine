// migrate-to-sqlite.js — build the canonical crm.db from the three legacy JSONL
// stores. Safe by construction:
//  - stable identity keys; only STRONG identity (domain+linkedin/verified-email)
//    is auto-merged. WEAK (domain+name) matches are flagged for review, never merged.
//  - legacy 'contacted' rows are NOT reset to sales_ready; they get an immutable
//    contact_evidence_missing event and stay suppressed until mailbox reconciliation.
//  - identity-critical merge conflicts are recorded in merge_conflicts.
//  Run: node src/migrate-to-sqlite.js         (RESET=1 to rebuild from scratch)
import fs from "node:fs";
import path from "node:path";
import { db, tx } from "./db.js";
import { identity, recordEvent, assertLineage } from "./crm-model.js";

const DATA = path.join(process.cwd(), "data");
const COHORT = "legacy-import-2026-07-10";
const RUN_ID = "migration-2026-07-10";
const STRATEGY = "v1-2026-07-08";
const now = () => new Date().toISOString();

const CONTROL = new Set([
  "id", "product", "company", "company_domain", "name", "title", "email_best",
  "email_status", "verified", "linkedin_or_source", "linkedin_url", "source_url",
  "stage", "why_this_person", "created_at", "updated_at",
]);
const IDENTITY_FIELDS = ["email_best", "name", "title", "company_domain", "linkedin_url"];

function readJsonl(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function jurisdiction(row, product) {
  const d = (row.company_domain || "").toLowerCase();
  if (d.endsWith(".ca")) return "CA";
  if (d.endsWith(".co.uk") || d.endsWith(".uk")) return "UK";
  if (d.endsWith(".com.au") || d.endsWith(".au")) return "AU";
  if (product === "outagehub") return "CA";
  return "unknown";
}

function toRecord(row, product, store) {
  const id = identity(row);
  const research = {};
  for (const [k, v] of Object.entries(row)) if (!CONTROL.has(k) && !isEmpty(v)) research[k] = v;
  return {
    id: row.id,
    product,
    cohort_id: COHORT,
    pipeline_run_id: RUN_ID,
    strategy_version: STRATEGY,
    company: row.company || null,
    company_domain: row.company_domain || null,
    name: row.name || null,
    title: row.title || null,
    linkedin_url: /linkedin\.com\/in\//i.test(row.linkedin_or_source || row.linkedin_url || "")
      ? row.linkedin_or_source || row.linkedin_url : null,
    identity_key: id.key,
    identity_confidence: id.confidence,
    email_best: row.email_best || null,
    email_status: row.email_status || "unknown",
    address_found_or_guessed: row.email_best ? (row.verified ? "verified" : "guessed") : null,
    email_source_type: row.email_best ? (row.verified ? "verified" : "guessed_pattern") : null,
    email_source_url: row.source_url || null,
    deliverability_status: "unchecked",
    deliverability_checked_at: null,
    recipient_jurisdiction: jurisdiction(row, product),
    legal_basis: null,
    legal_basis_evidence: null,
    role_relevance_note: row.why_this_person || null,
    do_not_contact: 0,
    unsubscribed_at: null,
    stage: "target",
    suppressed: 0,
    needs_review: 0,
    review_reasons: [],
    source_stores: [store],
    research,
    _legacy_stage: row.stage,
  };
}

function main() {
  if (process.env.RESET === "1" || !fs.existsSync(path.join(DATA, "crm.db"))) {
    for (const f of ["crm.db", "crm.db-wal", "crm.db-shm"]) {
      const p = path.join(DATA, f);
      if (fs.existsSync(p)) fs.rmSync(p);
    }
  }
  const d = db();
  const existing = d.prepare("SELECT COUNT(*) n FROM leads").get().n;
  if (existing > 0) {
    console.error(`crm.db already has ${existing} leads. Re-run with RESET=1 to rebuild.`);
    process.exit(1);
  }

  d.prepare("INSERT OR IGNORE INTO cohorts(cohort_id,product,strategy_version,created_at,note) VALUES(?,?,?,?,?)")
    .run(COHORT, "both", STRATEGY, now(), "legacy import of the three JSONL stores");

  const gnk = readJsonl("leads-gnk.jsonl").map((r) => toRecord(r, "gnk", "leads-gnk"));
  const ohub = readJsonl("leads-outagehub.jsonl").map((r) => toRecord(r, "outagehub", "leads-outagehub"));
  const legacy = readJsonl("leads.jsonl").map((r) => toRecord(r, "unknown", "leads.jsonl"));

  const authoritative = [...gnk, ...ohub];
  const byId = new Map(authoritative.map((r) => [r.id, r]));
  const strongIndex = new Map(); // strong identity_key -> record
  const weakIndex = new Map(); // weak identity_key -> [records]
  for (const r of authoritative) {
    if (r.identity_confidence === "strong") strongIndex.set(r.identity_key, r);
    else { const a = weakIndex.get(r.identity_key) || []; a.push(r); weakIndex.set(r.identity_key, a); }
  }

  const conflicts = [];
  const report = { generated_at: now(), strong_merges: 0, weak_review_flags: 0, legacy_orphans: 0, contact_evidence_missing: 0, conflicts: 0 };

  // Fold legacy rows: strong -> merge; weak -> flag for review; none -> orphan lead.
  for (const lg of legacy) {
    if (byId.has(lg.id)) { // same id in a split file: strong provenance, backfill non-identity
      mergeInto(byId.get(lg.id), lg, conflicts, "leads.jsonl");
      report.strong_merges++;
      continue;
    }
    if (lg.identity_confidence === "strong" && strongIndex.has(lg.identity_key)) {
      mergeInto(strongIndex.get(lg.identity_key), lg, conflicts, "leads.jsonl");
      report.strong_merges++;
      continue;
    }
    const weakMatch = weakIndex.get(lg.identity_key);
    if (weakMatch && weakMatch.length) {
      for (const w of weakMatch) {
        w.needs_review = 1;
        w.review_reasons.push({ reason: "weak_identity_merge_candidate", candidate_id: lg.id, key: lg.identity_key });
      }
      report.weak_review_flags++;
      continue; // do NOT merge weak identities automatically
    }
    // No match anywhere: keep as its own lead, flagged.
    lg.needs_review = 1;
    lg.review_reasons.push({ reason: "legacy_orphan_unknown_product" });
    authoritative.push(lg);
    report.legacy_orphans++;
  }

  // Detect duplicate identities WITHIN the authoritative set (same strong key twice).
  const seenStrong = new Map();
  for (const r of authoritative) {
    if (r.identity_confidence !== "strong") continue;
    if (seenStrong.has(r.identity_key)) {
      r.needs_review = 1;
      r.review_reasons.push({ reason: "duplicate_strong_identity", other_id: seenStrong.get(r.identity_key) });
    } else seenStrong.set(r.identity_key, r.id);
  }

  // Insert everything in one transaction, then apply contact_evidence_missing events.
  tx((database) => {
    const stmt = database.prepare(`INSERT INTO leads
      (id,product,cohort_id,pipeline_run_id,strategy_version,company,company_domain,name,title,linkedin_url,
       identity_key,identity_confidence,email_best,email_status,address_found_or_guessed,email_source_type,email_source_url,
       deliverability_status,deliverability_checked_at,recipient_jurisdiction,legal_basis,legal_basis_evidence,role_relevance_note,
       do_not_contact,unsubscribed_at,stage,suppressed,needs_review,review_reasons,source_stores,research,created_at,updated_at)
      VALUES (@id,@product,@cohort_id,@pipeline_run_id,@strategy_version,@company,@company_domain,@name,@title,@linkedin_url,
       @identity_key,@identity_confidence,@email_best,@email_status,@address_found_or_guessed,@email_source_type,@email_source_url,
       @deliverability_status,@deliverability_checked_at,@recipient_jurisdiction,@legal_basis,@legal_basis_evidence,@role_relevance_note,
       @do_not_contact,@unsubscribed_at,@stage,@suppressed,@needs_review,@review_reasons,@source_stores,@research,@created_at,@updated_at)`);
    for (const r of authoritative) {
      assertLineage(r);
      stmt.run({
        id: r.id, product: r.product, cohort_id: r.cohort_id, pipeline_run_id: r.pipeline_run_id,
        strategy_version: r.strategy_version, company: r.company, company_domain: r.company_domain,
        name: r.name, title: r.title, linkedin_url: r.linkedin_url, identity_key: r.identity_key,
        identity_confidence: r.identity_confidence, email_best: r.email_best, email_status: r.email_status,
        address_found_or_guessed: r.address_found_or_guessed, email_source_type: r.email_source_type,
        email_source_url: r.email_source_url, deliverability_status: r.deliverability_status,
        deliverability_checked_at: r.deliverability_checked_at, recipient_jurisdiction: r.recipient_jurisdiction,
        legal_basis: r.legal_basis, legal_basis_evidence: null, role_relevance_note: r.role_relevance_note,
        do_not_contact: r.do_not_contact, unsubscribed_at: r.unsubscribed_at, stage: r.stage,
        suppressed: r.suppressed, needs_review: r.needs_review,
        review_reasons: JSON.stringify(r.review_reasons), source_stores: JSON.stringify(r.source_stores),
        research: JSON.stringify(r.research), created_at: r.research?.created_at || now(), updated_at: now(),
      });
    }
    for (const c of conflicts) {
      database.prepare(`INSERT INTO merge_conflicts(lead_id,field,kept,discarded,from_store,identity_critical,resolved,created_at)
        VALUES(?,?,?,?,?,?,0,?)`).run(c.lead_id, c.field, str(c.kept), str(c.discarded), c.from_store, c.identity_critical ? 1 : 0, now());
    }
    report.conflicts = conflicts.length;
  });

  // Apply immutable contact_evidence_missing events for legacy 'contacted' rows.
  for (const r of authoritative) {
    if (r._legacy_stage === "contacted") {
      recordEvent(d, r.id, "contact_evidence_missing", {
        source: "migration",
        payload: { note: "legacy stage was 'contacted' but no sent event exists; reconcile against sent mailbox before any resend" },
        dedupe_key: `evmiss:${r.id}`,
      });
      report.contact_evidence_missing++;
    }
  }

  fs.writeFileSync(path.join(DATA, "crm-migration-report.json"), JSON.stringify(report, null, 2));
  const stages = d.prepare("SELECT stage, COUNT(*) n FROM leads GROUP BY stage").all();
  const rev = d.prepare("SELECT COUNT(*) n FROM leads WHERE needs_review=1").get().n;
  console.log(`leads: ${d.prepare("SELECT COUNT(*) n FROM leads").get().n} | needs_review: ${rev}`);
  console.log(`stages: ${JSON.stringify(Object.fromEntries(stages.map((s) => [s.stage, s.n])))}`);
  console.log(`strong_merges: ${report.strong_merges} | weak_review_flags: ${report.weak_review_flags} | legacy_orphans: ${report.legacy_orphans}`);
  console.log(`contact_evidence_missing events: ${report.contact_evidence_missing} | identity-critical conflicts: ${conflicts.filter((c) => c.identity_critical).length}/${conflicts.length}`);
  console.log(`report: data/crm-migration-report.json`);
}

function mergeInto(target, src, conflicts, store) {
  if (!target.source_stores.includes(store)) target.source_stores.push(store);
  for (const [k, v] of Object.entries(src)) {
    if (["id", "product", "identity_key", "identity_confidence", "source_stores", "review_reasons", "research", "_legacy_stage"].includes(k)) continue;
    if (isEmpty(target[k]) && !isEmpty(v)) target[k] = v;
    else if (!isEmpty(target[k]) && !isEmpty(v) && str(target[k]) !== str(v)) {
      conflicts.push({ lead_id: target.id, field: k, kept: target[k], discarded: v, from_store: store, identity_critical: IDENTITY_FIELDS.includes(k) });
      if (IDENTITY_FIELDS.includes(k)) { target.needs_review = 1; target.review_reasons.push({ reason: "identity_conflict", field: k }); }
    }
  }
  // Backfill research blob from legacy where missing.
  for (const [k, v] of Object.entries(src.research || {})) if (isEmpty(target.research[k]) && !isEmpty(v)) target.research[k] = v;
}
const str = (v) => (typeof v === "string" ? v : JSON.stringify(v));

main();
