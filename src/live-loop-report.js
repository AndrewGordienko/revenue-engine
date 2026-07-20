// live-loop-report.js — the "prove it" instrument for the six-account real loop.
//
// Given the live-smoke manifest (six operator-chosen real accounts), report where
// each one actually stands in the canonical CRM: lead present, play assigned,
// dossier + reviewed sequence artifact, queued touches, and its lifecycle stage.
// Reporting uses the loop-status vocabulary — "loop_complete" means the automated
// prep loop reached the human-approval gate; it is NOT a closed/won deal.
import { db } from "./db.js";
import { readState } from "./bus.js";
import { getLead, sendEligibility } from "./crm-model.js";
import { getCohort } from "./lineage.js";
import { loadManifest, cohortIdFor } from "./smoke-live.js";
import { checkPlayConsistency } from "./play-consistency.js";
import { accountStage, isLoopComplete, cohortApprovalStatus, STAGES as STAGE_ORDER } from "./loop-status.js";
import { normalizeProduct } from "./lineage.js";

const norm = (v) => String(v || "").toLowerCase().trim();

// Does any dossier/reviewer artifact in shared state actually reference this
// company? Proves the artifact bus, not a hand-edited file, carried the account.
function artifactMentions(state, product, company) {
  const p = normalizeProduct(product);
  const c = norm(company);
  const dossier = state.artifacts?.[`${p}-client-dossier`]?.company_contact_dossiers || [];
  const reviewer = state.artifacts?.[`${p}-email-sequence-reviewer`]?.improved_person_email_sequences || [];
  return {
    dossier: dossier.some((d) => norm(d.company) === c),
    reviewed_sequence: reviewer.some((s) => norm(s.company) === c),
  };
}

export async function buildLiveLoopReport(database = db(), manifest = loadManifest(), injectedState = null) {
  const state = injectedState || (await readState());
  // Authoritative play reconciliation (the fail-closed gate), keyed by domain, so
  // the report shows ok/resolved/conflict rather than a raw legacy-duplicate play.
  const playStatus = new Map(checkPlayConsistency(database, manifest).accounts.map((a) => [a.domain, a.status]));
  const rows = manifest.map((account) => {
    const product = normalizeProduct(account.product);
    const cohortId = cohortIdFor({ ...account, product });
    const cohort = getCohort(database, cohortId);
    // Prefer the lead in THIS account's live-smoke cohort so a legacy-import
    // duplicate under a different play doesn't misreport the account's play.
    const leadRow = database.prepare("SELECT id FROM leads WHERE company_domain=? AND product=? AND cohort_id=?").get(account.domain, product, cohortId)
      || database.prepare("SELECT id FROM leads WHERE company_domain=? AND product=? AND play_id=? ORDER BY created_at").get(account.domain, product, account.play_id)
      || database.prepare("SELECT id FROM leads WHERE company_domain=? AND product=? ORDER BY created_at").get(account.domain, product);
    const lead = leadRow ? getLead(database, leadRow.id) : null;
    const messages = lead
      ? database.prepare("SELECT status, review_status FROM outreach_messages WHERE lead_id=? AND message_type='sequence_touch'").all(lead.id)
      : [];
    const artifacts = artifactMentions(state, product, account.company);
    const eligibility = lead ? sendEligibility(database, lead, { allow_active_sequence: true }) : { ok: false, blocked: ["no_lead"] };
    const stage = accountStage(database, lead, { reviewedSequence: artifacts.reviewed_sequence });
    return {
      company: account.company, play: account.play_id, product,
      lead_present: Boolean(lead),
      play_assigned: lead?.play_id || null,
      play_status: playStatus.get(account.domain) || "unknown",
      stage,
      loop_complete: isLoopComplete(stage),
      cohort_approval: cohortApprovalStatus(database, lead),
      dossier_artifact: artifacts.dossier,
      reviewed_sequence_artifact: artifacts.reviewed_sequence,
      pending_approval: messages.filter((m) => m.status === "pending_approval").length,
      approved: messages.filter((m) => m.status === "approved").length,
      sent: messages.filter((m) => m.status === "sent" || m.status === "provider_draft").length,
      send_blockers: eligibility.blocked,
    };
  });

  const stageCounts = Object.fromEntries(STAGE_ORDER.map((s) => [s, rows.filter((r) => r.stage === s).length]));
  const totals = {
    accounts: rows.length,
    leads_present: rows.filter((r) => r.lead_present).length,
    with_play: rows.filter((r) => r.play_assigned).length,
    loop_complete: rows.filter((r) => r.loop_complete).length,
    stages: stageCounts,
    pending_approval: rows.reduce((n, r) => n + r.pending_approval, 0),
    approved: rows.reduce((n, r) => n + r.approved, 0),
    sent: rows.reduce((n, r) => n + r.sent, 0),
    won: rows.filter((r) => r.stage === "won").length,
  };
  return {
    generated_at: new Date().toISOString(),
    verdict: {
      // loop_complete = the automated prep loop reached the human-approval gate.
      // NOT a closed/won deal — "won" means a signed contract only.
      loop_complete_accounts: totals.loop_complete,
      of: rows.length,
      draft_only_intact: totals.approved === 0 && totals.sent === 0,
      won_accounts: totals.won,
    },
    totals,
    accounts: rows,
  };
}

function printReport(report) {
  const v = report.verdict;
  console.log(`\nLive-loop status — ${v.loop_complete_accounts}/${v.of} loop_complete (prepared → pending_approval), draft-only ${v.draft_only_intact ? "intact" : "VIOLATED"}, won ${v.won_accounts}\n`);
  const col = (val, n) => String(val ?? "").padEnd(n);
  console.log(col("COMPANY", 16) + col("PLAY", 13) + col("RECON", 10) + col("STAGE", 17) + col("COHORT", 10) + col("PENDING", 9) + col("APPR", 6) + col("SENT", 6));
  for (const r of report.accounts) {
    console.log(
      col(r.company, 16) + col(r.play, 13) + col(r.play_status, 10) + col(r.stage, 17) +
      col(r.cohort_approval, 10) + col(r.pending_approval, 9) + col(r.approved, 6) + col(r.sent, 6)
    );
  }
  console.log(`\nstages: ${JSON.stringify(report.totals.stages)}`);
  console.log(`(loop_complete = automated prep reached the approval gate; won = signed contract only)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildLiveLoopReport()
    .then((report) => {
      if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
      else printReport(report);
    })
    .catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}
