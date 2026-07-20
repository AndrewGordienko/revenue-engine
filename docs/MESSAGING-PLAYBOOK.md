# Messaging Playbook — LinkedIn sequences, tracking, and iteration

How to run the 4–5 touch LinkedIn sequence to a call, record what works, and change the
approach from evidence. The cockpit already schedules the cadence and records every outcome;
this doc is the *content* + the *feedback loop*.

## 1. The rules (every message)
- **40–80 words.** One observed fact + one intelligent question. Nothing else.
- **No "I hope this finds you well." No calendar link** before they signal relevance.
- **Don't explain all of GNK in message one.** Lead with *their* situation.
- **Follow up only with a new useful thought**, never "bumping this."
- Connection notes ≤ 300 chars, **no links**.
- Ask for the owner when you're talking to a router.

## 2. GNK sequence — 4 touches, days 1 / 4 / 10 / 18
The cockpit schedules each next touch automatically after you hit **Mark sent** (per the play's
cadence). A reply **stops the rest** of the sequence and creates one "respond" action.

**Touch 1 — the real question (day 1)**
> Hi [Name], I saw [specific current signal — hiring a data eng / a migration / an incident].
> Is the team trying to get [likely bounded outcome] shipped before [hire/migration/launch],
> or is it more longer-term? I run GNK, a small senior engineering team, and was curious how
> you're covering the immediate gap.

**Touch 2 — useful point of view (day 4)**
> One reason I asked: this kind of work usually splits in two — the permanent team should own
> the system, but the migration or first production version still needs a concentrated push.
> If that's roughly the situation, I can send the shape we normally use for the first four weeks.

**Touch 3 — bounded commercial option (day 10)**
> We have capacity for one new engagement. The clean version is a senior pair owning [specific
> result] for 90 days, with a smaller paid shaping week if the boundary is still fuzzy. Worth
> comparing against the internal plan?

**Touch 4 — route or close (day 18)**
> Last note from me. If [problem] sits with someone else, who's the right person to ask? If it's
> not active this quarter, no need to force it.

**Existing-connection opener (warm reactivation)** — replaces Touch 1 for people you already know:
> I wanted to ask you something specific. When [observable problem] comes up at [Company], does
> the team absorb it internally, hire for it, or bring in a small outside team? Trying to
> understand where GNK is genuinely useful rather than sending a generic pitch.

## 3. OutageHub (5 touches, days 1/4/9/16/25) & Morrow (4 touches, days 1/3/7/14)
- **OutageHub NOC opener:** "We tracked [N] outages in your service footprint last month.
  Curious how your NOC currently separates grid outages from network faults when tickets spike —
  we're running pilots that cut diagnostic time on exactly that." (Show them their own footprint.)
- **Morrow connection note (≤300 chars):** "Hi [name] — I work on adaptive automation for
  high-mix packing. Talking to packhouse leads about where labor and changeovers hurt most. No
  pitch — genuinely trying to learn what's broken before we build the wrong thing. Open to trading notes?"
- Morrow is a **design-partner** motion: success = a site walk + a fit memo + a paid pilot, NOT
  revenue. It's reported on its own scorecard in Review and is **never summed** with GNK/OHub.

## 4. Reply handling (the SLA)
| Reply | Action | SLA |
|---|---|---|
| Relevant problem | Ask one clarifying question or offer two call windows | 2 business hours |
| Friendly but vague | Ask who owns the problem + whether it's active this quarter | same day |
| Router / referral | Thank them, ask to mention their name, contact the referral | same day |
| Not now | Record a dated trigger / quarter (no undated overdue task) | same day |
| No fit | **Close no fit** (retain the relationship) | same day |
Use **Log reply** on the card — it attributes the reply to your send, stops future touches, and
creates exactly one next action. Mark sentiment (positive/neutral/negative) as you paste it.

## 5. How the system records what works
Everything is captured as immutable events, so the numbers are real, not guessed:
- Every **Mark sent** → a `linkedin_message_sent` event; every **Log reply** → a
  `linkedin_reply_received` event (with the reply text + sentiment, stored erasably).
- **Skip** a draft → a reason (Wrong person / Bad timing / **Bad draft** / Not a fit / Other).
- **Review** shows the per-venture funnel with unique-lead denominators — *reply rate = replies /
  sends*, *call rate = calls / replies*, etc. — plus the **skip analysis** and the cash line
  ($ of $40k, contracts only).

## 6. How to change the approach from evidence (the weekly loop)
Run the daily block for ~2 weeks, recording every send/reply/skip. Then, in **Review**:
1. **Read the reply rate.** Below ~8–10% first-touch → the *targeting* or *touch-1 trigger* is
   weak, not the offer.
2. **Read the skip reasons.** `>30% "Bad draft"` → rewrite the touch-1 template. `>30% "Wrong
   person"` → fix targeting (wrong titles/accounts), not the message.
3. **Compare cohorts.** Warm-connection reactivations vs. cold triggered outreach — expect warm
   to reply far better; shift effort toward whatever actually replies.
4. **Change ONE thing per week** (touch-1 trigger, or the ask, or the target title). One variable
   so the next week's numbers are attributable.
5. Two-week target isn't "more leads." It's ≈100 thoughtful actions → 12–15 real calls → 5
   clearly-diagnosed problems → ≥2 paid GNK proposals.

## 7. What the cockpit does NOT yet surface (known gap)
Per-*template* A/B performance is captured in the `message_observations` / `message_learnings`
tables but is not yet a cockpit view — today you compare at the *funnel/cohort* level in Review.
If message-level "what's working" becomes the question after two weeks of real data, that's the
next small feature to add (a Playbooks > Messaging panel reading those tables).

## 8. Draft quality note
Grounded, per-person drafts come from the LinkedIn **writer agent**, which needs an API key
(`cp .env.example .env`, set your key). Without it, drafts are deterministic templates — **edit
each one to name a real trigger before you send.** The system never sends for you: the verbs are
always Copy → (send manually) → Mark sent.
