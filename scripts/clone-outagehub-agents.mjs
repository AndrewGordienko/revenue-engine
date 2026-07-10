import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "agents", "registry.json");

const OUTAGEHUB_SOURCES = [
  "https://www.outagehub.ca/",
  "https://www.outagehub.ca/developers",
  "https://www.outagehub.ca/developers/playground",
  "https://www.outagehub.ca/developers/notifications"
];

const OUTAGEHUB_COMMERCIAL_TARGET = {
  minimumMonthlyContractValueUsd: 1000,
  capacityPlanningMonthlyContractValueUsd: 7500,
  minimumEngagementLength: "monthly subscription or custom integration contract",
  targetContractShape:
    "Sell OutageHub as a $1k/month outage API, a $5k/month notification/alerting setup, or a $10k+/month custom integration wired into the customer's operational systems.",
  qualificationFocus: [
    "Canadian power-outage visibility affects customer support, field operations, logistics, risk, insurance, property, infrastructure, or emergency workflows",
    "the buyer can justify at least $1k/month for reliable API access, $5k/month for notifications, or $10k+/month for system integration",
    "there is a clear operational owner who needs outage data before customers, tenants, field teams, or internal stakeholders ask",
    "there is a practical path to an API evaluation, notification pilot, or integration scoping call"
  ],
  disqualifyWhen: [
    "the account has no Canadian operational exposure or outage-sensitive workflow",
    "outage data would be a curiosity rather than a decision input",
    "the buyer path is only generic procurement with no operations, data, platform, support, or risk owner",
    "the likely need is a one-off public map lookup rather than recurring API, alerting, or integration value"
  ],
  monthlyRevenueFloorUsd: 50000,
  sellerCommissionRate: 0.1,
  sellerMonthlyIncomeTargetUsd: 10000,
  sellerRequiredClosedRevenueForTargetUsd: 100000,
  outboundCapacityAssumptions: {
    workingDaysPerMonth: 22,
    sequenceTouchesPerLead: 6,
    positiveReplyRate: 0.06,
    positiveReplyToQualifiedConversationRate: 0.55,
    qualifiedConversationToClosedDealRate: 0.25,
    pipelineInventoryBufferRate: 0.25,
    sendReadyBufferRate: 0.15,
    expectedNewLeadsPerProspectingRound: 40,
    maxRecommendedProspectingRounds: 40,
    contractBucketSplit: {
      short_term: 0.5,
      medium_term: 0.35,
      long_term: 0.15
    }
  },
  dealTiers: [
    {
      tier: "api_access",
      monthlyValueUsdRange: [1000, 4999],
      role: "fast evaluation and departmental API access",
      targetSalesMotion:
        "operations, data, product, support, risk, insurance, logistics, or infrastructure owner with a recurring need for Canadian outage data",
      portfolioUse: "volume base and proof-building motion"
    },
    {
      tier: "notifications",
      monthlyValueUsdRange: [5000, 9999],
      role: "managed alerting and notification setup",
      targetSalesMotion:
        "team needs automated notifications for regions, providers, polygons, customers, properties, depots, routes, or operating areas",
      portfolioUse: "preferred mid-tier deal for faster MRR growth"
    },
    {
      tier: "integration",
      monthlyValueUsdRange: [10000, 50000],
      role: "custom contract to wire outage intelligence into operational systems",
      targetSalesMotion:
        "enterprise or mid-market team needs outage data inside internal dashboards, dispatch, support, risk, claims, property, or incident workflows",
      portfolioUse: "highest priority strategic accounts when a real integration owner is reachable"
    }
  ],
  companySizeGuidance: {
    tooSmall:
      "teams with no recurring Canadian operational footprint or no system that would consume outage data",
    targetSmall:
      "regional operators, SaaS products, property groups, service providers, or infrastructure-adjacent teams that can buy API access or notifications quickly",
    targetMedium:
      "Canadian or Canada-exposed companies with customer operations, field teams, claims, logistics, property, telecom, energy, insurance, or infrastructure workflows",
    targetLarge:
      "large enterprises only when a specific operations, data, platform, support, risk, or incident-management owner and integration use case is visible",
    tooLarge:
      "broad enterprises where the only route is generic vendor intake and no outage-sensitive team or workflow is identifiable"
  },
  portfolioStrategy: [
    "use $1k/month API deals to create fast adoption and usage proof",
    "prioritize $5k/month notification opportunities when the account needs automated monitoring or stakeholder alerts",
    "source $10k+/month custom integration opportunities where outage data would feed internal systems or customer-facing workflows",
    "keep all pricing and seller economics internal unless the prospect directly asks for pricing"
  ]
};

