import { db } from "./db.js";
import { getLead } from "./crm-model.js";
import { GoogleCalendarProvider } from "./google-workspace.js";
import { recordRevenueEvent } from "./revenue-events.js";
import { PLAYS_BY_ID } from "./sales-plays.js";

const now = () => new Date().toISOString();

export async function proposeMeetingTimes({ lead_id, timezone = "Europe/London", duration_minutes = 30, count = 3, provider = null } = {}, database = db()) {
  const lead = getLead(database, lead_id);
  if (!lead) throw new Error(`no such lead: ${lead_id}`);
  if (lead.stage !== "engaged") throw new Error("meeting times are offered only after a captured reply");
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 86400000);
  const busy = provider ? await provider.busy({ timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: timezone }) : [];
  const overlaps = (start, end) => busy.some((slot) => new Date(slot.start) < end && new Date(slot.end) > start);
  const slots = [];
  for (let offset = 1; offset <= 14 && slots.length < count; offset++) {
    const day = new Date(from.getTime() + offset * 86400000);
    if ([0, 6].includes(day.getDay())) continue;
    for (const hour of [10, 14, 16]) {
      const start = new Date(day); start.setUTCHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + duration_minutes * 60000);
      if (!overlaps(start, end)) slots.push({ starts_at: start.toISOString(), ends_at: end.toISOString(), timezone });
      if (slots.length >= count) break;
    }
  }
  return { lead_id, slots };
}

export async function bookMeeting({ lead_id, starts_at, ends_at, timezone = "Europe/London", attendees = [], opportunity_id = null, provider = new GoogleCalendarProvider() } = {}, database = db()) {
  const lead = getLead(database, lead_id);
  if (!lead) throw new Error(`no such lead: ${lead_id}`);
  if (lead.stage !== "engaged") throw new Error("meeting booking requires an engaged lead");
  if (!starts_at || !ends_at) throw new Error("meeting booking requires starts_at and ends_at");
  const resolvedAttendees = [...new Set([lead.email_best, ...attendees].filter(Boolean))];
  const external = await provider.createMeeting({ summary: `Discovery — ${lead.company}`, description: `Conversation with ${lead.name} about ${lead.play_id}.`, starts_at, ends_at, timezone, attendees: resolvedAttendees });
  const brief = buildCallBrief(lead_id, database);
  const t = now();
  const info = database.prepare(`INSERT INTO meetings(lead_id,opportunity_id,status,starts_at,ends_at,timezone,attendees,provider,provider_event_id,conference_url,brief,created_at,updated_at)
    VALUES(?,?,'booked',?,?,?,?, 'google_calendar',?,?,?,?,?)`).run(lead_id, opportunity_id, starts_at, ends_at, timezone, JSON.stringify(resolvedAttendees), external.event_id, external.conference_url || null, JSON.stringify(brief), t, t);
  const meeting = database.prepare("SELECT * FROM meetings WHERE id=?").get(Number(info.lastInsertRowid));
  await recordRevenueEvent({ lead_id, type: "meeting", occurred_at: t, source: "calendar-sync", dedupe_key: `calendar:meeting:${external.event_id}`, payload: { meeting_id: meeting.id, starts_at, ends_at, timezone, attendees: resolvedAttendees, provider_event_id: external.event_id, conference_url: external.conference_url || null } }, database);
  return meeting;
}

export function buildCallBrief(leadId, database = db()) {
  const lead = getLead(database, leadId);
  if (!lead) throw new Error(`no such lead: ${leadId}`);
  const play = PLAYS_BY_ID[lead.play_id] || null;
  const reply = database.prepare("SELECT payload,occurred_at FROM activity_events WHERE lead_id=? AND type='reply' ORDER BY occurred_at DESC LIMIT 1").get(leadId);
  const replyPayload = reply ? JSON.parse(reply.payload || "{}") : null;
  return {
    company: lead.company,
    person: lead.name,
    title: lead.title,
    play_id: lead.play_id,
    objective: "Confirm the problem, consequence, owner, timing, decision path, and next step without negotiating scope prematurely.",
    public_trigger: lead.research?.trigger_event || lead.research?.why_now || null,
    buyer_reason: lead.research?.why_this_person || lead.role_relevance_note || null,
    offer: play?.first_offer || null,
    latest_reply: replyPayload ? { body: replyPayload.body || null, classification: replyPayload.classification || null, occurred_at: reply.occurred_at } : null,
    discovery_questions: play?.discovery_questions || [],
    success_metrics_to_test: play?.success_metrics || [],
    proof_required: play?.proof_required || [],
    guardrails: play?.hard_disqualifiers || [],
  };
}

export function listMeetings(leadId = null, database = db()) {
  return leadId ? database.prepare("SELECT * FROM meetings WHERE lead_id=? ORDER BY starts_at").all(leadId) : database.prepare("SELECT * FROM meetings ORDER BY starts_at").all();
}
