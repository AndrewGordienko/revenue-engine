# Sales Approach — Full Report (GNK + OutageHub)

_Generated 2026-07-10 from the live repo state: `agents/registry.json`, `data/state.json`, `data/leads-*.jsonl`, `data/exports/`, `data/ontology/`._

This is a complete read of how the two sales lanes are designed to work and what has actually been executed, so the strategy and its execution can be analyzed and rebuilt. It is written in three layers: **(A) the machine** that produces the strategy, **(B) the strategy itself** for each product, and **(C) the execution reality** — what the machine has actually produced vs. what it was supposed to.

---

## 0. Executive Summary

**What this is.** `salesv3` is an agent factory, not a CRM. It runs 37 LLM "research agents" in two mirrored lanes — `gnk-*` and `outagehub-*` — that hand off through a JSON message bus (`data/messages.jsonl`), publish artifacts to shared state (`data/state.json`), and write a typed knowledge graph (`data/ontology/graph.jsonl`, 2,593 ops). Each lane runs the same 16–17 stage chain: company context → ICP → growth playbook → offer map → (industry/market map) → revenue strategy → pipeline capacity → account sourcing → scoring → contact discovery → persona → dossier → outreach angle → sequence strategy → email finder → email drafter → sequence drafter → sequence reviewer.

**The two businesses being sold:**

| | **GNK (G&K Software)** | **OutageHub** |
|---|---|---|
| What it sells | Founder-led senior engineering: backend rescue, automation, modernization, platform work | Canadian power-outage data: REST API, alerting/notifications, custom integrations |
| Deal floor | **$40k** first month | **$1k/mo** API · $5k/mo alerts · $10k+/mo integration |
| Motion | High-trust, low-volume, bounded 1-month wedge | Traction-first, higher-volume pilots that expand |
| Sequence | 6 touches over 22 days | 7 touches over 30 days |
| Company floor | $80k/mo (≈2 deals) | $80k/mo (≈80 deals @ $1k, or ~14 @ $7.5k blended) |

**The execution reality (the important part).** The strategy layer is deep and internally consistent. The execution layer is a thin, stalled prototype:

- **385 emails were generated** (196 GNK + 189 OutageHub) — a full 7-touch sequence for **55 recipients across 37 companies**.
- **Zero verified email addresses across the entire pipeline.** The email-finder produced **66 GNK + 118 OutageHub guessed addresses (100% pattern-guessed, none verified)**; `email_address_status` is `unknown` for all 385 drafted emails.
- **The OutageHub reviewer marked 0 of 27 sequences send-ready** (all `needs_human_review`) precisely because every route depends on a guessed email. GNK's reviewer passed 25 of 28.
- **The stages ran against inconsistent account cohorts.** Sourcing/scoring, contact-discovery, and drafting were evidently run on different upstream inputs — GNK sourcing names Middesk/Taktile/Finix while GNK drafting is about Trigger.dev/Tide; OutageHub sourcing names Execulink/TERAGO, contact-discovery names Pocketpills/18 Wheels, and drafting targets TELUS/Rogers. The lane is not a clean end-to-end chain right now.
- **The drafted copy was never written back into the CRM lead rows.** Leads marked `contacted` (13 GNK, 19 OutageHub) have `email_body` length 0 and empty `email_subject`. The emails live only in `data/exports/` and the reviewer artifacts.
- **Nothing has actually been sent.** There is no send log, no reply data, no `verified: true` lead anywhere. `status` is null on every lead.
- **The pipeline is ~5–13% of its own target.** GNK capacity plan wants 1,200 leads / 1,104 send-ready; live file has 93 leads, 0 with drafted body. OutageHub wants 2,122 leads / 1,952 send-ready; live file has 68 leads, 1 with an email.

**In one line:** the system is excellent at *deciding who to email and what to say*, and has done essentially none of the work of *finding the address, sending, and tracking a reply*. The wedge, the copy, and the targeting doctrine are the assets. The email-finding, sending, and feedback loop are the missing execution.

---

## A. THE MACHINE

### A.1 Architecture

