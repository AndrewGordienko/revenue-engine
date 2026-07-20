import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("contact consolidation dedupes safely and promotes profile data into the CRM", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salesv3-linkedin-"));
  process.env.CRM_DB_PATH = path.join(dir, "crm.db");
  const { db, _closeForTest } = await import("./db.js");
  const { consolidateLinkedinContacts } = await import("./consolidate-linkedin-contacts.js");
  const database = db();
  const now = "2026-07-14T12:00:00.000Z";
  database.prepare("INSERT INTO cohorts(cohort_id,product,strategy_version,created_at) VALUES(?,?,?,?)").run("gnk-test", "gnk", "test", now);
  database.prepare("INSERT INTO cohorts(cohort_id,product,strategy_version,created_at) VALUES(?,?,?,?)").run("morrow-test", "morrow", "test", now);
  const insert = database.prepare(`INSERT INTO leads
    (id,product,cohort_id,pipeline_run_id,strategy_version,company,name,title,identity_key,identity_confidence,stage,source_stores,research,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,'target','[]','{}',?,?)`);
  insert.run("gnk-primary", "gnk", "gnk-test", "run-1", "test", "Example Co", "Alex Smith", "Buyer", "id:gnk-primary", "weak", now, now);
  insert.run("gnk-duplicate", "gnk", "gnk-test", "run-2", "test", "Example Co", "Alex Smith", "Engineering Lead", "id:gnk-duplicate", "weak", now, now);
  insert.run("morrow-role", "morrow", "morrow-test", "run-3", "test", "Packing Co", "Operations Manager", "Role to verify", "id:morrow-role", "weak", now, now);
  database.prepare(`INSERT INTO activity_events(lead_id,type,occurred_at,recorded_at,source,payload)
    VALUES('gnk-primary','note',?,?, 'test','{}')`).run(now, now);

  const result = consolidateLinkedinContacts(database, {
    profiles: {
      verified_at: "2026-07-14",
      gnk: [{ name: "Alex Smith", company: "Example Co", profile_url: "https://www.linkedin.com/in/alex-smith-example" }],
      outagehub: [],
    },
    morrowContacts: {
      verified_at: "2026-07-14",
      contacts: [{
        company: "Packing Co",
        name: "Morgan Lee",
        title: "Operations Director",
        profile_url: "https://www.linkedin.com/in/morgan-lee-packing",
        source_url: "https://www.linkedin.com/in/morgan-lee-packing",
        role_confidence: "high",
      }],
    },
  });

  assert.equal(result.dedupe.removed, 1);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM leads WHERE product='gnk'").get().n, 1);
  const gnk = database.prepare("SELECT * FROM leads WHERE id='gnk-primary'").get();
  assert.equal(gnk.linkedin_url, "https://www.linkedin.com/in/alex-smith-example");
  assert.equal(gnk.identity_confidence, "strong");
  assert.equal(database.prepare("SELECT COUNT(*) n FROM activity_events WHERE lead_id='gnk-primary'").get().n, 1);
  const morrow = database.prepare("SELECT * FROM leads WHERE id='morrow-role'").get();
  assert.equal(morrow.name, "Morgan Lee");
  assert.equal(morrow.title, "Operations Director");
  assert.equal(morrow.linkedin_url, "https://www.linkedin.com/in/morgan-lee-packing");
  assert.equal(JSON.parse(morrow.research).target_role, "Operations Manager");

  _closeForTest();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.CRM_DB_PATH;
});
