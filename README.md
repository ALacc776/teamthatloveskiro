# RxReach

Find a pharmacy that can **deliver your medication to your door** — built for
pharmacy deserts in Franklin County, Western Massachusetts.

Enter a ZIP code, medication, and when you need it. RxReach returns a ranked
list of delivering pharmacies with an honest **delivery-time window**, a delivery
fee, an order cutoff, and a one-tap "text me these results" for anyone without a
smartphone (think a grandparent in Shelburne Falls on a flip phone).

> Hackathon MVP. Pharmacy names/locations are real Western MA pharmacies; fees,
> cutoffs, windows and fill times are **hand-curated demo data**. Building and
> verifying that directory for real is the actual product.

## Run it

```bash
cd rxreach
npm install
npm run dev
# open http://localhost:3000
```

Open it on your phone (same Wi-Fi) at `http://<your-computer-ip>:3000` — it's a
mobile-first website, so it looks and feels like an app with no install.

## Demo script (2 min)

1. "In rural Massachusetts, the nearest pharmacy can be a 40-minute drive. Many
   pharmacies deliver — but no one tells you which, by when, or for how much."
2. Type ZIP `01301`, drug `Amoxicillin`, needed by `Today`. Hit search.
3. Point at a result: "**A window, not a fake number**, with a confidence label.
   It tells you to order by the cutoff to make today."
4. Switch Sort to **Cheapest** — ranking reorders, and "Why here" explains it.
5. Try `Insulin (Lantus)` — note the cold-chain safety banner.
6. Enter your own phone, tap **Text me these results** — read the SMS aloud.
   That line is the whole point: it reaches people with no smartphone.

## How delivery time is estimated

No one publishes real delivery times, so we compute a window:

```
delivery_time = fill_time + batch_wait + drive_time
```

- **fill_time** — per-pharmacy prior + extra minutes for some drugs.
- **batch_wait** — pharmacies deliver in set windows; miss the cutoff → next day.
- **drive_time** — straight-line miles between ZIP centroids ÷ 30 mph (rural),
  no Maps API needed.

A result "meets your deadline" only if the **late** end of the window beats it.
Between the early and late end it shows as "tight". See `lib/engine.js`.

## Who built what (team of 3)

| Person | Owns | Files |
| --- | --- | --- |
| A — Frontend | Screens, mobile look | `app/page.js`, `app/globals.css` |
| B — Backend + data | ETA + ranking, directory | `lib/engine.js`, `data/*.js`, `app/api/search` |
| C — SMS + pitch | Text-me, demo | `app/api/text/route.js`, this README |

The one contract between them is the `/api/search` JSON shape.

## Real SMS (optional)

The text route runs in **demo mode** (shows the message, sends nothing) until you
set Twilio env vars:

```bash
cp .env.example .env.local   # then fill in real values
```

## Not in the MVP (on purpose)

Insurance matching, ML ETA model, pharmacy portal, accounts, two-way SMS parsing.
These are Phase 2 — see the full design spec.
