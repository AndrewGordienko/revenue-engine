const DATE_LINE = /^Connected on (.+)$/;
const PROFILE_PICTURE = /(?:’s|'s) profile picture$/i;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeConnectionName(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isoDate(value) {
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function parseLinkedinConnectionsText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const records = [];
  let previousMessage = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = clean(lines[index]);
    if (line === "Message") {
      previousMessage = index;
      continue;
    }
    const match = line.match(DATE_LINE);
    if (!match) continue;
    const segment = lines.slice(previousMessage + 1, index)
      .map(clean)
      .filter(Boolean)
      .filter((item) => !PROFILE_PICTURE.test(item));
    const name = segment.length >= 2 ? segment.at(-2) : segment.at(-1) || "";
    const headline = segment.length >= 2 ? segment.at(-1) : "";
    const connected_on = isoDate(match[1]);
    if (!name || !connected_on) continue;
    records.push({
      name,
      headline,
      connected_on,
      source_line: index + 1,
    });
  }

  const seen = new Set();
  return records.filter((record) => {
    const key = `${normalizeConnectionName(record.name)}|${record.connected_on}`;
    if (!normalizeConnectionName(record.name) || seen.has(key)) return false;
    seen.add(key);
    record.identity_key = `linkedin-connection:${key}`;
    return true;
  });
}

