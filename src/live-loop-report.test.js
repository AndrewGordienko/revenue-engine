// Proves the FULL six-account manifest path deterministically: seed the six real
// manifest accounts, feed a realistically-shaped reviewer artifact (the only step
// the live LLM run replaces), run the adapter, and confirm the loop-report shows
// six accounts closed with nothing approved or sent. No manual JSON copying.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "liveloop-"));
process.env.CRM_DB_PATH = path.join(temp, "liveloop.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db, _closeForTest } = await import("./db.js");
const { initLiveSmoke } = await import("./smoke-live.js");
const { promoteReviewerArtifact } = await import("./promote-sequences.js");
const { buildLiveLoopReport } = await import("./live-loop-report.js");
const { normalizeProduct } = await import("./lineage.js");

// A self-contained, VALID six-account manifest fixture (one per active play per
// brand, unique domains). Decoupled from the mutable real manifest so the plumbing
// proof stays deterministic regardless of which real accounts are in play.
const MANIFEST = [
  { product: "gnk", play_id: "GNK-AI-01", company: "AlphaAI", domain: "alphaai.example", buyer: "Ada Alpha", buyer_title: "CTO", trigger: "shipped an agent product", trigger_source: "https://alphaai.example/blog" },
  { product: "gnk", play_id: "GNK-BE-01", company: "BetaBackend", domain: "betabackend.example", buyer: "Ben Beta", buyer_title: "VP Engineering", trigger: "public incident and migration", trigger_source: "https://betabackend.example/status" },
  { product: "gnk", play_id: "GNK-DATA-01", company: "GammaOps", domain: "gammaops.example", buyer: "Gita Gamma", buyer_title: "COO", trigger: "manual reconciliation across spreadsheets", trigger_source: "https://gammaops.example/talk" },
  { product: "outagehub", play_id: "OHUB-ISP-01", company: "DeltaISP", domain: "deltaisp.example", buyer: "Dana Delta", buyer_title: "NOC Manager", trigger: "regional fibre expansion", trigger_source: "https://deltaisp.example/careers" },
  { product: "outagehub", play_id: "OHUB-EMBED-01", company: "EpsilonSoft", domain: "epsilonsoft.example", buyer: "Eli Epsilon", buyer_title: "VP Product", trigger: "facilities platform roadmap", trigger_source: "https://epsilonsoft.example/roadmap" },
  { product: "outagehub", play_id: "OHUB-FAC-01", company: "ZetaCold", domain: "zetacold.example", buyer: "Zoe Zeta", buyer_title: "Facilities Director", trigger: "multi-site cold storage escalation gaps", trigger_source: "https://zetacold.example/news" },
];

// Shape a reviewer artifact exactly like the real email-sequence-reviewer output,
// for the six manifest companies. This is the ONLY thing the live LLM run supplies;
// everything downstream (match, play resolution, queueing, report) is real code.
function reviewerArtifactFor(accounts, product) {
  const p = normalizeProduct(product);
  return {
    improved_person_email_sequences: accounts
      .filter((a) => normalizeProduct(a.product) === p)
      .map((a) => ({
        company: a.company, website: `https://${a.domain}`, person_name: a.buyer,
        title: a.buyer_title, email_address: `buyer@${a.domain}`, email_address_status: "found",
        send_readiness: "needs_human_review", review_score: 82,
        emails: [1, 2].map((n) => ({
          touch_number: n, touch_key: `touch_${n}`, send_day: `Day ${n}`,
          recommended_subject: `${a.company}: ${a.trigger.slice(0, 40)}`,
          body: `Hi ${a.buyer.split(" ")[0]},\n\nI saw ${a.trigger}.\n\nAndrew`,
          grounding_used: [a.trigger_source],
        })),
      })),
  };
}

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

test("six manifest accounts flow artifact -> CRM -> approval queue with no manual step", async () => {
  const database = db();
  // 1. Seed the six real manifest accounts (as run-pipeline's live-smoke seed does).
  const { seeded } = await initLiveSmoke(MANIFEST, database);
  assert.equal(seeded.length, 6);

  // 2. Promote the (LLM-produced) reviewed sequences per brand — the real adapter.
  const state = { artifacts: {} };
  for (const product of ["gnk", "outagehub"]) {
    const artifact = reviewerArtifactFor(MANIFEST, product);
    state.artifacts[`${product}-email-sequence-reviewer`] = artifact;
    const summary = promoteReviewerArtifact(artifact, product, database);
    assert.equal(summary.accounts_queued, 3, `${product}: three accounts queued`);
    assert.equal(summary.messages_queued, 6, `${product}: two touches x three accounts`);
  }

  // 3. The proof report reflects the loop_complete state, draft-only. loop_complete
  // means the automated prep reached the human-approval gate — NOT a closed/won deal.
  const report = await buildLiveLoopReport(database, MANIFEST, state);
  assert.equal(report.verdict.of, 6);
  assert.equal(report.verdict.loop_complete_accounts, 6, "all six accounts reached the approval gate via the adapter");
  assert.equal(report.verdict.won_accounts, 0, "nothing is won — no signed contracts");
  assert.equal(report.verdict.draft_only_intact, true, "nothing approved or sent");
  assert.equal(report.totals.leads_present, 6);
  assert.equal(report.totals.with_play, 6, "every account carries its manifest play");
  assert.equal(report.totals.pending_approval, 12);
  assert.equal(report.totals.approved, 0);
  assert.equal(report.totals.sent, 0);
  // Every account is at the pending_approval stage — no triage leakage, none "won".
  assert.ok(report.accounts.every((r) => r.play_assigned && r.stage === "pending_approval"));
});
