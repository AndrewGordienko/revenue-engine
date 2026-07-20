import { createHash } from "node:crypto";
import { db } from "./db.js";
import { classifyReply } from "./reply-classifier.js";
import { syncPlaybookKnowledge } from "./playbooks.js";

const now = () => new Date().toISOString();
const PRODUCTS = ["gnk", "outagehub", "morrow"];
const ACTIVE_OPPORTUNITY_STAGES = new Set(["discovery", "qualified", "scoped", "solution_defined", "proposal", "proposal_sent", "commercial_commitment", "contracting"]);

function json(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function stableId(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 18);
}

function inferConversationPlay(product, conversation, messages) {
  const text = `${conversation.headline || ""} ${messages.map((message) => message.body).join(" ")}`.toLowerCase();
  if (product === "gnk") {
    if (/\b(ai|ml|llm|model|agent|copilot)\b/.test(text)) return "GNK-AI-01";
    if (/\b(data|workflow|spreadsheet|operations|automation)\b/.test(text)) return "GNK-DATA-01";
    return "GNK-BE-01";
  }
  if (product === "outagehub") {
    if (/\b(telecom|isp|network|noc|wireless|field operations)\b/.test(text)) return "OHUB-ISP-01";
    if (/\b(platform|software|api|product manager|embed)\b/.test(text)) return "OHUB-EMBED-01";
    return "OHUB-FAC-01";
  }
  if (product === "morrow") {
    if (/\b(food|cpg|plant|packaging|production|manufacturing)\b/.test(text)) return "MORROW-CPG-01";
    return "MORROW-COPACK-01";
  }
  return null;
}

function ensureImportLineage(database, product) {
  const strategy = "salesv3-2.0-linkedin";
  const cohort = `linkedin-relationships-${product}`;
  const run = `linkedin-import-${product}`;
  const t = now();
  database.prepare(`INSERT INTO cohorts(cohort_id,product,strategy_version,created_at,note,status,rules)
    VALUES(?,?,?,?,?,'approved',?) ON CONFLICT(cohort_id) DO NOTHING`).run(
      cohort, product, strategy, t, "Relationship leads created from the operator's own LinkedIn conversation history.",
      JSON.stringify({ source: "linkedin-conversation-import", human_confirmation_required: true }),
    );
  database.prepare(`INSERT INTO pipeline_runs(pipeline_run_id,cohort_id,product,strategy_version,stage,status,started_at,completed_at,metadata)
    VALUES(?,?,?,?, 'relationship_import','completed',?,?,?) ON CONFLICT(pipeline_run_id) DO NOTHING`).run(
      run, cohort, product, strategy, t, t, JSON.stringify({ source: "linkedin", salesv3_version: "2.0" }),
    );
  return { strategy, cohort, run };
}

function ensureConversationLead(database, conversation) {
  if (conversation.linked_lead_id) {
    const existing = database.prepare("SELECT id FROM leads WHERE id=?").get(conversation.linked_lead_id);
    if (existing) return existing.id;
  }
  const product = PRODUCTS.includes(conversation.product) ? conversation.product : "gnk";
  const lineage = ensureImportLineage(database, product);
  const id = `lead_linkedin_${stableId(conversation.identity_key)}`;
  const t = now();
  database.prepare(`INSERT INTO leads(
    id,product,cohort_id,pipeline_run_id,strategy_version,company,name,title,linkedin_url,
    identity_key,identity_confidence,stage,needs_review,review_reasons,source_stores,research,created_at,updated_at
  ) VALUES(?,?,?,?,?,NULL,?,?,NULL,?,'weak','target',1,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    product=excluded.product,name=excluded.name,title=coalesce(excluded.title,leads.title),updated_at=excluded.updated_at`).run(
      id, product, lineage.cohort, lineage.run, lineage.strategy,
      conversation.name, conversation.headline || null, `linkedin-conversation:${conversation.identity_key}`,
      JSON.stringify(["linkedin_identity_requires_confirmation"]),
      JSON.stringify([conversation.source_file || "allchats.txt"]),
      JSON.stringify({ linkedin_conversation_id: conversation.id, relationship_source: "linkedin", imported: true }),
      t, t,
    );
  database.prepare("UPDATE linkedin_conversations SET linked_lead_id=?,updated_at=? WHERE id=?").run(id, t, conversation.id);
  return id;
}

function insertCanonicalMessageEvent(database, leadId, conversation, message) {
  const type = message.direction === "inbound" ? "reply" : "sent";
  const classification = type === "reply" ? classifyReply(message.body) : null;
  const payload = {
    channel: "linkedin",
    body: message.body,
    direction: message.direction,
    sender_name: message.sender_name,
    linkedin_conversation_id: conversation.id,
    linkedin_message_id: message.id,
    fingerprint: message.fingerprint,
    source_file: conversation.source_file,
    source_line: message.source_line,
    source_label: message.sent_at_label,
    timestamp_confidence: "inferred",
    classification,
    raw_provenance: {
      table: "linkedin_messages",
      record_id: message.id,
      fingerprint: message.fingerprint,
    },
  };
  const t = now();
  database.prepare(`INSERT OR IGNORE INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
    SELECT id,?,?,?,?,?,?,?,? FROM leads WHERE id=?`).run(
      type, message.sent_at, t, conversation.cohort_id || null, conversation.pipeline_run_id || null,
      "linkedin-import", JSON.stringify(payload), `linkedin:message:${message.fingerprint}`, leadId,
    );
}

