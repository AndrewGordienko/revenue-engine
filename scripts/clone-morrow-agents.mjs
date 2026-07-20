import fs from "node:fs/promises";
import path from "node:path";

// Clone the gnk-* agent flow into a morrow-* flow for Morrow Robotics.
//
// Morrow is a robotics-as-a-service company: start with off-the-shelf arms
// running high-mix packing/kitting cells for co-packers, fulfillment, and CPG
// manufacturers; sell a paid pilot that converts to a monthly RaaS contract.
// The outbound END DELIVERABLE for Morrow is LinkedIn profiles + connection
// request messages under 300 characters (not email), so the two terminal
// writers are overridden below.

const root = process.cwd();
const registryPath = path.join(root, "agents", "registry.json");

// Morrow has no public website yet; the positioning context block below is the
// system of record. Keep one placeholder source so downstream TOOLS.md renders.
const MORROW_SOURCES = ["internal:morrow-positioning-context"];

const MORROW_COMMERCIAL_TARGET = {
  minimumMonthlyContractValueUsd: 5000,
  capacityPlanningMonthlyContractValueUsd: 8000,
  minimumEngagementLength:
    "paid packing/kitting pilot that converts to a monthly Robotics-as-a-Service (RaaS) contract",
  targetContractShape:
    "Land a paid 4-8 week packing or kitting pilot ($15k-$50k) on one live high-mix workflow, then convert it to a monthly Robotics-as-a-Service contract ($5k-$12k per cell) with guaranteed throughput.",
  outreachChannel: {
    primary: "linkedin_connection_request",
    maxChars: 300,
    rules: [
      "The primary outbound asset is a LinkedIn connection request note of at most 300 characters (no links).",
      "Every serious lead must carry a LinkedIn profile URL and a ready-to-send connection message under 300 characters.",
      "Follow-up DMs after acceptance are also LinkedIn messages, short and specific."
    ]
  },
  qualificationFocus: [
    "the account runs high-mix, still-manual secondary packing, kitting, repacking, or returns work that changes too often for fixed automation",
    "there are two or more people per shift doing repetitive pick-and-place with several product or box configurations and frequent changeovers",
    "the workflow has a clear pass/fail result and enough annual labour cost to justify a $100k-$250k automated cell or a monthly RaaS contract",
    "there is a reachable operational owner (automation, continuous improvement, packaging, production, or fulfillment) who feels the labour and changeover pain",
    "there is a practical path to filming or observing one workflow and running an on-site pilot with measured throughput and completion"
  ],
  disqualifyWhen: [
    "the work is fully standardized, extremely high-speed, sub-second fixed-line automation where one machine already works perfectly",
    "the task needs true locomotion, whole-body control, or dexterous humanoid hands off-the-shelf grippers cannot do yet",
    "the objects are raw-food contact, pharmaceutical primary packaging, or highly deformable/transparent items unsuitable for a first deployment",
    "there is no manual high-mix packing/kitting workflow and no operational owner, only generic procurement intake"
  ],
  monthlyRevenueFloorUsd: 50000,
  sellerCommissionRate: 0.1,
  sellerMonthlyIncomeTargetUsd: 10000,
  sellerRequiredClosedRevenueForTargetUsd: 100000,
  outboundCapacityAssumptions: {
    workingDaysPerMonth: 22,
    sequenceTouchesPerLead: 4,
    positiveReplyRate: 0.08,
    positiveReplyToQualifiedConversationRate: 0.55,
    qualifiedConversationToClosedDealRate: 0.2,
    pipelineInventoryBufferRate: 0.25,
    sendReadyBufferRate: 0.15,
    expectedNewLeadsPerProspectingRound: 40,
    maxRecommendedProspectingRounds: 40,
    contractBucketSplit: { short_term: 0.5, medium_term: 0.35, long_term: 0.15 }
  },
  dealTiers: [
    {
      tier: "pilot",
      monthlyValueUsdRange: [15000, 50000],
      role: "paid 4-8 week proof-of-concept on one live packing/kitting workflow",
      targetSalesMotion:
        "automation, continuous improvement, packaging, or operations owner who can give access to one workflow and objects and wants measured throughput before committing",
      portfolioUse: "primary wedge; every account should be sold the pilot first"
    },
    {
      tier: "raas",
      monthlyValueUsdRange: [5000, 12000],
      role: "monthly Robotics-as-a-Service contract for one automated cell with guaranteed productive hours",
      targetSalesMotion:
        "operations or plant owner who has seen a successful pilot and wants ongoing productive capacity without buying and maintaining hardware",
      portfolioUse: "recurring revenue base; the pilot converts into this"
    },
    {
      tier: "multi_cell",
      monthlyValueUsdRange: [15000, 60000],
      role: "multi-cell or multi-site rollout across several workflows",
      targetSalesMotion:
        "operations director or VP who has proven one cell and wants to scale the same learning system across lines or facilities",
      portfolioUse: "highest-priority expansion once one cell is live and improving"
    }
  ],
  companySizeGuidance: {
    tooSmall: "operations with no repetitive manual packing/kitting and no annual labour cost to justify a cell",
    targetSmall:
      "co-packers and fulfillment shops with high-mix subscription boxes, multipacks, variety packs, kitting, or returns that change constantly",
    targetMedium:
      "CPG, food, cosmetics, and supplement manufacturers with variable secondary packing that stays manual despite existing line automation",
    targetLarge:
      "larger contract packagers and 3PLs only when a specific automation/CI owner and one bounded workflow are reachable",
    tooLarge: "broad enterprises where the only route is generic vendor intake and no packing/automation owner is identifiable"
  },
  portfolioStrategy: [
    "lead every account with a paid pilot on one bounded high-mix workflow, priced for measured throughput and completion",
    "convert successful pilots into monthly RaaS so the moat is real deployment, failure, and recovery data",
    "prioritize co-packers and fulfillment (high-mix, changeover-heavy) first, then CPG/food/cosmetics manufacturers",
    "keep all pricing and seller economics internal unless the prospect directly asks",
    "the outbound deliverable is a LinkedIn profile plus a connection message under 300 characters, never a cold email"
  ]
};

