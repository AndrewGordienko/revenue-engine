import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { appendMessage, readRegistry, readState, writeState } from "./bus.js";
import { fromRoot } from "./paths.js";

const execFileAsync = promisify(execFile);
const REVIEWER_SLUG = "gnk-email-sequence-reviewer";
const REVIEWER_ID = "salesv3-gnk-email-sequence-reviewer";
const FULL_ARTIFACT_PATH = "data/artifacts/gnk-email-sequence-reviewer-full.json";
const CHUNK_SIZE = Number(process.env.EMAIL_REVIEW_CHUNK_SIZE || 4);
const CONCURRENCY = Number(process.env.EMAIL_REVIEW_CONCURRENCY || 3);
const CHUNK_RESULT_DIR = fromRoot("data", "artifacts", "email-review-chunks");

const BAD_BODY_PATTERNS = [
  "I'm Andrew, one of the founders at G&K Software.",
  "I am Andrew, one of the founders at G&K Software.",
  "For context, G&K is",
  "https://gnksoftware.com",
  "The place I'd be curious about is",
  "meaningful product signal",
  "Zero Networks's",
  "security-control",
  "current engineering hiring signal",
  "outside senior pair",
  "high-risk infrastructure boundary",
  "high-risk infrastructure slice",
  "highest-risk infrastructure slice",
  "fully owned internally",
  "The first thing I would not do",
  "bounded slice",
  "technical rescue read",
  "first contract slice",
  "contract slice",
  "one-month $40k"
];

function extractJson(text) {
  const raw = String(text || "").trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("OpenClaw response did not contain JSON.");
  return JSON.parse(raw.slice(first, last + 1));
}

