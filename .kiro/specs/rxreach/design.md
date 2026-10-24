# RxReach — Design

## Shape

A mobile-first Next.js (App Router) Progressive Web App. One chat screen; the
agent replies with pharmacy cards inline, like a messaging thread. No native app
— a website that looks and feels like an app on a phone, so judges and users open
a link, no install.

```
Onboarding (ZIP + insurance, localStorage)
        │
        ▼
Chat thread ──type──▶ /api/chat
                         │  parse (lib/parse.js)
                         │  search + rank (lib/engine.js)
                         ▼
                    reply + pharmacy bubbles
        │
        ├─▶ /api/text   "text me these results" (Twilio, demo-mode fallback)
        └─▶ /api/stock  voice agent calls pharmacy (Vapi) → webhook → chat
```

## Components

| File | Role |
| --- | --- |
| `app/page.js` | Chat UI: onboarding gate, thread, composer, pharmacy bubbles |
| `app/Onboarding.js` | First-run ZIP + insurance capture |
| `app/api/chat/route.js` | Parse message → search → agent reply |
| `app/api/text/route.js` | SMS out (Twilio; demo mode without keys) |
| `lib/parse.js` | NL intake: **rule-first (instant), kiro-cli LLM fallback** |
| `lib/engine.js` | ETA windows, never-say-no fallback, rush tier, ranking |
| `data/pharmacies.js` | Hand-curated Franklin County directory + ZIP centroids |
| `data/drugs.js` | Drug catalog + fill-time priors + safety flags |
| `data/plans.js` | Insurance plans + honest "likely in network" fit |

## Key decisions

- **ETA = fill + batch-wait + drive**, returned as a window with a confidence
  label. Drive time = straight-line miles between ZIP centroids ÷ 30 mph (rural),
  no Maps API dependency.
- **Rule-first parsing.** A known drug name resolves in ~0.1 s; only unmatched
  input (typos) pays the LLM round-trip. Keeps the chat feeling instant and never
  breaks offline.
- **Never-say-no** lives in the engine: empty direct matches → nearest served ZIP
  → mail-order.
- **Link out, don't transact.** v1 links to each pharmacy's own order/transfer
  flow — avoids the payment/dispensing regulatory chain. (A prescription can only
  come from a doctor; there is no public pharmacy order API.)
- **Honesty surfaces everywhere:** confidence labels, verified dates, "not for
  emergencies" notice, insurance disclaimer.

## Design system (Apple / iOS)

Per the `frontend-design` Kiro power and the UI steering doc: iMessage-style
bubbles (blue user / gray agent), iOS system blue as the only accent, red for
urgent/status only, SF system font, grouped-gray fields, translucent nav bar.
No theme green. Light + dark, reduced motion respected.
