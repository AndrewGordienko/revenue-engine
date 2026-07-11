// smoke-live-run.js — the ONE canonical live-smoke orchestrator.
//
// Turns the four manual CLI steps into a single idempotent, resume-safe entry
// point (`npm run smoke:live`). The SAME function is called by the OpenClaw
// Revenue Controller (cron) and by the dashboard "Run live smoke" action, so
// there is exactly one operating path.
//
// Stages (each resume-safe — a re-run skips stages whose CRM state is already
// satisfied): preflight -> init -> gnk full pipeline -> outagehub full pipeline
// -> final report. The `full` pipeline already runs strategy:refresh (freshness-
// aware) + cohort:build + lead:prepare + auto ingest + auto promote.
//
// It NEVER approves a cohort, approves a message, or sends. It stops hard on any
// validation / play / evidence / identity / contact conflict and writes the
// blocker to the shared status file the dashboard reads. It retries only safe
// transient failures (capacity / rate-limit / timeout / network).
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { db } from "./db.js";
import { readState } from "./bus.js";
import { fromRoot } from "./paths.js";
import {
  loadManifest, validateManifest, initLiveSmoke, assertManifestScope,
  cohortIdFor, cohortGroupFor,
} from "./smoke-live.js";
import { checkPlayConsistency } from "./play-consistency.js";
import { accountStage, isLoopComplete } from "./loop-status.js";
import { buildLiveLoopReport } from "./live-loop-report.js";
import { normalizeProduct } from "./lineage.js";

const execFileAsync = promisify(execFile);
const now = () => new Date().toISOString();
// Tests and isolated environments can override this; production always uses the
// dashboard-visible artifact path. This prevents fixture runs from ever
// overwriting a live controller's operational status.
const STATUS_PATH = () => process.env.SMOKE_LIVE_STATUS_PATH || fromRoot("data", "artifacts", "smoke-live-status.json");
const MAX_TRANSIENT_RETRIES = 2;
let activeRunControl = null;

// ---- shared status file (dashboard + controller read this) ------------------
export function readSmokeStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_PATH(), "utf8")); } catch { return null; }
}
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
// A persisted `active: true` is only authoritative while the orchestrator PID
// exists. This lets the dashboard recover safely after an OS/gateway kill
// rather than leaving operators with a permanently disabled Resume button.
export function isSmokeRunActive(status = readSmokeStatus()) {
  return Boolean(status?.active && isPidAlive(status.runner_pid));
}
function writeStatus(status) {
  try { fs.writeFileSync(STATUS_PATH(), JSON.stringify(status, null, 2) + "\n"); } catch { /* best-effort */ }
  return status;
}

// The command runner can be terminated by the gateway or a deploy. Record a
// durable, actionable blocker synchronously before the process exits so the
// next controller/dashboard invocation can resume from completed stages.
export function interruptActiveRun(signal = "SIGTERM") {
  const control = activeRunControl;
  if (!control?.status?.active) return false;
  const { status, mark, stage } = control;
  const key = status.current_stage;
  if (key && key !== "preflight" && key !== "report") {
    stage(key, { status: "interrupted", error: `orchestrator interrupted by ${signal}`, ended_at: now() });
  }
  status.blockers.push({
    type: "interrupted", human: "operator",
    detail: `OpenClaw controller interrupted by ${signal}; no approval or send was performed. Resume is safe.`,
  });
  mark({ active: false, current_stage: "interrupted", current_agent: null, note: "interrupted — resume safely from completed stages" });
  return true;
}

