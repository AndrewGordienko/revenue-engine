import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./db.js";
import { fromRoot } from "./paths.js";

const VERSION = "morrow-research-v1";
const OUTPUT = fromRoot("data", "inputs", "morrow-linkedin-message-drafts.csv");

function firstName(name) {
  return String(name || "there").replace(/^(dr\.?|prof\.?|mr\.?|ms\.?)\s+/i, "").split(/\s+/)[0].replace(/[,.:;]+$/, "") || "there";
}

function topicFor(row) {
  const text = String(row.headline || "").toLowerCase();
  if (/robot learning|robotic ai reasoning|physical ai|embodied ai/.test(text)) return "robot learning and reasoning for real-world systems";
  if (/controls|autonomy/.test(text)) return "robotics controls and autonomy";
  if (/humanoid/.test(text)) return "humanoid robotics hardware and deployment";
  if (/prototyp/.test(text)) return "robotics prototyping and real-world deployment";
  if (/canadian space agency|iss|gateway robotics|space robotics|mda space/.test(text)) return "robotics in complex space operations";
  if (/biomedical|medical/.test(text)) return "robotics and biomedical technology";
  if (/robot/.test(text)) return "robotics development and deployment";
  if (/fleet maintenance/.test(text)) return "fleet maintenance and procurement workflows";
  if (/manufactur|production|plant/.test(text)) return "production and plant-floor workflows";
  if (/continuous improvement|operational excellence/.test(text)) return "continuous-improvement and operating workflows";
  if (/transportation|transit/.test(text)) return "transportation operations";
  if (/logistics|supply chain|warehouse|distribution|inventory|parcel|procurement|sourcing/.test(text)) return "supply-chain and logistics workflows";
  return "high-variation physical operating workflows";
}

function draftsFor(row) {
  const first = firstName(row.name);
  const topic = topicFor(row);
  const researcher = row.relationship_role === "research_subject";
  const connectionRequest = researcher
    ? `Hi ${first}, I’m a UofT student working on medical robotics. Your work in ${topic} stood out. I’m researching what still limits reliable robotics deployment in real-world settings. Open to a short call?`
    : `Hi ${first}, I’m a UofT student working on medical robotics. Your experience with ${topic} stood out. I’m researching which tasks remain manual and where robotics could realistically improve the workflow. Open to a short call?`;
  const warmIntroduction = researcher
    ? `Hi ${first}, thanks for connecting.\n\nI’m a UofT student working on medical robotics. I’ve been researching what makes robotics difficult to deploy reliably outside controlled demonstrations. Given your experience with ${topic}, I wanted to introduce what I’m working on and hear which practical constraints you think are most important to understand.`
    : `Hi ${first}, thanks for connecting.\n\nI’m a UofT student working on medical robotics. I’ve been speaking with people who understand ${topic} to learn where physical work still depends on people and what makes further automation difficult. Given your experience, I wanted to introduce what I’m researching before making a bigger ask.`;
  const researchCall = researcher
    ? `Hi ${first}, thanks for connecting.\n\nGiven your experience with ${topic}, I’d be interested to hear what the systems look like in practice, where current robotics approaches work well, and what still limits reliable deployment in less controlled environments.\n\nWould you be free for a quick call sometime in the next few days, around 2 or 3 pm ET?`
    : `Hi ${first}, thanks for connecting.\n\nGiven your experience with ${topic}, I’d be interested to hear how those workflows actually run day to day, what is handled by people today, what is already automated, and where the main bottlenecks are to automating more.\n\nWould you be free for a quick call sometime in the next few days, around 2 or 3 pm ET?`;
  return {
    connection_request: connectionRequest,
    warm_introduction: warmIntroduction,
    research_call: researchCall,
  };
}

export function generateMorrowConnectionDrafts(database = db()) {
  const connections = database.prepare(`SELECT id,name,headline,relationship_role
    FROM linkedin_connections WHERE primary_product='morrow'
    ORDER BY classification_score DESC,name`).all();
  const t = new Date().toISOString();
  const upsert = database.prepare(`INSERT INTO linkedin_connection_drafts
    (connection_id,draft_type,body,character_count,generation_source,template_version,created_at,updated_at)
    VALUES(?,?,?,?,'deterministic',?,?,?)
    ON CONFLICT(connection_id,draft_type) DO UPDATE SET body=excluded.body,
      character_count=excluded.character_count,generation_source=excluded.generation_source,
      template_version=excluded.template_version,updated_at=excluded.updated_at`);
  const output = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const connection of connections) {
      const drafts = draftsFor(connection);
      if (drafts.connection_request.length > 300) throw new Error(`${connection.name}: connection request exceeds 300 characters`);
      for (const [type, body] of Object.entries(drafts)) {
        upsert.run(connection.id, type, body, body.length, VERSION, t, t);
        output.push({ connection_id: connection.id, name: connection.name, headline: connection.headline, relationship_role: connection.relationship_role, draft_type: type, character_count: body.length, body });
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return output;
}

function csv(rows) {
  const fields = ["connection_id", "name", "headline", "relationship_role", "draft_type", "character_count", "body"];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `${fields.join(",")}\n${rows.map((row) => fields.map((field) => quote(row[field])).join(",")).join("\n")}\n`;
}

async function main() {
  const rows = generateMorrowConnectionDrafts();
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, csv(rows), "utf8");
  console.log(JSON.stringify({ connections: rows.length / 3, drafts: rows.length, output: OUTPUT, template_version: VERSION }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
