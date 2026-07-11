// live-loop-report.js — the "prove it" instrument for the six-account real loop.
//
// Given the live-smoke manifest (six operator-chosen real accounts), report where
// each one actually stands in the canonical CRM: is the lead present, does it carry
// a play, is there a dossier + reviewed sequence artifact for it, how many touches
// are queued for approval, and is anything approved/sent. This is what the operator
// runs after `run-pipeline.js full <product> --cohort <group>` to confirm the loop
// closed with NO manual JSON copying and NO database repair.
import { db } from "./db.js";
import { readState } from "./bus.js";
import { getLead, sendEligibility } from "./crm-model.js";
import { getCohort } from "./lineage.js";
import { loadManifest, cohortIdFor } from "./smoke-live.js";
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
  const rows = manifest.map((account) => {
    const product = normalizeProduct(account.product);
    const cohortId = cohortIdFor({ ...account, product });
    const cohort = getCohort(database, cohortId);
    const leadRow = database.prepare("SELECT id FROM leads WHERE company_domain=? AND product=?").get(account.domain, product);
    const lead = leadRow ? getLead(database, leadRow.id) : null;
    const messages = lead
      ? database.prepare("SELECT status, review_status FROM outreach_messages WHERE lead_id=? AND message_type='sequence_touch'").all(lead.id)
      : [];
    const artifacts = artifactMentions(state, product, account.company);
    const eligibility = lead ? sendEligibility(database, lead, { allow_active_sequence: true }) : { ok: false, blocked: ["no_lead"] };
    return {
      company: account.company, play: account.play_id, product,
      lead_present: Boolean(lead),
      play_assigned: lead?.play_id || null,
      crm_stage: lead?.crm_stage || lead?.stage || null,
      cohort_status: cohort?.status || "missing",
      dossier_artifact: artifacts.dossier,
      reviewed_sequence_artifact: artifacts.reviewed_sequence,
      queued: messages.filter((m) => m.status === "pending_approval").length,
      approved: messages.filter((m) => m.status === "approved").length,
      sent: messages.filter((m) => m.status === "sent" || m.status === "provider_draft").length,
      send_blockers: eligibility.blocked,
    };
  });

  const totals = {
    accounts: rows.length,
    leads_present: rows.filter((r) => r.lead_present).length,
    with_play: rows.filter((r) => r.play_assigned).length,
    with_reviewed_sequence: rows.filter((r) => r.reviewed_sequence_artifact).length,
    messages_queued: rows.reduce((n, r) => n + r.queued, 0),
    approved: rows.reduce((n, r) => n + r.approved, 0),
    sent: rows.reduce((n, r) => n + r.sent, 0),
  };
  // The loop is "closed" for an account when a real reviewed-sequence artifact
  // produced pending-approval messages against a play-assigned lead — with nothing
  // approved or sent (draft-only).
  const closed = rows.filter((r) => r.reviewed_sequence_artifact && r.queued > 0 && r.play_assigned);
  return {
    generated_at: new Date().toISOString(),
    verdict: {
      loop_closed_accounts: closed.length,
      of: rows.length,
      draft_only_intact: totals.approved === 0 && totals.sent === 0,
    },
    totals,
    accounts: rows,
  };
}

function printReport(report) {
  console.log(`\nLive-loop status — ${report.verdict.loop_closed_accounts}/${report.verdict.of} accounts closed, draft-only ${report.verdict.draft_only_intact ? "intact" : "VIOLATED"}\n`);
  const col = (v, n) => String(v ?? "").padEnd(n);
  console.log(col("COMPANY", 16) + col("PLAY", 13) + col("LEAD", 6) + col("PLAY?", 12) + col("DOSSIER", 9) + col("SEQ", 5) + col("QUEUED", 8) + col("APPR", 6) + col("SENT", 6));
  for (const r of report.accounts) {
    console.log(
      col(r.company, 16) + col(r.play, 13) + col(r.lead_present ? "yes" : "—", 6) +
      col(r.play_assigned || "—", 12) + col(r.dossier_artifact ? "yes" : "—", 9) +
      col(r.reviewed_sequence_artifact ? "yes" : "—", 5) + col(r.queued, 8) +
      col(r.approved, 6) + col(r.sent, 6)
    );
  }
  console.log(`\ntotals: ${JSON.stringify(report.totals)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildLiveLoopReport()
    .then((report) => {
      if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
      else printReport(report);
    })
    .catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}
