// Conversational agent powered by kiro-cli (no external API key needed).
// One call does BOTH jobs: understand the message AND write a natural reply.
// Returns { reply, drug, when, rush, intent, source }.
//
// intent: "search" when the user wants a medication delivered (then the app
// runs the real search and appends pharmacy cards under the reply),
// "chat" for everything else (greetings, questions, non-Rx) — the reply is the
// agent's own words, not a hardcoded sentence.

import { execFile } from "node:child_process";
import { resolveMedication } from "./catalog.js";

function timeAndRush(text) {
  const t = text.toLowerCase();
  const rush = /\b(now|asap|urgent|right away|tonight|immediately|emergency|rush|fast|quick|hurry)\b/.test(t);
  let when = rush ? "asap" : "today";
  if (/\btomorrow\b/.test(t)) when = "tomorrow";
  else if (/\btoday\b|tonight\b/.test(t)) when = "today";
  else if (/\b(asap|now|urgent|immediately|right away)\b/.test(t)) when = "asap";
  return { when, rush };
}

function buildPrompt(text, history) {
  const convo = (history || [])
    .slice(-6)
    .map((m) => `${m.from === "user" ? "Patient" : "You"}: ${m.text}`)
    .join("\n");

  return `You are Oasis, a warm, concise assistant that helps people in rural
Massachusetts find a pharmacy that will DELIVER their prescription to their home.
You speak like a kind human helper, in plain language, 1-3 short sentences.

Scope: ONLY prescription medications and delivery. You do NOT give medical advice,
diagnose, or handle everyday store items (tissues, vitamins, toothpaste) — if asked
for those, kindly say you only handle prescriptions and a regular delivery app is
better for everyday items. Never mention you are "set" or "hardcoded". If this is an
emergency, tell them to call 911.

The medication name is validated against Oasis's full catalog after your reply.
Never reject a medication merely because it is unfamiliar to you.

Decide the user's intent and reply in your OWN words.
Return ONLY compact JSON, nothing else:
{
  "reply": "<your natural reply, 1-3 short sentences>",
  "intent": "search" | "chat",
  "drug": "<medication name exactly as written, or null>",
  "when": "asap" | "today" | "tomorrow",
  "rush": true | false
}
Set intent="search" ONLY when the user names or clearly implies a medication they
want delivered. When intent="search", your "reply" should be a short lead-in like
"Here's who can get your amoxicillin to you:" because pharmacy options will be shown
right after it. For anything else use intent="chat" and actually answer them.

${convo ? "Conversation so far:\n" + convo + "\n" : ""}Patient: ${text.replace(/"/g, "'")}`;
}

export function agentRespond(text, history) {
  // The broad 1,565-name catalog is the authority for medication recognition.
  // Handle recognized names BEFORE the LLM so the model cannot reject a valid
  // catalog entry because it only knows the old ten-drug demo list.
  const catalog = resolveMedication(text, { maxSuggestions: 5 });
  const timing = timeAndRush(text);
  if (catalog.status === "exact") {
    return Promise.resolve({
      reply: `I'll check delivery options for ${catalog.entry.name}.`,
      intent: "search",
      drug: catalog.entry.name,
      when: timing.when,
      rush: timing.rush,
      source: "catalog"
    });
  }
  if (catalog.status === "ambiguous") {
    return Promise.resolve({
      reply: "Let's confirm the exact medication first.",
      intent: "search",
      drug: text,
      when: timing.when,
      rush: timing.rush,
      source: "catalog"
    });
  }

  return new Promise((resolve) => {
    const prompt = buildPrompt(text, history);
    const child = execFile(
      "kiro-cli",
      ["chat", "--no-interactive", "--model", "claude-haiku-5.5", prompt],
      { timeout: 12000, maxBuffer: 1 << 20 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const m = stdout.match(/\{[\s\S]*\}/);
        if (!m) return resolve(null);
        try {
          const j = JSON.parse(m[0]);
          const tr = timeAndRush(text);
          resolve({
            reply: typeof j.reply === "string" ? j.reply.trim() : null,
            intent: j.intent === "search" ? "search" : "chat",
            drug: j.drug || null,
            when: ["asap", "today", "tomorrow"].includes(j.when) ? j.when : tr.when,
            rush: typeof j.rush === "boolean" ? j.rush : tr.rush,
            source: "kiro"
          });
        } catch { resolve(null); }
      }
    );
    child.on("error", () => resolve(null));
  });
}

// Fast rule fallback used ONLY if kiro-cli is unavailable / errors, so the app
// never breaks. Not as conversational, but keeps working offline.
export function ruleRespond(text) {
  const catalog = resolveMedication(text, { maxSuggestions: 5 });
  const { when, rush } = timeAndRush(text);
  if (catalog.status === "exact") {
    return {
      reply: `I'll check delivery options for ${catalog.entry.name}.`,
      intent: "search",
      drug: catalog.entry.name,
      when, rush, source: "catalog"
    };
  }
  if (catalog.status === "ambiguous") {
    return {
      reply: "Let's confirm the exact medication first.",
      intent: "search",
      drug: text,
      when, rush, source: "catalog"
    };
  }
  return {
    reply: "Tell me the medication you need and when — for example, \"doxycycline by tonight.\"",
    intent: "chat", drug: null, when, rush, source: "rules"
  };
}


// Rephrase a confirmation question in the agent's warm voice WITHOUT changing
// any facts. `facts` holds the literal values that must appear verbatim (drug
// name, strength, options). The LLM only changes tone/wording. If kiro-cli is
// slow or errors, we fall back to the plain wording the caller already has.
export function rephrase(intent, facts) {
  const factLines = Object.entries(facts || {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const prompt = `You are Oasis, a warm, concise pharmacy-delivery assistant.
Rewrite the following system instruction as ONE short, friendly sentence to the
patient (max 2 sentences). You MUST keep every fact below EXACTLY as written —
never change, add, or drop a medication name, strength, or dosage form, and never
invent options. Do not add medical advice.

Instruction: ${intent}
Facts that must appear verbatim:
${factLines || "  (none)"}

Reply with ONLY the sentence, no quotes, no JSON.`;

  return new Promise((resolve) => {
    const child = execFile(
      "kiro-cli",
      ["chat", "--no-interactive", "--model", "claude-haiku-5.5", prompt],
      { timeout: 9000, maxBuffer: 1 << 20 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const line = stdout.trim().split("\n").filter(Boolean).pop();
        resolve(line && line.length > 0 ? line.trim() : null);
      }
    );
    child.on("error", () => resolve(null));
  });
}
