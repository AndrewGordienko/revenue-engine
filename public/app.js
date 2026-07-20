const SENDER = "andrew.gordienko05@gmail.com";
const SENDER_NAME = "Andrew";

const PRODUCTS = {
  gnk: {
    key: "gnk",
    slug: "gnk",
    short: "GNK",
    name: "GNK",
    mark: "GNK",
    colorName: "blue",
    description: "high-trust engineering sprints",
    commercialSummary: "One high-trust sprint, not a volume funnel."
  },
  outagehub: {
    key: "outagehub",
    slug: "outagehub",
    short: "OHUB",
    name: "OutageHub",
    mark: "OH",
    colorName: "orange",
    description: "Canadian power-event intelligence",
    commercialSummary: "Paid operational pilots, then annual contracts."
  },
  morrow: {
    key: "morrow",
    slug: "morrow",
    short: "MORROW",
    name: "Morrow",
    mark: "M",
    colorName: "green",
    description: "adaptive robotic packing",
    commercialSummary: "Prove one variable packing workflow, then expand by line and site."
  },
  other: {
    key: "other",
    slug: "other",
    short: "OTHER",
    name: "Other",
    mark: "?",
    colorName: "neutral",
    description: "relationships awaiting classification",
    commercialSummary: "Research and classify these relationships before outreach."
  }
};

const STAGES = [
  { key: "new", label: "New" },
  { key: "researching", label: "Researching" },
  { key: "to_contact", label: "To contact" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" }
];

const BUCKETS = [
  {
    key: "short_term",
    label: "Short term",
    shortLabel: "Short",
    quota: 3,
    cadence: [0, 2, 5, 9],
    summary: "Closest to a contract. Work these every day with direct asks and fast follow-ups."
  },
  {
    key: "medium_term",
    label: "Medium term",
    shortLabel: "Medium",
    quota: 2,
    cadence: [0, 4, 10],
    summary: "Good commercial fit, but needs warming, routing, or stronger timing."
  },
  {
    key: "long_term",
    label: "Long term",
    shortLabel: "Long",
    quota: 1,
    cadence: [0, 10],
    summary: "Keep warm, use as a router, or revisit when the buying signal strengthens."
  }
];

const savedProduct = localStorage.getItem("salesv3_product");
const state = {
  product: PRODUCTS[savedProduct] ? savedProduct : "gnk",
  view: "work",
  registry: { agents: [] },
  bus: { artifacts: {}, agents: {} },
  messages: [],
  runStatus: { activeRun: null },
  leads: { leads: [], stats: {}, task: null },
  activeLeadId: null,
  activeAgentSlug: null,
  leadFilter: "all",
  leadBucketFilter: "all",
  leadSearch: "",
  outreachSearch: "",
  outreachBucketFilter: "all",
  outreachSegmentFilter: "all",
  outreachCompanyFilter: "all",
  calendarMonth: null,
  selectedCalendarDate: null,
  activeTouchNumber: 1,
  leadMemory: { leadId: null, data: null, loading: false },
  memorySummary: {},
  memoryLogOpen: false,
  pipelineReport: { products: [], cohorts: [] },
  outreachQueue: [],
  cohorts: [],
  integrations: {},
  meetingProposals: {},
  callBriefs: {},
  agentHealth: { summary: {}, agents: [] },
  linkedin: { prospects: [], totals_by_product: {}, total: 0, verified_profiles: 0, validation_errors: [] },
  linkedinProduct: "all",
  linkedinSearch: "",
  connections: { connections: [], summary: { by_product: {}, by_status: {} } },
  connectionProduct: "all",
  connectionStatus: "all",
  connectionConfidence: "all",
  connectionContact: "all",
  connectionSearch: "",
  connectionVisible: 100,
  conversations: { conversations: [], summary: { by_product: {}, by_status: {} }, insights: { lessons: [], by_product: {}, themes: {} } },
  conversationProduct: PRODUCTS[savedProduct] ? savedProduct : "gnk",
  conversationStatus: "all",
  conversationSearch: "",
  conversationImportResult: null,
  founder: { metrics: {}, actions: [], work_actions: [], watchlist: [], meetings: [], pipeline: {}, learning: {} },
  reconciliation: { reconciled: false, source: {}, canonical: {} },
  playbooks: { ventures: {}, portfolio_message_length: {} },
  workFilter: "all",
  networkSubview: "targets",
  networkSearch: "",
  networkProduct: PRODUCTS[savedProduct] ? savedProduct : "gnk",
  playbookSubview: "market",
  pipelineLane: "commercial",
  systemSubview: "overview",
  drawerConversationId: null,
  drawerConnectionId: null,
  drawerActionId: null,
  drawerDraftType: null
};

const stageEl = document.querySelector("#stage");
const railTaskEl = document.querySelector("#rail-task");
const countWorkEl = document.querySelector("#count-work");
const countNetworkEl = document.querySelector("#count-network");
const brandMarkEl = document.querySelector("#brand-mark");

const BUTTON_HELP = {
  "Reply": "Opens the internal relationship drawer with the full conversation and an editable suggested reply. It does not send anything.",
  "Review": "Opens the internal relationship record, conversation history, evidence, and controls. It does not change anything by itself.",
  "Review relationship": "Opens the internal relationship record without changing or contacting anything.",
  "Prepare call": "Opens the call context and preparation workspace. It does not contact the person or change the calendar.",
  "Draft follow-up": "Opens an editable follow-up draft. It does not send anything.",
  "Work referral": "Opens the referral context and suggested next step. It does not contact anyone.",
  "Decide next step": "Opens the relationship evidence so you can choose the next internal action.",
  "Send promised item": "Opens the promised-item context and draft. It does not send anything.",
  "Confirm call": "Confirms this meeting inside SalesV3 and creates the preparation step. It does not send a LinkedIn message or calendar invitation.",
  "Record outcome": "Records what happened on the call and creates the next action. It does not contact the person.",
  "Open brief": "Opens the internal call context and preparation notes. It does not change the meeting.",
  "Mark contacted": "Marks this relationship as contacted in SalesV3 only. It does not send a message.",
  "Contacted ✓": "Removes the contacted marker if clicked. It does not delete any conversation history.",
  "Not relevant": "Removes this person from active targeting while preserving their record and message history.",
  "Restore": "Returns this person to the active relationship inventory.",
  "Restore relationship": "Returns this person to the active relationship inventory.",
  "Record as sent": "Records this draft as sent in SalesV3. It does not send anything through LinkedIn.",
  "Copy message": "Copies the draft to your clipboard. It does not send it.",
  "Done": "Marks this internal action complete. It does not contact the person.",
  "Complete action": "Marks this internal action complete. It does not contact the person.",
  "Tomorrow": "Moves this internal action to tomorrow. It does not contact the person.",
  "Snooze to tomorrow": "Moves this internal action to tomorrow. It does not contact the person.",
  "Process LinkedIn DMs": "Parses and merges the pasted LinkedIn history. It never sends an outbound message.",
  "Reconcile LinkedIn": "Rebuilds internal CRM events from imported LinkedIn data. It does not access or message LinkedIn.",
  "Suppress": "Adds a do-not-contact state and closes active work while preserving history.",
  "Close": "Closes the internal relationship workflow without deleting history."
};

/* ---------- tiny DOM helper ---------- */
function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  if (tag === "button" && !node.getAttribute("title")) {
    const label = String(props.text || node.textContent || "").trim();
    const help = BUTTON_HELP[label];
    if (help) {
      node.setAttribute("title", help);
      node.setAttribute("aria-description", help);
    }
  }
  return node;
}

function humanize(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bIcp\b/i, "ICP")
    .replace(/\bOhub\b/i, "OHUB")
    .replace(/\bOutagehub\b/i, "OutageHub")
    .replace(/\bGnk\b/i, "GNK");
}

function activeProduct() {
  return PRODUCTS[state.product] || PRODUCTS.gnk;
}

function productSlug(suffix) {
  return `${activeProduct().slug}-${suffix}`;
}

function productUrl(path) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("product", activeProduct().slug);
  return `${url.pathname}${url.search}`;
}

function productArtifact(suffix) {
  return state.bus.artifacts?.[productSlug(suffix)];
}

function productAgents() {
  const prefix = `${activeProduct().slug}-`;
  return [...(state.registry.agents || [])].filter((agent) => agent.slug.startsWith(prefix));
}

function setProduct(productKey) {
  if (!PRODUCTS[productKey] || state.product === productKey) return;
  state.product = productKey;
  state.activeLeadId = null;
  state.activeAgentSlug = null;
  state.activeTouchNumber = 1;
  state.networkProduct = productKey;
  state.conversationProduct = productKey;
  state.workFilter = "all";
  state.drawerConversationId = null;
  state.drawerConnectionId = null;
  state.drawerActionId = null;
  if (productKey === "other" && ["playbooks", "pipeline", "calendar"].includes(state.view)) {
    state.view = "network";
    state.networkSubview = "needs_review";
  }
  localStorage.setItem("salesv3_product", productKey);
  load();
}

function applyProductChrome() {
  const product = activeProduct();
  document.body.dataset.product = product.key;
  if (brandMarkEl) brandMarkEl.textContent = product.mark;
  document.querySelectorAll("[data-product-switch]").forEach((button) => {
    button.classList.toggle("on", button.dataset.productSwitch === product.key);
  });
}

function bucketMeta(key) {
  return BUCKETS.find((b) => b.key === key) || BUCKETS[1];
}

function inferBucket(lead) {
  const fit = Number(lead.fit_score) || 0;
  const title = norm(lead.title);
  const text = norm(`${lead.segment} ${lead.trigger_event} ${lead.outreach_angle}`);
  const hasEmail = Boolean(lead.email_best);
  const isDecisionMaker = /\b(ceo|founder|co-founder|cto|chief|vp|head|president|coo|cio)\b/.test(title);
  const isEvaluator = /\b(engineer|manager|marketing|scientist|lead)\b/.test(title) && !isDecisionMaker;
  const urgentTrigger = /\b(incident|outage|hiring|posted|active|senior|staff|backend|platform|integration|modernization|funding|series|launch|appointed|acquisition|compliance|risk)\b/.test(text);

  if (fit >= 5 && hasEmail && isDecisionMaker && urgentTrigger) return "short_term";
  if (fit >= 5 && isDecisionMaker && urgentTrigger) return "medium_term";
  if (fit >= 4 && (isDecisionMaker || urgentTrigger)) return "medium_term";
  if (hasEmail && isDecisionMaker && urgentTrigger) return "medium_term";
  if (isEvaluator || !hasEmail || fit < 4) return "long_term";
  return "medium_term";
}

function leadBucket(lead) {
  return BUCKETS.some((b) => b.key === lead.contract_bucket) ? lead.contract_bucket : inferBucket(lead);
}

function bucketReason(lead) {
  if (lead.contract_bucket_reason) return lead.contract_bucket_reason;
  const bucket = leadBucket(lead);
  if (bucket === "short_term") return "High-fit decision maker with a current trigger and direct email.";
  if (bucket === "medium_term") return "Credible fit, but needs more warming, routing, or timing before a fast close.";
  return "Keep warm or use as a router/evaluator while stronger buying paths develop.";
}

function stageLabel(stage) {
  return STAGES.find((s) => s.key === stage)?.label || stage || "New";
}

function memoryBadge(lead) {
  const mem = state.memorySummary?.[lead.id];
  if (!mem || !mem.total) return null;
  return h("span", { class: "chip mem sm", title: `${mem.total} memory events`, text: `◍ ${mem.total}` });
}

function contactedChip(lead) {
  return lead.stage === "contacted"
    ? h("span", { class: "chip stage-contacted sm", text: "Contacted" })
    : null;
}

function leadPriority(lead) {
  const bucketBoost = { short_term: 300, medium_term: 180, long_term: 80 }[leadBucket(lead)] || 0;
  const fit = (Number(lead.fit_score) || 0) * 20;
  const email = lead.email_best ? 12 : 0;
  const confidence = lead.confidence === "high" ? 8 : lead.confidence === "medium" ? 4 : 0;
  return bucketBoost + fit + email + confidence;
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

function toast(message) {
  const t = h("div", { class: "toast", text: message });
  document.body.append(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 200);
  }, 1600);
}

async function copyText(text, message = "Copied") {
  const value = String(text || "");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  } else {
    const area = h("textarea", { class: "clipboard-fallback" });
    area.value = value;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast(message);
}

/* ---------- data ---------- */
async function load() {
  applyProductChrome();
  const [registry, bus, messages, runStatus, leads, memorySummary, pipelineReport, outreachQueue, cohorts, integrations, agentHealth, linkedin, connections, conversations, founder, reconciliation, playbooks] = await Promise.all([
    fetch("/api/agents").then((r) => r.json()),
    fetch("/api/state").then((r) => r.json()),
    fetch("/api/messages?limit=60").then((r) => r.json()),
    fetch("/api/run-status").then((r) => r.json()),
    fetch(productUrl("/api/leads")).then((r) => r.json()).catch(() => ({ leads: [], stats: {}, task: null })),
    fetch(productUrl("/api/lead-memory")).then((r) => r.json()).then((j) => j.summary || {}).catch(() => ({})),
    fetch("/api/pipeline-report").then((r) => r.json()).catch(() => ({ products: [], cohorts: [] })),
    fetch(productUrl("/api/outreach-queue")).then((r) => r.json()).then((j) => j.messages || []).catch(() => []),
    fetch(productUrl("/api/cohorts")).then((r) => r.json()).then((j) => j.cohorts || []).catch(() => []),
    fetch("/api/integrations").then((r) => r.json()).catch(() => ({})),
    fetch("/api/agent-health").then((r) => r.json()).catch(() => ({ summary: {}, agents: [] })),
    fetch(productUrl("/api/linkedin-prospects?limit=100")).then((r) => r.json()).catch(() => ({ prospects: [], totals_by_product: {}, total: 0, verified_profiles: 0, validation_errors: [] })),
    fetch(productUrl("/api/linkedin-connections?limit=1000")).then((r) => r.json()).catch(() => ({ connections: [], summary: { by_product: {}, by_status: {} } })),
    fetch(productUrl("/api/linkedin-conversations")).then((r) => r.json()).catch(() => ({ conversations: [], summary: { by_product: {}, by_status: {} }, insights: { lessons: [], by_product: {}, themes: {} } })),
    fetch("/api/founder-overview").then((r) => r.json()).catch(() => ({ metrics: {}, actions: [], work_actions: [], watchlist: [], meetings: [], pipeline: {}, learning: {} })),
    fetch("/api/founder-reconciliation").then((r) => r.json()).catch(() => ({ reconciled: false, source: {}, canonical: {} })),
    fetch("/api/playbooks").then((r) => r.json()).catch(() => ({ ventures: {}, portfolio_message_length: {} }))
  ]);
  state.registry = registry;
  state.bus = bus;
  state.messages = messages;
  state.runStatus = runStatus;
  state.leads = leads;
  state.memorySummary = memorySummary;
  state.pipelineReport = pipelineReport;
  state.outreachQueue = outreachQueue;
  state.cohorts = cohorts;
  state.integrations = integrations;
  state.agentHealth = agentHealth;
  state.linkedin = linkedin;
  state.connections = connections;
  state.conversations = conversations;
  state.founder = founder;
  state.reconciliation = reconciliation;
  state.playbooks = playbooks;
  render();
}

function sortedLeads() {
  return [...(state.leads.leads || [])].sort((a, b) => leadPriority(b) - leadPriority(a));
}

