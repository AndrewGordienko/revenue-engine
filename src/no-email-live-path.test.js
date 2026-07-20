// PR A proof: the LIVE path is LinkedIn-only. The promoter produces channel-native drafts
// with a LinkedIn profile and no email shape (the email queue stays empty); the new cockpit
// backend modules never touch email; and each venture's lead:prepare critical path ends at
// the LinkedIn writer with no email-finder / mailbox / email-sequence dependency. Dormant
// email modules and their existing tests are intentionally left untouched.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "noemail-"));
process.env.CRM_DB_PATH = path.join(temp, "noemail.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { upsertLeads } = await import("./leads-store.js");
const { STRATEGY_VERSION } = await import("./sales-plays.js");
const { promoteLinkedInMessages } = await import("./promote-linkedin.js");
const { readRegistry } = await import("./bus.js");
const { selectPipelineAgents } = await import("./pipelines.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

before(async () => {
  const database = db();
  await upsertLeads([{ name: "Live One", title: "CTO", company: "LiveCo", company_domain: "liveco.io" }], "gnk", { cohort_id: "ne-1", play_id: "GNK-AI-01", strategy_version: STRATEGY_VERSION, stage: "test" });
  database.prepare("UPDATE leads SET linkedin_url='https://linkedin.com/in/liveone' WHERE name='Live One'").run();
});

test("the live promoter produces LinkedIn-native drafts with NO email shape", () => {
  const database = db();
  const res = promoteLinkedInMessages({ linkedin_connection_messages: [{ person_name: "Live One", company: "LiveCo", linkedin_url: "https://linkedin.com/in/liveone", connection_message: "Hi Live — worth a look?" }] }, "gnk", database);
  assert.equal(res.drafts_queued, 1);
  const draft = database.prepare("SELECT * FROM outreach_drafts_v2 LIMIT 1").get();
  assert.ok(draft.linkedin_profile_url, "the draft carries a LinkedIn profile URL");
  assert.ok(!("recipient" in draft) && !("subject" in draft), "no email recipient/subject columns exist on the draft");
  assert.equal(database.prepare("SELECT COUNT(*) c FROM outreach_messages").get().c, 0, "the legacy email queue stays empty");
});

test("the new cockpit backend modules never reference email or the email queue", () => {
  for (const f of ["founder-queue.js", "pipeline-board.js", "people-view.js", "review-view.js"]) {
    const src = fs.readFileSync(path.join(here, f), "utf8");
    assert.ok(!/outreach_messages|recipient|subject|gmail|email/i.test(src), `${f} must not reference email/outreach_messages`);
  }
});

test("each venture's lead:prepare critical path ends at the LinkedIn writer, with no email dependency", async () => {
  const registry = await readRegistry();
  for (const venture of ["gnk", "outagehub", "morrow"]) {
    const agents = selectPipelineAgents(registry, "lead:prepare", venture);
    assert.ok(agents.length >= 1 && agents.length <= 4, `${venture}: at most four model calls on the live path (got ${agents.length})`);
    const last = agents[agents.length - 1];
    assert.ok(/email-drafter$/.test(last.slug), `${venture}: the critical path ends at the writer (${last.slug})`);
    const outputs = (last.outputs || []).map((o) => (typeof o === "string" ? o : o.key || o.name));
    assert.ok(outputs.includes("linkedin_connection_messages"), `${venture}: the writer outputs linkedin_connection_messages`);
    assert.ok(!agents.some((a) => /email-finder|mailbox|email-sequence/.test(a.slug)), `${venture}: no email-finder/mailbox/email-sequence on the live path`);
  }
});
