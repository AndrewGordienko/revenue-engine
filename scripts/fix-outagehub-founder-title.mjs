import fs from "node:fs/promises";
import path from "node:path";

const TARGET_FILES = [
  "data/state.json",
  "data/leads-outagehub.jsonl",
  "agents/outagehub-email-drafter/instructions.md",
  "agents/outagehub-email-sequence-drafter/instructions.md",
  "agents/outagehub-email-sequence-reviewer/instructions.md",
  "scripts/generate-outagehub-lead-sequences.mjs"
];

function fixText(value) {
  return String(value)
    .replace(/Co-founder at OutageHub/g, "Founder at OutageHub")
    .replace(/`Co-founder`/g, "`Founder`")
    .replace(/I'm Andrew, one of the founders at OutageHub\./g, "I'm Andrew, founder of OutageHub.")
    .replace(/I am Andrew, one of the founders at OutageHub\./g, "I am Andrew, founder of OutageHub.")
    .replace(/Andrew Gordienko\nCo-founder\nOutageHub/g, "Andrew Gordienko\nFounder\nOutageHub")
    .replace(/\nCo-founder\nOutageHub/g, "\nFounder\nOutageHub")
    .replace(/Andrew Gordienko\\nCo-founder\\nOutageHub/g, "Andrew Gordienko\\nFounder\\nOutageHub")
    .replace(/\\nCo-founder\\nOutageHub/g, "\\nFounder\\nOutageHub");
}

async function outagehubArtifactFiles() {
  const dir = "data/artifacts";
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("outagehub-") && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name));
}

async function fixFile(filePath) {
  const before = await fs.readFile(filePath, "utf8");
  const after = fixText(before);
  if (after !== before) await fs.writeFile(filePath, after);
  return {
    filePath,
    changed: after !== before,
    remaining: (after.match(/Co-founder(?:\\n|\n)OutageHub|one of the founders at OutageHub|Co-founder at OutageHub/g) || []).length
  };
}

const files = [...TARGET_FILES, ...(await outagehubArtifactFiles())];
const results = [];
for (const filePath of files) {
  try {
    results.push(await fixFile(filePath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

console.log(JSON.stringify({ ok: true, changed: results.filter((r) => r.changed).length, results }, null, 2));
