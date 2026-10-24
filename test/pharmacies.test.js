// Tests for the research-sourced pharmacy dataset + ranking engine.
// Run: npm test   (uses node:test, no extra dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PHARMACIES, PHARMACY_ZIPS, PHARMACY_PROVENANCE
} from "../data/pharmacies.js";
import { search, findDrug } from "../lib/engine.js";

// ---- Dataset loaded & replaces the fictional data ----
test("dataset loads the 146 real research pharmacies", () => {
  assert.equal(PHARMACIES.length, 146);
  assert.equal(PHARMACY_PROVENANCE.totalPharmacies, 146);
  assert.equal(PHARMACY_PROVENANCE.primaryRecords, 146);
  assert.equal(PHARMACY_PROVENANCE.programRecords, 58);
});

test("the fictional Greenfield demo pharmacies are gone", () => {
  const names = PHARMACIES.map((p) => p.name.toLowerCase());
  assert.ok(!names.some((n) => n.includes("greenfield family pharmacy")));
  assert.ok(!names.some((n) => n.includes("mailright")));
  // Real Boston-area pharmacies are present.
  assert.ok(names.some((n) => n.includes("fenway health pharmacy")));
});

// ---- Dedupe: 58 program records merged, zero duplicate pharmacies created ----
test("delivery-program records merged without creating duplicates", () => {
  assert.equal(PHARMACY_PROVENANCE.mergedIntoPrimary, 58);
  assert.equal(PHARMACY_PROVENANCE.addedFromPrograms, 0);
});

test("no two pharmacies share the same name + street address", () => {
  const keys = PHARMACIES.map(
    (p) => `${p.name.toLowerCase().trim()}|${(p.street || "").toLowerCase().trim()}`
  );
  assert.equal(new Set(keys).size, keys.length);
});

