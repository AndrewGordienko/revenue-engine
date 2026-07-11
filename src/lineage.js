import crypto from "node:crypto";
import { STRATEGY_VERSION } from "./sales-plays.js";

const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);
const safe = (value) => String(value || "triage").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : "gnk";
}

export function createPipelineLineage(database, {
  product,
  play_id = null,
  cohort_id = null,
  pipeline_run_id = null,
  stage = "ingest",
  strategy_version = STRATEGY_VERSION,
  note = null,
  metadata = {},
} = {}) {
  const normalizedProduct = normalizeProduct(product);
  const resolvedCohort = cohort_id || `${normalizedProduct}-${safe(play_id)}-${day()}`;
  const createdAt = now();
  database.prepare(`INSERT OR IGNORE INTO cohorts(cohort_id,product,strategy_version,play_id,status,created_at,note)
    VALUES(?,?,?,?,'draft',?,?)`).run(resolvedCohort, normalizedProduct, strategy_version, play_id, createdAt, note || "Unapproved pipeline cohort");
  const cohort = database.prepare("SELECT * FROM cohorts WHERE cohort_id=?").get(resolvedCohort);
  if (cohort.product !== normalizedProduct) throw new Error(`cohort ${resolvedCohort} belongs to ${cohort.product}, not ${normalizedProduct}`);
  if (cohort.strategy_version !== strategy_version) throw new Error(`cohort ${resolvedCohort} uses ${cohort.strategy_version}, not ${strategy_version}`);
  if (play_id && cohort.play_id && cohort.play_id !== play_id) throw new Error(`cohort ${resolvedCohort} is locked to ${cohort.play_id}, not ${play_id}`);

  const resolvedRun = pipeline_run_id || `run-${normalizedProduct}-${stage}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  database.prepare(`INSERT INTO pipeline_runs(pipeline_run_id,cohort_id,product,strategy_version,stage,status,started_at,metadata)
    VALUES(?,?,?,?,?,'running',?,?)`).run(resolvedRun, resolvedCohort, normalizedProduct, strategy_version, stage, createdAt, JSON.stringify(metadata));
  return { product: normalizedProduct, cohort_id: resolvedCohort, pipeline_run_id: resolvedRun, strategy_version, play_id: play_id || cohort.play_id || null, cohort_status: cohort.status };
}

export function completePipelineRun(database, pipelineRunId, status = "complete") {
  database.prepare("UPDATE pipeline_runs SET status=?, completed_at=? WHERE pipeline_run_id=?").run(status, now(), pipelineRunId);
}

export function approveCohort(database, cohortId, { approved_by = "operator", rules = {} } = {}) {
  const cohort = database.prepare("SELECT * FROM cohorts WHERE cohort_id=?").get(cohortId);
  if (!cohort) throw new Error(`unknown cohort: ${cohortId}`);
  if (!cohort.play_id) throw new Error("cohort approval requires exactly one play_id");
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) throw new Error("cohort approval requires a rules object");
  // Draft-only invariant: no cohort can opt into automatic sending, and every
  // message still requires individual human approval. These are forced on write
  // so a caller cannot approve a cohort into an auto-sending state.
  const safeRules = { ...rules, auto_send: false, human_message_approval_required: true };
  const approvedAt = now();
  database.prepare("UPDATE cohorts SET status='approved', rules=?, approved_at=?, approved_by=? WHERE cohort_id=?")
    .run(JSON.stringify(safeRules), approvedAt, approved_by, cohortId);
  return database.prepare("SELECT * FROM cohorts WHERE cohort_id=?").get(cohortId);
}

export function getCohort(database, cohortId) {
  return database.prepare("SELECT * FROM cohorts WHERE cohort_id=?").get(cohortId);
}
