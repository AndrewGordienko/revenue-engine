// cockpit.js — the Today screen of the founder revenue cockpit. Talks only to the
// venture-scoped queue/scorecard/buckets API and the manual-LinkedIn action endpoints.
// LinkedIn sending is always manual: the verbs are Copy draft + Mark sent (record).
const VENTURES = [
  { key: "all", label: "All" },
  { key: "gnk", label: "GNK" },
  { key: "outagehub", label: "OHub" },
  { key: "morrow", label: "Morrow" },
];
const state = {
  venture: localStorage.getItem("cockpit.venture") || "all",
  view: "today",
  focus: 0,
  data: { queue: { items: [], cap: 15, admitted: 0 }, scorecard: null, buckets: null, board: null },
};
const NEXT_COLUMN = { contacted: "replied", replied: "call", call: "proposal", proposal: "won", targeted: "connected", connected: "workflow", workflow: "site_walk", site_walk: "fit_memo", fit_memo: "partner" };

const $ = (id) => document.getElementById(id);
const vparam = () => (state.venture === "all" ? "all" : state.venture);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}
async function load() {
  const v = `venture=${encodeURIComponent(vparam())}`;
  if (state.view === "pipeline") {
    // Pipeline has no "All" — funnels never merge. Default to gnk when All is selected.
    const bv = state.venture === "all" ? "gnk" : state.venture;
    state.data.board = await api(`/api/board/${bv}`);
  } else if (state.view === "people") {
    state.data.people = await api(`/api/people?${v}&query=${encodeURIComponent(state.peopleQuery || "")}`);
  } else if (state.view === "review") {
    state.data.review = await api(`/api/review?${v}&window=week`);
  } else if (state.view === "admin") {
    state.data.admin = await api(`/api/admin`);
  } else if (state.view === "connect") {
    state.data.connect = await api(`/api/connect-queue?${v}&cap=150`);
  } else {
    const [queue, scorecard, buckets] = await Promise.all([
      api(`/api/queue?${v}`), api(`/api/scorecard?${v}&window=week`), api(`/api/queue/buckets?${v}`),
    ]);
    state.data = { ...state.data, queue, scorecard, buckets };
    if (state.focus >= queue.items.length) state.focus = Math.max(0, queue.items.length - 1);
  }
  render();
}

function toast(msg, undo) {
  const t = $("toast");
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (undo) { const b = document.createElement("button"); b.textContent = "Undo"; b.onclick = () => { undo(); t.style.display = "none"; }; t.appendChild(b); }
  t.style.display = "flex";
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = "none"), 6000);
}

function renderPills() {
  $("pills").innerHTML = VENTURES.map((v) =>
    `<button class="pill ${v.key}" data-v="${v.key}" aria-selected="${state.venture === v.key}">${v.label}</button>`).join("");
  $("pills").querySelectorAll(".pill").forEach((el) => el.onclick = () => {
    state.venture = el.dataset.v; localStorage.setItem("cockpit.venture", state.venture); state.focus = 0; load();
  });
}

function renderScorecards() {
  const s = state.data.scorecard; if (!s) return;
  const card = (k, m) => `<div class="metric" title="${esc(m.window.label)} · denominator: ${esc(m.denominator)} ${esc(m.denominator_of || "")} · cohort: ${esc(m.cohort)} · ${m.confirmed ? "human-confirmed" : "inferred"}">
    <div class="v">${m.value}</div><div class="k">${k}</div></div>`;
  $("scorecards").innerHTML = card("Sends", s.sends) + card("Replies", s.replies) + card("Calls", s.calls) + card("Proposals", s.proposals);
}

function actionButtons(it, i) {
  if (it.kind === "draft") {
    return `<button class="primary" data-op="copy" data-i="${i}">Copy draft</button>
      <button data-op="record-send" data-i="${i}">Mark sent</button>`;
  }
  if (it.action_type === "respond_to_reply") {
    return `<button class="primary" data-op="reply" data-i="${i}">Log reply</button>
      <button class="quiet" data-op="snooze" data-i="${i}">Snooze</button>
      <button class="quiet" data-op="skip" data-i="${i}">Skip</button>`;
  }
  return `<button class="quiet" data-op="snooze" data-i="${i}">Snooze</button>
    <button class="quiet" data-op="skip" data-i="${i}">Skip</button>
    <button data-op="complete" data-i="${i}">Done</button>`;
}

