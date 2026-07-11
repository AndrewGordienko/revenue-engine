// Six-account draft-only smoke harness. DETERMINISTIC mode: exercises the real
// CRM lineage, outreach approval queue, and pipeline reporting end-to-end using
// synthetic agent artifacts (Commercial Dossier + unified-writer sequence built
// in code), so it runs in CI without any OpenClaw credentials or LLM calls.
// It never approves a message, never creates a Gmail draft, and never sends.
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { upsertLeads } from "./leads-store.js";
import { setStage, getLead, sendEligibility } from "./crm-model.js";
import { approveOutreachCohort, queueOutreachMessage, listOutreachMessages } from "./outreach-queue.js";
import { getCohort } from "./lineage.js";
import { buildPipelineReport } from "./pipeline-report.js";
import { sequenceSkeleton } from "./sequence-skeleton.js";
import { PLAYS_BY_ID, STRATEGY_VERSION } from "./sales-plays.js";

const now = () => new Date().toISOString();
const firstName = (name) => String(name || "there").trim().split(/\s+/)[0];

// One reserved-domain account per sales play: 3 GNK + 3 OutageHub.
export const SMOKE_ACCOUNTS = [
  { product: "gnk", play_id: "GNK-AI-01", company: "Northstar AI", domain: "northstar-ai.example", name: "Alex Reed", title: "VP Engineering", jurisdiction: "US", trigger: "launched an agentic AI workflow product and is hiring ML engineers", trigger_source: "https://northstar-ai.example/blog/agentic-launch", buyer_route: "VP Engineering owns the production AI workflow" },
  { product: "gnk", play_id: "GNK-BE-01", company: "Harbour Systems", domain: "harbour-systems.example", name: "Priya Shah", title: "VP Engineering", jurisdiction: "US", trigger: "published a public incident report and is running a backend reliability migration", trigger_source: "https://harbour-systems.example/status/incident-2026", buyer_route: "VP Engineering owns platform reliability" },
  { product: "gnk", play_id: "GNK-DATA-01", company: "Ops Ledger", domain: "ops-ledger.example", name: "Sam Okafor", title: "COO", jurisdiction: "US", trigger: "described a manual reconciliation workflow crossing spreadsheets in a public talk", trigger_source: "https://ops-ledger.example/talks/operations-scale", buyer_route: "COO owns the operations workflow" },
  { product: "outagehub", play_id: "OHUB-ISP-01", company: "Northern ISP", domain: "northern-isp.example", name: "Dana Fournier", title: "NOC Manager", jurisdiction: "CA", trigger: "expanded its regional fibre footprint and cited outage triage load in a hiring post", trigger_source: "https://northern-isp.example/careers/noc-analyst", buyer_route: "NOC Manager owns triage and customer comms" },
  { product: "outagehub", play_id: "OHUB-EMBED-01", company: "FacilitySoft", domain: "facilitysoft.example", name: "Robin Lau", title: "VP Product", jurisdiction: "CA", trigger: "announced a Canadian facilities platform roadmap needing external power-event context", trigger_source: "https://facilitysoft.example/roadmap", buyer_route: "VP Product owns the embedded integration decision" },
  { product: "outagehub", play_id: "OHUB-FAC-01", company: "ColdChain Co", domain: "coldchain-co.example", name: "Morgan Blake", title: "Facilities Director", jurisdiction: "CA", trigger: "operates a multi-site cold-storage portfolio and posted about outage escalation gaps", trigger_source: "https://coldchain-co.example/news/resilience", buyer_route: "Facilities Director owns site escalation" },
];

function leadRecord(account) {
  const email = `${account.title.toLowerCase().replace(/[^a-z]+/g, ".")}@${account.domain}`;
  return {
    name: account.name, title: account.title, company: account.company, company_domain: account.domain,
    product: account.product, play_id: account.play_id,
    email_best: email, email_status: "found", verified: true,
    address_found_or_guessed: "verified", email_source_type: "published", email_source_url: `https://${account.domain}/team`,
    deliverability_status: "deliverable", deliverability_checked_at: now(), recipient_jurisdiction: account.jurisdiction,
    legal_basis: "published_business_address",
    legal_basis_evidence: { source_url: `https://${account.domain}/team`, address_published: true, role_relevant: true, no_solicitation_statement: false },
    source_url: account.trigger_source, why_this_person: account.buyer_route, trigger_event: account.trigger,
  };
}

