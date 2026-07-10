import { readState } from "./bus.js";

const PRODUCTS = [
  { key: "gnk", slug: "gnk-contact-discovery" },
  { key: "outagehub", slug: "outagehub-contact-discovery" }
];

const EXEC_RE = /\b(ceo|chief|president|founder|co-founder|board|chair|cfo|coo|cio|cto|cmo|cro|evp|svp)\b/i;
const OWNER_RE = /\b(manager|director|head of|lead|principal|staff|product manager|operations|ops|platform|backend|data|systems|revops|network operations|service assurance|noc|field operations|incident|claims|facilities|property|dispatch|emergency|business continuity|integrations?)\b/i;

function collectContacts(artifact = {}) {
  const prioritized = (artifact.contacts_to_prioritize || []).map((contact) => ({
    company: contact.company || "",
    name: contact.name || "",
    title: contact.current_title || ""
  }));
  const mapped = (artifact.account_contact_maps || []).flatMap((map) => {
    return (map.named_contacts || []).map((contact) => ({
      company: map.company || contact.company || "",
      name: contact.name || "",
      title: contact.current_title || ""
    }));
  });
  const byKey = new Map();
  for (const contact of [...prioritized, ...mapped]) {
    const key = `${contact.company}|${contact.name}|${contact.title}`.toLowerCase();
    if (contact.name || contact.title) byKey.set(key, contact);
  }
  return [...byKey.values()];
}

function classify(contact) {
  const title = contact.title || "";
  return {
    ...contact,
    executive_like: EXEC_RE.test(title),
    owner_like: OWNER_RE.test(title)
  };
}

function summarize(product, artifact, agentState) {
  const contacts = collectContacts(artifact).map(classify);
  const executive = contacts.filter((contact) => contact.executive_like);
  const owner = contacts.filter((contact) => contact.owner_like && !contact.executive_like);
  const neither = contacts.filter((contact) => !contact.owner_like && !contact.executive_like);
  return {
    product: product.key,
    artifact_path: agentState?.lastArtifactPath || "",
    total_contacts: contacts.length,
    executive_like_contacts: executive.length,
    owner_like_contacts: owner.length,
    ambiguous_contacts: neither.length,
    executive_like_share_pct: contacts.length ? Math.round((executive.length / contacts.length) * 100) : 0,
    sample_executive_like_contacts: executive.slice(0, 12),
    sample_owner_like_contacts: owner.slice(0, 12),
    recommendation:
      executive.length > owner.length
        ? "Rerun contact discovery after the problem-owner policy changes; current artifact is still executive-heavy."
        : "Current artifact has more working-owner contacts than executive-like contacts."
  };
}

const state = await readState();
const report = PRODUCTS.map((product) => {
  const agentState = Object.values(state.agents || {}).find((agent) => agent.slug === product.slug);
  return summarize(product, state.artifacts?.[product.slug] || {}, agentState);
});

console.log(JSON.stringify({ generated_at: new Date().toISOString(), report }, null, 2));
