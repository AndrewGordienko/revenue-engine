// Proves the active_motions invariants + sales state machine FAIL CLOSED: one open
// motion per lead AND per account/play, play must belong to the venture and match the
// lead, cohort venture must match, status only moves along legal transitions, and a
// closed motion frees the account/lead for a new one.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "motions-"));
process.env.CRM_DB_PATH = path.join(temp, "motions.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const {
  openMotion, advanceMotion, closeMotion, touchMotion,
  getMotion, getOpenMotionForLead, listOpenMotions,
  normalizeVenture, accountKey,
} = await import("./active-motions.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

async function seedLead(database, { name, company, domain, product, play_id, cohort_id }) {
  await upsertLeads([{ name, title: "VP Ops", company, company_domain: domain }], product, {
    cohort_id, play_id, strategy_version: STRATEGY_VERSION, stage: "test",
  });
  return database.prepare("SELECT id FROM leads WHERE product=? AND name=?").get(product, name).id;
}

let gnkLead, gnkLeadSameAccount, gnkLead2, morrowLead, m1, morrowMotion;
before(async () => {
  const database = db();
  gnkLead = await seedLead(database, { name: "Ada Founder", company: "Northstar AI", domain: "northstar.ai", product: "gnk", play_id: "GNK-AI-01", cohort_id: "gnk-motions-1" });
  gnkLeadSameAccount = await seedLead(database, { name: "Dex Router", company: "Northstar AI", domain: "northstar.ai", product: "gnk", play_id: "GNK-AI-01", cohort_id: "gnk-motions-1" });
  gnkLead2 = await seedLead(database, { name: "Ben Buyer", company: "Harbour Systems", domain: "harbour.io", product: "gnk", play_id: "GNK-BE-01", cohort_id: "gnk-motions-2" });
  morrowLead = await seedLead(database, { name: "Cara Plant", company: "Highbury Canco", domain: "highburycanco.com", product: "morrow", play_id: "MORROW-COPACK-01", cohort_id: "morrow-motions-1" });
});

test("normalizeVenture accepts the three ventures and rejects anything else", () => {
  assert.equal(normalizeVenture("gnk"), "gnk");
  assert.equal(normalizeVenture("ohub"), "outagehub");
  assert.equal(normalizeVenture("morrow"), "morrow");
  assert.throws(() => normalizeVenture("acme"), /unknown venture/);
});

test("accountKey normalizes a domain and falls back to a company slug", () => {
  assert.equal(accountKey({ id: "x", company_domain: "https://www.Foo.com/bar" }), "foo.com");
  assert.equal(accountKey({ id: "y", company: "Bar Baz Inc" }), "name:bar-baz-inc");
  assert.throws(() => accountKey({ id: "z" }), /neither company_domain nor company/);
});

test("openMotion creates a candidate, linkedin, revenue motion with an explicit expiry", () => {
  const database = db();
  m1 = openMotion(database, { lead_id: gnkLead, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "gnk-motions-1" });
  assert.equal(m1.status, "candidate");
  assert.equal(m1.channel, "linkedin");
  assert.equal(m1.motion_type, "revenue");
  assert.equal(m1.account_key, "northstar.ai");
  assert.ok(m1.expires_at && m1.expires_at > m1.opened_at, "expiry is set and in the future");
  assert.ok(getOpenMotionForLead(database, gnkLead), "the lead now has an open motion");
});

test("morrow motions default to design_partner", () => {
  const database = db();
  morrowMotion = openMotion(database, { lead_id: morrowLead, venture: "morrow", play_id: "MORROW-COPACK-01", cohort_id: "morrow-motions-1" });
  assert.equal(morrowMotion.motion_type, "design_partner");
});

test("one OPEN motion per lead — a second open FAILS CLOSED", () => {
  const database = db();
  assert.throws(
    () => openMotion(database, { lead_id: gnkLead, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "gnk-motions-1" }),
    /already has an open motion/,
  );
});

test("one OPEN motion per account+venture+play — a different lead at the same account FAILS CLOSED", () => {
  const database = db();
  // gnkLeadSameAccount is a different person at northstar.ai under the same play.
  assert.throws(
    () => openMotion(database, { lead_id: gnkLeadSameAccount, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "gnk-motions-1" }),
    /account northstar\.ai already has an open gnk\/GNK-AI-01 motion/,
  );
});

test("cross-venture play assignment is rejected", () => {
  const database = db();
  assert.throws(() => openMotion(database, { lead_id: gnkLead2, venture: "gnk", play_id: "OHUB-ISP-01" }), /does not belong to venture gnk/);
});

test("a play that conflicts with the lead's own play is rejected", () => {
  const database = db();
  assert.throws(() => openMotion(database, { lead_id: gnkLead2, venture: "gnk", play_id: "GNK-AI-01" }), /conflicts with lead's play GNK-BE-01/);
});

test("a cohort from another venture is rejected", () => {
  const database = db();
  assert.throws(() => openMotion(database, { lead_id: gnkLead2, venture: "gnk", play_id: "GNK-BE-01", cohort_id: "morrow-motions-1" }), /is morrow, not venture gnk/);
});

test("unknown play id, and opening into a mid-funnel status, both fail closed", () => {
  const database = db();
  assert.throws(() => openMotion(database, { lead_id: gnkLead2, venture: "gnk", play_id: "GNK-NOPE-99" }), /unknown play/);
  assert.throws(() => openMotion(database, { lead_id: gnkLead2, venture: "gnk", play_id: "GNK-BE-01", status: "contacted" }), /opens into candidate\|evidence_ready\|approved/);
});

test("advanceMotion walks the legal sales path candidate -> active_delivery", () => {
  const database = db();
  let m = advanceMotion(database, m1.id, "approved");
  m = advanceMotion(database, m.id, "contacted");
  m = advanceMotion(database, m.id, "replied");
  m = advanceMotion(database, m.id, "qualified");
  m = advanceMotion(database, m.id, "proposal_review");
  m = advanceMotion(database, m.id, "signed");
  m = advanceMotion(database, m.id, "active_delivery");
  assert.equal(m.status, "active_delivery");
  assert.equal(m.closed_at, null, "signed/active_delivery are still OPEN motions");
});

test("advanceMotion rejects an illegal jump, and same-status is an idempotent no-op", () => {
  const database = db();
  assert.throws(() => advanceMotion(database, morrowMotion.id, "signed"), /illegal transition candidate -> signed/);
  const same = advanceMotion(database, morrowMotion.id, "candidate");
  assert.equal(same.status, "candidate");
});

test("closeMotion frees the account and lead for a fresh motion; a closed motion cannot advance", () => {
  const database = db();
  const closed = closeMotion(database, m1.id, { status: "closed_no_fit", reason: "no budget" });
  assert.equal(closed.status, "closed_no_fit");
  assert.ok(closed.closed_at);
  assert.equal(getOpenMotionForLead(database, gnkLead), null, "no open motion after close");
  assert.throws(() => advanceMotion(database, m1.id, "approved"), /is closed/);
  // The account is free again, so a new motion can be opened for the same lead+play.
  const reopened = openMotion(database, { lead_id: gnkLead, venture: "gnk", play_id: "GNK-AI-01", cohort_id: "gnk-motions-1" });
  assert.equal(reopened.status, "candidate");
  assert.notEqual(reopened.id, m1.id, "reactivation is a NEW motion, not the old one");
});

test("touchMotion stamps last_touch_at without changing status", () => {
  const database = db();
  const before = getMotion(database, morrowMotion.id);
  const touched = touchMotion(database, morrowMotion.id);
  assert.ok(touched.last_touch_at, "last_touch_at is set");
  assert.equal(touched.status, before.status, "touch does not advance state");
});

test("listOpenMotions scopes by venture", () => {
  const database = db();
  const gnk = listOpenMotions(database, { venture: "gnk" });
  const morrow = listOpenMotions(database, { venture: "morrow" });
  assert.ok(gnk.every((m) => m.venture === "gnk"));
  assert.ok(morrow.every((m) => m.venture === "morrow") && morrow.length >= 1);
});
