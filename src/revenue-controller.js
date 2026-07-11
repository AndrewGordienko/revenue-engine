// revenue-controller.js — the OpenClaw Revenue Controller capability.
//
// Registers a Gateway cron job that runs the ONE canonical orchestrator
// (`npm run smoke:live` -> runSmokeLive) on a schedule. The orchestrator itself
// is the supervisor: it monitors each agent, retries safe transient failures,
// stops hard on validation/play/evidence/identity/contact conflicts, writes the
// blocker to the shared status file, and NEVER approves a cohort/message or sends.
//
// The controller is installed DISABLED by default: scheduling revenue automation
// is an explicit operator choice. `run` triggers one supervised pass on demand
// (this is what the dashboard "Run live smoke" action and the credentialed test
// both use), so the CLI, the controller, and the dashboard share one code path.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromRoot } from "./paths.js";

const execFileAsync = promisify(execFile);
export const CONTROLLER_NAME = "salesv3-revenue-controller";
const DEFAULT_SCHEDULE = "0 9 * * 1-5"; // 9am weekdays (gateway local time)
const DEFAULT_ENABLED = true; // research/drafting is safe; approval and sending remain human-only
const RUN_TIMEOUT_SECONDS = "7200"; // model-backed research must not be killed by Cron's short default window

async function oc(args) {
  const { stdout } = await execFileAsync("openclaw", args, { cwd: fromRoot(), maxBuffer: 1024 * 1024 * 8 });
  return stdout;
}

// `cron list --all --json` prints a { jobs: [...] } object followed by a footer,
// so extract the first balanced object. `cron get --json` is NOT supported and
// `cron rm/get` key off the job ID, not the name — hence enumerate-by-name here.
function parseJobs(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < 0) return [];
  try { return JSON.parse(stdout.slice(start, end + 1)).jobs || []; } catch { return []; }
}
async function listControllerJobs() {
  const jobs = parseJobs(await oc(["cron", "list", "--all", "--json"]).catch(() => "{}"));
  return jobs.filter((j) => j.name === CONTROLLER_NAME);
}

export async function controllerStatus() {
  const jobs = await listControllerJobs();
  if (!jobs.length) return { installed: false, enabled: false, jobs: 0, job: null };
  return { installed: true, enabled: jobs.some((j) => j.enabled === true), jobs: jobs.length, job: jobs[0] };
}

export async function installController({ schedule = DEFAULT_SCHEDULE, enabled = DEFAULT_ENABLED } = {}) {
  // Idempotent: remove every existing controller job by id, then add exactly one.
  for (const job of await listControllerJobs()) await oc(["cron", "rm", job.id]).catch(() => {});
  const args = [
    "cron", "add", CONTROLLER_NAME,
    "--cron", schedule,
    "--command", "npm run smoke:live",
    "--command-cwd", fromRoot(),
    "--timeout-seconds", RUN_TIMEOUT_SECONDS,
    "--no-output-timeout-seconds", RUN_TIMEOUT_SECONDS,
    // There is no configured chat channel for this operational job. Status is
    // persisted to CRM/dashboard state, so a delivery failure must never turn a
    // successful revenue loop into a failed controller task.
    "--no-deliver",
    "--description", "salesv3 canonical live-smoke orchestrator (preflight -> init -> gnk -> outagehub -> report). Draft-only; stops at human approval; never sends.",
  ];
  if (!enabled) args.push("--disabled");
  await oc(args);
  return controllerStatus();
}

// Trigger one supervised pass now (debug/on-demand). Uses the Gateway's own
// cron-run so the controller and the manual path are identical.
export async function runControllerNow() {
  const jobs = await listControllerJobs();
  if (!jobs.length) {
    throw new Error(`Revenue Controller is not installed. Run \`npm run controller:install\` first.`);
  }
  // OpenClaw's `cron run` takes the immutable job id, not the display name.
  // Keeping this lookup here makes an idempotent reinstall safe: installController
  // replaces the job and therefore its id, while dashboard/on-demand runs keep
  // working without any copied identifier.
  // Do not wait on the CLI connection: `cron run --wait` is bounded separately
  // from the command job and can report a false timeout while the gateway is
  // still running the child process. The shared smoke status is the live,
  // durable source of progress for both the dashboard and the controller.
  return oc(["cron", "run", jobs[0].id]);
}

export async function removeController() {
  const jobs = await listControllerJobs();
  for (const job of jobs) await oc(["cron", "rm", job.id]).catch(() => {});
  return { removed: jobs.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "status";
  const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const disable = process.argv.includes("--disabled");
  const schedule = flag("--schedule") || DEFAULT_SCHEDULE;
  const run = async () => {
    if (cmd === "install") return installController({ schedule, enabled: !disable });
    if (cmd === "run") return runControllerNow();
    if (cmd === "remove") return removeController();
    return controllerStatus();
  };
  run()
    .then((r) => console.log(typeof r === "string" ? r : JSON.stringify(r, null, 2)))
    .catch((error) => { console.error(error.message); process.exit(1); });
}