const RULES = {
  outagehub: [
    [8, /\b(outage|electric utility|power utility|power grid|grid operations|electricity distribution|power generation)\b/, "power/outage operations"],
    [6, /\b(utility|utilities|energy operations|power systems|smart grid|distribution system operator)\b/, "utility or grid"],
    [5, /\b(telecom|telecommunications|wireless|wireline|internet service provider|\bisp\b|network operations|network automation|network engineering|network analyst|network support|\bnoc\b)\b/, "telecom/network operations"],
    [5, /\b(emergency management|incident management|business continuity|disaster recovery)\b/, "incident or emergency workflow"],
    [4, /\b(claims|insurance|underwriting operations|risk operations|risk management)\b/, "claims/risk workflow"],
    [4, /\b(facilities director|facilities manager|property operations|building operations)\b/, "facility operations"],
    [5, /\b(field operations|field service|government operations cent(?:re|er)|public safety|municipal operations|regional control|control cent(?:re|er))\b/, "field/public operations"],
    [4, /\b(gis|geospatial|infrastructure monitoring|energy infrastructure|operational risk|transit operations|transportation operations)\b/, "infrastructure intelligence"],
    [5, /\b(data cent(?:re|er) operations|critical infrastructure|resilience operations|service assurance)\b/, "critical-infrastructure operations"],
  ],
  gnk: [
    [8, /\b(cto|chief technology officer|chief technical officer|vp engineering|vice president of engineering|head of engineering)\b/, "senior engineering buyer"],
    [6, /\b(director of engineering|engineering director|engineering manager|software engineering manager|technical founder)\b/, "engineering leadership"],
    [5, /\b(backend|platform engineering|platform engineer|site reliability|\bsre\b|devops|cloud architect|solutions architect|systems architect)\b/, "backend/platform systems"],
    [5, /\b(software engineer|software developer|full.?stack|data engineer|machine learning|ai engineer|artificial intelligence|cybersecurity|computer security)\b/, "software/data/AI"],
    [4, /\b(technology leader|technology executive|head of technology|technical lead|engineering lead|product engineering)\b/, "technology leadership"],
    [3, /\b(software|saas|cloud|api|data platform|digital transformation)\b/, "technology context"],
    [5, /\b(mainframe|legacy modernization|application development|enterprise applications|systems engineer|systems engineering|system analyst|business systems|database administrator|integration architect|solution architect|technical project manager|technical product manager|information technology|technologie de l'information|it security)\b/, "modernization or business systems"],
    [4, /\b(qa lead|quality assurance|test automation|process automation|workflow automation|product owner|product management|technical program manager)\b/, "software delivery or automation"],
    [4, /\b(technology|innovation|\bai\b|\bml\b|machine learning|data analytics|analytics and insights|technical manager|principal architect|solution engineer|client partner|research engineer|research scientist|computing science)\b/, "technology or innovation relationship"],
  ],
  morrow: [
    [10, /\b(robotics?|robot learning|physical ai|embodied ai|robot manipulation|autonomous manipulation|humanoid robots?|roboticist)\b/, "robotics or physical-AI research"],
    [8, /\b(robotic automation|industrial automation|factory automation|packaging automation)\b/, "industrial automation"],
    [7, /\b(plant manager|plant operations|manufacturing engineering|manufacturing manager|production manager|factory manager)\b/, "plant/manufacturing owner"],
    [6, /\b(packaging|co.?pack|kitting|fulfilment|fulfillment|warehouse operations|distribution centre|distribution center)\b/, "packing/fulfilment workflow"],
    [5, /\b(continuous improvement|operational excellence|industrial engineer|maintenance manager|maintenance director)\b/, "continuous improvement/maintenance"],
    [5, /\b(supply chain|procurement|strategic sourcing|logistics|fleet maintenance|material handling|parcel|inventory planning)\b/, "supply-chain operations"],
    [4, /\b(manufacturing|production|warehouse|factory|plant)\b/, "operating environment"],
  ],
};

function scoreRules(text, rules) {
  let score = 0;
  const reasons = [];
  for (const [weight, pattern, reason] of rules) {
    if (!pattern.test(text)) continue;
    score += weight;
    reasons.push(reason);
  }
  return { score, reasons };
}

export function classifyLinkedinConnection(record) {
  const text = clean(`${record.headline || ""}`).toLowerCase();
  const scored = Object.fromEntries(Object.entries(RULES).map(([product, rules]) => [product, scoreRules(text, rules)]));
  const addScore = (product, score, reason) => {
    scored[product].score += score;
    if (!scored[product].reasons.includes(reason)) scored[product].reasons.push(reason);
  };
  const authority = /\b(cto|ceo|coo|cio|chief|founder|co.?founder|owner|president|vice president|vp|head|director|manager|leader|principal)\b/.test(text);
  const technologyRoute = /\b(software|developer|programmer|cloud|api|backend|platform|infrastructure|devops|site reliability|data engineer|data scientist|machine learning|ml engineer|artificial intelligence|ai engineer|cybersecurity|computer security|mainframe|modernization|systems analyst|solution architect|technical architect|product owner|technical product|technical program|qa lead|test lead|automation developer)\b/.test(text);
  const technologyOwner = /\b(cto|chief (?:technology|technical|data|information) officer|technical founder|vp engineering|vice president of engineering|head of engineering|director of engineering|engineering manager|head of technology|director of technology|head of ai|director of ai|head of data|director of data|head of product|vp product)\b/.test(text);
  const generalBusinessOwner = /\b(ceo|chief executive officer|coo|chief operating officer|founder|co.?founder|business owner|company owner|president|managing director|managing partner)\b/.test(text);
  const digitalBusinessContext = /\b(software|saas|cloud|api|data|digital|technology|tech|ai|automation|platform|cybersecurity|computer|systems)\b/.test(text);
  const physicalEngineeringOnly = /\b(aerospace|aircraft|avionics|propulsion|thermal|structures?|mechanical engineer|civil engineer|spacecraft|launch vehicle)\b/.test(text) && !technologyRoute;
  const researchRole = /\b(researcher|research scientist|research engineer|professor|phd candidate|doctoral candidate|postdoc|r&d engineer)\b/.test(text);
  const morrowResearchSignal = /\b(robotics?|robot learning|physical ai|embodied ai|robot manipulation|humanoid robots?|roboticist)\b/.test(text);
  if (technologyRoute) addScore("gnk", 4, "technical buyer, evaluator, or routing relationship");
  if (technologyOwner) addScore("gnk", 5, "technology ownership");
  if (generalBusinessOwner && digitalBusinessContext) addScore("gnk", 4, "business owner with a visible digital delivery context");
  if (physicalEngineeringOnly) {
    scored.gnk.score = 0;
    scored.gnk.reasons = [];
  }
  if (/\b(video|animation|film|television) production\b/.test(text)) {
    scored.morrow.score = 0;
    scored.morrow.reasons = [];
  }

  const order = ["morrow", "outagehub", "gnk"];
  order.sort((a, b) => scored[b].score - scored[a].score);
  const earlyCareer = /\b(student|intern|internship|undergraduate|junior|jr\.?|new grad|graduate student|masters student|masters candidate|phd student|phd candidate|bcom candidate|seeking opportunities|incoming (?:at|@)|class of)\b/.test(text);
  const peopleFunction = /\b(recruiter|recruiting|talent acquisition|talent partner|human resources|hr manager|people coordinator)\b/.test(text);
  const clearlyNonBuyer = /\b(medical student|retired|public relations|journalism|school co.?captain|student athlete|student-athlete)\b/.test(text);
  const bestProduct = order[0];
  const relevant = scored[bestProduct].score >= 4;
  const permittedMorrowResearch = bestProduct === "morrow" && morrowResearchSignal && researchRole;
  const excluded = (earlyCareer && !permittedMorrowResearch) || peopleFunction || clearlyNonBuyer;
  const winner = relevant && !excluded ? bestProduct : "other";
  let reasons;
  if (winner !== "other") {
    reasons = [...scored[winner].reasons, authority ? "buyer, owner, or senior router title" : "potential evaluator or warm routing relationship"];
  } else if (peopleFunction) {
    reasons = ["People/recruiting function; keep in the network but outside the current customer queues"];
  } else if (earlyCareer) {
    reasons = ["Early-career or student profile; no current buyer signal in the saved headline"];
  } else if (clearlyNonBuyer) {
    reasons = ["No current customer route in the saved headline"];
  } else {
    reasons = ["No product route detected from the saved headline; retain for manual review"];
  }
  const secondScore = scored[order[1]]?.score || 0;
  const winningScore = winner === "other" ? 0 : scored[winner].score;
  const classificationConfidence = winner === "other" ? "unmatched"
    : winningScore >= 12 && winningScore - secondScore >= 4 ? "strong"
      : winningScore >= 7 ? "probable" : "possible";
  const relationshipIntent = winner === "gnk" ? "gnk_sell"
    : winner === "outagehub" ? "outagehub_sell"
      : winner === "morrow" ? "morrow_research" : "other";
  const relationshipRole = winner === "gnk"
    ? (technologyOwner || (generalBusinessOwner && digitalBusinessContext) ? "buyer" : "technical_router")
    : winner === "outagehub"
      ? (authority ? "buyer_or_owner" : "workflow_router")
      : winner === "morrow"
        ? (researchRole || morrowResearchSignal ? "research_subject" : authority ? "workflow_owner" : "operator_subject")
        : peopleFunction ? "recruiting"
          : earlyCareer ? "early_career"
            : clearlyNonBuyer ? "unrelated"
              : physicalEngineeringOnly ? "physical_engineering_network" : "needs_context";
  return {
    primary_product: winner,
    relationship_intent: relationshipIntent,
    relationship_role: relationshipRole,
    classification_confidence: classificationConfidence,
    classification_score: winner === "other" ? 0 : scored[winner].score + (authority ? 2 : 0),
    product_scores: Object.fromEntries(Object.entries(scored).map(([product, value]) => [product, value.score])),
    classification_reason: `${relationshipIntent.replace(/_/g, " ")}; ${relationshipRole.replace(/_/g, " ")}; ${reasons.join("; ")}`,
  };
}

export function linkedinSearchUrl(record) {
  const query = clean(`${record.name} ${record.headline}`).slice(0, 180);
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query.toWellFormed())}`;
}

export function toCsv(rows) {
  const columns = [
    "id", "name", "headline", "connected_on", "primary_product", "relationship_intent",
    "relationship_role", "classification_confidence", "classification_score",
    "gnk_score", "outagehub_score", "morrow_score", "classification_reason",
    "profile_status", "profile_url", "linked_lead_id", "review_status",
    "contacted_at", "contact_channel",
  ];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => quote(
    column === "gnk_score" ? row.product_scores?.gnk
      : column === "outagehub_score" ? row.product_scores?.outagehub
      : column === "morrow_score" ? row.product_scores?.morrow
      : row[column],
  )).join(",")).join("\n")}\n`;
}
