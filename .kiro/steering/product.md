# RxReach — Product & UI Steering

Standing rules Kiro followed on every change to this project.

## Voice & honesty
- Prefer "we're not sure" over a confident wrong answer. Every estimate carries a
  confidence label and a verified date.
- Never imply medical advice. Never claim to place an order or create a
  prescription — link out to the pharmacy's own flow.
- A persistent "Not for emergencies — call 911" notice on chat and SMS.

## Scope discipline
- Prescription medications only. Non-Rx requests get a kind redirect, not a search.
- Build only what the current task needs. No speculative features.

## UI: Apple / iOS native feel
- iMessage-style bubbles: **blue** user (right), **gray** agent (left).
- iOS **system blue** is the only accent. **Red** only for urgent/rush and
  status. Green only as a status tick — never a theme color. (Theme green was
  explicitly removed.)
- SF system font, iOS grouped-gray input fields, translucent blurred nav bar.
- Light + dark mode, tap targets ≥ 44pt, reduced-motion respected.
- Mobile-first: everything reads as a phone app at 480px max width.

## Engineering
- The natural-language parser must degrade gracefully: rule-based first (instant),
  LLM only as a fallback, so the app never breaks if `kiro-cli` is absent.
- No hard-coded hex in components — use the CSS variables in `app/globals.css`.
- Results are never empty (never-say-no).
- Demo data is hand-curated and labeled as such; do not present it as live data.

## Demo framing
- This is a hackathon MVP for a real Massachusetts problem (pharmacy deserts).
- Be honest in the pitch about what is real (the finder, ETA logic, NL intake,
  SMS) vs. simulated (directory data, order submission, the demo "pharmacy" line).
