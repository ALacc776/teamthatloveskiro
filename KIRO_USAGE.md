# How Kiro Was Used — RxReach (Hackachusetts)

**Challenge track: Healthcare & Biotech.**

RxReach is an AI chat app that helps people in Massachusetts pharmacy deserts
find a pharmacy that will deliver their prescription home.

## Which Kiro tools
- **Kiro Crew (dashboard + CLI).** The whole project was built in a Kiro Crew
  chat session: ideation, spec, code, builds, and git were all driven through
  Kiro. The running app also calls **`kiro-cli`** at runtime as its LLM — the
  natural-language message parser shells out to `kiro-cli chat --model
  claude-haiku-5.5` to turn free text like "need amoxicilin asap" into structured
  intent. So Kiro is both our *build* tool and a *runtime component*.

## Spec-driven development
We wrote the spec first under `.kiro/specs/rxreach/`
(`requirements.md` → `design.md` → `tasks.md`) before building. The requirements
pinned the honesty constraints (confidence labels, never-say-no, link-don't-
transact) that shaped every later decision; the design doc fixed the
fill+batch+drive ETA model and the rule-first/LLM-fallback parser. This beat
vibe-coding: when we pivoted the UI from a form to a chat, the spec kept the data
contract (`/api/search` shape) stable so the rewrite was contained instead of a
rebuild.

## Steering docs
`.kiro/steering/product.md` holds our standing rules — the Apple/iOS design
system (iMessage bubbles, system blue only, no theme green), the honesty voice,
prescription-only scope, and "parser must degrade gracefully." The biggest win:
after we told Kiro "remove the green, make it Apple-like," the steering doc made
that stick across every subsequent edit instead of drifting back.

## MCP
Kiro Crew's MCP tools ran the project end to end from chat — filesystem tools to
author every file, shell to run `npm run build` and verify, and the git flow.
When a push to `main` was correctly blocked by a protected-branch policy, the
same tooling let us pivot to a feature-branch push without leaving the chat.

## Kiro powers
We used the **`frontend-design`** power to escape templated-looking UI — it
steered us toward a deliberate iOS system palette and iMessage layout rather than
the generic SaaS-card default, which directly raised the design quality.

## Resilience as a Kiro pattern
Because the parser's primary path is `kiro-cli`, we built a rule-based fallback so
the app still works if the CLI isn't present on a judge's machine — rule-first for
speed (~0.1s on known drugs), LLM only for the hard cases (typos).

## Not yet / honest gaps
Property-based testing and agent hooks were not used in this build; the voice
stock-check (Vapi) is specced and prompted but not yet wired. These are the next
tasks in `tasks.md`.
