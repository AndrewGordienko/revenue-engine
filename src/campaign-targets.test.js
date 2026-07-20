// Proves Morrow is a first-class venture: the Windsor-Essex Tier-1 campaign targets are
// seeded (so Morrow reporting is non-null), Morrow is an active-play brand, and the
// smoke manifest validates a Morrow-only canary while the gnk+ohub manifest still passes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "targets-"));
process.env.CRM_DB_PATH = path.join(temp, "targets.db");
process.env.LEAD_MEMORY_DIR = path.join(temp, "memory");

const { db, _closeForTest } = await import("./db.js");
const { listCampaignTargets, countTargetsByPlay } = await import("./campaign-targets.js");
const { ACTIVE_PLAYS, validateManifest } = await import("./smoke-live.js");

after(() => { _closeForTest(); fs.rmSync(temp, { recursive: true, force: true }); });

test("Morrow Windsor-Essex Tier-1 targets are seeded and reporting is non-null", () => {
  const database = db();
  const morrow = listCampaignTargets(database, { venture: "morrow" });
  assert.equal(morrow.length, 10, "ten Tier-1 accounts seeded");
  const byPlay = Object.fromEntries(countTargetsByPlay(database, "morrow").map((r) => [r.play_id, r.n]));
  assert.equal(byPlay["MORROW-COPACK-01"], 4);
  assert.equal(byPlay["MORROW-CPG-01"], 6);
  assert.ok(morrow.every((t) => t.region && t.domain), "each target carries a domain + region");
});

test("Morrow is an active-play brand", () => {
  assert.deepEqual(ACTIVE_PLAYS.morrow, ["MORROW-COPACK-01", "MORROW-CPG-01"]);
});

test("a Morrow-only smoke manifest (one per play) validates as an independent canary", () => {
  const morrowManifest = [
    { company: "Highbury Canco", domain: "highburycanco.com", buyer: "Plant Manager", product: "morrow", play_id: "MORROW-COPACK-01" },
    { company: "Mucci Farms", domain: "muccifarms.com", buyer: "Ops Manager", product: "morrow", play_id: "MORROW-CPG-01" },
  ];
  assert.equal(validateManifest(morrowManifest).ok, true);
});

test("the gnk+outagehub six-account manifest still validates (no regression)", () => {
  const legacy = [
    { company: "A", domain: "a.io", buyer: "b", product: "gnk", play_id: "GNK-AI-01" },
    { company: "B", domain: "b.io", buyer: "b", product: "gnk", play_id: "GNK-BE-01" },
    { company: "C", domain: "c.io", buyer: "b", product: "gnk", play_id: "GNK-DATA-01" },
    { company: "D", domain: "d.io", buyer: "b", product: "outagehub", play_id: "OHUB-ISP-01" },
    { company: "E", domain: "e.io", buyer: "b", product: "outagehub", play_id: "OHUB-EMBED-01" },
    { company: "F", domain: "f.io", buyer: "b", product: "outagehub", play_id: "OHUB-FAC-01" },
  ];
  assert.equal(validateManifest(legacy).ok, true);
});
