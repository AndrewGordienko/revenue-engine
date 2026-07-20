import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { fromRoot } from "./paths.js";
import {
  classifyLinkedinConnection,
  linkedinSearchUrl,
  normalizeConnectionName,
  parseLinkedinConnectionsText,
  toCsv,
} from "./linkedin-connections.js";

const DEFAULT_INPUT = fromRoot("connections.txt");
const DEFAULT_OUTPUT = fromRoot("data", "inputs", "linkedin-connections-cleaned.csv");
const DIRECT_PROFILE = /^https:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[a-z0-9%_-]+\/?$/i;

function resolveExistingLead(record, leadsByName) {
  const matches = leadsByName.get(normalizeConnectionName(record.name)) || [];
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  const headline = record.headline.toLowerCase();
  const companyMatches = matches.filter((lead) => lead.company && headline.includes(lead.company.toLowerCase()));
  return companyMatches.length === 1 ? companyMatches[0] : null;
}

export function importLinkedinConnections(database, text, { sourceFile = "connections.txt", directProfiles = new Map() } = {}) {
  const parsed = parseLinkedinConnectionsText(text);
  const leads = database.prepare("SELECT id,name,company,linkedin_url FROM leads").all();
  const leadsByName = new Map();
  for (const lead of leads) {
    const key = normalizeConnectionName(lead.name);
    if (!key) continue;
    if (!leadsByName.has(key)) leadsByName.set(key, []);
    leadsByName.get(key).push(lead);
  }
  const now = new Date().toISOString();
  const rows = parsed.map((record) => {
    const classification = classifyLinkedinConnection(record);
    const lead = resolveExistingLead(record, leadsByName);
    const exportedProfile = directProfiles.get(record.identity_key) || directProfiles.get(normalizeConnectionName(record.name));
    const direct = lead && DIRECT_PROFILE.test(lead.linkedin_url || "");
    return {
      ...record,
      ...classification,
      profile_url: DIRECT_PROFILE.test(exportedProfile || "") ? exportedProfile : direct ? lead.linkedin_url : linkedinSearchUrl(record),
      profile_status: DIRECT_PROFILE.test(exportedProfile || "") ? "direct" : direct ? "crm_match" : "search",
      linked_lead_id: lead?.id || null,
      review_status: "new",
      source_file: sourceFile,
      created_at: now,
      updated_at: now,
    };
  });

  const statement = database.prepare(`INSERT INTO linkedin_connections
    (identity_key,name,headline,connected_on,profile_url,profile_status,primary_product,
     relationship_intent,relationship_role,classification_confidence,
     classification_score,product_scores,classification_reason,classification_source,
     review_status,linked_lead_id,source_file,source_line,created_at,updated_at)
    VALUES(@identity_key,@name,@headline,@connected_on,@profile_url,@profile_status,@primary_product,
     @relationship_intent,@relationship_role,@classification_confidence,
     @classification_score,@product_scores,@classification_reason,'rules',
     @review_status,@linked_lead_id,@source_file,@source_line,@created_at,@updated_at)
    ON CONFLICT(identity_key) DO UPDATE SET
      name=excluded.name,headline=excluded.headline,connected_on=excluded.connected_on,
      profile_url=CASE WHEN excluded.profile_status='direct' THEN excluded.profile_url
        WHEN linkedin_connections.profile_status IN ('direct','confirmed','crm_match')
        THEN linkedin_connections.profile_url ELSE excluded.profile_url END,
      profile_status=CASE WHEN excluded.profile_status='direct' THEN 'direct'
        WHEN linkedin_connections.profile_status IN ('direct','confirmed','crm_match')
        THEN linkedin_connections.profile_status ELSE excluded.profile_status END,
      primary_product=CASE WHEN linkedin_connections.classification_source IN ('human','conversation','web_research')
        THEN linkedin_connections.primary_product ELSE excluded.primary_product END,
      relationship_intent=CASE WHEN linkedin_connections.classification_source IN ('human','conversation','web_research')
        THEN linkedin_connections.relationship_intent ELSE excluded.relationship_intent END,
      relationship_role=CASE WHEN linkedin_connections.classification_source IN ('human','conversation','web_research')
        THEN linkedin_connections.relationship_role ELSE excluded.relationship_role END,
      classification_confidence=CASE WHEN linkedin_connections.classification_source IN ('human','conversation','web_research')
        THEN linkedin_connections.classification_confidence ELSE excluded.classification_confidence END,
      classification_score=CASE WHEN linkedin_connections.classification_source IN ('human','conversation','web_research')
        THEN linkedin_connections.classification_score ELSE excluded.classification_score END,
      product_scores=excluded.product_scores,
      classification_reason=CASE WHEN linkedin_connections.classification_source IN ('human','conversation','web_research')
        THEN linkedin_connections.classification_reason ELSE excluded.classification_reason END,
      linked_lead_id=coalesce(linkedin_connections.linked_lead_id,excluded.linked_lead_id),
      source_file=excluded.source_file,source_line=excluded.source_line,updated_at=excluded.updated_at`);

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) statement.run({ ...row, product_scores: JSON.stringify(row.product_scores) });
    database.prepare(`UPDATE linkedin_connections SET
      relationship_intent=CASE primary_product
        WHEN 'gnk' THEN 'gnk_sell' WHEN 'outagehub' THEN 'outagehub_sell'
        WHEN 'morrow' THEN 'morrow_research' ELSE 'other' END,
      relationship_role=CASE
        WHEN relationship_role<>'network_only' OR primary_product='other' THEN relationship_role
        WHEN primary_product='morrow' THEN 'research_subject'
        ELSE 'buyer_or_router' END,
      classification_confidence=CASE
        WHEN classification_source IN ('human','conversation','web_research') AND primary_product<>'other' THEN classification_confidence
        ELSE classification_confidence END
      WHERE relationship_intent='other' AND primary_product<>'other'`).run();
    database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_connections_imported_at',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(now);
    database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_connections_source_count',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(rows.length));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return rows;
}

function databaseRowsForCsv(database) {
  return database.prepare(`SELECT id,name,headline,connected_on,primary_product,classification_score,
    relationship_intent,relationship_role,classification_confidence,
    product_scores,classification_reason,profile_status,profile_url,linked_lead_id,review_status,
    contacted_at,contact_channel
    FROM linkedin_connections ORDER BY connected_on DESC,name`).all().map((row) => ({
      ...row,
      product_scores: JSON.parse(row.product_scores || "{}"),
    }));
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_INPUT);
  const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const text = await fs.readFile(inputPath, "utf8");
  const database = db();
  const imported = importLinkedinConnections(database, text, { sourceFile: path.basename(inputPath) });
  const catalogue = databaseRowsForCsv(database);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, toCsv(catalogue), "utf8");
  const byProduct = Object.fromEntries(["gnk", "outagehub", "morrow", "other"].map((product) => [
    product,
    catalogue.filter((row) => row.primary_product === product).length,
  ]));
  console.log(JSON.stringify({
    parsed: imported.length,
    catalogued: catalogue.length,
    by_product: byProduct,
    direct_profiles: catalogue.filter((row) => row.profile_status !== "search").length,
    search_routes: catalogue.filter((row) => row.profile_status === "search").length,
    cleaned_csv: outputPath,
  }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