const OUTAGEHUB_CONTEXT_BLOCK = `## OutageHub Positioning Context

- OutageHub is a platform for monitoring Canadian power outages.
- The developer product is an authenticated API for Canadian outage data. Public app routes include developer getting-started, API keys, playground, profile, and notifications pages.
- The API surface shown in the playground includes \`GET https://api.outagehub.ca/v1/outages\` with time-window parameters such as \`since\` and \`until\`, optional provider filtering, and an \`X-API-Key\` header.
- Outage records can include provider, latitude, longitude, polygon, customer count, cause, outage type, planned/unplanned flag, local/TZ/UTC start and end fields, estimated restoration fields, and update timestamps.
- Commercial motion: $1,000/month for API access, $5,000/month for notification setup/managed alerting, and $10,000+/month for custom contracts that wire OutageHub into the customer's systems.
- Strong buyer contexts include utilities-adjacent software, emergency management, municipalities, telecom/network operations, insurance/claims, property management, logistics, field service, infrastructure monitoring, customer support, and operational risk teams with Canadian exposure.
- Do not claim official utility partnership, complete national coverage, guaranteed accuracy, regulatory status, customer logos, or implementation details unless a source or upstream artifact explicitly supports it.`;

function replaceAll(value, from, to) {
  return value.split(from).join(to);
}

