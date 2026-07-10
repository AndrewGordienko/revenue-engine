const RULES = [
  { intent: "unsubscribe", re: /\b(unsubscribe|remove me|stop (?:emailing|contacting)|do not contact|don't contact)\b/i, next_action: "suppress_contact" },
  { intent: "referral", re: /\b(speak|talk|reach out|contact|forward(?:ed)?|connect)\b.{0,60}\b(to|with)\b|\b(correct|right|best) person\b/i, next_action: "map_referred_buyer" },
  { intent: "positive", re: /\b(interested|sounds good|let'?s (?:talk|meet)|book|schedule|send (?:it|that|details)|open to|worth exploring|yes[, .!])\b/i, next_action: "book_qualified_call" },
  { intent: "defer", re: /\b(not now|later|next quarter|next year|circle back|revisit|too busy|after (?:the|our)|in \w+)\b/i, next_action: "set_dated_follow_up" },
  { intent: "negative", re: /\b(not interested|no thanks|no thank you|not a fit|pass on this)\b/i, next_action: "close_or_nurture" },
];

const OBJECTIONS = [
  ["budget", /\b(budget|cost|price|expensive|afford|funding)\b/i],
  ["timing", /\b(timing|not now|later|quarter|busy|roadmap|priority)\b/i],
  ["authority", /\b(not my (?:area|team|decision)|wrong person|don't own|do not own)\b/i],
  ["fit", /\b(not a fit|don't need|do not need|no use case|irrelevant)\b/i],
  ["proof", /\b(case stud|reference|accuracy|coverage|sla|reliab|proof|customer)\b/i],
  ["procurement", /\b(procurement|vendor|security review|legal|compliance|rfp)\b/i],
  ["existing_solution", /\b(already (?:have|use)|built in-house|current provider|existing vendor)\b/i],
];

export function classifyReply(text) {
  const body = String(text || "").trim();
  if (!body) return { intent: "neutral", sentiment: "neutral", objections: [], is_positive: false, confidence: 0, next_action: "human_review" };
  const match = RULES.find((rule) => rule.re.test(body));
  const objections = OBJECTIONS.filter(([, re]) => re.test(body)).map(([code]) => code);
  const intent = match?.intent || (objections.length ? "objection" : "neutral");
  const sentiment = intent === "positive" || intent === "referral"
    ? "positive"
    : ["negative", "unsubscribe"].includes(intent) ? "negative" : "neutral";
  return {
    intent,
    sentiment,
    objections,
    is_positive: intent === "positive" || intent === "referral",
    confidence: match || objections.length ? 0.8 : 0.35,
    next_action: match?.next_action || (objections.length ? "address_objection_or_disqualify" : "human_review"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reply = process.argv.slice(2).join(" ");
  if (!reply) {
    console.error('Usage: npm run classify:reply -- "reply text"');
    process.exit(1);
  }
  console.log(JSON.stringify(classifyReply(reply), null, 2));
}
