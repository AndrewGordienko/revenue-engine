import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { importLinkedinChats } from "./import-linkedin-chats.js";
import { importLinkedinConnections } from "./import-linkedin-connections.js";
import { syncLinkedinOperatingLoop } from "./founder-ops.js";
import { normalizeConnectionName, toCsv } from "./linkedin-connections.js";
import { fromRoot } from "./paths.js";

const SELF = normalizeConnectionName("Andrew Gordienko");
const DEFAULT_EXPORTS = [
  "/Users/andrewgordienko/Downloads/Complete_LinkedInDataExport_07-15-2026.zip",
  "/Users/andrewgordienko/Downloads/Complete_LinkedInDataExport_07-15-2026.zip (1)",
];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headerIndex = rows.findIndex((candidate) => candidate.includes("First Name") || candidate.includes("CONVERSATION ID"));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((value) => value.trim());
  return rows.slice(headerIndex + 1).filter((candidate) => candidate.some(Boolean)).map((candidate) => Object.fromEntries(headers.map((header, index) => [header, candidate[index] || ""])));
}

function isoDay(value) {
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function readableDay(day) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function connectionText(records) {
  return records.map((record) => `${record.name}\n${record.headline}\nConnected on ${readableDay(record.connected_on)}\n\nMessage`).join("\n\n");
}

function clock(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
}

function syntheticChatPages(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row["CONVERSATION ID"] || !row.CONTENT?.trim() || row["IS MESSAGE DRAFT"] === "Yes") continue;
    if (!groups.has(row["CONVERSATION ID"])) groups.set(row["CONVERSATION ID"], []);
    groups.get(row["CONVERSATION ID"]).push(row);
  }
  const pages = [];
  const profiles = new Map();
  let skippedGroupChats = 0;
  for (const messages of groups.values()) {
    const people = new Map();
    for (const message of messages) {
      const from = String(message.FROM || "").trim();
      if (from && normalizeConnectionName(from) !== SELF) {
        people.set(normalizeConnectionName(from), from);
        if (/^https:\/\/[^/]*linkedin\.com\/in\//i.test(message["SENDER PROFILE URL"] || "")) profiles.set(normalizeConnectionName(from), message["SENDER PROFILE URL"]);
      }
      const recipients = String(message.TO || "").split(/\s*[;,]\s*/).map((item) => item.trim()).filter(Boolean);
      const recipientProfiles = String(message["RECIPIENT PROFILE URLS"] || "").split(/\s*[;,]\s*/).map((item) => item.trim()).filter(Boolean);
      for (let index = 0; index < recipients.length; index++) {
        const recipient = recipients[index];
        if (normalizeConnectionName(recipient) === SELF) continue;
        people.set(normalizeConnectionName(recipient), recipient);
        const profile = recipientProfiles[index] || (recipientProfiles.length === 1 ? recipientProfiles[0] : "");
        if (/^https:\/\/[^/]*linkedin\.com\/in\//i.test(profile)) profiles.set(normalizeConnectionName(recipient), profile);
      }
    }
    if (people.size !== 1) { skippedGroupChats++; continue; }
    const name = [...people.values()][0];
    const lines = ["0 notifications total", "Conversation List", "Load more conversations", name, `Open the options list in your conversation with ${name} and Andrew Gordienko`];
    for (const message of messages.sort((a, b) => a.DATE.localeCompare(b.DATE))) {
      const date = new Date(message.DATE.replace(" UTC", "Z"));
      if (Number.isNaN(date.getTime())) continue;
      lines.push(date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }));
      lines.push(`${message.FROM} sent the following message at ${clock(date)}`, "", "", message.CONTENT.trim());
    }
    pages.push(lines.join("\n"));
  }
  return { text: pages.join("\n"), conversations: pages.length, skippedGroupChats, profiles };
}

function catalogueRows(database) {
  return database.prepare(`SELECT id,name,headline,connected_on,primary_product,classification_score,
    relationship_intent,relationship_role,classification_confidence,product_scores,classification_reason,
    profile_status,profile_url,linked_lead_id,review_status,contacted_at,contact_channel
    FROM linkedin_connections ORDER BY connected_on DESC,name`).all().map((row) => ({ ...row, product_scores: JSON.parse(row.product_scores || "{}") }));
}

