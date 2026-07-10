import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { findAgent, publishArtifact } from "./bus.js";
import { fromRoot } from "./paths.js";
import { readLeads } from "./leads-store.js";

const execFileAsync = promisify(execFile);
const AGENT_ID = "salesv3-gnk-email-finder";

function groupLeads(leads) {
  const groups = new Map();
  for (const lead of leads) {
    if (!lead.company || !lead.company_domain || !lead.name) continue;
    const key = `${lead.company}|${lead.company_domain}`;
    if (!groups.has(key)) {
      groups.set(key, {
        company: lead.company,
        company_domain: lead.company_domain,
        public_routes: new Set(),
        people: []
      });
    }
    const group = groups.get(key);
    if (lead.source_url) group.public_routes.add(lead.source_url);
    group.people.push({
      name: lead.name,
      title: lead.title
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    public_routes: [...group.public_routes].slice(0, 5)
  }));
}

function extractJson(text) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("No JSON object returned.");
  return JSON.parse(text.slice(first, last + 1));
}

async function runPatternAgent(companies) {
  const instructions = await fs.readFile(fromRoot("agents", "gnk-email-finder", "instructions.md"), "utf8");
  const prompt = [
    instructions,
    "",
    "Research only these companies. Keep the output compact. For each company, decide a company-specific email pattern. Do not use the same default pattern for every company. If you cannot find same-domain personal evidence, use `probable_pattern` only when company-specific research supports it; otherwise use `unknown`.",
    "",
    "companies =",
    JSON.stringify(companies, null, 2),
    "",
    "Return only the JSON object from the output contract."
  ].join("\n");

  const { stdout } = await execFileAsync(
    "openclaw",
    [
      "agent",
      "--agent",
      AGENT_ID,
      "--session-key",
      `agent:${AGENT_ID}:pattern:${Date.now().toString(36)}`,
      "--message",
      prompt,
      "--json",
      "--timeout",
      "420"
    ],
    { cwd: fromRoot(), maxBuffer: 1024 * 1024 * 16 }
  );

  const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const text =
    result.result?.payloads?.find((payload) => payload.text)?.text ||
    result.result?.finalAssistantVisibleText ||
    result.result?.finalAssistantRawText ||
    result.output ||
    result.response ||
    result.message ||
    "";

  return extractJson(typeof text === "string" ? text : JSON.stringify(text));
}

async function main() {
  const leads = await readLeads();
  const companies = groupLeads(leads);
  const artifact = await runPatternAgent(companies);
  const { agent } = await findAgent("gnk-email-finder");
  const published = await publishArtifact(agent, artifact);
  console.log(JSON.stringify(published, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