function renderCards() {
  const { items, cap, admitted } = state.data.queue;
  const done = 0; // completed-today count is derived server-side later; header shows load vs cap
  $("queueTitle").textContent = `Today — ${items.length} of ${admitted} shown (cap ${cap})`;
  $("queueBar").style.width = admitted ? `${Math.round((items.length / Math.min(admitted, cap)) * 100)}%` : "0%";
  $("todayBadge").textContent = `Today ${admitted}`;
  if (!items.length) {
    $("cards").innerHTML = `<div class="empty">Inbox zero — no active-motion work is due. Create deliberate outreach or take a break.</div>`;
    return;
  }
  $("cards").innerHTML = items.map((it, i) => {
    const v = it.venture || "gnk";
    const draft = it.kind === "draft"
      ? `<div class="draft" data-draft="${i}">${esc(it.draft_text)}</div>`
      : "";
    return `<div class="card ${i === state.focus ? "focused" : ""}" tabindex="0" data-i="${i}">
      <div class="head">
        <span class="vbadge ${v}">${v}${it.motion_type === "design_partner" ? " · partner" : ""}</span>
        <span class="who">${esc(it.person || "—")}</span>
        <span class="sub">${esc(it.title || "")}${it.company ? " · " + esc(it.company) : ""}</span>
        <span class="chip">${esc(it.action_type || "")}</span>
      </div>
      <div class="context">${esc(it.context_line || "")}</div>
      ${draft}
      <div class="btns">${actionButtons(it, i)}</div>
    </div>`;
  }).join("");
  wireCards();
}

function wireCards() {
  $("cards").querySelectorAll("[data-op]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); doOp(el.dataset.op, Number(el.dataset.i)); });
  $("cards").querySelectorAll(".card").forEach((el) => el.onclick = () => { state.focus = Number(el.dataset.i); highlight(); });
  $("cards").querySelectorAll("[data-draft]").forEach((el) => el.ondblclick = () => startEdit(Number(el.dataset.draft)));
}
function highlight() {
  $("cards").querySelectorAll(".card").forEach((el) => el.classList.toggle("focused", Number(el.dataset.i) === state.focus));
  const cur = $("cards").querySelector(`.card[data-i="${state.focus}"]`); if (cur) cur.focus();
}

function startEdit(i) {
  const it = state.data.queue.items[i]; if (it.kind !== "draft") return;
  const box = $("cards").querySelector(`[data-draft="${i}"]`);
  const ta = document.createElement("textarea"); ta.className = "draft"; ta.value = it.draft_text;
  ta.onblur = async () => { if (ta.value !== it.draft_text) { await api(`/api/drafts/${it.draft_id}/edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: ta.value }) }); it.draft_text = ta.value; } };
  box.replaceWith(ta); ta.focus();
}

async function doOp(op, i) {
  const it = state.data.queue.items[i]; if (!it) return;
  try {
    if (op === "copy") { await navigator.clipboard.writeText(it.draft_text || "").catch(() => {}); await api(`/api/drafts/${it.draft_id}/copy`, { method: "POST" }); toast("Copied to clipboard"); return; }
    if (op === "record-send") { const r = await api(`/api/record-send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft_id: it.draft_id }) }); if (!r.ok) throw new Error(r.error); toast("Marked sent"); await load(); return; }
    if (op === "reply") {
      const text = prompt("Paste their reply:"); if (!text) return;
      const r = await api(`/api/paste-reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ motion_id: it.motion_id, text, sentiment: "neutral" }) });
      if (!r.ok) throw new Error(r.error); toast("Reply logged"); await load(); return;
    }
    if (op === "snooze") { const until = prompt("Snooze until? tomorrow / +3d / next_monday", "tomorrow") || "tomorrow"; await api(`/api/actions/${it.action_id}/snooze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ until }) }); toast("Snoozed"); await load(); return; }
    if (op === "skip") { const reason = prompt("Skip reason? (Wrong person / Bad timing / Bad draft / Not a fit / Other)", "Not a fit"); if (!reason) return; await api(`/api/actions/${it.action_id}/skip`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }); toast("Skipped"); await load(); return; }
    if (op === "complete") { await api(`/api/actions/${it.action_id}/complete`, { method: "POST" }); toast("Done"); await load(); return; }
  } catch (err) { toast(`Error: ${err.message}`); }
}

