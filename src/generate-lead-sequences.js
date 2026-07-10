#!/usr/bin/env node

console.error(
  [
    "Deterministic email sequence generation is disabled.",
    "",
    "Do not generate fallback/template outreach copy for GNK.",
    "Run the GPT/OpenClaw agents instead:",
    "  node src/run-agent.js gnk-email-drafter",
    "  node src/run-agent.js gnk-email-sequence-drafter",
    "  node src/run-agent.js gnk-email-sequence-reviewer"
  ].join("\n")
);

process.exit(1);