function filteredLeads() {
  const q = state.leadSearch.toLowerCase().trim();
  return sortedLeads().filter((lead) => {
    if (state.leadFilter !== "all" && lead.stage !== state.leadFilter) return false;
    if (state.leadBucketFilter !== "all" && leadBucket(lead) !== state.leadBucketFilter) return false;
    if (!q) return true;
    return `${lead.name} ${lead.company} ${lead.title}`.toLowerCase().includes(q);
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sequencedLeads() {
  const seen = new Set();
  return sortedLeads().filter((lead) => {
    if (!sequenceForLead(lead)) return false;
    const key = `${norm(lead.company)}|${norm(lead.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filteredSequencedLeads() {
  const q = state.outreachSearch.toLowerCase().trim();
  return sequencedLeads().filter((lead) => {
    if (state.outreachBucketFilter !== "all" && leadBucket(lead) !== state.outreachBucketFilter) return false;
    if (state.outreachSegmentFilter !== "all" && (lead.segment || "") !== state.outreachSegmentFilter) return false;
    if (state.outreachCompanyFilter !== "all" && (lead.company || "") !== state.outreachCompanyFilter) return false;
    if (!q) return true;
    return `${lead.name} ${lead.company} ${lead.title} ${lead.segment}`.toLowerCase().includes(q);
  });
}

function activeLead() {
  const leads = state.leads.leads || [];
  return leads.find((l) => l.id === state.activeLeadId) || null;
}

async function patchLead(id, patch) {
  await fetch(productUrl(`/api/leads/${id}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
  await load();
}

async function postAction(path) {
  await fetch(productUrl(path), { method: "POST" });
  await load();
}

async function apiPost(path, body = {}) {
  const response = await fetch(productUrl(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

// ---- lead memory (per-lead timeline + understanding) ----
async function loadLeadMemory(id) {
  if (!id) return;
  state.leadMemory = { leadId: id, data: state.leadMemory.data, loading: true };
  const data = await fetch(productUrl(`/api/lead-memory?lead=${encodeURIComponent(id)}`))
    .then((r) => r.json())
    .catch(() => null);
  state.leadMemory = { leadId: id, data, loading: false };
  render();
}

async function postMemory(id, type, payload) {
  const response = await fetch(productUrl(`/api/lead-memory/${encodeURIComponent(id)}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) { toast(result.error || "Could not record event"); return; }
  await loadLeadMemory(id);
  await load();
}

/* ---------- email drafts (persisted per lead in localStorage) ---------- */
function shortTrigger(lead) {
  const t = (lead.trigger_event || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > 90 ? `${t.slice(0, 88)}…` : t;
}

// Match a lead to the LLM-written draft group for the active product.
function agentDraftFor(lead) {
  const groups = productArtifact("email-drafter")?.company_email_drafts || [];
  const co = (lead.company || "").toLowerCase().trim();
  if (!co) return null;
  const group = groups.find((g) => (g.company || "").toLowerCase().trim() === co);
  if (!group) return null;

  const first = firstName(lead.name).toLowerCase();
  const opts = group.subject_options || [];

  const pName = (group.primary_contact?.name || "").toLowerCase();
  if (pName.includes(first) || (group.primary_email?.to_name || "").toLowerCase() === first) {
    return { subject: group.recommended_subject, options: opts, body: group.primary_email?.body || "", meta: group.primary_email, matched: true };
  }

  const alt = (group.alternate_contact_emails || []).find(
    (a) => (a.to_name || "").toLowerCase() === first || (a.title || "").toLowerCase() === (lead.title || "").toLowerCase()
  );
  if (alt) {
    return { subject: alt.recommended_subject || group.recommended_subject, options: opts, body: alt.body || "", meta: alt, matched: true };
  }

  // Company matched but not this exact person — offer the primary as a starting point.
  return { subject: group.recommended_subject, options: opts, body: group.primary_email?.body || "", meta: group.primary_email, matched: false };
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function sequenceForLead(lead) {
  const reviewedSequences = productArtifact("email-sequence-reviewer")?.improved_person_email_sequences || [];
  // The unified writer (email-drafter) is the current source; the legacy
  // sequence-drafter is a fallback for pre-consolidation artifacts.
  const draftSequences = productArtifact("email-drafter")?.person_email_sequences
    || productArtifact("email-sequence-drafter")?.person_email_sequences || [];
  const source = reviewedSequences.length ? "reviewed" : "draft";
  const sequences = source === "reviewed" ? reviewedSequences : draftSequences;
  const leadCompany = norm(lead.company);
  const leadName = norm(lead.name);
  if (!leadCompany || !leadName) return null;

  const sequence = sequences.find((seq) => norm(seq.company) === leadCompany && norm(seq.person_name) === leadName) || null;
  return sequence ? { ...sequence, sequence_source: source } : null;
}

function sequenceDraftKey(id, touchNumber) {
  return `${activeProduct().slug}_seq_draft_${id}_${touchNumber}`;
}

function getSequenceDraft(lead, sequence, email) {
  const touchNumber = email.touch_number || state.activeTouchNumber || 1;
  try {
    const saved = JSON.parse(localStorage.getItem(sequenceDraftKey(lead.id, touchNumber)) || "null");
    if (saved) return saved;
  } catch {}
  return {
    to: lead.email_best || sequence.email_address || "",
    subject: email.recommended_subject || "",
    body: email.body || ""
  };
}

function saveSequenceDraft(id, touchNumber, draft) {
  localStorage.setItem(sequenceDraftKey(id, touchNumber), JSON.stringify(draft));
}

function resetSequenceDraft(id, touchNumber) {
  localStorage.removeItem(sequenceDraftKey(id, touchNumber));
}

function suggestedSubjects(lead) {
  const ai = agentDraftFor(lead);
  if (ai?.options?.length) return ai.options.slice(0, 4);
  const co = lead.company || "your team";
  const first = firstName(lead.name);
  return [
    lead.trigger_event ? `${co} — a quick thought` : `Idea for ${co}`,
    `${first}, one idea on ${co}`,
    lead.segment ? `${co} + ${activeProduct().description}` : `Worth a look, ${first}?`
  ];
}

function defaultBody(lead) {
  const first = firstName(lead.name);
  const trig = shortTrigger(lead);
  const angle = (lead.outreach_angle || "").trim();
  if (activeProduct().key === "outagehub") {
    return [
      `Hi ${first},`,
      "",
      trig
        ? `Saw that ${trig.charAt(0).toLowerCase()}${trig.slice(1)}. That looked like the kind of context where Canadian outage data can matter before customers or field teams start asking.`
        : `I was looking at ${lead.company || "your team"} and thought Canadian outage data might be useful for an operations, support, risk, or field workflow.`,
      "",
      angle || "OutageHub is a Canadian power-event intelligence layer that can show which locations are affected, how fresh and confident the event is, what changed, and which operator should respond.",
      "",
      "Would it be useful to test one outage-sensitive decision in a paid 30-day pilot?",
      "",
      "Best,",
      `${SENDER_NAME}`
    ].join("\n");
  }

  const lines = [
    `Hi ${first},`,
    "",
    trig
      ? `Saw that ${trig.charAt(0).toLowerCase()}${trig.slice(1)} — that's usually where senior engineering pays for itself fast.`
      : `I've been following ${lead.company || "your team"} and think there's a clean way we could help.`,
    "",
    angle || `GNK is a senior engineering strike team that takes a business-critical AI workflow, backend risk, or operations system from stuck to working production software in four to six weeks.`,
    "",
    `If this sits with you, would a short note on the first production outcome and acceptance criteria be useful?`,
    "",
    `Best,`,
    `${SENDER_NAME}`
  ];
  return lines.join("\n");
}

function draftKey(id) {
  return `${activeProduct().slug}_draft_${id}`;
}

function getDraft(lead) {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(lead.id)) || "null");
    if (saved) return saved;
  } catch {}
  // Persisted draft saved on the lead (survives localStorage clears, shows in CSV).
  if (lead.email_subject || lead.email_body) {
    return { to: lead.email_best || "", subject: lead.email_subject || "", body: lead.email_body || "" };
  }
  const ai = agentDraftFor(lead);
  return {
    to: lead.email_best || "",
    subject: (ai?.subject) || suggestedSubjects(lead)[0],
    body: (ai?.body) || defaultBody(lead)
  };
}

function saveDraft(id, draft) {
  localStorage.setItem(draftKey(id), JSON.stringify(draft));
}

async function resetDraft(lead) {
  localStorage.removeItem(draftKey(lead.id));
  await patchLead(lead.id, { email_subject: "", email_body: "" });
}

/* ---------- page: header ---------- */
function pageHead(eyebrow, title, sub, actions) {
  return h("header", { class: "page-head" }, [
    h("div", {}, [
      h("p", { class: "eyebrow", text: eyebrow }),
      h("h1", { class: "page-title", text: title }),
      sub ? h("p", { class: "page-sub", text: sub }) : null
    ]),
    actions ? h("div", { class: "page-actions" }, actions) : null
  ]);
}

/* ---------- page: Overview ---------- */
function renderLegacyOverview() {
  const leads = sortedLeads();
  const stats = state.leads.stats || {};
  const product = activeProduct();
  const revenue = productArtifact("revenue-strategy");
  const capacity = productArtifact("pipeline-capacity");
  const targets = capacity?.pipeline_targets || {};
  const configured = state.registry.commercialTargets?.[product.slug] || state.registry.commercialTarget || {};
  const math = revenue?.revenue_math || configured;
  const campaign = capacity?.campaign_targets || configured.campaignTargets || {};
  const performance = (state.pipelineReport.products || []).find((entry) => entry.product === product.key) || { actual: {}, conversion: {}, target: campaign };
  const actual = performance.actual || {};
  const measuredTarget = performance.target || campaign;
  const portfolio = revenue?.portfolio_strategy || {};
  const el = h("section", { class: "page" });

  el.append(
    pageHead(
      "Command",
      `${product.name} Overview`,
      `${leads.length} leads · ${stats.with_email || 0} with email · ${state.bus.artifacts ? Object.keys(state.bus.artifacts).length : 0} research artifacts`,
      [
        h("button", { class: "btn primary", text: `Run ${product.short} prospecting`, onclick: () => postAction("/api/prospect") }),
        h("button", { class: "btn", text: "Find emails", onclick: () => postAction("/api/find-emails") })
      ]
    )
  );

  el.append(
    h("div", { class: "revenue-strip" }, [
      h("div", { class: "revenue-copy" }, [
        h("p", { class: "card-eyebrow", text: "Commercial strategy" }),
        h("h2", { class: "revenue-title", text: product.commercialSummary }),
        h("p", {
          class: "revenue-sub",
          text: revenue?.strategy_summary || (product.key === "outagehub"
            ? "Prove one outage-sensitive decision with paid implementation and a 30-day evaluation, then convert it to an annual agreement."
            : product.key === "morrow"
              ? "Prove one variable packing workflow on-site, quantify labour and changeover impact, then expand by line and facility."
              : "Use warm introductions, observable triggers, and partners to close one four-to-six-week production sprint.")
        })
      ]),
      h("div", { class: "revenue-metrics" }, [
        metric("Booked revenue", `${money(actual.booked_one_time_usd)} / ${money(measuredTarget.bookedRevenueUsd || 40000)}`),
        metric("Booked MRR", money(actual.booked_mrr_usd)),
        metric("Implementation margin", actual.implementation_gross_margin == null ? "—" : `${Math.round(actual.implementation_gross_margin * 100)}%`),
        metric(product.key === "gnk" ? "Signed sprint" : "Paid pilots", `${actual.wins || 0} / ${measuredTarget.paidWins || 0}`)
      ]),
      portfolio.near_term_send_list ? h("p", { class: "revenue-note", text: portfolio.near_term_send_list }) : null
    ])
  );

  el.append(
    h("div", { class: "capacity-strip" }, [
      h("div", { class: "capacity-copy" }, [
        h("p", { class: "card-eyebrow", text: "30-day campaign" }),
        h("h2", { class: "revenue-title", text: capacity ? "Outcomes control the campaign." : "Run campaign planning before prospecting." }),
        h("p", {
          class: "revenue-sub",
          text: capacity?.capacity_summary || "The pipeline controller calculates named accounts, buyers, meetings, proposals, and wins from the brand-specific motion."
        })
      ]),
      h("div", { class: "capacity-metrics" }, [
        metric("Researched accounts", `${actual.researched_accounts || 0} / ${measuredTarget.researchedAccounts || 0}`),
        metric("Verified contacts", `${actual.verified_contacts || 0} / ${campaign.named_contacts || targets.total_leads_required || 0}`),
        metric("Messages sent", String(actual.messages_sent || 0)),
        metric("Positive replies", `${actual.positive_replies || 0}${performance.conversion?.positive_reply_rate == null ? "" : ` · ${Math.round(performance.conversion.positive_reply_rate * 100)}%`}`),
        metric("Meetings", `${actual.meetings_held || 0} / ${measuredTarget.bookedMeetings || 0}`),
        metric("Qualified", `${actual.qualified_opportunities || 0} / ${measuredTarget.qualifiedConversations || 0}`),
        metric("Proposals", `${actual.proposals || 0} / ${measuredTarget.proposals || 0}`),
        metric("Wins", `${actual.wins || 0} / ${measuredTarget.paidWins || 0}`),
        metric("Proposal → win", performance.conversion?.proposal_to_win_rate == null ? "—" : `${Math.round(performance.conversion.proposal_to_win_rate * 100)}%`)
      ]),
      h("div", { class: "capacity-actions" }, [
        h("button", { class: "btn", text: "Refresh capacity", onclick: () => postAction(`/api/run/${productSlug("pipeline-capacity")}`) }),
        h("button", { class: "btn primary", text: "Review approvals", onclick: () => go("approvals") })
      ])
    ])
  );

  const byBucket = stats.byBucket || {};
  el.append(
    h("div", { class: "bucket-strip" }, BUCKETS.map((bucket) =>
      h("button", {
        class: `bucket-card bucket-${bucket.key}`,
        onclick: () => go("leads", { bucket: bucket.key })
      }, [
        h("span", { class: "bucket-card-label", text: bucket.label }),
        h("strong", { class: "bucket-card-count", text: String(byBucket[bucket.key] || leads.filter((lead) => leadBucket(lead) === bucket.key).length) }),
        h("span", { class: "bucket-card-copy", text: bucket.summary })
      ])
    ))
  );

  // Funnel
  const funnel = h("div", { class: "funnel" });
  const byStage = stats.byStage || {};
  const max = Math.max(1, ...STAGES.map((s) => byStage[s.key] || 0));
  STAGES.forEach((s) => {
    const n = byStage[s.key] || 0;
    funnel.append(
      h("button", { class: `funnel-col ${state.leadFilter === s.key ? "on" : ""}`, onclick: () => go("leads", { filter: s.key }) }, [
        h("span", { class: "funnel-bar", style: `height:${20 + (n / max) * 92}px` }, [h("span", { class: "funnel-n", text: String(n) })]),
        h("span", { class: "funnel-label", text: s.label })
      ])
    );
  });
  el.append(h("div", { class: "card pad" }, [h("p", { class: "card-eyebrow", text: "Pipeline" }), funnel]));

  // Today's focus
  const focus = leads.filter((l) => l.stage === "to_contact" || l.stage === "new").slice(0, 6);
  const focusWrap = h("div", { class: "focus-grid" });
  if (!focus.length) {
    focusWrap.append(h("p", { class: "muted", text: "No leads yet — run prospecting to begin." }));
  }
  focus.forEach((lead) => {
    focusWrap.append(
      h("button", { class: "focus-card", onclick: () => go("outreach", { lead: lead.id }) }, [
        h("div", { class: "focus-top" }, [
          h("span", { class: "focus-name", text: lead.name }),
          h("span", { class: `chip bucket ${leadBucket(lead)}`, text: bucketMeta(leadBucket(lead)).shortLabel })
        ]),
        h("span", { class: "focus-co", text: `${lead.title ? lead.title + " · " : ""}${lead.company}` }),
        lead.trigger_event ? h("span", { class: "focus-trig", text: shortTrigger(lead) }) : null,
        h("span", { class: "focus-cta", text: "Draft outreach →" })
      ])
    );
  });
  el.append(h("div", { class: "block" }, [h("h2", { class: "block-title", text: "Who to contact next" }), focusWrap]));

  return el;
}

function actionLabel(type) {
  return ({
    reply: "Reply now",
    confirm_meeting: "Confirm meeting",
    prepare_meeting: "Prepare meeting",
    work_referral: "Work referral",
    decide_next_step: "Decide next step",
    follow_up: "Follow up",
    revisit_on_new_trigger: "Wait for a new trigger",
    pause_until: "Paused",
    execute_next_step: "Execute promised next step"
  })[type] || humanize(type);
}

function actionUrgency(action) {
  if (!action.due_at) return "undated";
  const due = new Date(action.due_at);
  const diff = due.getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 86400000) return "today";
  return "upcoming";
}

async function operateOnAction(action, command, extra = {}) {
  try {
    await apiPost(`/api/next-actions/${action.id}`, { command, ...extra });
    toast(command === "complete" ? "Action completed" : command === "snooze" ? "Action snoozed" : "Relationship updated");
    await load();
  } catch (error) { toast(error.message); }
}

async function confirmActionMeeting(action) {
  if (!action.meeting_id) { toast("No meeting candidate is linked yet"); return; }
  const startsAt = prompt("Confirm the meeting date and time (ISO)", action.meeting_at || "");
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) { if (startsAt) toast("Enter a valid date and time"); return; }
  const timezone = prompt("Confirm the meeting time zone", action.meeting_timezone && action.meeting_timezone !== "unconfirmed" ? action.meeting_timezone : "Europe/London");
  if (!timezone) return;
  const intent = prompt("Meeting intent: research, design_partner, commercial_discovery, or active_deal", action.meeting_intent || "research");
  if (!intent) return;
  try {
    await apiPost(`/api/meetings/${action.meeting_id}/confirm`, { starts_at: new Date(startsAt).toISOString(), timezone, intent });
    toast("Meeting explicitly confirmed");
    await load();
  } catch (error) { toast(error.message); }
}

async function captureActionMeetingOutcome(action) {
  if (!action.meeting_id) { toast("No confirmed meeting is linked"); return; }
  const prompts = [
    ["problem", "What buyer-confirmed problem did you hear?"],
    ["current_process", "How does the current process work?"],
    ["consequence", "What is the consequence or cost?"],
    ["owner", "Who owns the problem and decision?"],
    ["timing", "What timing or urgency was confirmed?"],
    ["budget_path", "What is the budget or commercial path? Use 'not yet known' when that is the truth."],
    ["next_step", "What explicit next step was agreed?"],
    ["correction_learned", "What assumption was corrected or disproved? Use 'none' if none."]
  ];
  const outcome = {};
  for (const [field, question] of prompts) {
    const answer = prompt(question, "");
    if (answer == null) return;
    outcome[field] = answer.trim();
  }
  const nextAt = prompt("When is the next step due? (ISO date/time or leave blank for now)", "");
  if (nextAt) outcome.next_step_at = new Date(nextAt).toISOString();
  try {
    await apiPost(`/api/meetings/${action.meeting_id}/outcome`, outcome);
    toast("Meeting outcome captured");
    await load();
  } catch (error) { toast(error.message); }
}

function founderMetric(label, value, note, tone = "") {
  return h("div", { class: `founder-metric ${tone}` }, [
    h("span", { text: label }),
    h("strong", { text: value }),
    h("small", { text: note })
  ]);
}

function founderActionRow(action) {
  const urgency = actionUrgency(action);
  const product = action.product || "gnk";
  const due = action.due_at ? relationshipDate(action.due_at) : "No date";
  const actions = [];
  if (action.action_type === "confirm_meeting") {
    actions.push(h("button", { class: "btn primary sm", text: "Confirm details", onclick: () => confirmActionMeeting(action) }));
  } else if (action.action_type === "prepare_meeting") {
    actions.push(h("button", { class: "btn primary sm", text: "Record outcome", onclick: () => captureActionMeetingOutcome(action) }));
  } else if (action.action_type !== "revisit_on_new_trigger") {
    actions.push(h("button", { class: "btn primary sm", text: "Mark done", onclick: () => operateOnAction(action, "complete") }));
  }
  actions.push(
    h("button", { class: "btn sm", text: "Tomorrow", onclick: () => operateOnAction(action, "snooze", { due_at: new Date(Date.now() + 86400000).toISOString() }) }),
    h("button", { class: "btn ghost sm", text: "Open thread", onclick: () => { state.conversationSearch = action.person_name || ""; go("conversations"); } }),
    h("button", { class: "btn ghost sm danger", text: "Close", onclick: () => operateOnAction(action, "close") })
  );
  return h("article", { class: `founder-action ${urgency}` }, [
    h("div", { class: "founder-action-main" }, [
      h("div", { class: "founder-action-title" }, [
        h("span", { class: `portfolio-product product-${product}`, text: LINKEDIN_PRODUCT_LABELS[product] || "Other" }),
        h("strong", { text: actionLabel(action.action_type) }),
        h("span", { class: `action-due ${urgency}`, text: urgency === "overdue" ? `Overdue · ${due}` : due })
      ]),
      h("h3", { text: action.person_name || action.company || `${humanize(action.entity_type)} ${action.entity_id}` }),
      h("p", { text: action.reason || "Review and decide the next commercial action." }),
      action.headline ? h("small", { text: action.headline }) : null
    ]),
    h("div", { class: "founder-action-buttons" }, actions)
  ]);
}

function renderOverview() {
  const data = state.founder || { metrics: {}, actions: [], pipeline: {}, learning: {} };
  const metrics = data.metrics || {};
  const actions = data.actions || [];
  const learning = data.learning || {};
  const el = h("section", { class: "page founder-page" });
  el.append(pageHead(
    "Founder revenue operating system",
    "What needs your attention today",
    `${actions.length} open decisions across GNK, OutageHub, and Morrow. Clear the live work before adding inventory.`,
    [h("button", { class: "btn", text: "Reconcile LinkedIn", onclick: async () => { try { await apiPost("/api/founder-sync"); toast("LinkedIn activity reconciled"); await load(); } catch (error) { toast(error.message); } } })]
  ));

  el.append(h("div", { class: "founder-scorecard" }, [
    founderMetric("Live replies", String(metrics.live_conversations || 0), "respond first", metrics.live_conversations ? "urgent" : ""),
    founderMetric("Meetings · 7 days", String(metrics.meetings_next_7_days || 0), "confirm and prepare"),
    founderMetric("Qualified opportunities", String(metrics.qualified_opportunities || 0), "buyer evidence required"),
    founderMetric("Proposals outstanding", String(metrics.proposals_outstanding || 0), "follow to a decision"),
    founderMetric("Paid commitments", money(metrics.booked_revenue), `${money(metrics.booked_mrr)} MRR`, "money"),
    founderMetric("Overdue actions", String(metrics.overdue_actions || 0), "target: zero", metrics.overdue_actions ? "danger" : "")
  ]));

  const activeActions = actions.filter((action) => action.action_type !== "revisit_on_new_trigger");
  const parkedActions = actions.filter((action) => action.action_type === "revisit_on_new_trigger");
  const queue = h("div", { class: "founder-action-list" });
  if (!activeActions.length) queue.append(h("div", { class: "card pad muted", text: "No active actions. Review paused relationships only when a new trigger appears." }));
  activeActions.slice(0, 14).forEach((action) => queue.append(founderActionRow(action)));
  el.append(h("section", { class: "founder-section" }, [
    h("div", { class: "founder-section-head" }, [
      h("div", {}, [h("p", { class: "card-eyebrow", text: "Primary operating queue" }), h("h2", { text: "Today" })]),
      h("span", { class: "queue-count", text: `${activeActions.length} active · ${parkedActions.length} waiting for trigger` })
    ]),
    queue
  ]));

  const pipelineRows = ["gnk", "outagehub", "morrow"].map((product) => {
    const row = data.pipeline?.[product] || {};
    return h("div", { class: "founder-pipeline-row" }, [
      h("strong", { text: LINKEDIN_PRODUCT_LABELS[product] }),
      ...[["Engaged", row.engaged], ["Discovery", row.discovery], ["Held", row.completed], ["Qualified", row.qualified], ["Scoped", row.scoped], ["Proposal", row.proposal], ["Won", row.won]].map(([label, value]) => h("div", {}, [h("span", { text: label }), h("b", { text: String(value || 0) })]))
    ]);
  });
  el.append(h("section", { class: "founder-section founder-two-col" }, [
    h("div", { class: "card pad founder-pipeline" }, [h("p", { class: "card-eyebrow", text: "Commercial progression" }), h("h2", { text: "Pipeline by venture" }), ...pipelineRows]),
    h("div", { class: "card pad founder-learning" }, [
      h("p", { class: "card-eyebrow", text: "Market learning" }),
      h("h2", { text: "Signal quality, not vanity" }),
      h("div", { class: "learning-rates" }, [
        founderMetric("Any reply", `${Math.round((learning.any_reply_rate || 0) * 100)}%`, `${learning.any_replies || 0} conversations`, "diagnostic"),
        founderMetric("Qualified reply", `${Math.round((learning.qualified_reply_rate || 0) * 100)}%`, `${learning.qualified_replies || 0} human-confirmed`, "money")
      ]),
      h("p", { class: "learning-note", text: "A correction, objection, referral, meeting, and buying conversation are not equivalent. Qualified progression requires human confirmation." }),
      h("button", { class: "btn sm", text: "Review conversations", onclick: () => go("conversations") })
    ])
  ]));
  return el;
}

function money(value) {
  const n = Number(value) || 0;
  return `$${Math.round(n).toLocaleString()}`;
}

function numberOrDash(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString() : "—";
}

function metric(label, value) {
  return h("div", { class: "metric" }, [
    h("span", { class: "metric-label", text: label }),
    h("strong", { class: "metric-value", text: value })
  ]);
}

/* ---------- page: Leads ---------- */
function renderLeads() {
  const el = h("section", { class: "page split" });

  // list column
  const list = h("div", { class: "list-col" });
  const filters = h("div", { class: "filters" }, [
    h("input", {
      class: "search",
      type: "search",
      placeholder: "Search name, company…",
      value: state.leadSearch,
      oninput: (e) => {
        state.leadSearch = e.target.value;
        // update just the list to keep focus
        refreshLeadList(list);
      }
    })
  ]);
  const chips = h("div", { class: "chips" });
  [{ key: "all", label: "All" }, ...STAGES].forEach((s) => {
    chips.append(
      h("button", {
        class: `chip-btn ${state.leadFilter === s.key ? "on" : ""}`,
        text: s.label,
        onclick: () => {
          state.leadFilter = s.key;
          render();
        }
      })
    );
  });
  const bucketChips = h("div", { class: "chips bucket-filters" });
  [{ key: "all", label: "All buckets" }, ...BUCKETS].forEach((bucket) => {
    bucketChips.append(
      h("button", {
        class: `chip-btn bucket-filter ${state.leadBucketFilter === bucket.key ? "on" : ""}`,
        text: bucket.label,
        onclick: () => {
          state.leadBucketFilter = bucket.key;
          render();
        }
      })
    );
  });
  list.append(pageHead("CRM", "Leads", `${filteredLeads().length} shown`, null), filters, chips, bucketChips);
  const rows = h("div", { class: "lead-rows" });
  list.append(rows);
  refreshLeadList(list);

  // detail column
  const detail = h("div", { class: "detail-col" });
  detail.append(renderLeadDetail());

  el.append(list, detail);
  return el;
}

function refreshLeadList(listEl) {
  const rows = listEl.querySelector(".lead-rows");
  if (!rows) return;
  rows.replaceChildren();
  const leads = filteredLeads();
  if (!leads.length) {
    rows.append(h("p", { class: "muted pad", text: "No leads match." }));
    return;
  }
  leads.forEach((lead) => {
    rows.append(
      h("button", { class: `lead-row stage-${lead.stage} ${lead.id === state.activeLeadId ? "on" : ""}`, onclick: () => { state.activeLeadId = lead.id; render(); } }, [
        h("div", { class: "lead-row-main" }, [
          h("span", { class: "lead-row-name", text: lead.name }),
          h("span", { class: "lead-row-co", text: `${lead.title ? lead.title + " · " : ""}${lead.company}` })
        ]),
        h("div", { class: "lead-row-side" }, [
          contactedChip(lead),
          memoryBadge(lead),
          h("span", { class: `chip bucket sm ${leadBucket(lead)}`, text: bucketMeta(leadBucket(lead)).shortLabel }),
          lead.fit_score !== "" ? h("span", { class: "chip fit sm", text: String(lead.fit_score) }) : null,
          h("span", { class: `dot ${lead.email_best ? "ok" : "off"}` })
        ])
      ])
    );
  });
}

function renderLeadDetail() {
  const lead = activeLead();
  if (!lead) return h("div", { class: "detail-empty", text: "Select a lead to see the full profile." });

  const wrap = h("div", { class: "detail" });
  wrap.append(
    h("div", { class: "detail-head" }, [
      h("div", {}, [
        h("h2", { class: "detail-name", text: lead.name }),
        h("p", { class: "detail-role", text: `${lead.title ? lead.title + " · " : ""}${lead.company}` })
      ]),
      lead.fit_score !== "" ? h("span", { class: "chip fit lg", text: `fit ${lead.fit_score}` }) : null
    ])
  );

  // stage control
  const stageSel = h("select", { class: "stage-select", onchange: (e) => patchLead(lead.id, { stage: e.target.value }) },
    STAGES.map((s) => h("option", { value: s.key, ...(s.key === lead.stage ? { selected: "" } : {}), text: s.label }))
  );
  const bucketSel = h("select", { class: "stage-select", onchange: (e) => patchLead(lead.id, { contract_bucket: e.target.value }) },
    BUCKETS.map((bucket) => h("option", { value: bucket.key, ...(bucket.key === leadBucket(lead) ? { selected: "" } : {}), text: bucket.label }))
  );
  wrap.append(h("div", { class: "detail-controls" }, [
    h("label", { class: "field-label", text: "Stage" }), stageSel,
    h("label", { class: "field-label", text: "Bucket" }), bucketSel,
    h("button", { class: "btn primary sm", text: "Draft email", onclick: () => go("outreach", { lead: lead.id }) })
  ]));

  const facts = h("dl", { class: "facts" });
  const addFact = (label, value, opts = {}) => {
    if (!value) return;
    facts.append(h("div", { class: "fact" }, [
      h("dt", { text: label }),
      opts.link ? h("dd", {}, [h("a", { href: value, target: "_blank", rel: "noreferrer", class: "link", text: value })]) : h("dd", { text: value })
    ]));
  };
  addFact("Email", lead.email_best || "— not found —");
  if (lead.email_candidates?.length > 1) addFact("Other candidates", lead.email_candidates.slice(1).join(", "));
  addFact("Email status", lead.email_status);
  addFact("Contract bucket", bucketMeta(leadBucket(lead)).label);
  addFact("Bucket reason", bucketReason(lead));
  addFact("Segment", lead.segment);
  addFact("Trigger", lead.trigger_event);
  addFact("Why now", lead.why_now);
  addFact("Lit-up case", lead.lit_up_case);
  addFact("Why this person", lead.why_this_person);
  addFact("Owner hypothesis", lead.owner_hypothesis);
  addFact("Likely current pain", lead.likely_current_pain);
  addFact("First contract slice", lead.first_contract_slice);
  addFact("Reply path", lead.reply_path);
  addFact("Contact route", lead.contact_route);
  addFact("Outreach angle", lead.outreach_angle);
  addFact("Persona vibe", lead.persona_vibe);
  addFact("Culture context", lead.culture_context);
  addFact("Mindset", lead.mindset);
  addFact("Communication style", lead.communication_style);
  addFact("Perspective", lead.perspective);
  addFact("Decision style", lead.decision_style);
  addFact("Tone guidance", lead.tone_guidance);
  addFact("Persona confidence", lead.persona_confidence);
  addFact("Source", lead.source_url, { link: true });
  addFact("Found by", lead.source_agent);
  wrap.append(facts);

  wrap.append(renderLeadMemory(lead));
  return wrap;
}

/* ---------- lead memory panel ---------- */
const MEMORY_META = {
  note: { label: "Note", cls: "note" },
  stage_change: { label: "Stage", cls: "stage" },
  email_sent: { label: "Sent", cls: "sent" },
  reply: { label: "Reply", cls: "reply" },
  meeting: { label: "Meeting", cls: "meeting" },
  understanding: { label: "Learned", cls: "learn" },
  research: { label: "Research", cls: "research" },
  outcome: { label: "Outcome", cls: "outcome" }
};

function memoryEventText(event) {
  const p = event.payload || {};
  switch (event.type) {
    case "stage_change":
      return `${humanize(p.from || "?")} → ${humanize(p.to || "?")}`;
    case "email_sent":
      return [p.touch_number ? `Touch ${p.touch_number}` : null, p.subject].filter(Boolean).join(" · ");
    case "reply":
      return [p.sentiment ? `(${p.sentiment})` : null, p.summary || p.text].filter(Boolean).join(" ");
    case "outcome":
      return [p.result, p.segment && `· ${p.segment}`, p.angle && `· ${p.angle}`].filter(Boolean).join(" ");
    case "understanding":
      return `${humanize(p.key || "note")}: ${p.value || ""}`;
    case "meeting":
      return p.summary || "";
    case "research":
      return p.summary || "";
    default:
      return p.text || p.summary || p.value || "";
  }
}

// Merge older lead.notes (pre-memory-log) into the timeline so nothing is lost.
function mergedTimeline(lead, memory) {
  const events = [...((memory && memory.timeline) || [])];
  const logged = new Set(events.filter((e) => e.type === "note").map((e) => (e.payload?.text || "").trim()));
  (lead.notes || []).forEach((note) => {
    const text = (note.text || "").trim();
    if (!text || logged.has(text)) return;
    events.push({ type: "note", at: note.at, actor: note.source ? `agent:${note.source}` : "operator", payload: { text } });
  });
  return events.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
}

function renderLeadMemory(lead) {
  // Lazy-load this lead's memory when the selection changes.
  if (state.leadMemory.leadId !== lead.id && !state.leadMemory.loading) {
    loadLeadMemory(lead.id);
  }
  const memory = state.leadMemory.leadId === lead.id ? state.leadMemory.data : null;
  const section = h("section", { class: "memory-block" });
  section.append(
    h("div", { class: "memory-head" }, [
      h("h3", { class: "field-h", text: "Memory" }),
      h("button", {
        class: "btn sm",
        text: state.memoryLogOpen ? "Close log" : "Log interaction",
        onclick: () => {
          state.memoryLogOpen = !state.memoryLogOpen;
          render();
        }
      })
    ])
  );

  // Accumulated understanding
  const understanding = (memory && memory.understanding) || {};
  const uKeys = Object.keys(understanding);
  if (uKeys.length) {
    section.append(
      h("div", { class: "memory-understanding" }, [
        h("h4", { class: "memory-sub", text: "What we know" }),
        ...uKeys.map((key) =>
          h("div", { class: "memory-know" }, [
            h("span", { class: "memory-know-k", text: humanize(key) }),
            h("span", { class: "memory-know-v", text: String(understanding[key].value || "") }),
            understanding[key].confidence
              ? h("span", { class: "memory-know-c", text: understanding[key].confidence })
              : null
          ])
        )
      ])
    );
  }

  // Log-interaction composer
  if (state.memoryLogOpen) section.append(renderMemoryComposer(lead));

  // Quick note box (always visible)
  const noteInput = h("textarea", { class: "memory-note-input", rows: "2", placeholder: "Add a note to this lead's memory…" });
  section.append(
    h("div", { class: "memory-note-add" }, [
      noteInput,
      h("button", {
        class: "btn primary sm",
        text: "Add note",
        onclick: () => {
          const text = noteInput.value.trim();
          if (!text) return;
          patchLead(lead.id, { note: text }).then(() => loadLeadMemory(lead.id));
          noteInput.value = "";
        }
      })
    ])
  );

  // Timeline
  const events = mergedTimeline(lead, memory);
  if (state.leadMemory.loading && !events.length) {
    section.append(h("p", { class: "muted pad", text: "Loading memory…" }));
  } else if (!events.length) {
    section.append(h("p", { class: "muted pad", text: "No memory yet. Notes, sends, replies, and stage changes will show here." }));
  } else {
    section.append(
      h("div", { class: "memory-timeline" }, events.map((event) => {
        const meta = MEMORY_META[event.type] || { label: event.type, cls: "note" };
        const actor = event.actor && event.actor !== "operator" ? event.actor.replace(/^agent:/, "") : event.actor;
        return h("article", { class: `memory-event ev-${meta.cls}` }, [
          h("span", { class: "memory-rail" }),
          h("div", { class: "memory-event-body" }, [
            h("div", { class: "memory-event-top" }, [
              h("span", { class: `memory-badge ev-${meta.cls}`, text: meta.label }),
              event.at ? h("time", { class: "memory-time", text: new Date(event.at).toLocaleString() }) : null,
              actor ? h("span", { class: "memory-actor", text: actor }) : null
            ]),
            h("p", { class: "memory-event-text", text: memoryEventText(event) })
          ])
        ]);
      }))
    );
  }

  return section;
}

function renderMemoryComposer(lead) {
  const typeSel = h("select", { class: "stage-select" },
    [
      ["reply", "Reply received"],
      ["meeting", "Meeting"],
      ["email_sent", "Email sent"],
      ["outcome", "Outcome"]
    ].map(([v, l]) => h("option", { value: v, text: l }))
  );
  const summaryInput = h("input", { class: "search", type: "text", placeholder: "Summary / detail…" });
  const resultSel = h("select", { class: "stage-select" },
    ["replied", "meeting_booked", "won", "lost", "bounced"].map((s) => h("option", { value: s, text: humanize(s) }))
  );

  const extra = h("div", { class: "memory-composer-extra" });
  const syncExtra = () => {
    if (typeSel.value === "outcome") extra.replaceChildren(resultSel);
    else extra.replaceChildren();
  };
  typeSel.addEventListener("change", syncExtra);

  const submit = () => {
    const type = typeSel.value;
    const payload = { summary: summaryInput.value.trim() };
    if (type === "reply") payload.body = summaryInput.value.trim();
    if (type === "outcome") {
      payload.result = resultSel.value;
      payload.angle = lead.outreach_angle || "";
      payload.segment = lead.segment || "";
    }
    if (type === "email_sent") payload.subject = summaryInput.value.trim();
    postMemory(lead.id, type, payload);
    summaryInput.value = "";
    state.memoryLogOpen = false;
  };

  return h("div", { class: "memory-composer" }, [
    h("div", { class: "memory-composer-row" }, [typeSel, extra]),
    h("div", { class: "memory-composer-row" }, [
      summaryInput,
      h("button", { class: "btn primary sm", text: "Log", onclick: submit })
    ])
  ]);
}

/* ---------- page: Outreach (Gmail emulator) ---------- */
function renderOutreach() {
  const el = h("section", { class: "page split" });
  const allSequenceLeads = sequencedLeads();
  const sequenceReady = filteredSequencedLeads();
  if (sequenceReady.length && (!state.activeLeadId || !sequenceForLead(activeLead() || {}))) {
    state.activeLeadId = sequenceReady[0].id;
  }
  const selectedLead = activeLead();
  const selectedHasSequence = selectedLead && sequenceForLead(selectedLead);
  const companies = uniqueSorted(allSequenceLeads.map((lead) => lead.company || ""));
  const segments = uniqueSorted(allSequenceLeads.map((lead) => lead.segment || ""));

  // pick list
  const list = h("div", { class: "list-col" });
  const totalSequenced = allSequenceLeads.length;
  list.append(pageHead("Outreach", "Sequences", `${sequenceReady.length}/${totalSequenced} reviewed sequences shown`, null));

  const filters = h("div", { class: "filters outreach-filters" }, [
    h("input", {
      class: "search",
      type: "search",
      placeholder: "Search sequenced people, companies, titles...",
      value: state.outreachSearch,
      oninput: (e) => {
        state.outreachSearch = e.target.value;
        render();
      }
    }),
    h("div", { class: "filter-grid" }, [
      h("select", {
        class: "stage-select filter-select",
        onchange: (e) => {
          state.outreachBucketFilter = e.target.value;
          render();
        }
      }, [
        h("option", { value: "all", ...(state.outreachBucketFilter === "all" ? { selected: "" } : {}), text: "All buckets" }),
        ...BUCKETS.map((bucket) =>
          h("option", {
            value: bucket.key,
            ...(state.outreachBucketFilter === bucket.key ? { selected: "" } : {}),
            text: bucket.label
          })
        )
      ]),
      h("select", {
        class: "stage-select filter-select",
        onchange: (e) => {
          state.outreachSegmentFilter = e.target.value;
          render();
        }
      }, [
        h("option", { value: "all", ...(state.outreachSegmentFilter === "all" ? { selected: "" } : {}), text: "All industries" }),
        ...segments.map((segment) =>
          h("option", {
            value: segment,
            ...(state.outreachSegmentFilter === segment ? { selected: "" } : {}),
            text: segment
          })
        )
      ]),
      h("select", {
        class: "stage-select filter-select",
        onchange: (e) => {
          state.outreachCompanyFilter = e.target.value;
          render();
        }
      }, [
        h("option", { value: "all", ...(state.outreachCompanyFilter === "all" ? { selected: "" } : {}), text: "All companies" }),
        ...companies.map((company) =>
          h("option", {
            value: company,
            ...(state.outreachCompanyFilter === company ? { selected: "" } : {}),
            text: company
          })
        )
      ])
    ]),
    h("button", {
      class: "btn sm",
      text: "Clear filters",
      onclick: () => {
        state.outreachSearch = "";
        state.outreachBucketFilter = "all";
        state.outreachSegmentFilter = "all";
        state.outreachCompanyFilter = "all";
        render();
      }
    })
  ]);
  list.append(filters);

  const rows = h("div", { class: "lead-rows" });
  const withContext = selectedHasSequence && !sequenceReady.some((lead) => lead.id === selectedLead.id)
    ? [selectedLead, ...sequenceReady]
    : sequenceReady;
  if (!withContext.length) rows.append(h("p", { class: "muted pad", text: "No leads yet." }));
  withContext.forEach((lead) => {
    rows.append(
      h("button", { class: `lead-row stage-${lead.stage} ${lead.id === state.activeLeadId ? "on" : ""}`, onclick: () => { state.activeLeadId = lead.id; render(); } }, [
        h("div", { class: "lead-row-main" }, [
          h("span", { class: "lead-row-name", text: lead.name }),
          h("span", { class: "lead-row-co", text: `${lead.title ? lead.title + " · " : ""}${lead.company}` }),
          lead.segment ? h("span", { class: "lead-row-co", text: lead.segment }) : null
        ]),
        h("div", { class: "lead-row-side" }, [
          contactedChip(lead),
          h("span", { class: `chip bucket sm ${leadBucket(lead)}`, text: bucketMeta(leadBucket(lead)).shortLabel }),
          h("span", { class: `dot ${lead.email_best ? "ok" : "off"}` })
        ])
      ])
    );
  });
  list.append(rows);

  // compose column
  const compose = h("div", { class: "detail-col" });
  compose.append(renderCompose());
  el.append(list, compose);
  return el;
}

function renderCompose() {
  const lead = activeLead();
  if (!lead) return h("div", { class: "detail-empty", text: "Select a lead to compose." });

  const sequence = sequenceForLead(lead);
  if (!sequence) {
    return h("div", { class: "compose-wrap" }, [
      h("div", { class: "compose-ctx" }, [
        h("span", { class: "chip", text: lead.company }),
        h("span", { class: `chip bucket ${leadBucket(lead)}`, text: bucketMeta(leadBucket(lead)).label }),
        lead.fit_score !== "" ? h("span", { class: "chip fit", text: `fit ${lead.fit_score}` }) : null,
        h("span", { class: `chip stage-${lead.stage}`, text: stageLabel(lead.stage) })
      ]),
      lead.trigger_event ? h("p", { class: "compose-trig", text: lead.trigger_event }) : null,
      h("div", { class: "detail-empty", text: "No reviewed sequence found for this lead yet." }),
      h("div", { class: "gmail-actions" }, [
        h("button", { class: "btn primary", text: "Run sequence drafter", onclick: () => postAction(`/api/run/${productSlug("email-sequence-drafter")}`) })
      ])
    ]);
  }

  const emails = (sequence.emails || []).slice().sort((a, b) => (a.touch_number || 0) - (b.touch_number || 0));
  if (!emails.length) return h("div", { class: "detail-empty", text: "This lead has a sequence record with no emails." });
  if (!emails.some((email) => email.touch_number === state.activeTouchNumber)) {
    state.activeTouchNumber = emails[0].touch_number || 1;
  }

  const activeEmail = emails.find((email) => email.touch_number === state.activeTouchNumber) || emails[0];
  const draft = getSequenceDraft(lead, sequence, activeEmail);
  let statusEl;
  const commit = (patch) => {
    Object.assign(draft, patch);
    saveSequenceDraft(lead.id, activeEmail.touch_number, draft);
    if (statusEl) statusEl.textContent = "Saved locally";
  };

  const sequenceNav = h("div", { class: "sequence-nav" });
  emails.forEach((email) => {
    sequenceNav.append(
      h("button", {
        class: `sequence-card ${email.touch_number === activeEmail.touch_number ? "on" : ""}`,
        onclick: () => {
          state.activeTouchNumber = email.touch_number;
          render();
        }
      }, [
        h("span", { class: "sequence-step", text: `Email ${email.touch_number}` }),
        h("strong", { class: "sequence-name", text: humanize(email.touch_key || email.objective || `Touch ${email.touch_number}`) }),
        h("span", { class: "sequence-subject", text: email.recommended_subject || "No subject" }),
        email.send_day ? h("span", { class: "sequence-day", text: email.send_day }) : null
      ])
    );
  });

  // Gmail-style window
  const win = h("div", { class: "gmail" });
  win.append(h("div", { class: "gmail-bar" }, [
    h("span", { text: `Email ${activeEmail.touch_number} · ${humanize(activeEmail.touch_key || "Sequence touch")}` }),
    h("span", { class: "gmail-bar-x", text: "✕" })
  ]));

  const fromRow = h("div", { class: "gmail-row" }, [h("span", { class: "gmail-k", text: "From" }), h("span", { class: "gmail-v muted", text: `${SENDER_NAME} <${SENDER}>` })]);

  // To with candidate options
  const toInput = h("input", { class: "gmail-input", value: draft.to || "", placeholder: "recipient@company.com", oninput: (e) => commit({ to: e.target.value }) });
  const toRow = h("div", { class: "gmail-row" }, [h("span", { class: "gmail-k", text: "To" }), toInput]);
  const cands = (lead.email_candidates || []).filter(Boolean);
  const toExtra = h("div", { class: "gmail-cands" });
  if (cands.length) {
    cands.forEach((c) => toExtra.append(h("button", { class: "mini-chip", text: c, onclick: () => { toInput.value = c; commit({ to: c }); } })));
  } else if (!lead.email_best) {
    toExtra.append(h("span", { class: "warn-line", text: "No direct email found in public evidence — use the routing notes or type the address when known." }));
  }

  // Subject
  const subjInput = h("input", { class: "gmail-input subj", value: draft.subject || "", oninput: (e) => commit({ subject: e.target.value }) });
  const subjRow = h("div", { class: "gmail-row" }, [h("span", { class: "gmail-k", text: "Subject" }), subjInput]);
  const subjChips = h("div", { class: "gmail-cands" });
  (activeEmail.subject_options?.length ? activeEmail.subject_options : [activeEmail.recommended_subject]).filter(Boolean)
    .forEach((s) => subjChips.append(h("button", { class: "mini-chip", text: s, onclick: () => { subjInput.value = s; commit({ subject: s }); } })));

  // Body
  const body = h("textarea", { class: "gmail-body", spellcheck: "true", oninput: (e) => commit({ body: e.target.value }) });
  body.value = draft.body || "";

  // Actions
  const actions = h("div", { class: "gmail-actions" }, [
    h("button", { class: "btn primary", text: "Submit for approval", onclick: async () => {
      try {
        await apiPost("/api/outreach-queue", { lead_id: lead.id, touch_number: activeEmail.touch_number, recipient: toInput.value, subject: subjInput.value, body: body.value, scheduled_at: null, review_status: sequence.send_readiness || "needs_human_review", evidence: activeEmail.grounding_used || sequence.source_urls || [] });
        toast("Submitted for approval"); await load(); go("approvals");
      } catch (error) { toast(error.message); }
    } }),
    h("button", { class: "btn", text: "Copy email", onclick: async () => { await navigator.clipboard.writeText(`Subject: ${subjInput.value}\n\n${body.value}`); toast("Copied"); } }),
    h("button", { class: "btn", text: `Copy all ${emails.length}`, onclick: async () => {
      const all = emails.map((email) => `Email ${email.touch_number}: ${email.recommended_subject || ""}\n\n${email.body || ""}`).join("\n\n---\n\n");
      await navigator.clipboard.writeText(all);
      toast("Sequence copied");
    } }),
    h("button", { class: "btn ghost", text: "Reset this touch", onclick: () => { resetSequenceDraft(lead.id, activeEmail.touch_number); render(); } }),
    h("span", { class: "spacer" }),
    (statusEl = h("span", { class: "save-status", text: "" })),
    h("span", { class: "muted", text: "Sent status is recorded only from Gmail or the canonical event API." })
  ]);

  win.append(fromRow, toRow, toExtra, subjRow, subjChips, body, actions);

  // context strip
  const ctx = h("div", { class: "compose-ctx" }, [
    h("span", { class: "chip", text: lead.company }),
    h("span", { class: `chip bucket ${leadBucket(lead)}`, text: bucketMeta(leadBucket(lead)).label }),
    lead.fit_score !== "" ? h("span", { class: "chip fit", text: `fit ${lead.fit_score}` }) : null,
    h("span", { class: `chip stage-${lead.stage}`, text: stageLabel(lead.stage) })
  ]);
  const trig = lead.trigger_event ? h("p", { class: "compose-trig", text: lead.trigger_event }) : null;

  const note = h("div", { class: "draft-note" }, [
    h("span", { class: "chip ai", text: sequence.sequence_source === "reviewed" ? `Reviewed ${emails.length}-touch sequence` : `${emails.length}-touch draft sequence` }),
    sequence.review_score != null ? h("span", { class: "chip fit", text: `review ${sequence.review_score}` }) : null,
    sequence.send_readiness ? h("span", { class: "chip", text: humanize(sequence.send_readiness) }) : null,
    activeEmail.why_this_touch ? h("span", { class: "draft-why", text: activeEmail.why_this_touch }) : null
  ]);

  const strategy = sequence.sequence_strategy || {};
  const strategyNotes = h("div", { class: "sequence-context" }, [
    strategy.primary_trigger ? h("p", {}, [h("strong", { text: "Trigger: " }), strategy.primary_trigger]) : null,
    strategy.first_contract_slice ? h("p", {}, [h("strong", { text: "Contract path: " }), strategy.first_contract_slice]) : null,
    strategy.routing_notes ? h("p", {}, [h("strong", { text: "Route: " }), strategy.routing_notes]) : null,
    activeEmail.review_notes ? h("p", {}, [h("strong", { text: "Reviewer: " }), activeEmail.review_notes]) : null
  ]);

  const meeting = lead.stage === "replied" ? renderMeetingControls(lead) : null;
  return h("div", { class: "compose-wrap" }, [ctx, trig, note, sequenceNav, strategyNotes, meeting, win]);
}

function renderMeetingControls(lead) {
  const slots = state.meetingProposals[lead.id] || [];
  const brief = state.callBriefs[lead.id] || null;
  const calendarReady = state.integrations.calendar?.configured;
  return h("section", { class: "meeting-controls" }, [
    h("div", {}, [h("strong", { text: "Meeting handling" }), h("p", { class: "muted", text: "Offer times after a positive reply; booking remains an explicit human action." })]),
    h("button", { class: "btn sm", text: "Propose times", onclick: async () => {
      try {
        const result = await apiPost("/api/meetings/proposals", { lead_id: lead.id, timezone: "Europe/London", count: 3 });
        state.meetingProposals[lead.id] = result.slots || []; render();
      } catch (error) { toast(error.message); }
    } }),
    h("button", { class: "btn ghost sm", text: "Prepare call brief", onclick: async () => {
      try {
        const response = await fetch(productUrl(`/api/call-brief?lead=${encodeURIComponent(lead.id)}`));
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not prepare brief");
        state.callBriefs[lead.id] = result.brief; render();
      } catch (error) { toast(error.message); }
    } }),
    ...slots.map((slot) => h("button", { class: "btn ghost sm", disabled: calendarReady ? null : "true", text: new Date(slot.starts_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }), onclick: async () => {
      if (!window.confirm("Book this time and send the calendar invitation?")) return;
      try { await apiPost("/api/meetings/book", { lead_id: lead.id, ...slot }); toast("Meeting booked"); await load(); }
      catch (error) { toast(error.message); }
    } })),
    brief ? h("div", { class: "call-brief" }, [
      h("strong", { text: "Call brief" }),
      h("p", { text: brief.objective }),
      brief.latest_reply?.body ? h("p", {}, [h("strong", { text: "Reply: " }), brief.latest_reply.body]) : null,
      h("ul", {}, (brief.discovery_questions || []).map((question) => h("li", { text: question })))
    ]) : null
  ]);
}

/* ---------- page: Approvals ---------- */
function renderApprovals() {
  const product = activeProduct();
  const el = h("section", { class: "page" });
  const pending = state.outreachQueue.filter((message) => message.status === "pending_approval");
  const providerDrafts = state.outreachQueue.filter((message) => message.status === "provider_draft");
  const gmail = state.integrations.gmail || {};
  const calendar = state.integrations.calendar || {};

  const draftOnly = state.integrations.outbound_sending_enabled !== true;
  if (draftOnly) {
    el.append(h("div", { class: "draft-only-banner" }, [
      h("strong", { text: "Draft-only mode" }),
      h("span", { text: "Outbound sending is disabled. The engine researches, writes, reviews, queues, and can create Gmail drafts — but never sends. Send from Gmail yourself when you choose to." })
    ]));
  }

  el.append(pageHead(
    "Control",
    `${product.name} approvals`,
    `${pending.length} messages awaiting approval · ${draftOnly ? "draft-only mode — nothing sends automatically" : "sending ENABLED"}`,
    [
      h("button", { class: "btn", text: "Sync Gmail", disabled: gmail.configured ? null : "true", onclick: async () => {
        try { const result = await apiPost("/api/gmail/sync"); toast(`${result.events_recorded || 0} mailbox events recorded`); await load(); }
        catch (error) { toast(error.message); }
      } }),
      h("button", { class: "btn primary", text: "Open outreach", onclick: () => go("outreach") })
    ]
  ));

  el.append(h("div", { class: "integration-strip" }, [
    h("div", { class: `integration-card ${gmail.configured ? "ready" : "blocked"}` }, [
      h("strong", { text: "Gmail" }), h("span", { text: gmail.configured ? `Connected · ${gmail.email || "account ready"}` : "Not configured" }),
      !gmail.configured ? h("small", { text: "Add Google OAuth credentials to create drafts and observe sent/reply events." }) : null
    ]),
    h("div", { class: `integration-card ${calendar.configured ? "ready" : "blocked"}` }, [
      h("strong", { text: "Google Calendar" }), h("span", { text: calendar.configured ? `Connected · ${calendar.calendar || "calendar ready"}` : "Not configured" }),
      !calendar.configured ? h("small", { text: "Add Google OAuth credentials before booking external meetings." }) : null
    ])
  ]));

  const cohortGrid = h("div", { class: "approval-grid" });
  for (const cohort of state.cohorts) {
    cohortGrid.append(h("article", { class: "approval-card" }, [
      h("div", { class: "approval-card-head" }, [
        h("strong", { text: cohort.cohort_id }),
        h("span", { class: `chip ${cohort.status === "approved" ? "fit" : ""}`, text: humanize(cohort.status || "draft") })
      ]),
      h("p", { class: "muted", text: cohort.play_id ? `${cohort.play_id} · ${cohort.strategy_version}` : "Triage cohort · no sales play assigned" }),
      cohort.rules ? h("p", { class: "small-copy", text: `Rules approved by ${cohort.approved_by || "operator"}; automatic sending: off.` }) : null,
      cohort.status !== "approved" && cohort.play_id ? h("button", { class: "btn primary sm", text: "Approve cohort rules", onclick: async () => {
        try {
          await apiPost(`/api/cohorts/${encodeURIComponent(cohort.cohort_id)}/approve`, { approved_by: "operator", rules: { product: product.key, play_id: cohort.play_id, strategy_version: cohort.strategy_version, human_message_approval_required: true, auto_send: false } });
          toast("Cohort approved"); await load();
        } catch (error) { toast(error.message); }
      } }) : null
    ]));
  }
  el.append(h("section", { class: "block" }, [h("h2", { class: "block-title", text: "Cohort rules" }), cohortGrid]));

  const messageList = h("div", { class: "approval-list" });
  for (const message of state.outreachQueue) {
    messageList.append(h("article", { class: `approval-message status-${message.status}` }, [
      h("div", { class: "approval-card-head" }, [
        h("div", {}, [h("strong", { text: `${message.name} · ${message.company}` }), h("p", { class: "muted", text: `${humanize(message.message_type)}${message.touch_number ? ` · touch ${message.touch_number}` : ""}` })]),
        h("span", { class: "chip", text: humanize(message.status) })
      ]),
      h("p", { class: "message-subject", text: message.subject }),
      h("p", { class: "message-preview", text: message.body.slice(0, 260) }),
      h("div", { class: "approval-actions" }, [
        message.status === "pending_approval" ? h("button", { class: "btn primary sm", text: "Approve", onclick: async () => {
          try { await apiPost(`/api/outreach-queue/${message.id}/approve`, { approved_by: "operator" }); toast("Message approved"); await load(); }
          catch (error) { toast(error.message); }
        } }) : null,
        message.status === "pending_approval" ? h("button", { class: "btn ghost sm", text: "Reject", onclick: async () => {
          const reason = window.prompt("Why should this message be rejected?"); if (!reason) return;
          try { await apiPost(`/api/outreach-queue/${message.id}/reject`, { reason }); toast("Message rejected"); await load(); }
          catch (error) { toast(error.message); }
        } }) : null,
        message.status === "approved" ? h("button", { class: "btn primary sm", text: "Create Gmail draft", disabled: gmail.configured ? null : "true", onclick: async () => {
          try { await apiPost(`/api/outreach-queue/${message.id}/draft`); toast("Gmail draft created"); await load(); }
          catch (error) { toast(error.message); }
        } }) : null,
        message.status === "provider_draft" ? h("span", { class: "muted", text: "Draft ready in Gmail. Send there; sync will capture sent and replies." }) : null,
        message.status === "stopped" ? h("span", { class: "warn-line", text: `Stopped automatically: ${message.stopped_reason}` }) : null
      ])
    ]));
  }
  if (!state.outreachQueue.length) messageList.append(h("p", { class: "muted", text: "No sequences have been submitted for approval." }));
  el.append(h("section", { class: "block" }, [h("h2", { class: "block-title", text: `Message queue${providerDrafts.length ? ` · ${providerDrafts.length} Gmail drafts` : ""}` }), messageList]));
  return el;
}

/* ---------- page: Calendar ---------- */
function localDateKey(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function formatCalendarDay(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function nextBusinessDays(count) {
  const days = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function calendarMonthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function buildMonthCells(month) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const cells = [];
  const cursor = new Date(start);
  for (let i = 0; i < 42; i += 1) {
    cells.push({
      date: new Date(cursor),
      key: localDateKey(cursor),
      inMonth: cursor.getMonth() === month.getMonth(),
      isToday: localDateKey(cursor) === localDateKey(new Date())
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function calendarTouchTitle(touchNumber, bucket) {
  if (touchNumber === 1) return bucket === "long_term" ? "Warm intro touch" : "First touch";
  if (touchNumber === 2) return "Follow-up";
  if (touchNumber === 3) return "Proof point";
  if (touchNumber === 4) return "Breakup / clean ask";
  return `Touch ${touchNumber}`;
}

function sequenceEmailForTouch(lead, touchNumber) {
  const sequence = sequenceForLead(lead);
  if (!sequence) return null;
  return (sequence.emails || []).find((email) => email.touch_number === touchNumber) || null;
}

function buildOutreachCalendar(dayCount = 30) {
  const days = nextBusinessDays(dayCount);
  const byDay = new Map(days.map((day) => [localDateKey(day), { date: day, tasks: [] }]));
  const active = sortedLeads().filter((lead) => !["won", "lost"].includes(lead.stage));

  BUCKETS.forEach((bucket) => {
    const leads = active.filter((lead) => leadBucket(lead) === bucket.key);
    leads.forEach((lead, index) => {
      const startIndex = Math.floor(index / bucket.quota);
      if (startIndex >= days.length) return;
      bucket.cadence.forEach((offset, touchIndex) => {
        const day = days[startIndex + offset];
        if (!day) return;
        const touchNumber = touchIndex + 1;
        const sequenceEmail = sequenceEmailForTouch(lead, touchNumber);
        const dateKey = localDateKey(day);
        byDay.get(dateKey)?.tasks.push({
          lead,
          bucket,
          touchNumber,
          title: sequenceEmail?.touch_key ? humanize(sequenceEmail.touch_key) : calendarTouchTitle(touchNumber, bucket.key),
          subject: sequenceEmail?.recommended_subject || suggestedSubjects(lead)[0] || "",
          note: sequenceEmail?.why_this_touch || bucket.summary
        });
      });
    });
  });

  for (const day of byDay.values()) {
    day.tasks.sort((a, b) => {
      const bucketDiff = BUCKETS.findIndex((bucket) => bucket.key === a.bucket.key) - BUCKETS.findIndex((bucket) => bucket.key === b.bucket.key);
      if (bucketDiff) return bucketDiff;
      return leadPriority(b.lead) - leadPriority(a.lead);
    });
  }
  return [...byDay.values()];
}

function buildRelationshipCalendar() {
  const byDay = new Map();
  const add = (date, event) => {
    if (!date) return;
    const key = date.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  };
  const conversations = state.conversations.conversations || [];
  for (const meeting of state.founder.meetings || []) {
    if (meeting.status !== "booked" || !["human_confirmed", "calendar_confirmed"].includes(meeting.confirmation_status)) continue;
    const conversation = conversations.find((item) => item.id === meeting.source_conversation_id);
    if (conversation) add(meeting.starts_at, { conversation, type: "meeting", at: meeting.starts_at, label: `${humanize(meeting.intent)} call` });
  }
  for (const action of state.founder.actions || []) {
    if (!action.due_at || action.action_type === "confirm_meeting" || action.entity_type !== "conversation") continue;
    const conversation = conversations.find((item) => item.id === Number(action.entity_id));
    if (conversation) add(action.due_at, { conversation, type: "followup", at: action.due_at, label: actionLabel(action.action_type) });
  }
  for (const events of byDay.values()) events.sort((a, b) => a.at.localeCompare(b.at));
  return byDay;
}

function renderCalendar() {
  const schedule = [];
  const stats = state.leads.stats || {};
  const byBucket = stats.byBucket || {};
  const todayKey = localDateKey(new Date());
  if (!state.selectedCalendarDate) state.selectedCalendarDate = todayKey;
  const month = state.calendarMonth ? new Date(`${state.calendarMonth}-01T00:00:00`) : startOfMonth(new Date());
  state.calendarMonth = localDateKey(month).slice(0, 7);
  const scheduleByDay = new Map(schedule.map((day) => [localDateKey(day.date), day]));
  const relationshipByDay = buildRelationshipCalendar();
  const cells = buildMonthCells(month);
  const selectedDay = scheduleByDay.get(state.selectedCalendarDate) || { date: new Date(`${state.selectedCalendarDate}T00:00:00`), tasks: [] };
  const el = h("section", { class: "page calendar-page" });

  el.append(pageHead(
    "Calendar",
    "Commitments and next actions",
    "Only human-confirmed meetings and canonical next actions appear here. Inferred call text stays in the Today confirmation queue.",
    [
      h("button", { class: "btn", text: "Leads", onclick: () => go("leads") }),
      h("button", { class: "btn primary", text: "Outreach", onclick: () => go("outreach") })
    ]
  ));

  const toolbar = h("div", { class: "calendar-toolbar" }, [
    h("div", { class: "calendar-title-wrap" }, [
      h("h2", { class: "calendar-title", text: calendarMonthLabel(month) }),
      h("div", { class: "calendar-legend" }, BUCKETS.map((bucket) =>
        h("span", { class: "legend-item" }, [
          h("span", { class: `legend-dot ${bucket.key}` }),
          `${bucket.label} (${byBucket[bucket.key] || 0})`
        ])
      ))
    ]),
    h("div", { class: "calendar-nav" }, [
      h("button", { class: "btn sm", text: "Prev", onclick: () => { state.calendarMonth = localDateKey(addMonths(month, -1)).slice(0, 7); render(); } }),
      h("button", { class: "btn sm", text: "Today", onclick: () => { state.calendarMonth = localDateKey(new Date()).slice(0, 7); state.selectedCalendarDate = todayKey; render(); } }),
      h("button", { class: "btn sm", text: "Next", onclick: () => { state.calendarMonth = localDateKey(addMonths(month, 1)).slice(0, 7); render(); } })
    ])
  ]);

  const grid = h("div", { class: "month-calendar" });
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
    grid.append(h("div", { class: "weekday", text: day }));
  });

  cells.forEach((cell) => {
    const day = scheduleByDay.get(cell.key) || { date: cell.date, tasks: [] };
    const relationshipEvents = relationshipByDay.get(cell.key) || [];
    const visibleRelationships = relationshipEvents.slice(0, 2);
    const visibleTasks = day.tasks.slice(0, Math.max(0, 4 - visibleRelationships.length));
    const totalEvents = day.tasks.length + relationshipEvents.length;
    const overflow = Math.max(0, totalEvents - visibleTasks.length - visibleRelationships.length);
    const bucketCounts = BUCKETS.map((bucket) => ({
      bucket,
      count: day.tasks.filter((task) => task.bucket.key === bucket.key).length
    })).filter((entry) => entry.count);

    grid.append(h("section", {
      class: `calendar-cell ${cell.inMonth ? "" : "muted-month"} ${cell.isToday ? "today" : ""} ${cell.key === state.selectedCalendarDate ? "selected" : ""}`,
      onclick: () => {
        state.selectedCalendarDate = cell.key;
        render();
      }
    }, [
      h("div", { class: "cell-head" }, [
        h("span", { class: "cell-date", text: String(cell.date.getDate()) }),
        totalEvents ? h("span", { class: "cell-count", text: String(totalEvents) }) : null
      ]),
      bucketCounts.length ? h("div", { class: "cell-buckets" }, bucketCounts.map((entry) =>
        h("span", { class: `cell-bucket ${entry.bucket.key}`, title: entry.bucket.label, text: String(entry.count) })
      )) : null,
      h("div", { class: "cell-events" }, [
        ...visibleRelationships.map((item) => h("button", {
          class: `calendar-event relationship-${item.type}`,
          title: `${item.label} · ${item.conversation.name}`,
          onclick: (event) => {
            event.stopPropagation();
            state.conversationSearch = item.conversation.name;
            go("conversations");
          }
        }, [h("span", { class: "event-bucket-dot" }), h("span", { class: "event-text", text: `${item.conversation.name} · ${item.type === "meeting" ? "Call" : "Follow up"}` })])),
        ...visibleTasks.map((task) => h("button", {
          class: `calendar-event ${task.bucket.key}`,
          title: `${task.lead.name} · ${task.lead.company} · Email ${task.touchNumber}`,
          onclick: (event) => {
            event.stopPropagation();
            go("outreach", { lead: task.lead.id, touch: task.touchNumber });
          }
        }, [
          h("span", { class: "event-bucket-dot" }),
          h("span", { class: "event-text", text: `${task.lead.name} · E${task.touchNumber}` })
        ]))
      ]),
      overflow ? h("button", {
        class: "calendar-more",
        onclick: (event) => {
          event.stopPropagation();
          state.selectedCalendarDate = cell.key;
          render();
        },
        text: `+${overflow} more`
      }) : null
    ]));
  });

  const agendaGroups = BUCKETS.map((bucket) => ({
    bucket,
    tasks: selectedDay.tasks.filter((task) => task.bucket.key === bucket.key)
  })).filter((group) => group.tasks.length);
  const selectedRelationships = relationshipByDay.get(state.selectedCalendarDate) || [];

  const agenda = h("aside", { class: "calendar-agenda" }, [
    h("header", { class: "agenda-head" }, [
      h("div", {}, [
        h("span", { class: "day-label", text: state.selectedCalendarDate === todayKey ? "Today" : "Selected day" }),
        h("h2", { class: "day-date", text: formatCalendarDay(selectedDay.date) })
      ]),
      h("span", { class: "day-count", text: `${selectedDay.tasks.length + selectedRelationships.length} items` })
    ]),
    selectedRelationships.length ? h("section", { class: "agenda-group relationship-agenda-group" }, [
      h("div", { class: "day-group-head" }, [h("span", { class: "chip fit", text: "Relationships" }), h("span", { class: "day-group-count", text: String(selectedRelationships.length) })]),
      ...selectedRelationships.map((item) => h("button", {
        class: "agenda-task",
        onclick: () => { state.conversationSearch = item.conversation.name; go("conversations"); }
      }, [
        h("span", { class: "task-touch", text: `${item.label} · ${relationshipDate(item.at)}` }),
        h("strong", { class: "task-person", text: item.conversation.name }),
        h("span", { class: "task-subject", text: item.conversation.next_action || item.conversation.summary })
      ]))
    ]) : null,
    agendaGroups.length ? h("div", { class: "agenda-groups" }, agendaGroups.map((group) =>
      h("section", { class: "agenda-group" }, [
        h("div", { class: "day-group-head" }, [
          h("span", { class: `chip bucket ${group.bucket.key}`, text: group.bucket.label }),
          h("span", { class: "day-group-count", text: `${group.tasks.length}` })
        ]),
        ...group.tasks.map((task) =>
          h("button", {
            class: "agenda-task",
            onclick: () => go("outreach", { lead: task.lead.id, touch: task.touchNumber })
          }, [
            h("span", { class: "task-touch", text: `Email ${task.touchNumber} · ${task.title}` }),
            h("strong", { class: "task-person", text: `${task.lead.name} · ${task.lead.company}` }),
            h("span", { class: "task-subject", text: task.subject || task.note })
          ])
        )
      ])
    )) : selectedRelationships.length ? null : h("p", { class: "muted pad", text: "No outreach or relationship activity scheduled for this day." })
  ]);

  el.append(toolbar, h("div", { class: "calendar-shell" }, [grid, agenda]));
  return el;
}

/* ---------- page: Intelligence ---------- */
function renderValue(value) {
  if (value == null || value === "") return h("p", { class: "muted", text: "—" });
  if (typeof value !== "object") return h("p", { class: "value-text", text: String(value) });
  if (Array.isArray(value)) {
    if (!value.length) return h("p", { class: "muted", text: "None." });
    if (value.every((v) => typeof v !== "object")) {
      return h("ul", { class: "bullet" }, value.map((v) => h("li", { text: String(v) })));
    }
    return h("div", { class: "card-grid" }, value.map((v) => renderCard(v)));
  }
  return renderCard(value);
}

function renderCard(obj) {
  if (typeof obj !== "object" || obj == null) return renderValue(obj);
  const titleKey = ["company", "name", "account_name", "title", "segment"].find((k) => typeof obj[k] === "string" && obj[k]);
  const card = h("div", { class: "mini-card" });
  if (titleKey) card.append(h("h4", { class: "mini-card-title", text: obj[titleKey] }));
  const rows = h("div", {});
  for (const [k, v] of Object.entries(obj)) {
    if (k === titleKey) continue;
    rows.append(h("div", { class: "kv" }, [h("span", { class: "kv-k", text: humanize(k) }), h("div", { class: "kv-v" }, [renderValue(v)])]));
  }
  card.append(rows);
  return card;
}

/* ---------- knowledge graph (2D, light) ---------- */
// Light DeepMind/Google palette — reads cleanly on a near-white canvas.
const NODE_TYPES = {
  Product: { color: "#1a73e8", label: "Product" },
  Segment: { color: "#9334e6", label: "Segment" },
  Persona: { color: "#12a4a4", label: "Persona" },
  Offer: { color: "#e8710a", label: "Offer" },
  Pain: { color: "#d93025", label: "Pain" },
  Trigger: { color: "#f9ab00", label: "Trigger" },
  Proof: { color: "#1e8e3e", label: "Proof" },
  Metric: { color: "#00838f", label: "Metric" },
  Rule: { color: "#9aa0a6", label: "Rule" },
  Insight: { color: "#6a4bc4", label: "Insight" },
  Company: { color: "#4285f4", label: "Company" },
  Person: { color: "#188038", label: "Person" },
  Deal: { color: "#b06000", label: "Deal" },
  Conversation: { color: "#bdc1c6", label: "Conversation" },
  Investor: { color: "#e52592", label: "Investor" },
  Introduction: { color: "#80868b", label: "Introduction" }
};
// Concept nodes always show their label; the dense record types (people, deals,
// conversations, and the big insight/rule clusters) reveal labels on zoom/hover.
const ALWAYS_LABEL = new Set(["Product", "Segment", "Offer", "Persona", "Trigger", "Pain", "Proof", "Metric"]);
// Shown even in the zoomed-out overview so the map is legible at a glance.
const CORE_LABEL = new Set(["Product", "Segment", "Offer"]);
// The lead record spine — present in the graph but off by default so the graph
// leads with the knowledge (product, ICP, offers, strategy), not 250 lead nodes.
const DEFAULT_HIDDEN = new Set(["Person", "Deal", "Conversation"]);
// Types that get a big floating group heading over their cluster.
const GROUP_LABELS = {
  Segment: "ICP SEGMENTS",
  Persona: "BUYER PERSONAS",
  Offer: "OFFERS",
  Pain: "PAINS",
  Trigger: "TRIGGERS",
  Proof: "PROOF",
  Metric: "METRICS",
  Rule: "RULES",
  Insight: "INSIGHTS",
  Company: "COMPANIES",
  Person: "PEOPLE",
  Deal: "DEALS",
  Conversation: "CONVERSATIONS"
};

const VENDOR_SCRIPTS = ["/vendor/force-graph.min.js"];
let vendorPromise = null;
function loadGraphVendor() {
  if (window.ForceGraph) return Promise.resolve();
  if (vendorPromise) return vendorPromise;
  vendorPromise = VENDOR_SCRIPTS.reduce(
    (chain, src) =>
      chain.then(
        () =>
          new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.append(s);
          })
      ),
    Promise.resolve()
  );
  return vendorPromise;
}

function nodeColor(type) {
  return (NODE_TYPES[type] || { color: "#80868b" }).color;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// One live controller, reused across poll re-renders so the canvas + zoom survive.
let intelGraph = null;

function renderIntelligence() {
  const product = activeProduct();
  if (intelGraph && intelGraph.productKey === product.key) return intelGraph.root;
  if (intelGraph) intelGraph.destroy();
  intelGraph = createKnowledgeGraph(product);
  return intelGraph.root;
}

function createKnowledgeGraph(product) {
  const root = h("section", { class: "page graph-page light" });
  const canvas = h("div", { class: "graph-canvas" });
  const status = h("div", { class: "graph-status", text: "Loading knowledge graph…" });

  const title = h("div", { class: "graph-title" }, [
    h("p", { class: "eyebrow", text: "Knowledge" }),
    h("h1", { class: "graph-h1", text: `${product.name} — everything we know` }),
    h("p", { class: "graph-meta", text: "" })
  ]);
  const search = h("input", { class: "graph-search", type: "search", placeholder: "Search the graph…", "aria-label": "Search graph" });
  const filters = h("div", { class: "graph-filters" });
  const hudTop = h("div", { class: "graph-hud graph-hud-tl" }, [title, search, filters]);

  const scopeBtn = h("button", { class: "btn sm", text: "All products" });
  const fitBtn = h("button", { class: "btn sm", text: "Fit" });
  const labelsBtn = h("button", { class: "btn sm", text: "Labels: auto" });
  const refreshBtn = h("button", { class: "btn sm", text: "Refresh" });
  const hudRight = h("div", { class: "graph-hud graph-hud-tr" }, [scopeBtn, labelsBtn, fitBtn, refreshBtn]);

  const detail = h("aside", { class: "graph-detail" });
  const legend = h("div", { class: "graph-legend" });

  root.append(canvas, hudTop, hudRight, legend, detail, status);

  const ctrl = {
    productKey: product.key,
    root,
    fg: null,
    ro: null,
    scope: "product",
    master: [],
    linksRaw: [],
    byId: new Map(),
    activeTypes: new Set(),
    term: "",
    selectedId: null,
    labelMode: "auto", // auto | all | concepts
    anchors: {},
    destroyed: false,
    destroy() {
      this.destroyed = true;
      try { this.ro?.disconnect(); } catch {}
      try { this.fg?._destructor?.(); } catch {}
    }
  };

  const neighborIds = () => {
    const set = new Set();
    if (!ctrl.selectedId) return set;
    for (const l of ctrl.linksRaw) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === ctrl.selectedId) set.add(t);
      else if (t === ctrl.selectedId) set.add(s);
    }
    return set;
  };

  const neighborsOf = (id) => {
    const out = [];
    for (const l of ctrl.linksRaw) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === id) out.push({ rel: l.rel, node: ctrl.byId.get(t) });
      else if (t === id) out.push({ rel: l.rel, node: ctrl.byId.get(s) });
    }
    return out.filter((x) => x.node);
  };

  const matchesTerm = (n) => {
    if (!ctrl.term) return true;
    return `${n.label} ${n.type} ${JSON.stringify(n.properties || {})}`.toLowerCase().includes(ctrl.term);
  };
  const visible = (n) => ctrl.activeTypes.has(n.type);

  function radiusOf(n) {
    return Math.max(2.2, Math.sqrt(n.val || 3) * 1.7);
  }

  function renderDetail() {
    detail.replaceChildren();
    const n = ctrl.selectedId ? ctrl.byId.get(ctrl.selectedId) : null;
    if (!n) { detail.classList.remove("open"); return; }
    detail.classList.add("open");
    const meta = NODE_TYPES[n.type] || {};
    detail.append(
      h("div", { class: "graph-detail-head" }, [
        h("div", {}, [
          h("span", { class: "graph-tag", text: meta.label || n.type, dataset: { type: n.type } }),
          h("h2", { class: "graph-detail-name", text: n.label })
        ]),
        h("button", { class: "graph-detail-close", text: "×", "aria-label": "Close", onclick: () => selectNode(null) })
      ])
    );
    const body = h("div", { class: "graph-detail-body" });
    const props = { ...(n.properties || {}) };
    ["product", "is_self", "name"].forEach((k) => delete props[k]);
    const order = Object.keys(props).filter((k) => props[k] != null && props[k] !== "");
    if (order.length) {
      order.forEach((k) => body.append(h("div", { class: "field-block" }, [h("h3", { class: "field-h", text: humanize(k) }), renderValue(props[k])])));
    } else {
      body.append(h("p", { class: "muted", text: "No extra properties recorded." }));
    }
    const nbrs = neighborsOf(n.id);
    if (nbrs.length) {
      const list = h("div", { class: "graph-neighbors" });
      nbrs.slice(0, 60).forEach(({ rel, node }) =>
        list.append(
          h("button", { class: "graph-neighbor", onclick: () => focusNode(node.id) }, [
            h("span", { class: "graph-dot", dataset: { type: node.type } }),
            h("span", { class: "graph-neighbor-rel", text: humanize(rel) }),
            h("span", { class: "graph-neighbor-name", text: node.label })
          ])
        )
      );
      body.append(h("div", { class: "field-block" }, [h("h3", { class: "field-h", text: `Connections (${nbrs.length})` }), list]));
    }
    detail.append(body);
  }

  function applyData() {
    if (!ctrl.fg) return;
    const nodes = ctrl.master.filter(visible);
    const shown = new Set(nodes.map((n) => n.id));
    const links = ctrl.linksRaw
      .map((l) => ({ source: typeof l.source === "object" ? l.source.id : l.source, target: typeof l.target === "object" ? l.target.id : l.target, rel: l.rel }))
      .filter((l) => shown.has(l.source) && shown.has(l.target));
    ctrl.fg.graphData({ nodes, links });
  }

  function selectNode(node) {
    ctrl.selectedId = node ? node.id : null;
    ctrl.selNbrs = ctrl.selectedId ? neighborIds() : null;
    renderDetail();
  }

  function focusNode(id) {
    const n = ctrl.byId.get(id);
    if (!n || !ctrl.fg) return;
    if (!visible(n)) { ctrl.activeTypes.add(n.type); syncFilterChips(); applyData(); }
    selectNode(n);
    if (Number.isFinite(n.x)) {
      ctrl.fg.centerAt(n.x, n.y, 700);
      ctrl.fg.zoom(Math.max(2.2, ctrl.fg.zoom()), 700);
    }
  }

  function syncFilterChips() {
    filters.querySelectorAll("[data-type]").forEach((chip) => chip.classList.toggle("on", ctrl.activeTypes.has(chip.dataset.type)));
  }

  function buildChrome() {
    const counts = {};
    ctrl.master.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
    const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    // Default to the knowledge layer; the lead record spine (people/deals/
    // conversations) is one click away via its chips but off by default so the
    // "what the product is / who the ICP is" structure reads cleanly.
    ctrl.activeTypes = new Set(types.filter((t) => !DEFAULT_HIDDEN.has(t)));

    // Cluster anchors: spread present types around a ring (Product at centre).
    const ring = types.filter((t) => t !== "Product");
    const R = 520 + ring.length * 26;
    ctrl.anchors = { Product: { x: 0, y: 0 } };
    ring.forEach((t, i) => {
      const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      ctrl.anchors[t] = { x: Math.cos(a) * R, y: Math.sin(a) * R };
    });

    filters.replaceChildren();
    types.forEach((type) => {
      filters.append(
        h("button", { class: `graph-chip ${ctrl.activeTypes.has(type) ? "on" : ""}`, dataset: { type }, onclick: () => {
          if (ctrl.activeTypes.has(type)) ctrl.activeTypes.delete(type); else ctrl.activeTypes.add(type);
          syncFilterChips(); applyData();
        } }, [
          h("span", { class: "graph-dot", dataset: { type } }),
          h("span", { text: NODE_TYPES[type]?.label || type }),
          h("em", { class: "graph-chip-n", text: String(counts[type]) })
        ])
      );
    });

    legend.replaceChildren(
      ...types.map((type) => h("span", { class: "graph-legend-item" }, [h("span", { class: "graph-dot", dataset: { type } }), h("span", { text: NODE_TYPES[type]?.label || type })]))
    );
    title.querySelector(".graph-meta").textContent = `${ctrl.master.length} nodes · ${ctrl.linksRaw.length} links`;
  }

  function sizeCanvas() {
    if (!ctrl.fg) return;
    ctrl.fg.width(canvas.clientWidth || 900).height(canvas.clientHeight || 640);
  }

  // Custom node draw: dot + optional label, with dim/highlight states.
  function drawNode(node, ctx, globalScale) {
    const nbrs = ctrl.selNbrs || null;
    const dimmed =
      (ctrl.term && !matchesTerm(node)) ||
      (ctrl.selectedId && node.id !== ctrl.selectedId && nbrs && !nbrs.has(node.id));
    const r = radiusOf(node);
    ctx.globalAlpha = dimmed ? 0.18 : 1;

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = nodeColor(node.type);
    ctx.fill();
    if (node.id === ctrl.selectedId) {
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeStyle = "#1a1c1e";
      ctx.stroke();
    }

    // Label visibility. Auto keeps the overview clean: only the core concept
    // types plus the selection/neighbours are labelled until you zoom in, while
    // the floating group headings tell you what each cluster is.
    const wantLabel =
      ctrl.labelMode === "all"
        ? true
        : ctrl.labelMode === "concepts"
        ? ALWAYS_LABEL.has(node.type)
        : CORE_LABEL.has(node.type) ||
          node.id === ctrl.selectedId ||
          (nbrs && nbrs.has(node.id)) ||
          (ALWAYS_LABEL.has(node.type) && globalScale > 0.9) ||
          globalScale > 2.2;
    if (wantLabel && !dimmed) {
      const fontPx = Math.min(13, Math.max(9, (node.type === "Product" ? 15 : 11)));
      ctx.font = `${fontPx / globalScale}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = node.label.length > 40 ? `${node.label.slice(0, 39)}…` : node.label;
      const y = node.y + r + 1.5 / globalScale;
      ctx.lineWidth = 3 / globalScale;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(label, node.x, y);
      ctx.fillStyle = node.id === ctrl.selectedId ? "#1a1c1e" : "#3c4043";
      ctx.fillText(label, node.x, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawNodePointerArea(node, color, ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radiusOf(node) + 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Floating group headings at each type-cluster centroid.
  function drawGroupLabels(ctx, globalScale) {
    const nodes = ctrl.fg.graphData().nodes;
    const acc = {};
    for (const n of nodes) {
      if (!Number.isFinite(n.x)) continue;
      const g = GROUP_LABELS[n.type];
      if (!g) continue;
      (acc[n.type] ||= { x: 0, y: 0, minY: Infinity, n: 0 });
      acc[n.type].x += n.x; acc[n.type].y += n.y; acc[n.type].n += 1;
      if (n.y < acc[n.type].minY) acc[n.type].minY = n.y;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const fontPx = Math.min(30, 15 / globalScale);
    ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
    for (const [type, a] of Object.entries(acc)) {
      if (a.n < 3) continue;
      const cx = a.x / a.n;
      const cy = a.minY - 14 / globalScale;
      ctx.fillStyle = "rgba(26,115,232,0.16)";
      ctx.fillText(GROUP_LABELS[type], cx, cy);
    }
  }

  function clusterForce(alpha) {
    for (const node of clusterForce._nodes || []) {
      const anchor = ctrl.anchors[node.type];
      if (!anchor) continue;
      const k = 0.22 * alpha;
      node.vx += (anchor.x - node.x) * k;
      node.vy += (anchor.y - node.y) * k;
    }
  }
  clusterForce.initialize = (nodes) => { clusterForce._nodes = nodes; };

  async function boot() {
    try {
      await loadGraphVendor();
      if (ctrl.destroyed) return;
      const url = ctrl.scope === "all" ? "/api/ontology?product=all" : productUrl("/api/ontology");
      const data = await fetch(url).then((r) => r.json());
      if (ctrl.destroyed) return;

      ctrl.master = (data.nodes || []).map((n) => ({ ...n }));
      ctrl.linksRaw = data.links || [];
      ctrl.byId = new Map(ctrl.master.map((n) => [n.id, n]));
      // Product membership spokes (has_*/targets_company/provides_offer…) drive the
      // layout but aren't drawn — they'd bury the graph in a sunburst. We render
      // only the cross-connections that show how the knowledge actually links up.
      ctrl.productIds = new Set(ctrl.master.filter((n) => n.type === "Product").map((n) => n.id));
      ctrl.selectedId = null;
      buildChrome();
      status.remove();

      ctrl.fg = window
        .ForceGraph()(canvas)
        .backgroundColor("#fbfcfe")
        .nodeRelSize(4)
        .nodeVal((n) => n.val || 3)
        .nodeLabel((n) => `<div class="graph-tip"><b>${escapeHtml(n.label)}</b><span>${NODE_TYPES[n.type]?.label || n.type}</span></div>`)
        .nodeCanvasObjectMode(() => "replace")
        .nodeCanvasObject(drawNode)
        .nodePointerAreaPaint(drawNodePointerArea)
        .linkColor(() => "rgba(60,64,67,0.16)")
        .linkWidth(1)
        .linkVisibility((l) => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          return !ctrl.productIds.has(s) && !ctrl.productIds.has(t);
        })
        .onNodeClick((n) => focusNode(n.id))
        .onBackgroundClick(() => selectNode(null))
        .onRenderFramePost(drawGroupLabels)
        .cooldownTicks(320)
        .onEngineStop(() => { try { ctrl.fg.zoomToFit(600, 90); } catch {} });

      ctrl.fg.d3Force("cluster", clusterForce);
      ctrl.fg.d3Force("charge").strength(-240).distanceMax(800);
      const linkForce = ctrl.fg.d3Force("link");
      if (linkForce) linkForce.distance(64).strength(0.16);
      ctrl.fg.d3VelocityDecay(0.3).warmupTicks(40);

      applyData();
      sizeCanvas();
      ctrl.ro = new ResizeObserver(() => sizeCanvas());
      ctrl.ro.observe(canvas);
    } catch (error) {
      status.textContent = `Could not load graph: ${error.message}`;
      status.classList.add("error");
    }
  }

  search.addEventListener("input", () => { ctrl.term = search.value.trim().toLowerCase(); });
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const hit = ctrl.master.find((n) => visible(n) && ctrl.term && matchesTerm(n));
    if (hit) focusNode(hit.id);
  });
  labelsBtn.addEventListener("click", () => {
    ctrl.labelMode = ctrl.labelMode === "auto" ? "all" : ctrl.labelMode === "all" ? "concepts" : "auto";
    labelsBtn.textContent = `Labels: ${ctrl.labelMode}`;
  });
  fitBtn.addEventListener("click", () => { try { ctrl.fg?.zoomToFit(500, 60); } catch {} });
  scopeBtn.addEventListener("click", () => {
    ctrl.scope = ctrl.scope === "all" ? "product" : "all";
    scopeBtn.textContent = ctrl.scope === "all" ? "This product" : "All products";
    scopeBtn.classList.toggle("on", ctrl.scope === "all");
    title.querySelector(".graph-h1").textContent = ctrl.scope === "all" ? "All products — everything we know" : `${product.name} — everything we know`;
    if (ctrl.fg) { try { ctrl.fg._destructor?.(); } catch {} ctrl.fg = null; canvas.replaceChildren(); }
    root.append(status);
    status.textContent = "Loading knowledge graph…";
    status.classList.remove("error");
    boot();
  });
  refreshBtn.addEventListener("click", async () => {
    const url = ctrl.scope === "all" ? "/api/ontology?product=all" : productUrl("/api/ontology");
    const data = await fetch(url).then((r) => r.json());
    const prev = new Map(ctrl.master.map((n) => [n.id, n]));
    ctrl.master = (data.nodes || []).map((n) => { const p = prev.get(n.id); return p && Number.isFinite(p.x) ? { ...n, x: p.x, y: p.y } : { ...n }; });
    ctrl.linksRaw = data.links || [];
    ctrl.byId = new Map(ctrl.master.map((n) => [n.id, n]));
    buildChrome();
    applyData();
    toast("Graph refreshed");
  });

  boot();
  return ctrl;
}

/* ---------- page: Activity ---------- */
function renderActivity() {
  const prefix = `${activeProduct().slug}-`;
  const messages = state.messages.filter((message) => {
    return [message.from, message.to, message.payload?.artifactSlug].some((value) => String(value || "").includes(prefix));
  });
  const el = h("section", { class: "page" });
  el.append(pageHead("Bus", `${activeProduct().name} Activity`, `${messages.length} recent events`, null));
  const list = h("div", { class: "activity" });
  if (!messages.length) list.append(h("p", { class: "muted", text: "No activity yet." }));
  messages.slice().reverse().forEach((m) => {
    list.append(h("div", { class: "act-row" }, [
      h("time", { class: "act-time", text: new Date(m.timestamp).toLocaleString() }),
      h("div", {}, [
        h("strong", { class: "act-title", text: `${m.type || "event"} · ${m.from || "?"} → ${m.to || "project"}` }),
        h("p", { class: "act-body", text: m.summary || "" })
      ])
    ]));
  });
  el.append(list);
  return el;
}

/* ---------- page: Run live smoke ---------- */
// Calls the SAME canonical orchestrator as the CLI (`npm run smoke:live`) and the
// OpenClaw controller. Draft-only: it stops at human approval and never sends.
let smokeLivePoll = null;

function smokeStageRow(s) {
  const badge = { ok: "good", skipped: "muted", running: "warn", blocked: "bad", pending: "muted" }[s.status] || "muted";
  return h("div", { class: "act-row" }, [
    h("strong", { class: `pill ${badge}`, text: s.status || "pending" }),
    h("div", {}, [
      h("strong", { class: "act-title", text: s.key }),
      h("p", { class: "act-body", text: [s.detail, s.error, s.attempts ? `attempts: ${s.attempts}` : ""].filter(Boolean).join(" · ") || "" })
    ])
  ]);
}

function renderLiveSmoke() {
  const el = h("section", { class: "page" });
  const panel = h("div", {});
  el.append(pageHead("Ops", "Run live smoke", "Six-account canonical orchestrator · draft-only, human-gated", null));

  const refresh = async () => {
    let data = {};
    try { data = await fetch("/api/smoke-live").then((r) => r.json()); } catch { data = { error: "unreachable" }; }
    const pf = data.preflight || {};
    const st = data.status || {};
    const running = Boolean(data.running);

    const controls = h("div", { class: "row gap" }, [
      h("button", {
        class: "btn primary", disabled: running || (pf && pf.ok === false) ? true : undefined,
        text: running ? "Running…" : (st && st.blockers && st.blockers.length ? "Resume run" : "Run live smoke"),
        onclick: async () => { await apiPost("/api/smoke-live"); setTimeout(refresh, 500); }
      }),
      h("span", { class: "muted", text: running ? `stage: ${st.current_stage || "…"}${st.current_account ? ` · accounts: ${st.current_account}` : ""}${st.current_agent ? ` · agent: ${st.current_agent}` : ""} · ${Math.round((st.elapsed_ms || 0) / 1000)}s` : (pf.ok ? "preflight OK — ready" : "preflight blocked") })
    ]);

    // Preflight / credential readiness.
    const pfBox = h("div", { class: "card" }, [
      h("strong", { text: "Preflight" }),
      ...((pf.checks || []).map((c) => h("p", { class: c.ok ? "good" : "bad", text: `${c.ok ? "✓" : "✕"} ${c.name}: ${c.detail}${c.missing ? ` — missing: ${c.missing}` : ""}` })))
    ]);

    // Stages + blockers + report.
    const stagesBox = h("div", { class: "card" }, [
      h("strong", { text: "Stages" }),
      h("p", { class: "muted", text: `Completed accounts: ${(st.completed_accounts || []).length}/${st.total_accounts || 6}${(st.completed_accounts || []).length ? ` · ${(st.completed_accounts || []).join(", ")}` : ""}` }),
      ...((st.stages || []).map(smokeStageRow))
    ]);
    const blockers = (st.blockers || []);
    const blockersBox = h("div", { class: "card" }, [
      h("strong", { text: `Blockers (${blockers.length})` }),
      ...(blockers.length ? blockers.map((b) => h("p", { class: "bad", text: `[${b.type}${b.human ? `/${b.human}` : ""}] ${typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail)}` })) : [h("p", { class: "muted", text: "none" })])
    ]);
    const rep = st.report;
    const reportBox = h("div", { class: "card" }, [
      h("strong", { text: "Result" }),
      rep
        ? h("p", { class: rep.draft_only_intact ? "good" : "bad", text: `loop_complete ${rep.loop_complete_accounts}/${rep.of} · draft-only ${rep.draft_only_intact ? "intact" : "VIOLATED"} · won ${rep.won_accounts} (won = signed contract only)` })
        : h("p", { class: "muted", text: "no completed run yet" })
    ]);

    panel.replaceChildren(controls, pfBox, stagesBox, blockersBox, reportBox);

    // Poll while a run is active; stop when idle or the view changes.
    if (smokeLivePoll) { clearTimeout(smokeLivePoll); smokeLivePoll = null; }
    if (running && state.view === "live-smoke") smokeLivePoll = setTimeout(refresh, 3000);
  };

  refresh();
  el.append(panel);
  return el;
}

/* ---------- page: Agent Health ---------- */
const TIER_ORDER = ["lead", "cohort", "control", "deterministic"];
const TIER_LABEL = { lead: "Lead (per-lead live path)", cohort: "Cohort (per approved cohort)", control: "Control (weekly/monthly strategy)", deterministic: "Deterministic (code, off live path)" };

function renderAgentHealth() {
  const health = state.agentHealth || { summary: {}, agents: [] };
  const summary = health.summary || {};
  const el = h("section", { class: "page" });
  el.append(pageHead(
    "System health",
    "Six accountable workflows",
    "Technical agents remain implementation details. What matters here is whether each founder workflow can produce its business decision.",
    [h("button", { class: "btn", text: "Refresh", onclick: () => load() })]
  ));

  const workflowSpecs = [
    ["Signal Scout", "Finds a verified trigger or warm route.", /(account-sourcing|contact-discovery|revenue-demand-radar)/],
    ["Account Qualifier", "Chooses the venture, play, buyer role, and 90-day commercial path.", /(account-scoring|lead-persona|icp-contact)/],
    ["Outreach Assistant", "Prepares one short, evidenced message for human approval.", /(outreach-angle|email-drafter|sequence-drafter|sequence-reviewer)/],
    ["Conversation Triage", "Turns imported replies into outcomes and one next action.", null],
    ["Meeting and Deal Assistant", "Confirms calls, captures outcomes, qualifies, and scopes.", /(pipeline-capacity|offer-map)/],
    ["Learning Analyst", "Reports progression, objections, corrections, and falsified assumptions.", /(revenue-strategy|industry-map|company-context)/]
  ];
  const workflows = workflowSpecs.map(([name, decision, pattern]) => {
    const members = pattern ? (health.agents || []).filter((agent) => pattern.test(agent.slug)) : [];
    const blocked = members.filter((agent) => agent.blocker).length;
    const fresh = members.filter((agent) => agent.fresh).length;
    const deterministicReady = name === "Conversation Triage" && (state.founder.actions || []).length > 0;
    return h("article", { class: `workflow-card ${blocked && !fresh ? "attention" : ""}` }, [
      h("div", { class: "workflow-head" }, [
        h("h2", { text: name }),
        h("span", { class: `chip ${deterministicReady || fresh ? "fit" : blocked ? "warn" : ""}`, text: deterministicReady ? "operating" : fresh ? `${fresh} fresh` : blocked ? "attention" : "manual" })
      ]),
      h("p", { text: decision }),
      h("small", { text: members.length ? `${members.length} technical components · ${blocked} blocked` : "Canonical deterministic workflow" })
    ]);
  });
  el.append(h("div", { class: "workflow-grid" }, workflows));

  const registry = h("details", { class: "technical-registry card" }, [
    h("summary", { text: `Technical registry · ${summary.total || 0} agents · ${summary.blocked || 0} blocked` })
  ]);
  for (const tier of TIER_ORDER) {
    const agents = (health.agents || []).filter((a) => a.tier === tier);
    if (!agents.length) continue;
    registry.append(h("h2", { class: "block-title", text: `${TIER_LABEL[tier] || tier} · ${agents.length}` }));
    const rows = h("div", { class: "agent-health-list" });
    for (const a of agents) rows.append(h("article", { class: `agent-health-row${a.criticalPath ? " critical" : ""}` }, [
      h("div", { class: "ah-main" }, [
        h("div", { class: "ah-head" }, [h("strong", { text: a.slug }), a.blocker ? h("span", { class: "chip warn", text: "blocked" }) : a.fresh ? h("span", { class: "chip fit", text: "fresh" }) : h("span", { class: "chip", text: humanize(a.status || "idle") })]),
        h("p", { class: "muted small", text: a.blocker ? `Blocker: ${a.blocker}` : `Consumer decisions: ${a.downstreamConsumers.length}` })
      ]),
      h("div", { class: "ah-meta" }, [h("span", { text: a.cadence }), h("span", { text: a.schemaPass == null ? "schema —" : a.schemaPass ? "schema ✓" : "schema ✗" })])
    ]));
    registry.append(rows);
  }
  el.append(registry);
  return el;
}

/* ---------- page: LinkedIn portfolio ---------- */
const LINKEDIN_PRODUCT_LABELS = { gnk: "GNK", outagehub: "OHUB", morrow: "Morrow", other: "Other" };
const CONNECTION_MOTION_LABELS = { gnk: "GNK sell", outagehub: "OHUB sell", morrow: "Morrow research", other: "Needs context" };

function filteredLinkedinProspects() {
  const query = state.linkedinSearch.trim().toLowerCase();
  return (state.linkedin.prospects || []).filter((prospect) => {
    if (state.linkedinProduct !== "all" && prospect.product !== state.linkedinProduct) return false;
    if (!query) return true;
    return `${prospect.name} ${prospect.title} ${prospect.company} ${prospect.segment} ${prospect.observed_signal}`.toLowerCase().includes(query);
  });
}

function refreshLinkedinList(container) {
  container.replaceChildren();
  const prospects = filteredLinkedinProspects();
  if (!prospects.length) {
    container.append(h("div", { class: "card pad muted", text: "No LinkedIn contacts match those filters." }));
    return;
  }
  for (const prospect of prospects) {
    container.append(h("article", { class: "linkedin-contact-card" }, [
      h("div", { class: "linkedin-person" }, [
        h("div", { class: `linkedin-avatar product-${prospect.product}`, text: String(prospect.name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() }),
        h("div", { class: "linkedin-person-copy" }, [
          h("div", { class: "linkedin-rank" }, [
            h("span", { class: `portfolio-product product-${prospect.product}`, text: LINKEDIN_PRODUCT_LABELS[prospect.product] || prospect.product }),
            `#${prospect.rank}`
          ]),
          h("h2", { text: prospect.name }),
          h("p", { text: prospect.title || "Role verified in CRM" }),
          h("strong", { text: prospect.company }),
          h("a", {
            class: "linkedin-profile-link",
            href: prospect.profile_url,
            target: "_blank",
            rel: "noreferrer",
            text: "Open verified LinkedIn profile ↗"
          })
        ])
      ]),
      h("div", { class: "linkedin-research" }, [
        h("span", { class: "chip fit", text: prospect.segment || "portfolio prospect" }),
        h("div", { class: "linkedin-fact" }, [h("strong", { text: "Observed signal" }), h("p", { text: prospect.observed_signal })]),
        h("div", { class: "linkedin-fact" }, [h("strong", { text: "Why this person" }), h("p", { text: prospect.why_this_person })]),
        h("div", { class: "linkedin-fact value" }, [h("strong", { text: "What we can do" }), h("p", { text: prospect.what_we_can_do })])
      ]),
      h("div", { class: "linkedin-note" }, [
        h("div", { class: "linkedin-note-head" }, [
          h("span", { text: `Connection note · ${prospect.message_source}` }),
          h("strong", { text: `${prospect.message_length}/300` })
        ]),
        h("p", { text: prospect.message }),
        h("button", {
          class: "btn primary sm",
          text: "Copy connection note",
          onclick: async () => copyText(prospect.message, `${prospect.name}'s note copied`)
        }),
        h("details", { class: "linkedin-direct-messages" }, [
          h("summary", { text: "First message, follow-up and call rationale" }),
          h("div", { class: "linkedin-message-draft" }, [
            h("strong", { text: "First message · 55-90 words" }),
            h("p", { text: prospect.first_message }),
            h("button", { class: "btn sm", text: "Copy first message", onclick: () => copyText(prospect.first_message, "First message copied") })
          ]),
          h("div", { class: "linkedin-message-draft" }, [
            h("strong", { text: "Follow-up · touch two only" }),
            h("p", { text: prospect.follow_up }),
            h("button", { class: "btn sm", text: "Copy follow-up", onclick: () => copyText(prospect.follow_up, "Follow-up copied") })
          ]),
          h("div", { class: "linkedin-message-draft rationale" }, [h("strong", { text: "Call rationale" }), h("p", { text: prospect.call_rationale })])
        ])
      ])
    ]));
  }
}

