# RxReach — Requirements

## Problem

Many Massachusetts residents live in **pharmacy deserts** — rural areas (e.g.
Franklin County / Greenfield) where the nearest pharmacy is a long drive, transit
is thin, and residents skew older or have mobility limits. Many pharmacies deliver
prescriptions, but no single place tells a resident *which* pharmacy near them
delivers, by when, for how much, and whether their insurance fits.

## Track

**Healthcare & Biotech.**

## Target user

A rural resident (often older, sometimes on a basic phone) who needs a
prescription delivered home — plus the caregiver searching on their behalf.

## User stories

1. As a user, I describe what I need in plain words ("I need amoxicillin by
   tonight") and get a ranked list of pharmacies that can deliver it to me.
2. As a user, I set up once (ZIP + insurance) so the agent already knows my
   context on every message.
3. As a user, I never hit a dead end — if nothing delivers to my ZIP, I'm shown
   nearby pharmacies and mail-order instead.
4. As a user who needs it urgently, I see a fast / same-day option first.
5. As a user on a basic phone, I can have the results texted to me.
6. As a user, the agent can call a pharmacy to confirm stock before I order.

## Functional requirements

- **FR1 Onboarding.** Collect name (optional), ZIP (required, 5 digits),
  insurance plan. Store locally on device; no account required.
- **FR2 Natural-language intake.** Parse any free-text message into
  `{ drug, when, rush, intent }`. Handle typos and loose phrasing.
- **FR3 Delivery estimate.** For each pharmacy compute a delivery-time *window*
  (`fill + batch-wait + drive`), never a single false-precise time, with a
  confidence label.
- **FR4 Never-say-no.** If no pharmacy serves the ZIP, widen to the nearest
  served ZIP, then mail-order. Results are never empty.
- **FR5 Rush tier.** Surface same-day courier options first when the user signals
  urgency.
- **FR6 Insurance fit.** Show an honest "likely in network / may be out / cash"
  label from the user's plan. (Real adjudication is out of scope — Phase 2.)
- **FR7 Ranking.** Transparent weighted score (speed, cost, trust, freshness),
  reorderable by intent; every result explains itself.
- **FR8 SMS.** "Text me these results" sends the top options; the medication name
  is omitted from the SMS body for privacy on shared phones.
- **FR9 Stock check.** A voice agent can phone the pharmacy to confirm stock and
  return a structured result.
- **FR10 Non-Rx handling.** Non-prescription requests (tissues, OTC) are
  redirected kindly, not dead-ended.

## Non-functional requirements

- **NFR1 Accessibility.** WCAG-minded, large tap targets, works on older phones,
  light/dark, reduced-motion respected.
- **NFR2 Honesty.** Every estimate carries a confidence + source; the app prefers
  "not sure" over a confident wrong answer. Persistent "not for emergencies, call
  911" notice.
- **NFR3 Privacy.** No account needed; medication name never echoed in SMS.
- **NFR4 Resilience.** The LLM parser degrades to a rule-based parser so the app
  never breaks if `kiro-cli` is unavailable.

## Out of scope (v1)

Real insurance claim adjudication, true auto-submission of orders to pharmacy
systems (no public API; prescription must come from a doctor), live inventory
feeds, statewide coverage.
