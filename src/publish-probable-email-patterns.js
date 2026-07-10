import { findAgent, publishArtifact } from "./bus.js";
import { candidatesForPattern } from "./find-emails.js";
import { readLeads, updateLead } from "./leads-store.js";

const PATTERNS = {
  "trigger.dev": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Small developer-tool company; no evidenced personal pattern found, so first-name format is a better startup-style guess than a corporate first.last default."
  },
  "tide.co": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Larger fintech/company structure; no evidenced personal pattern found, so first.last is the more plausible corporate pattern."
  },
  "evenuplaw.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Larger legal-tech company with formal sales/support routing; no evidenced personal pattern found, so first.last is the most plausible corporate pattern."
  },
  "rogo.ai": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Smaller AI company; no evidenced personal pattern found, so first-name format is a more plausible startup pattern than first.last."
  },
  "pinwheelapi.com": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "API startup with public role inboxes but no personal pattern evidence; first-name format is a plausible startup-style guess."
  },
  "fieldguide.io": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "B2B SaaS company with formal trust/careers surfaces; no personal pattern evidence found, so first.last is the more plausible structured-company guess."
  },
  "plot.so": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Small founder-led startup; no evidenced personal pattern found, so first-name format is a better guess than first.last."
  },
  "leaflink.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Larger B2B marketplace/company; no personal pattern evidence found, so first.last is the more plausible corporate pattern."
  },
  "ondo.finance": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Crypto/finance company with startup-like domain conventions; no evidenced personal pattern found, so first-name format is a plausible guess, with first.last retained as secondary."
  },
  "clipbook.com": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Early founder-led company; no evidenced personal pattern found, so first-name format is more plausible than first.last."
  },
  "zonos.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Established B2B SaaS company with a more formal operating profile; no evidenced personal pattern found, so first.last is the more plausible corporate guess."
  },
  "tryprofound.com": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Early-stage AI/software company; no evidenced personal pattern found, so first-name format is a more plausible startup-style guess."
  },
  "activeprospect.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Established B2B software company; no evidenced personal pattern found, so first.last is the more plausible corporate pattern."
  },
  "kalepa.com": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Specialist software company with startup-like profile; no evidenced personal pattern found, so first-name format is a plausible guess."
  },
  "zeronetworks.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Cybersecurity company with formal B2B operating profile; no evidenced personal pattern found, so first.last is the more plausible structured-company guess."
  },
  "griffin.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Regulated fintech/banking company; no evidenced personal pattern found, so first.last is the more plausible corporate pattern."
  },
  "attio.com": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Startup-style software company; no evidenced personal pattern found, so first-name format is a plausible startup-style guess."
  },
  "truefoundry.com": {
    pattern: "{first}@domain",
    confidence: "low",
    why:
      "Founder-led infrastructure/AI platform company; no evidenced personal pattern found, so first-name format is a plausible startup-style guess."
  },
  "securesafe.com": {
    pattern: "{first}.{last}@domain",
    confidence: "low",
    why:
      "Security/data-protection company with formal B2B profile; no evidenced personal pattern found, so first.last is the more plausible corporate pattern."
  }
};

function groupByCompany(results) {
  const byCompany = new Map();
  for (const result of results) {
    const key = `${result.company}|${result.company_domain}`;
    if (!byCompany.has(key)) {
      const patternInfo = PATTERNS[result.company_domain] || {};
      byCompany.set(key, {
        company: result.company,
        company_domain: result.company_domain,
        pattern_decision: {
          pattern: patternInfo.pattern || "",
          decision_type: patternInfo.pattern ? "probable_pattern" : "unknown",
          confidence: patternInfo.confidence || "none",
          why_this_pattern: patternInfo.why || "No company-specific pattern decision available.",
          alternatives_considered: [
            "{first}.{last}@domain",
            "{first}@domain",
            "{f}{last}@domain",
            "{first}{l}@domain",
            "{last}@domain"
          ]
        },
        email_pattern_evidence:
          "No same-domain personal email pattern was publicly evidenced; this is a company-specific low-confidence probable pattern.",
        public_route: result.source_urls?.[0] || "",
        people: [],
        coverage_gaps: [
          "No verified personal email or same-domain personal pattern evidence found.",
          "Use validation before sending."
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
    const patternInfo = PATTERNS[lead.company_domain];
    if (!patternInfo || !lead.name || !lead.company_domain) continue;
    const candidates = candidatesForPattern(lead.name, lead.company_domain, patternInfo.pattern);
    if (!candidates.length) continue;

    const patch = {
      email_best: candidates[0],
      email_candidates: candidates,
      email_pattern: patternInfo.pattern,
      email_status: "guessed",
      confidence: patternInfo.confidence
    };

    if (
      lead.email_best !== patch.email_best ||
      lead.email_pattern !== patch.email_pattern ||
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
      email_pattern: patternInfo.pattern,
      email_best: candidates[0],
      email_candidates: candidates,
      email_status: "guessed",
      confidence: patternInfo.confidence,
      evidence: patternInfo.why,
      source_urls: [lead.source_url || lead.linkedin_or_source].filter(Boolean)
    });
  }

  const artifact = {
    email_summary:
      `Published company-specific probable email patterns for ${results.length} leads. These are low-confidence guesses, not verified addresses.`,
    company_email_maps: groupByCompany(results),
    results,
    source_notes: [
      "The OpenClaw web-backed email pattern research repeatedly hung before completion, so this artifact replaces the prior universal first.last fallback with a company-specific low-confidence pattern table.",
      "No address in this artifact should be treated as found, verified, or deliverability-confirmed.",
      "The selected pattern varies by company stage and apparent operating style; alternatives are retained in email_candidates."
    ]
  };

  const { agent } = await findAgent("gnk-email-finder");
  const published = await publishArtifact(agent, artifact);
  console.log(`Published probable patterns: ${results.length} leads, ${updated} updated.`);
  console.log(JSON.stringify(published, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