// ---- classification of a failed pipeline subprocess -------------------------
// Match only an explicit hard-gate failure. Agent prompts routinely contain words
// such as "identity", "evidence", and "lineage", so treating their mere
// presence in captured stdout as a conflict would turn harmless model failures
// into false human blockers.
const CONFLICT_RE = /FAILED CLOSED|play consistency|invalid .*manifest|cross-cohort|strategy_version mismatch|(?:identity|evidence|contact) (?:conflict|mismatch|validation|gate failed)|lineage (?:conflict|mismatch|validation)|contains non-manifest/i;
// Model-format errors are retryable just like a rate limit: the source material
// and gates are unchanged, and a fresh completion can produce valid JSON.
const TRANSIENT_RE = /capacity|rate.?limit|temporarily unavailable|overloaded|\b429\b|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network|socket hang up|timed out|Expected double-quoted property name in JSON|Agent response did not contain a JSON object/i;
export function classifyFailure(text) {
  if (CONFLICT_RE.test(text)) return "conflict";   // human judgment required — stop
  if (TRANSIENT_RE.test(text)) return "transient"; // safe to retry
  return "error";                                   // unknown — stop, surface
}

// ---- credential readiness (never prints secrets) ----------------------------
export async function checkCredentials() {
  if (process.env.SMOKE_LIVE_SKIP_CRED_CHECK === "1") return { ok: true, detail: "skipped (SMOKE_LIVE_SKIP_CRED_CHECK=1)" };
  try {
    const { stdout } = await execFileAsync("openclaw", ["models", "status"], { maxBuffer: 1024 * 1024 * 4 });
    const usable = /status=usable/i.test(stdout) || /via codex uses .*usable/i.test(stdout);
    if (usable) return { ok: true, detail: "openclaw reports a usable model provider" };
    const hasProvider = /effective=/.test(stdout);
    return {
      ok: false,
      detail: hasProvider ? "a provider is configured but not reported usable" : "no usable model provider configured",
      missing: "a usable OpenAI/model provider — run `openclaw configure` (or set OPENAI_API_KEY) and `openclaw models status`",
    };
  } catch (error) {
    return { ok: false, detail: `openclaw CLI not reachable: ${String(error.message).slice(0, 140)}`, missing: "the OpenClaw gateway/CLI — run `openclaw status` / `openclaw doctor --fix`" };
  }
}

// ---- preflight (deterministic; no agents) -----------------------------------
export async function preflight(database = db(), manifest = loadManifest()) {
  const checks = [];
  const blockers = [];

  const mv = validateManifest(manifest);
  checks.push({ name: "manifest_valid", ok: mv.ok, detail: mv.ok ? `${manifest.length} accounts, one per play` : mv.problems.join("; ") });
  if (!mv.ok) blockers.push({ type: "manifest", human: "operator", detail: mv.problems });

  let pc = { ok: false, blocking: [{ reason: "not evaluated" }] };
  try { pc = checkPlayConsistency(database, manifest); } catch (error) { pc = { ok: false, blocking: [{ reason: error.message }] }; }
  checks.push({ name: "play_consistency", ok: pc.ok, detail: pc.ok ? "all accounts reconciled" : pc.blocking.map((b) => `${b.company || "?"}: ${b.reason}`).join("; ") });
  if (!pc.ok) blockers.push({ type: "play_conflict", human: "operator", detail: pc.blocking });

  const cred = await checkCredentials();
  checks.push({ name: "credentials", ok: cred.ok, detail: cred.detail, missing: cred.missing });
  if (!cred.ok) blockers.push({ type: "credentials", human: "operator", detail: cred.missing });

  return { ok: checks.every((c) => c.ok), checks, blockers };
}

// ---- per-account / per-brand completion (resume-safe predicates) ------------
function brandAccounts(manifest, brand) {
  return manifest.filter((a) => normalizeProduct(a.product) === brand);
}
function accountLead(database, account) {
  const product = normalizeProduct(account.product);
  const row = database.prepare("SELECT id FROM leads WHERE company_domain=? AND product=? AND cohort_id=?").get(account.domain, product, cohortIdFor({ ...account, product }));
  return row ? database.prepare("SELECT * FROM leads WHERE id=?").get(row.id) : null;
}
function completedAccounts(database, manifest) {
  return manifest.filter((account) => {
    const lead = accountLead(database, account);
    return lead && isLoopComplete(accountStage(database, lead));
  }).map((account) => account.company);
}
function scopeLabel(manifest, brand) {
  return brandAccounts(manifest, brand).map((account) => account.company).join(", ");
}
function initComplete(database, manifest) {
  return manifest.every((a) => accountLead(database, a));
}
async function brandComplete(database, manifest, brand) {
  const state = await readState();
  const reviewer = state.artifacts?.[`${brand}-email-sequence-reviewer`]?.improved_person_email_sequences || [];
  const mentioned = new Set(reviewer.map((s) => String(s.company || "").toLowerCase().trim()));
  return brandAccounts(manifest, brand).every((a) => {
    const lead = accountLead(database, a);
    if (!lead) return false;
    const stage = accountStage(database, lead, { reviewedSequence: mentioned.has(String(a.company).toLowerCase().trim()) });
    return isLoopComplete(stage); // reached pending_approval (the human gate)
  });
}

