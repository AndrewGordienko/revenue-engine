import fs from "node:fs/promises";
import { fromRoot } from "../src/paths.js";

const ROLE_WORDS = /\b(team|owner|lead|manager|director|advisor|operations|product|platform|engineering|claims|support|facilities|router|buyer|contact|department|role|person|people|head|vp|chief|officer|noc|dispatch|risk|data|it)\b/i;

function normalizeProduct(value) {
  return value === "outagehub" || value === "ohub" ? "outagehub" : "gnk";
}

function leadsPath(product) {
  return fromRoot("data", `leads-${normalizeProduct(product)}.jsonl`);
}

function looksLikeNamedPerson(name) {
  const value = String(name || "").trim();
  if (!value || ROLE_WORDS.test(value) || /\bor\b/i.test(value)) return false;
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 5 && parts.every((part) => /^\p{Lu}[\p{L}'.-]+$/u.test(part));
}

async function readLeadsFile(product) {
  const path = leadsPath(product);
  try {
    const raw = await fs.readFile(path, "utf8");
    return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLeadsFile(product, leads) {
  const body = leads.map((lead) => JSON.stringify(lead)).join("\n");
  await fs.writeFile(leadsPath(product), body ? `${body}\n` : "");
}

const prune = process.argv.includes("--write");
for (const product of ["gnk", "outagehub"]) {
  const leads = await readLeadsFile(product);
  const pseudo = leads.filter((lead) => !looksLikeNamedPerson(lead.name));
  console.log(`${product}: ${pseudo.length} pseudo-person leads`);
  for (const lead of pseudo.slice(0, 20)) {
    console.log(`- ${lead.name} | ${lead.company} | ${lead.source_agent || ""}`);
  }

  if (prune && pseudo.length) {
    const keep = leads.filter((lead) => looksLikeNamedPerson(lead.name));
    await writeLeadsFile(product, keep);
    console.log(`${product}: pruned ${leads.length - keep.length}, kept ${keep.length}`);
  }
}