export async function seedSmokeAccounts(database = db()) {
  const seeded = [];
  for (const account of SMOKE_ACCOUNTS) {
    const cohortId = `${account.product}-${account.play_id.toLowerCase()}-smoke`;
    await upsertLeads([leadRecord(account)], account.product, { cohort_id: cohortId, play_id: account.play_id, strategy_version: STRATEGY_VERSION, stage: "smoke", note: `smoke ${account.play_id}` });
    const lead = database.prepare("SELECT * FROM leads WHERE company_domain=? AND product=?").get(account.domain, account.product);
    setStage(database, lead.id, "researched");
    setStage(database, lead.id, "route_ready");
    approveOutreachCohort(cohortId, { approved_by: "smoke", rules: { play_id: account.play_id } }, database);
    seeded.push({ account, lead_id: lead.id, cohort_id: cohortId });
  }
  return seeded;
}

function buildDossier(lead, account) {
  const play = PLAYS_BY_ID[account.play_id];
  return {
    company: account.company, person_name: account.name, play_id: account.play_id,
    trigger: account.trigger, trigger_source: account.trigger_source,
    buyer_or_router: account.buyer_route,
    problem_hypothesis: play?.problem_hypothesis || "",
    offer: play?.first_offer || "", first_outcome: (play?.success_metrics || [])[0] || "",
    proof_available: (play?.proof_required || []).slice(0, 2), proof_missing: [],
    contact_evidence: { email: lead.email_best, source: lead.email_source_url, status: lead.address_found_or_guessed },
    recommended_angle: `Lead with the observed trigger (${account.trigger}) and the ${play?.name || account.play_id} outcome.`,
    claims_allowed: [account.trigger], claims_forbidden: ["needs us", "struggling", "recurring problems"],
    dossier_status: "produced",
  };
}

function buildSequence(lead, account) {
  const skeleton = sequenceSkeleton(account.product);
  const emails = skeleton.touches.map((touch) => ({
    touch_number: touch.touch_number,
    touch_key: touch.touch_key,
    send_day: `Day ${touch.send_day}`,
    recommended_subject: account.trigger.split(/\s+/).slice(0, 3).join(" "),
    body: `Hi ${firstName(account.name)},\n\nI saw ${account.trigger}. ${touch.objective}.\n\nAndrew`,
    grounding_used: [account.trigger_source],
    stop_or_continue_rule: "Stop the sequence immediately on any reply.",
  }));
  return { touch_count: skeleton.touch_count, emails, review_score: 84, send_readiness: "ready" };
}

export function runSmokeFixture(database = db(), artifactsPath = null) {
  const leads = database.prepare("SELECT * FROM leads WHERE stage IN ('route_ready','researched','smoke') AND cohort_id LIKE '%-smoke'").all()
    .map((row) => getLead(database, row.id));
  const artifacts = { generated_at: now(), strategy_version: STRATEGY_VERSION, leads: [] };
  for (const lead of leads) {
    const account = SMOKE_ACCOUNTS.find((a) => a.domain === lead.company_domain && a.product === lead.product);
    const dossier = buildDossier(lead, account);
    const sequence = buildSequence(lead, account);
    // Queue every touch as pending_approval. Nothing is approved, drafted, or sent.
    for (const email of sequence.emails) {
      queueOutreachMessage({ lead_id: lead.id, touch_number: email.touch_number, recipient: lead.email_best, subject: email.recommended_subject, body: email.body, review_status: sequence.send_readiness, evidence: email.grounding_used }, database);
    }
    artifacts.leads.push({ lead_id: lead.id, company: account.company, dossier, sequence: { touch_count: sequence.touch_count, review_score: sequence.review_score, send_readiness: sequence.send_readiness } });
  }
  if (artifactsPath) fs.writeFileSync(artifactsPath, JSON.stringify(artifacts, null, 2) + "\n");
  return artifacts;
}

function readArtifacts(artifactsPath) {
  return artifactsPath && fs.existsSync(artifactsPath) ? JSON.parse(fs.readFileSync(artifactsPath, "utf8")) : { leads: [] };
}

