import fs from "node:fs/promises";
import { fromRoot } from "./paths.js";
import { leadKey } from "./leads-store.js";

const leadsPath = fromRoot("data", "leads.jsonl");

const MERGE_FIELDS = [
  "email_best",
  "email_candidates",
  "email_pattern",
  "email_status",
  "company_domain",
  "linkedin_or_source",
  "source_url",
  "segment",
  "fit_score",
  "trigger_event",
  "outreach_angle",
  "source_agent",
  "verified",
  "confidence",
  "email_subject",
  "email_body"
];

function hasValue(value) {
  return value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
}

async function main() {
  const raw = await fs.readFile(leadsPath, "utf8");
  const leads = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const byKey = new Map();

  for (const lead of leads) {
    const key = leadKey(lead);
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, lead);
      continue;
    }

    const merged = { ...prior };
    for (const field of MERGE_FIELDS) {
      if (hasValue(lead[field])) merged[field] = lead[field];
    }
    merged.notes = [...(prior.notes || []), ...(lead.notes || [])];
    merged.stage = prior.stage || lead.stage || "new";
    merged.created_at = prior.created_at < lead.created_at ? prior.created_at : lead.created_at;
    merged.updated_at = new Date().toISOString();
    byKey.set(key, merged);
  }

  const deduped = [...byKey.values()];
  await fs.writeFile(leadsPath, `${deduped.map((lead) => JSON.stringify(lead)).join("\n")}\n`);
  console.log(`Deduped leads: ${leads.length} -> ${deduped.length}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
