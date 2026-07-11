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

const normalizeProduct = (p) => (p === "ohub" || p === "outagehub" ? "outagehub" : "gnk");

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
    const product = normalizeProduct(a.product);
    if (!ACTIVE_PLAYS[product]) problems.push(`${where}: invalid product ${a.product}`);
    else if (!ACTIVE_PLAYS[product].includes(a.play_id)) problems.push(`${where}: play ${a.play_id} is not an active ${product} play`);
    if (a.domain) { if (domains.has(a.domain)) problems.push(`${where}: duplicate domain ${a.domain}`); domains.add(a.domain); }
  }
  for (const [product, plays] of Object.entries(ACTIVE_PLAYS)) {
    const forBrand = accounts.filter((a) => normalizeProduct(a.product) === product);
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
export function requireCohortForLiveSmoke(pipeline, cohort, liveMode) {
  if (liveMode && (pipeline === "lead:prepare" || pipeline === "full") && !cohort) {
    throw new Error(`live-smoke mode: ${pipeline} requires --cohort <id> (e.g. --cohort gnk-live-smoke) so it only touches the manifest accounts`);
  }
}

export function isLiveSmokeMode(env = process.env) {
  return env.LIVE_SMOKE === "1" || fs.existsSync(manifestPath());
}

export async function initLiveSmoke(accounts, database = db()) {
  const { ok, problems } = validateManifest(accounts);
  if (!ok) throw new Error(`invalid live-smoke manifest:\n- ${problems.join("\n- ")}`);
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
  return { seeded, groups: [...new Set(seeded.map((s) => cohortGroupFor(s.product)))] };
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