// ---- run one brand's `full` pipeline as a supervised subprocess -------------
function runPipelineOnce(product, cohort, resumeSince, onData) {
  return new Promise((resolve) => {
    const args = ["src/run-pipeline.js", "full", product, "--cohort", cohort];
    if (resumeSince) args.push("--resume-since", resumeSince);
    const child = spawn("node", args,
      { cwd: fromRoot(), env: { ...process.env, LIVE_SMOKE: "1" } });
    let output = "";
    const collect = (chunk) => { const s = chunk.toString(); output += s; if (onData) onData(s); process.stdout.write(s); };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => resolve({ code, output }));
    child.on("error", (error) => resolve({ code: 1, output: `${output}\nspawn error: ${error.message}` }));
  });
}

// Retry only genuine transient failures; stop hard on conflicts / unknown errors.
async function runBrandSupervised(product, cohort, resumeSince, mark) {
  for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES + 1; attempt++) {
    mark({ current_stage: `${product}_pipeline`, current_attempt: attempt });
    const { code, output } = await runPipelineOnce(product, cohort, resumeSince, (s) => {
      const m = s.match(/\[pipeline\] → (\S+)/);
      if (m) mark({ current_agent: m[1] });
    });
    if (code === 0) return { ok: true, attempts: attempt };
    const kind = classifyFailure(output);
    if (kind === "transient" && attempt <= MAX_TRANSIENT_RETRIES) {
      mark({ note: `${product} transient failure (attempt ${attempt}) — retrying` });
      continue;
    }
    const tail = output.split("\n").filter(Boolean).slice(-6).join("\n");
    return { ok: false, kind, attempts: attempt, error: tail };
  }
  return { ok: false, kind: "transient", error: "exhausted transient retries" };
}

