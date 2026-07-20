import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { fromRoot } from "./paths.js";
import { normalizeConnectionName } from "./linkedin-connections.js";
import { analyzeLinkedinConversation, buildOutreachInsights, parseLinkedinChatsText } from "./linkedin-chats.js";
import { syncLinkedinOperatingLoop } from "./founder-ops.js";

const DEFAULT_INPUT = fromRoot("allchats.txt");
const DEFAULT_OUTPUT = fromRoot("data", "inputs", "linkedin-chats-cleaned.jsonl");

function mergeParsedConversations(parsed) {
  const merged = new Map();
  for (const conversation of parsed) {
    const current = merged.get(conversation.identity_key) || { ...conversation, messages: [] };
    if ((conversation.headline || "").length > (current.headline || "").length) current.headline = conversation.headline;
    const fingerprints = new Set(current.messages.map((message) => message.fingerprint));
    for (const message of conversation.messages) {
      if (!fingerprints.has(message.fingerprint)) current.messages.push(message);
      fingerprints.add(message.fingerprint);
    }
    current.messages.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    merged.set(conversation.identity_key, current);
  }
  return [...merged.values()];
}

function rowsByNormalizedName(rows) {
  const result = new Map();
  for (const row of rows) {
    const key = normalizeConnectionName(row.name);
    if (!key) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}

function uniqueMatch(map, name) {
  const matches = map.get(normalizeConnectionName(name)) || [];
  return matches.length === 1 ? matches[0] : null;
}

function inferProduct(conversation) {
  const text = conversation.messages.map((message) => message.body).join(" ").toLowerCase();
  if (/\b(outagehub|power outage|outage data|electric utilit|power grid|grid outage)\b/.test(text)) return "outagehub";
  if (/\b(robotics|automation|manufacturing|production workflow|plant floor|packaging|packing|kitting|warehouse|fleet maintenance|manual tasks?)\b/.test(text)) return "morrow";
  if (/\b(gnk|software engineering studio|engineering studio|backend|production ai|mainframe|legacy application|data systems?)\b/.test(text)) return "gnk";
  return "other";
}

export function importLinkedinChats(database, text, { sourceFile = "allchats.txt", referenceDay = "2026-07-15", nameHint = "" } = {}) {
  const parsed = mergeParsedConversations(parseLinkedinChatsText(text, { referenceDay, nameHint }));
  const connections = rowsByNormalizedName(database.prepare("SELECT id,name,headline,primary_product,contacted_at FROM linkedin_connections").all());
  const leads = rowsByNormalizedName(database.prepare("SELECT id,name,product FROM leads WHERE name IS NOT NULL AND trim(name)<>''").all());
  const now = new Date().toISOString();
  const upsertConversation = database.prepare(`INSERT INTO linkedin_conversations
    (identity_key,name,headline,product,connection_id,linked_lead_id,status,response_theme,summary,next_action,
     follow_up_at,meeting_at,meeting_timezone,meeting_label,meeting_status,contact_details,workflow_source,
     message_count,inbound_count,outbound_count,first_message_at,last_message_at,last_inbound_at,last_outbound_at,
     source_file,created_at,updated_at)
    VALUES(@identity_key,@name,@headline,@product,@connection_id,@linked_lead_id,@status,@response_theme,@summary,@next_action,
     @follow_up_at,@meeting_at,@meeting_timezone,@meeting_label,@meeting_status,@contact_details,'rules',
     @message_count,@inbound_count,@outbound_count,@first_message_at,@last_message_at,@last_inbound_at,@last_outbound_at,
     @source_file,@created_at,@updated_at)
    ON CONFLICT(identity_key) DO UPDATE SET
      name=excluded.name,headline=excluded.headline,product=excluded.product,
      connection_id=coalesce(linkedin_conversations.connection_id,excluded.connection_id),
      linked_lead_id=coalesce(linkedin_conversations.linked_lead_id,excluded.linked_lead_id),
      status=CASE WHEN excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.status
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.status ELSE excluded.status END,
      response_theme=excluded.response_theme,summary=excluded.summary,
      next_action=CASE WHEN excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.next_action
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.next_action ELSE excluded.next_action END,
      follow_up_at=CASE WHEN excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.follow_up_at
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.follow_up_at ELSE excluded.follow_up_at END,
      meeting_at=CASE WHEN excluded.meeting_at IS NOT NULL AND excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.meeting_at
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.meeting_at ELSE excluded.meeting_at END,
      meeting_timezone=CASE WHEN excluded.meeting_at IS NOT NULL AND excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.meeting_timezone
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.meeting_timezone ELSE excluded.meeting_timezone END,
      meeting_label=CASE WHEN excluded.meeting_at IS NOT NULL AND excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.meeting_label
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.meeting_label ELSE excluded.meeting_label END,
      meeting_status=CASE WHEN excluded.meeting_at IS NOT NULL AND excluded.last_message_at>coalesce(linkedin_conversations.last_message_at,'') THEN excluded.meeting_status
        WHEN linkedin_conversations.workflow_source='human' THEN linkedin_conversations.meeting_status ELSE excluded.meeting_status END,
      contact_details=excluded.contact_details,message_count=excluded.message_count,inbound_count=excluded.inbound_count,
      outbound_count=excluded.outbound_count,first_message_at=excluded.first_message_at,last_message_at=excluded.last_message_at,
      last_inbound_at=excluded.last_inbound_at,last_outbound_at=excluded.last_outbound_at,source_file=excluded.source_file,
      updated_at=excluded.updated_at`);
  const insertMessage = database.prepare(`INSERT INTO linkedin_messages
    (conversation_id,fingerprint,sender_name,direction,sent_at,sent_at_label,body,source_line,created_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET
    conversation_id=excluded.conversation_id,sender_name=excluded.sender_name,direction=excluded.direction,
    sent_at=excluded.sent_at,sent_at_label=excluded.sent_at_label,body=excluded.body,source_line=excluded.source_line`);
  const markContacted = database.prepare(`UPDATE linkedin_connections SET contacted_at=coalesce(contacted_at,?),
    contact_channel=coalesce(contact_channel,'linkedin'),updated_at=? WHERE id=?`);
  const routeFromConversation = database.prepare(`UPDATE linkedin_connections SET primary_product=?,relationship_intent=?,
    relationship_role=?,classification_confidence='confirmed',classification_score=max(classification_score,12),
    classification_reason=?,classification_source='conversation',updated_at=?
    WHERE id=? AND primary_product='other' AND classification_source<>'human'`);
  const imported = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const parsedConversation of parsed) {
      const existing = database.prepare("SELECT id FROM linkedin_conversations WHERE identity_key=?").get(parsedConversation.identity_key);
      const existingMessages = existing ? database.prepare("SELECT * FROM linkedin_messages WHERE conversation_id=? ORDER BY sent_at,id").all(existing.id) : [];
      const combinedMessages = new Map(existingMessages.map((message) => [message.fingerprint, message]));
      for (const message of parsedConversation.messages) combinedMessages.set(message.fingerprint, message);
      const conversation = { ...parsedConversation, messages: [...combinedMessages.values()].sort((a, b) => a.sent_at.localeCompare(b.sent_at)) };
      const connection = uniqueMatch(connections, conversation.name);
      const lead = uniqueMatch(leads, conversation.name);
      const inferredProduct = inferProduct(conversation);
      const product = inferredProduct !== "other" ? inferredProduct
        : connection?.primary_product && connection.primary_product !== "other" ? connection.primary_product
          : lead?.product || "other";
      const analysis = analyzeLinkedinConversation(conversation, { product, referenceDay });
      const row = {
        ...conversation,
        ...analysis,
        headline: connection?.headline || conversation.headline,
        connection_id: connection?.id || null,
        linked_lead_id: lead?.id || null,
        contact_details: JSON.stringify(analysis.contact_details),
        source_file: sourceFile,
        created_at: now,
        updated_at: now,
      };
      const { messages: _messages, ...statementRow } = row;
      upsertConversation.run(statementRow);
      const stored = database.prepare("SELECT id FROM linkedin_conversations WHERE identity_key=?").get(conversation.identity_key);
      for (const message of conversation.messages) {
        insertMessage.run(stored.id, message.fingerprint, message.sender_name, message.direction, message.sent_at,
          message.sent_at_label, message.body, message.source_line, now);
      }
      const firstOutbound = conversation.messages.filter((message) => message.direction === "outbound").sort((a, b) => a.sent_at.localeCompare(b.sent_at))[0];
      if (connection && firstOutbound) markContacted.run(firstOutbound.sent_at, now, connection.id);
      if (connection && connection.primary_product === "other" && inferredProduct !== "other") {
        routeFromConversation.run(
          inferredProduct,
          inferredProduct === "gnk" ? "gnk_sell" : inferredProduct === "outagehub" ? "outagehub_sell" : "morrow_research",
          inferredProduct === "morrow" ? "research_subject" : "buyer_or_router",
          `Conversation history explicitly discusses a ${inferredProduct === "outagehub" ? "power-outage operations" : inferredProduct === "morrow" ? "robotics/automation workflow" : "software engineering"} use case.`,
          now,
          connection.id,
        );
      }
      imported.push({ ...row, contact_details: analysis.contact_details, messages: conversation.messages });
    }
    database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_chats_imported_at',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(now);
    database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_chats_source_count',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(imported.length));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const canonical = syncLinkedinOperatingLoop(database);
  return { conversations: imported, insights: buildOutreachInsights(imported), canonical };
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_INPUT);
  const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const text = await fs.readFile(inputPath, "utf8");
  const database = db();
  const result = importLinkedinChats(database, text, { sourceFile: path.basename(inputPath) });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.conversations.map((conversation) => JSON.stringify(conversation)).join("\n") + "\n", "utf8");
  console.log(JSON.stringify({
    conversations: result.conversations.length,
    messages: result.conversations.reduce((total, conversation) => total + conversation.messages.length, 0),
    matched_connections: result.conversations.filter((conversation) => conversation.connection_id).length,
    matched_crm_leads: result.conversations.filter((conversation) => conversation.linked_lead_id).length,
    products: Object.fromEntries(["gnk", "outagehub", "morrow", "other"].map((product) => [product, result.conversations.filter((item) => item.product === product).length])),
    scheduled_meetings: result.insights.scheduled,
    response_rate: result.insights.response_rate,
    canonical: result.canonical,
    cleaned_jsonl: outputPath,
  }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
