# GNK + OutageHub — Business Plan 2026 (versioned strategy)

`strategy_version: plan-2026-07-10` · horizon 36 months · status: founder planning document, assumptions require validation.

This is the **versioned strategy tier** (Business Plan 2026, §35: "Strategy is versioned. Operational records are transactional. Agents assist; deterministic code controls state."). The machine-readable plays live in [`src/sales-plays.js`](../src/sales-plays.js) and are seeded into the `sales_plays` table. Bump `STRATEGY_VERSION` and add a revision rather than editing a play in place.

## Portfolio thesis
Two economic engines. **GNK** = near-term cash: a four-person senior engineering studio owning difficult product/backend/data/modernization/AI work; first offer $40k–$60k sprint. **OutageHub** = scalable recurring revenue: a Canadian outage API evolving into a location-level infrastructure-intelligence platform; first offer $2k–$15k pilot + recurring subscription. Shared: engineering, market intelligence, **the sales platform**. Not shared: positioning, pricing logic, forecasts, or a single undifferentiated sequence.

## Sales plays (§36) — every prospect attaches to exactly one
| play_id | brand | target | first offer | price |
|---|---|---|---|---|
| GNK-PROD-01 | gnk | delayed/difficult product slice | Senior Engineering Delivery Sprint | $40–60k |
| GNK-BE-01 | gnk | backend/platform reliability/scale | Backend Risk & Stabilization Sprint | $35–50k |
| GNK-DATA-01 | gnk | manual multi-system workflow | Data & Automation Sprint | $40–60k |
| GNK-MOD-01 | gnk | legacy / troubled build / rescue | Modernization or Rescue Sprint | $35–50k |
| GNK-AI-01 | gnk | valuable AI workflow → production | Production AI Workflow Sprint | $40–60k |
| OHUB-ISP-01 | outagehub | regional ISP/telecom NOC | Power-context operations pilot | $2–5k/mo + impl |
| OHUB-FAC-01 | outagehub | multi-location facilities | Portfolio monitoring pilot | $0.5–1.5k/mo + impl |
| OHUB-EMBED-01 | outagehub | software/data platform | Embedded evaluation | $5–15k/mo |

Play schema (§37): `play_id`, `strategy_version`, `target_account_definition`, `hard_disqualifiers`, `buyer_roles`, `trigger_types`, `problem_hypothesis`, `first_offer`, `price`, `proof_required`, `discovery_questions`, `success_metrics`, `expansion_path`.

## Separated lifecycle records (§38) — one stage field must NOT represent everything
- **Prospect** (`leads.stage`): `target → researched → route_ready → enrolled → engaged → disqualified/nurture` (+ `contact_evidence_missing`).
- **Opportunity** (`opportunities.stage`, opened only when buyer engagement justifies it): `discovery → qualified → solution_defined → proposal → contracting → won/lost`.
- **Customer/Contract** (`contracts`): recurring + one-time revenue, dates, renewal, scope.
- Staged next: GNK **delivery** (`scheduled→diagnose→thin_path→harden→deploy→handoff/expand`) and OutageHub **usage** (`key_created→…→active→at_risk→expanded`).

## Hard gates (§41)
| Gate | Requirement (enforced in code) |
|---|---|
| research_ready | play match, no hard disqualifier, fresh trigger or strong structural fit |
| route_ready | exact contact, address provenance, deliverability, known jurisdiction, legal basis, suppression check |
| send_ready | approved copy, sender health, unsubscribe mechanism, no duplicate enrollment, current evidence |
| engaged | captured human reply / substantive conversation — not inferred |
| qualified | buyer-confirmed problem, consequence, owner, timing, decision path, scheduled next step |
| proposal | defined solution, success metrics, price, responsibilities, review meeting |
| won | signed contract / binding PO + booked start event |
| renewal | usage/delivery review, value evidence, decision owner, renewal date |

## Scoring (§42) — rank WITHIN a play; gates decide eligibility
Play/ICP fit 25 · Problem evidence 20 · Trigger/timing 15 · Owner reachability 15 · Economic fit 15 · Expansion potential 10. A scoring system that recommends nearly every account is not discriminating enough.

## Financial targets (planning, not forecast)
- GNK: Y1 $720k / Y2 $1.8m / Y3 $3.6m; one new sprint/pod/month; recurring share 25→55%+; no client >30% of trailing revenue.
- OutageHub: Y1 $280k rev, $35–40k MRR; Y2 $1.7m; Y3 $6.1m; GRR 90%+, NRR 110%+, Monitor churn <2.5%.
- Capacity-aware selling: GNK may not book beyond pod capacity; OutageHub may not sell criticality beyond proven data quality.

## Decision rules (§50)
Take a GNK project only if workflow/owner/access/economics/acceptance/pod-capacity are clear. Build an OutageHub feature only if repeated across customers, core, or fully funded and ≥70% reusable. Scale outbound only after route quality, delivery, complaint, reply, and capacity metrics are healthy. Continue a play after a full cohort only with evidence of conversations/learning. Hire against contracted backlog, not top-of-funnel optimism.

## What is wired now vs staged
Wired: versioned plays + attachment gate; separated Prospect/Opportunity/Contract lifecycles; hard-gate ladder; within-play scoring; the canonical SQLite store, immutable event log, compliance/deliverability gates, cohort lineage (Track 1). Staged (needs live data / larger build): GNK delivery + OutageHub usage lifecycles, ProductUsage/DeliveryCapacity ingestion, measurement dashboards, MRR-bridge + capacity-aware forecasting (§43), sending/reply-capture infra (Track 2).