- **`agents/registry.json`** — declares 37 agents, each with an `id`, a `dependsOn` list, a `sequence` number, and an output contract. Two mirrored lanes plus an `industry-map` agent per product.
- **`data/messages.jsonl`** — append-only bus. 1,371 events: 622 handoffs, 461 status, 132 artifacts, 123 dependency-warnings, 33 setup. This is how agents "talk": an agent finishes, publishes an artifact event, and sends handoff events to every downstream agent that declares it in `dependsOn`.
- **`data/state.json`** — current shared state the dashboard reads. Holds `artifacts` (one per stage, the substantive output), `runs` (50 complete runs), and agent metadata.
- **`data/ontology/graph.jsonl`** — typed knowledge graph, 2,593 ops (1,156 `create`, 1,437 `relate`). Entities: `Company`, `Person`, `Deal`, `Investor`, `Introduction`, `Conversation`, plus per-person `Insight` nodes. Agents query the graph instead of parsing each other's Markdown; the runner records sourcing/contact output into it automatically.
- **`src/run-agent.js`** — runs one agent, injects upstream artifacts + recent bus events + dependency status, publishes the result. Also centrally injects a `multi-search-engine` skill instruction so web-research agents cross-check multiple engines.
- **`src/run-sequence.js`** — runs the whole lane in `sequence` order (`npm run pipeline:gnk` / `pipeline:ohub`).
- **`src/dashboard-server.js`** — serves the dashboard + JSON APIs on `127.0.0.1:8792` (auto-increments if taken; currently answering on 8792–8796 due to stale instances).

### A.2 Runtime

- Most agents run through the OpenClaw Gateway (codex runtime) on `openai/gpt-5.4-mini` by default.
- The two `*-lead-persona-profile` agents are flagged `"execution": "api-key"` and run the embedded local agent (`openclaw agent --local`) straight against the OpenAI API, to skip a codex "compact" step that was failing on the gateway.
- Runtime state/credentials live under `.openclaw-agents/` (git-ignored).

### A.3 The stage chain (what each stage is for)

1. **company-context** — what the company sells, its service lanes, target pressures, sales implications.
2. **icp-contact-profile** — segments, buyer personas, contact titles, triggers, fit signals, disqualifiers, commercial floor, reachability, outreach angles.
3. **boutique-growth-playbook** — lessons from comparable specialist firms; sets the whole motion's philosophy.
4. **offer-map** — per-segment: current pain → desired outcome → why buy now → proof needed → first offer → commercial-floor case → value layer (Hormozi-style dream outcome / likelihood / speed / effort).
5. **industry-map / market-coverage** — the addressable industry list and sourcing order.
6. **revenue-strategy** — deal tiers (small/medium/large), revenue math, company-size boundaries, sourcing + scoring rules, seller commission plan (internal only).
7. **pipeline-capacity** — converts revenue goals into a standing lead-inventory target and a daily email quota.
8. **account-sourcing** → **account-scoring** — named companies with triggers/value hypotheses, then ranked.
9. **contact-discovery** → **lead-persona-profile** → **client-dossier** — named people, their "vibe," and the five-question dossier.
10. **outreach-angle** → **sequence-strategy** → **email-finder** → **email-drafter** → **email-sequence-drafter** → **email-sequence-reviewer** — messaging, address discovery, copy, full sequences, QA.

### A.4 The governing doctrine (`NOTES.md`, 2026-07-08)

The **Exact-Target ICP Doctrine**: an ICP is not a market category; the target is _the exact person at the exact company likely to own the exact problem we can solve._ Every send-ready lead must answer five questions in one line each:

1. **Exact company** — which named account, and why now?
2. **Exact problem** — what public trigger/observable workflow makes the problem plausible?
3. **Exact person** — who owns, evaluates, feels, or can route this?
4. **Exact value proposition** — what narrow outcome for this person in this context?
5. **Exact first slice** — a first piece small enough to buy but valuable enough to matter.

