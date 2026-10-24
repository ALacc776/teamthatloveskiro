// One-time build: research CSVs -> data/pharmacies.generated.js
//
// Inputs (same 26-column schema):
//   1. RxReach_Greater_Boston_Pharmacies_FIXED.csv   (primary dataset)
//   2. RxReach_Delivery_Programs_EXPANDED.csv         (delivery-program records)
//
// These are REAL research records. We preserve pharmacy names, addresses,
// phone numbers, sources and verification notes verbatim. We do NOT invent
// delivery-time estimates, fees, cutoffs or reliability scores — only what the
// research documented is carried through.
//
// Dedupe rule: a pharmacy is identified by (normalized name + normalized street
// address). When the delivery-programs file documents a pharmacy already present
// in the primary file, we MERGE the program evidence into that one record rather
// than creating a duplicate.
//
// Run: node scripts/build-pharmacies.mjs <primary.csv> <programs.csv> <out.js>

import { readFileSync, writeFileSync } from "node:fs";

const [, , primaryPath, programsPath, outPath] = process.argv;
if (!primaryPath || !programsPath || !outPath) {
  console.error("usage: node scripts/build-pharmacies.mjs <primary.csv> <programs.csv> <out.js>");
  process.exit(1);
}

// RFC-4180-ish CSV parser (handles quoted fields with commas / embedded quotes).
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // ignore; \n handles the newline
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadRecords(path) {
  const raw = readFileSync(path, "utf8");
  const rows = parseCsv(raw).filter((r) => r.length > 1 && r.some((c) => c.trim() !== ""));
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const g = (r, key) => (r[idx[key]] ?? "").trim();
  return rows.slice(1).map((r) => ({
    recordId: g(r, "record_id"),
    name: g(r, "pharmacy_name"),
    street: g(r, "street_address"),
    city: g(r, "city"),
    state: g(r, "state"),
    zip: g(r, "zip"),
    phone: g(r, "phone"),
    recordType: g(r, "record_type"),
    evidenceLevel: g(r, "evidence_level"),
    deliveryAdvertised: g(r, "delivery_advertised"),
    deliveryProgram: g(r, "delivery_program_or_network"),
    deliveryArea: g(r, "advertised_delivery_area"),
    deliveryFee: g(r, "advertised_delivery_fee"),
    deliveryTime: g(r, "advertised_delivery_time"),
    insurance: g(r, "insurance_information"),
    medicationInfo: g(r, "medication_information"),
    restrictions: g(r, "service_restrictions"),
    providerUrl: g(r, "provider_or_store_url"),
    evidenceUrl: g(r, "evidence_url"),
    evidenceDescription: g(r, "evidence_description"),
    sourceLastReviewed: g(r, "source_last_reviewed"),
    patientEligibilityVerified: g(r, "patient_eligibility_verified"),
    liveMedicationInventory: g(r, "live_medication_inventory"),
    patientDeliveryEta: g(r, "patient_delivery_eta"),
    requiresPhoneVerification: g(r, "requires_phone_verification"),
    notes: g(r, "notes")
  })).filter((x) => x.name);
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
// Street key: normalize and strip common suffixes so "155-157 Charles Street"
// and "155 Charles St" collide. Keep the leading number(s) for specificity.
function streetKey(street) {
  return norm(street)
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|place|pl|court|ct|suite|ste|unit|floor|fl)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function dedupeKey(rec) {
  return `${norm(rec.name)}|${streetKey(rec.street)}`;
}

// A pharmacy "advertises delivery" per the research if the delivery_advertised
// field is anything other than an explicit no / blank.
function advertisesDelivery(rec) {
  const d = (rec.deliveryAdvertised || "").toLowerCase();
  if (!d) return false;
  if (/^no\b/.test(d) || d === "not available") return false;
  return true;
}

// "Participating" = evidence stronger than mere chain network policy. We treat
// a store the research could only tie to chain policy (NETWORK_POLICY_ONLY) as
// NOT verified-participating, because the policy does not prove THIS store
// delivers. Anything with provider-page / direct evidence is participating.
function isParticipating(rec) {
  if (!advertisesDelivery(rec)) return false;
  const lvl = (rec.evidenceLevel || "").toUpperCase();
  if (lvl === "NETWORK_POLICY_ONLY") return false;
  return true;
}

function slugId(rec, seen) {
  let base = "rx_" + norm(`${rec.name} ${rec.city}`).replace(/\s+/g, "_").slice(0, 48);
  let id = base, n = 2;
  while (seen.has(id)) { id = `${base}_${n++}`; }
  seen.add(id);
  return id;
}

function toRecord(rec, source) {
  return {
    recordId: rec.recordId || null,
    name: rec.name,
    recordType: rec.recordType,
    street: rec.street,
    city: rec.city,
    state: rec.state,
    zip: rec.zip,
    phone: rec.phone || null,
    // Documented delivery evidence (verbatim from research; NO invented ETA/fee).
    deliveryAdvertised: rec.deliveryAdvertised,
    deliveryProgram: rec.deliveryProgram || null,
    deliveryArea: rec.deliveryArea || null,
    deliveryFee: rec.deliveryFee || null,
    insurance: rec.insurance || null,
    medicationInfo: rec.medicationInfo || null,
    restrictions: rec.restrictions || null,
    evidenceLevel: rec.evidenceLevel,
    providerUrl: rec.providerUrl || null,
    evidenceUrl: rec.evidenceUrl || null,
    evidenceDescription: rec.evidenceDescription || null,
    sourceLastReviewed: rec.sourceLastReviewed || null,
    notes: rec.notes || null,
    requiresPhoneVerification: /^yes/i.test(rec.requiresPhoneVerification),
    advertisesDelivery: advertisesDelivery(rec),
    participating: isParticipating(rec),
    sources: [source],
    sourceRecordIds: rec.recordId ? [rec.recordId] : []
  };
}

// Merge a program record into an existing primary record WITHOUT fabricating.
// We only FILL fields the primary left blank, and we UNION evidence/program
// signals (a program record is strong participating evidence).
function merge(into, rec, source) {
  const fill = (key, val) => { if ((into[key] == null || into[key] === "") && val) into[key] = val; };
  fill("deliveryProgram", rec.deliveryProgram);
  fill("deliveryArea", rec.deliveryArea);
  fill("deliveryFee", rec.deliveryFee);
  fill("insurance", rec.insurance);
  fill("medicationInfo", rec.medicationInfo);
  fill("restrictions", rec.restrictions);
  fill("providerUrl", rec.providerUrl);
  fill("phone", rec.phone || null);

  // Evidence: a provider/program page beats NETWORK_POLICY_ONLY.
  if ((into.evidenceLevel || "").toUpperCase() === "NETWORK_POLICY_ONLY" &&
      (rec.evidenceLevel || "").toUpperCase() !== "NETWORK_POLICY_ONLY") {
    into.evidenceLevel = rec.evidenceLevel;
    into.evidenceUrl = rec.evidenceUrl || into.evidenceUrl;
    into.evidenceDescription = rec.evidenceDescription || into.evidenceDescription;
    into.deliveryAdvertised = rec.deliveryAdvertised || into.deliveryAdvertised;
  }
  into.advertisesDelivery = into.advertisesDelivery || advertisesDelivery(rec);
  into.participating = into.participating || isParticipating(rec);
  if (!into.sources.includes(source)) into.sources.push(source);
  if (rec.recordId && !into.sourceRecordIds.includes(rec.recordId)) into.sourceRecordIds.push(rec.recordId);
}

const primary = loadRecords(primaryPath);
const programs = loadRecords(programsPath);

const seenIds = new Set();
const byKey = new Map();
const ordered = [];

// Primary dataset first — it is the authoritative pharmacy list.
for (const rec of primary) {
  const key = dedupeKey(rec);
  if (byKey.has(key)) { merge(byKey.get(key), rec, "greater_boston_pharmacies"); continue; }
  const r = toRecord(rec, "greater_boston_pharmacies");
  r.id = slugId(rec, seenIds);
  byKey.set(key, r);
  ordered.push(r);
}

// Delivery programs: merge into an existing pharmacy or add as a new one.
let merged = 0, addedFromPrograms = 0;
for (const rec of programs) {
  const key = dedupeKey(rec);
  if (byKey.has(key)) { merge(byKey.get(key), rec, "delivery_programs"); merged++; continue; }
  const r = toRecord(rec, "delivery_programs");
  r.id = slugId(rec, seenIds);
  byKey.set(key, r);
  ordered.push(r);
  addedFromPrograms++;
}

// Collect every ZIP that appears, so search has a known-coverage set.
const zips = [...new Set(ordered.map((p) => p.zip).filter(Boolean))].sort();

const banner = `// AUTO-GENERATED from the RxReach research CSVs — DO NOT EDIT BY HAND.
// Regenerate: npm run build:pharmacies
//
// Primary: RxReach_Greater_Boston_Pharmacies_FIXED.csv
// Programs: RxReach_Delivery_Programs_EXPANDED.csv (merged, de-duplicated)
//
// These are REAL research records. Names, addresses, phone numbers, sources and
// verification notes are preserved verbatim. There are NO delivery-time estimates
// here: 'advertised_delivery_time' from the source is intentionally NOT imported.
// A listed pharmacy is NOT proof of stock or of this patient's eligibility — every
// record still requires phone verification. Do not assume a phone supports SMS.`;

const out =
`${banner}

export const PHARMACY_PROVENANCE = ${JSON.stringify({
  primaryFile: "RxReach_Greater_Boston_Pharmacies_FIXED.csv",
  programsFile: "RxReach_Delivery_Programs_EXPANDED.csv",
  primaryRecords: primary.length,
  programRecords: programs.length,
  mergedIntoPrimary: merged,
  addedFromPrograms,
  totalPharmacies: ordered.length,
  generatedAt: new Date().toISOString().slice(0, 10),
  note: "Research-sourced. Requires phone verification. Not proof of stock. No delivery-time estimates."
}, null, 2)};

// Every ZIP present in the dataset (documented coverage set).
export const PHARMACY_ZIPS = ${JSON.stringify(zips)};

// Each entry preserves source name/address/phone/source/verification verbatim.
export const PHARMACIES = ${JSON.stringify(ordered, null, 1)};
`;

writeFileSync(outPath, out);
console.log(`primary=${primary.length} programs=${programs.length}`);
console.log(`merged into primary=${merged}, added new from programs=${addedFromPrograms}`);
console.log(`total unique pharmacies=${ordered.length}, distinct zips=${zips.length}`);
console.log(`participating=${ordered.filter((p) => p.participating).length}`);
console.log(`wrote -> ${outPath}`);