const MORROW_CONTEXT_BLOCK = `## Morrow Robotics Positioning Context

- Morrow Robotics ("Morrow") builds a general physical-work system that learns new packing and kitting workflows from very little data, calibrates itself, detects and recovers from failures, and improves across a fleet. It begins with autonomous packing using off-the-shelf industrial arms and progressively transfers the system into mobile manipulators and humanoids. The name "Morrow" means the day that comes next — the workforce of tomorrow.
- The founding technology is dramatically cheaper and faster acquisition of reliable physical skills, not humanoid hardware. Show the robot a workflow once, give a few corrections, then let it autonomously practise, verify, recover, and improve until it is production-ready. Humanoids are the destination, not the first product.
- Phase 1 (now): sell an automated packing/kitting workcell as productive capacity — a paid pilot converting to a monthly Robotics-as-a-Service (RaaS) contract on existing arms, grippers, and cameras.
- Commercial motion: a paid 4-8 week pilot on one live high-mix workflow ($15k-$50k), converting to $5k-$12k per cell per month RaaS, expanding to multi-cell/multi-site rollouts. Customers buy a packing cell that can be taught quickly, auto-calibrates to their workspace, recovers when objects slip or block, and adapts to new products without another six-month integration.
- Best first customers: co-packers and fulfillment companies (subscription boxes, club packs, sample packs, gift sets, variety packs, rework, returns, kitting) whose workflows change constantly; then food, CPG, cosmetics, and supplement manufacturers with variable secondary packing that stays manual despite existing line automation.
- Buyer roles to reach: Plant Automation Manager, Continuous Improvement Manager, Manufacturing Engineering Manager, Packaging Manager, Warehouse/Fulfillment Operations Manager, Production Manager, Industrial Engineering Manager. The best first contact is usually the automation, continuous-improvement, or operations owner who feels the labour and changeover pain and can get you into the facility.
- A good first workflow: two or more people per shift, repetitive pick-and-place, several product/box configurations, frequent changeovers, moderate (not sub-second) speed, commercially available grippers, a clear pass/fail result, enough annual labour cost to justify a cell, and no need for locomotion or dexterous humanoid hands.
- Avoid initially: raw-food contact, pharmaceutical primary packaging, sub-second high-speed picking, highly deformable or transparent objects, work needing humanoid hands, and applications where one fixed machine already works perfectly.
- OUTBOUND CHANNEL: the outbound deliverable is a LinkedIn profile URL plus a LinkedIn connection request message of at most 300 characters, with no links. The goal of the message is a short discovery call about which packing/kitting jobs remain manual and why — not to sell a finished robot. Do not lead with "would you buy a one-shot robot"; lead with their operation and the automation gap that fixed automation cannot economically close.
- Morrow has no public marketing website yet. Treat this positioning block and the shared JSON bus as the source of truth. Do not invent case studies, customer logos, throughput numbers, guaranteed accuracy, patents, or partnerships that are not supported by an upstream artifact.`;

