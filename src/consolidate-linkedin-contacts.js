import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { identity } from "./crm-model.js";
import { fromRoot } from "./paths.js";

const PROFILE_IMPORT = fromRoot("data", "inputs", "linkedin-profile-overrides.json");
const MORROW_IMPORT = fromRoot("data", "inputs", "morrow-linkedin-contacts.json");
const DIRECT_PROFILE = /^https:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[a-z0-9%_-]+\/?$/i;
const RELATED_TABLES = ["activity_events", "outreach_messages", "opportunities", "meetings", "contracts"];

function json(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function nonempty(value) {
  return value != null && value !== "";
}

function relationCount(database, leadId) {
  return RELATED_TABLES.reduce((total, table) => (
    total + database.prepare(`SELECT COUNT(*) n FROM ${table} WHERE lead_id=?`).get(leadId).n
  ), 0);
}

function richness(row) {
  const useful = ["linkedin_url", "email_best", "company_domain", "title", "role_relevance_note", "play_id", "score"];
  return useful.reduce((score, field) => score + (nonempty(row[field]) ? 1 : 0), 0)
    + Object.keys(json(row.research, {})).length / 100;
}

function mergeIntoPrimary(database, primary, duplicate) {
  const primaryResearch = json(primary.research, {});
  const duplicateResearch = json(duplicate.research, {});
  const research = {
    ...duplicateResearch,
    ...primaryResearch,
    consolidation_alias_ids: [
      ...(primaryResearch.consolidation_alias_ids || []),
      duplicate.id,
    ],
  };
  const sourceStores = [...new Set([
    ...json(primary.source_stores, []),
    ...json(duplicate.source_stores, []),
    "crm-contact-consolidation",
  ])];
  const reviewReasons = [...new Set([
    ...json(primary.review_reasons, []),
    ...json(duplicate.review_reasons, []),
  ])];
  const fillable = [
    "company_domain", "linkedin_url", "email_best", "email_status",
    "address_found_or_guessed", "email_source_type", "email_source_url",
    "deliverability_status", "deliverability_checked_at", "recipient_jurisdiction",
    "legal_basis", "legal_basis_evidence", "role_relevance_note", "play_id", "score",
    "score_breakdown",
  ];
  const merged = { ...primary };
  for (const field of fillable) {
    if (!nonempty(merged[field]) && nonempty(duplicate[field])) merged[field] = duplicate[field];
  }
  merged.do_not_contact = primary.do_not_contact || duplicate.do_not_contact ? 1 : 0;
  merged.suppressed = primary.suppressed || duplicate.suppressed ? 1 : 0;
  merged.needs_review = primary.needs_review || duplicate.needs_review ? 1 : 0;
  merged.unsubscribed_at = primary.unsubscribed_at || duplicate.unsubscribed_at || null;
  merged.created_at = primary.created_at < duplicate.created_at ? primary.created_at : duplicate.created_at;
  merged.updated_at = new Date().toISOString();
  const ident = identity(merged);

  database.prepare(`UPDATE leads SET
    company_domain=@company_domain, linkedin_url=@linkedin_url, identity_key=@identity_key,
    identity_confidence=@identity_confidence, email_best=@email_best, email_status=@email_status,
    address_found_or_guessed=@address_found_or_guessed, email_source_type=@email_source_type,
    email_source_url=@email_source_url, deliverability_status=@deliverability_status,
    deliverability_checked_at=@deliverability_checked_at, recipient_jurisdiction=@recipient_jurisdiction,
    legal_basis=@legal_basis, legal_basis_evidence=@legal_basis_evidence,
    role_relevance_note=@role_relevance_note, do_not_contact=@do_not_contact,
    unsubscribed_at=@unsubscribed_at, suppressed=@suppressed, needs_review=@needs_review,
    review_reasons=@review_reasons, source_stores=@source_stores, research=@research,
    play_id=@play_id, score=@score, score_breakdown=@score_breakdown,
    created_at=@created_at, updated_at=@updated_at
    WHERE id=@id`).run({
    id: merged.id,
    company_domain: merged.company_domain,
    linkedin_url: merged.linkedin_url,
    identity_key: ident.key,
    identity_confidence: ident.confidence,
    email_best: merged.email_best,
    email_status: merged.email_status,
    address_found_or_guessed: merged.address_found_or_guessed,
    email_source_type: merged.email_source_type,
    email_source_url: merged.email_source_url,
    deliverability_status: merged.deliverability_status,
    deliverability_checked_at: merged.deliverability_checked_at,
    recipient_jurisdiction: merged.recipient_jurisdiction,
    legal_basis: merged.legal_basis,
    legal_basis_evidence: merged.legal_basis_evidence,
    role_relevance_note: merged.role_relevance_note,
    do_not_contact: merged.do_not_contact,
    unsubscribed_at: merged.unsubscribed_at,
    suppressed: merged.suppressed,
    needs_review: merged.needs_review,
    review_reasons: JSON.stringify(reviewReasons),
    source_stores: JSON.stringify(sourceStores),
    research: JSON.stringify(research),
    play_id: merged.play_id,
    score: merged.score,
    score_breakdown: merged.score_breakdown,
    created_at: merged.created_at,
    updated_at: merged.updated_at,
  });
  database.prepare("UPDATE merge_conflicts SET lead_id=? WHERE lead_id=?").run(primary.id, duplicate.id);
  database.prepare("DELETE FROM leads WHERE id=?").run(duplicate.id);
}

export function dedupeNamedContacts(database) {
  const groups = database.prepare(`SELECT product, lower(trim(name)) name_key, lower(trim(company)) company_key
    FROM leads
    WHERE trim(coalesce(name,''))<>'' AND trim(coalesce(company,''))<>''
    GROUP BY product,name_key,company_key HAVING COUNT(*)>1`).all();
  const result = { groups: groups.length, removed: 0, skipped: [] };

  for (const group of groups) {
    const rows = database.prepare(`SELECT * FROM leads
      WHERE product=? AND lower(trim(name))=? AND lower(trim(company))=?`).all(
      group.product, group.name_key, group.company_key,
    ).map((row) => ({ ...row, related: relationCount(database, row.id) }));
    rows.sort((a, b) => b.related - a.related || richness(b) - richness(a) || a.created_at.localeCompare(b.created_at));
    const primary = rows[0];
    for (const duplicate of rows.slice(1)) {
      if (duplicate.related) {
        result.skipped.push({ primary: primary.id, duplicate: duplicate.id, reason: "duplicate_has_related_history" });
        continue;
      }
      mergeIntoPrimary(database, primary, duplicate);
      result.removed++;
    }
  }
  return result;
}

function syncProfile(database, { product, name, company, profile_url, rank, verified_at, source_url, title, role_confidence, why_this_person, match_name = true }) {
  if (!DIRECT_PROFILE.test(profile_url || "")) throw new Error(`Invalid LinkedIn profile for ${name} at ${company}`);
  const rows = database.prepare(`SELECT * FROM leads
    WHERE product=? AND lower(trim(company))=lower(trim(?))
      AND (?=0 OR lower(trim(name))=lower(trim(?)))
    ORDER BY created_at`).all(product, company, match_name ? 1 : 0, name);
  if (rows.length !== 1) throw new Error(`Expected one ${product} CRM row for ${name || "contact"} at ${company}; found ${rows.length}`);
  const row = rows[0];
  const research = json(row.research, {});
  if (row.name !== name && row.name) research.target_role = row.name;
  research.linkedin_rank = rank;
  research.linkedin_verified_at = verified_at;
  research.linkedin_source_url = source_url || profile_url;
  research.linkedin_role_confidence = role_confidence || "verified";
  research.contact_status = "verified_profile";
  if (why_this_person) research.why_this_person = why_this_person;
  const next = { ...row, name, title: title || row.title, linkedin_url: profile_url };
  const ident = identity(next);
  database.prepare(`UPDATE leads SET name=?,title=?,linkedin_url=?,identity_key=?,identity_confidence=?,
    research=?,source_stores=?,updated_at=? WHERE id=?`).run(
    next.name,
    next.title,
    profile_url,
    ident.key,
    ident.confidence,
    JSON.stringify(research),
    JSON.stringify([...new Set([...json(row.source_stores, []), "linkedin-contact-import"])]),
    new Date().toISOString(),
    row.id,
  );
  return row.id;
}

export function consolidateLinkedinContacts(database, { profiles, morrowContacts }) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const dedupe = dedupeNamedContacts(database);
    const synced = { gnk: 0, outagehub: 0, morrow: 0 };
    for (const product of ["gnk", "outagehub"]) {
      for (const [index, profile] of (profiles[product] || []).entries()) {
        syncProfile(database, {
          product,
          ...profile,
          rank: index + 1,
          verified_at: profiles.verified_at,
          source_url: profile.profile_url,
          role_confidence: "verified",
        });
        synced[product]++;
      }
    }
    for (const [index, contact] of (morrowContacts.contacts || []).entries()) {
      syncProfile(database, {
        product: "morrow",
        ...contact,
        rank: index + 1,
        verified_at: morrowContacts.verified_at,
        match_name: false,
      });
      synced.morrow++;
    }
    const at = new Date().toISOString();
    database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_contacts_consolidated_at',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(at);
    database.exec("COMMIT");
    return { at, dedupe, synced };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function main() {
  const [profiles, morrowContacts] = await Promise.all([
    fs.readFile(PROFILE_IMPORT, "utf8").then(JSON.parse),
    fs.readFile(MORROW_IMPORT, "utf8").then(JSON.parse),
  ]);
  const result = consolidateLinkedinContacts(db(), { profiles, morrowContacts });
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