If any answer is vague, the lead is **not send-ready** and stays in research/nurture. Targeting rule: prefer the person closest to the workflow (eng manager, platform lead, ops owner) over prestige C-suite; use founders/C-suite only when the company is founder-led or the trigger clearly attaches to that exec. Preserve uncertainty; never claim pain the public evidence doesn't support ("one area that may be worth testing"). Documented drift to watch: OutageHub artifacts skew toward broad executives + guessed emails; GNK skews toward founder/CEO routes when working-owner evidence is missing.

---

## B. THE STRATEGY — GNK (G&K Software)

### B.1 What GNK is
A founder-led, remote-first engineering studio for high-consequence software: products, backend systems, data automation, internal platforms, incremental modernization, and technical rescue. It sells **senior judgment on a bounded, reviewable slice with a handoff-ready result (code, tests, notes)** — not staff augmentation.

**Six service lanes:** product engineering · backend with clear contracts/failure handling · data automation · internal platforms for complex ops · incremental modernization · technical rescue/stabilization.

### B.2 ICP
Target senior decision-makers where software is operationally consequential and a bounded senior slice could stabilize/modernize/automate/rescue a critical piece that justifies a **$40k+ first month**.

- **Strong-fit segments:** B2B SaaS, vertical software, marketplaces, fintech-adjacent, logistics, healthcare ops, industrial, field-service — where custom software is tied to revenue/ops; teams with a thin senior bench and a risky backend/platform/modernization slice; ops-heavy teams stuck on spreadsheets/handoffs/brittle internal tools; founder/exec-led companies modernizing a legacy system.
- **Poor fit:** commodity staff-aug, marketing sites, design-only, big committee-led transformation programs.
- **Buyer personas:** economic (founder/CEO/COO/GM) · technical (CTO/VP Eng/Head of Eng) · operational (VP Ops/Business Systems/RevOps) · product (CPO/VP Product) · evaluator (senior/backend/platform/principal engineer).
- **Triggers:** hiring for backend/platform/internal-tools/data/modernization roles; funding/launch/enterprise win/scale-up; public mentions of legacy systems, tech debt, reliability; leadership change; migration off spreadsheets/Airtable/Zapier; production incident, stalled build, or contractor rescue.
- **Disqualifiers:** commodity dev hours; marketing/no-code/UI polish only; no clear problem owner; too early to know the product matters; RFP/procurement-first; buyer can't grant technical access.

### B.3 Offer map (5 segment offers)
Each is a **bounded first engagement** anchored in a real system consequence:

1. **CTO/VP Eng, risky backend/platform** → "Backend risk read + a bounded stabilization sprint on one high-friction slice."
2. **COO/Ops/Business Systems, spreadsheet drag** → "Workflow mapping + one automation slice for the highest-friction handoff."
3. **Founder/CEO/GM, legacy system running the business** → "Legacy assessment + one controlled modernization slice."
4. **CPO/VP Product, complex slice stuck in planning** → "End-to-end delivery of one complex product slice."
5. **Eng leader, troubled build / prod issue / contractor rescue** → "Technical rescue assessment + stabilization sprint on the highest-risk issue."

**Cross-segment principles:** sell a bounded first engagement, not transformation; anchor in a real consequence (risk/drag/delay/disruption); lead with senior judgment + clear scope; promise reviewable progress + usable handoff + explicit ownership; match the offer to the buyer's operating pain, not GNK's service menu. **Claims to avoid:** "replace your team," "transform the business," any guarantee/case-study/metric not documented.

### B.4 Revenue strategy & deal tiers
Optimize outbound around contract-shaped pain reachable through a named buyer or credible router.

- **Revenue math:** $40k min contract · $80k/mo company floor (≈2 deals) · seller needs ~$100k/mo closed (≈3× $40k) for a $10k/mo commission @ 10%. Commission math is internal-only, never prospect-facing.
- **Small ($40–60k):** fast 1–4 wk cycle, direct buyer, one bounded slice — **the near-term cash engine.**
- **Medium ($80–150k):** 4–12 wk, starts as a $40–60k wedge that expands — **expansion pipeline.**
- **Large ($150–300k):** 3–6+ mo, **nurture only** unless a specific team sponsor + narrow initiative exists.
- **Size boundaries:** too-large enterprises where cold outbound dies in procurement are out; industry is a secondary filter — "GNK sells consequential engineering, not a vertical label."

