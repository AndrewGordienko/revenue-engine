// Manifest + cohort scoping for the MANUAL live-agent smoke. The live run must
// operate on exactly six operator-chosen accounts (3 per brand, one per active
// play) — never the whole shared CRM. This module validates the manifest, seeds
// an isolated per-brand cohort group, and provides the fail-closed guard so
// lead:prepare cannot run un-scoped in live-smoke mode.
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { upsertLeads } from "./leads-store.js";
import { STRATEGY_VERSION } from "./sales-plays.js";

export const ACTIVE_PLAYS = {
  gnk: ["GNK-AI-01", "GNK-BE-01", "GNK-DATA-01"],
  outagehub: ["OHUB-ISP-01", "OHUB-EMBED-01", "OHUB-FAC-01"],
};

// Accepted RAW product values in a manifest. Anything else is rejected outright
// (never silently coerced to a brand).
const RAW_PRODUCTS = new Set(["gnk", "outagehub", "ohub"]);
const normalizeProduct = (p) => (p === "ohub" || p === "outagehub" ? "outagehub" : "gnk");
// Brand of a RAW product value, or null when the value is not a valid product.
const brandOf = (raw) => (raw === "gnk" ? "gnk" : raw === "outagehub" || raw === "ohub" ? "outagehub" : null);

export function cohortGroupFor(product) {
  return `${normalizeProduct(product)}-live-smoke`;
}
export function cohortIdFor(account) {
  return `${cohortGroupFor(account.product)}-${account.play_id.toLowerCase()}`;
}
export function manifestPath() {
  return path.join(process.cwd(), "data", "inputs", "live-smoke-accounts.json");
}

export function loadManifest(file = manifestPath()) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw : raw.accounts || [];
}

