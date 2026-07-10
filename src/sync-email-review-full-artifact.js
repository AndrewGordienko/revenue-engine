import fs from "node:fs/promises";
import { readState } from "./bus.js";

const FULL_ARTIFACT_PATH = "data/artifacts/gnk-email-sequence-reviewer-full.json";

async function main() {
  const state = await readState();
  const artifact = state.artifacts?.["gnk-email-sequence-reviewer"];

  if (!artifact?.improved_person_email_sequences?.length) {
    throw new Error("No gnk-email-sequence-reviewer artifact is present in state.");
  }

  await fs.writeFile(FULL_ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        sequences: artifact.improved_person_email_sequences.length,
        emails: artifact.improved_person_email_sequences.reduce((count, sequence) => count + (sequence.emails || []).length, 0),
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