### B.5 Growth playbook (philosophy)
Observed pattern across comparable specialist firms: **founder-led niche expertise → public point of view → bounded diagnostic/modernization wedge → land-and-expand into repeat revenue.** GNK's lane is high-trust senior engineering at a $40k+ first month — _not_ generic agency breadth or enterprise transformation theater.

### B.6 Sequence strategy (6 touches, Days 1/3/7/11/16/22)
1. **Trigger opener** — tie to a public trigger + one concrete reason it's timely.
2. **Pressure frame** — reframe the trigger as likely senior-time pressure / change-safety risk, without accusing.
3. **Bounded slice** — name the first paid slice; make it small, senior, reviewable.
4. **Credibility through process** — show discovery → thin delivery → handoff discipline (not invented proof).
5. **Router angle** — make it easy to forward to the right internal owner.
6. **Useful close** — leave a checklist/risk-read behind, clean opt-out.

Persona variants (Founder/CEO, CTO/VP Eng, COO/Product/Ops) shift emphasis and vocabulary. Anti-spam rule: **every touch must add a new reason to reply**; never repeat the ask with softer wording; no price in copy; no case studies/logos not documented.

### B.7 Capacity target (GNK)
Standing inventory target **1,200 leads / 1,104 send-ready**; **44 new first-touch emails/day**, ~306 total sequence emails/day. Conversion model: 2.5% positive reply × 50% qualified × 25% close = **0.3125% email→close**; needs ~960 first-touch/mo. Bucket split 60/30/10 short/medium/long. _Snapshot at generation: 139 leads, 118 send-ready, 1 sequence-ready → gap of 1,061 leads._ (Live file is smaller still — see Section C.)

---

## C. THE STRATEGY — OutageHub

### C.1 What OutageHub is
A platform for monitoring **Canadian power outages** with a developer-focused authenticated REST API (`api.outagehub.ca`, `X-API-Key`, `GET /v1/outages`, `/v1/providers`, since/until/provider filters). Surfaces: API keys, getting-started, playground, notifications (email/SMS/push, rules, businesses, contacts).

**Four service lanes:** authenticated outage API · developer onboarding/key management · rule-based notifications/alerts · custom integrations into customer ops systems. **Hard constraint:** never imply utility partnership, complete coverage, or guaranteed accuracy unless a source confirms it.

### C.2 ICP
Target Canadian-exposed **operations/data/product/engineering owners** who need outage intelligence _inside a recurring workflow_, not a public-map lookup.

- **Strong fit:** utilities-adjacent software, emergency management, municipalities, telecom/network ops, insurance/claims, property management, logistics, field service, infrastructure monitoring, customer support, operational risk — with Canadian exposure and an owner for support/ops/product/platform/risk.
- **Poor fit:** no Canadian exposure; no outage-sensitive workflow; outage data is only a curiosity; procurement-only.
- **Personas:** economic (COO/VP Ops/GM) · technical (CTO/VP Eng/platform lead) · product (CPO/VP Product) · operational (Dir Ops/Support/Dispatch/Risk/Claims/Incident) · evaluator/router (senior eng/data lead/solutions architect).
- **Triggers:** hiring platform/data/integration/incident roles; a launch depending on outage visibility; **expansion into Canada**; a recent outage incident/support escalation; migration off manual checks; leadership change; public mention of dashboards/alerting/integration.

### C.3 Offer map (6 segment offers — all one-month bounded pilots)
1. **Telecom/network ops** → "One-month NOC outage-data pilot, one region/provider, one integration path + alert rule set + go/no-go memo." ($10k+/mo)
2. **Insurance claims/risk** → "Claims workflow pilot mapping outage events to one portfolio slice → triage rulebook + alert design."
3. **Property management/facilities** → "Portfolio alerting pilot for a defined building set → escalation + tenant-comms + reporting rules."
4. **Logistics/dispatch/field service** → "Dispatch alert design sprint for one route/depot cluster + integration slice + escalation map."
5. **Municipal/emergency management** → "One-district outage-comms pilot → comms & escalation playbook."
6. **Utilities-adjacent software / infra monitoring** → "One-month API evaluation + integration slice for a single product workflow + technical proof note."