function upsertOutcome(database, conversation) {
  const tags = [];
  if (conversation.inbound_count > 0) tags.push("substantive_reply");
  if (conversation.meeting_status === "scheduled") tags.push("call_booked");
  if (conversation.meeting_status === "proposed") tags.push("call_proposed");
  if (conversation.response_theme && conversation.response_theme !== "no_reply") tags.push(conversation.response_theme);
  const t = now();
  database.prepare(`INSERT INTO conversation_outcomes
    (conversation_id,primary_outcome,secondary_tags,confidence,created_at,updated_at)
    VALUES(?,?,?,'inferred',?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      primary_outcome=CASE WHEN conversation_outcomes.confirmed_by IS NULL THEN excluded.primary_outcome ELSE conversation_outcomes.primary_outcome END,
      secondary_tags=CASE WHEN conversation_outcomes.confirmed_by IS NULL THEN excluded.secondary_tags ELSE conversation_outcomes.secondary_tags END,
      updated_at=excluded.updated_at`).run(
      conversation.id, conversation.response_theme || "no_reply", JSON.stringify([...new Set(tags)]), t, t,
    );
}

export function putOpenAction(database, {
  entityType, entityId, actionType, dueAt = null, priority = 50, reason = null, sourceKey = null,
}) {
  const t = now();
  if (sourceKey) {
    const prior = database.prepare("SELECT id FROM next_actions WHERE source_key=?").get(sourceKey);
    if (prior) {
      database.prepare(`UPDATE next_actions SET status='cancelled',completed_at=?,updated_at=?
        WHERE entity_type=? AND entity_id=? AND status='open' AND id<>?`)
        .run(t, t, entityType, String(entityId), prior.id);
      database.prepare(`UPDATE next_actions SET entity_type=?,entity_id=?,action_type=?,due_at=?,owner='Andrew',
        status='open',priority=?,reason=?,completed_at=NULL,updated_at=? WHERE id=?`)
        .run(entityType, String(entityId), actionType, dueAt, priority, reason, t, prior.id);
      return prior.id;
    }
  }
  const current = database.prepare(`SELECT * FROM next_actions
    WHERE entity_type=? AND entity_id=? AND status='open'`).get(entityType, String(entityId));
  if (current) {
    database.prepare(`UPDATE next_actions SET action_type=?,due_at=?,priority=?,reason=?,source_key=coalesce(source_key,?),updated_at=? WHERE id=?`)
      .run(actionType, dueAt, priority, reason, sourceKey, t, current.id);
    return current.id;
  }
  const inserted = database.prepare(`INSERT INTO next_actions
    (entity_type,entity_id,action_type,due_at,owner,status,priority,reason,source_key,created_at,updated_at)
    VALUES(?,?,?,?,'Andrew','open',?,?,?,?,?)`).run(
      entityType, String(entityId), actionType, dueAt, priority, reason, sourceKey, t, t,
    );
  return Number(inserted.lastInsertRowid);
}

function actionForConversation(conversation, reference = new Date()) {
  const today = reference.toISOString();
  if (conversation.status === "closed") return null;
  if (conversation.meeting_status === "scheduled" || conversation.meeting_status === "proposed") {
    return { actionType: "confirm_meeting", dueAt: today, priority: 100, reason: "Confirm the inferred date, time zone, intent, and calendar record." };
  }
  if (conversation.status === "needs_reply") {
    if (/not available for (?:a )?(?:phone )?call|answers? to your questions|sent in writing/i.test(conversation.summary || "")) {
      return { actionType: "reply", dueAt: today, priority: 115, reason: "Send three to five concise written questions and respect the request not to schedule a call." };
    }
    return { actionType: "reply", dueAt: today, priority: 110, reason: conversation.next_action || "Respond to the live LinkedIn conversation." };
  }
  if (conversation.response_theme === "referral") {
    return { actionType: "work_referral", dueAt: today, priority: 105, reason: "Contact the referred owner with the introducer's context and ask for one short validation conversation." };
  }
  if (conversation.inbound_count > 0) {
    return { actionType: "decide_next_step", dueAt: conversation.follow_up_at || today, priority: 90, reason: conversation.next_action || "Classify the reply and decide the commercial next step." };
  }
  const last = conversation.last_outbound_at ? new Date(conversation.last_outbound_at) : reference;
  if (conversation.outbound_count < 2) {
    const due = new Date(last.getTime() + 5 * 86400000).toISOString();
    return { actionType: "follow_up", dueAt: due, priority: 50, reason: "One deliberate follow-up is allowed four to seven business days after the first touch." };
  }
  return { actionType: "revisit_on_new_trigger", dueAt: null, priority: 20, reason: "Two-touch limit reached. Watch only for a new trigger, artifact, or warm context." };
}

function upsertMeetingCandidate(database, conversation, leadId) {
  if (!conversation.meeting_at || !["scheduled", "proposed"].includes(conversation.meeting_status)) return null;
  const starts = new Date(conversation.meeting_at);
  if (Number.isNaN(starts.getTime())) return null;
  const ends = new Date(starts.getTime() + 30 * 60000).toISOString();
  const sourceKey = `linkedin:conversation:${conversation.id}:meeting:${conversation.meeting_at}`;
  const t = now();
  database.prepare(`INSERT INTO meetings(
    lead_id,status,starts_at,ends_at,timezone,attendees,provider,brief,confirmation_status,time_confidence,intent,
    source_conversation_id,source_key,created_at,updated_at
  ) VALUES(?,'proposed',?,?,?,?, 'linkedin_import',?,'unconfirmed','inferred','research',?,?,?,?)
  ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO UPDATE SET
    starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,updated_at=excluded.updated_at`).run(
      leadId, starts.toISOString(), ends, conversation.meeting_timezone || "unconfirmed", JSON.stringify([]),
      JSON.stringify({ person: conversation.name, headline: conversation.headline, summary: conversation.summary, evidence_source: "linkedin_chat" }),
      conversation.id, sourceKey, t, t,
    );
  return database.prepare("SELECT * FROM meetings WHERE source_key=?").get(sourceKey);
}