export function buildSmokeReport(database = db(), artifactsPath = null) {
  const artifacts = readArtifacts(artifactsPath);
  const byLead = new Map(artifacts.leads.map((l) => [l.lead_id, l]));
  const messages = listOutreachMessages({}, database);
  const events = database.prepare("SELECT type, COUNT(*) n FROM activity_events GROUP BY type").all();
  const sentCount = events.find((e) => e.type === "sent")?.n || 0;

  const leads = [...byLead.keys()].map((leadId) => {
    const lead = getLead(database, leadId);
    const artifact = byLead.get(leadId);
    const account = SMOKE_ACCOUNTS.find((a) => a.domain === lead.company_domain && a.product === lead.product);
    const leadMessages = messages.filter((m) => m.lead_id === leadId && m.message_type === "sequence_touch");
    const approval = leadMessages.some((m) => m.status === "approved") ? "approved"
      : leadMessages.some((m) => m.status === "pending_approval") ? "pending_approval" : "none";
    const gaps = sendEligibility(database, lead, { allow_active_sequence: true }).blocked;
    return {
      company: lead.company, person: lead.name, play: lead.play_id,
      trigger: account?.trigger, trigger_source: account?.trigger_source,
      buyer_route: account?.buyer_route,
      email_evidence_status: lead.address_found_or_guessed,
      commercial_dossier_status: artifact?.dossier?.dossier_status || "missing",
      sequence_touch_count: leadMessages.length,
      review_score: artifact?.sequence?.review_score ?? null,
      send_readiness: artifact?.sequence?.send_readiness || "unknown",
      approval_status: approval,
      blocking_gaps: gaps,
    };
  });

  const totals = {
    accounts: leads.length,
    commercial_dossiers: artifacts.leads.filter((l) => l.dossier?.dossier_status === "produced").length,
    reviewed_sequences: artifacts.leads.filter((l) => l.sequence?.send_readiness).length,
    approved_messages: messages.filter((m) => m.status === "approved").length,
    gmail_drafts: messages.filter((m) => m.status === "provider_draft").length,
    messages_sent: sentCount,
  };
  return { generated_at: now(), strategy_version: STRATEGY_VERSION, leads, totals };
}

// The nine hard acceptance gates. PR#5 fails unless every one passes.
export function evaluateSmokeGates(database = db(), artifactsPath = null, registry = null) {
  const report = buildSmokeReport(database, artifactsPath);
  const artifacts = readArtifacts(artifactsPath);
  const dashboardSrc = fs.readFileSync(path.join(process.cwd(), "src", "dashboard-server.js"), "utf8");

  // Guessed-email probe: a non-deliverable/guessed contact must be ineligible.
  const guessed = { id: -1, email_best: "guess@guessed.example", deliverability_status: "unchecked", address_found_or_guessed: "guessed", recipient_jurisdiction: "US", legal_basis: "published_business_address", legal_basis_evidence: JSON.stringify({ address_published: true, role_relevant: true }) };
  const guessedEligible = sendEligibility(database, guessed, { allow_active_sequence: true }).ok;

  const superseded = new Set((registry?.agents || []).filter((a) => a.executionTier === "deterministic" || (a.executionTier === "lead" && !a.criticalPath)).map((a) => a.slug));
  const criticalDepOnSuperseded = (registry?.agents || []).filter((a) => a.criticalPath).flatMap((a) => (a.dependsOn || []).filter((d) => superseded.has(d)));

  const gnk = report.leads.filter((l) => l.play.startsWith("GNK"));
  const ohub = report.leads.filter((l) => l.play.startsWith("OHUB"));
  const claimsGrounded = artifacts.leads.every((l) => (l.dossier?.claims_allowed || []).length > 0 && l.dossier?.trigger_source);

  const gates = [
    { gate: "zero send-capable API routes exist", pass: dashboardSrc.includes("(approve|reject|draft)") && !dashboardSrc.includes("sendApprovedDraft(") },
    { gate: "zero sent events produced", pass: report.totals.messages_sent === 0 },
    { gate: "all public claims have source evidence", pass: claimsGrounded },
    { gate: "guessed emails cannot become approval-ready", pass: guessedEligible === false },
    { gate: "GNK gets exactly four touches", pass: gnk.length > 0 && gnk.every((l) => l.sequence_touch_count === 4) },
    { gate: "OutageHub gets exactly five touches", pass: ohub.length > 0 && ohub.every((l) => l.sequence_touch_count === 5) },
    { gate: "every lead has one brand and one play", pass: report.leads.length === 6 && report.leads.every((l) => /^(GNK|OHUB)-/.test(l.play)) && report.leads.every((l) => getCohort(database, `${l.play.startsWith("GNK") ? "gnk" : "outagehub"}-${l.play.toLowerCase()}-smoke`)?.play_id === l.play) },
    { gate: "no critical agent depends on a superseded agent", pass: registry ? criticalDepOnSuperseded.length === 0 : null, detail: criticalDepOnSuperseded.join(", ") },
    { gate: "fixture end-state clean (6 dossiers, 0 approved/drafts/sent)", pass: report.totals.commercial_dossiers === 6 && report.totals.reviewed_sequences === 6 && report.totals.approved_messages === 0 && report.totals.gmail_drafts === 0 && report.totals.messages_sent === 0 },
  ];
  return { gates, all_pass: gates.every((g) => g.pass === true), report };
}
