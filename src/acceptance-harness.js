// Agent acceptance harness. Computes the parts of the scorecard that are
// deterministic and static (schema, identity, stability of deterministic
// decisions, downstream field consumption, engineering gates). The dimensions
// that need a live LLM run (grounding, model cost, runtime, 3x decision
// stability of an LLM agent) are computed by stabilityScore() over real artifact
// runs once they exist — see run-acceptance.js.
import fs from "node:fs";
import path from "node:path";
import { assignPlay } from "./wire-plan.js";
import { scoreLead } from "./scoring.js";
import { SALES_PLAYS } from "./sales-plays.js";

const root = process.cwd();
const PLAY_BRAND = Object.fromEntries(SALES_PLAYS.map((p) => [p.play_id, p.brand]));

export function loadBenchmark() {
  const file = path.join(root, "benchmark", "accounts.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).fixtures;
}

// --- deterministic decision benchmark (play classifier) --------------------
export function classifierBenchmark(fixtures = loadBenchmark()) {
  let goodFitTotal = 0, goodFitCorrect = 0, crossBrandLeaks = 0;
  const missingEmailSendReady = [];
  for (const f of fixtures) {
    const { play_id } = assignPlay(f);
    if (PLAY_BRAND[play_id] !== f.product) crossBrandLeaks++;
    if (f.label === "good_fit") { goodFitTotal++; if (play_id === f.expected_play) goodFitCorrect++; }
    // A missing-email account must never look send-ready.
    if (f.label === "missing_email" && f.email_best) missingEmailSendReady.push(f.id);
  }
  return {
    good_fit_total: goodFitTotal,
    good_fit_correct: goodFitCorrect,
    good_fit_accuracy: goodFitTotal ? goodFitCorrect / goodFitTotal : null,
    cross_brand_leaks: crossBrandLeaks,
    missing_email_send_ready: missingEmailSendReady.length,
  };
}

// --- repeated-run stability (generic; ≥2 of 3 agreement) -------------------
// runs: array (one per repeat) of arrays of { id, decision }. Returns the
// fraction of ids whose most common decision appears in >= ceil(2/3 * n) runs.
export function stabilityScore(runs) {
  const n = runs.length;
  if (n === 0) return { stable_fraction: null, threshold: 0 };
  const threshold = Math.ceil((2 / 3) * n);
  const byId = new Map();
  for (const run of runs) for (const { id, decision } of run) {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(JSON.stringify(decision));
  }
  let stable = 0;
  for (const decisions of byId.values()) {
    const counts = {};
    for (const d of decisions) counts[d] = (counts[d] || 0) + 1;
    if (Math.max(...Object.values(counts)) >= threshold) stable++;
  }
  return { stable_fraction: byId.size ? stable / byId.size : null, threshold, items: byId.size };
}

// The deterministic scorer must be perfectly stable across reruns.
export function deterministicScoreStability(fixtures = loadBenchmark()) {
  const runs = [1, 2, 3].map(() => fixtures.map((f) => ({
    id: f.id,
    decision: { play: assignPlay(f).play_id, score: scoreLead({ product: f.product, title: f.title, research: f }, null).score },
  })));
  return stabilityScore(runs);
}

// --- downstream field consumption ------------------------------------------
function repoCorpus() {
  const files = new Map();
  const agentsDir = path.join(root, "agents");
  for (const dir of fs.readdirSync(agentsDir)) {
    const p = path.join(agentsDir, dir, "instructions.md");
    if (fs.existsSync(p)) files.set(`agents/${dir}`, fs.readFileSync(p, "utf8"));
  }
  for (const base of ["src", "public"]) {
    const d = path.join(root, base);
    for (const name of fs.readdirSync(d)) {
      if (/\.(js|mjs)$/.test(name)) files.set(`${base}/${name}`, fs.readFileSync(path.join(d, name), "utf8"));
    }
  }
  return files;
}

// Conventional envelope fields present on almost every artifact; not orphans.
const ENVELOPE = new Set(["source_notes", "claims_to_avoid", "open_questions", "evidence_gaps", "input_status"]);

export function fieldConsumptionReport(registry) {
  const corpus = repoCorpus();
  const report = [];
  for (const agent of registry.agents) {
    const own = `agents/${agent.slug}`;
    const unconsumed = [];
    for (const field of agent.outputs || []) {
      if (ENVELOPE.has(field)) continue;
      let consumed = false;
      for (const [name, content] of corpus) {
        if (name === own) continue;
        if (content.includes(`"${field}"`) || content.includes(`.${field}`) || content.includes(`'${field}'`)) { consumed = true; break; }
      }
      if (!consumed) unconsumed.push(field);
    }
    report.push({ slug: agent.slug, criticalPath: agent.criticalPath, unconsumed_fields: unconsumed });
  }
  return report;
}

// --- engineering gates ------------------------------------------------------
export function engineeringGates(registry, fixtures = loadBenchmark()) {
  const cls = classifierBenchmark(fixtures);
  const stability = deterministicScoreStability(fixtures);
  const criticalLead = registry.agents.filter((a) => a.criticalPath && a.executionTier === "lead");
  const controlOnCritical = registry.agents.filter((a) => a.criticalPath && a.executionTier === "control");
  const missingEmailFixtures = fixtures.filter((f) => f.label === "missing_email");

  const gates = [
    { gate: "per-lead critical path <= 6 model calls", pass: criticalLead.length <= 6, detail: `${criticalLead.length} lead-tier critical agents` },
    { gate: "no cross-brand sales-play leakage", pass: cls.cross_brand_leaks === 0, detail: `${cls.cross_brand_leaks} leaks` },
    { gate: "strategy agents never on the critical path", pass: controlOnCritical.length === 0, detail: `${controlOnCritical.length} control agents on critical path` },
    { gate: "zero guessed emails marked send-ready", pass: cls.missing_email_send_ready === 0 && missingEmailFixtures.every((f) => !f.email_best), detail: `${cls.missing_email_send_ready} send-ready without evidence` },
    { gate: "deterministic decisions stable (>= 2/3)", pass: stability.stable_fraction === 1, detail: `stable_fraction=${stability.stable_fraction}` },
    { gate: "classifier good-fit accuracy >= 0.9", pass: (cls.good_fit_accuracy ?? 0) >= 0.9, detail: `accuracy=${(cls.good_fit_accuracy ?? 0).toFixed(3)}` },
  ];
  return { gates, all_pass: gates.every((g) => g.pass), classifier: cls, stability };
}
