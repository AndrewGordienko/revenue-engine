# GNK + OutageHub — Business Plan 2026 (versioned strategy)

`strategy_version: plan-2026-07-11` · horizon 36 months · status: active commercial-control document, assumptions require validation.

This is the **versioned strategy tier** (Business Plan 2026, §35: "Strategy is versioned. Operational records are transactional. Agents assist; deterministic code controls state."). The machine-readable plays live in [`src/sales-plays.js`](../src/sales-plays.js) and are seeded into the `sales_plays` table. Bump `STRATEGY_VERSION` and add a revision rather than editing a play in place.

## Portfolio thesis
Two economic engines. **GNK** = near-term cash: one high-trust $40k–$60k sprint in 30 days. **OutageHub** = scalable recurring revenue: three to four paid implementations/pilots worth $40k in booked first-month revenue, then annual conversion and a 60–120 day path to $40k MRR. Shared: engineering, Demand Radar research, evidence controls, CRM, cohorts, reply learning, and reporting. Not shared: positioning, pricing, offers, proof, funnel economics, sequence, or close.

## Sales plays (§36) — every prospect attaches to exactly one
| play_id | brand | target | first offer | price |
|---|---|---|---|---|
| GNK-BE-01 | gnk | backend/platform reliability/scale | Backend Risk & Stabilization Sprint | $35–50k |
| GNK-DATA-01 | gnk | manual multi-system workflow | Data & Operations Automation Sprint | $40–60k |
| GNK-AI-01 | gnk | valuable AI workflow → production | Production AI Workflow Sprint | $40–60k |
| OHUB-ISP-01 | outagehub | regional ISP/telecom NOC | Paid operational pilot | $7.5–15k impl + $2.5–5k/mo |
| OHUB-FAC-01 | outagehub | multi-location facilities | Paid portfolio pilot | $5–15k impl + $1.5–5k/mo |
| OHUB-EMBED-01 | outagehub | software/data platform | Paid embedded evaluation | $15–30k impl + $7.5–15k/mo |

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
Wired: six versioned brand-specific plays; binding prompt and sequence controls; shared Demand Radar; separated Prospect/Opportunity/Contract lifecycles; hard gates; reply/objection classification; canonical SQLite and immutable events; cohort lineage; and outcome reporting by product, cohort, and play. Staged (needs live data / larger build): GNK delivery + OutageHub usage lifecycles, ProductUsage/DeliveryCapacity ingestion, MRR-bridge + capacity-aware forecasting (§43), and mailbox sending/reply capture (Track 2).
