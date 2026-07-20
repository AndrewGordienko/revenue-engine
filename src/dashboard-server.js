import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { findAgent, readMessages, readRegistry, readState } from "./bus.js";
import { fromRoot } from "./paths.js";
import { readLeads, updateLead, leadStats, leadsToCsv } from "./leads-store.js";
import { ingestFromState } from "./ingest-leads.js";
import { recommendedProspectPlan } from "./pipeline-capacity.js";
import { loadGraph, toGraphView, graphSummary } from "./ontology.js";
import { appendMemory, leadMemory, memorySummary, MEMORY_EVENT_TYPES } from "./lead-memory.js";
import { buildPipelineReport } from "./pipeline-report.js";
import { listRevenueEvents, recordRevenueEvent } from "./revenue-events.js";
import { approveOutreachCohort, approveOutreachMessage, createProviderDraft, listCohorts, listOutreachMessages, queueOutreachMessage, rejectOutreachMessage, syncGmail } from "./outreach-queue.js";
import { GmailProvider, GoogleCalendarProvider, googleWorkspaceStatus } from "./google-workspace.js";
import { OUTBOUND_SENDING_SUPPORTED } from "./outbound-guard.js";
import { buildAgentHealth } from "./agent-health.js";
import { bookMeeting, buildCallBrief, listMeetings, proposeMeetingTimes } from "./meetings.js";
import { preflight as smokeLivePreflight, readSmokeStatus, isSmokeRunActive } from "./smoke-live-run.js";
import { buildLinkedinProspects, validateLinkedinProspects } from "./linkedin-prospects.js";
import { buildOutreachInsights } from "./linkedin-chats.js";
import { importLinkedinChats } from "./import-linkedin-chats.js";
import { buildPlaybooks } from "./playbooks.js";
import { db } from "./db.js";
import { buildTodayQueue, buildScorecard, buildBuckets, updateAction } from "./founder-queue.js";
import { markDraftCopied, approveDraft as approveLinkedinDraft, editDraft } from "./linkedin-drafts.js";
import { recordSend, pasteReply, recordMotionEvent } from "./linkedin-events.js";
import { buildBoard, stageGate } from "./pipeline-board.js";
import { recordContractSigned } from "./offers.js";
import { buildPeopleIndex, buildPersonPage } from "./people-view.js";
import { buildReview } from "./review-view.js";
import { buildWeeklyQueue } from "./weekly-outreach.js";
import {
  captureMeetingOutcome,
  confirmMeeting,
  createExperiment,
  founderOverview,
  founderReconciliation,
  listNextActions,
  listExperiments,
  markProposalSent,
  recordManualLinkedinMessage,
  qualifyConversationOpportunity,
  scopeOpportunity,
  syncLinkedinOperatingLoop,
  assignExperiment,
  updateNextAction,
} from "./founder-ops.js";

// 8792-8795 belong to legacy ~/Documents/sales dashboard instances on this machine.
// Keep salesv3 on a stable, explicit address instead of silently competing.
const preferredPort = Number(process.env.PORT || 8796);
const maxPort = preferredPort + 20;
let activeRun = null;
let activeTask = null;

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub"
    : value === "morrow" ? "morrow" : value === "other" ? "other" : "gnk";
}

function productPrefixFromUrl(url) {
  return normalizeProduct(url.searchParams.get("product") || "gnk");
}
// Cockpit venture filter: ?venture=gnk|outagehub|morrow, or null (all) when absent/"all".
function cockpitVenture(url) {
  const v = url.searchParams.get("venture") || url.searchParams.get("product");
  return !v || v === "all" ? null : normalizeProduct(v);
}

