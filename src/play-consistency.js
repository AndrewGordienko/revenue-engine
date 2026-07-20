// play-consistency.js — fail-closed play reconciliation between the live manifest
// and the existing CRM, run BEFORE any live agent executes.
//
// Rules enforced:
//  1. A manifest play that conflicts with the lead's existing CRM play FAILS
//     CLOSED — the live run stops before agents burn tokens on the wrong play.
//  2. Changing an existing play requires an EXPLICIT, evidence-backed operator
//     decision in data/inputs/play-decisions.json (from_play -> to_play). A
//     decision records the reasoning; it is not a switch to make numbers agree.
//  3. Every manifest play must be a real, known play id.
//  4. All accounts are validated together so a single unresolved conflict blocks
//     the whole run.
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { PLAYS_BY_ID } from "./sales-plays.js";
import { loadManifest } from "./smoke-live.js";
import { normalizeProduct } from "./lineage.js";

export function decisionsPath() {
  return path.join(process.cwd(), "data", "inputs", "play-decisions.json");
}

export function loadPlayDecisions(file = decisionsPath()) {
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw : raw.decisions || [];
}

const norm = (v) => String(v || "").toLowerCase().trim();

// An approved decision authorizes exactly one from_play -> to_play change for one
// company/domain. Matching is exact in both directions so a decision cannot be
// reused to wave through a different or reversed change.
function hasApprovedChange(decisions, { company, domain, from_play, to_play }) {
  return decisions.some((d) =>
    (norm(d.domain) === norm(domain) || norm(d.company) === norm(company)) &&
    norm(d.from_play) === norm(from_play) &&
    norm(d.to_play) === norm(to_play) &&
    Boolean(d.rationale) && Boolean(d.decided_by)
  );
}

// Per-account status:
//  ok        manifest play == CRM play (or the play was already reconciled)
//  new       no CRM lead yet — manifest is the first assignment
//  resolved  manifest != CRM, but an approved decision authorizes the change
//  unknown_play  manifest play id is not a real play
//  conflict  manifest != CRM and NO approved decision — fails closed
export function checkPlayConsistency(database = db(), manifest = loadManifest(), decisions = loadPlayDecisions()) {
  const accounts = manifest.map((account) => {
    const product = normalizeProduct(account.product);
    const manifestPlay = account.play_id || null;
    const base = { company: account.company, domain: account.domain, product, manifest_play: manifestPlay };

    if (!manifestPlay || !PLAYS_BY_ID[manifestPlay]) {
      return { ...base, crm_plays: [], status: "unknown_play", reason: `manifest play ${manifestPlay || "(none)"} is not a known play` };
    }
    // ALL distinct non-null plays the account carries in the CRM — an account may
    // have several leads (e.g. a legacy import that sourced it under >1 play). Every
    // one that differs from the manifest must be individually reconciled.
    const crmPlays = database.prepare("SELECT DISTINCT play_id FROM leads WHERE company_domain=? AND product=? AND play_id IS NOT NULL")
      .all(account.domain, product).map((r) => r.play_id);

    if (!crmPlays.length) return { ...base, crm_plays: [], status: "new", reason: "no existing CRM play — first assignment" };

    const differing = crmPlays.filter((p) => p !== manifestPlay);
    if (!differing.length) return { ...base, crm_plays: crmPlays, status: "ok", reason: null };

    const unresolved = differing.filter((p) => !hasApprovedChange(decisions, { company: account.company, domain: account.domain, from_play: p, to_play: manifestPlay }));
    if (!unresolved.length) {
      return { ...base, crm_plays: crmPlays, status: "resolved", reason: `approved change(s) ${differing.join(",")} -> ${manifestPlay}` };
    }
    return { ...base, crm_plays: crmPlays, status: "conflict", reason: `manifest ${manifestPlay} conflicts with CRM play(s) [${unresolved.join(", ")}] and no approved decision authorizes the change` };
  });

  const blocking = accounts.filter((a) => a.status === "conflict" || a.status === "unknown_play");
  return { ok: blocking.length === 0, accounts, blocking };
}

// Throw a clear, listable error when any account is unresolved. Called by the
// runner before the first agent runs, and by the live-run preflight.
export function assertPlayConsistency(database = db(), manifest = loadManifest(), decisions = loadPlayDecisions()) {
  const result = checkPlayConsistency(database, manifest, decisions);
  if (!result.ok) {
    const lines = result.blocking.map((a) => `  - ${a.company} (${a.domain}): ${a.reason}`);
    throw new Error(
      `play consistency check FAILED CLOSED — ${result.blocking.length} unresolved account(s):\n${lines.join("\n")}\n` +
      `Resolve each from evidence and record an approved decision in data/inputs/play-decisions.json before running the live pipeline.`
    );
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkPlayConsistency();
  for (const a of result.accounts) {
    console.log(`${a.status.padEnd(9)} ${String(a.company).padEnd(16)} manifest=${a.manifest_play || "—"} crm=[${(a.crm_plays || []).join(", ") || "—"}]${a.reason ? `  (${a.reason})` : ""}`);
  }
  console.log(`\nplay consistency: ${result.ok ? "OK — all accounts reconciled" : `FAIL CLOSED — ${result.blocking.length} blocking`}`);
  process.exit(result.ok ? 0 : 1);
}
