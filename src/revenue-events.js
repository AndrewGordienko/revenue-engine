import { db } from "./db.js";
import { getLead, recordEvent } from "./crm-model.js";
import { appendMemory } from "./lead-memory.js";
import { classifyReply } from "./reply-classifier.js";
import { recordOutcomeInsight } from "./ontology-record.js";

const REVENUE_EVENTS = new Set(["sent", "delivered", "bounced", "reply", "meeting", "unsubscribe", "outcome"]);
const now = () => new Date().toISOString();

function responseFor(lead, classification) {
  const first = String(lead.name || "there").trim().split(/\s+/)[0];
  if (classification.intent === "positive") {
    return `Hi ${first},\n\nThanks — happy to compare notes. I can send a couple of meeting times, or work around a time that is easier for you.\n\nAndrew`;
  }
  if (classification.intent === "referral") {
    return `Hi ${first},\n\nThanks for pointing me in the right direction. Would you prefer to introduce us, or should I contact them directly and mention you routed me?\n\nAndrew`;
  }
  if (classification.intent === "defer" || classification.objections.includes("timing")) {
    return `Hi ${first},\n\nUnderstood — I’ll leave this with you and follow up at the timing you suggested.\n\nAndrew`;
  }
  if (classification.intent === "objection") {
    return `Hi ${first},\n\nThanks for the context. I’ll keep the constraint you mentioned in mind and won’t push a broader conversation.\n\nAndrew`;
  }
  return null;
}

function createResponseDraft(database, lead, classification, originalPayload) {
  const body = responseFor(lead, classification);
  if (!body || ["unsubscribe", "negative"].includes(classification.intent)) return null;
  const t = now();
  const subject = originalPayload.subject ? `Re: ${String(originalPayload.subject).replace(/^re:\s*/i, "")}` : "Re: your reply";
  const info = database.prepare(`INSERT INTO outreach_messages
    (lead_id,cohort_id,pipeline_run_id,strategy_version,message_type,touch_number,recipient,subject,body,status,created_at,updated_at)
    VALUES(?,?,?,?, 'reply_draft',NULL,?,?,?,'pending_approval',?,?)`)
    .run(lead.id, lead.cohort_id, lead.pipeline_run_id, lead.strategy_version, lead.email_best || "unknown", subject, body, t, t);
  return database.prepare("SELECT * FROM outreach_messages WHERE id=?").get(Number(info.lastInsertRowid));
}

async function mirrorToMemory(lead, type, payload, source) {
  const mapped = type === "sent" ? "email_sent" : type === "reply" ? "reply" : type === "meeting" ? "meeting" : type === "outcome" ? "outcome" : null;
  if (!mapped) return null;
  return appendMemory(lead.product, { lead_id: lead.id, type: mapped, actor: source, payload });
}

export async function recordRevenueEvent({ lead_id, type, occurred_at = null, source = "dashboard", payload = {}, dedupe_key = null } = {}, database = db()) {
  if (!lead_id) throw new Error("revenue event requires lead_id");
  if (!REVENUE_EVENTS.has(type)) throw new Error(`unsupported revenue event: ${type}`);
  if (type === "reply" && !String(payload.body || payload.text || "").trim()) throw new Error("reply event requires the reply body");
  const before = getLead(database, lead_id);
  if (!before) throw new Error(`no such lead: ${lead_id}`);
  const classification = type === "reply" ? classifyReply(payload.body || payload.text) : null;
  const normalizedPayload = classification ? { ...payload, body: payload.body || payload.text, classification } : payload;
  const lead = recordEvent(database, lead_id, type, { occurred_at, source, payload: normalizedPayload, dedupe_key });

  if (payload.outreach_message_id) {
    const status = type === "sent" ? "sent" : type === "bounced" ? "failed" : null;
    if (status) database.prepare("UPDATE outreach_messages SET status=?, sent_at=COALESCE(sent_at,?), provider_message_id=COALESCE(?,provider_message_id), provider_thread_id=COALESCE(?,provider_thread_id), updated_at=? WHERE id=?")
      .run(status, type === "sent" ? occurred_at || now() : null, payload.provider_message_id || null, payload.provider_thread_id || null, now(), payload.outreach_message_id);
  }

  const responseDraft = classification ? createResponseDraft(database, lead, classification, normalizedPayload) : null;
  await mirrorToMemory(lead, type, normalizedPayload, source).catch(() => null);
  if ((type === "reply" || type === "outcome") && process.env.REVENUE_EVENT_SKIP_ONTOLOGY !== "1") {
    await recordOutcomeInsight(lead.product, {
      result: classification?.intent || payload.result || type,
      angle: payload.angle,
      segment: lead.research?.segment,
      company: lead.company,
    }).catch(() => null);
  }
  return { lead, classification, response_draft: responseDraft };
}

export function listRevenueEvents(leadId, database = db()) {
  return database.prepare("SELECT * FROM activity_events WHERE lead_id=? ORDER BY occurred_at,event_id").all(leadId).map((event) => ({ ...event, payload: JSON.parse(event.payload || "{}") }));
}