function cleanSentence(value) {
  return String(value || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function readBody(request) {
  return new Promise((resolve) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// Long-running CRM jobs (prospecting, email finding) run as background tasks.
function spawnTask(name, scriptArgs) {
  if (activeTask) return false;
  activeTask = { name, startedAt: new Date().toISOString(), output: "" };
  const child = spawn("node", scriptArgs, { cwd: fromRoot(), stdio: ["ignore", "pipe", "pipe"] });
  const capture = (chunk) => {
    activeTask.output = (activeTask.output + chunk.toString()).slice(-8000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("close", (code) => {
    activeTask = { ...activeTask, finishedAt: new Date().toISOString(), exitCode: code };
    setTimeout(() => {
      activeTask = null;
    }, 15_000);
  });
  return true;
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  // The founder cockpit is the default. The previous dashboard stays reachable at /legacy.
  const rel = safePath === "/" ? "cockpit.html"
    : safePath === "/legacy" || safePath === "/legacy.html" ? "index.html"
    : safePath.slice(1);
  const filePath = fromRoot("public", rel);
  const publicRoot = fromRoot("public");

  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    throw error;
  }
}

async function triggerRun(response, slug) {
  if (activeRun) {
    sendJson(response, 409, { ok: false, error: "A run is already active." });
    return;
  }

  const { agent } = await findAgent(slug);
  activeRun = {
    startedAt: new Date().toISOString(),
    agentId: agent.id,
    slug: agent.slug,
    name: agent.name,
    output: ""
  };

  const child = spawn("node", ["src/run-agent.js", agent.slug], {
    cwd: fromRoot(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    activeRun.output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    activeRun.output += chunk.toString();
  });

  child.on("close", (code) => {
    activeRun = {
      ...activeRun,
      finishedAt: new Date().toISOString(),
      exitCode: code
    };

    setTimeout(() => {
      activeRun = null;
    }, 10_000);
  });

  sendJson(response, 202, { ok: true, startedAt: activeRun.startedAt, slug: agent.slug });
}

function triggerPipeline(response, product = "gnk") {
  if (activeRun) {
    sendJson(response, 409, { ok: false, error: "A run is already active." });
    return;
  }

  activeRun = {
    startedAt: new Date().toISOString(),
    slug: `${product}-pipeline`,
    name: `${product === "outagehub" ? "OutageHub" : product === "morrow" ? "Morrow" : "GNK"} Pipeline`,
    output: ""
  };

  // Canonical orchestration path: the SAME named pipeline the CLI runs
  // (`npm run pipeline:gnk` === run-pipeline.js full gnk). This replaces the old
  // run-sequence.js "run every non-optional agent" path so the dashboard and CLI
  // can no longer diverge. `full` is freshness-aware and closes the loop
  // (sourced accounts -> CRM, reviewed sequences -> approval queue).
  const child = spawn("node", ["src/run-pipeline.js", "full", product], {
    cwd: fromRoot(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    activeRun.output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    activeRun.output += chunk.toString();
  });

  child.on("close", (code) => {
    activeRun = {
      ...activeRun,
      finishedAt: new Date().toISOString(),
      exitCode: code
    };

    setTimeout(() => {
      activeRun = null;
    }, 10_000);
  });

  sendJson(response, 202, { ok: true, startedAt: activeRun.startedAt, slug: activeRun.slug });
}

// The "Run live smoke" dashboard action. Starts the SAME canonical orchestrator
// the CLI and the OpenClaw controller run (src/smoke-live-run.js -> runSmokeLive),
// which writes its live status to data/artifacts/smoke-live-status.json. Draft-only
// and human-gated: the orchestrator never approves a cohort/message or sends.
let smokeLiveChild = null;
async function smokeLiveState() {
  const status = readSmokeStatus();
  let preflight = null;
  try { preflight = await smokeLivePreflight(); } catch (error) { preflight = { ok: false, error: error.message }; }
  const running = Boolean(smokeLiveChild) || isSmokeRunActive(status);
  return { running, preflight, status };
}
function startSmokeLive(response) {
  if (smokeLiveChild || isSmokeRunActive(readSmokeStatus())) {
    sendJson(response, 409, { ok: false, error: "A live-smoke run is already active." });
    return;
  }
  const child = spawn("node", ["src/smoke-live-run.js"], { cwd: fromRoot(), stdio: ["ignore", "ignore", "ignore"], detached: false });
  smokeLiveChild = child;
  child.on("close", () => { smokeLiveChild = null; });
  child.on("error", () => { smokeLiveChild = null; });
  sendJson(response, 202, { ok: true, started: true });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/smoke-live" && request.method === "GET") {
      sendJson(response, 200, await smokeLiveState());
      return;
    }
    if (url.pathname === "/api/smoke-live" && request.method === "POST") {
      startSmokeLive(response);
      return;
    }

    if (url.pathname === "/api/state") {
      sendJson(response, 200, await readState());
      return;
    }

    if (url.pathname === "/api/messages") {
      sendJson(response, 200, await readMessages(Number(url.searchParams.get("limit") || 100)));
      return;
    }

    if (url.pathname === "/api/agents") {
      sendJson(response, 200, await readRegistry());
      return;
    }

    if (url.pathname === "/api/pipeline-report" && request.method === "GET") {
      sendJson(response, 200, buildPipelineReport(undefined, await readRegistry()));
      return;
    }

    if (url.pathname === "/api/agent-health" && request.method === "GET") {
      sendJson(response, 200, buildAgentHealth(await readRegistry(), await readState()));
      return;
    }

    if (url.pathname === "/api/integrations" && request.method === "GET") {
      sendJson(response, 200, { ...(await googleWorkspaceStatus()), outbound_sending_enabled: false, outbound_sending_supported: OUTBOUND_SENDING_SUPPORTED, mode: "draft_only" });
      return;
    }

    if (url.pathname === "/api/cohorts" && request.method === "GET") {
      sendJson(response, 200, { cohorts: listCohorts(productPrefixFromUrl(url)) });
      return;
    }

    const cohortApproveMatch = url.pathname.match(/^\/api\/cohorts\/([^/]+)\/approve$/);
    if (cohortApproveMatch && request.method === "POST") {
      try {
        const body = await readBody(request);
        sendJson(response, 200, { ok: true, cohort: approveOutreachCohort(decodeURIComponent(cohortApproveMatch[1]), body) });
      } catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    if (url.pathname === "/api/revenue-events" && request.method === "GET") {
      sendJson(response, 200, { events: listRevenueEvents(url.searchParams.get("lead")) });
      return;
    }

    if (url.pathname === "/api/revenue-events" && request.method === "POST") {
      try { sendJson(response, 201, { ok: true, ...(await recordRevenueEvent(await readBody(request))) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    if (url.pathname === "/api/outreach-queue" && request.method === "GET") {
      sendJson(response, 200, { messages: listOutreachMessages({ product: productPrefixFromUrl(url), status: url.searchParams.get("status") || null }) });
      return;
    }
    if (url.pathname === "/api/outreach-queue" && request.method === "POST") {
      try { sendJson(response, 201, { ok: true, message: queueOutreachMessage(await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    // No "send" action exists — sending is not implemented in this build.
    const outreachAction = url.pathname.match(/^\/api\/outreach-queue\/(\d+)\/(approve|reject|draft)$/);
    if (outreachAction && request.method === "POST") {
      const id = Number(outreachAction[1]);
      const action = outreachAction[2];
      const body = await readBody(request);
      try {
        const result = action === "approve" ? approveOutreachMessage(id, body)
          : action === "reject" ? rejectOutreachMessage(id, body)
          : await createProviderDraft(id, new GmailProvider());
        sendJson(response, 200, { ok: true, result });
      } catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    if (url.pathname === "/api/gmail/sync" && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, ...(await syncGmail(new GmailProvider())) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    // ---- SalesV3 2.0 founder operating loop ----
    if (url.pathname === "/api/founder-overview" && request.method === "GET") {
      sendJson(response, 200, founderOverview());
      return;
    }
    if (url.pathname === "/api/founder-reconciliation" && request.method === "GET") {
      sendJson(response, 200, founderReconciliation());
      return;
    }
    // ---- Founder cockpit: Today queue / scorecard / buckets (venture-scoped) ----
    if (url.pathname === "/api/queue" && request.method === "GET") {
      sendJson(response, 200, buildTodayQueue(db(), { venture: cockpitVenture(url) }));
      return;
    }
    if (url.pathname === "/api/scorecard" && request.method === "GET") {
      sendJson(response, 200, buildScorecard(db(), { venture: cockpitVenture(url), window: url.searchParams.get("window") || "week" }));
      return;
    }
    if (url.pathname === "/api/queue/buckets" && request.method === "GET") {
      sendJson(response, 200, buildBuckets(db(), { venture: cockpitVenture(url) }));
      return;
    }
    // ---- Cockpit actions: manual LinkedIn loop (draft-only; sending is always manual) ----
    if (url.pathname === "/api/record-send" && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, result: recordSend(db(), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    if (url.pathname === "/api/paste-reply" && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, result: pasteReply(db(), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const draftOpMatch = url.pathname.match(/^\/api\/drafts\/(\d+)\/(copy|approve|edit)$/);
    if (draftOpMatch && request.method === "POST") {
      const id = Number(draftOpMatch[1]);
      try {
        const b = await readBody(request);
        const draft = draftOpMatch[2] === "copy" ? markDraftCopied(db(), id)
          : draftOpMatch[2] === "approve" ? approveLinkedinDraft(db(), id, b)
          : editDraft(db(), id, b);
        sendJson(response, 200, { ok: true, draft });
      } catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const actionOpMatch = url.pathname.match(/^\/api\/actions\/(\d+)\/(snooze|skip|complete)$/);
    if (actionOpMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, action: updateAction(db(), Number(actionOpMatch[1]), actionOpMatch[2], await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    // ---- Pipeline board (venture-scoped; funnels never merged) + gated stage moves ----
    const boardMatch = url.pathname.match(/^\/api\/board\/([a-z]+)$/);
    if (boardMatch && request.method === "GET") {
      try { sendJson(response, 200, buildBoard(db(), { venture: boardMatch[1] })); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const stageMatch = url.pathname.match(/^\/api\/motions\/(\d+)\/stage$/);
    if (stageMatch && request.method === "POST") {
      const b = await readBody(request);
      const gate = stageGate(b.target);
      // Never silently move: a forward column returns the micro-form the founder must fill.
      if (gate.requires_evidence) { sendJson(response, 409, { ok: false, code: "gate_unmet", required_form: gate.required_form, motion_id: Number(stageMatch[1]), target: b.target }); return; }
      sendJson(response, 200, { ok: true, note: "no gate for this column" });
      return;
    }
    const motionEventMatch = url.pathname.match(/^\/api\/motions\/(\d+)\/event$/);
    if (motionEventMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, motion: recordMotionEvent(db(), { motion_id: Number(motionEventMatch[1]), ...(await readBody(request)) }) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const motionContractMatch = url.pathname.match(/^\/api\/motions\/(\d+)\/contract$/);
    if (motionContractMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, result: recordContractSigned(db(), { motion_id: Number(motionContractMatch[1]), ...(await readBody(request)) }) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    // ---- People (search-first index + Person page) + Review (funnel + cash line) ----
    if (url.pathname === "/api/people" && request.method === "GET") {
      sendJson(response, 200, buildPeopleIndex(db(), { venture: cockpitVenture(url), query: url.searchParams.get("query"), page: Number(url.searchParams.get("page") || 1) }));
      return;
    }
    const personMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/full$/);
    if (personMatch && request.method === "GET") {
      const page = buildPersonPage(db(), decodeURIComponent(personMatch[1]));
      if (!page) { sendJson(response, 404, { ok: false, error: "no such lead" }); return; }
      sendJson(response, 200, page);
      return;
    }
    if (url.pathname === "/api/review" && request.method === "GET") {
      sendJson(response, 200, buildReview(db(), { venture: cockpitVenture(url), window: url.searchParams.get("window") || "week" }));
      return;
    }
    // ---- Connect: this week's warm-network outreach list (Finder-lite from your graph) ----
    if (url.pathname === "/api/connect-queue" && request.method === "GET") {
      sendJson(response, 200, buildWeeklyQueue(db(), { venture: cockpitVenture(url), cap: Number(url.searchParams.get("cap") || 150) }));
      return;
    }
    const connectSentMatch = url.pathname.match(/^\/api\/connect\/(\d+)\/sent$/);
    if (connectSentMatch && request.method === "POST") {
      try {
        const t = new Date().toISOString();
        db().prepare("UPDATE linkedin_connections SET contacted_at=?, contact_channel='linkedin', updated_at=? WHERE id=?").run(t, t, Number(connectSentMatch[1]));
        sendJson(response, 200, { ok: true, id: Number(connectSentMatch[1]), contacted_at: t });
      } catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    if (url.pathname === "/api/admin" && request.method === "GET") {
      const d = db();
      const reg = await readRegistry();
      sendJson(response, 200, {
        strategy: {
          plays: d.prepare("SELECT DISTINCT play_id, brand, name FROM sales_plays ORDER BY brand, play_id").all(),
          offers: d.prepare("SELECT offer_id, venture, name, pricing_model, amount_min, amount_max FROM commercial_offers ORDER BY venture, offer_id").all(),
        },
        cohorts: d.prepare("SELECT cohort_id, product, play_id, status FROM cohorts ORDER BY product").all(),
        agents: Array.isArray(reg) ? reg.length : (reg?.agents?.length || 0),
        health: {
          db_integrity: d.prepare("PRAGMA integrity_check").get().integrity_check,
          controller: "disabled (reinstall: npm run controller:install)",
          tests: "run: npm test",
          leads: d.prepare("SELECT COUNT(*) c FROM leads").get().c,
          active_motions: d.prepare("SELECT COUNT(*) c FROM active_motions WHERE closed_at IS NULL").get().c,
          contracts: d.prepare("SELECT COUNT(*) c FROM contracts").get().c,
        },
      });
      return;
    }
    if (url.pathname === "/api/founder-sync" && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, result: syncLinkedinOperatingLoop() }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    if (url.pathname === "/api/playbooks" && request.method === "GET") {
      sendJson(response, 200, buildPlaybooks());
      return;
    }
    if (url.pathname === "/api/next-actions" && request.method === "GET") {
      sendJson(response, 200, { actions: listNextActions() });
      return;
    }
    if (url.pathname === "/api/experiments" && request.method === "GET") {
      sendJson(response, 200, { experiments: listExperiments() });
      return;
    }
    if (url.pathname === "/api/experiments" && request.method === "POST") {
      try { sendJson(response, 201, { ok: true, experiment: createExperiment(await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const experimentAssignMatch = url.pathname.match(/^\/api\/experiments\/(\d+)\/assign$/);
    if (experimentAssignMatch && request.method === "POST") {
      try { sendJson(response, 201, { ok: true, assignment: assignExperiment(Number(experimentAssignMatch[1]), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const nextActionMatch = url.pathname.match(/^\/api\/next-actions\/(\d+)$/);
    if (nextActionMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, action: updateNextAction(Number(nextActionMatch[1]), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    if (url.pathname === "/api/opportunities/qualify" && request.method === "POST") {
      const body = await readBody(request);
      try { sendJson(response, 201, { ok: true, opportunity: qualifyConversationOpportunity(Number(body.conversation_id), body) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const opportunityScopeMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/scope$/);
    if (opportunityScopeMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, opportunity: scopeOpportunity(Number(opportunityScopeMatch[1]), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const proposalSentMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/proposal-sent$/);
    if (proposalSentMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, opportunity: markProposalSent(Number(proposalSentMatch[1]), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const confirmMeetingMatch = url.pathname.match(/^\/api\/meetings\/(\d+)\/confirm$/);
    if (confirmMeetingMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, meeting: confirmMeeting(Number(confirmMeetingMatch[1]), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    const meetingOutcomeMatch = url.pathname.match(/^\/api\/meetings\/(\d+)\/outcome$/);
    if (meetingOutcomeMatch && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, meeting: captureMeetingOutcome(Number(meetingOutcomeMatch[1]), await readBody(request)) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    if (url.pathname === "/api/meetings" && request.method === "GET") {
      sendJson(response, 200, { meetings: listMeetings(url.searchParams.get("lead") || null) });
      return;
    }
    if (url.pathname === "/api/call-brief" && request.method === "GET") {
      try { sendJson(response, 200, { ok: true, brief: buildCallBrief(url.searchParams.get("lead")) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    if (url.pathname === "/api/meetings/proposals" && request.method === "POST") {
      const body = await readBody(request);
      try {
        const provider = new GoogleCalendarProvider();
        const status = await provider.status();
        sendJson(response, 200, { ok: true, ...(await proposeMeetingTimes({ ...body, provider: status.configured ? provider : null })), calendar_configured: status.configured });
      }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }
    if (url.pathname === "/api/meetings/book" && request.method === "POST") {
      const body = await readBody(request);
      try { sendJson(response, 201, { ok: true, meeting: await bookMeeting({ ...body, provider: new GoogleCalendarProvider() }) }); }
      catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/run\/([^/]+)$/);
    if (runMatch && request.method === "POST") {
      await triggerRun(response, decodeURIComponent(runMatch[1]));
      return;
    }

    if (url.pathname === "/api/pipeline" && request.method === "POST") {
      triggerPipeline(response, productPrefixFromUrl(url));
      return;
    }

    if (url.pathname === "/api/run-status") {
      sendJson(response, 200, { activeRun });
      return;
    }

    // ---- CRM / leads ----
    if (url.pathname === "/api/leads" && request.method === "GET") {
      const product = productPrefixFromUrl(url);
      const leads = await readLeads(product);
      const stats = await leadStats(leads);
      leads.sort((a, b) => (Number(b.fit_score) || 0) - (Number(a.fit_score) || 0));
      sendJson(response, 200, { leads, stats, task: activeTask });
      return;
    }

    if (url.pathname === "/api/linkedin-prospects" && request.method === "GET") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));
      if (url.searchParams.get("product") === "all") {
        const queues = {};
        for (const portfolioProduct of ["gnk", "outagehub", "morrow"]) {
          const productLeads = await readLeads(portfolioProduct);
          const productProspects = await buildLinkedinProspects(productLeads, portfolioProduct, 30);
          queues[portfolioProduct] = productProspects.map((prospect) => ({ ...prospect, product: portfolioProduct }));
        }
        // Round-robin the portfolio so the default screen visibly represents every
        // company instead of placing the complete GNK queue ahead of OHUB/Morrow.
        const portfolio = [];
        const queueOrder = ["gnk", "outagehub", "morrow"];
        const maxQueueLength = Math.max(...queueOrder.map((key) => queues[key].length));
        for (let index = 0; index < maxQueueLength; index++) {
          for (const key of queueOrder) {
            if (queues[key][index]) portfolio.push(queues[key][index]);
          }
        }
        const prospects = portfolio.slice(0, limit).map((prospect, index) => ({ ...prospect, portfolio_rank: index + 1 }));
        sendJson(response, 200, {
          product: "all",
          prospects,
          total: prospects.length,
          totals_by_product: Object.fromEntries(queueOrder.map((key) => [key, queues[key].length])),
          verified_profiles: prospects.length,
          matched_profiles: prospects.length,
          search_routes: 0,
          max_message_length: Math.max(0, ...prospects.map((item) => item.message_length)),
          generation_models: [...new Set(prospects.map((item) => item.message_source))],
          validation_errors: validateLinkedinProspects(prospects, prospects.length),
        });
        return;
      }
      const product = productPrefixFromUrl(url);
      const leads = await readLeads(product);
      const prospects = await buildLinkedinProspects(leads, product, limit);
      const expected = Math.min(limit, leads.filter((lead) => /linkedin\.com\/in\//i.test(lead.linkedin_or_source || "")).length);
      const validation_errors = validateLinkedinProspects(prospects, expected);
      sendJson(response, 200, {
        product,
        prospects,
        total: prospects.length,
        verified_profiles: prospects.filter((item) => item.profile_status === "verified" || item.profile_status === "matched").length,
        matched_profiles: prospects.filter((item) => item.profile_status === "verified" || item.profile_status === "matched").length,
        search_routes: prospects.filter((item) => item.profile_status === "search").length,
        max_message_length: Math.max(0, ...prospects.map((item) => item.message_length)),
        generation_models: [...new Set(prospects.map((item) => item.message_source))],
        validation_errors
      });
      return;
    }

    if (url.pathname === "/api/linkedin-chats/import" && request.method === "POST") {
      try {
        const body = await readBody(request);
        const text = String(body.text || "");
        if (text.trim().length < 20) throw new Error("Paste the copied LinkedIn conversation text first.");
        if (text.length > 3_000_000) throw new Error("That paste is too large. Import it in smaller batches.");
        const database = db();
        const before = {
          conversations: database.prepare("SELECT COUNT(*) n FROM linkedin_conversations").get().n,
          messages: database.prepare("SELECT COUNT(*) n FROM linkedin_messages").get().n,
        };
        const result = importLinkedinChats(database, text, {
          sourceFile: "dashboard-paste",
          referenceDay: /^\d{4}-\d{2}-\d{2}$/.test(body.reference_day || "") ? body.reference_day : new Date().toISOString().slice(0, 10),
          nameHint: String(body.name_hint || "").trim().slice(0, 200),
        });
        if (!result.conversations.length) throw new Error("No LinkedIn messages were recognized. Copy the conversation timeline, or include the person's name in the optional field.");
        const after = {
          conversations: database.prepare("SELECT COUNT(*) n FROM linkedin_conversations").get().n,
          messages: database.prepare("SELECT COUNT(*) n FROM linkedin_messages").get().n,
        };
        sendJson(response, 201, {
          ok: true,
          processed_conversations: result.conversations.length,
          people: result.conversations.map((conversation) => conversation.name),
          new_conversations: after.conversations - before.conversations,
          new_messages: after.messages - before.messages,
          total_conversations: after.conversations,
          total_messages: after.messages,
          canonical: result.canonical,
        });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/linkedin-conversations" && request.method === "GET") {
      const database = db();
      const requestedProduct = url.searchParams.get("product") || "all";
      const scopedProduct = ["gnk", "outagehub", "morrow", "other"].includes(requestedProduct) ? requestedProduct : null;
      const rows = database.prepare(`SELECT c.*,coalesce(lc.profile_url,c.profile_url) profile_url,lc.profile_status,
        co.primary_outcome,co.secondary_tags,co.confidence outcome_confidence,co.confirmed_by outcome_confirmed_by
        FROM linkedin_conversations c
        LEFT JOIN linkedin_connections lc ON lc.id=c.connection_id
        LEFT JOIN conversation_outcomes co ON co.conversation_id=c.id
        ${scopedProduct ? "WHERE c.product=?" : ""}
        ORDER BY CASE c.status WHEN 'needs_reply' THEN 0 WHEN 'meeting_booked' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
        coalesce(c.follow_up_at,'9999') ASC,c.last_message_at DESC`).all(...(scopedProduct ? [scopedProduct] : []));
      const conversationIds = rows.map((row) => row.id);
      const messages = conversationIds.length ? database.prepare(`SELECT * FROM linkedin_messages
        WHERE conversation_id IN (${conversationIds.map(() => "?").join(",")}) ORDER BY sent_at,id`).all(...conversationIds) : [];
      const byConversation = new Map();
      for (const message of messages) {
        if (!byConversation.has(message.conversation_id)) byConversation.set(message.conversation_id, []);
        byConversation.get(message.conversation_id).push(message);
      }
      const conversations = rows.map((row) => ({
        ...row,
        contact_details: JSON.parse(row.contact_details || "{}"),
        secondary_tags: JSON.parse(row.secondary_tags || "[]"),
        messages: byConversation.get(row.id) || [],
      }));
      const insights = buildOutreachInsights(conversations);
      const now = new Date().toISOString().slice(0, 19);
      const summary = {
        total: conversations.length,
        messages: messages.length,
        inbound: conversations.reduce((sum, item) => sum + item.inbound_count, 0),
        outbound: conversations.reduce((sum, item) => sum + item.outbound_count, 0),
        contacted_connections: conversations.filter((item) => item.connection_id).length,
        meetings: conversations.filter((item) => item.meeting_status === "scheduled").length,
        needs_reply: conversations.filter((item) => item.status === "needs_reply").length,
        qualified_replies: conversations.filter((item) => item.primary_outcome === "qualified_commercial_interest").length,
        followups_due: conversations.filter((item) => item.follow_up_at && item.follow_up_at <= now && item.status !== "closed").length,
        by_product: Object.fromEntries(["gnk", "outagehub", "morrow", "other"].map((product) => [product, conversations.filter((item) => item.product === product).length])),
        by_status: Object.fromEntries(["waiting", "needs_reply", "meeting_booked", "closed"].map((status) => [status, conversations.filter((item) => item.status === status).length])),
      };
      sendJson(response, 200, { conversations, summary, insights });
      return;
    }

    const conversationMatch = url.pathname.match(/^\/api\/linkedin-conversations\/(\d+)$/);
    if (conversationMatch && request.method === "POST") {
      const database = db();
      const id = Number(conversationMatch[1]);
      const current = database.prepare("SELECT * FROM linkedin_conversations WHERE id=?").get(id);
      if (!current) { sendJson(response, 404, { ok: false, error: "Conversation not found." }); return; }
      const body = await readBody(request);
      const choose = (field, allowed) => allowed.includes(body[field]) ? body[field] : current[field];
      const dateValue = (field) => body[field] === null ? null
        : typeof body[field] === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(body[field]) ? body[field] : current[field];
      const status = choose("status", ["waiting", "needs_reply", "meeting_booked", "closed"]);
      const meetingStatus = choose("meeting_status", ["none", "proposed", "scheduled", "completed", "cancelled"]);
      const product = choose("product", ["gnk", "outagehub", "morrow", "other"]);
      const nextAction = typeof body.next_action === "string" ? body.next_action.trim().slice(0, 1000) : current.next_action;
      const manualNotes = typeof body.manual_notes === "string" ? body.manual_notes.trim().slice(0, 5000) : current.manual_notes;
      const meetingTimezone = typeof body.meeting_timezone === "string" ? body.meeting_timezone.trim().slice(0, 40) : current.meeting_timezone;
      database.prepare(`UPDATE linkedin_conversations SET product=?,status=?,meeting_status=?,follow_up_at=?,meeting_at=?,
        meeting_timezone=?,next_action=?,manual_notes=?,workflow_source='human',updated_at=? WHERE id=?`).run(
        product, status, meetingStatus, dateValue("follow_up_at"), dateValue("meeting_at"), meetingTimezone,
        nextAction, manualNotes, new Date().toISOString(), id,
      );
      const outcomes = ["no_reply", "polite_neutral", "correction", "objection", "current_process_disclosure", "problem_acknowledged", "timing_signal", "referral", "call_proposed", "call_booked", "qualified_commercial_interest", "negative_suppress"];
      if (outcomes.includes(body.primary_outcome)) {
        const t = new Date().toISOString();
        const tags = Array.isArray(body.secondary_tags) ? body.secondary_tags.map(String).slice(0, 20) : [];
        database.prepare(`INSERT INTO conversation_outcomes
          (conversation_id,primary_outcome,secondary_tags,confidence,confirmed_by,correction_text,created_at,updated_at)
          VALUES(?,?,?,'confirmed','Andrew',?,?,?)
          ON CONFLICT(conversation_id) DO UPDATE SET primary_outcome=excluded.primary_outcome,
          secondary_tags=excluded.secondary_tags,confidence='confirmed',confirmed_by='Andrew',
          correction_text=excluded.correction_text,updated_at=excluded.updated_at`).run(
            id, body.primary_outcome, JSON.stringify(tags),
            typeof body.correction_text === "string" ? body.correction_text.trim().slice(0, 5000) : null, t, t,
          );
      }
      const updated = database.prepare("SELECT * FROM linkedin_conversations WHERE id=?").get(id);
      syncLinkedinOperatingLoop(database);
      sendJson(response, 200, { ok: true, conversation: { ...updated, contact_details: JSON.parse(updated.contact_details || "{}") } });
      return;
    }

    const conversationSentMatch = url.pathname.match(/^\/api\/linkedin-conversations\/(\d+)\/messages\/sent$/);
    if (conversationSentMatch && request.method === "POST") {
      try {
        sendJson(response, 201, { ok: true, ...recordManualLinkedinMessage(Number(conversationSentMatch[1]), await readBody(request)) });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/linkedin-connections" && request.method === "GET") {
      const database = db();
      const requestedProduct = url.searchParams.get("product") || "all";
      const requestedStatus = url.searchParams.get("status") || "all";
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 1000)));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const clauses = [];
      const params = [];
      if (["gnk", "outagehub", "morrow", "other"].includes(requestedProduct)) {
        clauses.push("primary_product=?"); params.push(requestedProduct);
      }
      if (["new", "reviewing", "qualified", "dismissed"].includes(requestedStatus)) {
        clauses.push("review_status=?"); params.push(requestedStatus);
      }
      if (query) {
        clauses.push("(lower(name) LIKE ? OR lower(headline) LIKE ?)");
        params.push(`%${query}%`, `%${query}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const connections = database.prepare(`SELECT * FROM linkedin_connections ${where}
        ORDER BY CASE primary_product WHEN 'other' THEN 1 ELSE 0 END,
        classification_score DESC,connected_on DESC,name LIMIT ? OFFSET ?`).all(...params, limit, offset).map((row) => ({
        ...row,
        product_scores: JSON.parse(row.product_scores || "{}"),
      }));
      const draftsByConnection = new Map();
      for (const draft of database.prepare("SELECT * FROM linkedin_connection_drafts ORDER BY connection_id,draft_type").all()) {
        if (!draftsByConnection.has(draft.connection_id)) draftsByConnection.set(draft.connection_id, {});
        draftsByConnection.get(draft.connection_id)[draft.draft_type] = draft;
      }
      for (const connection of connections) connection.message_drafts = draftsByConnection.get(connection.id) || {};
      const researchByConnection = new Map(database.prepare("SELECT * FROM linkedin_connection_research ORDER BY connection_id").all().map((row) => [row.connection_id, {
        ...row,
        source_urls: JSON.parse(row.source_urls || "[]"),
      }]));
      for (const connection of connections) connection.public_research = researchByConnection.get(connection.id) || null;
      const summary = database.prepare(`SELECT COUNT(*) total,
        SUM(profile_status IN ('direct','confirmed','crm_match')) direct_profiles,
        SUM(profile_status='search') search_routes,
        SUM(contacted_at IS NOT NULL) contacted,
        SUM(contacted_at IS NULL) not_contacted,
        SUM(linked_lead_id IS NOT NULL) existing_crm_matches
        FROM linkedin_connections ${where}`).get(...params);
      summary.by_product = Object.fromEntries(database.prepare(`SELECT primary_product,COUNT(*) count
        FROM linkedin_connections ${where} GROUP BY primary_product`).all(...params).map((row) => [row.primary_product, row.count]));
      summary.by_intent = Object.fromEntries(database.prepare(`SELECT relationship_intent,COUNT(*) count
        FROM linkedin_connections ${where} GROUP BY relationship_intent`).all(...params).map((row) => [row.relationship_intent, row.count]));
      summary.by_role = Object.fromEntries(database.prepare(`SELECT relationship_role,COUNT(*) count
        FROM linkedin_connections ${where} GROUP BY relationship_role`).all(...params).map((row) => [row.relationship_role, row.count]));
      summary.by_status = Object.fromEntries(database.prepare(`SELECT review_status,COUNT(*) count
        FROM linkedin_connections ${where} GROUP BY review_status`).all(...params).map((row) => [row.review_status, row.count]));
      sendJson(response, 200, { connections, summary, filtered: connections.length, limit, offset });
      return;
    }

    const connectionMatch = url.pathname.match(/^\/api\/linkedin-connections\/(\d+)$/);
    if (connectionMatch && request.method === "POST") {
      const database = db();
      const id = Number(connectionMatch[1]);
      const current = database.prepare("SELECT * FROM linkedin_connections WHERE id=?").get(id);
      if (!current) { sendJson(response, 404, { ok: false, error: "Connection not found." }); return; }
      const body = await readBody(request);
      const product = ["gnk", "outagehub", "morrow", "other"].includes(body.primary_product) ? body.primary_product : current.primary_product;
      const relationshipIntent = product === "gnk" ? "gnk_sell" : product === "outagehub" ? "outagehub_sell" : product === "morrow" ? "morrow_research" : "other";
      const relationshipRole = typeof body.relationship_role === "string" && body.relationship_role.trim()
        ? body.relationship_role.trim() : product !== current.primary_product
          ? (product === "morrow" ? "research_subject" : product === "other" ? "network_only" : "buyer_or_router")
          : current.relationship_role;
      const reviewStatus = ["new", "reviewing", "qualified", "dismissed"].includes(body.review_status) ? body.review_status : current.review_status;
      let profileUrl = current.profile_url;
      let profileStatus = current.profile_status;
      if (typeof body.profile_url === "string" && /^https:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[a-z0-9%_-]+\/?$/i.test(body.profile_url.trim())) {
        profileUrl = body.profile_url.trim();
        profileStatus = "confirmed";
      }
      const humanClassification = product !== current.primary_product || typeof body.classification_reason === "string";
      let contactedAt = current.contacted_at;
      let contactChannel = current.contact_channel;
      if (body.contacted === true) {
        contactedAt ||= new Date().toISOString();
        contactChannel = typeof body.contact_channel === "string" && body.contact_channel.trim() ? body.contact_channel.trim() : "linkedin";
      } else if (body.contacted === false) {
        contactedAt = null;
        contactChannel = null;
      }
      database.prepare(`UPDATE linkedin_connections SET primary_product=?,relationship_intent=?,relationship_role=?,review_status=?,profile_url=?,profile_status=?,
        classification_reason=?,classification_source=?,contacted_at=?,contact_channel=?,updated_at=? WHERE id=?`).run(
        product,
        relationshipIntent,
        relationshipRole,
        reviewStatus,
        profileUrl,
        profileStatus,
        typeof body.classification_reason === "string" ? body.classification_reason.trim() : current.classification_reason,
        humanClassification ? "human" : current.classification_source,
        contactedAt,
        contactChannel,
        new Date().toISOString(),
        id,
      );
      const updated = database.prepare("SELECT * FROM linkedin_connections WHERE id=?").get(id);
      sendJson(response, 200, { ok: true, connection: { ...updated, product_scores: JSON.parse(updated.product_scores || "{}") } });
      return;
    }

    if (url.pathname === "/api/leads.csv" && request.method === "GET") {
      const product = productPrefixFromUrl(url);
      const leads = await readLeads(product);
      response.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="salesv3-${product}-leads.csv"`
      });
      response.end(leadsToCsv(leads));
      return;
    }

    const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
    if (leadMatch && request.method === "POST") {
      const patch = await readBody(request);
      try {
        const lead = await updateLead(decodeURIComponent(leadMatch[1]), patch, productPrefixFromUrl(url));
        sendJson(response, 200, { ok: true, lead });
      } catch (error) {
        sendJson(response, 404, { ok: false, error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/ingest" && request.method === "POST") {
      const result = await ingestFromState(productPrefixFromUrl(url));
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (url.pathname === "/api/prospect" && request.method === "POST") {
      const product = productPrefixFromUrl(url);
      const plan = await recommendedProspectPlan(`${product}-pipeline-capacity`);
      const target = Number(url.searchParams.get("target") || plan.target_total_leads);
      const rounds = Number(url.searchParams.get("rounds") || plan.rounds_to_run || 6);
      const started = spawnTask(`${product} prospect`, ["src/prospect.js", product, String(target), String(rounds)]);
      sendJson(response, started ? 202 : 409, {
        ok: started,
        target,
        rounds,
        error: started ? undefined : "A task is already running."
      });
      return;
    }

    if (url.pathname === "/api/find-emails" && request.method === "POST") {
      const product = productPrefixFromUrl(url);
      const started = spawnTask(`${product} find-emails`, ["src/find-emails.js", product]);
      sendJson(response, started ? 202 : 409, {
        ok: started,
        error: started ? undefined : "A task is already running."
      });
      return;
    }

    if (url.pathname === "/api/task-status") {
      sendJson(response, 200, { activeTask });
      return;
    }

    // ---- lead memory (per-lead timeline + understanding) ----
    if (url.pathname === "/api/lead-memory" && request.method === "GET") {
      const product = productPrefixFromUrl(url);
      const leadId = url.searchParams.get("lead");
      if (leadId) {
        sendJson(response, 200, { ok: true, lead_id: leadId, ...(await leadMemory(product, leadId)) });
      } else {
        sendJson(response, 200, { ok: true, summary: await memorySummary(product) });
      }
      return;
    }

    const memMatch = url.pathname.match(/^\/api\/lead-memory\/([^/]+)$/);
    if (memMatch && request.method === "POST") {
      const product = productPrefixFromUrl(url);
      const leadId = decodeURIComponent(memMatch[1]);
      const body = await readBody(request);
      const type = body.type;
      if (!MEMORY_EVENT_TYPES.includes(type)) {
        sendJson(response, 400, { ok: false, error: `Unknown memory event type: ${type}` });
        return;
      }
      try {
        const canonicalType = { email_sent: "sent", reply: "reply", meeting: "meeting", outcome: "outcome" }[type];
        const event = canonicalType
          ? await recordRevenueEvent({ lead_id: leadId, type: canonicalType, source: "dashboard-manual", payload: body.payload || {} })
          : await appendMemory(product, { lead_id: leadId, type, actor: body.actor || "operator", payload: body.payload || {} });
        sendJson(response, 201, { ok: true, event, ...(await leadMemory(product, leadId)) });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    // ---- knowledge graph (ontology) ----
    if (url.pathname === "/api/ontology" && request.method === "GET") {
      const all = url.searchParams.get("product") === "all";
      const product = all ? null : productPrefixFromUrl(url);
      const graph = await loadGraph();
      const view = toGraphView(graph, product);
      sendJson(response, 200, { ok: true, ...view, summary: graphSummary(graph) });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

function listen(port) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`salesv3 dashboard: http://127.0.0.1:${port}/`);
    console.log("OpenClaw control UI: http://127.0.0.1:18789/");
  });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && server.requestedPort < maxPort) {
    const nextPort = server.requestedPort + 1;
    server.requestedPort = nextPort;
    listen(nextPort);
    return;
  }

  throw error;
});

server.requestedPort = preferredPort;
listen(preferredPort);
