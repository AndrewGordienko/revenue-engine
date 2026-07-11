// Proves the PR#6 keystone adapter turns a REAL reviewer artifact into
// pending-approval queue records — fail-closed, evidence-carrying, draft-only.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "promote-"));
process.env.CRM_DB_PATH = path.join(temp, "promote.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");
process.env.SENDER_UNSUBSCRIBE_READY = "1";
process.env.REVENUE_EVENT_SKIP_ONTOLOGY = "1";

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { listOutreachMessages } = await import("./outreach-queue.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { promoteReviewerArtifact, matchLead, normalizeReadiness } = await import("./promote-sequences.js");

const REVIEWER = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "artifacts", "gnk-email-sequence-reviewer-full.json"), "utf8"));
const SEQS = REVIEWER.improved_person_email_sequences || [];

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

test("readiness is only 'ready' when the reviewer says ready AND the touch is grounded", () => {
  assert.equal(normalizeReadiness("ready", true), "ready");
  assert.equal(normalizeReadiness("ready", false), "needs_human_review"); // ungrounded ready is downgraded
  assert.equal(normalizeReadiness("needs_human_review", true), "needs_human_review");
});

test("a real sequence whose lead carries a play_id and a contact is queued end to end", async () => {
  const database = db();
  const seq = SEQS[0]; // Trigger.dev / Eric Allam — a real reviewed sequence
  // Seed the lead exactly as cohort:build would, carrying the play_id + a verified contact.
  await upsertLeads([{
    name: seq.person_name, title: seq.title, company: seq.company, company_domain: "trigger.dev",
    play_id: "GNK-BE-01", email_best: "eric@trigger.dev", email_status: "found", verified: true,
    address_found_or_guessed: "verified", source_url: "https://trigger.dev",
  }], "gnk", { cohort_id: "gnk-be-01-test", play_id: "GNK-BE-01", strategy_version: STRATEGY_VERSION, stage: "test" });

  const matched = matchLead(database, "gnk", seq);
  assert.ok(matched, "adapter must resolve the lead from the CRM");
  assert.equal(matched.play_id, "GNK-BE-01", "play_id comes from the lead, not the reviewer artifact");

  const summary = promoteReviewerArtifact({ improved_person_email_sequences: [seq] }, "gnk", database);
  assert.equal(summary.accounts_queued, 1);
  assert.equal(summary.messages_queued, seq.emails.length);

  const msgs = listOutreachMessages({ lead_id: matched.id }, database);
  assert.equal(msgs.length, seq.emails.length, "one queued message per touch");
  assert.ok(msgs.every((m) => m.status === "pending_approval"), "every message is pending_approval — nothing approved");
  assert.ok(msgs.every((m) => m.recipient === "eric@trigger.dev"), "recipient is the canonical verified contact");
  assert.ok(msgs.every((m) => m.subject && m.body), "every message has a subject and body");
  const withEvidence = msgs.filter((m) => JSON.parse(m.evidence || "[]").length > 0);
  assert.ok(withEvidence.length > 0, "grounded touches carry their evidence");
});

test("fail-closed: sequences with no matching lead, no play, or no contact are skipped WITH a reason", () => {
  const database = db();
  const summary = promoteReviewerArtifact(REVIEWER, "gnk", database);
  assert.equal(summary.sequences, SEQS.length);
  assert.ok(summary.skipped > 0, "unmatched real sequences are skipped, not dropped silently");
  assert.ok(Object.keys(summary.skipped_reasons).includes("no_matching_lead"));
  const accounted = summary.results.every((r) => r.status === "queued" || (r.status === "skipped" && r.reason));
  assert.ok(accounted, "every sequence has an explicit outcome");
});

test("no play, no queue: a lead without a play_id blocks its own sequence", async () => {
  const database = db();
  const seq = SEQS.find((s) => s.company === "Tide") || SEQS[3];
  await upsertLeads([{
    name: seq.person_name, title: seq.title, company: seq.company, company_domain: "tide.co",
    email_best: "buyer@tide.co", email_status: "found", verified: true, address_found_or_guessed: "verified",
    source_url: "https://tide.co", // NOTE: no play_id.
  }], "gnk", { cohort_id: "gnk-triage-test", strategy_version: STRATEGY_VERSION, stage: "test" });
  const summary = promoteReviewerArtifact({ improved_person_email_sequences: [seq] }, "gnk", database);
  assert.equal(summary.accounts_queued, 0);
  assert.equal(summary.results[0].reason, "lead_has_no_play");
});

test("draft-only invariant: promotion never approves, drafts, or sends", () => {
  const database = db();
  const all = listOutreachMessages({}, database);
  assert.ok(all.length > 0);
  assert.ok(all.every((m) => m.status === "pending_approval"), "promotion only ever produces pending_approval");
  const events = database.prepare("SELECT COUNT(*) n FROM activity_events WHERE type='sent'").get().n;
  assert.equal(events, 0, "zero sent events");
});