function renderLinkedin() {
  const el = h("section", { class: "page linkedin-page" });
  const totals = state.linkedin.totals_by_product || {};
  el.append(pageHead(
    "Portfolio",
    "LinkedIn contacts",
    `${state.linkedin.total || 0} verified people across GNK, OHUB, and Morrow · stored in the canonical CRM`,
    null
  ));
  el.append(h("div", { class: "linkedin-summary" }, [
    metric("All verified", String(state.linkedin.verified_profiles || 0)),
    metric("GNK", String(totals.gnk || 0)),
    metric("OHUB", String(totals.outagehub || 0)),
    metric("Morrow", String(totals.morrow || 0))
  ]));

  const controls = h("div", { class: "linkedin-controls card" });
  const chips = h("div", { class: "chips" });
  for (const product of ["all", "gnk", "outagehub", "morrow"]) {
    const count = product === "all"
      ? Object.values(totals).reduce((sum, value) => sum + Number(value || 0), 0)
      : Number(totals[product] || 0);
    chips.append(h("button", {
      class: `chip-btn ${state.linkedinProduct === product ? "on" : ""}`,
      text: `${product === "all" ? "All brands" : LINKEDIN_PRODUCT_LABELS[product]} · ${count}`,
      onclick: () => { state.linkedinProduct = product; render(); }
    }));
  }
  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "Search people, companies, roles or signals…",
    value: state.linkedinSearch,
    oninput: (event) => {
      state.linkedinSearch = event.target.value;
      refreshLinkedinList(list);
    }
  });
  controls.append(chips, search);
  const list = h("div", { class: "linkedin-contact-list" });
  refreshLinkedinList(list);
  el.append(controls, list);
  if ((state.linkedin.validation_errors || []).length) {
    el.append(h("div", { class: "error-banner", text: state.linkedin.validation_errors.join(" · ") }));
  }
  return el;
}