function transformInstructions(content, oldSlug, newSlug) {
  let next = content;
  next = replaceAll(next, "https://www.gnk.software/", "https://www.outagehub.ca/");
  next = replaceAll(next, "https://gnksoftware.com", "https://www.outagehub.ca");
  next = replaceAll(next, "G&K Software", "OutageHub");
  next = replaceAll(next, "G&K", "OutageHub");
  next = replaceAll(next, "GNK", "OutageHub");
  next = replaceAll(next, "gnk", "outagehub");
  next = replaceAll(next, oldSlug, newSlug);
  next = next.replace(/\$40k-\$60k/g, "$5k-$10k+");
  next = next.replace(/\$40k\+/g, "$10k+");
  next = next.replace(/\$40k/g, "$1k");
  next = next.replace(/\$80k\/month/g, "$50k/month");
  next = next.replace(/\$100k\/month/g, "$100k/month");
  next = next.replace(/40k/g, "1k/5k/10k+");
  next = next.replace(/senior engineering studio/g, "Canadian outage intelligence platform");
  next = next.replace(/senior engineering work/g, "outage intelligence access, notification setup, or integration work");
  next = next.replace(/bounded senior engineering slice/g, "bounded API, notification, or integration pilot");
  next = next.replace(/senior engineering for systems with consequences/g, "outage intelligence for operations where power status changes decisions");
  next = next.replace(/business-critical custom software/g, "outage-sensitive operations, support, risk, field, property, or infrastructure workflows");
  next = next.replace(/trust senior engineers with a bounded slice of work/g, "trust an outage-data API, notification setup, or system integration");
  next = next.replace(/a small studio of senior engineers who take focused backend\/platform\/infrastructure\/rescue work/g, "a Canadian outage intelligence platform that sells API access, notification setup, and custom integrations");
  next = next.replace(/a small engineering studio made up of a handful of senior engineers/g, "a Canadian outage intelligence platform");
  next = next.replace(/a small engineering studio made up of senior engineers/g, "a Canadian outage intelligence platform");
  next = next.replace(/small engineering studio made up of a handful of senior engineers/g, "Canadian outage intelligence platform");
  next = next.replace(/small engineering studio made up of senior engineers/g, "Canadian outage intelligence platform");
  next = next.replace(/focused backend, platform, and infrastructure work/g, "outage-data API, notification, and integration work");
  next = next.replace(/focused backend, platform, infrastructure, product, workflow, modernization, or rescue work/g, "API access, notification setup, operational alerting, and system integration work");
  next = next.replace(/focused backend\/platform\/infrastructure\/rescue work/g, "outage-data API, notification, and integration work");
  next = next.replace(/backend, platform, or infrastructure work/g, "outage-data API, notification, or integration work");
  next = next.replace(/core backend systems, infrastructure, foundations for future growth/g, "outage visibility, notification routing, and operational-system integration");
  next = next.replace(/AI, data, backend, or infrastructure/g, "operations, support, outage-data, or integration");
  next = next.replace(/this stage of a company often comes with a handful of foundational engineering projects that are difficult to fit around day-to-day product work\. Whether that's building core backend systems, strengthening infrastructure, or helping establish the foundations for future growth, it's the kind of work we enjoy\./g, "teams with Canadian operational exposure often need outage visibility in the places where decisions already happen. Whether that starts as API access, notification routing, or a custom integration into an internal workflow, that is the kind of practical outage-data work OutageHub is built for.");
  next = next.replace(/This stage of a company often comes with a handful of foundational engineering projects that are difficult to fit around day-to-day product work\./g, "Teams with Canadian operational exposure often need outage visibility in the places where decisions already happen.");
  next = next.replace(/focused backend, platform, and rescue work, usually starting with one bounded slice that can be reviewed quickly and handed back cleanly/g, "API access, notification setup, and custom integrations, usually starting with one practical outage-data workflow that can be tested quickly");
  next = next.replace(/for bounded backend, platform/g, "for API access, notifications, and integrations");
  next = next.replace(/backend, platform, infrastructure, workflow, modernization, and rescue work/g, "API access, notifications, operational alerting, and integrations");
  next = next.replace(/difficult backend, platform, and infrastructure problems/g, "outage visibility and integration problems");
  next = next.replace(/difficult engineering problems/g, "outage visibility and operational data problems");
  next = next.replace(/difficult software problems/g, "outage visibility and operational data problems");
  next = next.replace(/bringing in an external engineering team/g, "using an external outage-data API or integration partner");
  next = next.replace(/external engineering support/g, "outage-data support");
  next = next.replace(/an external engineering team/g, "an outage-data API or integration partner");
  next = next.replace(/one focused reliability project/g, "one focused outage-data workflow");
  next = next.replace(/small stabilization pass on the highest-risk infrastructure slice/g, "small outage-data integration or notification pilot");
  next = next.replace(/software boutique/g, "API/data product");
  next = next.replace(/software boutiques/g, "API/data products");
  next = next.replace(/boutique-growth playbook/g, "API/data-product growth playbook");
  next = next.replace(/Boutique Growth Playbook/g, "API Growth Playbook");
  next = next.replace(/boutique growth playbook/g, "API growth playbook");
  next = next.replace(/Company Context agent for the `salesv3` OpenClaw project\.\n\nYour first job is to visit `https:\/\/www\.outagehub\.ca\/`, determine what OutageHub does, and publish concise notes that other agents can use\./,
    "Company Context agent for the `salesv3` OpenClaw project.\n\nYour first job is to visit `https://www.outagehub.ca/`, check the developer surfaces where available, determine what OutageHub does, and publish concise notes that other agents can use.");

  if (!next.includes("## OutageHub Positioning Context")) {
    next = next.replace("\n## Operating Rules", `\n${OUTAGEHUB_CONTEXT_BLOCK}\n\n## Operating Rules`);
  }

  return next;
}

function transformDependency(value) {
  return typeof value === "string" ? value.replace(/^gnk-/, "outagehub-") : value;
}

function transformAgent(agent) {
  const suffix = agent.slug.replace(/^gnk-/, "");
  const newSlug = `outagehub-${suffix}`;
  const newName = replaceAll(agent.name, "GNK", "OutageHub").replace(
    "Boutique Growth Playbook",
    "API Growth Playbook"
  );
  const role = replaceAll(agent.role, "GNK", "OutageHub")
    .replace(/senior engineering/g, "outage intelligence")
    .replace(/software boutiques and consultancies/g, "API, data, and alerting products")
    .replace(/boutique/gi, "API/data-product");

  return {
    ...agent,
    id: `salesv3-${newSlug}`,
    slug: newSlug,
    name: newName,
    role,
    sequence: (agent.sequence || 0) + 100,
    dependsOn: (agent.dependsOn || []).map(transformDependency),
    workspace: `openclaw-workspaces/salesv3-${newSlug}`,
    agentDir: `.openclaw-agents/salesv3-${newSlug}/agent`,
    sourceUrls: OUTAGEHUB_SOURCES,
    commercialTargetKey: "outagehub",
    productName: "OutageHub",
    projectDescription:
      "The user is building an OutageHub sales intelligence pipeline for selling Canadian power-outage API access, notification setup, and custom system integrations."
  };
}

