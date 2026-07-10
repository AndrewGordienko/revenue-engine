import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { fromRoot } from "./paths.js";
import { readLeads, updateLead } from "./leads-store.js";

const execFileAsync = promisify(execFile);
const BATCH_SIZE = 25;

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : "gnk";
}

function emailFinderSlug(product) {
  return `${normalizeProduct(product)}-email-finder`;
}

function emailFinderAgentId(product) {
  return `salesv3-${emailFinderSlug(product)}`;
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .trim();
}

function nameParts(name) {
  const parts = normalizeName(name).split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const particles = new Set(["da", "de", "del", "der", "di", "du", "la", "le", "van", "von"]);
  let last = "";
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    const priorPart = parts[parts.length - 2];
    last = particles.has(priorPart) ? `${priorPart}${lastPart}` : lastPart;
  }
  return { first, last, f: first[0] || "", l: last[0] || "" };
}

export function guessCandidates(name, domain) {
  return candidatesForPattern(name, domain, "{first}.{last}@domain");
}

export function candidatesForPattern(name, domain, pattern) {
  if (!domain) return [];
  const { first, last, f, l } = nameParts(name);
  if (!first) return [];
  const at = (local) => `${local}@${domain}`;
  const localByPattern = {
    "{first}.{last}@domain": last ? `${first}.${last}` : first,
    "{first}@domain": first,
    "{f}{last}@domain": last ? `${f}${last}` : first,
    "{first}{l}@domain": last ? `${first}${l}` : first,
    "{last}@domain": last || first
  };
  const primary = localByPattern[pattern] || localByPattern["{first}.{last}@domain"];
  const fallbacks = [
    primary,
    localByPattern["{first}@domain"],
    localByPattern["{f}{last}@domain"],
    localByPattern["{first}.{last}@domain"],
    localByPattern["{first}{l}@domain"],
    localByPattern["{last}@domain"]
  ].filter(Boolean);
  return [...new Set(fallbacks.map(at))];
}

function matchKey(name, company) {
  return `${normalizeName(name)}|${String(company || "").toLowerCase().trim()}`;
}

function guessPattern(name) {
  const { first, last, f, l } = nameParts(name);
  if (!first) return "";
  if (!last) return "{first}@domain";
  return "{first}.{last}@domain";
}

async function runEmailAgent(leads, product) {
  const slug = emailFinderSlug(product);
  const agentId = emailFinderAgentId(product);
  const instructions = await fs.readFile(fromRoot("agents", slug, "instructions.md"), "utf8");
  const prompt = [
    instructions,
    "",
    "leads =",
    JSON.stringify(
      leads.map((lead) => ({
        name: lead.name,
        title: lead.title,
        company: lead.company,
        company_domain: lead.company_domain
      })),
      null,
      2
    ),
    "",
    "Return only the JSON object from the output contract."
  ].join("\n");

  const { stdout } = await execFileAsync(
    "openclaw",
    ["agent", "--agent", agentId, "--session-key", `agent:${agentId}:email`, "--message", prompt, "--json", "--timeout", "900"],
    { cwd: fromRoot(), maxBuffer: 1024 * 1024 * 16 }
  );

  const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const text =
    result.result?.payloads?.find((p) => p.text)?.text ||
    result.result?.finalAssistantVisibleText ||
    result.result?.finalAssistantRawText ||
    "";
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  const parsed = JSON.parse(text.slice(first, last + 1));
  return parsed.results || [];
}

export async function findEmails({ limit = 200, product = "gnk" } = {}) {
  const normalizedProduct = normalizeProduct(product);
  const leads = await readLeads(normalizedProduct);
  const prefix = `${normalizedProduct}-`;
  const pending = leads
    .filter((lead) => {
      return (
        lead.email_status !== "found" &&
        !lead.email_best &&
        lead.name &&
        (!lead.source_agent || lead.source_agent.startsWith(prefix))
      );
    })
    .slice(0, limit);

  if (!pending.length) {
    return { processed: 0, updated: 0, mode: "none" };
  }

  let updated = 0;
  const mode = "agent";

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    let results = null;

    results = await runEmailAgent(batch, product);

    const byKey = new Map((results || []).map((r) => [matchKey(r.name, r.company), r]));

    for (const lead of batch) {
      const r = byKey.get(matchKey(lead.name, lead.company));
      const companyDomain = r?.company_domain || lead.company_domain;
      let patch = r
        ? {
            email_best: r.email_best || (r.email_candidates || [])[0] || "",
            email_candidates: r.email_candidates || [],
            email_pattern: r.email_pattern || "",
            email_status: r.email_status || "unknown",
            company_domain: companyDomain,
            confidence: r.confidence || lead.confidence
          }
        : { email_status: "unknown", confidence: "none", company_domain: companyDomain };

      if (!patch.email_best && companyDomain && lead.name) {
        const candidates = guessCandidates(lead.name, companyDomain);
        patch = {
          ...patch,
          email_best: candidates[0] || "",
          email_candidates: candidates,
          email_pattern: guessPattern(lead.name),
          email_status: candidates.length ? "guessed" : "unknown",
          confidence: candidates.length ? "low" : patch.confidence
        };
      }

      if (patch.email_best || patch.email_status !== lead.email_status) {
        await updateLead(lead.id, patch, normalizedProduct);
        updated += 1;
      }
    }
  }

  return { processed: pending.length, updated, mode };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  findEmails({ product: process.argv[2] || "gnk" })
    .then((result) => {
      console.log(`Email finder: processed ${result.processed}, updated ${result.updated} (mode: ${result.mode}).`);
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}
