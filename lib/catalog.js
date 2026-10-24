// lib/catalog.js — Medication NAME-RECOGNITION catalog (lookup + autocomplete).
//
// WHAT THIS IS
//   A preliminary name-recognition and autocomplete index, NOT a clinically
//   verified formulary. It answers "is this a plausible medication name, and is
//   it brand or generic?" — it does NOT prove the drug exists at a strength, in
//   a dosage form, or in stock at any pharmacy. Every returned entry carries the
//   source CSV's verification warning (see CATALOG_PROVENANCE).
//
// WHY IT IS SEPARATE FROM data/drugs.js
//   data/drugs.js is the small operational catalog that drives ETA priors and
//   safety flags (cold_chain / controlled / time_critical) in lib/engine.js.
//   This module is ONLY about recognizing what the user typed. The two are
//   intentionally decoupled: a name can be recognized here without being
//   operationally modeled in drugs.js.
//
// SWAPPABILITY (future NLM RxTerms / RxNorm)
//   Everything downstream depends only on the EXPORTED FUNCTIONS and the shape
//   of a CatalogMatch. To replace the CSV with the official NLM RxTerms DB, keep
//   this file's public interface and change only how `entries()` is sourced
//   (e.g. load RxTerms rows, populate `rxcui`). Nothing else in the app reads
//   data/catalog.generated.js directly.
//
// DATA REGEN
//   data/catalog.generated.js is produced from the CSV by scripts/build-catalog.mjs:
//     npm run build:catalog -- <path-to-csv> data/catalog.generated.js
//   Do not hand-edit the generated file.

import { CATALOG_ENTRIES, CATALOG_PROVENANCE } from "../data/catalog.generated.js";

export { CATALOG_PROVENANCE };

// ---- Normalization --------------------------------------------------------

// Case-insensitive, punctuation/whitespace-tolerant key. Keeps letters, digits
// and spaces; collapses runs of space. "AcipHex" -> "aciphex",
// "acetaminophen/caffeine" -> "acetaminophen caffeine".
export function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Build lookup structures once (module-level, so it is paid a single time).
const ENTRIES = CATALOG_ENTRIES.map((e) => ({ ...e, _norm: normalize(e.name) }));
const BY_NORM = new Map();
for (const e of ENTRIES) {
  if (!BY_NORM.has(e._norm)) BY_NORM.set(e._norm, e);
}

export function entries() {
  return ENTRIES;
}

// Attach the shared verification warning to any entry we hand out, so callers
// can never present a name without its "needs verification / not in-stock proof"
// caveat.
function decorate(entry, extra = {}) {
  if (!entry) return null;
  return {
    name: entry.name,
    type: entry.type, // "brand" | "generic"
    category: entry.category,
    access: entry.access, // e.g. "prescription_or_specialist" | "otc_or_varies"
    rxcui: entry.rxcui || null,
    verificationStatus:
      entry.verificationStatus || CATALOG_PROVENANCE.verificationStatus,
    usageNote: entry.usageNote || CATALOG_PROVENANCE.usageNote,
    preliminary: true,
    ...extra
  };
}

// ---- Exact (case-insensitive) match --------------------------------------

// Returns a single decorated match or null. Case-insensitive and tolerant of
// punctuation/extra spaces, but still an EXACT name match (no fuzziness).
export function exactMatch(query) {
  const n = normalize(query);
  if (!n) return null;
  const hit = BY_NORM.get(n);
  return hit ? decorate(hit, { match: "exact" }) : null;
}

// ---- Partial (prefix / substring) match ----------------------------------

// Autocomplete-style. Prefix hits rank above interior-substring hits; brand and
// generic are returned together but each entry carries its own `type`, so the
// caller can present them separately. `limit` caps the list.
export function partialMatches(query, limit = 8) {
  const n = normalize(query);
  if (n.length < 2) return [];
  const prefix = [];
  const interior = [];
  for (const e of ENTRIES) {
    const pos = e._norm.indexOf(n);
    if (pos === 0) prefix.push(e);
    else if (pos > 0) interior.push(e);
    if (prefix.length >= limit) break;
  }
  const merged = [...prefix, ...interior].slice(0, limit);
  return merged.map((e) => decorate(e, { match: "partial" }));
}

