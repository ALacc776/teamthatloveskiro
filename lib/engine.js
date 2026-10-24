// RxReach ranking engine (research-data edition).
//
// NO delivery-time estimates. We rank real research-sourced pharmacies by:
//   1. ZIP relevance     — exact ZIP, then same 3-digit ZIP area, then the rest
//   2. Delivery evidence — participating > advertises delivery > network-policy > none
//   3. Evidence level    — provider/partner page > network policy only
//   4. Source freshness  — more recently reviewed ranks higher
//
// Returns the top 5 candidates. Nothing about speed, fees-as-numbers, cutoffs or
// reliability is invented; we surface only what the research documented.

import { PHARMACIES } from "../data/pharmacies.js";
import { DRUGS } from "../data/drugs.js";
import { insuranceFit } from "../data/plans.js";

const TOP_N = 5;

export function findDrug(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  return DRUGS.find((d) => t.includes(d.generic) || t.includes(d.name.toLowerCase().split(" ")[0])) || null;
}

// Map the research record_type to the pharmacy "type" the UI/insurance use.
function typeOf(p) {
  const rt = (p.recordType || "").toLowerCase();
  if (rt.includes("mail")) return "mail-order";
  if (rt.includes("community") || rt.includes("independent") || rt.includes("health center")) return "independent";
  return "chain";
}

// Delivery-evidence tier (higher = stronger documented delivery).
function deliveryTier(p) {
  if (p.participating) return 3;              // provider/partner page evidence + advertises
  if (p.advertisesDelivery) return 2;         // advertises but only chain-policy evidence
  return 0;                                   // no documented delivery
}

function evidenceTier(p) {
  const lvl = (p.evidenceLevel || "").toUpperCase();
  if (lvl === "PROVIDER_WEBPAGE") return 2;
  if (lvl === "NETWORK_POLICY_ONLY") return 1;
  return 0;
}

// ZIP relevance: 2 = exact, 1 = same 3-digit area, 0 = elsewhere in dataset.
function zipRelevance(p, zip) {
  if (!zip) return 0;
  if (p.zip === zip) return 2;
  if (p.zip && zip.length >= 3 && p.zip.slice(0, 3) === zip.slice(0, 3)) return 1;
  return 0;
}

function freshnessScore(p) {
  const d = Date.parse(p.sourceLastReviewed || "");
  if (Number.isNaN(d)) return 0;
  const ageDays = (Date.now() - d) / 86400000;
  return Math.max(0, 1 - ageDays / 365); // 1.0 today -> 0 after a year
}

// A short, honest "what's documented" label — NOT an ETA.
function deliveryLabel(p) {
  if (p.participating) return "Delivery documented on provider page — confirm by phone";
  if (p.advertisesDelivery) return "Chain delivery policy only — not verified for this store";
  return "No documented delivery — call to ask";
}

// Fee: pass the research string through verbatim; never coerce to a number.
function feeLabel(p) {
  return p.deliveryFee || "Delivery fee not documented";
}

function score(p, zip) {
  const zr = zipRelevance(p, zip);
  const dt = deliveryTier(p);
  const et = evidenceTier(p);
  const fr = freshnessScore(p);
  // Weighted so ZIP + documented delivery dominate; freshness breaks ties.
  return zr * 100 + dt * 20 + et * 5 + fr;
}

function buildResult(p, { zip, planId }) {
  const type = typeOf(p);
  return {
    pharmacyId: p.id,
    name: p.name,
    type,
    phone: p.phone,
    // Address block (preserved verbatim from research).
    address: [p.street, p.city, p.state, p.zip].filter(Boolean).join(", "),
    street: p.street, city: p.city, state: p.state, zip: p.zip,

    // Documented delivery info (no time estimate).
    deliveryProgram: p.deliveryProgram,
    deliveryArea: p.deliveryArea,
    deliveryFee: p.deliveryFee,
    feeLabel: feeLabel(p),
    deliveryLabel: deliveryLabel(p),
    participating: p.participating,
    advertisesDelivery: p.advertisesDelivery,

    // Provenance / verification (preserved).
    evidenceLevel: p.evidenceLevel,
    source: p.sources,
    sourceRecordIds: p.sourceRecordIds,
    providerUrl: p.providerUrl,
    evidenceUrl: p.evidenceUrl,
    sourceLastReviewed: p.sourceLastReviewed,
    verificationNote: p.notes,
    requiresPhoneVerification: p.requiresPhoneVerification,

    // Do NOT assume SMS: only verified, participating pharmacies may be texted,
    // and only phone numbers the research documented exist at all.
    smsEligible: !!(p.phone && p.participating),

    insuranceText: p.insurance,
    insurance: insuranceFit(planId, type),

    // ---- UI-compat fields (the result card reads these) ----
    // We keep the keys the chat UI renders, but populate them HONESTLY:
    // no fabricated ETA, cutoff, confidence or lastVerified timestamps.
    orderUrl: p.providerUrl || p.evidenceUrl || null,
    mode: "documented",
    etaLabel: deliveryLabel(p),                 // reused slot: documented-delivery line, not an ETA
    fee: null,                                  // never coerce the research fee string to a number
    cutoff: null,
    confidence: p.participating ? "documented" : "unverified",
    lastVerified: p.sourceLastReviewed || null,
    deadlineStatus: "none"
  };
}

// Main entry. Returns the top 5 relevant pharmacies for a ZIP + medication.
// `neededBy`, `rush`, `sort` are accepted for API back-compat but no longer drive
// any time math — ranking is ZIP + documented delivery evidence.
export function search({ zip, medication, planId = null, limit = TOP_N } = {}) {
  const drug = findDrug(medication);

  // Rank the WHOLE dataset; ZIP relevance is a score component so we never
  // "say no" — the nearest documented pharmacies always come back.
  const ranked = PHARMACIES
    .map((p) => ({ p, s: score(p, zip) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ p }) => ({ ...buildResult(p, { zip, planId }), score: undefined }));

  const exact = PHARMACIES.some((p) => p.zip === zip);
  const sameArea = PHARMACIES.some((p) => zip && p.zip?.slice(0, 3) === zip.slice(0, 3));
  let fallback = null;
  if (!exact && sameArea) fallback = { reason: "nearby_zip", zip };
  else if (!exact && !sameArea) fallback = { reason: "widened", zip };

  const flags = [];
  if (drug?.special === "cold_chain") flags.push("cold_chain");
  if (drug?.special === "controlled") flags.push("controlled");
  if (drug?.special === "time_critical") flags.push("time_critical");

  // The chat UI flattens rushResults + meetsDeadline + otherOptions. We no longer
  // compute deadlines, so all candidates land in meetsDeadline (ranked order),
  // keeping the existing UI working without any time claims.
  return {
    zip,
    usedZip: zip,
    fallback,
    drug: drug ? drug.name : medication,
    rushResults: [],
    meetsDeadline: ranked,
    otherOptions: [],
    candidates: ranked,            // explicit name for the top-5 list
    flags,
    disclaimers: ["not_emergency", "confirm_availability", "confirm_delivery_eligibility"]
  };
}
