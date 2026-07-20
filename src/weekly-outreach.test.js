// Proves the weekly connect/outreach queue: relationship_role maps to the right bucket,
// already-contacted connections are excluded, dormant conversations resurface, and the
// venture filter scopes correctly.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-"));
process.env.CRM_DB_PATH = path.join(temp, "weekly.db");

const { db, _closeForTest } = await import("./db.js");
const { buildWeeklyQueue } = await import("./weekly-outreach.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

const t = "2026-07-21T00:00:00Z";
let cid = 0;
function conn(database, { role, product = "gnk", contacted = false }) {
  cid++;
  database.prepare(`INSERT INTO linkedin_connections
    (identity_key,name,headline,profile_url,primary_product,relationship_role,review_status,classification_score,contacted_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?, 'new', ?, ?, ?, ?)`)
    .run(`k${cid}`, `Person ${cid}`, "Head of X", `https://linkedin.com/in/p${cid}`, product, role, 10, contacted ? t : null, t, t);
  return cid;
}

before(() => {
  const d = db();
  conn(d, { role: "buyer" });                 // direct owner
  conn(d, { role: "workflow_owner" });        // direct owner
  conn(d, { role: "technical_router" });      // router
  conn(d, { role: "buyer_or_router" });       // router
  conn(d, { role: "needs_context" });         // ecosystem
  conn(d, { role: "buyer", contacted: true }); // excluded (already contacted)
  conn(d, { role: "buyer", product: "outagehub" }); // other venture
  // dormant: a connection with a stale conversation
  const dc = conn(d, { role: "early_career" });
  d.prepare(`INSERT INTO linkedin_conversations(identity_key,name,product,connection_id,status,last_inbound_at,last_message_at,created_at,updated_at)
    VALUES(?,?,?,?, 'waiting', '2025-01-01T00:00:00Z','2025-01-01T00:00:00Z', ?, ?)`).run("dconv", "Person dormant", "gnk", dc, t, t);
});

test("relationship_role maps to the right bucket; contacted + other-venture are excluded", () => {
  const q = buildWeeklyQueue(db(), { venture: "gnk" });
  const byKey = Object.fromEntries(q.buckets.map((b) => [b.key, b.people]));
  assert.equal(byKey.direct_owners.length, 2, "two gnk owners (the contacted one excluded)");
  assert.equal(byKey.routers.length, 2, "two gnk routers");
  assert.ok(byKey.direct_owners.every((p) => p.venture === "gnk"));
  assert.ok(!q.buckets.flatMap((b) => b.people).some((p) => p.role === "buyer" && p.venture === "outagehub"), "other-venture buyer not in gnk queue");
  assert.ok(q.buckets.flatMap((b) => b.people).every((p) => p.suggested_note && p.suggested_note.length > 0), "every person has a suggested note");
});

test("dormant conversations resurface in the reactivate bucket", () => {
  const q = buildWeeklyQueue(db(), { venture: "gnk" });
  const dormant = q.buckets.find((b) => b.key === "dormant").people;
  assert.ok(dormant.length >= 1, "the stale conversation is queued for reactivation");
});

test("the venture filter scopes the list", () => {
  const oh = buildWeeklyQueue(db(), { venture: "outagehub" });
  assert.ok(oh.buckets.find((b) => b.key === "direct_owners").people.some((p) => p.venture === "outagehub"));
  assert.ok(oh.buckets.flatMap((b) => b.people).every((p) => p.venture === "outagehub" || p.bucket === "dormant"));
});
