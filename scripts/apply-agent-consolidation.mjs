// PR3 agent consolidation. Rewires the lead-tier critical path to be
// self-consistent once the superseded agents are off the live path:
//   - email-drafter becomes the UNIFIED sequence writer (produces the full
//     per-person sequence; drops deps on sequence-strategy and outreach-angle).
//   - email-sequence-reviewer reviews the unified writer's output (drops deps on
//     email-sequence-drafter, sequence-strategy, outreach-angle).
//   - client-dossier becomes the Commercial Dossier (absorbs the outreach angle).
//   - outreach-angle / email-sequence-drafter / sequence-strategy are marked
//     superseded (kept registered as knowledge agents, off the live path).
// Idempotent.
import fs from "node:fs";
import path from "node:path";

const registryPath = path.join(process.cwd(), "agents", "registry.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const bySlug = new Map(registry.agents.map((a) => [a.slug, a]));

const WRITER_OUTPUTS = ["sequence_draft_summary", "person_email_sequences", "company_sequence_maps", "recommended_send_order", "global_send_rules", "claims_to_avoid", "source_notes"];
const DOSSIER_ANGLE_OUTPUTS = ["recommended_angle", "claims_allowed", "claims_forbidden"];

function dropDeps(agent, suffixes) {
  agent.dependsOn = (agent.dependsOn || []).filter((dep) => !suffixes.some((suffix) => dep.endsWith(suffix)));
}
function markSuperseded(agent) {
  if (!agent.role.startsWith("[Superseded")) agent.role = `[Superseded — off the live path] ${agent.role}`;
}

for (const brand of ["gnk", "outagehub"]) {
  const drafter = bySlug.get(`${brand}-email-drafter`);
  const reviewer = bySlug.get(`${brand}-email-sequence-reviewer`);
  const dossier = bySlug.get(`${brand}-client-dossier`);

  // Unified sequence writer.
  dropDeps(drafter, ["-sequence-strategy", "-outreach-angle"]);
  drafter.outputs = WRITER_OUTPUTS;
  drafter.role = `Unified sequence writer: produce the complete ${brand === "gnk" ? "four" : "five"}-touch per-person sequence on the deterministic skeleton, grounded in the Commercial Dossier and verified contact.`;

  // Reviewer now reviews the unified writer only.
  dropDeps(reviewer, ["-email-sequence-drafter", "-sequence-strategy", "-outreach-angle"]);
  reviewer.role = `Adversarial reviewer: verify grounding, trust, buyer fit, progression, and risk on the unified writer's ${brand === "gnk" ? "four" : "five"}-touch sequences; only 'ready' passes.`;

  // Commercial Dossier absorbs the outreach angle.
  dossier.outputs = [...new Set([...(dossier.outputs || []), ...DOSSIER_ANGLE_OUTPUTS])];
  dossier.role = "Commercial Dossier: synthesize company, person, role, trigger, owned workflow, buyer/router, problem hypothesis, offer, first outcome, proof available/missing, contact evidence, allowed/forbidden claims, and the recommended angle in one output.";

  // Contact/evidence verification does not need the outreach angle.
  dropDeps(bySlug.get(`${brand}-email-finder`), ["-outreach-angle"]);

  // Superseded knowledge agents.
  markSuperseded(bySlug.get(`${brand}-outreach-angle`));
  markSuperseded(bySlug.get(`${brand}-email-sequence-drafter`));
  markSuperseded(bySlug.get(`${brand}-sequence-strategy`));
}

fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

// Report the critical-path deps so we can eyeball self-consistency.
for (const brand of ["gnk", "outagehub"]) {
  for (const suffix of ["client-dossier", "email-drafter", "email-sequence-reviewer"]) {
    const a = bySlug.get(`${brand}-${suffix}`);
    console.log(`${a.slug}: dependsOn = [${(a.dependsOn || []).join(", ")}]`);
  }
}