**Cross-segment principles:** lead with a workflow pain not the platform; smallest paid engagement that proves recurring value; keep API/notifications/integration as distinct offers; favor Canadian-exposed operators with visible owners; treat manual checks/spreadsheet escalation/support load as buying signals. **Claims to avoid:** official utility partnership, complete national coverage, guaranteed accuracy, unsourced SLA/latency/retention.

### C.4 Revenue strategy & deal tiers
Traction-first: short-cycle API/notification pilots for reachable operators, medium-cycle integrations for larger systems, utility/municipal as expansion/partner pipeline.

- **Revenue math:** $1k/mo min · **$5k/mo notification setup is the best traction wedge** · $10k+/mo integration. Company floor $80k/mo ⇒ ~80 deals @ $1k (capacity planning uses a **$7,500 blended** contract ⇒ ~14 deals for $100k).
- **Small ($1–5k):** 1–4 wk, direct operator; API access or one notification workflow scoped to one region/portfolio/depot.
- **Medium ($5–15k):** 1–3 mo, managed alerting or narrow integration into an internal system.
- **Large ($15–50k):** 3+ mo, exec sponsor + operator owner; partner-data / customer-comms / ops integration pilot.
- **Preferred industries:** telecom & network, insurance & claims, logistics & dispatch, property & facilities. Deprioritize municipal without a named emergency owner, and utilities where the only route is generic procurement. (Electric utilities/LDCs/grid operators are treated as **upstream data sources, not customers.**)

### C.5 Industry map
18 industries mapped, each with priority, fit reason, outage-data use ($1k API / $5k alerts / $10k+ integration), sub-segments, trigger patterns, target roles. Sourcing order favors reachable mid-market operators and software/data products where a pilot can be evaluated without enterprise procurement.

### C.6 Sequence strategy (7 touches, Days 1/3/7/11/16/22/30)
Contextual opener → workflow-pressure frame → focused first pass (smallest useful pilot) → process/handoff proof → router → useful diagnostic (forwardable checklist) → clean close. Persona variants: economic buyer (business risk, fast pilot, routing), technical buyer (API/fields/handoff/integration boundary), product/ops owner (alerts/routing/field decisions/customer status). Core thesis: **OHUB sells fastest when outage data is tied to one operational decision path, not presented as a generic feed.**

### C.7 Capacity target (OutageHub)
Standing inventory target **2,122 leads / 1,952 send-ready**; **78 first-touch emails/day**, ~463 total/day. Conversion model is more optimistic than GNK: 6% positive reply × 55% qualified × 25% close = **0.825% email→close**. Bucket split 50/35/15. _Snapshot at generation: 23 leads, 0 send-ready → gap of 2,099 leads._

---

## D. THE EXECUTION REALITY

This is the layer to scrutinize. The planning artifacts describe a machine sized for ~2,000+ leads and hundreds of daily sends per product. Here is what actually exists.

### D.0 Stage-by-stage output (what each stage actually produced)

| Stage | GNK output | OutageHub output |
|---|---|---|
| **Account sourcing** | 9 named accounts + 3 near-misses | 13 named accounts + 2 near-misses |
| **Account scoring** | (GNK scoring artifact not in state) | 13 scored, **8 strong / 5 medium**, 0 rejected; scores 74–96 |
| **Contact discovery** | — | 8 account maps, 16 named contacts, 11 prioritized |
| **Client dossier** | — | 10 company dossiers, 6 full five-question dossiers |
| **Email finder** | 19 companies, **66 people, 100% guessed, confidence "low"** | 27 companies, **118 people, 100% guessed, confidence "medium"** |
| **Email drafter** | 10 company drafts | 27 company drafts |
| **Sequence drafter** | **28 person sequences × 7 touches** | **27 person sequences × 7 touches** |
| **Sequence reviewer** | 28 reviewed, before 73–84 → after 82–92, **25 ready / 3 review** | 27 reviewed, before 70–74 → after 88–91, **0 ready / 27 review** |

