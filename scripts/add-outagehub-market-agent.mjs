import fs from "node:fs/promises";

const registryPath = "agents/registry.json";
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

const slug = "outagehub-market-coverage";
const hasAgent = registry.agents.some((agent) => agent.slug === slug);

const sources = [
  "https://www.outagehub.ca/",
  "https://www.outagehub.ca/developers",
  "https://www.outagehub.ca/developers/playground",
  "https://www.outagehub.ca/developers/notifications"
];

if (!hasAgent) {
  const offerIndex = registry.agents.findIndex((agent) => agent.slug === "outagehub-offer-map");
  if (offerIndex < 0) throw new Error("Missing outagehub-offer-map");
  registry.agents.splice(offerIndex + 1, 0, {
    id: "salesv3-outagehub-market-coverage",
    slug,
    name: "OutageHub Market Coverage",
    role: "Map Canadian industries, account types, coverage gaps, and realistic short/medium/long sales motions for OutageHub.",
    sequence: 105,
    dependsOn: [
      "outagehub-company-context",
      "outagehub-icp-contact-profile",
      "outagehub-boutique-growth-playbook",
      "outagehub-offer-map"
    ],
    workspace: "openclaw-workspaces/salesv3-outagehub-market-coverage",
    agentDir: ".openclaw-agents/salesv3-outagehub-market-coverage/agent",
    model: "openai/gpt-5.4-mini",
    sourceUrls: sources,
    outputs: [
      "market_coverage_summary",
      "coverage_sources",
      "industry_segments",
      "portfolio_policy",
      "bucket_overrides",
      "sourcing_expansion_plan",
      "claims_to_avoid",
      "open_questions",
      "source_notes"
    ],
    commercialTargetKey: "outagehub",
    productName: "OutageHub",
    projectDescription:
      "The user is building an OutageHub sales intelligence pipeline for selling Canadian power-outage API access, notification setup, and custom system integrations."
  });
}

const downstream = new Set([
  "outagehub-revenue-strategy",
  "outagehub-pipeline-capacity",
  "outagehub-account-sourcing",
  "outagehub-account-scoring",
  "outagehub-contact-discovery",
  "outagehub-client-dossier",
  "outagehub-outreach-angle",
  "outagehub-sequence-strategy",
  "outagehub-email-finder",
  "outagehub-email-drafter",
  "outagehub-email-sequence-drafter",
  "outagehub-email-sequence-reviewer"
]);

for (const agent of registry.agents) {
  if (agent.slug === slug) continue;
  if (!agent.slug.startsWith("outagehub-")) continue;
  if (downstream.has(agent.slug)) {
    agent.dependsOn = agent.dependsOn || [];
    if (!agent.dependsOn.includes(slug)) {
      const offerIndex = agent.dependsOn.indexOf("outagehub-offer-map");
      const insertAt = offerIndex >= 0 ? offerIndex + 1 : agent.dependsOn.length;
      agent.dependsOn.splice(insertAt, 0, slug);
    }
  }
}

for (const agent of registry.agents) {
  if (!agent.slug.startsWith("outagehub-")) continue;
  if (agent.slug === slug) {
    agent.sequence = 105;
    continue;
  }
  if ((agent.sequence || 0) >= 105) agent.sequence = agent.sequence + (hasAgent ? 0 : 1);
}

registry.agents.sort((a, b) => (a.sequence || 999) - (b.sequence || 999) || a.slug.localeCompare(b.slug));
await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, added: !hasAgent, agentCount: registry.agents.length }, null, 2));
