import { db } from "./db.js";

const CONFIG = {
  gnk: {
    belief: "One production bottleneck attached to a live AI, implementation, integration, or reliability initiative is more sellable than general software development.",
    buyer: "Founder/CTO, VP Engineering, VP Product, or the accountable AI, platform, integration, or reliability leader.",
    problem: "A commercially important system is stuck between prototype and reliable production, or customer delivery is constrained by integrations and senior capacity.",
    offer: "A bounded 4-6 week production AI, client integration, or backend reliability sprint.",
    triggers: ["AI product launch", "AI/platform/integration hiring", "enterprise implementation growth", "migration", "customer delivery backlog", "production incident"],
    avoid: ["No live initiative", "Technically adjacent but no ownership", "Large consultancy peer rather than buyer", "Team already solved the proposed layer"],
    formula: "Verified initiative -> one likely delivery burden -> one bounded slice GNK can own -> ask to hop on a call and test whether the burden exists.",
    themes: [
      { key: "production-ai", title: "AI workflows are moving into production systems", thesis: "The useful target is not any company mentioning AI. It is a team integrating AI into a customer or operating workflow where evaluation, observability, fallback, data, or integration now blocks release.", buyers: "CTO, VP Engineering, AI/platform leader", problem: "Productionization and integration burden", implication: "Lead with one production workflow sprint", signals: ["AI launch", "agent/copilot hiring", "evaluation or observability role", "enterprise rollout"], contradicts: ["Internal team already owns the complete production layer", "No external capacity path"] },
      { key: "implementation", title: "Customer implementation is becoming product work", thesis: "Technical companies with growing enterprise customers often accumulate integrations and launch obligations that core product teams cannot absorb without slowing the roadmap.", buyers: "VP Product, VP Engineering, founder", problem: "Revenue or launch blocked by implementation backlog", implication: "Sell a client integration launch sprint", signals: ["new enterprise customer", "implementation hiring", "integration partnerships"], contradicts: ["No visible customer delivery pressure"] },
      { key: "reliability", title: "Reliability becomes urgent around growth and migration", thesis: "A bounded rescue is credible when an incident, migration, scaling event, or data-path bottleneck creates an immediate operating consequence.", buyers: "CTO, platform/reliability owner", problem: "Revenue-critical service or data path is unreliable", implication: "Sell a backend reliability rescue", signals: ["incident", "migration", "platform consolidation", "rapid traffic growth"], contradicts: ["No defined service or consequence"] },
    ],
  },
  outagehub: {
    belief: "OutageHub is most credible as external cross-utility power-event context embedded beside existing telemetry and operating systems.",
    buyer: "Monitoring/IoT product manager, telecom NOC or command-center leader, field-operations owner, resilience/emergency leader, and attached integration owner.",
    problem: "A team needs external regional power context to explain, prioritize, or communicate an operational event across Canadian utility territories.",
    offer: "A bounded selected-region evaluation and integration, followed by recurring data delivery.",
    triggers: ["regional monitoring product", "telecom incident workflow", "field dispatch problem", "resilience program", "cross-utility coverage need"],
    avoid: ["Generic field operations", "Architect too far from workflow", "Replacement framing for SCADA/telemetry", "No geography or operating action"],
    formula: "Name the workflow -> explain external context across 50+ Canadian utilities -> position beside internal systems -> ask how they handle that context today.",
    themes: [
      { key: "embedded-context", title: "Monitoring products need external event context", thesis: "Building, risk, IoT, and incident platforms can add Canadian outage context without becoming utility-data collectors themselves.", buyers: "Product manager, platform/integration owner", problem: "Product lacks normalized external regional outage context", implication: "Lead with a bounded embedded-data evaluation", signals: ["monitoring platform", "Canadian expansion", "incident-context feature"], contradicts: ["No product surface where context changes a decision"] },
      { key: "telecom-command", title: "Telecom and command centers need faster regional explanation", thesis: "Grid events can help explain clusters of network/site incidents and prioritize diagnosis, but only when tied to a defined NOC or field workflow.", buyers: "NOC, command center, network assurance, field operations", problem: "Regional service issues require external power context", implication: "Lead with correlation and triage, not replacement detection", signals: ["regional incident", "field dispatch", "site power resilience"], contradicts: ["Generators/site sensors already solve the only proposed action"] },
      { key: "resilience", title: "Resilience teams need cross-boundary awareness", thesis: "Selected-region alerts and historical context are useful when emergency or resilience teams monitor multiple utility territories and need one external view.", buyers: "Emergency management, resilience, command center", problem: "Fragmented utility boundaries slow situational awareness", implication: "Offer selected-region alerting and historical evaluation", signals: ["regional resilience program", "multi-jurisdiction operations"], contradicts: ["No defined region, latency need, or response action"] },
    ],
  },
  morrow: {
    belief: "The first commercial wedge is one high-variation, labor-intensive packing, kitting, or material-handling workflow that fixed automation handles poorly.",
    buyer: "Packaging, continuous improvement, manufacturing/automation engineering, production, warehouse, or site operations owner.",
    problem: "Variation, changeovers, labor, ergonomics, or errors make a bounded physical workflow expensive or difficult to automate.",
    offer: "A 4-8 week paid design-partner pilot around one measurable cell, workflow, or SKU family.",
    triggers: ["labor/turnover pressure", "high-mix packaging", "frequent changeovers", "automation review", "new line/site", "quality or ergonomics issue"],
    avoid: ["Generic supply chain", "Robotics peer without deployment ownership", "Research interest without site access", "No bounded or measurable workflow"],
    formula: "Name the physical workflow -> ask about variation/labor/changeovers -> briefly state the adaptive automation direction -> ask to hop on a call about the workflow.",
    themes: [
      { key: "high-mix", title: "High-mix packing remains difficult for fixed automation", thesis: "Variation in products, packaging, orientation, and changeovers can leave manual work where conventional automation is too brittle or expensive.", buyers: "Packaging, automation engineering, continuous improvement", problem: "Manual variable packing or kitting", implication: "Lead with one bounded high-mix workflow", signals: ["many SKUs", "frequent changeovers", "manual packing cell"], contradicts: ["Stable high-volume task already economically automated"] },
      { key: "labor", title: "Labor and ergonomics can create a near-term pilot path", thesis: "A workflow becomes commercially interesting when repetitive labor, turnover, injury risk, quality, or throughput creates a measurable consequence.", buyers: "Plant/site leader, production, CI", problem: "Labor-dependent repetitive work", implication: "Qualify baseline labor, cycle time, errors, and interventions", signals: ["hiring difficulty", "ergonomic initiative", "quality loss"], contradicts: ["No measured consequence or owner"] },
      { key: "brownfield", title: "Brownfield fit matters more than a futuristic robot story", thesis: "The sale depends on fitting an existing cell, workflow, safety environment, and production cadence, not leading with humanoids or world-model language.", buyers: "Manufacturing/automation engineering, site operations", problem: "Existing automation cannot adapt economically", implication: "Lead with workflow access and deployment constraints", signals: ["automation retrofit", "cell redesign", "flexibility requirement"], contradicts: ["No site access or deployment champion"] },
    ],
  },
};

