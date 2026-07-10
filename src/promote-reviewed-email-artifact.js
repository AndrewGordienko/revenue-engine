import fs from "node:fs/promises";
import { appendMessage, readRegistry, readState, writeState } from "./bus.js";
import { SEQUENCE_POLICIES } from "./sales-plays.js";

const FULL_ARTIFACT_PATH = "data/artifacts/gnk-email-sequence-reviewer-full.json";

const BAD_BODY_PATTERNS = [
  "I'm Andrew, one of the founders at G&K Software.",
  "I am Andrew, one of the founders at G&K Software.",
  "For context, G&K is",
  "https://gnksoftware.com",
  "The place I'd be curious about is",
  "meaningful product signal",
  "Zero Networks's",
  "security-control",
  "the place I'd be curious about",
  "one focused",
  "Pinwheel is actively hiring a Senior Platform Engineer for Integrations Tooling to eliminate recurring platform problems and improve the integrations platform",
  "One useful way to look at Pinwheel is actively hiring",
  "the short version is that Pinwheel is actively hiring",
  "current engineering hiring signal",
  "If the integrations tooling role and offer",
  "backend, platform, infrastructure, workflow, modernization, and rescue work",
  "outside senior pair",
  "high-risk infrastructure boundary",
  "high-risk infrastructure slice",
  "highest-risk infrastructure slice",
  "fully owned internally",
  "The first thing I would not do",
  "bounded slice",
  "technical rescue read",
  "first contract slice",
  "contract slice"
];

function signature() {
  return ["Andrew Gordienko", "Co-founder", "G&K Software"].join("\n");
}

const APPROVED_INTRO =
  "I'm Andrew, from G&K Software. We help software companies take on specific backend and platform projects when the internal team needs extra senior engineering capacity.";

function normalizeBody(body) {
  return String(body || "")
    .replace(/\nhttps:\/\/gnksoftware\.com/g, "")
    .replace(/https:\/\/gnksoftware\.com\n?/g, "")
    .replace(
      /I'm Andrew, one of the founders at G&K Software\. We're a small engineering studio/g,
      APPROVED_INTRO
    )
    .replace(
      /I am Andrew, one of the founders at G&K Software\. We are a small engineering studio/g,
      APPROVED_INTRO
    )
    .replace(
      /I am Andrew, one of the founders at G&K Software\. We are a small senior engineering studio/g,
      APPROVED_INTRO
    )
    .replace(/For context, G&K is a small engineering studio[^\n]*/g, APPROVED_INTRO)
    .replace(/For context, G&K is a small senior engineering studio[^\n]*/g, APPROVED_INTRO)
    .replace(/I'm Andrew, from G&K Software\. We're a small team of senior engineers[^\n]*/g, APPROVED_INTRO)
    .replace(/G&K Software is a small engineering studio[^\n]*/g, APPROVED_INTRO)
    .replace(/The place I'd be curious about is/g, "One area that seems interesting is")
    .replace(/the place I'd be curious about is/g, "one area that seems interesting is")
    .replace(/It looked like a meaningful product signal, and it got me thinking about the focused engineering work that often sits behind launches like that\./g, "That caught my eye because launches like that often come with real engineering work behind the scenes.")
    .replace(/meaningful product signal/g, "useful product signal")
    .replace(/focused engineering work/g, "engineering work")
    .replace(/focused backend/g, "specific backend")
    .replace(/focused platform/g, "specific platform")
    .replace(/focused workflow/g, "workflow")
    .replace(/focused project/g, "specific project")
    .replace(/focused piece/g, "specific piece")
    .replace(/where focused/g, "where specific")
    .replace(/one focused/g, "a specific")
    .replace(/focused senior/g, "senior")
    .replace(/focused support/g, "senior support")
    .replace(/focused work/g, "contained work")
    .replace(/That's the kind of focused work we enjoy\./g, "That's the kind of contained work we enjoy.")
    .replace(/Zero Networks's the AI Segmentation launch/g, "Zero Networks' AI Segmentation launch")
    .replace(/Zero Networks's context/g, "Zero Networks' context")
    .replace(/Kalepa's the recent AI-underwriting product work/g, "Kalepa's recent AI underwriting release")
    .replace(/TrueFoundry's the Seldon acquisition/g, "TrueFoundry's Seldon acquisition")
    .replace(/Griffin's the Q1 2026 product roundup/g, "Griffin's Q1 2026 product roundup")
    .replace(/security-control/g, "security policy")
    .replace(/Would you be open to a conversation over the next couple of weeks\?/g, "Would it be useful to compare notes on whether there is a well-defined piece of work here?");
}

function normalizeAllBodies(artifact) {
  for (const sequence of artifact.improved_person_email_sequences || []) {
    for (const email of sequence.emails || []) {
      email.body = normalizeBody(email.body);
    }
  }
}

function normalizeBodyFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) normalizeBodyFields(item);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (key === "body" && typeof child === "string") {
      value[key] = normalizeBody(child);
    } else {
      normalizeBodyFields(child);
    }
  }
}

function validate(artifact) {
  const hits = [];
  for (const sequence of artifact.improved_person_email_sequences || []) {
    if ((sequence.emails || []).length !== SEQUENCE_POLICIES.gnk.touch_count) {
      hits.push({ company: sequence.company, person_name: sequence.person_name, pattern: "wrong_touch_count" });
    }
    for (const email of sequence.emails || []) {
      for (const pattern of BAD_BODY_PATTERNS) {
        if ((email.body || "").includes(pattern)) {
          hits.push({ company: sequence.company, person_name: sequence.person_name, touch_number: email.touch_number, pattern });
        }
      }
    }
  }

  if (hits.length) {
    throw new Error(`quality gate failed ${JSON.stringify(hits.slice(0, 10))}`);
  }
}

async function main() {
  const artifact = JSON.parse(await fs.readFile(FULL_ARTIFACT_PATH, "utf8"));
  normalizeAllBodies(artifact);
  validate(artifact);

  artifact.source_notes = [
    ...(artifact.source_notes || []),
    "Removed outbound links from signatures and converted the second-paragraph intro to a shorter Andrew-from-G&K paragraph.",
    "Applied generic cold-email cleanup: less repeated focused language, no meaningful-product-signal phrasing, and no internal planning labels."
  ].slice(-20);
  await fs.writeFile(FULL_ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  const registry = await readRegistry();
  const agent = registry.agents.find((candidate) => candidate.slug === "gnk-email-sequence-reviewer");
  const state = await readState();
  const now = new Date().toISOString();

  state.artifacts[agent.slug] = artifact;
  normalizeBodyFields(state.artifacts);
  state.agents[agent.id] = {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    status: "complete",
    lastRunAt: now,
    lastArtifactPath: FULL_ARTIFACT_PATH
  };
  state.runs = [...(state.runs || []), { agentId: agent.id, slug: agent.slug, status: "complete", artifactPath: FULL_ARTIFACT_PATH, completedAt: now }].slice(-50);
  await writeState(state);
  await appendMessage({
    type: "artifact",
    from: agent.id,
    to: "project",
    summary: `${agent.name} promoted full reviewed sequence artifact`,
    payload: {
      protocol: "salesv3-json-bus-v1",
      artifactPath: FULL_ARTIFACT_PATH,
      artifactKeys: Object.keys(artifact)
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sequences: artifact.improved_person_email_sequences.length,
        emails: artifact.improved_person_email_sequences.reduce((count, sequence) => count + sequence.emails.length, 0),
        artifactPath: FULL_ARTIFACT_PATH
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
