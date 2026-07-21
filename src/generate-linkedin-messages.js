import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readLeads } from "./leads-store.js";
import { fromRoot } from "./paths.js";
import { buildLinkedinProspects, validateLinkedinProspects } from "./linkedin-prospects.js";

const OUTPUT_PATH = fromRoot("data", "inputs", "linkedin-connection-messages.json");
const MODEL = "gpt-5.6";
const FORBIDDEN_DASH = /[\u2013\u2014]/;

async function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const auth = JSON.parse(await fs.readFile(path.join(os.homedir(), ".codex", "auth.json"), "utf8"));
  if (!auth.OPENAI_API_KEY) throw new Error("No OpenAI API key found in the environment or ~/.codex/auth.json");
  return auth.OPENAI_API_KEY;
}

function responseText(payload) {
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("OpenAI response did not contain output_text");
}

function schema(expectedCount) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["messages"],
    properties: {
      messages: {
        type: "array",
        minItems: expectedCount,
        maxItems: expectedCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "person_name", "company", "linkedin_url", "observed_signal", "why_this_person",
            "stance", "connection_message", "evidence_urls", "generation_model"
          ],
          properties: {
            person_name: { type: "string" },
            company: { type: "string" },
            linkedin_url: { type: "string" },
            observed_signal: { type: "string" },
            why_this_person: { type: "string" },
            // The move to make. curious_question = a peer inquiry with NO capability claim
            // (the Nulogy pattern). Only bounded_claim uses what_we_can_do.
            stance: { type: "string", enum: ["curious_question", "bounded_claim", "route_ask"] },
            what_we_can_do: { type: ["string", "null"] },
            connection_message: { type: "string", maxLength: 299 },
            evidence_urls: { type: "array", items: { type: "string" } },
            generation_model: { type: "string", enum: [MODEL] }
          }
        }
      }
    }
  };
}

function systemPrompt(product) {
  const offer = product === "gnk"
    ? "GNK is Andrew's senior engineering team. Sell a tightly scoped backend, platform, integration, AI workflow, modernisation, or reliability sprint that reaches production and ends in a clean handoff. Never imply staff augmentation, invented client proof, or guaranteed outcomes."
    : "OutageHub puts Canadian power outage intelligence inside existing operational decisions through APIs and notifications. Sell a narrow pilot for claims, dispatch, facilities, customer status, pharmacy continuity, network operations, or site incident triage. Never imply utility affiliation, complete coverage, guaranteed accuracy, or another dashboard.";

  return `You are Andrew's LinkedIn connection-message agent. ${offer}

Write one genuinely tailored LinkedIn connection request for each supplied person.

Rules:
- Preserve person_name, company, and linkedin_url exactly as supplied.
- Maximum 299 characters including spaces. Aim for 180 to 270 characters.
- Never use an em dash or en dash. Use commas, periods, parentheses, or a colon.
- Use one specific supplied observed signal and connect it to this person's role.
- Choose a stance. For senior buyers, a "curious_question" (a genuine peer inquiry about how
  their operation works, with NO product claim and an explicit no-pitch stance, like "rather
  than guessing where we could fit") usually outperforms a pitch. Use "bounded_claim" only
  when a concrete capability is genuinely relevant, and put it in what_we_can_do. Use
  "route_ask" when the person is a router, not the owner. Under curious_question, what_we_can_do
  is null and the message must NOT claim a capability.
- Write like a technically credible founder, plain and direct.
- Do not invent a post, quote, personal interest, mutual connection, customer, metric, pain, project, or outcome.
- When the evidence is role-level, be explicit that the ownership link is a hypothesis.
- Avoid "caught my eye", "thought it would be useful to connect", "synergy", "pick your brain", and empty praise.
- Do not put a URL in the connection_message.
- observed_signal, why_this_person, and what_we_can_do are internal operator notes, not all of them need to fit in the request.
- Return the supplied evidence URLs only. Do not create URLs.
- Return all people in the supplied order.`;
}

async function generate(product, prospects) {
  const input = prospects.map((item) => ({
    person_name: item.name,
    company: item.company,
    title: item.title,
    linkedin_url: item.profile_url,
    segment: item.segment,
    observed_signal: item.observed_signal,
    why_this_person: item.why_this_person,
    what_we_can_do: item.what_we_can_do,
    evidence_urls: item.evidence_urls
  }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${await apiKey()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "high" },
      instructions: systemPrompt(product),
      input: JSON.stringify(input),
      max_output_tokens: 24000,
      text: {
        format: {
          type: "json_schema",
          name: `${product}_linkedin_connection_messages`,
          strict: true,
          schema: schema(prospects.length)
        }
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${payload.error?.message || JSON.stringify(payload)}`);
  const result = JSON.parse(responseText(payload));
  return { messages: result.messages, response_id: payload.id, usage: payload.usage || null };
}

function validateGenerated(product, expected, items) {
  const errors = [];
  if (items.length !== expected.length) errors.push(`${product}: expected ${expected.length} messages, found ${items.length}`);
  items.forEach((item, index) => {
    const source = expected[index];
    if (!source) return;
    if (item.person_name !== source.name) errors.push(`${product} #${index + 1}: person changed`);
    if (item.company !== source.company) errors.push(`${product} #${index + 1}: company changed`);
    if (item.linkedin_url !== source.profile_url) errors.push(`${product} #${index + 1}: LinkedIn URL changed`);
    if (!item.connection_message || item.connection_message.length > 299) errors.push(`${item.person_name}: invalid character count`);
    if (FORBIDDEN_DASH.test(item.connection_message)) errors.push(`${item.person_name}: forbidden dash`);
    if (/https?:\/\//i.test(item.connection_message)) errors.push(`${item.person_name}: URL inside note`);
    item.character_count = item.connection_message.length;
  });
  return errors;
}

const requested = process.argv.find((arg) => arg.startsWith("--product="))?.split("=")[1];
const products = requested ? [requested === "ohub" ? "outagehub" : requested] : ["gnk", "outagehub"];
const existing = await fs.readFile(OUTPUT_PATH, "utf8").then(JSON.parse).catch(() => ({}));
const output = { ...existing, generated_at: new Date().toISOString(), generation_model: MODEL };

for (const product of products) {
  if (product !== "gnk" && product !== "outagehub") throw new Error(`Unsupported product: ${product}`);
  const base = await buildLinkedinProspects(await readLeads(product), product, 30);
  const baseErrors = validateLinkedinProspects(base, 30);
  if (baseErrors.length) throw new Error(baseErrors.join("\n"));
  console.error(`${product}: generating ${base.length} messages with ${MODEL}`);
  const generated = await generate(product, base);
  const errors = validateGenerated(product, base, generated.messages);
  if (errors.length) throw new Error(errors.join("\n"));
  output[product] = generated.messages;
  output[`${product}_response_id`] = generated.response_id;
  output[`${product}_usage`] = generated.usage;
  console.error(`${product}: generated and validated ${generated.messages.length} messages`);
}

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(fromRoot(), OUTPUT_PATH), products, model: MODEL }, null, 2));