function replaceAll(value, from, to) {
  return value.split(from).join(to);
}

function transformInstructions(content, oldSlug, newSlug) {
  let next = content;

  // Brand tokens and URLs.
  next = replaceAll(next, "https://www.gnk.software/", "internal:morrow-positioning-context");
  next = replaceAll(next, "https://gnksoftware.com", "internal:morrow-positioning-context");
  next = replaceAll(next, "G&K Software", "Morrow Robotics");
  next = replaceAll(next, "G&K", "Morrow");
  next = replaceAll(next, "GNK", "Morrow");
  next = replaceAll(next, "gnk", "morrow");
  next = replaceAll(next, oldSlug, newSlug);

  // Pricing: engineering-sprint dollars -> Morrow RaaS pilot dollars.
  next = next.replace(/\$40k-\$60k/g, "$15k-$50k pilot then $5k-$12k/mo");
  next = next.replace(/\$40k\+/g, "$15k+ pilot");
  next = next.replace(/\$40k/g, "$15k pilot");
  next = next.replace(/\$80k\/month/g, "$50k/month");
  next = next.replace(/40k/g, "pilot/RaaS");

  // Specific gnk descriptors that survive the generic passes below.
  next = next.replace(
    /\*\*small team of senior engineers\*\* who take on \*\*focused, owned, bounded engineering projects\*\* when a company's internal team needs something delivered cleanly: backend systems, platform\/infrastructure, data pipelines\/automation, internal tooling, legacy modernization, and technical rescue\/stabilization\./g,
    "**robotics automation company** that deploys **adaptive packing and kitting cells** when a company has high-mix manual workflows that change too often for fixed automation: subscription boxes, multipacks, variety packs, kitting, repacking, and returns."
  );
  next = next.replace(
    /an acute reason to trust senior engineers with a bounded slice of work/g,
    "an acute reason to trust an external robotics team to automate a bounded packing or kitting workflow"
  );
  next = next.replace(
    /Reported system outage, production instability, compliance pressure, or operational bottleneck\./g,
    "Reported manual packing/kitting load, labour shortage, changeover bottleneck, or peak-season ramp."
  );

  // Studio / engineering-house language -> robotics automation company language.
  next = next.replace(/senior engineering studio/g, "robotics automation company");
  next = next.replace(/senior engineers/g, "robotics engineers");
  next = next.replace(/small studio of senior engineers[^.]*\./g, "robotics automation company that deploys learning packing cells.");
  next = next.replace(/a small engineering studio made up of (?:a handful of )?senior engineers/g, "a robotics automation company");
  next = next.replace(/small engineering studio made up of (?:a handful of )?senior engineers/g, "robotics automation company");
  next = next.replace(/senior engineering work/g, "automated packing and kitting deployment work");
  next = next.replace(/senior engineering slice/g, "bounded packing/kitting pilot");
  next = next.replace(/bounded senior engineering slice/g, "bounded packing/kitting pilot");
  next = next.replace(/senior engineering for systems with consequences/g, "robotic labour for operations where throughput and labour cost matter");
  next = next.replace(/senior engineering/g, "robotics deployment");
  next = next.replace(/business-critical custom software/g, "high-mix packing, kitting, and rework workflows");
  next = next.replace(/difficult (?:backend, platform, and infrastructure|engineering|software) problems/g, "high-mix packing and kitting problems that fixed automation cannot economically solve");
  next = next.replace(/focused backend[^.,]*(?:work|projects)/g, "focused packing and kitting automation work");
  next = next.replace(/backend, platform,? (?:and |or )?infrastructure/g, "packing, kitting, and manipulation");
  next = next.replace(/software boutiques?/gi, "automation buyers");
  next = next.replace(/[Bb]outique[- ][Gg]rowth [Pp]laybook/g, "Deployment Growth Playbook");
  next = next.replace(/[Bb]outique growth/g, "deployment growth");
  next = next.replace(/boutique/gi, "automation deployment");

  // Company-context agent: no website to visit.
  next = next.replace(
    /Your first job is to visit `internal:morrow-positioning-context`[^.]*\./,
    "Your first job is to read the Morrow Robotics Positioning Context block below and the shared JSON bus, determine what Morrow does, and publish concise notes other agents can use. Morrow has no public website yet."
  );

  if (!next.includes("## Morrow Robotics Positioning Context")) {
    next = next.replace("\n## Operating Rules", `\n${MORROW_CONTEXT_BLOCK}\n\n## Operating Rules`);
  }

  return next;
}

