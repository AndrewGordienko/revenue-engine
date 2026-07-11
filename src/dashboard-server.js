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
import { approveOutreachCohort, approveOutreachMessage, createProviderDraft, listCohorts, listOutreachMessages, queueOutreachMessage, rejectOutreachMessage, sendApprovedDraft, syncGmail } from "./outreach-queue.js";
import { GmailProvider, GoogleCalendarProvider, googleWorkspaceStatus } from "./google-workspace.js";
import { sendingEnabled } from "./outbound-guard.js";
import { buildAgentHealth } from "./agent-health.js";
import { bookMeeting, buildCallBrief, listMeetings, proposeMeetingTimes } from "./meetings.js";

const preferredPort = Number(process.env.PORT || 8792);
const maxPort = preferredPort + 20;
let activeRun = null;
let activeTask = null;

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : "gnk";
}

function productPrefixFromUrl(url) {
  return normalizeProduct(url.searchParams.get("product") || "gnk");
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
  const filePath = fromRoot("public", safePath === "/" ? "index.html" : safePath.slice(1));
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
    name: `${product === "outagehub" ? "OutageHub" : "GNK"} Pipeline`,
    output: ""
  };

  const child = spawn("node", ["src/run-sequence.js", product], {
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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

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
      sendJson(response, 200, { ...(await googleWorkspaceStatus()), outbound_sending_enabled: sendingEnabled(), mode: sendingEnabled() ? "sending" : "draft_only" });
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

    const outreachAction = url.pathname.match(/^\/api\/outreach-queue\/(\d+)\/(approve|reject|draft|send)$/);
    if (outreachAction && request.method === "POST") {
      const id = Number(outreachAction[1]);
      const action = outreachAction[2];
      const body = await readBody(request);
      if (action === "send" && !sendingEnabled()) {
        sendJson(response, 403, { ok: false, error: "Draft-only mode: outbound sending is disabled. Create a Gmail draft and send it yourself from Gmail." });
        return;
      }
      try {
        const result = action === "approve" ? approveOutreachMessage(id, body)
          : action === "reject" ? rejectOutreachMessage(id, body)
          : action === "draft" ? await createProviderDraft(id, new GmailProvider())
          : await sendApprovedDraft(id, new GmailProvider(), { confirmed: body.confirmed === true });
        sendJson(response, 200, { ok: true, result });
      } catch (error) { sendJson(response, 400, { ok: false, error: error.message }); }
      return;
    }

    if (url.pathname === "/api/gmail/sync" && request.method === "POST") {
      try { sendJson(response, 200, { ok: true, ...(await syncGmail(new GmailProvider())) }); }
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
