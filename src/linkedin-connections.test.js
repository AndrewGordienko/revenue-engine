import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyLinkedinConnection,
  parseLinkedinConnectionsText,
} from "./linkedin-connections.js";

const SAMPLE = `LinkedIn\n773 connections\n\nAlex Smith’s profile picture\nAlex Smith\nVP Engineering at Example Co\n\nConnected on July 14, 2026\n\nMessage\n\nЯков Попов’s profile picture\nЯков Попов\nDirector of Plant Operations and Automation\n\nConnected on September 22, 2019\n\nMessage\nAbout\n`;

test("text cleanup extracts complete records and preserves Unicode names", () => {
  const rows = parseLinkedinConnectionsText(SAMPLE);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.name), ["Alex Smith", "Яков Попов"]);
  assert.deepEqual(rows.map((row) => row.connected_on), ["2026-07-14", "2019-09-22"]);
});

test("classification separates GNK, OHUB, Morrow, and Other", () => {
  const gnk = classifyLinkedinConnection({ headline: "VP Engineering at Example Co" });
  assert.equal(gnk.primary_product, "gnk");
  assert.equal(gnk.relationship_intent, "gnk_sell");
  assert.equal(gnk.relationship_role, "buyer");
  assert.equal(classifyLinkedinConnection({ headline: "Director of Plant Operations and Automation" }).primary_product, "morrow");
  assert.equal(classifyLinkedinConnection({ headline: "Power utility outage operations leader" }).primary_product, "outagehub");
  assert.equal(classifyLinkedinConnection({ headline: "History student and volunteer" }).primary_product, "other");
});

test("classification keeps evaluators and routers while excluding clearly irrelevant profiles", () => {
  assert.equal(classifyLinkedinConnection({ headline: "Senior Data Engineer and AWS Solutions Architect" }).primary_product, "gnk");
  assert.equal(classifyLinkedinConnection({ headline: "Retired Aerospace Engineering Manager" }).primary_product, "other");
  assert.equal(classifyLinkedinConnection({ headline: "Senior Director, Field Operations at a telecom provider" }).primary_product, "outagehub");
  assert.equal(classifyLinkedinConnection({ headline: "Supply Chain Analyst at a fulfilment company" }).primary_product, "morrow");
  assert.equal(classifyLinkedinConnection({ headline: "Talent Acquisition Partner" }).primary_product, "other");
});

test("classification distinguishes sales motions from Morrow research relationships", () => {
  const researcher = classifyLinkedinConnection({ headline: "PhD Candidate in Robot Learning and Physical AI" });
  assert.equal(researcher.primary_product, "morrow");
  assert.equal(researcher.relationship_intent, "morrow_research");
  assert.equal(researcher.relationship_role, "research_subject");
  assert.equal(classifyLinkedinConnection({ headline: "Senior Robotics Controls and Autonomy Engineer" }).primary_product, "morrow");
  assert.equal(classifyLinkedinConnection({ headline: "Data Centre Operations Manager" }).primary_product, "outagehub");
  assert.equal(classifyLinkedinConnection({ headline: "Aerospace Engineering Manager and Business Development Lead" }).primary_product, "other");
  assert.equal(classifyLinkedinConnection({ headline: "Owner of a luxury travel service" }).primary_product, "other");
});

test("catalogue import reuses CRM profiles and preserves human classification overrides", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salesv3-connections-"));
  process.env.CRM_DB_PATH = path.join(dir, "crm.db");
  const { db, _closeForTest } = await import("./db.js");
  const { importLinkedinConnections } = await import("./import-linkedin-connections.js");
  const database = db();
  const now = "2026-07-15T12:00:00.000Z";
  database.prepare("INSERT INTO cohorts(cohort_id,product,strategy_version,created_at) VALUES(?,?,?,?)").run("gnk-test", "gnk", "test", now);
  database.prepare(`INSERT INTO leads
    (id,product,cohort_id,pipeline_run_id,strategy_version,company,name,title,linkedin_url,identity_key,identity_confidence,stage,source_stores,research,created_at,updated_at)
    VALUES('lead-alex','gnk','gnk-test','run-1','test','Example Co','Alex Smith','VP Engineering',
      'https://www.linkedin.com/in/alex-smith-example','li:alex-smith-example','strong','target','[]','{}',?,?)`).run(now, now);

  importLinkedinConnections(database, SAMPLE);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM linkedin_connections").get().n, 2);
  const alex = database.prepare("SELECT * FROM linkedin_connections WHERE name='Alex Smith'").get();
  assert.equal(alex.profile_status, "crm_match");
  assert.equal(alex.profile_url, "https://www.linkedin.com/in/alex-smith-example");
  assert.equal(alex.linked_lead_id, "lead-alex");

  const yakovKey = "linkedin-connection:яков попов|2019-09-22";
  importLinkedinConnections(database, SAMPLE, { directProfiles: new Map([[yakovKey, "https://www.linkedin.com/in/yakov-popov"]]) });
  const yakov = database.prepare("SELECT profile_url,profile_status FROM linkedin_connections WHERE name='Яков Попов'").get();
  assert.equal(yakov.profile_url, "https://www.linkedin.com/in/yakov-popov");
  assert.equal(yakov.profile_status, "direct");

  database.prepare("UPDATE linkedin_connections SET primary_product='other',classification_source='human',contacted_at='2026-07-15T14:00:00.000Z',contact_channel='linkedin' WHERE id=?").run(alex.id);
  importLinkedinConnections(database, SAMPLE);
  const preserved = database.prepare("SELECT primary_product,contacted_at,contact_channel FROM linkedin_connections WHERE id=?").get(alex.id);
  assert.equal(preserved.primary_product, "other");
  assert.equal(preserved.contacted_at, "2026-07-15T14:00:00.000Z");
  assert.equal(preserved.contact_channel, "linkedin");
  assert.equal(database.prepare("SELECT COUNT(*) n FROM linkedin_connections").get().n, 2);

  _closeForTest();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.CRM_DB_PATH;
});

test("official LinkedIn CSV parser preserves multiline messages and exact URLs", async () => {
  const { parseCsv } = await import("./import-linkedin-official-export.js");
  const rows = parseCsv('"CONVERSATION ID","FROM","CONTENT"\n"thread-1","A Person","First line\nsecond, line"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["CONVERSATION ID"], "thread-1");
  assert.equal(rows[0].CONTENT, "First line\nsecond, line");
});