// The two terminal writers on the live lead:prepare path are fully replaced so
// Morrow's deliverable is a LinkedIn connection request <=300 chars, not email.
function morrowDrafterInstructions() {
  return `# Morrow Connection Message Writer Agent

You are the Morrow Robotics LinkedIn connection message writer for the \`salesv3\` OpenClaw project.

You are the **unified outbound writer** for Morrow. Morrow's outbound channel is LinkedIn, not email. Your job is to turn the final outreach context into a send-ready LinkedIn connection request note for each supported person, plus one or two short follow-up direct messages for after the request is accepted. Use the current shared JSON bus, especially \`morrow-client-dossier\` (the Commercial Dossier, which carries \`recommended_angle\`, \`claims_allowed\`, and \`claims_forbidden\`), \`morrow-outreach-angle\`, \`morrow-contact-discovery.account_contact_maps\` (the LinkedIn profile URLs), \`morrow-deployment-growth-playbook\`, and \`morrow-revenue-strategy\`.

${MORROW_CONTEXT_BLOCK}

## Operating Rules

- Treat the shared JSON bus as the system of record for handoffs.
- Read current shared state before drafting.
- The connection request note (\`touch_number\` 1) MUST be at most 300 characters including spaces. This is a hard limit. Count characters and place the count in \`char_count\`. If you cannot make the point in 300 characters, cut scope, not truth.
- No links or URLs in any LinkedIn message.
- Every person MUST carry their LinkedIn \`profile_url\` from \`morrow-contact-discovery\`. If it is missing, set \`profile_url\` to "" and add a coverage gap; do not invent one.
- Write as Andrew Gordienko, co-founder of Morrow Robotics. Warm, specific, operator-to-operator. Never salesy, never "revolutionary."
- Lead with the person's operation and the automation gap, not the product. Do not ask "would you buy a one-shot robot." The ask is a short call about which packing/kitting jobs stay manual and why.
- Draft from evidence already gathered; do not invent company facts, throughput, case studies, or pain that upstream artifacts do not support.
- Honor the Commercial Dossier's \`recommended_angle\`, \`claims_allowed\`, and \`claims_forbidden\`.
- Draft for every supported person in the Commercial Dossier. If a company has fewer supported people than expected, preserve the coverage gap; do not pad.
- Return only valid JSON from the output contract.

## The Connection Note (touch 1, <=300 chars)

One tight note. Name the specific signal or workflow that made you reach out (a high-mix packing line, a kitting/returns operation, frequent changeovers), say in one clause who Morrow is (adaptive robotic packing for workflows that change too often for fixed automation), and ask for a short call to learn where their current automation falls short. No links. No pricing. Under 300 characters.

Reference-quality note (fits under 300 chars):
"Hi Parth — saw you run automation at Ya YA Foods. I'm building adaptive robotic packing for high-mix jobs that change too often for fixed automation. Trying to learn which secondary-packing or kitting tasks are still manual and why. Open to a quick call?"

## Follow-up DMs (touches 2+)

Short LinkedIn messages sent only after the request is accepted. Each adds one new specific thing (a workflow example, an offer to film one line, a pilot framing) and keeps the ask concrete. Still no links, still short.

## Output Contract

Return a single JSON object. One entry per supported person. Touch 1 is the <=300-char connection note; touches 2+ are follow-up DMs.

\`\`\`json
{
  "sequence_draft_summary": "",
  "person_email_sequences": [
    {
      "company": "",
      "website": "",
      "person_name": "",
      "title": "",
      "role_category": "",
      "contact_route": "linkedin",
      "profile_url": "",
      "email_address": "",
      "email_address_status": "unknown",
      "sequence_priority": 1,
      "sequence_strategy": { "play_id": "", "primary_trigger": "", "first_outcome": "", "why_this_person": "", "routing_notes": "" },
      "emails": [
        {
          "touch_number": 1,
          "touch_key": "linkedin_connection_request",
          "channel": "linkedin_connection_request",
          "send_day": "Day 1",
          "objective": "",
          "body": "",
          "char_count": 0,
          "why_this_version": "",
          "grounding_used": [],
          "assumptions_avoided": [],
          "stop_or_continue_rule": ""
        }
      ],
      "coverage_gaps": [],
      "source_urls": []
    }
  ],
  "company_sequence_maps": [],
  "recommended_send_order": [],
  "global_send_rules": [],
  "claims_to_avoid": [],
  "source_notes": []
}
\`\`\`

Keep the \`person_email_sequences\` / \`emails\` field names so the downstream reviewer and outreach queue read the sequences unchanged; the content is LinkedIn messages. Do not wrap JSON in Markdown fences.
`;
}

