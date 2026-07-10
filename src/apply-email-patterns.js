import { readState } from "./bus.js";
import { candidatesForPattern } from "./find-emails.js";
import { readLeads, updateLead } from "./leads-store.js";

const SUPPORTED_PATTERNS = new Set([
  "{first}.{last}@domain",
  "{first}@domain",
  "{f}{last}@domain",
  "{first}{l}@domain",
  "{last}@domain"
]);

function companyKey(company, domain) {
  return `${String(company || "").toLowerCase().trim()}|${String(domain || "").toLowerCase().trim()}`;
}

function buildPatternMap(artifact) {
  const map = new Map();
  for (const companyMap of artifact?.company_email_maps || []) {
    const decision = companyMap.pattern_decision || {};
    const pattern = decision.pattern || "";
    if (!SUPPORTED_PATTERNS.has(pattern)) continue;
    map.set(companyKey(companyMap.company, companyMap.company_domain), {
      pattern,
      decisionType: decision.decision_type || "probable_pattern",
      confidence: decision.confidence || "low",
      evidence: decision.why_this_pattern || companyMap.email_pattern_evidence || ""
    });
  }
  return map;
}

async function main() {
  const state = await readState();
  const artifact = state.artifacts?.["gnk-email-finder"];
  const patternMap = buildPatternMap(artifact);
  const leads = await readLeads();
  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const patternInfo = patternMap.get(companyKey(lead.company, lead.company_domain));
    if (!patternInfo) {
      skipped += 1;
      continue;
    }

    const candidates = candidatesForPattern(lead.name, lead.company_domain, patternInfo.pattern);
    if (!candidates.length) {
      skipped += 1;
      continue;
    }

    const status = patternInfo.decisionType === "evidenced_pattern" ? "inferred" : "guessed";
    await updateLead(lead.id, {
      email_best: candidates[0],
      email_candidates: candidates,
      email_pattern: patternInfo.pattern,
      email_status: status,
      confidence: patternInfo.confidence
    });
    updated += 1;
  }

  console.log(`Applied email patterns: ${updated} updated, ${skipped} skipped.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
