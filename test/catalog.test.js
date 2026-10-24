// Tests for the medication catalog + confirmation gate.
// Run: npm test   (uses node:test, no extra dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalize, exactMatch, partialMatches, fuzzySuggestions,
  resolveMedication, CATALOG_PROVENANCE, entries
} from "../lib/catalog.js";
import {
  beginConfirmation, advanceConfirmation, toInquiry,
  detectStrength, detectForm
} from "../lib/confirmation.js";

// ---- Catalog loaded ----
test("catalog loads a broad index with brand and generic names", () => {
  const all = entries();
  assert.ok(all.length > 1000, "expected a broad catalog");
  assert.ok(all.some((e) => e.type === "brand"));
  assert.ok(all.some((e) => e.type === "generic"));
});

test("provenance preserves the verification warning and RxTerms replaceability", () => {
  assert.equal(CATALOG_PROVENANCE.verificationStatus, "needs_RxNorm_and_FDA_verification");
  assert.match(CATALOG_PROVENANCE.usageNote, /NOT evidence of pharmacy stock/i);
  assert.match(CATALOG_PROVENANCE.replaceableBy, /RxTerms/);
});

// ---- Case-insensitive exact match ----
test("exact match is case-insensitive", () => {
  for (const q of ["amoxicillin", "AMOXICILLIN", "Amoxicillin", "  AmOxIcIlLiN  "]) {
    const m = exactMatch(q);
    assert.ok(m, `should match ${q}`);
    assert.equal(m.name.toLowerCase(), "amoxicillin");
    assert.equal(m.type, "generic");
  }
});

test("brand names are recognized as brand, generic as generic", () => {
  const brand = exactMatch("Abilify");
  assert.ok(brand);
  assert.equal(brand.type, "brand");

  const generic = exactMatch("acetaminophen");
  assert.ok(generic);
  assert.equal(generic.type, "generic");
});

test("punctuation-tolerant exact match (AcipHex, slashes)", () => {
  assert.ok(exactMatch("aciphex"));
  assert.ok(exactMatch("acetaminophen/caffeine"));
  assert.ok(exactMatch("acetaminophen caffeine")); // normalized equal
});

test("every returned match carries its verification warning", () => {
  const m = exactMatch("Adderall");
  assert.equal(m.preliminary, true);
  assert.ok(m.verificationStatus);
  assert.ok(m.usageNote);
});

// ---- Partial matching ----
test("partial/prefix matching returns autocomplete candidates", () => {
  const ms = partialMatches("amox", 8);
  assert.ok(ms.length >= 1);
  assert.ok(ms.some((m) => m.name.toLowerCase().startsWith("amox")));
  assert.ok(ms.every((m) => m.match === "partial"));
});

// ---- Typo tolerance ----
test("fuzzy suggestions tolerate a typo", () => {
  const ms = fuzzySuggestions("amoxicilin"); // missing an 'l'
  assert.ok(ms.length >= 1);
  assert.ok(ms.some((m) => m.name.toLowerCase() === "amoxicillin"));
});

test("fuzzy suggestions tolerate a transposition", () => {
  const ms = fuzzySuggestions("metfornim"); // metformin transposed
  assert.ok(ms.some((m) => m.name.toLowerCase() === "metformin"));
});

// ---- resolveMedication ----
test("resolveMedication finds a drug inside a sentence", () => {
  const r = resolveMedication("I need amoxicillin by tonight");
  assert.equal(r.status, "exact");
  assert.equal(r.entry.name.toLowerCase(), "amoxicillin");
  assert.equal(r.needsConfirm, true); // recognition is never confirmation
});

test("resolveMedication returns ambiguous (never auto-picks) for a typo", () => {
  const r = resolveMedication("amoxicilin");
  assert.equal(r.status, "ambiguous");
  assert.ok(r.suggestions.length >= 1);
});

test("resolveMedication returns none for gibberish", () => {
  const r = resolveMedication("zzzqqq not a drug");
  assert.equal(r.status, "none");
});

// ---- strength / form detectors ----
test("detectStrength parses common strengths", () => {
  assert.equal(detectStrength("500 mg please"), "500 mg");
  assert.equal(detectStrength("0.5%"), "0.5%");
  assert.equal(detectStrength("100mcg"), "100mcg");
  assert.equal(detectStrength("no number here"), null);
});

test("detectForm recognizes dosage forms and canonicalizes", () => {
  assert.equal(detectForm("tablets"), "tablet");
  assert.equal(detectForm("a capsule"), "capsule");
  assert.equal(detectForm("inhaler"), "inhaler");
  assert.equal(detectForm("nothing"), null);
});

// ---- Confirmation state machine ----
test("confirmation gate requires exact name, strength and form before ready", () => {
  // begin from an exact detection
  const b = beginConfirmation("amoxicillin");
  assert.ok(b.pending);
  assert.equal(b.pending.stage, "collect_strength");
  assert.equal(b.pending.entry.name.toLowerCase(), "amoxicillin");

  // give strength only
  const s = advanceConfirmation(b.pending, "500 mg");
  assert.equal(s.ready, false);
  assert.equal(s.pending.stage, "collect_form");
  assert.equal(s.pending.strength, "500 mg");

  // give form -> ready
  const f = advanceConfirmation(s.pending, "tablet");
  assert.equal(f.ready, true);
  assert.equal(f.pending.stage, "ready");

  const inq = toInquiry(f.pending);
  assert.equal(inq.medication.toLowerCase(), "amoxicillin");
  assert.equal(inq.strength, "500 mg");
  assert.equal(inq.form, "tablet");
  assert.equal(inq.preliminary, true);
  assert.ok(inq.verificationStatus);
});

test("strength and form given in one line short-circuits to ready", () => {
  const b = beginConfirmation("metformin");
  const r = advanceConfirmation(b.pending, "500 mg tablet");
  assert.equal(r.ready, true);
  assert.equal(r.pending.strength, "500 mg");
  assert.equal(r.pending.form, "tablet");
});

test("ambiguous name forces the user to pick (no substitution)", () => {
  const b = beginConfirmation("amoxicilin"); // typo
  assert.ok(b.pending);
  assert.equal(b.pending.stage, "confirm_name");
  assert.ok(b.pending.suggestions.length >= 1);

  // picking an offered name advances to strength collection
  const pick = b.pending.suggestions.find((s) => s.name.toLowerCase() === "amoxicillin");
  assert.ok(pick, "amoxicillin should be among suggestions");
  const r = advanceConfirmation(b.pending, pick.name);
  assert.equal(r.pending.stage, "collect_strength");
  assert.equal(r.pending.entry.name.toLowerCase(), "amoxicillin");
});

test("toInquiry copies the confirmed med verbatim — never a different drug", () => {
  const b = beginConfirmation("Abilify"); // brand
  const s = advanceConfirmation(b.pending, "10 mg");
  const f = advanceConfirmation(s.pending, "tablet");
  const inq = toInquiry(f.pending);
  assert.equal(inq.medication, "Abilify"); // exact brand, not substituted to a generic
  assert.equal(inq.medicationType, "brand");
});

test("unrecognized name is not forced into a match", () => {
  const b = beginConfirmation("definitelynotadrug");
  assert.equal(b.pending, null);
  assert.match(b.reply, /couldn't find|spelling|exact name/i);
});