**GNK sourced accounts** (company — trigger — tier/score): Middesk (Business Connections preview, small/5) · Taktile (AI-in-underwriting guide, medium/5) · Finix (MCP integrations, small/5) · Sardine (April product updates, small/5) · Northspyre ("Northspyre Deal" launch, small/5) · Canary Technologies (Agentic Sales Coordinator, medium/4) · Tines (Almanac launch, medium/4) · Teleport (Agentic Identity Framework, large/4) · Crystallize (storefront-boilerplate post, small/5). _Every account is anchored to a dated public trigger and a $40k+ first-slice hypothesis._

**OutageHub scored top accounts** (10 weighted criteria, top = reachability 25 + contract-fit 20): Execulink Telecom 96 · TERAGO 94 · Vianet 93 · ThinkOn 91 · Broadstreet Properties 89 · Hazelview 88 · Tribe Management 87 · Conestoga Cold Storage 86 · Distributel 84 · Canada Cartage 82. Scoring correctly rewarded reachable named operators over big national procurement-only accounts — but note the drafting stage then ignored these and wrote to TELUS/Rogers instead.

**Dossier quality (the doctrine working):** the OutageHub Rentsync dossier is a clean five-question artifact — company (Rentsync, utilities-adjacent software) · person (Ashley Formica, Mgr Customer Success, as router not exec) · problem (support-routing/integration asks) · value prop (recurring enrichment layer above API pricing) · first slice (one workflow audit + one embedded outage-data pilot) — with explicit evidence gaps and "start with customer success, not executive intake."

### D.0b The 6-vs-7 touch discrepancy
GNK's `sequence-strategy` artifact specifies a **6-touch** sequence (Days 1/3/7/11/16/22). The GNK `sequence-drafter` and the generated-email export actually produced **7 touches** (Days 1/3/7/11/16/22/30) — matching OutageHub's 7-touch spec. The drafting stage did not follow its own strategy stage's sequence length.

### D.1 Leads in the CRM (live files)

| Metric | GNK (`leads-gnk.jsonl`) | OutageHub (`leads-outagehub.jsonl`) |
|---|---|---|
| Total leads | **93** | **68** |
| Unique companies | 28 | 55 |
| Stage: new / contacted | 80 / 13 | 49 / 19 |
| Has `email_best` | 59 | 1 |
| Has drafted `email_body` | **0** | **0** |
| `verified: true` | **0** | **0** |
| `status` set | 0 (all null) | 0 (all null) |
| Contract bucket | 83 long / 10 medium | 39 medium / 29 long |
| Fit score present | 11 (7×"5", 4×"4") | 55 (26×"5", 29×"4") |
| Has trigger / first-slice | 93 / 77 | 68 / 68 |

Note the drift the doctrine warned about: GNK leads are 89% `long_term` bucket (the slowest tier) despite the strategy calling for 60% short-term; OutageHub leads carry fit scores but almost no emails.

### D.2 Generated emails (`data/exports/generated-fixed-emails-2026-07-08.json`)

- **385 emails total** — 196 G&K + 189 OutageHub.
- **7 touches × 55 recipients = 385**, across **37 unique companies**. So only ~55 of the ~161 CRM leads ever reached drafting.
- **`email_address_status`: `unknown` for all 385.** Not one verified, deliverable address exists. Upstream, the email-finder guessed **66 GNK addresses (100% "low" confidence, patterns split `{first}@` vs `{first}.{last}@`) and 118 OutageHub addresses (100% "medium" confidence, all `{first}.{last}@domain`)** — e.g. `eric@trigger.dev`, `tony.geheran@telus.com`. All are pattern guesses; none checked for deliverability.
- **`send_readiness`: 175 `ready` / 210 `needs_human_review`.** Even "ready" emails have no address.
- The copy is on-doctrine and high quality. Example GNK touch-1 (Trigger.dev, Eric Allam / CTO) opens on the June 22–23 incident report and offers "a technical read, a first stabilization pass, and clean handoff notes without turning it into a broad rebuild" — exactly the "good shape" the doctrine prescribes. The OutageHub TELUS/Tony Geheran sequence is equally clean copy — but TELUS is a national telecom the strategy explicitly deprioritizes in favor of reachable operators, and the reviewer flagged all 7 touches for the unverified route.