// ---- the orchestrator -------------------------------------------------------
export async function runSmokeLive({ database = db(), manifest = loadManifest(), startedAt = now() } = {}) {
  const previous = readSmokeStatus();
  const resumeSince = previous?.current_stage === "interrupted" ? previous.started_at : null;
  const status = {
    started_at: startedAt, updated_at: startedAt, active: true,
    runner_pid: process.pid,
    current_stage: "preflight", current_agent: null, current_attempt: null,
    current_account: null, completed_accounts: [], total_accounts: manifest.length,
    resumed_from: resumeSince,
    stages: [], blockers: [], preflight: null, report: null, note: null,
  };
  const t0 = Date.now();
  const mark = (patch = {}) => {
    Object.assign(status, patch);
    status.completed_accounts = completedAccounts(database, manifest);
    status.updated_at = now();
    status.elapsed_ms = Date.now() - t0;
    writeStatus(status);
  };
  const stage = (key, patch) => {
    const existing = status.stages.find((s) => s.key === key);
    if (existing) Object.assign(existing, patch);
    else status.stages.push({ key, ...patch });
    mark();
  };
  activeRunControl = { status, mark, stage };
  mark();

  // 1) PREFLIGHT — hard gate. Never runs an agent if this fails.
  const pf = await preflight(database, manifest);
  status.preflight = pf;
  stage("preflight", { status: pf.ok ? "ok" : "blocked", ended_at: now() });
  if (!pf.ok) {
    status.blockers = pf.blockers;
    mark({ active: false, current_stage: "blocked", note: "preflight failed — resolve blockers before running" });
    activeRunControl = null;
    return status;
  }

  // 2) INIT — seed the six manifest cohorts (idempotent upsert).
  if (initComplete(database, manifest)) {
    stage("init", { status: "skipped", detail: "manifest cohorts already seeded", ended_at: now() });
  } else {
    stage("init", { status: "running", started_at: now() });
    try {
      const { groups, retired } = await initLiveSmoke(manifest, database);
      for (const group of groups) {
        const scope = assertManifestScope(database, group, manifest);
        if (!scope.ok) throw new Error(`cohort group ${group} contains non-manifest leads: ${scope.leaked.join(", ")}`);
      }
      const retiredNote = retired?.length ? ` · retired ${retired.length} stale (${retired.map((r) => r.domain).join(", ")})` : "";
      stage("init", { status: "ok", detail: `seeded ${groups.length} cohort groups${retiredNote}`, retired: retired || [], ended_at: now() });
    } catch (error) {
      status.blockers.push({ type: "init", human: "operator", detail: error.message });
      stage("init", { status: "blocked", error: error.message, ended_at: now() });
      mark({ active: false, current_stage: "blocked" });
      activeRunControl = null;
      return status;
    }
  }

  // 3+4) BRAND PIPELINES — gnk then outagehub, each resume-safe & supervised.
  for (const brand of ["gnk", "outagehub"]) {
    const group = cohortGroupFor(brand);
    if (await brandComplete(database, manifest, brand)) {
      stage(`${brand}_pipeline`, { status: "skipped", detail: "all brand accounts already at pending_approval", ended_at: now() });
      continue;
    }
    const currentAccount = `${brand === "gnk" ? "GNK" : "OutageHub"} cohort: ${scopeLabel(manifest, brand)}`;
    stage(`${brand}_pipeline`, { status: "running", current_account: currentAccount, started_at: now() });
    mark({ current_account: currentAccount });
    const result = await runBrandSupervised(brand, group, resumeSince, mark);
    if (!result.ok) {
      const type = result.kind === "conflict" ? "conflict" : "pipeline_error";
      status.blockers.push({ type, brand, human: result.kind === "conflict" ? "operator" : "engineer", detail: result.error });
      stage(`${brand}_pipeline`, { status: "blocked", attempts: result.attempts, error: result.error, ended_at: now() });
      mark({ active: false, current_stage: "blocked", current_agent: null });
      activeRunControl = null;
      return status; // stop hard — do not proceed to the next brand on an unresolved blocker
    }
    stage(`${brand}_pipeline`, { status: "ok", attempts: result.attempts, ended_at: now() });
  }

  // 5) FINAL REPORT — loop-status vocabulary (loop_complete, NOT closed/won).
  mark({ current_stage: "report", current_agent: null, current_account: null });
  const report = await buildLiveLoopReport(database, manifest);
  status.report = report.verdict;
  stage("report", { status: "ok", ended_at: now() });
  mark({
    active: false,
    current_stage: "done",
    current_account: null,
    note: `loop_complete ${report.verdict.loop_complete_accounts}/${report.verdict.of}; draft_only ${report.verdict.draft_only_intact ? "intact" : "VIOLATED"}; won ${report.verdict.won_accounts}`,
  });
  activeRunControl = null;
  return status;
}

// ---- CLI (debug entry; the product path is the controller/dashboard) --------
if (import.meta.url === `file://${process.argv[1]}`) {
  const onSignal = (signal) => {
    interruptActiveRun(signal);
    process.exit(143);
  };
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("SIGINT", () => onSignal("SIGINT"));
  runSmokeLive()
    .then((status) => {
      console.log("\n=== smoke:live final status ===");
      console.log(JSON.stringify({ active: status.active, current_stage: status.current_stage, blockers: status.blockers, report: status.report, note: status.note }, null, 2));
      process.exit(status.blockers.length ? 1 : 0);
    })
    .catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}
