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
const { initLiveSmoke, loadManifest } = await import("./smoke-live.js");
const { promoteReviewerArtifact } = await import("./promote-sequences.js");
const { buildLiveLoopReport } = await import("./live-loop-report.js");
const { normalizeProduct } = await import("./lineage.js");

const MANIFEST = loadManifest(); // the real committed six-account manifest

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

  // 3. The proof report reflects the closed loop, draft-only.
  const report = await buildLiveLoopReport(database, MANIFEST, state);
  assert.equal(report.verdict.of, 6);
  assert.equal(report.verdict.loop_closed_accounts, 6, "all six accounts reached the queue via the adapter");
  assert.equal(report.verdict.draft_only_intact, true, "nothing approved or sent");
  assert.equal(report.totals.leads_present, 6);
  assert.equal(report.totals.with_play, 6, "every account carries its manifest play");
  assert.equal(report.totals.messages_queued, 12);
  assert.equal(report.totals.approved, 0);
  assert.equal(report.totals.sent, 0);
  // Every account has a play and a queued sequence — no triage leakage.
  assert.ok(report.accounts.every((r) => r.play_assigned && r.queued > 0));
});
