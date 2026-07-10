import {
  getRelated,
  graphSummary,
  loadGraph,
  queryEntities
} from "./ontology.js";

// Thin query surface over the shared knowledge graph so agents and operators can
// ask the ontology structured questions instead of parsing Markdown/JSON blobs.
//
//   npm run ontology                                  # stats
//   npm run ontology -- stats
//   npm run ontology -- query --type Company --where '{"product":"gnk"}'
//   npm run ontology -- query --type Deal --where '{"stage":"replied"}'
//   npm run ontology -- related --id comp_xxxx --rel has_deal
//   npm run ontology -- get --id pers_xxxx

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "stats";
  const graph = await loadGraph();

  if (command === "stats") {
    console.log(JSON.stringify(graphSummary(graph), null, 2));
    return;
  }

  if (command === "query" || command === "list") {
    const where = args.where ? JSON.parse(args.where) : {};
    const results = queryEntities(graph, { type: args.type, where });
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (command === "get") {
    if (!args.id) throw new Error("get requires --id");
    console.log(JSON.stringify(graph.entities.get(args.id) || null, null, 2));
    return;
  }

  if (command === "related") {
    if (!args.id) throw new Error("related requires --id");
    const results = getRelated(graph, args.id, args.rel || null, args.dir || "both");
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}. Use stats | query | get | related.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