// Rules: exactly three accounts per brand, exactly one per active play, each with
// an explicit company domain and proposed buyer. Returns { ok, problems }.
export function validateManifest(accounts) {
  const problems = [];
  if (!Array.isArray(accounts)) return { ok: false, problems: ["manifest must be an array of accounts"] };
  const domains = new Set();
  for (const [i, a] of accounts.entries()) {
    const where = a.company || a.domain || `#${i}`;
    if (!a.company) problems.push(`${where}: missing company`);
    if (!a.domain) problems.push(`${where}: missing company domain`);
    if (!a.buyer) problems.push(`${where}: missing proposed buyer`);
    // Reject the RAW product value first — never coerce an unknown value to a brand.
    const brand = brandOf(a.product);
    if (!RAW_PRODUCTS.has(a.product) || !brand) problems.push(`${where}: invalid product ${a.product} (use gnk | outagehub | ohub)`);
    else if (!ACTIVE_PLAYS[brand].includes(a.play_id)) problems.push(`${where}: play ${a.play_id} is not an active ${brand} play`);
    if (a.domain) { if (domains.has(a.domain)) problems.push(`${where}: duplicate domain ${a.domain}`); domains.add(a.domain); }
  }
  for (const [product, plays] of Object.entries(ACTIVE_PLAYS)) {
    const forBrand = accounts.filter((a) => brandOf(a.product) === product);
    if (forBrand.length !== 3) problems.push(`${product}: expected exactly 3 accounts, got ${forBrand.length}`);
    for (const play of plays) {
      const n = forBrand.filter((a) => a.play_id === play).length;
      if (n !== 1) problems.push(`${product}: expected exactly one account for ${play}, got ${n}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// Fail-closed guard. In live-smoke mode, a cohort-scoped pipeline (lead:prepare)
// must be given an explicit --cohort, or it would run over the whole shared CRM.
const COHORT_SCOPED_PIPELINES = new Set(["cohort:build", "lead:prepare", "full"]);
export function requireCohortForLiveSmoke(pipeline, cohort, liveMode) {
  if (liveMode && COHORT_SCOPED_PIPELINES.has(pipeline) && !cohort) {
    throw new Error(`live-smoke mode: ${pipeline} requires --cohort <id> (e.g. --cohort gnk-live-smoke) so it only touches the manifest accounts`);
  }
}

export function isLiveSmokeMode(env = process.env) {
  return env.LIVE_SMOKE === "1" || fs.existsSync(manifestPath());
}

// Self-heal: a live-smoke cohort group may still hold leads from a SUPERSEDED
// manifest (e.g. an account that was reassigned to another play or dropped). Those
// stale leads would leak into the scoped run and trip assertManifestScope. Retire
// them by moving them OUT of the live-smoke namespace into a 'retired-' cohort —
// never deleted, never touching non-live-smoke (e.g. legacy-import) leads. Returns
// what was retired so the orchestrator can report it.
export function retireStaleLiveSmoke(database, accounts) {
  const now = () => new Date().toISOString();
  const allowedByGroup = new Map();
  for (const a of accounts) {
    const group = cohortGroupFor(a.product);
    if (!allowedByGroup.has(group)) allowedByGroup.set(group, new Set());
    allowedByGroup.get(group).add(a.domain);
  }
  const retired = [];
  for (const [group, allowed] of allowedByGroup) {
    const rows = database.prepare("SELECT id, company_domain, cohort_id FROM leads WHERE cohort_id LIKE ?").all(`${group}%`);
    for (const row of rows) {
      if (allowed.has(row.company_domain) || row.cohort_id.startsWith("retired-")) continue;
      const retiredCohort = `retired-${row.cohort_id}`;
      database.prepare(`INSERT OR IGNORE INTO cohorts(cohort_id,product,strategy_version,play_id,status,created_at,note)
        SELECT ?,product,strategy_version,play_id,'retired',?, 'retired stale live-smoke lead (not in current manifest)' FROM cohorts WHERE cohort_id=?`)
        .run(retiredCohort, now(), row.cohort_id);
      database.prepare("UPDATE leads SET cohort_id=?, updated_at=? WHERE id=?").run(retiredCohort, now(), row.id);
      retired.push({ domain: row.company_domain, from: row.cohort_id, to: retiredCohort });
    }
  }
  return retired;
}

export async function initLiveSmoke(accounts, database = db()) {
  const { ok, problems } = validateManifest(accounts);
  if (!ok) throw new Error(`invalid live-smoke manifest:\n- ${problems.join("\n- ")}`);
  // Reconcile the live-smoke namespace to exactly the current manifest first.
  const retired = retireStaleLiveSmoke(database, accounts);
  const seeded = [];
  for (const account of accounts) {
    const product = normalizeProduct(account.product);
    const cohortId = cohortIdFor({ ...account, product });
    // Seed as an UNVERIFIED target: the live agents do the real research/verification.
    // Cohorts stay draft; the operator approves them in the dashboard.
    await upsertLeads([{
      name: account.buyer, title: account.buyer_title || account.buyer, company: account.company, company_domain: account.domain,
      product, play_id: account.play_id, email_best: account.email || "", email_status: account.email ? "provided" : "unknown",
      source_url: account.trigger_source || `https://${account.domain}`, why_this_person: account.buyer, trigger_event: account.trigger || "",
    }], product, { cohort_id: cohortId, play_id: account.play_id, strategy_version: STRATEGY_VERSION, stage: "live-smoke", note: `live-smoke ${account.play_id}` });
    seeded.push({ company: account.company, domain: account.domain, product, play_id: account.play_id, cohort_id: cohortId });
  }
  return { seeded, retired, groups: [...new Set(seeded.map((s) => cohortGroupFor(s.product)))] };
}

// A live-smoke cohort group must contain ONLY manifest accounts — no pre-existing
// CRM lead may leak into the scoped cohorts (and thus into the approval queue).
export function assertManifestScope(database, group, accounts) {
  const allowed = new Set(accounts.map((a) => a.domain));
  const leaked = database.prepare("SELECT DISTINCT company_domain FROM leads WHERE cohort_id LIKE ?").all(`${group}%`)
    .map((r) => r.company_domain).filter((d) => !allowed.has(d));
  return { ok: leaked.length === 0, leaked };
}

// --- live-scope helpers used by run-agent to limit the agent's lead context ----
export function liveScopePrefix(env = process.env) {
  return env.SMOKE_LIVE_COHORT || null;
}
export function filterLeadsToScope(leads, env = process.env) {
  const prefix = liveScopePrefix(env);
  if (!prefix) return leads;
  return leads.filter((l) => String(l.cohort_id || "").startsWith(prefix));
}
export function buildLiveScopeBlock(leads, env = process.env) {
  const prefix = liveScopePrefix(env);
  if (!prefix) return "";
  const scoped = filterLeadsToScope(leads, env);
  const companies = [...new Set(scoped.map((l) => l.company).filter(Boolean))];
  return [
    "",
    `LIVE-SMOKE SCOPE (${prefix}): operate ONLY on these ${companies.length} manifest accounts. Do not introduce, research, or return any company outside this list.`,
    JSON.stringify({ allowed_companies: companies }, null, 2),
  ].join("\n");
}
