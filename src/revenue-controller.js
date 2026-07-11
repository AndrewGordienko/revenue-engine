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
const DEFAULT_SCHEDULE = "0 9 * * 1-5"; // 9am weekdays; disabled until the operator enables it

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

export async function installController({ schedule = DEFAULT_SCHEDULE, enabled = false } = {}) {
  // Idempotent: remove every existing controller job by id, then add exactly one.
  for (const job of await listControllerJobs()) await oc(["cron", "rm", job.id]).catch(() => {});
  const args = [
    "cron", "add", CONTROLLER_NAME,
    "--cron", schedule,
    "--command", "npm run smoke:live",
    "--command-cwd", fromRoot(),
    "--description", "salesv3 canonical live-smoke orchestrator (preflight -> init -> gnk -> outagehub -> report). Draft-only; stops at human approval; never sends.",
  ];
  if (!enabled) args.push("--disabled");
  await oc(args);
  return controllerStatus();
}

// Trigger one supervised pass now (debug/on-demand). Uses the Gateway's own
// cron-run so the controller and the manual path are identical.
export async function runControllerNow() {
  return oc(["cron", "run", CONTROLLER_NAME]);
}

export async function removeController() {
  const jobs = await listControllerJobs();
  for (const job of jobs) await oc(["cron", "rm", job.id]).catch(() => {});
  return { removed: jobs.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "status";
  const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const enable = process.argv.includes("--enable");
  const schedule = flag("--schedule") || DEFAULT_SCHEDULE;
  const run = async () => {
    if (cmd === "install") return installController({ schedule, enabled: enable });
    if (cmd === "run") return runControllerNow();
    if (cmd === "remove") return removeController();
    return controllerStatus();
  };
  run()
    .then((r) => console.log(typeof r === "string" ? r : JSON.stringify(r, null, 2)))
    .catch((error) => { console.error(error.message); process.exit(1); });
}
