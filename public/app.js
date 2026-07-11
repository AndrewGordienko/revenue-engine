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
    description: "high-trust engineering sprints"
  },
  outagehub: {
    key: "outagehub",
    slug: "outagehub",
    short: "OHUB",
    name: "OutageHub",
    mark: "OH",
    colorName: "orange",
    description: "Canadian power-event intelligence"
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

const state = {
  product: localStorage.getItem("salesv3_product") === "outagehub" ? "outagehub" : "gnk",
  view: "overview",
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
  agentHealth: { summary: {}, agents: [] }
};

const stageEl = document.querySelector("#stage");
const railTaskEl = document.querySelector("#rail-task");
const countLeadsEl = document.querySelector("#count-leads");
const brandMarkEl = document.querySelector("#brand-mark");

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
  const [registry, bus, messages, runStatus, leads, memorySummary, pipelineReport, outreachQueue, cohorts, integrations, agentHealth] = await Promise.all([
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
    fetch("/api/agent-health").then((r) => r.json()).catch(() => ({ summary: {}, agents: [] }))
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
function renderOverview() {
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
        h("h2", { class: "revenue-title", text: product.key === "outagehub" ? "Paid operational pilots, then annual contracts." : "One high-trust sprint, not a volume funnel." }),
        h("p", {
          class: "revenue-sub",
          text: revenue?.strategy_summary || (product.key === "outagehub"
            ? "Prove one outage-sensitive decision with paid implementation and a 30-day evaluation, then convert it to an annual agreement."
            : "Use warm introductions, observable triggers, and partners to close one four-to-six-week production sprint.")
        })
      ]),
      h("div", { class: "revenue-metrics" }, [
        metric("Booked revenue", `${money(actual.booked_one_time_usd)} / ${money(measuredTarget.bookedRevenueUsd || 40000)}`),
        metric("Booked MRR", money(actual.booked_mrr_usd)),
        metric("Implementation margin", actual.implementation_gross_margin == null ? "—" : `${Math.round(actual.implementation_gross_margin * 100)}%`),
        metric(product.key === "outagehub" ? "Paid pilots" : "Signed sprint", `${actual.wins || 0} / ${measuredTarget.paidWins || 0}`)
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

function renderCalendar() {
  const schedule = buildOutreachCalendar(30);
  const stats = state.leads.stats || {};
  const byBucket = stats.byBucket || {};
  const todayKey = localDateKey(new Date());
  if (!state.selectedCalendarDate) state.selectedCalendarDate = todayKey;
  const month = state.calendarMonth ? new Date(`${state.calendarMonth}-01T00:00:00`) : startOfMonth(new Date());
  state.calendarMonth = localDateKey(month).slice(0, 7);
  const scheduleByDay = new Map(schedule.map((day) => [localDateKey(day.date), day]));
  const cells = buildMonthCells(month);
  const selectedDay = scheduleByDay.get(state.selectedCalendarDate) || { date: new Date(`${state.selectedCalendarDate}T00:00:00`), tasks: [] };
  const el = h("section", { class: "page calendar-page" });

  el.append(pageHead(
    "Calendar",
    "Outreach calendar",
    "Each day mixes short, medium, and long-term touchpoints so the pipeline keeps moving.",
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
    const visibleTasks = day.tasks.slice(0, 4);
    const overflow = Math.max(0, day.tasks.length - visibleTasks.length);
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
        bucketCounts.length ? h("span", { class: "cell-count", text: String(day.tasks.length) }) : null
      ]),
      bucketCounts.length ? h("div", { class: "cell-buckets" }, bucketCounts.map((entry) =>
        h("span", { class: `cell-bucket ${entry.bucket.key}`, title: entry.bucket.label, text: String(entry.count) })
      )) : null,
      h("div", { class: "cell-events" }, visibleTasks.map((task) =>
        h("button", {
          class: `calendar-event ${task.bucket.key}`,
          title: `${task.lead.name} · ${task.lead.company} · Email ${task.touchNumber}`,
          onclick: (event) => {
            event.stopPropagation();
            go("outreach", { lead: task.lead.id, touch: task.touchNumber });
          }
        }, [
          h("span", { class: "event-bucket-dot" }),
          h("span", { class: "event-text", text: `${task.lead.name} · E${task.touchNumber}` })
        ])
      )),
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

  const agenda = h("aside", { class: "calendar-agenda" }, [
    h("header", { class: "agenda-head" }, [
      h("div", {}, [
        h("span", { class: "day-label", text: state.selectedCalendarDate === todayKey ? "Today" : "Selected day" }),
        h("h2", { class: "day-date", text: formatCalendarDay(selectedDay.date) })
      ]),
      h("span", { class: "day-count", text: `${selectedDay.tasks.length} touches` })
    ]),
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
    )) : h("p", { class: "muted pad", text: "No outreach scheduled for this day." })
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
    "System",
    "Agent health",
    `${summary.total || 0} agents · ${summary.critical || 0} on the live path · ${summary.blocked || 0} blocked · strategy ${health.strategy_version || "?"}`,
    [h("button", { class: "btn", text: "Refresh", onclick: () => load() })]
  ));

  el.append(h("div", { class: "capacity-metrics" }, [
    metric("Live-path agents", numberOrDash(summary.critical)),
    metric("Fresh artifacts", numberOrDash(summary.fresh)),
    metric("Blocked", numberOrDash(summary.blocked)),
    metric("Total registered", numberOrDash(summary.total))
  ]));

  for (const tier of TIER_ORDER) {
    const agents = (health.agents || []).filter((a) => a.tier === tier);
    if (!agents.length) continue;
    const rows = h("div", { class: "agent-health-list" });
    for (const a of agents) {
      const state_chip = a.blocker ? h("span", { class: "chip warn", text: "blocked" })
        : a.fresh ? h("span", { class: "chip fit", text: "fresh" })
        : a.status === "never_run" ? h("span", { class: "chip", text: "never run" })
        : h("span", { class: "chip", text: humanize(a.status || "idle") });
      rows.append(h("article", { class: `agent-health-row${a.criticalPath ? " critical" : ""}` }, [
        h("div", { class: "ah-main" }, [
          h("div", { class: "ah-head" }, [
            h("strong", { text: a.slug }),
            a.criticalPath ? h("span", { class: "chip ai", text: "live path" }) : null,
            a.benchmarkRequired ? h("span", { class: "chip", text: "benchmarked" }) : null,
            state_chip
          ]),
          h("p", { class: "muted small", text: a.blocker ? `Blocker: ${a.blocker}` : `Last run ${a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : "—"} · ${a.downstreamConsumers.length} downstream consumer${a.downstreamConsumers.length === 1 ? "" : "s"}` }),
          a.unconsumedFields.length ? h("p", { class: "warn-line small", text: `Unconsumed output: ${a.unconsumedFields.join(", ")}` }) : null
        ]),
        h("div", { class: "ah-meta" }, [
          h("span", { text: `${a.cadence}` }),
          h("span", { text: a.schemaPass == null ? "schema —" : a.schemaPass ? "schema ✓" : "schema ✗" }),
          h("span", { text: `≤${a.maxRuntimeSeconds}s · ≤$${a.maxCostUsd}` })
        ])
      ]));
    }
    el.append(h("section", { class: "block" }, [
      h("h2", { class: "block-title", text: `${TIER_LABEL[tier] || tier} · ${agents.length}` }),
      rows
    ]));
  }
  return el;
}

/* ---------- router ---------- */
function render() {
  applyProductChrome();
  document.querySelectorAll(".rail-item").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
  const n = (state.leads.leads || []).length;
  countLeadsEl.textContent = n ? String(n) : "";
  const task = state.leads.task || state.runStatus.activeRun;
  railTaskEl.textContent = task ? `● ${task.name || task.slug || "running"}` : "";
  railTaskEl.classList.toggle("live", Boolean(task));

  const views = {
    overview: renderOverview,
    leads: renderLeads,
    outreach: renderOutreach,
    approvals: renderApprovals,
    agents: renderAgentHealth,
    calendar: renderCalendar,
    intelligence: renderIntelligence,
    activity: renderActivity,
    "live-smoke": renderLiveSmoke
  };
  if (state.view !== "live-smoke" && smokeLivePoll) { clearTimeout(smokeLivePoll); smokeLivePoll = null; }
  stageEl.replaceChildren((views[state.view] || renderOverview)());
}

const VIEWS = new Set(["overview", "leads", "outreach", "approvals", "agents", "calendar", "intelligence", "activity", "live-smoke"]);

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

// Deep-linkable views (e.g. #intelligence opens the knowledge graph directly),
// plus ?lead=<id> to open a specific lead's profile + memory.
const initialView = location.hash.slice(1);
if (VIEWS.has(initialView)) state.view = initialView;
const initialLead = new URLSearchParams(location.search).get("lead");
if (initialLead) state.activeLeadId = initialLead;
window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (VIEWS.has(view) && view !== state.view) go(view);
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