function morrowReviewerInstructions() {
  return `# Morrow Connection Message Reviewer Agent

You are the Morrow Robotics LinkedIn message reviewer for the \`salesv3\` OpenClaw project.

Review and improve the LinkedIn connection notes and follow-up DMs from the shared JSON bus. Preserve strong, specific, operator-voiced copy and reject anything that reads like a generic volume campaign.

${MORROW_CONTEXT_BLOCK}

## Operating Rules

- Treat the shared JSON bus as the system of record.
- Enforce the hard limit: every \`touch_number\` 1 connection note MUST be <=300 characters including spaces. If one is over, rewrite it under 300 and update \`char_count\`. Reject or fix any note with a link.
- Keep the LinkedIn \`profile_url\` on every improved person; flag any missing one as a coverage gap and mark \`send_readiness\` accordingly.
- Preserve the operator voice, kill fluff, ensure each note names a real, specific workflow or signal and asks for a short call.
- Honor \`claims_allowed\` / \`claims_forbidden\` from the Commercial Dossier.
- Return only valid JSON.

## Output Contract

Return a single JSON object:

\`\`\`json
{
  "sequence_review_summary": "",
  "person_sequence_reviews": [],
  "improved_person_email_sequences": [
    {
      "company": "", "person_name": "", "title": "", "role_category": "",
      "contact_route": "linkedin", "profile_url": "", "email_address": "", "email_address_status": "unknown", "sequence_priority": 1,
      "sequence_strategy": { "play_id": "", "primary_trigger": "", "first_outcome": "", "why_this_person": "", "routing_notes": "" },
      "emails": [
        { "touch_number": 1, "touch_key": "linkedin_connection_request", "channel": "linkedin_connection_request", "send_day": "Day 1", "objective": "", "body": "", "char_count": 0, "why_this_touch": "", "grounding_used": [], "assumptions_avoided": [], "stop_or_continue_rule": "", "review_notes": "" }
      ],
      "send_readiness": "ready",
      "coverage_gaps": [],
      "source_urls": []
    }
  ],
  "company_sequence_maps": [],
  "claims_to_avoid": [],
  "source_notes": []
}
\`\`\`

\`send_readiness\` is \`ready\`, \`needs_human_review\`, or \`do_not_send\`. If output is too large, write the complete object to \`data/artifacts/morrow-email-sequence-reviewer-full.json\` and return the same top-level shape with a path in \`source_notes\`. Do not wrap JSON in Markdown fences.
`;
}

