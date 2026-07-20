import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { normalizeConnectionName, toCsv } from "./linkedin-connections.js";
import { fromRoot } from "./paths.js";

const DEFAULT_FILES = ["a", "b", "c"].map((suffix) => fromRoot("tmp", `needs-context-research-${suffix}.jsonl`));
const INTENTS = new Set(["gnk_sell", "outagehub_sell", "morrow_research", "unresolved"]);
const CONFIDENCE = new Set(["strong", "probable", "possible", "unresolved"]);

function productFor(intent) {
  return intent === "gnk_sell" ? "gnk" : intent === "outagehub_sell" ? "outagehub" : intent === "morrow_research" ? "morrow" : "other";
}

async function loadRecords(files) {
  const records = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    for (const line of text.split("\n").filter(Boolean)) records.push({ ...JSON.parse(line), research_file: path.basename(file) });
  }
  return records;
}

async function main() {
  const files = process.argv.slice(2).length ? process.argv.slice(2).map((item) => path.resolve(item)) : DEFAULT_FILES;
  const records = await loadRecords(files);
  const database = db();
  const all = database.prepare("SELECT * FROM linkedin_connections").all();
  const byId = new Map(all.map((row) => [row.id, row]));
  const byName = new Map();
  for (const row of all) {
    const key = normalizeConnectionName(row.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }
  const insert = database.prepare(`INSERT INTO linkedin_connection_research
    (connection_id,researched_name,saved_headline,current_role,current_company,proposed_intent,proposed_role,
     confidence,reason,source_urls,researched_at,imported_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET
    researched_name=excluded.researched_name,saved_headline=excluded.saved_headline,current_role=excluded.current_role,
    current_company=excluded.current_company,proposed_intent=excluded.proposed_intent,proposed_role=excluded.proposed_role,
    confidence=excluded.confidence,reason=excluded.reason,source_urls=excluded.source_urls,
    researched_at=excluded.researched_at,imported_at=excluded.imported_at`);
  const updateResolved = database.prepare(`UPDATE linkedin_connections SET primary_product=?,relationship_intent=?,
    relationship_role=?,classification_confidence=?,classification_score=max(classification_score,8),
    classification_reason=?,classification_source='web_research',updated_at=?
    WHERE id=? AND primary_product='other' AND classification_source NOT IN ('human','conversation')`);
  const updateUnresolved = database.prepare(`UPDATE linkedin_connections SET relationship_role=?,
    classification_confidence=?,classification_reason=?,classification_source='web_research',updated_at=?
    WHERE id=? AND primary_product='other' AND classification_source NOT IN ('human','conversation')`);
  const confirmProfile = database.prepare(`UPDATE linkedin_connections SET profile_url=?,profile_status='confirmed',updated_at=?
    WHERE id=? AND profile_status='search'`);
  const now = new Date().toISOString();
  const result = { records: records.length, matched: 0, resolved: 0, unresolved: 0, skipped: 0, duplicate_input: 0 };
  const seen = new Set();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const record of records) {
      if (!INTENTS.has(record.relationship_intent) || !CONFIDENCE.has(record.confidence)) { result.skipped++; continue; }
      let connection = byId.get(Number(record.connection_id));
      if (!connection) {
        const matches = byName.get(normalizeConnectionName(record.name)) || [];
        connection = matches.length === 1 ? matches[0] : null;
      }
      if (!connection) { result.skipped++; continue; }
      if (seen.has(connection.id)) { result.duplicate_input++; continue; }
      seen.add(connection.id);
      const urls = Array.isArray(record.source_urls) ? record.source_urls.filter((url) => /^https?:\/\//.test(url)).slice(0, 10) : [];
      insert.run(connection.id, record.name, record.saved_headline || connection.headline, record.current_role || null,
        record.current_company || null, record.relationship_intent, record.relationship_role || "needs_context",
        record.confidence, record.reason || "", JSON.stringify(urls), record.research_at || now, now);
      result.matched++;
      const evidence = `${record.reason || "Public-profile research completed."}${urls.length ? ` Sources: ${urls.join(" ")}` : ""}`;
      const exactLinkedinProfile = urls.find((url) => /^https:\/\/[^/]*linkedin\.com\/in\/[a-z0-9%_-]+\/?$/i.test(url));
      if (exactLinkedinProfile && record.confidence !== "unresolved") confirmProfile.run(exactLinkedinProfile, now, connection.id);
      if (record.relationship_intent !== "unresolved" && record.confidence !== "unresolved" && urls.length) {
        result.resolved += updateResolved.run(productFor(record.relationship_intent), record.relationship_intent,
          record.relationship_role || (record.relationship_intent === "morrow_research" ? "research_subject" : "buyer_or_router"),
          record.confidence, evidence, now, connection.id).changes;
      } else {
        result.unresolved += updateUnresolved.run(record.relationship_role || "needs_context",
          record.confidence, evidence, now, connection.id).changes;
      }
    }
    database.prepare(`INSERT INTO meta(key,value) VALUES('needs_context_research_imported_at',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const catalogue = database.prepare(`SELECT id,name,headline,connected_on,primary_product,classification_score,
    relationship_intent,relationship_role,classification_confidence,product_scores,classification_reason,
    profile_status,profile_url,linked_lead_id,review_status,contacted_at,contact_channel
    FROM linkedin_connections ORDER BY connected_on DESC,name`).all().map((row) => ({ ...row, product_scores: JSON.parse(row.product_scores || "{}") }));
  await fs.mkdir(fromRoot("data", "inputs"), { recursive: true });
  await fs.writeFile(fromRoot("data", "inputs", "linkedin-connections-cleaned.csv"), toCsv(catalogue), "utf8");
  await fs.writeFile(fromRoot("data", "inputs", "linkedin-connection-public-research.jsonl"), records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