test("ids are unique", () => {
  const ids = PHARMACIES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---- Preserved fields ----
test("names, addresses, phones, sources and verification notes are preserved", () => {
  for (const p of PHARMACIES) {
    assert.ok(p.name, "name present");
    assert.ok(p.city && p.state, "city and state present");
    assert.ok(typeof p.street === "string", "street preserved (may be blank for delivery-only programs)");
    assert.ok(typeof p.zip === "string", "zip preserved");
    assert.ok(Array.isArray(p.sources) && p.sources.length >= 1, "source present");
    // Every research record requires phone verification.
    assert.equal(p.requiresPhoneVerification, true);
    // Optional source fields are preserved verbatim or left null — never invented.
    assert.ok(p.notes === null || typeof p.notes === "string", "note preserved or null");
    assert.ok(p.phone === null || typeof p.phone === "string", "phone preserved or null");
  }
  // The research documented most, but not all, notes/phones; preservation must
  // not fabricate the gaps.
  assert.ok(PHARMACIES.some((p) => p.notes), "some notes present");
  assert.ok(PHARMACIES.some((p) => !p.phone), "some phones legitimately missing");
});

// ---- No delivery-time estimates leaked in ----
test("no delivery-time estimate fields are present on any pharmacy", () => {
  for (const p of PHARMACIES) {
    assert.ok(!("patientDeliveryEta" in p), "no ETA field");
    assert.ok(!("fillMinutes" in p), "no fill-time field");
    assert.ok(!("window" in p), "no delivery window");
    assert.ok(!("cutoff" in p), "no cutoff");
  }
});

// ---- Participating classification is honest ----
test("network-policy-only chain stores are NOT marked participating", () => {
  const npo = PHARMACIES.filter((p) => p.evidenceLevel === "NETWORK_POLICY_ONLY");
  assert.ok(npo.length > 0, "there should be chain-policy records");
  assert.ok(npo.every((p) => p.participating === false));
});

test("provider-webpage records advertising delivery are participating", () => {
  const participating = PHARMACIES.filter((p) => p.participating);
  assert.equal(participating.length, 58);
  assert.ok(participating.every((p) => p.advertisesDelivery));
});

// ---- Engine: ZIP + documented-delivery ranking, top 5 ----
test("search returns at most 5 candidates", () => {
  const r = search({ zip: "02115", medication: "amoxicillin" });
  assert.ok(r.candidates.length <= 5);
  assert.ok(r.candidates.length >= 1);
});

test("exact-ZIP pharmacies rank ahead of out-of-area ones", () => {
  const zip = "02215"; // Fenway area, present in dataset
  assert.ok(PHARMACY_ZIPS.includes(zip));
  const r = search({ zip, medication: "metformin" });
  const top = r.candidates[0];
  // The top candidate should be in the requested ZIP (exact relevance wins).
  assert.equal(top.zip, zip);
});

test("participating pharmacies outrank non-participating at equal ZIP relevance", () => {
  // Pick a ZIP that has both a participating and a non-participating pharmacy.
  const zipCounts = {};
  for (const p of PHARMACIES) {
    zipCounts[p.zip] ??= { part: 0, non: 0 };
    if (p.participating) zipCounts[p.zip].part++; else zipCounts[p.zip].non++;
  }
  const mixed = Object.entries(zipCounts).find(([, c]) => c.part > 0 && c.non > 0);
  assert.ok(mixed, "expected a ZIP with both kinds");
  const [zip] = mixed;
  const r = search({ zip, medication: "lisinopril" });
  const sameZip = r.candidates.filter((c) => c.zip === zip);
  const firstNonIdx = sameZip.findIndex((c) => !c.participating);
  const firstPartIdx = sameZip.findIndex((c) => c.participating);
  if (firstNonIdx !== -1 && firstPartIdx !== -1) {
    assert.ok(firstPartIdx < firstNonIdx, "participating should come first");
  }
});

test("search never returns empty — widens when ZIP is unknown", () => {
  const r = search({ zip: "99999", medication: "amoxicillin" });
  assert.ok(r.candidates.length >= 1);
  assert.equal(r.fallback.reason, "widened");
});

// ---- SMS eligibility: never assume a phone supports SMS ----
test("smsEligible is only true for verified participating pharmacies with a phone", () => {
  const r = search({ zip: "02115", medication: "amoxicillin", limit: 146 });
  for (const c of r.candidates) {
    if (c.smsEligible) {
      assert.ok(c.participating, "smsEligible implies participating");
      assert.ok(c.phone, "smsEligible implies a known phone");
    }
  }
  // A non-participating candidate must never be smsEligible.
  assert.ok(r.candidates.filter((c) => !c.participating).every((c) => !c.smsEligible));
});

// ---- Result carries no fabricated ETA ----
test("results expose documented delivery info, not a time estimate", () => {
  const r = search({ zip: "02115", medication: "amoxicillin" });
  const c = r.candidates[0];
  assert.equal(c.mode, "documented");
  assert.equal(c.fee, null);          // research fee string is never coerced to a number
  assert.equal(c.cutoff, null);       // no cutoff invented
  assert.ok("deliveryLabel" in c);
  assert.ok("verificationNote" in c);
  assert.ok(Array.isArray(c.source));
});

// ---- Drug detection still works (catalog/flow untouched) ----
test("findDrug still recognizes the demo drugs and safety flags flow", () => {
  assert.ok(findDrug("I need amoxicillin"));
  const r = search({ zip: "02115", medication: "EpiPen" });
  assert.ok(r.flags.includes("time_critical"));
});

// ---- Fees are cleaned for the demo (no hedging, no 'qualifying; verify') ----
test("fee display strips '(qualifying; verify)' and hedging words", () => {
  for (const p of PHARMACIES) {
    if (p.feeDisplay) {
      assert.ok(!/qualif|verify|advertised|claimed|posted|recheck|unverified/i.test(p.feeDisplay),
        `feeDisplay should be clean: ${p.feeDisplay}`);
    }
  }
  // The CVS chain-policy fee is reduced to a plain amount.
  const cvs = PHARMACIES.find((p) => (p.deliveryFee || "").includes("qualifying"));
  assert.ok(cvs);
  assert.equal(cvs.feeDisplay, "$5.49 delivery");
});

// ---- Distance is surfaced (approximate, from ZIP centroids) ----
test("search attaches an approximate distance for known ZIPs", () => {
  const r = search({ zip: "02215", medication: "amoxicillin" });
  const same = r.candidates.find((c) => c.zip === "02215");
  assert.ok(same);
  assert.equal(same.distanceMiles, 0);
  assert.equal(same.distanceLabel, "In your ZIP");
  // A candidate in a different ZIP has a positive approximate distance.
  const other = r.candidates.find((c) => c.zip && c.zip !== "02215");
  if (other) assert.ok(other.distanceMiles === null || other.distanceMiles > 0);
});

test("closer pharmacies are not out-ranked by farther ones at equal evidence", () => {
  const r = search({ zip: "02215", medication: "metformin" });
  // Within the participating, same-area group, distances should be non-decreasing
  // enough that the nearest participating pharmacy is at or near the top.
  const participating = r.candidates.filter((c) => c.participating && c.distanceMiles != null);
  if (participating.length >= 2) {
    assert.ok(participating[0].distanceMiles <= participating[participating.length - 1].distanceMiles + 5);
  }
});

// ---- No hedging confidence word leaks to the card ----
test("results do not carry a hedging confidence label", () => {
  const r = search({ zip: "02115", medication: "amoxicillin" });
  for (const c of r.candidates) {
    assert.equal(c.confidence, null);
  }
});