### D.3 The critical gaps

1. **No deliverable addresses.** The email-finder stage ran but produced 0 verified emails; every generated email is unaddressed. This is the single biggest blocker — the whole downstream is un-sendable.
2. **Copy not persisted to CRM.** Drafted sequences live in `data/exports/` and reviewer artifacts, but lead rows have empty `email_subject`/`email_body`. "Contacted" is a stage label with no attached message.
3. **No send + no feedback loop.** No sent log, no replies, no closed data. Every conversion assumption (2.5%/6% reply, 25% close) is a guess the system explicitly flags as "tune when real data exists" — and there is no real data yet.
4. **Volume is a fraction of plan.** GNK at ~8% of its lead target and 0% of drafted-body send-ready; OutageHub at ~3% of lead target. The prospecting loop needs ~27 (GNK) / ~40 (OHub) more rounds of 40 leads.
5. **Data-source drift.** Three lead stores disagree: `leads.jsonl` (139, older combined), `leads-gnk.jsonl` (93) + `leads-outagehub.jsonl` (68) = 161, and the capacity snapshots (139/23). Whatever gets rebuilt should have one authoritative store.
6. **Cohort drift between stages (pipeline integrity).** The biggest structural problem: stages did not run on the same accounts. GNK sourcing scored Middesk/Taktile/Finix, but the finder+drafter worked Trigger.dev/Tide. OutageHub sourcing/scoring ranked Execulink/TERAGO/Vianet, contact-discovery found people at Pocketpills/18 Wheels/Royal York, and drafting wrote to TELUS/Rogers — accounts the strategy explicitly deprioritizes. The scoring stage's ranking never actually drove the drafting stage. Re-runs against stale/ad-hoc inputs broke the handoff chain.
7. **Strategy not enforced downstream.** GNK drafted 7 touches against a 6-touch strategy; drafting targeted deprioritized national telecoms; leads sit 89% in the slowest contract bucket. The artifacts are advisory, not binding — nothing forces a later stage to honor an earlier one.

### D.4 What is genuinely strong (keep)
- The **exact-target doctrine** and the five-question send-ready bar.
- The **offer maps** — bounded, consequence-anchored, buyer-POV, with claims-to-avoid guardrails.
- The **sequences** — non-repetitive, router-aware, anti-spam, persona-varied.
- The **ontology** — a real typed graph (2,593 ops) that could power dedupe, routing, and recycling.
- The sample copy quality — human, specific, forwardable, no invented proof.

### D.5 What to rip out / rebuild (execution)
- **Email discovery + verification** — the pipeline's actual bottleneck; 0/385 addresses is the thing that makes everything else theoretical.
- **CRM write-back** — drafted sequences must land on the lead row (and the ontology) so "contacted" means something.
- **A real send + reply-capture path** — without it, all conversion math is fiction and no stage can be tuned.
- **One authoritative lead store** — collapse the three divergent files.
- **Bucket/targeting enforcement** — GNK is 89% long-term against a 60%-short-term strategy; scoring is not steering sourcing.

---

## Appendix — Commands & sources
- Strategy artifacts: `data/state.json → artifacts.{gnk,outagehub}-*`
- Live leads: `data/leads-gnk.jsonl`, `data/leads-outagehub.jsonl`
- Generated emails: `data/exports/generated-fixed-emails-2026-07-08.{json,md}`
- Graph: `data/ontology/graph.jsonl` (schema `data/ontology/schema.yaml`)
- Run a lane: `npm run pipeline:gnk` / `npm run pipeline:ohub`; capacity: `npm run plan:capacity`; dashboard: `npm run dashboard`.
</content>
</invoke>
