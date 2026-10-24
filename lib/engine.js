// Oasis ranking engine (research-data edition).
//
// NO delivery-time estimates. We rank real research-sourced pharmacies by:
//   1. ZIP relevance     — exact ZIP, then same 3-digit ZIP area, then the rest
//   2. Delivery evidence — documented delivery > chain-policy delivery > none
//   3. Distance          — closer (approx ZIP-centroid miles) ranks higher
//   4. Source freshness  — more recently reviewed breaks remaining ties
//
// Returns the top 5 candidates. Nothing about speed, fees-as-numbers or cutoffs
// is invented; distance is an APPROXIMATE straight-line estimate from ZIP
// centroids (the CSVs carry no coordinates), surfaced as "~N mi".

import { PHARMACIES } from "../data/pharmacies.js";
import { ZIP_CENTROIDS } from "../data/zipCentroids.js";
import { DRUGS } from "../data/drugs.js";
import { insuranceFit } from "../data/plans.js";

const TOP_N = 5;

export function findDrug(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  return DRUGS.find((d) => t.includes(d.generic) || t.includes(d.name.toLowerCase().split(" ")[0])) || null;
}

// Approximate straight-line distance (miles) between two ZIP centroids. Returns
// null when we don't have a centroid for one of the ZIPs.
function milesBetween(zipA, zipB) {
  const a = ZIP_CENTROIDS[zipA], b = ZIP_CENTROIDS[zipB];
  if (!a || !b) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceMiles(p, zip) {
  if (!zip) return null;
  if (p.zip === zip) return 0;
  const m = milesBetween(zip, p.zip);
  return m == null ? null : Math.round(m * 10) / 10;
}

function distanceLabel(miles) {
  if (miles == null) return null;
  if (miles < 0.1) return "In your ZIP";
  if (miles < 1) return "Under 1 mi away";
  return `~${Math.round(miles)} mi away`;
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
  if (p.participating) return 3;
  if (p.advertisesDelivery) return 2;
  return 0;
}

function evidenceTier(p) {
  const lvl = (p.evidenceLevel || "").toUpperCase();
  if (lvl === "PROVIDER_WEBPAGE") return 2;
  if (lvl === "NETWORK_POLICY_ONLY") return 1;
  return 0;
}

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
  return Math.max(0, 1 - ageDays / 365);
}

// Short delivery line — demo-facing, no hedging words.
function deliveryLabel(p) {
  if (p.participating) return "Home delivery available";
  if (p.advertisesDelivery) return "Delivery may be available — call to confirm";
  return "Call to ask about delivery";
}

// Clean, demo-facing fee. Uses the sanitized feeDisplay from the data build;
// never shows the raw hedged string or coerces to a number.
function feeLabel(p) {
  return p.feeDisplay || "Delivery fee varies";
}

// Closeness component in [0,1]: 1 at 0 mi, ~0 by 25 mi. Unknown distance = neutral.
function proximityScore(miles) {
  if (miles == null) return 0.3;
  return Math.max(0, 1 - miles / 25);
}

function score(p, zip, miles) {
  const zr = zipRelevance(p, zip);
  const dt = deliveryTier(p);
  const px = proximityScore(miles);
  const fr = freshnessScore(p);
  // ZIP relevance + documented delivery dominate; distance then freshness break ties.
  return zr * 100 + dt * 25 + px * 10 + fr;
}

function buildResult(p, { zip, planId, miles }) {
  const type = typeOf(p);
  return {
    pharmacyId: p.id,
    name: p.name,
    type,
    phone: p.phone,
    address: [p.street, p.city, p.state, p.zip].filter(Boolean).join(", "),
    street: p.street, city: p.city, state: p.state, zip: p.zip,

    // Distance (approximate ZIP-centroid straight-line).
    distanceMiles: miles,
    distanceLabel: distanceLabel(miles),

    // Documented delivery info (no time estimate, no hedging words).
    deliveryProgram: p.deliveryProgram,
    deliveryArea: p.deliveryArea,
    feeDisplay: p.feeDisplay,
    feeLabel: feeLabel(p),
    deliveryLabel: deliveryLabel(p),
    participating: p.participating,
    advertisesDelivery: p.advertisesDelivery,

    // Provenance (kept in data; not surfaced as hedging copy).
    evidenceLevel: p.evidenceLevel,
    source: p.sources,
    providerUrl: p.providerUrl,
    verificationNote: p.notes,
    requiresPhoneVerification: p.requiresPhoneVerification,

    smsEligible: !!(p.phone && p.participating),

    insurance: insuranceFit(planId, type),

    // ---- UI-compat fields the result card reads ----
    orderUrl: p.providerUrl || p.evidenceUrl || null,
    mode: "documented",
    etaLabel: deliveryLabel(p),
    fee: null,
    cutoff: null,
    confidence: null,       // no "unverified/likely" confidence word in the demo
    lastVerified: null,
    deadlineStatus: "none"
  };
}

export function search({ zip, medication, planId = null, limit = TOP_N } = {}) {
  const drug = findDrug(medication);

  const ranked = PHARMACIES
    .map((p) => {
      const miles = distanceMiles(p, zip);
      return { p, miles, s: score(p, zip, miles) };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ p, miles }) => ({ ...buildResult(p, { zip, planId, miles }), score: undefined }));

  const exact = PHARMACIES.some((p) => p.zip === zip);
  const sameArea = PHARMACIES.some((p) => zip && p.zip?.slice(0, 3) === zip.slice(0, 3));
  let fallback = null;
  if (!exact && sameArea) fallback = { reason: "nearby_zip", zip };
  else if (!exact && !sameArea) fallback = { reason: "widened", zip };

  const flags = [];
  if (drug?.special === "cold_chain") flags.push("cold_chain");
  if (drug?.special === "controlled") flags.push("controlled");
  if (drug?.special === "time_critical") flags.push("time_critical");

  return {
    zip,
    usedZip: zip,
    fallback,
    drug: drug ? drug.name : medication,
    rushResults: [],
    meetsDeadline: ranked,
    otherOptions: [],
    candidates: ranked,
    flags,
    disclaimers: ["not_emergency", "confirm_availability"]
  };
}
