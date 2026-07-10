# Sales Agent Notes

## 2026-07-08: Exact-Target ICP Doctrine

The agents should not treat an ICP as a market category. The useful target is the exact person at the exact company who is likely to own the exact problem we can solve, with a value proposition that fits that person's workflow and authority.

### Current Agent Flow

The repo has two mirrored agent lanes:

- `gnk-*` agents sequence from company context through ICP, offer map, revenue strategy, sourcing, scoring, contact discovery, dossiers, outreach angles, email finding, drafting, and review.
- `outagehub-*` agents follow the same shape for OutageHub, with an extra `outagehub-market-coverage` stage before revenue strategy.

The intended handoff chain is:

1. ICP defines strong segments, buyer personas, contact titles, triggers, fit signals, disqualifiers, commercial floor, reachability, and outreach angles.
2. Account sourcing turns the ICP into named companies with a public trigger, fit reason, contract-value hypothesis, and reachable path.
3. Account scoring ranks only companies where the problem is urgent enough, contract-sized enough, and reachable enough.
4. Contact discovery finds named people at the top accounts, favoring workflow owners and credible routers over prestige titles.
5. Client dossier connects account context, contact role, likely pain, first conversation, first contract slice, route to conversation, and claims to avoid.
6. Outreach angle and email agents translate that evidence into role-specific messaging without inventing pain, facts, or direct emails.

### Operating Standard

For every send-ready lead, the agents should be able to answer these five questions in one line each:

- Exact company: which named account, and why this account now?
- Exact problem: what public trigger or observable workflow makes the problem plausible?
- Exact person: who owns, evaluates, feels, or can credibly route this problem?
- Exact value proposition: what narrow outcome can we create for this person in this context?
- Exact first slice: what bounded first piece of work or pilot is small enough to buy but valuable enough to matter?

If any of those answers are vague, the lead is not send-ready. It should stay in research, routing, or nurture.

### Targeting Rules

- Prefer the person closest to the workflow: engineering manager, platform/backend lead, product owner, operations owner, data/business systems owner, support/NOC/claims/facilities owner, or initiative lead.
- Use CEOs, founders, and C-suite as first contacts only when the company is small/founder-led or the public trigger is clearly attached to that executive's remit.
- For large companies, a C-suite-only route should usually be a coverage gap, not a confident send-ready lead.
- A company is not qualified just because it fits a broad segment. It needs a named trigger, a plausible workflow, and a reachable owner.
- A contact is not qualified just because they are senior. They need a believable relationship to the problem or a credible route to the owner.
- The value proposition should be written from the recipient's point of view, not from our service menu.
- Do not claim the prospect has pain unless the public evidence supports it. Use language like "one area that may be worth testing" when the problem is inferred.
- Preserve uncertainty. If the route, email, trigger, or workflow is weak, the artifact should say so.

### Acceptance Test For Agent Output

A good artifact should read like:

`Company X has public trigger Y, which makes workflow/problem Z plausible. Person A owns or can route Z because of role/evidence B. We should lead with value proposition C and ask to test first slice D. Evidence gaps: E.`

A weak artifact reads like:

`Company X is in our ICP. Person A is senior. We can help with operations, platform, or data. Email guessed.`

Weak artifacts should not move into email drafting without more research or a narrower routing ask.

### Observed Drift To Watch

- GNK instructions already contain the right bias toward reachable workflow owners, but current artifacts can still favor founder/CEO routes when the account is founder-led or when better working-owner evidence is missing.
- OutageHub artifacts currently show more drift toward broad executives and guessed email candidates. For enterprise telecoms, insurers, REITs, logistics firms, utilities, and public-sector accounts, the better target is usually the owner of a specific outage-sensitive workflow, not the CEO or CFO.
- Email agents should not hide weak targeting with polished copy. If the evidence only supports a router ask, the email should ask for the owner of the workflow rather than pretending the recipient owns the problem.

### Practical Examples

GNK:

- Good shape: `Trigger.dev` plus a public incident report points to reliability/stabilization work. The first slice can be an incident review, risky-system read, and one stabilization increment. The ideal contact is the person owning reliability remediation, with the CEO/CTO route acceptable only because the company and incident are tightly linked.
- Weak shape: a large software company with no named initiative owner, no current trigger, and only a generic executive route.

OutageHub:

- Good shape: a telecom NOC, support operations, field dispatch, claims operations, facilities, risk, or customer-status workflow where Canadian power-outage context would change a decision or reduce manual checking. The first slice could be one region, one alert/API integration, one dashboard feed, or one workflow pilot with clear acceptance criteria.
- Weak shape: a CEO/CFO at a national enterprise with a guessed email and a generic "outage visibility could help operations" message.

