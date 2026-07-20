// weekly-outreach.js — "who do I reach out to this week." Turns the relationship graph
// (your real LinkedIn connections) into a prioritized weekly list, allocated across four
// buckets that each do a different job. These are people you're ALREADY connected to, so
// the action is a warm DM / ask — the highest-ROI motion for a trust sale (per every sales
// methodology: work the people who already know you before cold outreach).
//
// The cold "150 new connection requests to strangers" motion needs the sourcing/Finder
// layer (Tier-1 collectors) — this fills the warm lane from data you already have.
import { db } from "./db.js";

// relationship_role -> bucket. Owners are the targets; routers manufacture intro paths
// (the bucket people skip and the highest ROI for warm-intro motions); ecosystem builds
// surface area; dormant is the cheapest pipeline you own (people you've talked to before).
const OWNER_ROLES = new Set(["buyer", "buyer_or_owner", "workflow_owner", "operator_subject"]);
const ROUTER_ROLES = new Set(["technical_router", "workflow_router", "buyer_or_router", "industry_router", "physical_engineering_network", "recruiting"]);
const ECOSYSTEM_ROLES = new Set(["needs_context", "early_career", "research_subject", "operator_subject"]);

export const BUCKETS = [
  { key: "direct_owners", label: "Direct owners", target: 40, roles: OWNER_ROLES, job: "Warm the account before anything cold lands — these people own the workflow you fix." },
  { key: "routers", label: "Routers", target: 45, roles: ROUTER_ROLES, job: "Manufacture intro paths. Connect to the owner AND two people around them — density beats precision." },
  { key: "ecosystem", label: "Ecosystem", target: 40, roles: ECOSYSTEM_ROLES, job: "Long-horizon surface area in your target community. Builds density and inbound over months." },
  { key: "dormant", label: "Reactivate (dormant)", target: 25, roles: null, job: "People you already talked to who went quiet 6+ months ago — the cheapest pipeline you own." },
];

// A short, honest opener per bucket (edit before sending). No links, question-led.
function suggestedNote(bucket, c, venture) {
  const first = String(c.name || "there").trim().split(/\s+/)[0];
  const v = venture === "outagehub" ? "OutageHub" : venture === "morrow" ? "Morrow" : "GNK";
  if (bucket === "routers") return `Hi ${first} — quick one. Who do you know whose team is drowning in a stuck backend/data/automation project right now? ${v} has capacity for one or two, happy to owe you one.`;
  if (bucket === "dormant") return `Hi ${first} — it's been a while. I've been heads-down building ${v}; curious what you're working on these days. Worth catching up?`;
  if (bucket === "ecosystem") return `Hi ${first} — I follow the space you're in and wanted to connect properly. No pitch — trading notes on what's actually breaking in ops/eng right now.`;
  return `Hi ${first} — wanted to ask you something specific. When a backend/data/automation project gets stuck at ${c.company_hint || "your company"}, does the team absorb it, hire, or bring in a small outside team? Trying to learn where ${v} is genuinely useful.`;
}

const norm = (v) => String(v || "").toLowerCase();

// Build this week's prioritized outreach list. venture=null => all ventures.
export function buildWeeklyQueue(database = db(), { venture = null, cap = 150 } = {}) {
  const vClause = venture ? "AND primary_product = ?" : "";
  const vArgs = venture ? [venture] : [];

  // Not-yet-contacted connections (via this platform), classified for the venture.
  const fresh = database.prepare(`SELECT id, name, headline, profile_url, primary_product, relationship_role,
      relationship_intent, classification_score, connected_on
    FROM linkedin_connections
    WHERE contacted_at IS NULL AND review_status != 'suppressed' ${vClause}
    ORDER BY classification_score DESC, connected_on DESC`).all(...vArgs);

  // Dormant = had a real conversation, no inbound in 6+ months (or never a reply), not suppressed.
  const dormant = database.prepare(`SELECT c.id, c.name, c.headline, c.profile_url, c.primary_product, c.relationship_role,
      c.relationship_intent, c.classification_score, conv.last_inbound_at, conv.last_message_at
    FROM linkedin_connections c
    JOIN linkedin_conversations conv ON conv.connection_id = c.id
    WHERE (conv.last_inbound_at IS NULL OR conv.last_inbound_at < date('now','-180 day'))
      ${venture ? "AND c.primary_product = ?" : ""}
    ORDER BY conv.last_message_at DESC`).all(...vArgs);

  const used = new Set();
  const buckets = BUCKETS.map((b) => ({ key: b.key, label: b.label, job: b.job, target: b.target, people: [] }));
  const bucketByKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

  // Fill dormant FIRST — a past conversation that went quiet is a stronger, cheaper signal
  // than a cold role match, so claim those people for reactivation before the role buckets.
  for (const c of dormant) {
    const b = bucketByKey.dormant;
    if (b.people.length >= b.target || used.has(c.id)) continue;
    used.add(c.id);
    b.people.push(personRow(c, "dormant", venture));
  }
  // Then the role-driven buckets from the remaining fresh connections.
  for (const c of fresh) {
    const role = norm(c.relationship_role);
    let key = null;
    if (OWNER_ROLES.has(role)) key = "direct_owners";
    else if (ROUTER_ROLES.has(role)) key = "routers";
    else if (ECOSYSTEM_ROLES.has(role)) key = "ecosystem";
    if (!key) continue;
    const b = bucketByKey[key];
    if (b.people.length >= b.target || used.has(c.id)) continue;
    used.add(c.id);
    b.people.push(personRow(c, key, venture));
  }

  const total = buckets.reduce((n, b) => n + b.people.length, 0);
  return {
    venture: venture || "all",
    cap,
    total,
    generated_for_week_starting: null, // stamped by the caller (Date is unavailable here)
    buckets,
    note: total < cap
      ? `Only ${total} warm candidates available for ${venture || "all"} (cap ${cap}). More come from the sourcing/Finder layer (Tier-1 collectors) — not yet built.`
      : `Full week of ${cap} warm-network actions ready.`,
  };
}

function personRow(c, bucket, venture) {
  return {
    connection_id: c.id, name: c.name, headline: c.headline, profile_url: c.profile_url,
    venture: c.primary_product, role: c.relationship_role, bucket,
    score: c.classification_score,
    suggested_note: suggestedNote(bucket, c, venture),
  };
}