function workspaceDocs(agent) {
  const instructionsPath = path.join(root, "agents", agent.slug, "instructions.md");
  const statePath = path.join(root, "data/state.json");
  const messagesPath = path.join(root, "data/messages.jsonl");
  const registryPath = path.join(root, "agents/registry.json");
  const dependencies = agent.dependsOn || [];
  const sources = agent.sourceUrls || [];
  const projectDescription =
    agent.projectDescription ||
    "The user is building a GNK/OpenClaw sales intelligence pipeline. Optimize for practical outbound sales work, grounded evidence, and clean JSON handoffs through the shared bus.";

  return {
    "AGENTS.md": `# ${agent.name} Workspace

You are the ${agent.name} agent for the \`salesv3\` repo.

Read and follow:

- \`${instructionsPath}\`

Shared project state:

- \`${statePath}\`
- \`${messagesPath}\`

When you finish a run, produce the JSON object requested by the output contract so the runner can publish it to the shared JSON bus.
`,
    "TOOLS.md": `# TOOLS.md

Project files:

- Agent registry: \`${registryPath}\`
- Shared state: \`${statePath}\`
- Message bus: \`${messagesPath}\`

Primary sources:
${sources.map((sourceUrl) => `- \`${sourceUrl}\``).join("\n") || "- none"}

Helpful upstream artifacts:
${dependencies.map((dependency) => `- \`${dependency}\` in \`${statePath}\``).join("\n") || "- none"}
`,
    "IDENTITY.md": `# IDENTITY.md

Agent id: \`${agent.id}\`
Agent slug: \`${agent.slug}\`
Role: ${agent.role}
Model: \`${agent.model}\`
`,
    "USER.md": `# USER.md

${projectDescription} Optimize for practical outbound sales work, grounded evidence, and clean JSON handoffs through the shared bus.
`,
    "HEARTBEAT.md": `# HEARTBEAT.md

- Check \`${statePath}\` before work.
- Check \`${messagesPath}\` for recent handoffs.
- Return valid JSON matching the requested output contract.
`
  };
}

async function main() {
  const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  registry.commercialTargets = {
    ...(registry.commercialTargets || {}),
    outagehub: OUTAGEHUB_COMMERCIAL_TARGET
  };

  const existingSlugs = new Set(registry.agents.map((agent) => agent.slug));
  const gnkAgents = registry.agents.filter((agent) => agent.slug.startsWith("gnk-"));
  const newAgents = [];

  for (const agent of gnkAgents) {
    const cloned = transformAgent(agent);
    const oldInstructions = path.join(root, "agents", agent.slug, "instructions.md");
    const newDir = path.join(root, "agents", cloned.slug);
    const newInstructions = path.join(newDir, "instructions.md");
    const instructions = transformInstructions(
      await fs.readFile(oldInstructions, "utf8"),
      agent.slug,
      cloned.slug
    );

    await fs.mkdir(newDir, { recursive: true });
    await fs.writeFile(newInstructions, instructions);

    const workspace = path.join(root, cloned.workspace);
    await fs.mkdir(workspace, { recursive: true });
    for (const [fileName, content] of Object.entries(workspaceDocs(cloned))) {
      await fs.writeFile(path.join(workspace, fileName), content);
    }

    if (!existingSlugs.has(cloned.slug)) {
      newAgents.push(cloned);
      existingSlugs.add(cloned.slug);
    }
  }

  if (newAgents.length) {
    registry.agents.push(...newAgents);
    registry.agents.sort((a, b) => (a.sequence || 999) - (b.sequence || 999) || a.slug.localeCompare(b.slug));
  }

  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`OutageHub agents ready: ${gnkAgents.length} instruction sets, ${newAgents.length} new registry entries.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
