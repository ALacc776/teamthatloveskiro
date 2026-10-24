# Oasis

Find a pharmacy that can **deliver your medication to your door** — built to help
people in pharmacy deserts reach a delivering pharmacy without a car.

Tell Oasis your ZIP, your medication, and your insurance. It returns a ranked
short list of nearby pharmacies with **documented** home delivery, how far each
one is, and the delivery fee on record — then lets you place a demo order and
sets a refill check-in so you don't run out.

> Hackathon MVP. Pharmacy records are **real research data** for Greater Boston
> (names, addresses, phone numbers, sources and verification notes are preserved
> verbatim). A listed pharmacy is **not** proof of stock or of your eligibility —
> every record still needs a phone call to confirm. There are no invented
> delivery-time estimates.

## Run it

```bash
cd rxreach
npm install
npm run dev
# open http://localhost:3000
```

Open it on your phone (same Wi-Fi) at `http://<your-computer-ip>:3000` — it's a
mobile-first website, so it looks and feels like an app with no install.

## How it ranks pharmacies

No delivery-time guessing. Oasis ranks the top 5 by, in order:

1. **ZIP relevance** — your exact ZIP first, then the same ZIP area, then nearby.
2. **Documented delivery** — pharmacies with delivery documented on a provider
   page rank above stores only covered by a chain's general policy.
3. **Distance** — closer ranks higher (approximate straight-line miles from ZIP
   centroids; the research data carries no coordinates, so distance is shown as
   "~N mi").
4. **Source freshness** — more recently reviewed records break remaining ties.

See `lib/engine.js`. The pharmacy dataset is generated from the research CSVs:

```bash
npm run build:pharmacies   # data/research/*.csv -> data/pharmacies.generated.js
```

## Data

- `data/research/RxReach_Greater_Boston_Pharmacies_FIXED.csv` — 146 pharmacies (primary).
- `data/research/RxReach_Delivery_Programs_EXPANDED.csv` — 58 delivery-program
  records, merged into the primary set by name + address (no duplicates created).
- `data/pharmacies.generated.js` — the built dataset (do not hand-edit).
- `data/catalog.generated.js` — the broad medication-name index (separate build).

## Medication confirmation

Before searching, Oasis confirms the exact medication, strength and dosage form,
and never substitutes one for another (`lib/confirmation.js`). A medication you've
ordered before can be **reordered in one tap**, skipping those questions.

## Refill check-in

After an order, Oasis remembers it and schedules a check-in ~14 days later
("time to reorder?"). This demo stores it in the browser and surfaces the reminder
the next time you open Oasis. A production build would run this server-side and
send it by SMS.

## SMS (optional)

The text route (`/api/text`) runs in **demo mode** (shows the message, sends
nothing) until you set keys in `.env.local`. It supports two backends:

- **Textbelt** (`TEXTBELT_KEY`) — cheap, pay-as-you-go, no phone number to buy.
- **Twilio** (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM`).

```bash
cp .env.example .env.local   # then fill in real values
```

Oasis never assumes a pharmacy phone supports SMS — pharmacy numbers are only
shown for you to **call**, and only verified participating pharmacies are listed
in an outbound text.

## Not in the MVP (on purpose)

Real insurance network matching, live stock, pharmacy accounts, two-way SMS
parsing. These are Phase 2.
