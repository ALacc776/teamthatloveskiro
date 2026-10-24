// Oasis inbound SMS conversation engine.
//
// Twilio sends each incoming text to /api/sms. This module keeps the short
// conversation state by sender number while the server is running:
//   ZIP -> medication -> strength + form -> top 3 pharmacies.
//
// The state is intentionally small and contains no name or address. A deployed
// serverless app should replace this in-memory Map with a durable store.

import { resolveMedication, exactMatch } from "./catalog.js";
import { detectStrength, detectForm } from "./confirmation.js";
import { search } from "./engine.js";

function compactPhone(phone) {
  return phone || "anonymous";
}

function formatOptions(result) {
  const all = result.candidates || [];
  const documented = all.filter((p) => p.participating && p.phone);
  const top = (documented.length ? documented : all.filter((p) => p.phone)).slice(0, 3);

  if (!top.length) {
    return `I couldn't find a pharmacy option near ${result.usedZip}. Call a local pharmacy for help.`;
  }

  const lines = top.map((p, index) => {
    const where = p.distanceLabel || p.city || "Nearby";
    return `${index + 1}) ${p.name} — ${where}, ${p.feeLabel}. Call ${p.phone}.`;
  });

  return `Oasis options near ${result.usedZip}:\n${lines.join("\n")}\nText another medication, a new ZIP, or RESET.`;
}

function medicationPrompt() {
  return "What prescription medication do you need? Send the exact name from the label.";
}

function detailsPrompt(entry, strength, form) {
  if (!strength && !form) return `What strength and form is your ${entry.name}? Example: 500 mg tablet.`;
  if (!strength) return `What strength is your ${entry.name}? Example: 500 mg.`;
  return `What form is your ${entry.name}? Example: tablet, capsule, liquid, or inhaler.`;
}

export function createSmsConversation({ searchFn = search } = {}) {
  const conversations = new Map();

  function clear(from) {
    conversations.delete(compactPhone(from));
  }

  function stateFor(from) {
    const key = compactPhone(from);
    if (!conversations.has(key)) conversations.set(key, { stage: "zip" });
    return conversations.get(key);
  }

  function save(from, state) {
    conversations.set(compactPhone(from), state);
  }

  function finish(from, state) {
    const result = searchFn({
      zip: state.zip,
      medication: state.entry.name,
      limit: 146
    });
    // Keep the ZIP for another medication, but remove the prescription details.
    save(from, { stage: "medication", zip: state.zip });
    return formatOptions(result);
  }

  function handle({ from, body }) {
    const message = String(body || "").trim();
    if (!message) return "Text your 5-digit ZIP code to start.";

    if (/^(reset|start|new)$/i.test(message)) {
      clear(from);
      return "Welcome to Oasis. What is your 5-digit ZIP code?";
    }
    if (/^help$/i.test(message)) {
      return "Oasis finds nearby pharmacies with home delivery. Text your ZIP, then your medication. For emergencies, call 911.";
    }

    let state = stateFor(from);
    const zipMatch = message.match(/\b\d{5}\b/);
    if (zipMatch) {
      state = { stage: "medication", zip: zipMatch[0] };
      save(from, state);
      const remainder = message.replace(zipMatch[0], " ").trim();
      if (!remainder) return medicationPrompt();
      // Continue below when one text contains ZIP + medication + details.
      return handleMedication(from, state, remainder);
    }

    if (!state.zip) return "What is your 5-digit ZIP code?";

    if (state.stage === "details" && state.entry) {
      const strength = detectStrength(message) || state.strength || null;
      const form = detectForm(message) || state.form || null;
      const next = { ...state, strength, form };
      save(from, next);
      if (!strength || !form) return detailsPrompt(state.entry, strength, form);
      return finish(from, next);
    }

    return handleMedication(from, state, message);
  }

  function handleMedication(from, state, message) {
    // If the last turn offered names, only accept one of those names exactly.
    if (state.stage === "choose_name" && state.suggestions?.length) {
      const picked = exactMatch(message);
      const allowed = new Set(state.suggestions.map((s) => s.name.toLowerCase()));
      if (!picked || !allowed.has(picked.name.toLowerCase())) {
        return `Reply with one exact name: ${state.suggestions.map((s) => s.name).join(", ")}.`;
      }
      const strength = detectStrength(message);
      const form = detectForm(message);
      const next = { stage: "details", zip: state.zip, entry: picked, strength, form };
      save(from, next);
      if (strength && form) return finish(from, next);
      return detailsPrompt(picked, strength, form);
    }

    const resolved = resolveMedication(message, { maxSuggestions: 3 });
    if (resolved.status === "none") {
      return "I couldn't match that medication. Send the exact name from the label.";
    }
    if (resolved.status === "ambiguous") {
      const next = { stage: "choose_name", zip: state.zip, suggestions: resolved.suggestions };
      save(from, next);
      return `Which medication? Reply with one exact name: ${resolved.suggestions.map((s) => s.name).join(", ")}.`;
    }

    const strength = detectStrength(message);
    const form = detectForm(message);
    const next = {
      stage: "details",
      zip: state.zip,
      entry: resolved.entry,
      strength,
      form
    };
    save(from, next);
    if (strength && form) return finish(from, next);
    return detailsPrompt(resolved.entry, strength, form);
  }

  return { handle, clear };
}

export const smsConversation = createSmsConversation();

export function toTwiml(message) {
  const escaped = String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
