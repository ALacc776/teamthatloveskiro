# Oasis

Oasis helps people find pharmacies that deliver prescription medication.

Users enter their ZIP code, insurance, medication, strength and dosage form.
Oasis searches Greater Boston pharmacy records and returns the three best options.
Each result includes distance, delivery cost, the pharmacy website and a stock-check action.

Oasis works through its mobile web chat and an inbound SMS webhook. No account is
required, and the search does not ask for a patient's name.

## Run Oasis

```bash
cd rxreach
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on the computer.

To open Oasis on a phone, expose port 3000 through an HTTPS tunnel:

```bash
ngrok http 3000
```

Open the HTTPS address printed by ngrok.

## Pharmacy search

Oasis ranks pharmacies using four signals:

1. **ZIP match** — pharmacies in the user's ZIP rank first.
2. **Delivery support** — provider-backed delivery ranks above general chain policy.
3. **Distance** — closer pharmacies rank higher.
4. **Source date** — newer records break remaining ties.

Distance uses straight-line miles between ZIP-code centroids. Oasis does not
invent delivery times. Pharmacy websites handle the order process.

The web chat and SMS flow each show three pharmacy options.

## Pharmacy data

The pharmacy directory contains 146 Greater Boston pharmacies.

- `data/research/RxReach_Greater_Boston_Pharmacies_FIXED.csv` is the primary directory.
- `data/research/RxReach_Delivery_Programs_EXPANDED.csv` adds 58 delivery programs.
- Delivery-program records merge by pharmacy name and address.
- `data/pharmacies.generated.js` contains the generated application data.

Rebuild the pharmacy data with:

```bash
npm run build:pharmacies
```

Names, addresses, phone numbers, sources and review notes remain attached to each
record. Oasis directs users to confirm current stock and delivery eligibility with
the pharmacy.

## Medication catalog

Oasis recognizes 1,565 medication names from `data/catalog.generated.js`.

The catalog supports brand and generic names, partial matches and spelling
suggestions. It validates every medication before pharmacy search begins.

Oasis confirms:

1. Medication name.
2. Strength.
3. Dosage form.

The confirmation flow never substitutes another medication.

## Inbound SMS

Twilio sends incoming texts to:

```text
https://YOUR-PUBLIC-HOST/api/sms
```

Configure Twilio with **Custom** and **HTTP POST**.

The SMS conversation follows this path:

1. Ask for ZIP code.
2. Ask for medication.
3. Ask for strength and dosage form.
4. Return three pharmacy options.

The webhook returns TwiML for each custom response. Text `RESET` to restart or
`HELP` for instructions.

## Refill check-ins

Oasis remembers a selected medication in the browser. After 14 days, it offers a
one-tap reorder using the saved medication, strength and dosage form. The reorder
flow skips repeated medication questions.

## API routes

| Route | Purpose |
| --- | --- |
| `/api/chat` | Web conversation and medication confirmation |
| `/api/search` | Pharmacy ranking |
| `/api/medication` | Medication lookup |
| `/api/stock` | Pharmacy stock check |
| `/api/stock/result` | Stock-check result |
| `/api/sms` | Inbound SMS conversation |
| `/api/text` | Outbound pharmacy options |

## Validation

```bash
npm test
npm run build
```

Tests cover medication matching, confirmation, pharmacy data, deduplication,
ranking, distance, delivery rules and SMS conversations.
