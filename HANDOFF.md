# HANDOFF — read this first

RxReach is a mobile-first Next.js (App Router) chat app. A user describes what
medication they need in plain words; an AI agent parses it, searches a curated
pharmacy directory, and replies with ranked delivery options in a chat thread.
Hackathon MVP for Massachusetts pharmacy deserts (track: Healthcare & Biotech).

**Before you write any code, also read `.kiro/steering/product.md` and
`.kiro/specs/rxreach/design.md`.** They are the rules and the architecture.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # always run before committing — must pass
```

No env needed: SMS and voice both run in **demo mode** without keys.

## Golden rules (do not break these)

1. **Apple/iOS look. No green theme.** iMessage bubbles (blue user / gray agent),
   system blue is the only accent, red for urgent/status only. Use the CSS
   variables in `app/globals.css` — never hard-code a hex in a component.
2. **The parser degrades gracefully.** Rule-first (instant), `kiro-cli` LLM only
   as fallback. Never make the app depend on the LLM being present.
3. **Results are never empty** (never-say-no) and every estimate shows confidence.
4. **Prescription only.** Non-Rx gets a kind redirect, not a search.
5. **Run `npm run build` before every commit.** If it fails, fix it first.

## The contract between us

The only shared surface is the API JSON. As long as these shapes stay the same,
we can work in parallel without stepping on each other:

- `POST /api/chat`  → `{ reply, parsed:{drug,when,rush,intent}, results }`
- `POST /api/search`→ `{ zip, usedZip, fallback, drug, rushResults, meetsDeadline, otherOptions, flags }`
- `POST /api/text`  → `{ demo?|sent?, to, message }`
- `POST /api/stock` → `{ callId, demo? }`;  `GET /api/stock/result?callId=` → `{ status, inStock, ... }`

If you must change a shape, tell the other person first.

## Who owns which files (avoid merge conflicts)

| You (Voice) | Partner (UI + SMS) | Shared — coordinate before editing |
| --- | --- | --- |
| `app/api/stock/route.js` | `app/page.js` | `app/globals.css` |
| `app/api/stock/result/route.js` | `app/Onboarding.js` | `data/*.js` |
| `lib/callStore.js` | `app/api/text/route.js` | `README.md` |
| `.env.example` (VAPI_*) | `app/globals.css` (styles) | |

**`app/page.js` is the one hot file.** It holds the chat UI AND the stock-check
button wiring. Partner owns it. If you (voice) need a UI change, ask partner to
make it, or make a tiny focused edit and tell them immediately.

## Branch + commit flow

We work on `rxreach-mvp` (pushing to `main` is blocked by policy).

```bash
git pull origin rxreach-mvp      # ALWAYS pull before you start
# ... make changes, npm run build ...
git add -A
git commit -m "voice: <what you did>"   # or "ui:" / "sms:"
git push origin rxreach-mvp
```

Pull first, small commits, and prefix the message (`voice:` / `ui:` / `sms:`) so
the log is readable.
