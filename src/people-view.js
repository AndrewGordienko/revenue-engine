// people-view.js — the People screen. A SEARCH-first relationship inventory (this is the
// only surface that touches the whole archive) and the Person page (the single detail
// surface). People asserts NO work: it never shows due badges or overdue counts.
import { db } from "./db.js";
import { getLead } from "./crm-model.js";
import { getOpenMotionForLead, normalizeVenture } from "./active-motions.js";
import { accountStage } from "./loop-status.js";

// Paged, search-first index. Returns plain relationship rows — no due dates, no work.
export function buildPeopleIndex(database = db(), { venture = null, query = null, page = 1, pageSize = 25 } = {}) {
  const v = venture && venture !== "all" ? normalizeVenture(venture) : null;
  const clauses = [];
  const args = [];
  if (v) { clauses.push("product=?"); args.push(v); }
  if (query) { clauses.push("(lower(name) LIKE ? OR lower(company) LIKE ?)"); const q = `%${String(query).toLowerCase()}%`; args.push(q, q); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = database.prepare(`SELECT COUNT(*) c FROM leads ${where}`).get(...args).c;
  const offset = Math.max(0, (page - 1) * pageSize);
  const ids = database.prepare(`SELECT id FROM leads ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
  const rows = ids.map((r) => {
    const lead = getLead(database, r.id);
    const motion = getOpenMotionForLead(database, lead.id);
    const lastTouch = motion?.last_touch_at
      || database.prepare("SELECT MAX(occurred_at) t FROM activity_events WHERE lead_id=?").get(lead.id)?.t
      || null;
    return {
      lead_id: lead.id, name: lead.name, company: lead.company, title: lead.title,
      venture: lead.product, stage: accountStage(database, lead),
      last_touch: lastTouch, has_open_motion: Boolean(motion),
      relationship_role: lead.research?.relationship_role || null,
    };
  });
  return { venture: v || "all", query: query || null, page, pageSize, total, rows };
}

// The Person page: one relationship's identity, state, and unified chronological thread.
export function buildPersonPage(database = db(), leadId) {
  const lead = getLead(database, leadId);
  if (!lead) return null;
  const motion = getOpenMotionForLead(database, lead.id);

  const timeline = [];
  for (const e of database.prepare("SELECT * FROM activity_events WHERE lead_id=? ORDER BY occurred_at").all(lead.id)) {
    let detail = null;
    try {
      const p = e.payload ? JSON.parse(e.payload) : {};
      if (p.body_ref) { const b = database.prepare("SELECT body, sentiment FROM erasable_message_bodies WHERE id=?").get(p.body_ref); if (b) detail = `${b.sentiment ? `[${b.sentiment}] ` : ""}${b.body}`; }
    } catch { /* ignore */ }
    timeline.push({ kind: "event", type: e.type, at: e.occurred_at, source: e.source, detail });
  }
  for (const d of database.prepare("SELECT * FROM outreach_drafts_v2 WHERE lead_id=? ORDER BY created_at").all(lead.id)) {
    timeline.push({ kind: "draft", type: `draft_${d.review_status}${d.sent_at ? "_sent" : ""}`, at: d.sent_at || d.created_at, source: "manual_linkedin", detail: d.approved_body || d.body });
  }
  for (const m of database.prepare("SELECT * FROM meetings WHERE lead_id=? ORDER BY starts_at").all(lead.id)) {
    timeline.push({ kind: "meeting", type: `meeting_${m.status}`, at: m.starts_at, source: "calendar", detail: m.brief || null });
  }
  timeline.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  return {
    lead: { id: lead.id, name: lead.name, company: lead.company, title: lead.title, linkedin_url: lead.linkedin_url, venture: lead.product },
    play_id: lead.play_id, stage: accountStage(database, lead),
    motion: motion ? { id: motion.id, status: motion.status, motion_type: motion.motion_type, opened_at: motion.opened_at, expires_at: motion.expires_at } : null,
    drafts: database.prepare("SELECT id, message_kind, touch_number, review_status, sent_at FROM outreach_drafts_v2 WHERE lead_id=? ORDER BY touch_number").all(lead.id),
    next_action: motion ? database.prepare("SELECT id, action_type, due_at, reason FROM next_actions WHERE entity_type='motion' AND entity_id=? AND status='open'").get(String(motion.id)) || null : null,
    timeline,
  };
}