// ---- Typo-tolerant suggestions (bounded Levenshtein) ---------------------

// Damerau-ish Levenshtein with an early-exit cap, so scanning 1.5k names stays
// cheap. We only compute distance for candidates whose length is within the
// cap, and bail once a row exceeds `maxDist`.
function editDistance(a, b, maxDist) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > maxDist) return maxDist + 1;
  const prev = new Array(bl + 1);
  const curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      // transposition (swap of two adjacent chars)
      if (i > 1 && j > 1 &&
          a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
          a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, prev[j - 1] /* two rows back is enough for adj swap */);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1; // early exit
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

// Returns up to `limit` closest names within an edit-distance budget that scales
// with query length (short words tolerate 1 edit, longer words up to 3). Used
// when there is no exact match — "amoxicilin" -> "amoxicillin".
export function fuzzySuggestions(query, limit = 5) {
  const n = normalize(query);
  if (n.length < 3) return [];
  const maxDist = n.length <= 5 ? 1 : n.length <= 9 ? 2 : 3;
  const scored = [];
  for (const e of ENTRIES) {
    // cheap length gate before the O(n*m) distance
    if (Math.abs(e._norm.length - n.length) > maxDist) continue;
    const d = editDistance(n, e._norm, maxDist);
    if (d <= maxDist) scored.push({ e, d });
  }
  scored.sort((a, b) => a.d - b.d || a.e.name.length - b.e.name.length);
  return scored.slice(0, limit).map(({ e, d }) =>
    decorate(e, { match: "fuzzy", distance: d })
  );
}

// ---- One-call resolver used by the conversation layer --------------------
//
// Given raw user text (possibly a whole sentence), find the best medication name
// understanding WITHOUT ever substituting one drug for another. The result tells
// the caller exactly how confident the match is so it can ask the right
// confirmation question. It NEVER picks a different drug silently: a fuzzy or
// ambiguous result is returned AS suggestions for the user to confirm.
//
// Shape:
//   { status: "exact",     entry, needsConfirm:true }
//   { status: "ambiguous", suggestions:[...] }   // partial/fuzzy, user must pick
//   { status: "none" }                            // nothing recognized
//
// needsConfirm is ALWAYS true for a recognized name: the caller must still
// confirm the exact medication + collect strength and dosage form before any
// pharmacy inquiry. Recognition is not confirmation.
export function resolveMedication(text, { maxSuggestions = 5 } = {}) {
  const raw = (text || "").trim();
  if (!raw) return { status: "none" };

  // 1. Exact on the whole string.
  const exact = exactMatch(raw);
  if (exact) return { status: "exact", entry: exact, needsConfirm: true };

  // 2. Exact on individual tokens / sliding word windows (the drug may be inside
  //    a sentence like "I need amoxicillin by tonight").
  const words = normalize(raw).split(" ").filter(Boolean);
  for (let win = Math.min(3, words.length); win >= 1; win--) {
    for (let i = 0; i + win <= words.length; i++) {
      const phrase = words.slice(i, i + win).join(" ");
      const hit = BY_NORM.get(phrase);
      if (hit) return { status: "exact", entry: decorate(hit, { match: "exact" }), needsConfirm: true };
    }
  }

  // 3. Partial, then fuzzy — returned as suggestions to confirm, never auto-picked.
  const partials = words.length === 1 ? partialMatches(raw, maxSuggestions) : [];
  if (partials.length) return { status: "ambiguous", suggestions: partials };

  // Fuzzy against the single most drug-like token (longest alpha token).
  const token = words.slice().sort((a, b) => b.length - a.length)[0] || raw;
  const fuzzy = fuzzySuggestions(token, maxSuggestions);
  if (fuzzy.length) return { status: "ambiguous", suggestions: fuzzy };

  return { status: "none" };
}
