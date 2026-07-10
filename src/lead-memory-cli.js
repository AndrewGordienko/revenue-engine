import { readLeads } from "./leads-store.js";
import {
  leadMemory,
  memorySummary,
  readMemoryEvents,
  reduceLeadMemory
} from "./lead-memory.js";

// Query surface over per-lead memory so agents and operators can ask what we
// already know and have done with a lead, instead of re-deriving it.
//
//   npm run lead-memory                                  # stats
//   npm run lead-memory -- stats --product gnk
//   npm run lead-memory -- lead --id lead_xxx
//   npm run lead-memory -- find --name "Matt Aitken"
//   npm run lead-memory -- summary                       # leadId -> counts

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
}

function norm(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "stats";
  const product = args.product || "gnk";

  if (command === "stats") {
    const events = await readMemoryEvents(product);
    const byType = {};
    for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;
    const summary = await memorySummary(product);
    console.log(
      JSON.stringify({ product, events: events.length, leads_with_memory: Object.keys(summary).length, byType }, null, 2)
    );
    return;
  }

  if (command === "summary") {
    console.log(JSON.stringify(await memorySummary(product), null, 2));
    return;
  }

  if (command === "lead") {
    if (!args.id) throw new Error("lead requires --id");
    console.log(JSON.stringify(await leadMemory(product, args.id), null, 2));
    return;
  }

  if (command === "find") {
    if (!args.name) throw new Error("find requires --name");
    const leads = await readLeads(product);
    const wanted = norm(args.name);
    const match = leads.find((lead) => norm(lead.name) === wanted) ||
      leads.find((lead) => norm(lead.name).includes(wanted));
    if (!match) {
      console.log(JSON.stringify({ found: false }, null, 2));
      return;
    }
    const events = await readMemoryEvents(product, match.id);
    console.log(
      JSON.stringify(
        { found: true, lead: { id: match.id, name: match.name, company: match.company, stage: match.stage }, ...reduceLeadMemory(events) },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command: ${command}. Use stats | summary | lead | find.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