function json(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function firstOutbound(messages) {
  return messages.find((message) => message.direction === "outbound") || null;
}

function lengthBucket(words) {
  if (words <= 70) return "short";
  if (words <= 110) return "medium";
  return "long";
}

export function syncPlaybookKnowledge(database = db()) {
  const t = new Date().toISOString();
  let theses = 0;
  let matches = 0;
  let observations = 0;
  for (const [venture, config] of Object.entries(CONFIG)) {
    for (const theme of config.themes) {
      database.prepare(`INSERT INTO market_theses
        (venture,theme_key,thesis,buyer_roles,buyer_problem,offer_implication,supporting_evidence,
         contradicting_evidence,confidence,status,approved_by,reviewed_at,review_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,'directional','approved','Andrew via SalesV3 2.1 brief',?,?,?,?)
        ON CONFLICT(venture,theme_key) DO UPDATE SET thesis=excluded.thesis,buyer_roles=excluded.buyer_roles,
        buyer_problem=excluded.buyer_problem,offer_implication=excluded.offer_implication,
        supporting_evidence=excluded.supporting_evidence,contradicting_evidence=excluded.contradicting_evidence,
        confidence=excluded.confidence,status=excluded.status,approved_by=excluded.approved_by,reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at`)
        .run(venture, theme.key, theme.thesis, JSON.stringify([theme.buyers]), theme.problem, theme.implication,
          JSON.stringify(theme.signals), JSON.stringify(theme.contradicts), t,
          new Date(Date.now() + 30 * 86400000).toISOString(), t, t);
      theses += 1;
      const targets = database.prepare(`SELECT id,name,classification_score,classification_reason,product_scores,profile_status
        FROM linkedin_connections WHERE primary_product=? AND review_status<>'dismissed'
        ORDER BY classification_score DESC,name LIMIT 40`).all(venture);
      for (const target of targets) {
        database.prepare(`INSERT INTO target_matches
          (venture,theme_key,entity_type,entity_id,components,reason,evidence_gaps,recommended_angle,status,created_at,updated_at)
          VALUES(?,?,'connection',?,?,?,?,?,'proposed',?,?)
          ON CONFLICT(venture,theme_key,entity_type,entity_id) DO UPDATE SET components=excluded.components,
          reason=excluded.reason,evidence_gaps=excluded.evidence_gaps,recommended_angle=excluded.recommended_angle,updated_at=excluded.updated_at`)
          .run(venture, theme.key, String(target.id), JSON.stringify({
            venture_fit: target.classification_score,
            product_scores: json(target.product_scores, {}),
            evidence_quality: target.profile_status === "search" ? "needs_profile_confirmation" : "profile_confirmed",
          }), target.classification_reason || theme.problem,
          JSON.stringify(target.profile_status === "search" ? ["exact_profile", "company_trigger", "problem_ownership"] : ["company_trigger", "problem_ownership"]),
          `${theme.signals[0]} -> ${theme.problem} -> ${theme.implication}`, t, t);
        matches += 1;
      }
    }
    database.prepare(`INSERT INTO message_learnings
      (venture,rule_key,statement,supporting_counts,confidence,status,approved_by,created_at,updated_at)
      VALUES(?,'current-message-formula',?,'{}','operating_rule','approved','Andrew via SalesV3 2.1 brief',?,?)
      ON CONFLICT(venture,rule_key) DO UPDATE SET statement=excluded.statement,status='approved',approved_by=excluded.approved_by,updated_at=excluded.updated_at`)
      .run(venture, config.formula, t, t);
  }

  const conversations = database.prepare("SELECT id,product,play_id,response_theme FROM linkedin_conversations").all();
  const outcomeByConversation = new Map(database.prepare("SELECT conversation_id,primary_outcome FROM conversation_outcomes").all().map((row) => [row.conversation_id, row.primary_outcome]));
  for (const conversation of conversations) {
    const messages = database.prepare("SELECT * FROM linkedin_messages WHERE conversation_id=? ORDER BY sent_at,id").all(conversation.id);
    let touch = 0;
    for (const message of messages) {
      if (message.direction !== "outbound") continue;
      touch += 1;
      const words = message.body.trim().split(/\s+/).filter(Boolean).length;
      const askType = /\b(call|chat|discuss|conversation)\b/i.test(message.body) ? "call" : /\b(question|thought|how do you)\b/i.test(message.body) ? "question" : "unspecified";
      database.prepare(`INSERT INTO message_observations
        (message_id,conversation_id,venture,play_id,touch_number,message_type,word_count,length_bucket,
         ask_type,trigger_type,outcome,sent_at,created_at)
        VALUES(?,?,?,?,?,'linkedin_dm',?,?,?,?,?,?,?)
        ON CONFLICT(message_id) DO UPDATE SET play_id=excluded.play_id,touch_number=excluded.touch_number,
        word_count=excluded.word_count,length_bucket=excluded.length_bucket,ask_type=excluded.ask_type,
        outcome=excluded.outcome`)
        .run(message.id, conversation.id, conversation.product, conversation.play_id, touch, words, lengthBucket(words),
          askType, "unclassified", outcomeByConversation.get(conversation.id) || conversation.response_theme || "no_reply", message.sent_at, t);
      observations += 1;
    }
  }
  return { theses, matches, observations };
}

export function buildPlaybooks(database = db()) {
  const conversations = database.prepare(`SELECT c.*,o.primary_outcome,o.confirmed_by,o.correction_text
    FROM linkedin_conversations c LEFT JOIN conversation_outcomes o ON o.conversation_id=c.id ORDER BY c.id`).all();
  const messages = database.prepare("SELECT * FROM linkedin_messages ORDER BY conversation_id,sent_at,id").all();
  const byConversation = new Map();
  for (const message of messages) {
    if (!byConversation.has(message.conversation_id)) byConversation.set(message.conversation_id, []);
    byConversation.get(message.conversation_id).push(message);
  }
  const observations = conversations.map((conversation) => {
    const thread = byConversation.get(conversation.id) || [];
    const opener = firstOutbound(thread);
    const wordCount = opener ? opener.body.trim().split(/\s+/).filter(Boolean).length : 0;
    const firstInboundIndex = thread.findIndex((message) => message.direction === "inbound");
    const outboundBeforeReply = firstInboundIndex < 0 ? 0 : thread.slice(0, firstInboundIndex).filter((message) => message.direction === "outbound").length;
    return { conversation, opener, wordCount, bucket: lengthBucket(wordCount), replied: Number(conversation.inbound_count) > 0, outboundBeforeReply };
  }).filter((row) => row.opener);

  const portfolioLength = Object.fromEntries(["short", "medium", "long"].map((bucket) => {
    const bucketRows = observations.filter((row) => row.bucket === bucket);
    const replies = bucketRows.filter((row) => row.replied).length;
    return [bucket, { conversations: bucketRows.length, replies, rate: bucketRows.length ? replies / bucketRows.length : 0 }];
  }));

  const experiments = database.prepare("SELECT * FROM experiments ORDER BY created_at DESC").all().map((row) => ({ ...row, variants: json(row.variants, []) }));
  const result = {};
  for (const [venture, config] of Object.entries(CONFIG)) {
    const ventureConversations = conversations.filter((row) => row.product === venture);
    const connections = database.prepare(`SELECT id,name,headline,primary_product,classification_score,classification_reason,
      product_scores,profile_url,profile_status,contacted_at,review_status,linked_lead_id
      FROM linkedin_connections WHERE primary_product=? AND review_status<>'dismissed'
      ORDER BY classification_score DESC,contacted_at IS NULL DESC,name LIMIT 40`).all(venture).map((row) => ({
        ...row, product_scores: json(row.product_scores, {}),
      }));
    const corrections = ventureConversations.filter((row) => ["correction", "objection"].includes(row.primary_outcome || row.response_theme))
      .map((row) => ({ id: row.id, name: row.name, outcome: row.primary_outcome || row.response_theme, correction: row.correction_text || row.summary }));
    result[venture] = {
      ...config,
      updated_at: new Date().toISOString(),
      evidence: {
        conversations: ventureConversations.length,
        replies: ventureConversations.filter((row) => Number(row.inbound_count) > 0).length,
        meetings_inferred: ventureConversations.filter((row) => ["scheduled", "proposed"].includes(row.meeting_status)).length,
        qualified_replies: ventureConversations.filter((row) => row.primary_outcome === "qualified_commercial_interest" && row.confirmed_by).length,
      },
      themes: config.themes.map((theme) => ({ ...theme, matches: connections.slice(0, 8) })),
      targets: connections,
      corrections,
      experiments: experiments.filter((row) => row.venture === venture),
    };
  }
  return {
    generated_at: new Date().toISOString(),
    portfolio_message_length: portfolioLength,
    portfolio_followup_replies: observations.filter((row) => row.replied && row.outboundBeforeReply > 1).length,
    total_replying_conversations: conversations.filter((row) => Number(row.inbound_count) > 0).length,
    ventures: result,
  };
}