function mergeLegacySearchDuplicates(database) {
  const rows = database.prepare("SELECT * FROM linkedin_connections ORDER BY id").all();
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeConnectionName(row.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let merged = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const matches of groups.values()) {
      const direct = matches.filter((row) => row.profile_status === "direct");
      const legacy = matches.filter((row) => row.profile_status === "search");
      if (direct.length !== 1 || !legacy.length) continue;
      const target = direct[0];
      for (const source of legacy) {
        database.prepare(`UPDATE linkedin_connections SET
          contacted_at=coalesce(contacted_at,?),contact_channel=coalesce(contact_channel,?),
          review_status=CASE WHEN ?='dismissed' THEN 'dismissed' ELSE review_status END,
          primary_product=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE primary_product END,
          relationship_intent=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE relationship_intent END,
          relationship_role=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE relationship_role END,
          classification_confidence=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE classification_confidence END,
          classification_score=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE classification_score END,
          classification_reason=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE classification_reason END,
          classification_source=CASE WHEN ? IN ('human','conversation','web_research') THEN ? ELSE classification_source END,
          updated_at=? WHERE id=?`).run(
            source.contacted_at, source.contact_channel, source.review_status,
            source.classification_source, source.primary_product,
            source.classification_source, source.relationship_intent,
            source.classification_source, source.relationship_role,
            source.classification_source, source.classification_confidence,
            source.classification_source, source.classification_score,
            source.classification_source, source.classification_reason,
            source.classification_source, source.classification_source,
            new Date().toISOString(), target.id,
          );
        database.prepare("UPDATE linkedin_conversations SET connection_id=? WHERE connection_id=?").run(target.id, source.id);
        database.prepare(`INSERT OR IGNORE INTO linkedin_connection_drafts
          (connection_id,draft_type,body,character_count,generation_source,template_version,created_at,updated_at)
          SELECT ?,draft_type,body,character_count,generation_source,template_version,created_at,updated_at
          FROM linkedin_connection_drafts WHERE connection_id=?`).run(target.id, source.id);
        database.prepare("DELETE FROM linkedin_connection_drafts WHERE connection_id=?").run(source.id);
        database.prepare("DELETE FROM linkedin_connections WHERE id=?").run(source.id);
        merged++;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return merged;
}

async function main() {
  const exportDirs = process.argv.slice(2).length ? process.argv.slice(2).map((item) => path.resolve(item)) : DEFAULT_EXPORTS;
  const unique = new Map();
  for (const dir of exportDirs) {
    const connections = await fs.readFile(path.join(dir, "Connections.csv"), "utf8");
    const messages = await fs.readFile(path.join(dir, "messages.csv"), "utf8");
    const hash = crypto.createHash("sha256").update(connections).update("\0").update(messages).digest("hex");
    if (!unique.has(hash)) unique.set(hash, { dir, connections, messages, hash });
  }
  const sources = [...unique.values()];
  const connectionRecords = new Map();
  const messageRecords = [];
  for (const source of sources) {
    for (const row of parseCsv(source.connections)) {
      const name = `${row["First Name"] || ""} ${row["Last Name"] || ""}`.replace(/\s+/g, " ").trim();
      const connected_on = isoDay(row["Connected On"]);
      if (!name || !connected_on) continue;
      const identity_key = `linkedin-connection:${normalizeConnectionName(name)}|${connected_on}`;
      connectionRecords.set(identity_key, {
        identity_key, name, connected_on,
        headline: [row.Position, row.Company].filter(Boolean).join(" at ") || "Role needs confirmation",
        profile_url: row.URL,
      });
    }
    messageRecords.push(...parseCsv(source.messages));
  }
  const records = [...connectionRecords.values()];
  const directProfiles = new Map(records.map((record) => [record.identity_key, record.profile_url]));
  const database = db();
  importLinkedinConnections(database, connectionText(records), { sourceFile: "LinkedIn official export Connections.csv", directProfiles });
  const legacyDuplicatesMerged = mergeLegacySearchDuplicates(database);
  const chats = syntheticChatPages(messageRecords);
  const importedChats = importLinkedinChats(database, chats.text, { sourceFile: "LinkedIn official export messages.csv", referenceDay: "2026-07-16" });
  const findConnection = database.prepare("SELECT id FROM linkedin_connections WHERE profile_url=?");
  const updateConversationProfile = database.prepare("UPDATE linkedin_conversations SET profile_url=?,connection_id=coalesce(connection_id,?),updated_at=? WHERE identity_key=?");
  const profileUpdatedAt = new Date().toISOString();
  for (const [normalizedName, profileUrl] of chats.profiles) {
    const connection = findConnection.get(profileUrl);
    updateConversationProfile.run(profileUrl, connection?.id || null, profileUpdatedAt, `linkedin-chat:${normalizedName}`);
  }
  const currentConnections = database.prepare("SELECT id,name,profile_url,primary_product FROM linkedin_connections").all();
  const connectionsByName = new Map();
  for (const connection of currentConnections) {
    const key = normalizeConnectionName(connection.name);
    if (!connectionsByName.has(key)) connectionsByName.set(key, []);
    connectionsByName.get(key).push(connection);
  }
  const unmatchedConversations = database.prepare("SELECT id,name FROM linkedin_conversations WHERE connection_id IS NULL").all();
  const linkByName = database.prepare("UPDATE linkedin_conversations SET connection_id=?,profile_url=?,updated_at=? WHERE id=?");
  for (const conversation of unmatchedConversations) {
    const matches = connectionsByName.get(normalizeConnectionName(conversation.name)) || [];
    if (matches.length === 1) linkByName.run(matches[0].id, matches[0].profile_url, profileUpdatedAt, conversation.id);
  }
  database.prepare(`UPDATE linkedin_conversations SET product='other',status='closed',
    next_action='No action — LinkedIn promotional or system thread',updated_at=?
    WHERE source_file='LinkedIn official export messages.csv' AND connection_id IS NULL
    AND profile_url IS NULL AND workflow_source<>'human'`).run(profileUpdatedAt);
  try {
    const overrides = JSON.parse(await fs.readFile(fromRoot("data", "inputs", "linkedin-conversation-profile-overrides.json"), "utf8"));
    const applyOverride = database.prepare("UPDATE linkedin_conversations SET profile_url=?,updated_at=? WHERE identity_key=?");
    for (const override of overrides) {
      if (!/^https:\/\/[^/]*linkedin\.com\/in\//i.test(override.profile_url || "")) continue;
      applyOverride.run(override.profile_url, profileUpdatedAt, `linkedin-chat:${normalizeConnectionName(override.name)}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  syncLinkedinOperatingLoop(database);

  const archive = fromRoot("data", "inputs", "linkedin-export-2026-07-15");
  await fs.mkdir(archive, { recursive: true });
  await fs.writeFile(path.join(archive, "Connections.csv"), sources[0].connections, "utf8");
  await fs.writeFile(path.join(archive, "messages.csv"), sources[0].messages, "utf8");
  await fs.writeFile(fromRoot("data", "inputs", "linkedin-connections-cleaned.csv"), toCsv(catalogueRows(database)), "utf8");
  database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_official_export_imported_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(new Date().toISOString());
  database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_official_export_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(sources[0].hash);
  console.log(JSON.stringify({
    supplied_directories: exportDirs.length,
    unique_exports: sources.length,
    duplicate_exports_ignored: exportDirs.length - sources.length,
    official_connections: records.length,
    direct_profile_urls: database.prepare("SELECT COUNT(*) n FROM linkedin_connections WHERE profile_status='direct'").get().n,
    legacy_duplicates_merged: legacyDuplicatesMerged,
    official_message_rows: messageRecords.length,
    imported_conversations: importedChats.conversations.length,
    imported_messages: importedChats.conversations.reduce((sum, item) => sum + item.messages.length, 0),
    skipped_group_conversations: chats.skippedGroupChats,
    archive,
  }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