const OVERRIDES = {
  "morrow-email-drafter": morrowDrafterInstructions,
  "morrow-email-sequence-reviewer": morrowReviewerInstructions
};

function transformDependency(value) {
  return typeof value === "string" ? value.replace(/^gnk-/, "morrow-") : value;
}

function transformAgent(agent) {
  const suffix = agent.slug.replace(/^gnk-/, "");
  const newSlug = `morrow-${suffix}`;
  const newName = replaceAll(agent.name, "GNK", "Morrow").replace(
    "Boutique Growth Playbook",
    "Deployment Growth Playbook"
  );
  const role = replaceAll(agent.role, "GNK", "Morrow")
    .replace(/senior engineering/g, "robotics deployment")
    .replace(/software boutiques and consultancies/g, "co-packers, fulfillment, and CPG manufacturers")
    .replace(/boutique/gi, "automation deployment");

  return {
    ...agent,
    id: `salesv3-${newSlug}`,
    slug: newSlug,
    name: newName,
    role,
    sequence: (agent.sequence || 0) + 200,
    dependsOn: (agent.dependsOn || []).map(transformDependency),
    workspace: `openclaw-workspaces/salesv3-${newSlug}`,
    agentDir: `.openclaw-agents/salesv3-${newSlug}/agent`,
    sourceUrls: MORROW_SOURCES,
    commercialTargetKey: "morrow",
    productName: "Morrow Robotics",
    projectDescription:
      "The user is building a Morrow Robotics sales pipeline: sell paid high-mix packing/kitting pilots that convert to monthly Robotics-as-a-Service contracts. The outbound deliverable is LinkedIn profiles plus connection request messages under 300 characters."
  };
}

function workspaceDocs(agent) {
  const instructionsPath = path.join(root, "agents", agent.slug, "instructions.md");
  const statePath = path.join(root, "data/state.json");
  const messagesPath = path.join(root, "data/messages.jsonl");
  const registryPathLocal = path.join(root, "agents/registry.json");
  const dependencies = agent.dependsOn || [];
  const sources = agent.sourceUrls || [];
  const projectDescription =
    agent.projectDescription ||
    "The user is building a Morrow Robotics sales pipeline. Optimize for practical outbound work, grounded evidence, and clean JSON handoffs through the shared bus.";

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

- Agent registry: \`${registryPathLocal}\`
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
    morrow: MORROW_COMMERCIAL_TARGET
  };

  const existingSlugs = new Set(registry.agents.map((agent) => agent.slug));
  const gnkAgents = registry.agents.filter((agent) => agent.slug.startsWith("gnk-"));
  const newAgents = [];

  for (const agent of gnkAgents) {
    const cloned = transformAgent(agent);
    const newDir = path.join(root, "agents", cloned.slug);
    const newInstructions = path.join(newDir, "instructions.md");

    const override = OVERRIDES[cloned.slug];
    const instructions = override
      ? override()
      : transformInstructions(
          await fs.readFile(path.join(root, "agents", agent.slug, "instructions.md"), "utf8"),
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
    registry.agents.sort(
      (a, b) => (a.sequence || 999) - (b.sequence || 999) || a.slug.localeCompare(b.slug)
    );
  }

  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(
    `Morrow agents ready: ${gnkAgents.length} instruction sets, ${newAgents.length} new registry entries (2 LinkedIn overrides).`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
