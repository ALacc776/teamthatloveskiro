# Oasis

**Prescription access in one text message.**

Oasis is an SMS-based medication access assistant for people in pharmacy deserts. Text it a ZIP code and a medication, and it finds, ranks, and returns the best nearby pharmacy options. No app, no account, no personal information.

---

## The problem

More than half a million Massachusetts residents live in a pharmacy desert. When the nearest pharmacy is far away, or can't fill a prescription before the refill date, getting medication on time becomes a real struggle.

Across Massachusetts, 15.8% of residents (more than one million people) live in a pharmacy desert or near-desert. ([Massachusetts Health Policy Commission](https://masshpc.gov/news/press-release/over-half-million-massachusetts-residents-live-pharmacy-desert))

## The solution

Instead of downloading an app, creating an account, or calling pharmacies one by one, the user just texts Oasis. They send their ZIP code, medication, strength, and dosage form. Oasis never asks for a name and never creates a profile.

Oasis searches its researched directory of Greater Boston pharmacies, ranks them by ZIP match, delivery support, and distance, and replies with the top three options. Each result includes:

- Pharmacy name
- Distance
- Delivery cost
- Phone number

The same flow is also available as a mobile web chat.

## Built with

- **Next.js** for the web chat and API routes
- **Twilio** for SMS
- **Vapi** for the voice stock-check prototype
- **Kiro** for spec-driven development

---

## Quick start

```bash
cd rxreach
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

To use Oasis from a phone, expose port 3000 through an HTTPS tunnel:

```bash
ngrok http 3000
```

Open the HTTPS address ngrok prints.

### Environment variables

Copy `.env.example` to `.env` and fill in what you need. Both integrations are optional: without credentials, each route runs in **demo mode** so the full flow can be tried without accounts.

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio credentials. Without them, `/api/text` shows the message instead of sending it. |
| `TWILIO_FROM` | The Twilio number Oasis texts from |
| `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID` | Vapi credentials. Without them, `/api/stock` simulates an "in stock" result after about 4 seconds. |
| `VAPI_ASSISTANT_ID` | Optional prebuilt Vapi assistant (overrides the inline prompt) |
| `RXREACH_CALLBACK` | Callback number the agent gives if a pharmacy asks |
| `PUBLIC_BASE_URL` | Public HTTPS address (for example, your ngrok URL) so Twilio and Vapi can reach the webhooks |

Never commit `.env`.

---

## How it works

### 1. Conversation

The SMS conversation follows four steps:

1. Ask for the ZIP code.
2. Ask for the medication.
3. Ask for the strength and dosage form.
4. Return three pharmacy options.

Text `RESET` at any time to start over, or `HELP` for instructions.

### 2. Medication validation

Oasis recognizes **1,565 medication names** (from `data/catalog.generated.js`), including brand and generic names, partial matches, and spelling suggestions. Every medication is validated before the pharmacy search begins.

Oasis confirms the medication name, strength, and dosage form with the user, and it **never substitutes a different medication**.

### 3. Pharmacy ranking

Oasis ranks pharmacies using four signals, in order of priority:

1. **ZIP match:** pharmacies in the user's ZIP code come first.
2. **Delivery support:** pharmacies with provider-backed delivery rank above those with only a general chain delivery policy, which rank above those with no delivery.
3. **Distance:** closer pharmacies rank higher.
4. **Source date:** more recently verified records break any remaining ties.

#### The math

Each pharmacy p is assigned a sort key, and pharmacies are sorted by that key in ascending lexicographic order (compare the first value; only if it ties, compare the second, and so on):

```text
key(p) = ( −zₚ, −δₚ, dₚ, −τₚ )
```

| Variable | Meaning |
| --- | --- |
| zₚ | 1 if the pharmacy is in the user's ZIP code, 0 otherwise |
| δₚ | Delivery tier: 2 = provider-backed delivery, 1 = general chain policy, 0 = no delivery |
| dₚ | Distance from the user in miles |
| τₚ | Date the pharmacy's record was last sourced |

The negative signs flip the order so that "more is better" signals (ZIP match, delivery, newer data) sort first, while distance sorts smallest first. The top three pharmacies are returned.

**Distance** is the straight-line (great-circle) distance between the centroid of the user's ZIP code and the centroid of the pharmacy's ZIP code, computed with the haversine formula:

```text
d = 2R · arcsin( √( sin²(Δφ / 2) + cos φ₁ · cos φ₂ · sin²(Δλ / 2) ) )
```

| Variable | Meaning |
| --- | --- |
| φ₁, φ₂ | Latitudes of the two ZIP centroids (radians) |
| Δφ | Difference in latitude |
| Δλ | Difference in longitude |
| R | Earth's radius, about 3,958.8 miles |

Oasis does not estimate delivery times. Ordering and delivery are handled by each pharmacy's own website.

### 4. Refill check-ins

In the web chat, Oasis remembers the selected medication in the browser. After 14 days, it offers a one-tap reorder using the saved medication, strength, and dosage form, skipping the repeated questions.

---

## Pharmacy data

The directory contains **146 Greater Boston pharmacies**, including **58 delivery programs**.

| File | Purpose |
| --- | --- |
| `data/research/RxReach_Greater_Boston_Pharmacies_FIXED.csv` | Primary pharmacy directory |
| `data/research/RxReach_Delivery_Programs_EXPANDED.csv` | Delivery programs, merged by pharmacy name and address |
| `data/pharmacies.generated.js` | Generated application data |

Rebuild the pharmacy data with:

```bash
npm run build:pharmacies
```

Every record keeps its name, address, phone number, source, and review notes. Because stock and delivery eligibility change, Oasis directs users to confirm both with the pharmacy.

---

## SMS setup

In the Twilio console, set your number's incoming message webhook to:

```text
https://YOUR-PUBLIC-HOST/api/sms
```

Use **Custom** and **HTTP POST**. The webhook replies with TwiML for each step of the conversation.

---

## Privacy

Oasis is designed to collect as little as possible:

- No name, date of birth, insurance, or account is ever requested.
- A request contains only a ZIP code and a medication, strength, and dosage form.
- Prescriptions are never handled by Oasis. The prescriber sends them to the pharmacy through normal channels.

---

## Limitations and next steps

- **Coverage:** the directory currently covers Greater Boston. The goal is statewide coverage, starting with the communities identified as pharmacy deserts.
- **Distance:** ZIP centroids give an approximation, not driving distance. Travel-time routing is a planned upgrade.
- **Live stock:** pharmacy inventory isn't public, so Oasis asks users to confirm stock with the pharmacy. The voice stock check in `/api/stock` is a prototype of automating that step.
- **Pharmacy opt-in:** a portal where pharmacies can report stock directly would reduce outreach and keep results fresh.

---

## API routes

| Route | Purpose |
| --- | --- |
| `/api/chat` | Web conversation and medication confirmation |
| `/api/search` | Pharmacy ranking |
| `/api/medication` | Medication lookup |
| `/api/stock` | Pharmacy stock check |
| `/api/stock/result` | Stock check result |
| `/api/sms` | Inbound SMS conversation |
| `/api/text` | Outbound pharmacy options |

---

## Testing

```bash
npm test
npm run build
```

Tests cover medication matching, confirmation, pharmacy data, deduplication, ranking, distance, delivery rules, and SMS conversations.
