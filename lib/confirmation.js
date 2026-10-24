// lib/confirmation.js — Medication CONFIRMATION gate.
//
// Enforces the rule: before we construct ANY pharmacy inquiry we must confirm
//   (1) the EXACT medication name (brand vs generic kept distinct),
//   (2) the strength, and
//   (3) the dosage form,
// and we must NEVER substitute one medication / formulation / strength for
// another. This module only produces prompts and interprets answers; it holds no
// state itself — the conversation carries a small `pending` object.
//
// The returned `pending` object (round-tripped through the chat API) looks like:
//   {
//     stage: "confirm_name" | "collect_strength" | "collect_form" | "ready",
//     entry: <CatalogMatch>,       // the medication the user confirmed
//     strength: string | null,
//     form: string | null,
//     suggestions: [CatalogMatch]  // only while disambiguating a name
//   }
//
// When stage === "ready" the caller has {name, strength, form} confirmed BY THE
// USER and may proceed to the existing pharmacy search unchanged.

import {
  resolveMedication,
  exactMatch,
  CATALOG_PROVENANCE
} from "./catalog.js";

// Common dosage forms we recognize in a free-text reply. This is recognition
// only — we never infer a form the user did not state.
const FORMS = [
  "tablet", "tablets", "tab", "capsule", "capsules", "cap", "caplet",
  "liquid", "solution", "suspension", "syrup", "oral",
  "injection", "injectable", "pen", "vial", "syringe",
  "inhaler", "inhalation", "nebulizer", "cream", "ointment", "gel",
  "patch", "suppository", "drops", "spray", "lotion", "powder", "pill", "pills"
];

// A strength looks like a number + unit (10 mg, 0.5%, 100mcg, 5 mg/ml).
// The % branch needs no trailing word boundary (% is a non-word char); the
// alphabetic units do, so "5mga" won't false-match.
const STRENGTH_RE = /\b\d+(?:\.\d+)?\s?(?:%|(?:mg\/ml|mcg\/ml|mg|mcg|g|ml|units?|iu)\b)/i;

export function detectStrength(text) {
  const m = (text || "").match(STRENGTH_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

export function detectForm(text) {
  const t = (text || "").toLowerCase();
  const hit = FORMS.find((f) => new RegExp(`\\b${f}\\b`).test(t));
  if (!hit) return null;
  // normalize a few plurals/abbreviations to a canonical word
  const canon = {
    tablets: "tablet", tab: "tablet", tabs: "tablet", pill: "tablet", pills: "tablet",
    capsules: "capsule", cap: "capsule", caps: "capsule",
    injectable: "injection", inhalation: "inhaler"
  };
  return canon[hit] || hit;
}

// Short, honest caveat line attached to every confirmation prompt.
export function caveatLine() {
  return "This is a preliminary name match, not a confirmed formulary — I still need to verify it, and a matching name does not mean a pharmacy has it in stock.";
}

function nameWithType(entry) {
  const kind = entry.type === "brand" ? "brand name" : "generic name";
  return `${entry.name} (${kind})`;
}

// Begin: the agent thinks the user named `drugText`. Resolve against the catalog
// and return the first prompt + a pending object. Does NOT start a search.
export function beginConfirmation(drugText) {
  const res = resolveMedication(drugText);

  if (res.status === "none") {
    return {
      pending: null,
      reply:
        `I couldn't find "${String(drugText).trim()}" in my medication list. ` +
        `Could you check the spelling or type the exact name on the label?`
    };
  }

  if (res.status === "ambiguous") {
    const names = res.suggestions.map((s) => `• ${nameWithType(s)}`).join("\n");
    return {
      pending: { stage: "confirm_name", entry: null, strength: null, form: null, suggestions: res.suggestions },
      reply:
        `I want to be sure I have the right medication. Did you mean one of these?\n${names}\n\n` +
        `Please reply with the exact one. ${caveatLine()}`
    };
  }

  // exact
  const e = res.entry;
  return {
    pending: { stage: "collect_strength", entry: e, strength: null, form: null, suggestions: [] },
    reply:
      `Just to confirm: ${nameWithType(e)}. ${caveatLine()}\n\n` +
      `What strength do you need? (for example, 500 mg)`
  };
}

// Continue a pending confirmation with the user's latest message. Returns
// { pending, reply, ready }. When ready===true, pending.stage==="ready" and
// {entry, strength, form} are all set and user-confirmed.
export function advanceConfirmation(pending, text) {
  const msg = (text || "").trim();

  // Stage 1: user is picking which medication name they meant.
  if (pending.stage === "confirm_name") {
    // Must match one of the offered suggestions EXACTLY (no substitution).
    const picked =
      exactMatch(msg) ||
      pending.suggestions.find((s) => s.name.toLowerCase() === msg.toLowerCase());
    const allowed = new Set(pending.suggestions.map((s) => s.name.toLowerCase()));
    if (picked && allowed.has(picked.name.toLowerCase())) {
      const entry = exactMatch(picked.name) || picked;
      return {
        pending: { stage: "collect_strength", entry, strength: null, form: null, suggestions: [] },
        reply:
          `Got it: ${nameWithType(entry)}. What strength do you need? (for example, 500 mg)`,
        ready: false
      };
    }
    // Maybe they typed a brand-new name instead of choosing — re-resolve.
    const fresh = beginConfirmation(msg);
    return { ...fresh, ready: false };
  }

  // Stage 2: collect strength.
  if (pending.stage === "collect_strength") {
    const strength = detectStrength(msg);
    // The user may give strength AND form in one line — grab both.
    const form = detectForm(msg);
    if (!strength) {
      return {
        pending,
        reply:
          `I didn't catch a strength. Please tell me the strength exactly as on the label, like "10 mg" or "0.5%".`,
        ready: false
      };
    }
    const next = { ...pending, strength, form: form || null };
    if (form) {
      next.stage = "ready";
      return finalize(next);
    }
    next.stage = "collect_form";
    return {
      pending: next,
      reply: `${strength} — thanks. And the dosage form? (for example, tablet, capsule, liquid, or inhaler)`,
      ready: false
    };
  }

  // Stage 3: collect dosage form.
  if (pending.stage === "collect_form") {
    const form = detectForm(msg);
    if (!form) {
      return {
        pending,
        reply:
          `I didn't recognize that dosage form. Common ones are tablet, capsule, liquid, injection, or inhaler — which do you need?`,
        ready: false
      };
    }
    return finalize({ ...pending, form });
  }

  // Already ready / unknown stage — no-op.
  return { pending, reply: null, ready: pending.stage === "ready" };
}

function finalize(pending) {
  const e = pending.entry;
  return {
    pending: { ...pending, stage: "ready" },
    reply:
      `Confirmed: ${e.name} ${pending.strength}${pending.form ? " " + pending.form : ""} ` +
      `(${e.type === "brand" ? "brand" : "generic"}). ` +
      `I'll find pharmacies that can deliver it — but I can't guarantee any pharmacy has this exact item in stock until we check. ` +
      `Looking now…`,
    ready: true
  };
}

// Build the structured inquiry payload handed to the pharmacy search. This is
// the ONLY place the confirmed med turns into a search request — it copies the
// user-confirmed fields verbatim, performing no substitution.
export function toInquiry(pending) {
  if (!pending || pending.stage !== "ready") return null;
  return {
    medication: pending.entry.name,
    medicationType: pending.entry.type,
    strength: pending.strength,
    form: pending.form,
    rxcui: pending.entry.rxcui || null,
    verificationStatus: pending.entry.verificationStatus || CATALOG_PROVENANCE.verificationStatus,
    preliminary: true
  };
}
