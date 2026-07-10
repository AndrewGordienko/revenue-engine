import { findAgent, publishArtifact } from "./bus.js";
import { guessCandidates } from "./find-emails.js";
import { readLeads, updateLead } from "./leads-store.js";

function guessPattern(name) {
  const normalized = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (!parts[0]) return "";
  if (parts.length === 1) return "{first}@domain";
  return "{first}.{last}@domain";
}

function groupByCompany(results) {
  const byCompany = new Map();
  for (const result of results) {
    const key = `${result.company}|${result.company_domain}`;
    if (!byCompany.has(key)) {
      byCompany.set(key, {
        company: result.company,
        company_domain: result.company_domain,
        email_pattern_evidence:
          "No public same-domain personal email pattern was available; candidates are heuristic guesses only.",
        public_route: result.source_urls?.[0] || "",
        people: [],
        coverage_gaps: [
          "Guessed candidates are unverified and should be validated before sending."
        ]
      });
    }
    byCompany.get(key).people.push({
      name: result.name,
      title: result.title,
      email_best: result.email_best,
      email_candidates: result.email_candidates,
      email_status: result.email_status,
      confidence: result.confidence,
      evidence: result.evidence,
      source_urls: result.source_urls
    });
  }
  return [...byCompany.values()];
}

async function main() {
  const leads = await readLeads();
  const results = [];
  let updated = 0;

  for (const lead of leads) {
    if (!lead.name || !lead.company_domain) continue;

    const preserveExisting = lead.email_status === "found" || lead.email_status === "inferred";
    const candidates = preserveExisting && lead.email_candidates?.length
      ? lead.email_candidates
      : guessCandidates(lead.name, lead.company_domain);
    if (!candidates.length) continue;

    const status = preserveExisting ? lead.email_status : "guessed";
    const emailBest = preserveExisting && lead.email_best ? lead.email_best : candidates[0];
    const pattern = preserveExisting && lead.email_pattern ? lead.email_pattern : guessPattern(lead.name);

    const patch = {
      email_best: emailBest,
      email_candidates: candidates,
      email_pattern: pattern,
      email_status: status,
      confidence: lead.confidence || "low"
    };

    if (
      lead.email_best !== patch.email_best ||
      lead.email_status !== patch.email_status ||
      JSON.stringify(lead.email_candidates || []) !== JSON.stringify(patch.email_candidates)
    ) {
      await updateLead(lead.id, patch);
      updated += 1;
    }

    results.push({
      name: lead.name,
      title: lead.title,
      company: lead.company,
      company_domain: lead.company_domain,
      email_pattern: pattern,
      email_best: emailBest,
      email_candidates: candidates,
      email_status: status,
      confidence: status === "guessed" ? "low" : lead.confidence || "",
      evidence:
        status === "guessed"
          ? "Heuristic candidate generated from person name and company domain; not verified or publicly evidenced."
          : "Preserved existing public or inferred email evidence.",
      source_urls: [lead.source_url || lead.linkedin_or_source].filter(Boolean)
    });
  }

  const artifact = {
    email_summary:
      `Generated email candidates for ${results.length} leads. Guessed candidates are unverified and must not be treated as found or deliverability-confirmed.`,
    company_email_maps: groupByCompany(results),
    results,
    source_notes: [
      "This artifact was generated from CRM lead names and company domains after the public email-finder run found no same-domain personal pattern evidence.",
      "Status `guessed` means heuristic only, not verified, found, inferred from public same-domain evidence, or deliverability-confirmed.",
      "Candidate order defaults to first.last@domain, flast@domain, first@domain, firstl@domain, last@domain when a last name exists."
    ]
  };

  const { agent } = await findAgent("gnk-email-finder");
  const published = await publishArtifact(agent, artifact);
  console.log(`Guessed emails: ${results.length} candidates, ${updated} leads updated.`);
  console.log(JSON.stringify(published, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