function renderBuckets() {
  const b = state.data.buckets; if (!b) return;
  $("buckets").innerHTML = `<span>Inbox <b>${b.inbox}</b></span><span>Backlog <b>${b.backlog}</b></span><span>Watchlist <b>${b.watchlist}</b></span><span>Archive <b>${b.archive}</b></span>`;
}

function renderNav() {
  $("nav").querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-current", String(state.view === b.dataset.view));
    b.onclick = () => { state.view = b.dataset.view; state.focus = 0; load(); };
  });
}

function renderPipeline() {
  const bd = state.data.board, host = $("board");
  if (!bd) { host.innerHTML = ""; return; }
  host.innerHTML = bd.columns.map((c) => `<div class="col"><h3><span>${esc(c.label)}</span><span>${c.cards.length}</span></h3>${
    c.cards.map((card) => `<div class="bcard ${card.stalled ? "stalled" : ""}">
      <div class="who">${esc(card.person || "—")}</div>
      <div class="sub">${esc(card.company || "")} · ${card.days_in_stage}d${card.stalled ? " · stalled" : ""}</div>
      ${card.amount ? `<div class="amt">$${Number(card.amount).toLocaleString()}</div>` : ""}
      ${NEXT_COLUMN[c.key] ? `<button class="adv" data-mid="${card.motion_id}" data-next="${NEXT_COLUMN[c.key]}">Advance ▸</button>` : ""}
    </div>`).join("") || `<div class="sub" style="padding:8px">—</div>`
  }</div>`).join("");
  host.querySelectorAll(".adv").forEach((el) => el.onclick = () => advance(Number(el.dataset.mid), el.dataset.next));
}

async function postEvent(motionId, type) {
  const r = await api(`/api/motions/${motionId}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) });
  if (!r.ok) throw new Error(r.error);
}
async function openForm(motionId, form) {
  try {
    if (form === "confirm_meeting") await postEvent(motionId, "meeting_confirmed");
    else if (form === "qualification") await postEvent(motionId, "qualification_confirmed");
    else if (form === "proposal") await postEvent(motionId, "proposal_reviewed");
    else if (form === "paste_reply") { const t = prompt("Paste their reply:"); if (!t) return; const r = await api(`/api/paste-reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ motion_id: motionId, text: t, sentiment: "neutral" }) }); if (!r.ok) throw new Error(r.error); }
    else if (form === "contract") {
      const offer_id = prompt("Offer id (e.g. GNK-POD-01):"); if (!offer_id) return;
      const mrr = Number(prompt("Monthly (mrr), 0 if none:", "0")) || 0;
      const one_time = Number(prompt("One-time, 0 if none:", "0")) || 0;
      const start_date = prompt("Booked start date (YYYY-MM-DD):"); if (!start_date) return;
      const r = await api(`/api/motions/${motionId}/contract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offer_id, mrr, one_time, start_date }) }); if (!r.ok) throw new Error(r.error);
    } else { toast(`Form ${form} handled on Today`); return; }
    toast("Advanced"); load();
  } catch (err) { toast(`Error: ${err.message}`); }
}
async function advance(motionId, target) {
  const res = await fetch(`/api/motions/${motionId}/stage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }) });
  const j = await res.json();
  if (res.status === 409 && j.required_form) return openForm(motionId, j.required_form);
  if (!j.ok) return toast(`Error: ${j.error || "blocked"}`);
  load();
}