function extractText(result) {
  return (
    result.result?.payloads?.find((payload) => payload.text)?.text ||
    result.result?.finalAssistantVisibleText ||
    result.result?.finalAssistantRawText ||
    result.output ||
    result.response ||
    result.message ||
    ""
  );
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function validateSequences(sequences) {
  const hits = [];
  for (const sequence of sequences) {
    const emails = sequence.emails || [];
    if (emails.length !== 7) {
      hits.push({ company: sequence.company, person_name: sequence.person_name, pattern: "wrong_touch_count" });
    }
    for (const email of emails) {
      if (!String(email.body || "").includes("Andrew Gordienko\nCo-founder\nG&K Software")) {
        hits.push({ company: sequence.company, person_name: sequence.person_name, touch_number: email.touch_number, pattern: "bad_signature" });
      }
      for (const pattern of BAD_BODY_PATTERNS) {
        if (String(email.body || "").includes(pattern)) {
          hits.push({ company: sequence.company, person_name: sequence.person_name, touch_number: email.touch_number, pattern });
        }
      }
      if (/https?:\/\//i.test(String(email.body || ""))) {
        hits.push({ company: sequence.company, person_name: sequence.person_name, touch_number: email.touch_number, pattern: "url_in_body" });
      }
    }
  }
  if (hits.length) throw new Error(`chunked review quality gate failed: ${JSON.stringify(hits.slice(0, 12))}`);
}

function buildPrompt(chunk, label, totalLabel) {
  return [
    "You are running as the GNK Email Sequence Reviewer agent.",
    "",
    `Chunk ${label} of ${totalLabel}. Review and improve ONLY the person_email_sequences in this file.`,
    "",
    "Use GPT-5.5 high reasoning to improve cold email quality, but keep the founder voice natural and conservative.",
    "",
    "Hard rules:",
    "- Return only valid JSON.",
    "- Preserve exactly seven emails per person.",
    "- Do not add links or URLs to bodies or signatures.",
    "- Use this exact signature in every body: Andrew Gordienko / Co-founder / G&K Software.",
    "- Do not use: \"I'm Andrew, one of the founders at G&K Software.\"",
    "- Do not use: \"For context, G&K is\".",
    "- Prefer: \"I'm Andrew, from G&K Software.\" followed by a short human explanation.",
    "- Do not say a hiring signal proves pain. Use hiring as how Andrew found the company.",
    "- Do not mention price, commission, quota, revenue floor, rent, one-month $40k, or internal sales strategy.",
    "- Avoid internal labels like bounded slice, contract slice, commercial floor, deal tier, or technical rescue read.",
    "- Avoid over-compressing. Strong first-touch emails should feel like the good examples: human, specific, complete, low-pressure.",
    "- Make the first paragraph about the company or trigger when possible, not Andrew's research process.",
    "- Vary the G&K intro. Do not make every email sound identical.",
    "- Include at least one concrete noun tied to the account when supported by the input.",
    "- Softer CTAs are preferred, but they must be context-specific: Would a short outline be useful? / Is there someone closer to this workflow I should send the practical version to? / Would it be useful to compare notes on whether there is a well-defined piece of work here?",
    "",
    "Copy style to preserve:",
    "Hi Adam,",
    "",
    "I came across Clipbook while reading through your Founding Backend Engineer opening. It looks like you're at a stage where the core platform is still taking shape.",
    "",
    "I'm Andrew, from G&K Software. We're a small team of senior engineers who work with software companies on backend, platform, and infrastructure projects when the internal team needs something owned and delivered cleanly.",
    "",
    "The reason I reached out is that this stage of a company often comes with foundational engineering projects that are difficult to fit around day-to-day product work.",
    "",
    "Would it be useful to compare notes on whether there is a well-defined piece of work here?",
    "",
    "Output shape:",
    JSON.stringify(
      {
        person_sequence_reviews: [
          {
            company: "",
            person_name: "",
            title: "",
            overall_score_before: 0,
            overall_score_after: 0,
            strongest_touch: 1,
            weakest_touch: 1,
            main_issues: [],
            changes_made: [],
            send_readiness: "ready"
          }
        ],
        improved_person_email_sequences: []
      },
      null,
      2
    ),
    "",
    "Input sequences:",
    JSON.stringify(chunk, null, 2)
  ].join("\n");
}

async function runChunk(chunk, label, totalLabel) {
  const dir = fromRoot("data", "run-inputs");
  await fs.mkdir(dir, { recursive: true });
  const promptPath = fromRoot("data", "run-inputs", `gnk-email-review-chunk-${label}.md`);
  await fs.writeFile(promptPath, buildPrompt(chunk, label, totalLabel));

  const args = [
    "agent",
    "--agent",
    REVIEWER_ID,
    "--session-key",
    `agent:${REVIEWER_ID}:chunk:${Date.now().toString(36)}:${label}`,
    "--message",
    `Read ${promptPath}, follow it exactly, and return only the JSON object requested there.`,
    "--json",
    "--timeout",
    "900",
    "--thinking",
    "high"
  ];
  const { stdout } = await execFileAsync("openclaw", args, {
    cwd: fromRoot(),
    maxBuffer: 1024 * 1024 * 32
  });
  return extractJson(extractText(JSON.parse(stdout.slice(stdout.indexOf("{")))));
}

async function readCachedChunk(label) {
  try {
    return JSON.parse(await fs.readFile(`${CHUNK_RESULT_DIR}/${label}.json`, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCachedChunk(label, result) {
  await fs.mkdir(CHUNK_RESULT_DIR, { recursive: true });
  await fs.writeFile(`${CHUNK_RESULT_DIR}/${label}.json`, `${JSON.stringify(result, null, 2)}\n`);
}

async function reviewChunkRecursive(chunk, label, totalLabel) {
  const cached = await readCachedChunk(label);
  if (cached) {
    const cachedSequences = cached.improved_person_email_sequences || [];
    if (cachedSequences.length === chunk.length) {
      validateSequences(cachedSequences);
      console.log(`loaded cached chunk ${label}: ${cachedSequences.length} sequences`);
      return cached;
    }
  }

  const result = await runChunk(chunk, label, totalLabel);
  await writeCachedChunk(label, result);
  const chunkSequences = result.improved_person_email_sequences || [];

  if (chunkSequences.length === chunk.length) {
    validateSequences(chunkSequences);
    console.log(`reviewed chunk ${label}: ${chunkSequences.length} sequences`);
    return result;
  }

  if (chunk.length <= 1) {
    throw new Error(`Chunk ${label} returned ${chunkSequences.length} sequences for ${chunk.length} input.`);
  }

  console.log(`chunk ${label} returned ${chunkSequences.length}/${chunk.length}; splitting and retrying`);
  const midpoint = Math.ceil(chunk.length / 2);
  const left = await reviewChunkRecursive(chunk.slice(0, midpoint), `${label}a`, totalLabel);
  const right = await reviewChunkRecursive(chunk.slice(midpoint), `${label}b`, totalLabel);
  return {
    person_sequence_reviews: [...(left.person_sequence_reviews || []), ...(right.person_sequence_reviews || [])],
    improved_person_email_sequences: [...(left.improved_person_email_sequences || []), ...(right.improved_person_email_sequences || [])]
  };
}

function companyMaps(sequences) {
  const byCompany = new Map();
  for (const sequence of sequences) {
    if (!byCompany.has(sequence.company)) byCompany.set(sequence.company, []);
    byCompany.get(sequence.company).push(sequence);
  }
  return [...byCompany.entries()].map(([company, seqs]) => ({
    company,
    primary_person: seqs[0]?.person_name || "",
    people: seqs.map((seq) => seq.person_name),
    quality_notes: "Reviewed in chunked GPT-5.5 high passes against the GNK cold-email guardrails.",
    send_order_notes: `Start with ${seqs[0]?.person_name || "the strongest buyer"}; use alternates as buyer, evaluator, or routing paths.`
  }));
}

async function main() {
  const state = await readState();
  const baseArtifact = state.artifacts?.[REVIEWER_SLUG];
  const inputSequences = baseArtifact?.improved_person_email_sequences || baseArtifact?.person_email_sequences || [];
  if (!inputSequences.length) throw new Error("No email sequences are available to review.");

  const chunkList = chunks(inputSequences, CHUNK_SIZE);
  const chunkResults = new Array(chunkList.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < chunkList.length) {
      const index = nextIndex;
      nextIndex += 1;
      const label = String(index + 1).padStart(2, "0");
      const result = await reviewChunkRecursive(chunkList[index], label, String(chunkList.length).padStart(2, "0"));
      const chunkSequences = result.improved_person_email_sequences || [];
      if (chunkSequences.length !== chunkList[index].length) {
        throw new Error(`Chunk ${index + 1} returned ${chunkSequences.length} sequences for ${chunkList[index].length} inputs.`);
      }
      validateSequences(chunkSequences);
      chunkResults[index] = result;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunkList.length) }, () => worker()));

  const reviewedSequences = [];
  const reviews = [];
  for (const result of chunkResults) {
    reviewedSequences.push(...(result.improved_person_email_sequences || []));
    reviews.push(...(result.person_sequence_reviews || []));
  }

  validateSequences(reviewedSequences);

  const artifact = {
    ...(baseArtifact || {}),
    review_summary: `Chunked GPT-5.5 high review regenerated seven-touch sequences for ${reviewedSequences.length} unique CRM leads.`,
    global_findings: [
      {
        finding: "The reviewer now prioritizes human founder copy over compressed internal strategy language.",
        severity: "high",
        fix_applied: "Regenerated all sequences in chunks with explicit no-link, Andrew-from-G&K, company-first, and concrete-noun guardrails."
      }
    ],
    person_sequence_reviews: reviews,
    improved_person_email_sequences: reviewedSequences,
    company_review_maps: companyMaps(reviewedSequences),
    recommended_send_order: [...new Set(reviewedSequences.map((sequence) => sequence.company).filter(Boolean))],
    reviewer_rules: [
      "Stop on clear no, routing reply, meeting request, or pause request.",
      "Verify guessed emails before sending.",
      "Each follow-up must add new context.",
      "Do not include links in outbound bodies or signatures.",
      "Use a human Andrew-from-G&K intro rather than boilerplate."
    ],
    source_notes: [
      ...(baseArtifact?.source_notes || []),
      `Regenerated by ${REVIEWER_ID} using openai/gpt-5.5 with thinking high in ${chunkList.length} chunks.`,
      `Chunk size: ${CHUNK_SIZE}.`
    ].slice(-20)
  };

  await fs.writeFile(FULL_ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  const registry = await readRegistry();
  const agent = registry.agents.find((candidate) => candidate.slug === REVIEWER_SLUG);
  const now = new Date().toISOString();
  state.artifacts[REVIEWER_SLUG] = artifact;
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
    summary: `${agent.name} published chunked GPT-5.5 high reviewed sequences`,
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
        sequences: reviewedSequences.length,
        emails: reviewedSequences.reduce((count, sequence) => count + sequence.emails.length, 0),
        chunks: chunkList.length,
        concurrency: CONCURRENCY,
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