export function syncLinkedinOperatingLoop(database = db()) {
  const conversations = database.prepare(`SELECT c.*,l.cohort_id,l.pipeline_run_id
    FROM linkedin_conversations c LEFT JOIN leads l ON l.id=c.linked_lead_id ORDER BY c.id`).all();
  const messagesByConversation = new Map();
  for (const message of database.prepare("SELECT * FROM linkedin_messages ORDER BY conversation_id,sent_at,id").all()) {
    if (!messagesByConversation.has(message.conversation_id)) messagesByConversation.set(message.conversation_id, []);
    messagesByConversation.get(message.conversation_id).push(message);
  }
  let eventsAdded = 0;
  let leadsCreated = 0;
  let meetingsQueued = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const rawConversation of conversations) {
      const before = rawConversation.linked_lead_id;
      const leadId = ensureConversationLead(database, rawConversation);
      if (!before) leadsCreated += 1;
      const lead = database.prepare("SELECT * FROM leads WHERE id=?").get(leadId);
      const conversation = { ...rawConversation, linked_lead_id: leadId, cohort_id: lead.cohort_id, pipeline_run_id: lead.pipeline_run_id };
      const messages = messagesByConversation.get(conversation.id) || [];
      const playId = conversation.play_id || lead.play_id || inferConversationPlay(conversation.product, conversation, messages);
      if (playId) {
        database.prepare("UPDATE linkedin_conversations SET play_id=?,updated_at=? WHERE id=?").run(playId, now(), conversation.id);
        database.prepare("UPDATE leads SET play_id=coalesce(play_id,?),updated_at=? WHERE id=?").run(playId, now(), leadId);
        conversation.play_id = playId;
      }
      for (const message of messages) {
        const beforeCount = database.prepare("SELECT COUNT(*) n FROM activity_events WHERE dedupe_key=?").get(`linkedin:message:${message.fingerprint}`).n;
        insertCanonicalMessageEvent(database, leadId, conversation, message);
        if (!beforeCount) eventsAdded += 1;
      }
      const nextStage = messages.some((message) => message.direction === "inbound") ? "engaged"
        : messages.some((message) => message.direction === "outbound") ? "enrolled" : lead.stage;
      database.prepare("UPDATE leads SET stage=?,updated_at=? WHERE id=?").run(nextStage, now(), leadId);
      upsertOutcome(database, conversation);
      const action = actionForConversation(conversation);
      if (action) putOpenAction(database, { entityType: "conversation", entityId: conversation.id, sourceKey: `linkedin:conversation:${conversation.id}:next`, ...action });
      else database.prepare(`UPDATE next_actions SET status='cancelled',completed_at=?,updated_at=?
        WHERE entity_type='conversation' AND entity_id=? AND status='open'`).run(now(), now(), String(conversation.id));
      const meeting = upsertMeetingCandidate(database, conversation, leadId);
      if (meeting) meetingsQueued += 1;
    }
    database.prepare(`INSERT INTO meta(key,value) VALUES('linkedin_operating_loop_synced_at',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(now());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  syncPlaybookKnowledge(database);
  const totals = database.prepare(`SELECT
    SUM(type='sent' AND source='linkedin-import') sent,
    SUM(type='reply' AND source='linkedin-import') replies
    FROM activity_events`).get();
  return { conversations: conversations.length, events_added: eventsAdded, leads_created: leadsCreated, meetings_queued: meetingsQueued, canonical_sent: totals.sent || 0, canonical_replies: totals.replies || 0 };
}

export function listNextActions(database = db()) {
  return database.prepare(`SELECT a.*,
    c.name person_name,c.headline,c.product,c.status conversation_status,c.meeting_status,
    c.linked_lead_id,l.company,l.play_id,op.stage opportunity_stage,
    m.id meeting_id,m.starts_at meeting_at,m.timezone meeting_timezone,
    m.confirmation_status meeting_confirmation,m.intent meeting_intent
    FROM next_actions a
    LEFT JOIN linkedin_conversations c ON a.entity_type='conversation' AND c.id=CAST(a.entity_id AS INTEGER)
    LEFT JOIN opportunities op ON a.entity_type='opportunity' AND op.id=CAST(a.entity_id AS INTEGER)
    LEFT JOIN leads l ON l.id=coalesce(c.linked_lead_id,op.lead_id,CASE WHEN a.entity_type='lead' THEN a.entity_id END)
    LEFT JOIN meetings m ON m.source_conversation_id=c.id AND m.source_key IS NOT NULL
    WHERE a.status='open'
    ORDER BY a.priority DESC,CASE WHEN a.due_at IS NULL THEN 1 ELSE 0 END,a.due_at ASC,a.id`).all();
}

export function updateNextAction(id, patch = {}, database = db()) {
  const action = database.prepare("SELECT * FROM next_actions WHERE id=?").get(id);
  if (!action) throw new Error("Next action not found.");
  const t = now();
  if (patch.command === "complete") {
    database.prepare("UPDATE next_actions SET status='completed',completed_at=?,updated_at=? WHERE id=?").run(t, t, id);
    const conversation = action.entity_type === "conversation"
      ? database.prepare("SELECT * FROM linkedin_conversations WHERE id=?").get(Number(action.entity_id)) : null;
    if (conversation?.linked_lead_id) {
      const lead = database.prepare("SELECT * FROM leads WHERE id=?").get(conversation.linked_lead_id);
      database.prepare(`INSERT OR IGNORE INTO activity_events
        (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
        VALUES(?,'note',?,?,?,?, 'dashboard',?,?)`).run(
          lead.id, t, t, lead.cohort_id, lead.pipeline_run_id,
          JSON.stringify({ action_id: id, action_type: action.action_type, result: "completed" }), `next-action:${id}:completed`,
        );
    }
  } else if (patch.command === "snooze" || patch.command === "pause") {
    if (!patch.due_at) throw new Error("A due date is required.");
    database.prepare("UPDATE next_actions SET action_type=?,due_at=?,reason=coalesce(?,reason),updated_at=? WHERE id=?")
      .run(patch.command === "pause" ? "pause_until" : action.action_type, patch.due_at, patch.reason || null, t, id);
  } else if (patch.command === "close" || patch.command === "suppress") {
    database.prepare("UPDATE next_actions SET status='cancelled',completed_at=?,updated_at=? WHERE id=?").run(t, t, id);
    if (action.entity_type === "conversation") {
      const conversation = database.prepare("SELECT * FROM linkedin_conversations WHERE id=?").get(Number(action.entity_id));
      database.prepare("UPDATE linkedin_conversations SET status='closed',next_action=NULL,follow_up_at=NULL,workflow_source='human',updated_at=? WHERE id=?").run(t, Number(action.entity_id));
      if (patch.command === "suppress" && conversation?.linked_lead_id) {
        database.prepare("UPDATE leads SET do_not_contact=1,suppressed=1,updated_at=? WHERE id=?").run(t, conversation.linked_lead_id);
      }
    }
  } else {
    throw new Error("Unknown next-action command.");
  }
  return database.prepare("SELECT * FROM next_actions WHERE id=?").get(id);
}

export function recordManualLinkedinMessage(conversationId, input = {}, database = db()) {
  const conversation = database.prepare("SELECT * FROM linkedin_conversations WHERE id=?").get(conversationId);
  if (!conversation) throw new Error("Conversation not found.");
  const body = String(input.body || "").trim();
  if (!body) throw new Error("Message body is required.");
  if (body.length > 5000) throw new Error("Message body is too long.");
  const t = now();
  const fingerprint = createHash("sha256").update(`manual-linkedin|${conversationId}|${t}|${body}`).digest("hex");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`INSERT INTO linkedin_messages
      (conversation_id,fingerprint,sender_name,direction,sent_at,sent_at_label,body,source_line,created_at)
      VALUES(?,?,'Andrew','outbound',?,'Recorded manually in SalesV3',?,NULL,?)`).run(conversationId, fingerprint, t, body, t);
    database.prepare(`UPDATE linkedin_conversations SET
      status='waiting',message_count=message_count+1,outbound_count=outbound_count+1,
      first_message_at=coalesce(first_message_at,?),last_message_at=?,last_outbound_at=?,
      next_action='Wait for a reply, then follow the two-touch rule.',workflow_source='human',updated_at=? WHERE id=?`)
      .run(t, t, t, t, conversationId);
    if (conversation.connection_id) {
      database.prepare(`UPDATE linkedin_connections SET contacted_at=coalesce(contacted_at,?),contact_channel='linkedin',updated_at=? WHERE id=?`)
        .run(t, t, conversation.connection_id);
    }
    if (input.action_id) {
      database.prepare(`UPDATE next_actions SET status='completed',completed_at=?,updated_at=?
        WHERE id=? AND entity_type='conversation' AND entity_id=? AND status='open'`)
        .run(t, t, Number(input.action_id), String(conversationId));
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  syncLinkedinOperatingLoop(database);
  return {
    message: database.prepare("SELECT * FROM linkedin_messages WHERE fingerprint=?").get(fingerprint),
    conversation: database.prepare("SELECT * FROM linkedin_conversations WHERE id=?").get(conversationId),
  };
}

export function confirmMeeting(id, patch = {}, database = db()) {
  const meeting = database.prepare("SELECT * FROM meetings WHERE id=?").get(id);
  if (!meeting) throw new Error("Meeting not found.");
  const confirmation = patch.confirmation_status || "human_confirmed";
  if (!patch.starts_at && meeting.time_confidence !== "confirmed") throw new Error("Confirm the meeting time before booking.");
  const starts = patch.starts_at || meeting.starts_at;
  const ends = patch.ends_at || new Date(new Date(starts).getTime() + 30 * 60000).toISOString();
  const timezone = patch.timezone || meeting.timezone;
  if (!timezone || timezone === "unconfirmed") throw new Error("Confirm the meeting time zone.");
  const intent = ["research", "design_partner", "commercial_discovery", "active_deal"].includes(patch.intent) ? patch.intent : meeting.intent;
  const t = now();
  database.prepare(`UPDATE meetings SET status='booked',starts_at=?,ends_at=?,timezone=?,confirmation_status=?,time_confidence='confirmed',intent=?,updated_at=? WHERE id=?`)
    .run(starts, ends, timezone, confirmation, intent, t, id);
  const lead = database.prepare("SELECT * FROM leads WHERE id=?").get(meeting.lead_id);
  database.prepare(`INSERT OR IGNORE INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
    VALUES(?,'meeting',?,?,?,?, 'dashboard',?,?)`).run(
      lead.id, t, t, lead.cohort_id, lead.pipeline_run_id,
      JSON.stringify({ meeting_id: id, starts_at: starts, ends_at: ends, timezone, intent, confirmation }), `meeting:confirmed:${id}`,
    );
  if (meeting.source_conversation_id) {
    database.prepare(`UPDATE linkedin_conversations SET meeting_status='scheduled',status='meeting_booked',meeting_at=?,meeting_timezone=?,workflow_source='human',updated_at=? WHERE id=?`)
      .run(starts, timezone, t, meeting.source_conversation_id);
    const due = new Date(Math.max(Date.now(), new Date(starts).getTime() - 86400000)).toISOString();
    putOpenAction(database, { entityType: "conversation", entityId: meeting.source_conversation_id, actionType: "prepare_meeting", dueAt: due, priority: 100, reason: "Review the brief and define the desired commercial or learning outcome." });
  }
  return database.prepare("SELECT * FROM meetings WHERE id=?").get(id);
}

export function captureMeetingOutcome(id, outcome = {}, database = db()) {
  const meeting = database.prepare("SELECT * FROM meetings WHERE id=?").get(id);
  if (!meeting) throw new Error("Meeting not found.");
  const required = ["problem", "current_process", "consequence", "owner", "timing", "budget_path", "next_step", "correction_learned"];
  const missing = required.filter((field) => !String(outcome[field] || "").trim());
  if (missing.length) throw new Error(`Meeting outcome is missing: ${missing.join(", ")}`);
  const t = now();
  database.prepare("UPDATE meetings SET status='held',outcome=?,outcome_captured_at=?,updated_at=? WHERE id=?")
    .run(JSON.stringify(outcome), t, t, id);
  const lead = database.prepare("SELECT * FROM leads WHERE id=?").get(meeting.lead_id);
  database.prepare(`INSERT OR IGNORE INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
    VALUES(?,'outcome',?,?,?,?, 'dashboard',?,?)`).run(
      lead.id, t, t, lead.cohort_id, lead.pipeline_run_id, JSON.stringify({ meeting_id: id, ...outcome }), `meeting:outcome:${id}`,
    );
  if (meeting.source_conversation_id) {
    putOpenAction(database, { entityType: "conversation", entityId: meeting.source_conversation_id, actionType: "execute_next_step", dueAt: outcome.next_step_at || t, priority: 100, reason: outcome.next_step });
  }
  return database.prepare("SELECT * FROM meetings WHERE id=?").get(id);
}

export function qualifyConversationOpportunity(conversationId, qualification = {}, database = db()) {
  const conversation = database.prepare(`SELECT c.*,co.primary_outcome,co.confirmed_by
    FROM linkedin_conversations c LEFT JOIN conversation_outcomes co ON co.conversation_id=c.id WHERE c.id=?`).get(conversationId);
  if (!conversation) throw new Error("Conversation not found.");
  if (conversation.primary_outcome !== "qualified_commercial_interest" || !conversation.confirmed_by) {
    throw new Error("Confirm qualified commercial interest before opening an opportunity.");
  }
  const required = ["problem", "consequence", "owner", "timing", "commercial_path", "next_step"];
  const missing = required.filter((field) => !String(qualification[field] || "").trim());
  if (missing.length) throw new Error(`Qualification is missing: ${missing.join(", ")}`);
  const lead = database.prepare("SELECT * FROM leads WHERE id=?").get(conversation.linked_lead_id);
  if (!lead || lead.stage !== "engaged") throw new Error("The linked person must have a canonical reply before qualification.");
  const existing = database.prepare(`SELECT * FROM opportunities WHERE lead_id=? AND stage NOT IN ('won','lost') ORDER BY id DESC LIMIT 1`).get(lead.id);
  if (existing && existing.stage !== "discovery") throw new Error("An active qualified opportunity already exists for this relationship.");
  const t = now();
  const q = {
    problem: qualification.problem,
    consequence: qualification.consequence,
    owner: qualification.owner,
    timing: qualification.timing,
    decision_path: qualification.commercial_path,
    next_step: qualification.next_step,
  };
  database.exec("BEGIN IMMEDIATE");
  try {
    let opportunity = existing;
    if (!opportunity) {
      const inserted = database.prepare(`INSERT INTO opportunities
        (lead_id,play_id,cohort_id,stage,amount_mrr,amount_one_time,probability_source,next_step,next_step_at,qualification,created_at,updated_at)
        VALUES(?,?,?,'qualified',?,?, 'stage_model',?,?,?,?,?)`).run(
          lead.id, conversation.play_id || lead.play_id, lead.cohort_id,
          qualification.amount_mrr ?? null, qualification.amount_one_time ?? null,
          qualification.next_step, qualification.next_step_at || null, JSON.stringify(q), t, t,
        );
      opportunity = database.prepare("SELECT * FROM opportunities WHERE id=?").get(Number(inserted.lastInsertRowid));
    } else {
      database.prepare(`UPDATE opportunities SET stage='qualified',qualification=?,next_step=?,next_step_at=?,updated_at=? WHERE id=?`).run(
        JSON.stringify(q), qualification.next_step, qualification.next_step_at || null, t, opportunity.id,
      );
      opportunity = database.prepare("SELECT * FROM opportunities WHERE id=?").get(opportunity.id);
    }
    database.prepare(`INSERT INTO qualification_snapshots
      (opportunity_id,venture,fields,buyer_evidence,result,missing_evidence,confirmed_by,created_at)
      VALUES(?,?,?,?, 'qualified','[]','Andrew',?)`).run(
        opportunity.id, conversation.product, JSON.stringify(q), JSON.stringify(qualification.buyer_evidence || {}), t,
      );
    database.prepare(`INSERT OR IGNORE INTO activity_events
      (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
      VALUES(?,'opportunity_qualified',?,?,?,?, 'dashboard',?,?)`).run(
        lead.id, t, t, lead.cohort_id, lead.pipeline_run_id,
        JSON.stringify({ opportunity_id: opportunity.id, conversation_id: conversation.id, qualification: q }),
        `opportunity:qualified:${opportunity.id}`,
      );
    putOpenAction(database, { entityType: "opportunity", entityId: opportunity.id, actionType: "execute_next_step", dueAt: qualification.next_step_at || t, priority: 110, reason: qualification.next_step, sourceKey: `opportunity:${opportunity.id}:next` });
    putOpenAction(database, { entityType: "conversation", entityId: conversation.id, actionType: "execute_next_step", dueAt: qualification.next_step_at || t, priority: 100, reason: qualification.next_step });
    database.exec("COMMIT");
    return opportunity;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const PROPOSAL_NAMES = {
  gnk: "GNK bounded production sprint",
  outagehub: "OutageHub paid evaluation",
  morrow: "Morrow paid design-partner pilot",
};

export function scopeOpportunity(opportunityId, scope = {}, database = db()) {
  const opportunity = database.prepare(`SELECT o.*,l.product,l.cohort_id,l.pipeline_run_id
    FROM opportunities o JOIN leads l ON l.id=o.lead_id WHERE o.id=?`).get(opportunityId);
  if (!opportunity) throw new Error("Opportunity not found.");
  if (opportunity.stage !== "qualified") throw new Error("Only a qualified opportunity can be scoped.");
  const required = ["scope", "exclusions", "timeline", "responsibilities", "success_metrics", "price", "next_step", "decision_date"];
  const missing = required.filter((field) => !String(scope[field] || "").trim());
  if (missing.length) throw new Error(`Scope is missing: ${missing.join(", ")}`);
  const solution = {
    name: PROPOSAL_NAMES[opportunity.product],
    solution: scope.scope,
    exclusions: scope.exclusions,
    timeline: scope.timeline,
    responsibilities: scope.responsibilities,
    success_metrics: scope.success_metrics,
    price: scope.price,
    decision_date: scope.decision_date,
    evidence_status: "buyer_confirmed_or_human_entered",
    confirmed_by: "Andrew",
  };
  const t = now();
  database.prepare(`UPDATE opportunities SET stage='solution_defined',solution=?,next_step=?,next_step_at=?,updated_at=? WHERE id=?`).run(
    JSON.stringify(solution), scope.next_step, scope.next_step_at || scope.decision_date, t, opportunityId,
  );
  database.prepare(`INSERT OR IGNORE INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
    VALUES(?,'scope_agreed',?,?,?,?, 'dashboard',?,?)`).run(
      opportunity.lead_id, t, t, opportunity.cohort_id, opportunity.pipeline_run_id,
      JSON.stringify({ opportunity_id: opportunityId, solution }), `opportunity:scope:${opportunityId}`,
    );
  putOpenAction(database, { entityType: "opportunity", entityId: opportunityId, actionType: "prepare_proposal", dueAt: scope.next_step_at || scope.decision_date, priority: 110, reason: scope.next_step });
  return database.prepare("SELECT * FROM opportunities WHERE id=?").get(opportunityId);
}

export function markProposalSent(opportunityId, input = {}, database = db()) {
  const opportunity = database.prepare(`SELECT o.*,l.cohort_id,l.pipeline_run_id,l.product
    FROM opportunities o JOIN leads l ON l.id=o.lead_id WHERE o.id=?`).get(opportunityId);
  if (!opportunity) throw new Error("Opportunity not found.");
  if (opportunity.stage !== "solution_defined") throw new Error("A qualified, bounded scope is required before a proposal.");
  const solution = json(opportunity.solution);
  for (const field of ["solution", "success_metrics", "price", "responsibilities", "exclusions", "timeline", "decision_date"]) {
    if (!solution[field]) throw new Error(`Proposal cannot be sent without ${field}.`);
  }
  if (!String(input.next_step || "").trim() || !input.next_step_at) throw new Error("Proposal requires an explicit next step and date.");
  const t = now();
  database.prepare(`UPDATE opportunities SET stage='proposal',next_step=?,next_step_at=?,updated_at=? WHERE id=?`)
    .run(input.next_step, input.next_step_at, t, opportunityId);
  database.prepare(`INSERT OR IGNORE INTO activity_events
    (lead_id,type,occurred_at,recorded_at,cohort_id,pipeline_run_id,source,payload,dedupe_key)
    VALUES(?,'proposal_sent',?,?,?,?, 'dashboard',?,?)`).run(
      opportunity.lead_id, input.sent_at || t, t, opportunity.cohort_id, opportunity.pipeline_run_id,
      JSON.stringify({ opportunity_id: opportunityId, proposal_name: PROPOSAL_NAMES[opportunity.product], next_step: input.next_step, next_step_at: input.next_step_at }),
      `opportunity:proposal:${opportunityId}`,
    );
  putOpenAction(database, { entityType: "opportunity", entityId: opportunityId, actionType: "follow_up_proposal", dueAt: input.next_step_at, priority: 120, reason: input.next_step });
  return database.prepare("SELECT * FROM opportunities WHERE id=?").get(opportunityId);
}

export function founderOverview(database = db()) {
  const actions = listNextActions(database);
  const t = now();
  const today = t.slice(0, 10);
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();
  const conversations = database.prepare("SELECT * FROM linkedin_conversations").all();
  const outcomes = database.prepare("SELECT * FROM conversation_outcomes").all().map((row) => ({ ...row, secondary_tags: json(row.secondary_tags, []) }));
  const meetings = database.prepare("SELECT * FROM meetings ORDER BY starts_at").all().map((row) => ({ ...row, brief: json(row.brief), outcome: json(row.outcome) }));
  const opportunities = database.prepare(`SELECT o.*,l.product,l.name,l.company FROM opportunities o JOIN leads l ON l.id=o.lead_id`).all();
  const contracts = database.prepare(`SELECT c.*,coalesce(l.product,c.brand) product
    FROM contracts c LEFT JOIN leads l ON l.id=c.lead_id`).all();
  const pipeline = {};
  for (const product of PRODUCTS) {
    const productConversations = conversations.filter((row) => row.product === product);
    const productMeetings = meetings.filter((row) => productConversations.some((c) => c.id === row.source_conversation_id));
    const productOpps = opportunities.filter((row) => row.product === product);
    const productContracts = contracts.filter((row) => row.product === product || row.brand === product);
    pipeline[product] = {
      engaged: productConversations.filter((row) => row.inbound_count > 0).length,
      discovery: productMeetings.filter((row) => row.status === "booked"
        && ["human_confirmed", "calendar_confirmed"].includes(row.confirmation_status)).length,
      completed: productMeetings.filter((row) => row.status === "held").length,
      qualified: productOpps.filter((row) => ["qualified", "scoped", "solution_defined", "proposal", "proposal_sent", "commercial_commitment", "contracting", "won"].includes(row.stage)).length,
      scoped: productOpps.filter((row) => ["scoped", "solution_defined", "proposal", "proposal_sent", "commercial_commitment", "contracting", "won"].includes(row.stage)).length,
      proposal: productOpps.filter((row) => ["proposal", "proposal_sent", "commercial_commitment", "contracting"].includes(row.stage)).length,
      won: productOpps.filter((row) => row.stage === "won").length,
      qualified_value: productOpps.filter((row) => ACTIVE_OPPORTUNITY_STAGES.has(row.stage))
        .reduce((sum, row) => sum + (Number(row.amount_one_time) || 0), 0),
      booked_revenue: productContracts.reduce((sum, row) => sum + (Number(row.one_time) || 0), 0),
      booked_mrr: productContracts.reduce((sum, row) => sum + (Number(row.mrr) || 0), 0),
    };
  }
  const qualifiedOutcomes = outcomes.filter((row) => row.primary_outcome === "qualified_commercial_interest").length;
  const contacted = conversations.filter((row) => row.outbound_count > 0).length;
  const anyReplies = conversations.filter((row) => row.inbound_count > 0).length;
  const byTheme = {};
  for (const outcome of outcomes) byTheme[outcome.primary_outcome] = (byTheme[outcome.primary_outcome] || 0) + 1;
  const watchlist = actions.filter((row) => row.action_type === "revisit_on_new_trigger" || row.action_type === "pause_until");
  const workActions = actions.filter((row) => !watchlist.includes(row));
  const confirmedMeetings = meetings.filter((row) => row.status === "booked"
    && ["human_confirmed", "calendar_confirmed"].includes(row.confirmation_status));
  return {
    generated_at: t,
    metrics: {
      live_conversations: conversations.filter((row) => row.status === "needs_reply").length,
      reply_needed: workActions.filter((row) => row.action_type === "reply").length,
      calls_to_confirm: workActions.filter((row) => row.action_type === "confirm_meeting").length,
      calls_today: confirmedMeetings.filter((row) => row.starts_at?.slice(0, 10) === today).length,
      followups_due: workActions.filter((row) => row.action_type === "follow_up" && row.due_at && row.due_at <= t).length,
      promised_items: workActions.filter((row) => ["execute_next_step", "follow_up_proposal", "send_promised_item"].includes(row.action_type)).length,
      meetings_next_7_days: meetings.filter((row) => row.starts_at >= t && row.starts_at <= sevenDays
        && row.status === "booked" && ["human_confirmed", "calendar_confirmed"].includes(row.confirmation_status)).length,
      qualified_opportunities: opportunities.filter((row) => ACTIVE_OPPORTUNITY_STAGES.has(row.stage) && row.stage !== "discovery").length,
      proposals_outstanding: opportunities.filter((row) => ["proposal", "proposal_sent", "commercial_commitment", "contracting"].includes(row.stage)).length,
      booked_revenue: contracts.reduce((sum, row) => sum + (Number(row.one_time) || 0), 0),
      booked_mrr: contracts.reduce((sum, row) => sum + (Number(row.mrr) || 0), 0),
      overdue_actions: workActions.filter((row) => row.due_at && row.due_at < t).length,
      actionable_work: workActions.length,
      watchlist: watchlist.length,
    },
    actions,
    work_actions: workActions,
    watchlist,
    meetings,
    pipeline,
    learning: {
      contacted_conversations: contacted,
      any_replies: anyReplies,
      any_reply_rate: contacted ? anyReplies / contacted : 0,
      qualified_replies: qualifiedOutcomes,
      qualified_reply_rate: contacted ? qualifiedOutcomes / contacted : 0,
      by_theme: byTheme,
      warnings: ["Any reply is diagnostic only. Qualified replies require human confirmation.", "Meeting times imported from chat remain unconfirmed until reviewed."],
    },
  };
}

export function founderReconciliation(database = db()) {
  const source = database.prepare(`SELECT
    COUNT(*) messages,
    SUM(direction='outbound') outbound,
    SUM(direction='inbound') inbound
    FROM linkedin_messages`).get();
  const canonical = database.prepare(`SELECT
    COUNT(*) events,
    SUM(type='sent') sent,
    SUM(type='reply') replies
    FROM activity_events WHERE source='linkedin-import'`).get();
  const orphaned = database.prepare(`SELECT c.id,c.name,c.product,c.identity_key
    FROM linkedin_conversations c LEFT JOIN leads l ON l.id=c.linked_lead_id
    WHERE c.linked_lead_id IS NULL OR l.id IS NULL ORDER BY c.name`).all();
  const ambiguous = database.prepare(`SELECT c.id,c.name,c.product,COUNT(l.id) candidate_count
    FROM linkedin_conversations c JOIN leads l ON lower(trim(l.name))=lower(trim(c.name))
    WHERE c.linked_lead_id IS NULL GROUP BY c.id HAVING COUNT(l.id)>1`).all();
  const actionsMissing = database.prepare(`SELECT c.id,c.name,c.status
    FROM linkedin_conversations c LEFT JOIN next_actions a
      ON a.entity_type='conversation' AND a.entity_id=CAST(c.id AS TEXT) AND a.status='open'
    WHERE c.status<>'closed' AND a.id IS NULL`).all();
  const opportunityActionsMissing = database.prepare(`SELECT o.id,o.stage,l.name,l.company
    FROM opportunities o JOIN leads l ON l.id=o.lead_id
    LEFT JOIN next_actions a ON a.entity_type='opportunity' AND a.entity_id=CAST(o.id AS TEXT) AND a.status='open'
    WHERE o.stage NOT IN ('won','lost') AND a.id IS NULL`).all();
  return {
    source,
    canonical,
    reconciled: Number(source.outbound || 0) === Number(canonical.sent || 0)
      && Number(source.inbound || 0) === Number(canonical.replies || 0),
    orphaned,
    ambiguous,
    conversations_without_next_action: actionsMissing,
    opportunities_without_next_action: opportunityActionsMissing,
    unconfirmed_meetings: database.prepare("SELECT COUNT(*) n FROM meetings WHERE confirmation_status='unconfirmed'").get().n,
  };
}

export function createExperiment(input = {}, database = db()) {
  if (!PRODUCTS.includes(input.venture)) throw new Error("Experiment requires a valid venture.");
  if (!String(input.hypothesis || "").trim()) throw new Error("Experiment requires a hypothesis.");
  const variants = Array.isArray(input.variants) ? input.variants.map(String).filter(Boolean) : [];
  if (variants.length < 2) throw new Error("Experiment requires at least two variants.");
  if (!String(input.stop_rule || "").trim()) throw new Error("Experiment requires a stop rule.");
  const t = now();
  const result = database.prepare(`INSERT INTO experiments
    (venture,play_id,segment,hypothesis,variants,start_at,stop_rule,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'active',?,?)`).run(
      input.venture, input.play_id || null, input.segment || null, input.hypothesis.trim(), JSON.stringify(variants),
      input.start_at || t, input.stop_rule.trim(), t, t,
    );
  return database.prepare("SELECT * FROM experiments WHERE id=?").get(Number(result.lastInsertRowid));
}

export function assignExperiment(experimentId, input = {}, database = db()) {
  const experiment = database.prepare("SELECT * FROM experiments WHERE id=?").get(experimentId);
  if (!experiment) throw new Error("Experiment not found.");
  const variants = json(experiment.variants, []);
  if (!variants.includes(input.variant)) throw new Error("Assignment variant is not part of the experiment.");
  if (!['conversation', 'lead'].includes(input.entity_type) || !input.entity_id) throw new Error("Assignment requires a conversation or lead.");
  database.prepare(`INSERT INTO experiment_assignments(experiment_id,entity_type,entity_id,variant,assigned_at)
    VALUES(?,?,?,?,?) ON CONFLICT(experiment_id,entity_type,entity_id) DO UPDATE SET variant=excluded.variant,assigned_at=excluded.assigned_at`)
    .run(experimentId, input.entity_type, String(input.entity_id), input.variant, now());
  return database.prepare("SELECT * FROM experiment_assignments WHERE experiment_id=? AND entity_type=? AND entity_id=?")
    .get(experimentId, input.entity_type, String(input.entity_id));
}

export function listExperiments(database = db()) {
  return database.prepare("SELECT * FROM experiments ORDER BY created_at DESC").all().map((experiment) => {
    const variants = json(experiment.variants, []);
    const assignments = database.prepare(`SELECT a.*,
      c.inbound_count,c.meeting_status,o.primary_outcome
      FROM experiment_assignments a
      LEFT JOIN linkedin_conversations c ON a.entity_type='conversation' AND c.id=CAST(a.entity_id AS INTEGER)
      LEFT JOIN conversation_outcomes o ON o.conversation_id=c.id
      WHERE a.experiment_id=?`).all(experiment.id);
    return {
      ...experiment,
      variants,
      results: Object.fromEntries(variants.map((variant) => {
        const rows = assignments.filter((row) => row.variant === variant);
        return [variant, {
          assigned: rows.length,
          any_replies: rows.filter((row) => Number(row.inbound_count) > 0).length,
          qualified_replies: rows.filter((row) => row.primary_outcome === "qualified_commercial_interest").length,
          meetings: rows.filter((row) => row.meeting_status === "scheduled").length,
        }];
      })),
      sample_warning: assignments.length < 30 ? "Directional only: small sample." : null,
    };
  });
}