function renderPeople() {
  const p = state.data.people, host = $("people");
  if (!p) { host.innerHTML = ""; return; }
  host.innerHTML = `<input class="search" id="peopleSearch" placeholder="Search people by name or company… (${p.total} total)" value="${esc(state.peopleQuery || "")}" />
    <table class="people"><thead><tr><th>Name</th><th>Company</th><th>Venture</th><th>Stage</th><th>Last touch</th></tr></thead>
    <tbody>${p.rows.map((r) => `<tr data-id="${esc(r.lead_id)}"><td>${esc(r.name || "—")}</td><td>${esc(r.company || "")}</td><td><span class="vbadge ${r.venture}">${esc(r.venture)}</span></td><td>${esc(r.stage)}</td><td class="sub">${r.last_touch ? new Date(r.last_touch).toLocaleDateString() : "—"}</td></tr>`).join("")}</tbody></table>
    <div id="drawer"></div>`;
  const box = $("peopleSearch");
  box.oninput = debounce(() => { state.peopleQuery = box.value; load().then(() => { const b = $("peopleSearch"); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }); }, 300);
  host.querySelectorAll("tr[data-id]").forEach((tr) => tr.onclick = () => openPerson(tr.dataset.id));
}
async function openPerson(leadId) {
  const page = await api(`/api/leads/${encodeURIComponent(leadId)}/full`);
  if (!page || page.ok === false) return;
  $("drawer").innerHTML = `<div class="drawer">
    <div class="head"><span class="vbadge ${page.lead.venture}">${page.lead.venture}</span><span class="who">${esc(page.lead.name)}</span><span class="sub">${esc(page.lead.title || "")} · ${esc(page.lead.company || "")}</span><span class="chip">${esc(page.stage)}${page.play_id ? " · " + esc(page.play_id) : ""}</span></div>
    ${page.lead.linkedin_url ? `<div><a href="${esc(page.lead.linkedin_url)}" target="_blank" rel="noopener">Open LinkedIn ↗</a></div>` : ""}
    ${page.motion ? `<div class="sub">Motion #${page.motion.id} · ${esc(page.motion.status)}${page.next_action ? " · next: " + esc(page.next_action.action_type) : ""}</div>` : `<div class="sub">No open motion</div>`}
    <ul class="tl">${page.timeline.map((e) => `<li><span class="t">${e.at ? new Date(e.at).toLocaleString() : ""} · ${esc(e.source || "")}</span><br/><b>${esc(e.type)}</b>${e.detail ? " — " + esc(String(e.detail).slice(0, 240)) : ""}</li>`).join("") || "<li class='sub'>No history yet.</li>"}</ul>
  </div>`;
}

function renderReview() {
  const r = state.data.review, host = $("review");
  if (!r) { host.innerHTML = ""; return; }
  const rows = Object.values(r.revenue || {});
  const revBlock = rows.map((row) => `<div><div class="sub" style="margin:8px 0 4px">${esc(row.venture)} — revenue funnel (${esc(r.window.label)})</div>
    <div class="funnel">${["sends", "replies", "calls", "proposals", "won"].map((k) => `<div class="step" title="denominator: ${row[k].denominator ?? "—"} ${esc(row[k].denominator_of || "")}"><div class="v">${row[k].value}</div><div class="k">${k}</div></div>`).join("")}</div></div>`).join("");
  const morrowBlock = r.morrow ? `<div><div class="sub" style="color:var(--morrow-fg);margin:8px 0 4px">Morrow — design-partner (never summed with revenue)</div>
    <div class="funnel">${["conversations_started", "workflow_convos", "site_walks", "fit_memos", "partners"].map((k) => `<div class="step"><div class="v">${r.morrow[k].value}</div><div class="k">${k.replace(/_/g, " ")}</div></div>`).join("")}</div></div>` : "";
  host.innerHTML = `${revBlock}${morrowBlock}
    <div class="cash">$${Number(r.cash_line.booked).toLocaleString()} <small>of $${Number(r.cash_line.target).toLocaleString()} booked · from signed contracts only</small></div>
    <div class="sub">Movement: ${r.movement.advanced} advanced · ${r.movement.stalled} stalled &gt;10d · Skips: ${(r.skip_analysis || []).map((s) => esc(s.reason) + " (" + s.count + ")").join(", ") || "none"}</div>`;
}

function renderAdmin() {
  const a = state.data.admin, host = $("admin");
  if (!a) { host.innerHTML = ""; return; }
  const rows = (arr, cols) => `<table class="people"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${arr.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  host.innerHTML = `<p class="sub">Admin is intentionally plain — engineering state lives here, never on the daily screens.</p>
    <h3 class="sub">Health</h3><div class="buckets">${Object.entries(a.health).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join("")} <span>agents <b>${a.agents}</b></span></div>
    <h3 class="sub" style="margin-top:16px">Commercial offers (read-only)</h3>${rows(a.strategy.offers, ["offer_id", "venture", "name", "pricing_model", "amount_min", "amount_max"])}
    <h3 class="sub" style="margin-top:16px">Plays (read-only)</h3>${rows(a.strategy.plays, ["play_id", "brand", "name"])}
    <h3 class="sub" style="margin-top:16px">Cohorts</h3>${rows(a.cohorts, ["cohort_id", "product", "play_id", "status"])}`;
}

function renderConnect() {
  const q = state.data.connect, host = $("connect");
  if (!q) { host.innerHTML = ""; return; }
  const blocks = q.buckets.map((b) => `<div style="margin-bottom:20px">
    <h3 class="sub" style="margin:0 0 2px">${esc(b.label)} — ${b.people.length}/${b.target}</h3>
    <div class="sub" style="margin-bottom:8px">${esc(b.job)}</div>
    ${b.people.map((p) => `<div class="card" data-cid="${p.connection_id}">
      <div class="head"><span class="vbadge ${p.venture}">${esc(p.venture)}</span><span class="who">${esc(p.name)}</span><span class="sub">${esc(String(p.headline||"").slice(0,60))}</span><span class="chip">${esc(p.role||"")}</span></div>
      <div class="draft">${esc(p.suggested_note)}</div>
      <div class="btns">
        <button class="primary" data-cop="copy" data-note="${esc(p.suggested_note)}">Copy note</button>
        ${p.profile_url ? `<a href="${esc(p.profile_url)}" target="_blank" rel="noopener"><button>Open profile</button></a>` : ""}
        <button data-cop="sent" data-cid="${p.connection_id}">Mark sent</button>
      </div></div>`).join("") || `<div class="sub" style="padding:8px">— none available in this bucket for this venture —</div>`}
  </div>`).join("");
  host.innerHTML = `<div class="sub" style="margin-bottom:12px">${q.total} warm-network actions for <b>${esc(q.venture)}</b> this week. ${esc(q.note)}<br/>These are people you already know — edit each note, copy it, send on LinkedIn, then Mark sent so it drops off next week.</div>${blocks}`;
  host.querySelectorAll("[data-cop]").forEach((el) => el.onclick = async () => {
    if (el.dataset.cop === "copy") { await navigator.clipboard.writeText(el.dataset.note || "").catch(()=>{}); toast("Note copied"); }
    else { await api(`/api/connect/${el.dataset.cid}/sent`, { method: "POST" }); toast("Marked sent"); const card = el.closest(".card"); if (card) card.style.opacity = 0.4; }
  });
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function render() {
  renderPills(); renderNav();
  const view = state.view;
  const show = (id, on) => { const el = typeof id === "string" ? $(id) : id; if (el) el.style.display = on ? "" : "none"; };
  show("scorecards", view === "today"); show(document.querySelector(".queue-head"), view === "today");
  show("cards", view === "today"); show("buckets", view === "today");
  show("board", view === "pipeline"); show("people", view === "people"); show("review", view === "review"); show("admin", view === "admin"); show("connect", view === "connect");
  if (view === "today") { renderScorecards(); renderCards(); renderBuckets(); }
  else if (view === "pipeline") renderPipeline();
  else if (view === "people") renderPeople();
  else if (view === "review") renderReview();
  else if (view === "admin") renderAdmin();
  else if (view === "connect") renderConnect();
  const al = $("adminLink"); if (al) al.onclick = () => { state.view = "admin"; load(); };
}

let gPending = false;
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (gPending) { gPending = false; if (e.key === "t") { state.view = "today"; load(); return; } if (e.key === "p") { state.view = "pipeline"; load(); return; } }
  if (e.key === "g") { gPending = true; return; }
  if (state.view !== "today") return;
  const items = state.data.queue.items;
  if (e.key === "j" || e.key === "ArrowDown") { state.focus = Math.min(items.length - 1, state.focus + 1); highlight(); }
  else if (e.key === "k" || e.key === "ArrowUp") { state.focus = Math.max(0, state.focus - 1); highlight(); }
  else if (e.key === "c") doOp("copy", state.focus);
  else if (e.key === "s") doOp("record-send", state.focus);
  else if (e.key === "z") doOp("snooze", state.focus);
  else if (e.key === "x") doOp("skip", state.focus);
});

load();