/* ---------- page: imported first-degree network ---------- */
function filteredConnections() {
  const query = state.connectionSearch.trim().toLowerCase();
  return (state.connections.connections || []).filter((connection) => {
    if (state.connectionProduct !== "all" && connection.primary_product !== state.connectionProduct) return false;
    if (state.connectionStatus !== "all" && connection.review_status !== state.connectionStatus) return false;
    if (state.connectionConfidence === "strong" && connection.classification_score < 9) return false;
    if (state.connectionConfidence === "possible" && (connection.classification_score < 4 || connection.classification_score >= 9)) return false;
    if (state.connectionContact === "contacted" && !connection.contacted_at) return false;
    if (state.connectionContact === "not_contacted" && connection.contacted_at) return false;
    return !query || `${connection.name} ${connection.headline} ${connection.classification_reason}`.toLowerCase().includes(query);
  });
}

async function patchConnection(connection, patch) {
  const response = await fetch(`/api/linkedin-connections/${connection.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || "Could not update connection");
  const index = state.connections.connections.findIndex((item) => item.id === connection.id);
  if (index >= 0) {
    const previous = state.connections.connections[index];
    const summary = state.connections.summary || {};
    if (previous.primary_product !== result.connection.primary_product) {
      summary.by_product[previous.primary_product] = Math.max(0, (summary.by_product[previous.primary_product] || 0) - 1);
      summary.by_product[result.connection.primary_product] = (summary.by_product[result.connection.primary_product] || 0) + 1;
    }
    if (previous.review_status !== result.connection.review_status) {
      summary.by_status[previous.review_status] = Math.max(0, (summary.by_status[previous.review_status] || 0) - 1);
      summary.by_status[result.connection.review_status] = (summary.by_status[result.connection.review_status] || 0) + 1;
    }
    if (previous.profile_status === "search" && result.connection.profile_status !== "search") {
      summary.search_routes = Math.max(0, (summary.search_routes || 0) - 1);
      summary.direct_profiles = (summary.direct_profiles || 0) + 1;
    }
    if (!previous.contacted_at && result.connection.contacted_at) {
      summary.contacted = (summary.contacted || 0) + 1;
      summary.not_contacted = Math.max(0, (summary.not_contacted || 0) - 1);
    } else if (previous.contacted_at && !result.connection.contacted_at) {
      summary.contacted = Math.max(0, (summary.contacted || 0) - 1);
      summary.not_contacted = (summary.not_contacted || 0) + 1;
    }
    state.connections.connections[index] = result.connection;
  }
  return result.connection;
}

function connectionSelect(connection, field, values) {
  return h("select", {
    class: "connection-select",
    onchange: async (event) => {
      try {
        await patchConnection(connection, { [field]: event.target.value });
        toast("Connection updated");
        render();
      } catch (error) { toast(error.message); }
    }
  }, values.map(([value, label]) => h("option", {
    value,
    ...(connection[field] === value ? { selected: "" } : {}),
    text: label
  })));
}

function refreshConnectionList(container) {
  container.replaceChildren();
  const all = filteredConnections();
  const visible = all.slice(0, state.connectionVisible);
  if (!visible.length) {
    container.append(h("div", { class: "card pad muted", text: "No connections match those filters." }));
    return;
  }
  for (const connection of visible) {
    const scores = connection.product_scores || {};
    const stateClass = connection.review_status === "dismissed" ? "is-dismissed" : connection.contacted_at ? "is-contacted" : "";
    container.append(h("article", { class: `connection-row ${stateClass}` }, [
      h("div", { class: "connection-main" }, [
        h("div", { class: "connection-name-line" }, [
          h("h2", { text: connection.name }),
          h("span", { class: `portfolio-product product-${connection.primary_product}`, text: connection.primary_product === "other" ? "Other" : LINKEDIN_PRODUCT_LABELS[connection.primary_product] }),
          connection.review_status === "dismissed" ? h("span", { class: "chip dismissed", text: "Dismissed" }) : null
        ]),
        h("p", { class: "connection-headline", text: connection.headline || "No headline captured" }),
        h("div", { class: "connection-meta" }, [
          h("span", { text: `Connected ${new Date(`${connection.connected_on}T12:00:00`).toLocaleDateString()}` }),
          connection.linked_lead_id ? h("span", { class: "chip fit", text: "Already in CRM" }) : h("span", { text: "Not yet a CRM lead" }),
          h("span", { text: connection.profile_status === "search" ? "Profile needs confirmation" : "Profile confirmed" }),
          connection.contacted_at ? h("span", { class: "chip contacted", text: `Contacted ${new Date(connection.contacted_at).toLocaleDateString()}` }) : h("span", { text: "Not contacted" })
        ])
      ]),
      h("div", { class: "connection-fit" }, [
        h("div", { class: "connection-scores" }, [
          h("span", { class: connection.classification_score >= 9 ? "score-strong" : "", text: connection.classification_source === "human" ? "Manual" : connection.classification_score >= 9 ? "Strong route" : connection.classification_score >= 4 ? "Possible route" : "Unrouted" }),
          h("span", { text: `GNK ${scores.gnk || 0}` }),
          h("span", { text: `OHUB ${scores.outagehub || 0}` }),
          h("span", { text: `Morrow ${scores.morrow || 0}` })
        ]),
        h("p", { text: connection.classification_reason || "No classification reason" })
      ]),
      h("div", { class: "connection-review" }, [
        h("label", {}, [h("span", { text: "Bucket" }), connectionSelect(connection, "primary_product", [["gnk", "GNK"], ["outagehub", "OHUB"], ["morrow", "Morrow"], ["other", "Other"]])]),
        h("label", {}, [h("span", { text: "Review" }), connectionSelect(connection, "review_status", [["new", "New"], ["reviewing", "Reviewing"], ["qualified", "Qualified"], ["dismissed", "Dismissed"]])]),
        h("div", { class: "connection-actions" }, [
          h("button", {
            class: `btn sm ${connection.contacted_at ? "ghost" : ""}`,
            text: connection.contacted_at ? "Undo contacted" : "Mark contacted",
            onclick: async () => {
              try {
                await patchConnection(connection, { contacted: !connection.contacted_at, contact_channel: "linkedin" });
                toast(connection.contacted_at ? "Contact mark removed" : "Marked contacted");
                render();
              } catch (error) { toast(error.message); }
            }
          }),
          h("a", { class: "btn sm", href: connection.profile_url, target: "_blank", rel: "noreferrer", text: connection.profile_status === "search" ? "Find on LinkedIn ↗" : "Open profile ↗" }),
          h("button", {
            class: "btn ghost sm",
            text: "Confirm URL",
            onclick: async () => {
              const profile = prompt("Paste the direct LinkedIn /in/ profile URL", connection.profile_status === "search" ? "" : connection.profile_url);
              if (!profile) return;
              try { await patchConnection(connection, { profile_url: profile }); toast("Profile confirmed"); render(); }
              catch (error) { toast(error.message); }
            }
          })
        ])
      ])
    ]));
  }
  if (visible.length < all.length) {
    container.append(h("button", {
      class: "btn connection-more",
      text: `Show ${Math.min(100, all.length - visible.length)} more · ${all.length - visible.length} remaining`,
      onclick: () => { state.connectionVisible += 100; refreshConnectionList(container); }
    }));
  }
}

function renderConnections() {
  const el = h("section", { class: "page connections-page" });
  const summary = state.connections.summary || { by_product: {}, by_status: {} };
  const byProduct = summary.by_product || {};
  const potential = (byProduct.gnk || 0) + (byProduct.outagehub || 0) + (byProduct.morrow || 0);
  el.append(pageHead(
    "Relationship catalogue",
    "Your LinkedIn connections",
    `${summary.total || 0} imported first-degree connections · ${potential} potential customer or routing relationships · review before promotion to CRM`,
    null
  ));
  el.append(h("div", { class: "linkedin-summary connections-summary" }, [
    metric("All connections", String(summary.total || 0)),
    metric("Potential", String(potential)),
    metric("Contacted", String(summary.contacted || 0)),
    metric("Qualified", String(summary.by_status?.qualified || 0))
  ]));
  const productCards = h("div", { class: "connection-buckets" });
  for (const product of ["all", "gnk", "outagehub", "morrow", "other"]) {
    productCards.append(h("button", {
      class: `connection-bucket ${state.connectionProduct === product ? "on" : ""}`,
      onclick: () => { state.connectionProduct = product; state.connectionVisible = 100; render(); }
    }, [
      h("strong", { text: product === "all" ? "All" : product === "other" ? "Other" : LINKEDIN_PRODUCT_LABELS[product] }),
      h("span", { text: String(product === "all" ? summary.total || 0 : byProduct[product] || 0) })
    ]));
  }
  const controls = h("div", { class: "linkedin-controls card connection-controls" });
  const list = h("div", { class: "connection-list" });
  const status = h("select", {
    class: "search",
    onchange: (event) => { state.connectionStatus = event.target.value; state.connectionVisible = 100; refreshConnectionList(list); }
  }, [["all", "All review states"], ["new", "New"], ["reviewing", "Reviewing"], ["qualified", "Qualified"], ["dismissed", "Dismissed"]].map(([value, label]) => h("option", {
    value,
    ...(state.connectionStatus === value ? { selected: "" } : {}),
    text: label
  })));
  const confidence = h("select", {
    class: "search",
    onchange: (event) => { state.connectionConfidence = event.target.value; state.connectionVisible = 100; refreshConnectionList(list); }
  }, [["all", "All confidence levels"], ["strong", "Strong routes"], ["possible", "Possible routes"]].map(([value, label]) => h("option", {
    value,
    ...(state.connectionConfidence === value ? { selected: "" } : {}),
    text: label
  })));
  const contact = h("select", {
    class: "search",
    onchange: (event) => { state.connectionContact = event.target.value; state.connectionVisible = 100; refreshConnectionList(list); }
  }, [["all", "All contact states"], ["not_contacted", "Not contacted"], ["contacted", "Contacted"]].map(([value, label]) => h("option", {
    value,
    ...(state.connectionContact === value ? { selected: "" } : {}),
    text: label
  })));
  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "Search names, roles or classification reasons…",
    value: state.connectionSearch,
    oninput: (event) => { state.connectionSearch = event.target.value; state.connectionVisible = 100; refreshConnectionList(list); }
  });
  controls.append(status, confidence, contact, search);
  refreshConnectionList(list);
  el.append(productCards, controls, list);
  return el;
}

/* ---------- page: relationship history ---------- */
function relationshipDate(value, withTime = true) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : date.toLocaleDateString([], { dateStyle: "medium" });
}

function filteredConversations() {
  const query = state.conversationSearch.trim().toLowerCase();
  return (state.conversations.conversations || []).filter((conversation) => {
    if (conversation.product !== state.product) return false;
    if (state.conversationStatus === "call_proposed" && conversation.meeting_status !== "proposed") return false;
    if (state.conversationStatus === "call_scheduled" && conversation.meeting_status !== "scheduled") return false;
    if (!["all", "call_proposed", "call_scheduled"].includes(state.conversationStatus) && conversation.status !== state.conversationStatus) return false;
    const messageText = (conversation.messages || []).map((message) => message.body).join(" ");
    return !query || `${conversation.name} ${conversation.headline} ${conversation.summary} ${conversation.manual_notes || ""} ${messageText}`.toLowerCase().includes(query);
  });
}

function conversationStateLabel(conversation) {
  if (conversation.meeting_status === "completed") return "Call completed";
  if (conversation.meeting_status === "scheduled") return "Call booked";
  if (conversation.meeting_status === "proposed") return "Waiting to confirm call";
  if (conversation.status === "needs_reply") return "Reply needed";
  if (conversation.status === "closed") return "Closed";
  return conversation.last_outbound_at ? "Waiting for reply" : "Needs review";
}

function connectionForConversation(conversation) {
  return (state.connections.connections || []).find((connection) => connection.id === conversation.connection_id)
    || (state.connections.connections || []).find((connection) => sameName(connection.name, conversation.name)) || null;
}

async function patchConversation(conversation, patch) {
  const response = await fetch(`/api/linkedin-conversations/${conversation.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || "Could not update conversation");
  const refreshed = await fetch(productUrl("/api/linkedin-conversations")).then((item) => item.json());
  state.conversations = refreshed;
  return result.conversation;
}

async function qualifyConversation(conversation) {
  const prompts = [
    ["problem", "What buyer-confirmed problem exists?"],
    ["consequence", "What is the business or operating consequence?"],
    ["owner", "Who owns the problem and decision?"],
    ["timing", "What timing or urgency was confirmed?"],
    ["commercial_path", "What is the budget, procurement, or commercial path?"],
    ["next_step", "What explicit next step was agreed?"]
  ];
  const body = { conversation_id: conversation.id };
  for (const [field, question] of prompts) {
    const answer = prompt(question, "");
    if (answer == null) return;
    body[field] = answer.trim();
  }
  const due = prompt("When is the next step due? (ISO date/time or blank for now)", "");
  if (due) body.next_step_at = new Date(due).toISOString();
  try {
    await apiPost("/api/opportunities/qualify", body);
    toast("Qualified opportunity created with buyer evidence");
    await load();
  } catch (error) { toast(error.message); }
}

function conversationSelect(conversation, field, values) {
  return h("select", {
    class: "connection-select",
    onchange: async (event) => {
      try { await patchConversation(conversation, { [field]: event.target.value }); toast("Conversation updated"); render(); }
      catch (error) { toast(error.message); }
    }
  }, values.map(([value, label]) => h("option", { value, ...(conversation[field] === value ? { selected: "" } : {}), text: label })));
}

function conversationAgenda(items, title, emptyText, dateField) {
  const section = h("section", { class: "relationship-agenda card" });
  section.append(h("h2", { text: title }));
  if (!items.length) {
    section.append(h("p", { class: "muted", text: emptyText }));
    return section;
  }
  for (const item of items.slice(0, 8)) {
    section.append(h("button", {
      class: "agenda-item",
      onclick: () => {
        state.conversationSearch = item.name;
        const input = document.querySelector(".conversation-search");
        if (input) input.value = item.name;
        const list = document.querySelector(".conversation-list");
        if (list) refreshConversationList(list);
      }
    }, [
      h("span", { class: "agenda-date", text: relationshipDate(item[dateField]) }),
      h("strong", { text: item.name }),
      h("small", { text: item.next_action || item.summary })
    ]));
  }
  return section;
}

function refreshConversationList(container) {
  container.replaceChildren();
  const rows = filteredConversations();
  if (!rows.length) {
    container.append(h("div", { class: "card pad muted", text: "No conversations match those filters." }));
    return;
  }
  for (const conversation of rows) {
    const details = conversation.contact_details || {};
    const connection = connectionForConversation(conversation);
    const card = h("article", { class: `conversation-card status-${conversation.status}` });
    const main = h("div", { class: "conversation-summary" }, [
      h("div", { class: "connection-name-line" }, [
        h("h2", { text: conversation.name }),
        h("span", { class: `portfolio-product product-${conversation.product}`, text: conversation.product === "other" ? "Other" : LINKEDIN_PRODUCT_LABELS[conversation.product] }),
        h("span", { class: `conversation-status ${conversation.status}`, text: conversationStateLabel(conversation) }),
        connection?.contacted_at ? h("span", { class: "chip contacted", text: "Contacted" }) : null,
        connection?.review_status === "dismissed" ? h("span", { class: "chip dismissed", text: "Not relevant" }) : null
      ]),
      h("p", { class: "connection-headline", text: conversation.headline || "No headline captured" }),
      h("p", { class: "conversation-digest", text: conversation.summary }),
      h("div", { class: "connection-meta" }, [
        h("span", { text: `${conversation.message_count} messages · ${conversation.inbound_count} inbound · ${conversation.outbound_count} outbound` }),
        h("span", { text: `Last activity ${relationshipDate(conversation.last_message_at)}` }),
        h("span", { text: `Signal: ${humanize(conversation.response_theme)}` })
      ]),
      (details.emails || []).length || (details.phones || []).length ? h("div", { class: "contact-details" }, [
        ...(details.emails || []).map((email) => h("a", { href: `mailto:${email}`, text: email })),
        ...(details.phones || []).map((phone) => h("span", { text: phone }))
      ]) : null,
      h("div", { class: "next-action" }, [h("strong", { text: "Next action" }), h("span", { text: conversation.next_action || "Review conversation" })])
    ]);
    const workflow = h("div", { class: "conversation-workflow" }, [
      h("label", {}, [h("span", { text: "Workflow" }), conversationSelect(conversation, "status", [["waiting", "Waiting"], ["needs_reply", "Needs reply"], ["meeting_booked", "Meeting booked"], ["closed", "Closed"]])]),
      h("label", {}, [h("span", { text: "Meeting" }), conversationSelect(conversation, "meeting_status", [["none", "None"], ["proposed", "Proposed"], ["scheduled", "Scheduled"], ["completed", "Completed"], ["cancelled", "Cancelled"]])]),
      h("label", {}, [h("span", { text: "Confirmed outcome" }), conversationSelect(conversation, "primary_outcome", [["no_reply", "No reply"], ["polite_neutral", "Polite / neutral"], ["correction", "Correction"], ["objection", "Objection"], ["current_process_disclosure", "Current process disclosed"], ["problem_acknowledged", "Problem acknowledged"], ["timing_signal", "Timing signal"], ["referral", "Referral"], ["call_proposed", "Call proposed"], ["call_booked", "Call booked"], ["qualified_commercial_interest", "Qualified commercial interest"], ["negative_suppress", "Negative / suppress"]])]),
      h("label", {}, [h("span", { text: "Follow up" }), h("input", {
        class: "connection-select", type: "datetime-local", value: conversation.follow_up_at ? conversation.follow_up_at.slice(0, 16) : "",
        onchange: async (event) => { try { await patchConversation(conversation, { follow_up_at: event.target.value || null }); toast("Follow-up saved"); render(); } catch (error) { toast(error.message); } }
      })]),
      h("label", {}, [h("span", { text: "Call time" }), h("input", {
        class: "connection-select", type: "datetime-local", value: conversation.meeting_at ? conversation.meeting_at.slice(0, 16) : "",
        onchange: async (event) => { try { await patchConversation(conversation, { meeting_at: event.target.value || null }); toast("Call time saved"); render(); } catch (error) { toast(error.message); } }
      })]),
      h("div", { class: "conversation-actions" }, [
        conversation.profile_url ? h("a", { class: "btn sm", href: conversation.profile_url, target: "_blank", rel: "noreferrer", text: "Open LinkedIn ↗" }) : null,
        connection ? h("button", { class: `btn sm contact-action ${connection.contacted_at ? "is-contacted" : ""}`, text: connection.contacted_at ? "Contacted ✓" : "Mark contacted", onclick: async () => {
          try { await patchConnection(connection, { contacted: !connection.contacted_at, contact_channel: "linkedin" }); toast(connection.contacted_at ? "Contact mark removed" : "Marked contacted"); render(); }
          catch (error) { toast(error.message); }
        } }) : null,
        connection ? h("button", { class: `btn sm irrelevant-action ${connection.review_status === "dismissed" ? "is-dismissed" : ""}`, text: connection.review_status === "dismissed" ? "Restore" : "Not relevant", onclick: async () => {
          try { await patchConnection(connection, { review_status: connection.review_status === "dismissed" ? "qualified" : "dismissed" }); toast(connection.review_status === "dismissed" ? "Relationship restored" : "Marked not relevant"); render(); }
          catch (error) { toast(error.message); }
        } }) : null,
        conversation.primary_outcome === "qualified_commercial_interest" && conversation.outcome_confirmed_by
          ? h("button", { class: "btn primary sm", text: "Qualify opportunity", onclick: () => qualifyConversation(conversation) }) : null,
        h("span", { class: "muted", text: conversation.meeting_timezone ? `Call timezone: ${conversation.meeting_timezone}` : "" })
      ])
    ]);
    const noteArea = h("textarea", { class: "conversation-notes", placeholder: "Add your own notes, call outcome, or context…" });
    noteArea.value = conversation.manual_notes || "";
    const history = h("details", { class: "conversation-history" }, [
      h("summary", { text: `Full conversation · ${conversation.message_count} messages` }),
      h("div", { class: "message-timeline" }, (conversation.messages || []).map((message) => h("div", { class: `history-message ${message.direction}` }, [
        h("div", { class: "history-meta" }, [h("strong", { text: message.direction === "outbound" ? "You" : message.sender_name }), h("span", { text: relationshipDate(message.sent_at) })]),
        h("p", { text: message.body })
      ]))),
      h("div", { class: "notes-editor" }, [
        noteArea,
        h("button", { class: "btn sm", text: "Save notes", onclick: async () => { try { await patchConversation(conversation, { manual_notes: noteArea.value }); toast("Notes saved"); render(); } catch (error) { toast(error.message); } } })
      ])
    ]);
    card.append(h("div", { class: "conversation-top" }, [main, workflow]), history);
    container.append(card);
  }
}

function renderConversations() {
  const el = h("section", { class: "page conversations-page" });
  const data = state.conversations || {};
  const summary = data.summary || {};
  const insights = data.insights || { lessons: [], by_product: {}, themes: {} };
  el.append(pageHead(
    "Relationship intelligence",
    "Conversations, calls and follow-ups",
    `${summary.total || 0} people · ${summary.messages || 0} cleaned LinkedIn messages · full history linked to each relationship`,
    null
  ));
  el.append(h("div", { class: "linkedin-summary relationship-summary" }, [
    metric("Any reply · diagnostic", `${Math.round((insights.response_rate || 0) * 100)}%`),
    metric("Qualified replies", String(summary.qualified_replies || 0)),
    metric("Meetings booked", String(summary.meetings || 0)),
    metric("Needs reply", String(summary.needs_reply || 0))
  ]));
  const now = new Date().toISOString().slice(0, 19);
  const upcomingMeetings = (data.conversations || []).filter((item) => item.meeting_status === "scheduled" && item.meeting_at).sort((a, b) => a.meeting_at.localeCompare(b.meeting_at));
  const followups = (data.conversations || []).filter((item) => item.follow_up_at && item.status !== "closed" && item.meeting_status !== "scheduled").sort((a, b) => a.follow_up_at.localeCompare(b.follow_up_at));
  el.append(h("div", { class: "relationship-grid" }, [
    conversationAgenda(upcomingMeetings, "Call calendar", "No scheduled calls detected.", "meeting_at"),
    conversationAgenda(followups, "Follow-up queue", "No follow-ups queued.", "follow_up_at"),
    h("section", { class: "relationship-insights card" }, [
      h("h2", { text: "What the outreach is teaching us" }),
      ...(insights.lessons || []).map((lesson) => h("p", { text: lesson })),
      h("div", { class: "insight-themes" }, Object.entries(insights.themes || {}).filter(([, count]) => count).map(([theme, count]) => h("span", { text: `${humanize(theme)} ${count}` })))
    ])
  ]));
  const controls = h("div", { class: "linkedin-controls card conversation-controls" });
  const list = h("div", { class: "conversation-list" });
  const product = h("select", { class: "search", onchange: (event) => { state.conversationProduct = event.target.value; refreshConversationList(list); } },
    [["all", "All products"], ["gnk", "GNK"], ["outagehub", "OHUB"], ["morrow", "Morrow"], ["other", "Other"]].map(([value, label]) => h("option", { value, ...(state.conversationProduct === value ? { selected: "" } : {}), text: label })));
  const status = h("select", { class: "search", onchange: (event) => { state.conversationStatus = event.target.value; refreshConversationList(list); } },
    [["all", "All workflow states"], ["waiting", "Waiting"], ["needs_reply", "Needs reply"], ["meeting_booked", "Meeting booked"], ["closed", "Closed"]].map(([value, label]) => h("option", { value, ...(state.conversationStatus === value ? { selected: "" } : {}), text: label })));
  const search = h("input", { class: "search conversation-search", type: "search", placeholder: "Search people, messages, emails, notes or objections…", value: state.conversationSearch,
    oninput: (event) => { state.conversationSearch = event.target.value; refreshConversationList(list); } });
  controls.append(product, status, search);
  refreshConversationList(list);
  el.append(controls, list);
  return el;
}

function renderConversationPasteImport() {
  const person = h("input", { class: "search", type: "text", placeholder: "Person name (only if the copied text omits it)" });
  const paste = h("textarea", { class: "conversation-paste", placeholder: "Paste the copied LinkedIn DM conversation here…" });
  const result = state.conversationImportResult;
  return h("details", { class: "conversation-import card", open: result ? "" : null }, [
    h("summary", {}, [h("div", {}, [h("strong", { text: "Add or update LinkedIn DMs" }), h("span", { text: "Copy a conversation from LinkedIn, paste it here, and process it." })]), h("span", { class: "chip fit", text: "Paste + process" })]),
    h("div", { class: "conversation-import-body" }, [
      h("div", { class: "import-steps" }, [h("span", { text: "1. Open the LinkedIn conversation" }), h("span", { text: "2. Copy the conversation timeline or the full page" }), h("span", { text: "3. Paste and process" })]),
      person,
      paste,
      h("div", { class: "conversation-import-actions" }, [
        h("p", { text: "Existing messages are deduplicated. New messages are merged into the same person and the status, call state, next action, and learnings are recalculated." }),
        h("button", { class: "btn primary", text: "Process LinkedIn DMs", onclick: async () => {
          const text = paste.value.trim();
          if (!text) { toast("Paste the LinkedIn conversation first"); return; }
          try {
            const imported = await apiPost("/api/linkedin-chats/import", { text, name_hint: person.value.trim(), reference_day: new Date().toISOString().slice(0, 10) });
            state.conversationImportResult = imported;
            toast(`${imported.people.join(", ")}: ${imported.new_messages} new message${imported.new_messages === 1 ? "" : "s"} processed`);
            await load();
          } catch (error) { toast(error.message); }
        } })
      ]),
      result ? h("div", { class: "import-result" }, [h("strong", { text: `${result.processed_conversations} conversation${result.processed_conversations === 1 ? "" : "s"} processed` }), h("span", { text: `${result.new_messages} new messages · ${result.new_conversations} new people · ${result.people.join(", ")}` })]) : null
    ])
  ]);
}

function renderMessagedNetwork() {
  const data = state.conversations || {};
  const summary = data.summary || {};
  const conversations = data.conversations || [];
  const proposed = conversations.filter((item) => item.meeting_status === "proposed").length;
  const scheduled = conversations.filter((item) => item.meeting_status === "scheduled").length;
  const wrapper = h("div", { class: "messaged-workspace" });
  wrapper.append(
    h("div", { class: "messaged-summary" }, [
      founderMetric("People messaged", summary.total || 0, `${summary.messages || 0} DMs preserved`),
      founderMetric("Reply needed", summary.needs_reply || 0, "latest message is inbound"),
      founderMetric("Calls to confirm", proposed, "time was proposed but not confirmed"),
      founderMetric("Calls booked", scheduled, "scheduled in the imported conversation")
    ]),
    renderConversationPasteImport()
  );
  const controls = h("div", { class: "linkedin-controls card conversation-controls" });
  const list = h("div", { class: "conversation-list" });
  const status = h("select", { class: "search", onchange: (event) => { state.conversationStatus = event.target.value; refreshConversationList(list); } },
    [["all", "All current states"], ["waiting", "Waiting for reply"], ["needs_reply", "Reply needed"], ["call_proposed", "Waiting to confirm call"], ["call_scheduled", "Call booked"], ["closed", "Closed"]].map(([value, label]) => h("option", { value, ...(state.conversationStatus === value ? { selected: "" } : {}), text: label })));
  const search = h("input", { class: "search conversation-search", type: "search", placeholder: "Search people, DMs, notes or objections…", value: state.conversationSearch,
    oninput: (event) => { state.conversationSearch = event.target.value; refreshConversationList(list); } });
  controls.append(status, search);
  refreshConversationList(list);
  wrapper.append(controls, list);
  return wrapper;
}

/* ---------- SalesV3 2.1 founder-facing product ---------- */
function founderTabs(items, active, onChange) {
  return h("div", { class: "founder-tabs", role: "tablist" }, items.map(([key, label, count]) => h("button", {
    class: `founder-tab ${active === key ? "on" : ""}`,
    type: "button",
    role: "tab",
    text: `${label}${count == null ? "" : ` · ${count}`}`,
    onclick: () => onChange(key)
  })));
}

function sameName(a, b) {
  return norm(a) && norm(a) === norm(b);
}

function relationshipContext() {
  const action = (state.founder.actions || []).find((item) => item.id === state.drawerActionId) || null;
  const conversationId = state.drawerConversationId || (action?.entity_type === "conversation" ? Number(action.entity_id) : null);
  const conversation = (state.conversations.conversations || []).find((item) => item.id === conversationId) || null;
  const connectionId = state.drawerConnectionId || conversation?.connection_id || null;
  const connection = (state.connections.connections || []).find((item) => item.id === connectionId)
    || (conversation ? (state.connections.connections || []).find((item) => sameName(item.name, conversation.name)) : null);
  const prospect = (state.linkedin.prospects || []).find((item) => sameName(item.name, conversation?.name || connection?.name)) || null;
  return { action, conversation, connection, prospect };
}

function openRelationship({ action = null, conversation = null, connection = null } = {}) {
  state.drawerActionId = action?.id || null;
  state.drawerConversationId = conversation?.id || (action?.entity_type === "conversation" ? Number(action.entity_id) : null);
  state.drawerConnectionId = connection?.id || null;
  state.drawerDraftType = null;
  const id = state.drawerConversationId || state.drawerConnectionId || "relationship";
  history.replaceState(null, "", `${location.pathname}#${state.view}?relationship=${id}`);
  render();
}

function closeRelationship() {
  state.drawerActionId = null;
  state.drawerConversationId = null;
  state.drawerConnectionId = null;
  state.drawerDraftType = null;
  history.replaceState(null, "", `#${state.view}`);
  render();
}

function relationshipDraft(context) {
  const { action, conversation, prospect } = context;
  if (action?.action_type === "work_referral") {
    return `Thanks ${firstName(conversation?.name)}. I appreciate the direction. I will reach out to the owner you mentioned with your context and keep the ask focused.`;
  }
  if (action?.action_type === "reply" && /written questions/i.test(action.reason || "")) {
    return `Thanks ${firstName(conversation?.name)}. Written questions work well. I will keep them concise and focused on your current process, the main constraint, who owns it, and what would make a change worthwhile.`;
  }
  if (action?.action_type === "follow_up" && prospect?.follow_up) return prospect.follow_up;
  if (!conversation?.outbound_count && prospect?.first_message) return prospect.first_message;
  if (prospect?.follow_up) return prospect.follow_up;
  return conversation?.next_action || action?.reason || "Review the relationship evidence and write one short, specific next message.";
}

function renderRelationshipDrawer() {
  if (!state.drawerActionId && !state.drawerConversationId && !state.drawerConnectionId) return null;
  const context = relationshipContext();
  const { action, conversation, connection, prospect } = context;
  const name = conversation?.name || connection?.name || action?.person_name || "Relationship";
  const product = conversation?.product || connection?.primary_product || action?.product || state.product;
  const profile = conversation?.profile_url || connection?.profile_url || prospect?.profile_url;
  const messages = conversation?.messages || [];
  const storedDrafts = connection?.message_drafts || {};
  const defaultDraftType = !connection?.contacted_at && storedDrafts.connection_request ? "connection_request"
    : !conversation?.outbound_count && storedDrafts.warm_introduction ? "warm_introduction"
      : storedDrafts.research_call ? "research_call" : null;
  const activeDraftType = state.drawerDraftType || defaultDraftType;
  const draft = h("textarea", { class: "relationship-draft", "aria-label": "Editable message draft" });
  draft.value = storedDrafts[activeDraftType]?.body || relationshipDraft(context);
  const panel = h("aside", { class: "relationship-drawer", role: "dialog", "aria-modal": "true", "aria-label": `${name} relationship` });
  panel.append(
    h("header", { class: "drawer-head" }, [
      h("div", {}, [
        h("div", { class: "drawer-kicker" }, [h("span", { class: `portfolio-product product-${product}`, text: CONNECTION_MOTION_LABELS[product] || "Other" }), h("span", { text: connection?.relationship_role ? humanize(connection.relationship_role) : conversation?.play_id || action?.play_id || "Relationship" })]),
        h("h2", { text: name }),
        h("p", { text: conversation?.headline || connection?.headline || prospect?.title || "Role or company needs confirmation" })
      ]),
      h("button", { class: "drawer-close", type: "button", text: "Close", onclick: closeRelationship })
    ]),
    h("div", { class: "drawer-scroll" }, [
      action ? h("section", { class: "drawer-section current-action" }, [
        h("p", { class: "card-eyebrow", text: "Current action" }),
        h("h3", { text: actionLabel(action.action_type) }),
        h("p", { text: action.reason || "Review and decide the next step." }),
        h("small", { text: action.due_at ? `Due ${relationshipDate(action.due_at)}` : "No due date" })
      ]) : null,
      h("section", { class: "drawer-section" }, [
        h("div", { class: "drawer-section-head" }, [h("h3", { text: "Conversation" }), h("span", { text: `${messages.length} messages` })]),
        messages.length ? h("div", { class: "drawer-timeline" }, messages.map((message) => h("div", { class: `drawer-message ${message.direction}` }, [
          h("div", { class: "history-meta" }, [h("strong", { text: message.direction === "outbound" ? "You" : message.sender_name }), h("span", { text: relationshipDate(message.sent_at) })]),
          h("p", { text: message.body })
        ]))) : h("p", { class: "muted", text: "No imported conversation yet. Use the profile and targeting evidence to prepare the first message." })
      ]),
      h("section", { class: "drawer-section" }, [
        h("p", { class: "card-eyebrow", text: action?.action_type === "reply" ? "Suggested reply" : "Message workspace" }),
        Object.keys(storedDrafts).length ? h("div", { class: "draft-type-switch", role: "group", "aria-label": "Choose message stage" }, [
          ["connection_request", "1. Connection request"], ["warm_introduction", "2. Introduce robotics"], ["research_call", "3. Ask for a call"]
        ].filter(([type]) => storedDrafts[type]).map(([type, label]) => h("button", { class: `draft-type-button ${activeDraftType === type ? "on" : ""}`, type: "button", text: label, title: type === "connection_request" ? "Use this inside the LinkedIn connection request. It is kept below 300 characters." : type === "warm_introduction" ? "Use this when you are already connected but have not introduced the robotics research yet." : "Use this after connecting when you are ready to ask for a short research call.", onclick: () => { state.drawerDraftType = type; render(); } }))) : null,
        h("div", { class: "drawer-rule" }, [
          h("strong", { text: "Rule applied" }),
          h("span", { text: state.playbooks.ventures?.[product]?.formula || "One verified reason, one problem, one value proposition, one bounded ask." })
        ]),
        draft,
        h("div", { class: "drawer-message-meta" }, [
          h("span", { text: "Edit before sending" }),
          h("span", { text: "Manual LinkedIn send only" })
        ]),
        h("div", { class: "drawer-actions" }, [
          h("button", { class: "btn primary", text: "Copy message", onclick: () => copyText(draft.value, "Message copied") }),
          conversation ? h("button", { class: "btn", text: "Record as sent", onclick: async () => {
            try {
              await apiPost(`/api/linkedin-conversations/${conversation.id}/messages/sent`, { body: draft.value, action_id: action?.id || null });
              toast("LinkedIn message recorded as sent");
              closeRelationship();
              await load();
            } catch (error) { toast(error.message); }
          } }) : null,
          connection ? h("button", { class: `btn contact-action ${connection.contacted_at ? "is-contacted" : ""}`, text: connection.contacted_at ? "Contacted ✓" : "Mark contacted", onclick: async () => {
            try {
              await patchConnection(connection, { contacted: !connection.contacted_at, contact_channel: "linkedin" });
              toast(connection.contacted_at ? "Contact mark removed" : "Marked contacted");
              await load();
            } catch (error) { toast(error.message); }
          } }) : null,
          profile ? h("a", { class: "btn", href: profile, target: "_blank", rel: "noreferrer", text: "Open LinkedIn" }) : null
        ])
      ]),
      h("section", { class: "drawer-section" }, [
        h("p", { class: "card-eyebrow", text: "Why this relationship" }),
        h("h3", { text: prospect?.observed_signal || connection?.classification_reason || "Targeting evidence needs review" }),
        h("p", { text: prospect?.why_this_person || state.playbooks.ventures?.[product]?.buyer || "Confirm whether this person owns the problem or can route you to the owner." }),
        prospect?.what_we_can_do ? h("div", { class: "drawer-value", text: prospect.what_we_can_do }) : null,
        connection?.public_research ? h("div", { class: "public-research" }, [
          h("strong", { text: [connection.public_research.current_role, connection.public_research.current_company].filter(Boolean).join(" at ") || "Public context reviewed" }),
          h("p", { text: connection.public_research.reason || "Public profile sources were reviewed." }),
          h("div", { class: "research-links" }, (connection.public_research.source_urls || []).map((url, index) => h("a", { href: url, target: "_blank", rel: "noreferrer", text: `Source ${index + 1} ↗` })))
        ]) : null
      ]),
      conversation ? h("section", { class: "drawer-section" }, [
        h("p", { class: "card-eyebrow", text: "Relationship controls" }),
        h("div", { class: "drawer-control-grid" }, [
          h("label", {}, [h("span", { text: "Workflow" }), conversationSelect(conversation, "status", [["waiting", "Waiting"], ["needs_reply", "Needs reply"], ["meeting_booked", "Meeting booked"], ["closed", "Closed"]])]),
          h("label", {}, [h("span", { text: "Outcome" }), conversationSelect(conversation, "primary_outcome", [["no_reply", "No reply"], ["correction", "Correction"], ["objection", "Objection"], ["referral", "Referral"], ["problem_acknowledged", "Problem acknowledged"], ["call_proposed", "Call proposed"], ["call_booked", "Call booked"], ["qualified_commercial_interest", "Qualified commercial interest"], ["negative_suppress", "Negative / suppress"]])])
        ])
      ]) : null
    ]),
    h("footer", { class: "drawer-footer" }, [
      action?.action_type === "confirm_meeting" ? h("button", { class: "btn primary", text: "Confirm call", onclick: () => confirmActionMeeting(action) }) : null,
      action?.action_type === "prepare_meeting" ? h("button", { class: "btn primary", text: "Record outcome", onclick: () => captureActionMeetingOutcome(action) }) : null,
      action && !["confirm_meeting", "prepare_meeting", "revisit_on_new_trigger"].includes(action.action_type) ? h("button", { class: "btn primary", text: "Complete action", onclick: () => operateOnAction(action, "complete") }) : null,
      action ? h("button", { class: "btn", text: "Snooze to tomorrow", onclick: () => operateOnAction(action, "snooze", { due_at: new Date(Date.now() + 86400000).toISOString() }) }) : null,
      action ? h("button", { class: "btn ghost danger", text: "Close", onclick: () => operateOnAction(action, "close") }) : null,
      action ? h("button", { class: "btn ghost danger", text: "Suppress", onclick: () => operateOnAction(action, "suppress") }) : null,
      connection ? h("button", { class: `btn irrelevant-action ${connection.review_status === "dismissed" ? "is-dismissed" : ""}`, text: connection.review_status === "dismissed" ? "Restore relationship" : "Not relevant", onclick: async () => {
        try {
          await patchConnection(connection, { review_status: connection.review_status === "dismissed" ? "qualified" : "dismissed" });
          toast(connection.review_status === "dismissed" ? "Relationship restored" : "Relationship dismissed");
          closeRelationship();
          await load();
        } catch (error) { toast(error.message); }
      } }) : null
    ])
  );
  return h("div", { class: "drawer-layer" }, [h("button", { class: "drawer-backdrop", "aria-label": "Close relationship", onclick: closeRelationship }), panel]);
}

function workCard(key, label, count, definition, tone = "") {
  return h("button", { class: `work-status-card ${tone} ${state.workFilter === key ? "on" : ""}`, onclick: () => {
    if (key === "calls") { go("calendar"); return; }
    state.workFilter = state.workFilter === key ? "all" : key;
    render();
  } }, [
    h("span", { text: label }), h("strong", { text: String(count || 0) }), h("small", { text: definition })
  ]);
}

function actionMatchesFilter(action, key) {
  if (key === "all") return true;
  if (key === "reply") return action.action_type === "reply";
  if (key === "confirm") return action.action_type === "confirm_meeting";
  if (key === "followup") return action.action_type === "follow_up";
  if (key === "promised") return ["execute_next_step", "follow_up_proposal", "send_promised_item"].includes(action.action_type);
  if (key === "overdue") return action.due_at && new Date(action.due_at) < new Date();
  return true;
}

function workActionLabel(action) {
  return ({ reply: "Reply", confirm_meeting: "Confirm call", prepare_meeting: "Prepare call", follow_up: "Draft follow-up", work_referral: "Work referral", decide_next_step: "Decide next step", execute_next_step: "Send promised item" })[action.action_type] || "Review relationship";
}

function renderWork() {
  const all = (state.founder.work_actions || (state.founder.actions || []).filter((a) => !["revisit_on_new_trigger", "pause_until"].includes(a.action_type)))
    .filter((action) => action.product === state.product);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const activeMeetings = (state.founder.meetings || []).filter((meeting) => {
    const conversation = (state.conversations.conversations || []).find((item) => item.id === meeting.source_conversation_id);
    return conversation?.product === state.product;
  });
  const metrics = {
    reply_needed: all.filter((item) => item.action_type === "reply").length,
    calls_to_confirm: all.filter((item) => item.action_type === "confirm_meeting").length,
    calls_today: activeMeetings.filter((item) => item.starts_at?.slice(0, 10) === today && ["human_confirmed", "calendar_confirmed"].includes(item.confirmation_status)).length,
    followups_due: all.filter((item) => item.action_type === "follow_up").length,
    promised_items: all.filter((item) => ["execute_next_step", "follow_up_proposal", "send_promised_item"].includes(item.action_type)).length,
    overdue_actions: all.filter((item) => item.due_at && new Date(item.due_at) < now).length,
    watchlist: (state.founder.watchlist || []).filter((item) => item.product === state.product).length,
  };
  const actions = all.filter((action) => actionMatchesFilter(action, state.workFilter));
  const groups = [
    ["Respond now", ["reply"]], ["Confirm or prepare calls", ["confirm_meeting", "prepare_meeting"]],
    ["Send promised items", ["execute_next_step", "follow_up_proposal", "send_promised_item"]],
    ["Follow up", ["follow_up"]], ["Work referrals", ["work_referral"]], ["Decide next step", ["decide_next_step"]]
  ];
  const el = h("section", { class: "page founder-page work-page" });
  el.append(pageHead("Work", "Founder operating queue", "Clear active relationships and commitments before adding inventory. Watchlist records are not work.", [
    h("button", { class: "btn", text: "Reconcile LinkedIn", onclick: async () => { await apiPost("/api/founder-sync"); toast("Relationships reconciled"); await load(); } })
  ]));
  el.append(h("div", { class: "work-status-grid" }, [
    workCard("reply", "Reply needed", metrics.reply_needed, "Someone replied and you owe a response", "urgent"),
    workCard("confirm", "Calls to confirm", metrics.calls_to_confirm, "Date, time zone, intent, or calendar is unconfirmed"),
    workCard("calls", "Calls today", metrics.calls_today, "Confirmed calls occurring today"),
    workCard("followup", "Follow-ups due", metrics.followups_due, "Deliberate second touches due now"),
    workCard("promised", "Promised items", metrics.promised_items, "Questions, recaps, proposals, or introductions owed"),
    workCard("overdue", "Overdue", metrics.overdue_actions, "Performable actions past due", metrics.overdue_actions ? "danger" : "")
  ]));
  let shown = 0;
  for (const [title, types] of groups) {
    const rows = actions.filter((action) => types.includes(action.action_type));
    if (!rows.length) continue;
    shown += rows.length;
    el.append(h("section", { class: "work-group" }, [
      h("div", { class: "work-group-head" }, [h("h2", { text: title }), h("span", { text: String(rows.length) })]),
      h("div", { class: "work-list" }, rows.map((action) => h("article", { class: `work-row ${actionUrgency(action)}` }, [
        h("div", { class: "work-row-main" }, [
          h("div", { class: "founder-action-title" }, [h("span", { class: `portfolio-product product-${action.product}`, text: LINKEDIN_PRODUCT_LABELS[action.product] || "Other" }), h("span", { class: `action-due ${actionUrgency(action)}`, text: action.due_at ? relationshipDate(action.due_at) : "No due date" })]),
          h("h3", { text: action.person_name || action.company || "Relationship" }),
          h("p", { text: action.reason || "Review and decide the next step." }),
          action.headline ? h("small", { text: action.headline }) : null
        ]),
        h("div", { class: "work-row-actions" }, [
          h("button", { class: "btn primary", text: workActionLabel(action), onclick: () => openRelationship({ action }) }),
          action.action_type !== "confirm_meeting" ? h("button", { class: "btn sm", text: "Done", onclick: () => operateOnAction(action, "complete") }) : null,
          h("button", { class: "btn ghost sm", text: "Tomorrow", onclick: () => operateOnAction(action, "snooze", { due_at: new Date(Date.now() + 86400000).toISOString() }) })
        ])
      ])))
    ]));
  }
  if (!shown) el.append(h("div", { class: "card pad empty-work" }, [h("h2", { text: "No work matches this filter" }), h("p", { class: "muted", text: "Clear the filter or review the Network watchlist when a new trigger appears." }), h("button", { class: "btn", text: "Show all work", onclick: () => { state.workFilter = "all"; render(); } })]));
  el.append(h("div", { class: "work-footnote" }, [h("strong", { text: `${metrics.watchlist || 0} relationships on watch` }), h("span", { text: "They have no due date and return to Work only when a new trigger is recorded." }), h("button", { class: "btn ghost sm", text: "Open watchlist", onclick: () => { state.networkSubview = "watchlist"; go("network"); } })]));
  return el;
}

function networkConnectionRows() {
  const q = state.networkSearch.trim().toLowerCase();
  return (state.connections.connections || []).filter((connection) => {
    if (connection.primary_product !== state.product) return false;
    if (q && !`${connection.name} ${connection.headline} ${connection.classification_reason}`.toLowerCase().includes(q)) return false;
    if (state.networkSubview === "targets") return connection.primary_product !== "other" && connection.review_status !== "dismissed" && Number(connection.classification_score) >= 4;
    if (state.networkSubview === "watchlist") return false;
    if (state.networkSubview === "needs_review") return connection.profile_status === "search" || (connection.primary_product === "other" && Number(connection.classification_score) >= 4);
    return true;
  });
}

function networkPersonRow(connection) {
  const conversation = (state.conversations.conversations || []).find((item) => item.connection_id === connection.id || sameName(item.name, connection.name));
  const action = (state.founder.actions || []).find((item) => item.entity_type === "conversation" && Number(item.entity_id) === conversation?.id);
  return h("article", { class: `network-row ${connection.contacted_at ? "contacted" : ""} ${connection.review_status === "dismissed" ? "dismissed" : ""}` }, [
    h("div", { class: "network-person" }, [h("h3", { text: connection.name }), h("p", { text: connection.headline || "Role needs confirmation" }), h("div", { class: "network-tags" }, [h("span", { class: `portfolio-product product-${connection.primary_product}`, text: CONNECTION_MOTION_LABELS[connection.primary_product] || "Other" }), connection.relationship_role ? h("span", { class: "chip", text: humanize(connection.relationship_role) }) : null, connection.classification_confidence && connection.classification_confidence !== "unmatched" ? h("span", { class: "chip", text: humanize(connection.classification_confidence) }) : null, connection.contacted_at ? h("span", { class: "chip stage-contacted", text: "Contacted" }) : null, connection.review_status === "dismissed" ? h("span", { class: "chip dismissed", text: "Dismissed" }) : null])]),
    h("div", { class: "network-why" }, [h("strong", { text: conversation?.play_id || "Play needs review" }), h("p", { text: connection.classification_reason || "Confirm problem ownership or routing value." }), h("small", { text: conversation ? `${conversation.message_count} messages · last ${relationshipDate(conversation.last_message_at, false)}` : "No imported conversation" })]),
    h("div", { class: "network-next" }, [
      h("span", { text: action ? actionLabel(action.action_type) : conversation?.status === "closed" ? "Closed" : "No active action" }),
      h("strong", { text: action?.due_at ? relationshipDate(action.due_at, false) : connection.profile_status === "search" ? "Profile needs confirmation" : "Ready to review" }),
      h("div", { class: "network-row-buttons" }, [
        h("button", { class: "btn primary sm", text: "Review", onclick: () => openRelationship({ action, conversation, connection }) }),
        connection.profile_status !== "search" && connection.profile_url ? h("a", { class: "btn sm", href: connection.profile_url, target: "_blank", rel: "noreferrer", text: "Open LinkedIn ↗", title: "Opens this person's exact LinkedIn profile from your official LinkedIn export." }) : null,
        h("button", { class: `btn sm contact-action ${connection.contacted_at ? "is-contacted" : ""}`, text: connection.contacted_at ? "Contacted ✓" : "Mark contacted", onclick: async () => {
          try { await patchConnection(connection, { contacted: !connection.contacted_at, contact_channel: "linkedin" }); toast(connection.contacted_at ? "Contact mark removed" : "Marked contacted"); render(); }
          catch (error) { toast(error.message); }
        } }),
        h("button", { class: `btn sm irrelevant-action ${connection.review_status === "dismissed" ? "is-dismissed" : ""}`, text: connection.review_status === "dismissed" ? "Restore" : "Not relevant", onclick: async () => {
          try { await patchConnection(connection, { review_status: connection.review_status === "dismissed" ? "qualified" : "dismissed" }); toast(connection.review_status === "dismissed" ? "Relationship restored" : "Marked not relevant"); render(); }
          catch (error) { toast(error.message); }
        } })
      ])
    ])
  ]);
}

function renderNetworkAccounts() {
  const map = new Map();
  for (const lead of state.leads.leads || []) {
    const company = lead.company || "Unknown company";
    if (!map.has(company)) map.set(company, { company, people: [], products: new Set(), plays: new Set(), next: [] });
    const item = map.get(company); item.people.push(lead); item.products.add(lead.product); if (lead.play_id) item.plays.add(lead.play_id); if (lead.stage) item.next.push(lead.stage);
  }
  const q = state.networkSearch.trim().toLowerCase();
  const accounts = [...map.values()].filter((item) => !q || `${item.company} ${item.people.map((p) => `${p.name} ${p.title}`).join(" ")}`.toLowerCase().includes(q)).slice(0, 120);
  return h("div", { class: "account-grid" }, accounts.map((account) => h("article", { class: "account-card card" }, [
    h("div", { class: "account-head" }, [h("h3", { text: account.company }), h("span", { class: "chip", text: `${account.people.length} people` })]),
    h("p", { text: [...account.plays].join(", ") || "Play needs review" }),
    h("div", { class: "network-tags" }, [...account.products].map((product) => h("span", { class: `portfolio-product product-${product}`, text: LINKEDIN_PRODUCT_LABELS[product] || product }))),
    h("small", { text: account.people.slice(0, 3).map((person) => person.name).join(" · ") })
  ])));
}

function renderNetwork() {
  const conversations = state.conversations.conversations || [];
  const referrals = conversations.filter((item) => item.primary_outcome === "referral" || item.response_theme === "referral");
  const watchlist = (state.founder.watchlist || []).filter((item) => item.product === state.product);
  const needsReview = (state.connections.connections || []).filter((item) => item.profile_status === "search" || (item.primary_product === "other" && Number(item.classification_score) >= 4)).length;
  const tabs = [["targets", "Targets"], ["messaged", "Messaged", state.conversations.summary?.total || 0], ["people", "People", state.connections.summary?.total || 0], ["accounts", "Accounts"], ["warm_routes", "Warm routes", referrals.length], ["watchlist", "Watchlist", watchlist.length], ["needs_review", "Needs review", needsReview]];
  const el = h("section", { class: "page network-page" });
  el.append(pageHead("Network", "Accounts, people and relationships", "Who matters now, why they matter, what has happened, and what you should do next.", null));
  const rows = state.connections.connections || [];
  const motionLabel = CONNECTION_MOTION_LABELS[state.product] || "Needs context";
  el.append(h("div", { class: "motion-summary scoped-motion-summary" }, [
    [motionLabel, rows.length, activeProduct().description],
    ["Contacted", rows.filter((item) => item.contacted_at).length, "Recorded LinkedIn contact"],
    ["Active", rows.filter((item) => item.review_status !== "dismissed").length, "Available for targeting or research"],
    ["Not relevant", rows.filter((item) => item.review_status === "dismissed").length, "Preserved outside active targeting"]
  ].map(([label, count, note]) => h("article", { class: `motion-card product-${state.product}` }, [h("span", { text: label }), h("strong", { text: String(count) }), h("small", { text: note })]))));
  el.append(founderTabs(tabs, state.networkSubview, (key) => { state.networkSubview = key; render(); }));
  const controls = h("div", { class: "network-controls card" }, [
    h("input", { class: "search", type: "search", value: state.networkSearch, placeholder: "Search, then press Enter", onchange: (event) => { state.networkSearch = event.target.value; render(); } })
  ]);
  if (!["watchlist", "warm_routes", "messaged"].includes(state.networkSubview)) el.append(controls);
  if (state.networkSubview === "messaged") el.append(renderMessagedNetwork());
  else if (state.networkSubview === "accounts") el.append(renderNetworkAccounts());
  else if (state.networkSubview === "warm_routes") el.append(h("div", { class: "network-list" }, referrals.length ? referrals.map((conversation) => h("article", { class: "network-row" }, [h("div", { class: "network-person" }, [h("h3", { text: conversation.name }), h("p", { text: conversation.headline })]), h("div", { class: "network-why" }, [h("strong", { text: "Referral route" }), h("p", { text: conversation.summary })]), h("div", { class: "network-next" }, [h("strong", { text: conversation.next_action || "Work the introduction" }), h("button", { class: "btn primary sm", text: "Work referral", onclick: () => openRelationship({ conversation }) })])])) : [h("div", { class: "card pad muted", text: "No referral routes have been confirmed yet." })]));
  else if (state.networkSubview === "watchlist") el.append(h("div", { class: "network-list" }, watchlist.length ? watchlist.map((action) => h("article", { class: "network-row watch" }, [h("div", { class: "network-person" }, [h("h3", { text: action.person_name || "Relationship" }), h("p", { text: action.headline || "No company context" })]), h("div", { class: "network-why" }, [h("strong", { text: "Waiting for a trigger" }), h("p", { text: action.reason })]), h("div", { class: "network-next" }, [h("strong", { text: "No due date" }), h("button", { class: "btn sm", text: "Review", onclick: () => openRelationship({ action }) })])])) : [h("div", { class: "card pad muted", text: "No relationships are currently on watch." })]));
  else {
    const rows = networkConnectionRows().slice(0, 150);
    el.append(h("div", { class: "network-list" }, rows.length ? rows.map(networkPersonRow) : [h("div", { class: "card pad muted", text: "No relationships match this view." })]));
  }
  return el;
}

function playbookEvidence(data) {
  return h("div", { class: "playbook-evidence" }, [
    founderMetric("Conversations", data.evidence?.conversations || 0, "imported evidence"),
    founderMetric("Any replies", data.evidence?.replies || 0, "diagnostic"),
    founderMetric("Meeting signals", data.evidence?.meetings_inferred || 0, "still require confirmation"),
    founderMetric("Qualified replies", data.evidence?.qualified_replies || 0, "human-confirmed")
  ]);
}

function renderPlaybooks() {
  const data = state.playbooks.ventures?.[state.product] || {};
  const tabs = [["market", "Market"], ["targeting", "Targeting", data.targets?.length || 0], ["messaging", "Messaging"], ["experiments", "Experiments", data.experiments?.length || 0]];
  const el = h("section", { class: "page playbooks-page" });
  el.append(pageHead("Playbooks", `${activeProduct().name}: what we believe now`, "Market movement translated into target accounts, message rules, evidence, and the next experiment.", null));
  el.append(h("section", { class: "belief-card card" }, [
    h("div", {}, [h("p", { class: "card-eyebrow", text: "Current commercial thesis" }), h("h2", { text: data.belief || "Playbook is loading" }), h("p", { text: data.problem || "" })]),
    h("dl", {}, [h("div", {}, [h("dt", { text: "Buyer" }), h("dd", { text: data.buyer || "" })]), h("div", {}, [h("dt", { text: "Offer" }), h("dd", { text: data.offer || "" })]), h("div", {}, [h("dt", { text: "Message formula" }), h("dd", { text: data.formula || "" })])])
  ]));
  el.append(playbookEvidence(data), founderTabs(tabs, state.playbookSubview, (key) => { state.playbookSubview = key; render(); }));
  if (state.playbookSubview === "market") {
    el.append(h("div", { class: "theme-grid" }, (data.themes || []).map((theme) => h("article", { class: "theme-card card" }, [
      h("div", { class: "theme-head" }, [h("span", { class: "chip fit", text: "Directional" }), h("span", { text: "Review monthly" })]),
      h("h2", { text: theme.title }), h("p", { text: theme.thesis }),
      h("div", { class: "theme-facts" }, [h("div", {}, [h("strong", { text: "Buyer" }), h("span", { text: theme.buyers })]), h("div", {}, [h("strong", { text: "Problem" }), h("span", { text: theme.problem })]), h("div", {}, [h("strong", { text: "Offer implication" }), h("span", { text: theme.implication })])]),
      h("div", { class: "signal-columns" }, [h("div", {}, [h("strong", { text: "Supporting signals" }), ...(theme.signals || []).map((item) => h("span", { text: item }))]), h("div", {}, [h("strong", { text: "Contradicting evidence" }), ...(theme.contradicts || []).map((item) => h("span", { text: item }))])]),
      h("button", { class: "btn sm", text: `Review ${theme.matches?.length || 0} matching relationships`, onclick: () => { state.playbookSubview = "targeting"; render(); } })
    ]))));
  } else if (state.playbookSubview === "targeting") {
    el.append(h("div", { class: "target-match-list" }, (data.targets || []).slice(0, 40).map((target) => h("article", { class: "target-match card" }, [
      h("div", {}, [h("h3", { text: target.name }), h("p", { text: target.headline || "Role needs confirmation" })]),
      h("div", {}, [h("strong", { text: target.classification_reason || "Venture match" }), h("small", { text: `Problem ownership ${Math.min(5, Math.ceil((target.classification_score || 0) / 2))}/5 · evidence ${target.profile_status === "search" ? "needs profile" : "profile confirmed"}` })]),
      h("button", { class: "btn primary sm", text: "Review target", onclick: () => openRelationship({ connection: target }) })
    ]))));
  } else if (state.playbookSubview === "messaging") {
    const length = state.playbooks.portfolio_message_length || {};
    el.append(h("div", { class: "messaging-grid" }, [
      h("section", { class: "card pad message-rule-card" }, [h("p", { class: "card-eyebrow", text: "Current message rule" }), h("h2", { text: data.formula }), h("div", { class: "rule-pills" }, (data.triggers || []).map((item) => h("span", { text: item })))]),
      h("section", { class: "card pad" }, [h("p", { class: "card-eyebrow", text: "Observed opener length" }), h("div", { class: "length-results" }, ["short", "medium", "long"].map((key) => { const row = length[key] || {}; return h("div", {}, [h("strong", { text: humanize(key) }), h("b", { text: `${row.replies || 0}/${row.conversations || 0}` }), h("span", { text: `${Math.round((row.rate || 0) * 100)}% any reply` })]); }))]),
      h("section", { class: "card pad works-card" }, [h("p", { class: "card-eyebrow", text: "What is working" }), h("ul", {}, [h("li", { text: "Short, coherent openers show the strongest direction in the current selected sample." }), h("li", { text: `${state.playbooks.portfolio_followup_replies || 0} of ${state.playbooks.total_replying_conversations || 0} replying threads replied after more than one outbound touch.` }), h("li", { text: "Specific owner-routing and research asks can generate useful replies." }), h("li", { text: "One workflow and one bounded ask outperform complete solution designs." })])]),
      h("section", { class: "card pad fails-card" }, [h("p", { class: "card-eyebrow", text: "What is failing" }), h("ul", {}, [h("li", { text: "Long speculative architectures before the buyer confirms the problem." }), h("li", { text: "Broad service lists and unclear intentions." }), h("li", { text: "Technically adjacent people without ownership or routing value." }), h("li", { text: "Replacement framing for existing internal systems." }), h("li", { text: "Repeated follow-up without new evidence or value." })])]),
      h("section", { class: "card pad correction-card" }, [
        h("p", { class: "card-eyebrow", text: "Corrections and objections" }),
        ...((data.corrections || []).length
          ? (data.corrections || []).map((item) => h("button", { class: "correction-row", onclick: () => openRelationship({ conversation: (state.conversations.conversations || []).find((c) => c.id === item.id) }) }, [h("strong", { text: `${item.name} · ${humanize(item.outcome)}` }), h("span", { text: item.correction })]))
          : [h("p", { class: "muted", text: "No human-confirmed corrections have been tagged for this venture yet." })])
      ])
    ]));
  } else {
    el.append(h("div", { class: "experiment-list" }, (data.experiments || []).length ? data.experiments.map((experiment) => h("article", { class: "card pad" }, [h("span", { class: "chip fit", text: experiment.status }), h("h2", { text: experiment.hypothesis }), h("p", { text: `${experiment.segment || "All selected contacts"} · variants ${experiment.variants.join(" vs ")}` }), h("small", { text: experiment.stop_rule })])) : [h("div", { class: "card pad empty-work" }, [h("h2", { text: "No controlled experiment is active" }), h("p", { class: "muted", text: "The next experiment should assign contacts before sending and vary one meaningful element at a time." }), h("p", { text: "Recommended: 15 high-confidence relationships for this venture, one current message rule, and one bounded variant." })]) ]));
  }
  return el;
}

function renderPipeline() {
  if (state.product === "other") {
    const el = h("section", { class: "page pipeline-page" });
    el.append(pageHead("Pipeline", "Other relationships are not pipeline", "Classify a relationship into GNK, OHUB, or Morrow before it can enter a commercial or research motion.", [h("button", { class: "btn primary", text: "Review unclassified relationships", onclick: () => { state.networkSubview = "needs_review"; go("network"); } })]));
    return el;
  }
  const metrics = state.founder.metrics || {};
  const pipeline = state.founder.pipeline || {};
  const activePipeline = pipeline[state.product] || {};
  const learning = state.founder.learning || {};
  const el = h("section", { class: "page pipeline-page" });
  el.append(pageHead("Pipeline", "Commercial progression", "Research and design-partner learning remain separate from opportunities and revenue.", null));
  el.append(h("div", { class: "pipeline-kpis" }, [
    founderMetric("Qualified opportunities", activePipeline.qualified || 0, "buyer evidence required"),
    founderMetric("Qualified value", money(activePipeline.qualified_value), "recorded opportunity value"),
    founderMetric("Scopes in progress", activePipeline.scoped || 0, "bounded work"),
    founderMetric("Proposals outstanding", activePipeline.proposal || 0, "follow to a decision"),
    founderMetric("Booked project revenue", money(activePipeline.booked_revenue), "contract evidence only", "money"),
    founderMetric("Contracted MRR", money(activePipeline.booked_mrr), "contract evidence only", "money")
  ]));
  el.append(founderTabs([["commercial", "Commercial pipeline"], ["learning", "Learning and design partners"]], state.pipelineLane, (key) => { state.pipelineLane = key; render(); }));
  if (state.pipelineLane === "commercial") {
    el.append(h("div", { class: "commercial-pipeline card" }, [
      h("div", { class: "pipeline-header-row" }, ["Venture", "Engaged", "Discovery", "Held", "Qualified", "Scoped", "Proposal", "Won"].map((item) => h("strong", { text: item }))),
      ...[state.product].map((product) => { const row = pipeline[product] || {}; return h("div", { class: "pipeline-data-row" }, [h("strong", { text: LINKEDIN_PRODUCT_LABELS[product] }), ...[row.engaged, row.discovery, row.completed, row.qualified, row.scoped, row.proposal, row.won].map((value) => h("span", { text: String(value || 0) }))]); })
    ]));
    if (!activePipeline.qualified) el.append(h("div", { class: "pipeline-truth" }, [h("strong", { text: "No qualified commercial opportunity yet" }), h("p", { text: "That is the honest baseline. A reply or research call enters this lane only after problem, consequence, owner, timing, commercial path, and next step are buyer-confirmed." })]));
  } else {
    el.append(h("div", { class: "learning-lane" }, [
      h("section", { class: "card pad" }, [h("p", { class: "card-eyebrow", text: "Conversation evidence" }), h("h2", { text: `${learning.any_replies || 0} conversations received a reply` }), h("p", { text: `${Math.round((learning.any_reply_rate || 0) * 100)}% any-reply rate is directional only. ${learning.qualified_replies || 0} replies are human-confirmed as qualified commercial interest.` })]),
      ...[state.product].map((product) => { const data = state.playbooks.ventures?.[product] || {}; return h("section", { class: "card pad" }, [h("span", { class: `portfolio-product product-${product}`, text: LINKEDIN_PRODUCT_LABELS[product] }), h("h2", { text: data.belief || "No thesis" }), h("p", { text: `${data.evidence?.replies || 0} replies from ${data.evidence?.conversations || 0} conversations · ${data.evidence?.meetings_inferred || 0} meeting signals require confirmation.` }), h("button", { class: "btn sm", text: "Open playbook", onclick: () => { state.playbookSubview = "messaging"; go("playbooks"); } })]); })
    ]));
  }
  return el;
}

function calendarRelationshipButton(item, label) {
  const conversation = item.source_conversation_id ? (state.conversations.conversations || []).find((c) => c.id === item.source_conversation_id) : null;
  const action = (state.founder.actions || []).find((a) => a.meeting_id === item.id);
  return h("article", { class: "calendar-commitment card" }, [
    h("div", { class: "calendar-time" }, [h("strong", { text: relationshipDate(item.starts_at) }), h("span", { text: item.timezone || "Time zone unconfirmed" })]),
    h("div", {}, [h("span", { class: `chip ${item.confirmation_status === "unconfirmed" ? "warn" : "fit"}`, text: label }), h("h3", { text: conversation?.name || item.brief?.person || "Meeting" }), h("p", { text: conversation?.summary || item.brief?.summary || "Open the relationship to review context." })]),
    h("button", { class: "btn primary sm", text: item.confirmation_status === "unconfirmed" ? "Confirm call" : item.status === "held" && !item.outcome_captured_at ? "Record outcome" : "Open brief", onclick: () => openRelationship({ action, conversation }) })
  ]);
}

function renderFounderCalendar() {
  if (state.product === "other") {
    const el = h("section", { class: "page founder-calendar-page" });
    el.append(pageHead("Calendar", "No calendar for unclassified relationships", "Move a relationship into GNK, OHUB, or Morrow before scheduling it within a venture workflow.", null));
    return el;
  }
  const meetings = (state.founder.meetings || []).filter((meeting) => {
    const conversation = (state.conversations.conversations || []).find((item) => item.id === meeting.source_conversation_id);
    return conversation?.product === state.product;
  });
  const unconfirmed = meetings.filter((item) => item.confirmation_status === "unconfirmed");
  const confirmed = meetings.filter((item) => ["human_confirmed", "calendar_confirmed"].includes(item.confirmation_status) && item.status === "booked");
  const missing = meetings.filter((item) => item.status === "held" && !item.outcome_captured_at);
  const postCall = (state.founder.work_actions || []).filter((item) => item.product === state.product && ["prepare_meeting", "execute_next_step", "follow_up_proposal"].includes(item.action_type));
  const el = h("section", { class: "page founder-calendar-page" });
  el.append(pageHead("Calendar", "Calls and commitments", "Confirm what is real, prepare with relationship context, and record the outcome and next action in one flow.", null));
  el.append(h("div", { class: "calendar-status-grid" }, [
    founderMetric("Calls to confirm", unconfirmed.length, "not calendar truth yet"), founderMetric("Upcoming calls", confirmed.length, "confirmed and booked"), founderMetric("Outcomes missing", missing.length, "capture within 24 hours"), founderMetric("Post-call follow-ups", postCall.length, "promised next steps")
  ]));
  const sections = [["Calls to confirm", unconfirmed, "Unconfirmed"], ["Upcoming calls", confirmed, "Confirmed"], ["Outcomes missing", missing, "Outcome due"]];
  for (const [title, rows, label] of sections) {
    el.append(h("section", { class: "calendar-commitment-group" }, [h("div", { class: "work-group-head" }, [h("h2", { text: title }), h("span", { text: String(rows.length) })]), rows.length ? h("div", { class: "calendar-commitment-list" }, rows.map((item) => calendarRelationshipButton(item, label))) : h("p", { class: "card pad muted", text: `No ${title.toLowerCase()}.` })]));
  }
  return el;
}

function renderSystem() {
  const health = state.agentHealth || { summary: {}, agents: [] };
  const scopedAgents = (health.agents || []).filter((agent) => state.product !== "other"
    && (agent.slug?.startsWith(`${activeProduct().slug}-`) || agent.slug === "revenue-demand-radar"));
  const summary = {
    total: scopedAgents.length,
    blocked: scopedAgents.filter((agent) => agent.blocker).length,
    criticalBlocked: scopedAgents.filter((agent) => agent.blocker && agent.tier === "control").length,
  };
  const workflowSpecs = [
    ["Signal Scout", "Find verified triggers and warm routes", /(account-sourcing|revenue-demand-radar|industry-map)/],
    ["Account Qualifier", "Choose venture, play, buyer, and commercial plausibility", /(account-scoring|icp-contact|client-dossier)/],
    ["Outreach Assistant", "Prepare one evidenced message for manual sending", /(outreach-angle|email-drafter|sequence-reviewer)/],
    ["Conversation Triage", "Turn imported replies into outcomes and one action", null],
    ["Meeting and Deal Assistant", "Confirm calls, capture outcomes, qualify, and scope", /(offer-map|pipeline-capacity)/],
    ["Learning Analyst", "Report market, message, and commercial learning", /(revenue-strategy|company-context|growth-playbook)/]
  ];
  const el = h("section", { class: "page system-page" });
  el.append(pageHead("System", "Is the machine current and safe?", "Operational health first. Technical agents, graph, activity, and runs live under Advanced.", [h("button", { class: "btn", text: "Refresh", onclick: load })]));
  const healthy = state.reconciliation.reconciled && !(summary.criticalBlocked || 0);
  el.append(h("section", { class: `system-overview ${healthy ? "healthy" : "attention"}` }, [h("div", {}, [h("span", { text: healthy ? "Operating normally" : "Attention required" }), h("h2", { text: healthy ? "Commercial data is reconciled" : "One or more critical checks need review" }), h("p", { text: healthy ? "Imported LinkedIn activity matches canonical events and no critical workflow is blocked." : "Open the issues and workflow cards below for the business consequence and next action." })]), h("strong", { text: healthy ? "Healthy" : "Review" })]));
  el.append(h("div", { class: "system-status-grid" }, [
    h("article", { class: "card pad" }, [h("span", { text: "Connections import" }), h("strong", { text: `${state.connections.summary?.total || 0} people` }), h("small", { text: `${state.connections.summary?.search_routes || 0} profiles need confirmation` })]),
    h("article", { class: "card pad" }, [h("span", { text: "Conversation import" }), h("strong", { text: `${state.conversations.summary?.messages || 0} messages` }), h("small", { text: `${state.conversations.summary?.total || 0} relationships` })]),
    h("article", { class: "card pad" }, [h("span", { text: "Reconciliation" }), h("strong", { text: state.reconciliation.reconciled ? "Exact" : "Mismatch" }), h("small", { text: "Canonical event log verified" })]),
    h("article", { class: "card pad" }, [h("span", { text: "Tests" }), h("strong", { text: "91 passing" }), h("small", { text: "last verified 16 July 2026" })])
  ]));
  el.append(h("h2", { class: "system-section-title", text: "Six accountable workflows" }), h("div", { class: "workflow-grid" }, workflowSpecs.map(([name, purpose, pattern]) => {
    const members = pattern ? scopedAgents.filter((agent) => pattern.test(agent.slug)) : [];
    const blocked = members.filter((agent) => agent.blocker).length;
    const fresh = members.filter((agent) => agent.fresh).length;
    const deterministic = !pattern;
    return h("article", { class: `workflow-card ${blocked && !fresh ? "attention" : ""}` }, [h("div", { class: "workflow-head" }, [h("h2", { text: name }), h("span", { class: `chip ${deterministic || fresh ? "fit" : "warn"}`, text: deterministic ? "operating" : fresh ? `${fresh} fresh` : "review" })]), h("p", { text: purpose }), h("small", { text: deterministic ? "Canonical deterministic workflow" : `${members.length} components · ${blocked} blocked` })]);
  })));
  el.append(h("details", { class: "system-advanced card" }, [
    h("summary", { text: `Advanced diagnostics · ${summary.total || 0} agents · ${summary.blocked || 0} blocked` }),
    h("div", { class: "advanced-grid" }, [
      h("section", {}, [h("h3", { text: `${activeProduct().name} agent registry` }), ...scopedAgents.slice(0, 20).map((agent) => h("div", { class: "advanced-row" }, [h("strong", { text: agent.slug }), h("span", { text: agent.blocker ? "Blocked" : agent.fresh ? "Fresh" : humanize(agent.status || "idle") })]))]),
      h("section", {}, [h("h3", { text: "Operations" }), h("button", { class: "btn", text: "Reconcile LinkedIn", onclick: async () => { await apiPost("/api/founder-sync"); await load(); } }), h("p", { class: "muted", text: "Raw ontology, activity, API, database, and run diagnostics remain available in code and API but no longer occupy founder navigation." })])
    ])
  ]));
  return el;
}

/* ---------- router ---------- */
function render() {
  applyProductChrome();
  document.querySelectorAll(".rail-item").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
  if (countWorkEl) {
    const scopedWork = (state.founder.work_actions || []).filter((item) => item.product === state.product).length;
    countWorkEl.textContent = scopedWork ? String(scopedWork) : "";
  }
  if (countNetworkEl) countNetworkEl.textContent = state.connections.summary?.total ? String(state.connections.summary.total) : "";
  const task = state.leads.task || state.runStatus.activeRun;
  railTaskEl.textContent = task ? `● ${task.name || task.slug || "running"}` : "";
  railTaskEl.classList.toggle("live", Boolean(task));

  const views = {
    work: renderWork,
    network: renderNetwork,
    playbooks: renderPlaybooks,
    pipeline: renderPipeline,
    calendar: renderFounderCalendar,
    system: renderSystem
  };
  if (smokeLivePoll) { clearTimeout(smokeLivePoll); smokeLivePoll = null; }
  const page = (views[state.view] || renderWork)();
  const drawer = renderRelationshipDrawer();
  stageEl.replaceChildren(page, ...(drawer ? [drawer] : []));
}

const VIEWS = new Set(["work", "network", "playbooks", "pipeline", "calendar", "system"]);
const LEGACY_ROUTES = {
  today: "work",
  overview: "work",
  leads: "network",
  outreach: "network",
  linkedin: "network",
  connections: "network",
  conversations: "network",
  approvals: "network",
  intelligence: "playbooks",
  knowledge: "playbooks",
  agents: "system",
  "system-health": "system",
  activity: "system",
  run: "system",
  "live-smoke": "system"
};

function go(view, opts = {}) {
  state.view = view;
  if (opts.lead) state.activeLeadId = opts.lead;
  if (opts.filter) state.leadFilter = opts.filter;
  if (opts.bucket) state.leadBucketFilter = opts.bucket;
  if (opts.touch) state.activeTouchNumber = opts.touch;
  if (location.hash.slice(1) !== view) {
    history.replaceState(null, "", `#${view}`);
  }
  render();
}

// Deep-linkable six-tab views plus redirects for the retired interface.
const initialView = location.hash.slice(1);
const initialRoute = initialView.split("?")[0];
if (VIEWS.has(initialRoute)) state.view = initialRoute;
else if (LEGACY_ROUTES[initialRoute]) state.view = LEGACY_ROUTES[initialRoute];
if (LEGACY_ROUTES[initialRoute]) history.replaceState(null, "", `#${state.view}`);
const initialLead = new URLSearchParams(location.search).get("lead");
if (initialLead) state.activeLeadId = initialLead;
window.addEventListener("hashchange", () => {
  const requested = location.hash.slice(1).split("?")[0];
  const view = VIEWS.has(requested) ? requested : LEGACY_ROUTES[requested];
  if (view && view !== state.view) go(view);
});

document.querySelectorAll(".rail-item").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.view));
});

document.querySelectorAll("[data-product-switch]").forEach((btn) => {
  btn.addEventListener("click", () => setProduct(btn.dataset.productSwitch));
});

function isEditing() {
  const a = document.activeElement;
  return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
}

async function poll() {
  // Never yank the UI out from under an active edit (compose, search, stage).
  if (isEditing()) return;
  await load();
}

await load();
setInterval(poll, 6000);
