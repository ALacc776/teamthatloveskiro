// Conversational agent powered by kiro-cli (no external API key needed).
// One call does BOTH jobs: understand the message AND write a natural reply.
// Returns { reply, drug, when, rush, intent, source }.
//
// intent: "search" when the user wants a medication delivered (then the app
// runs the real search and appends pharmacy cards under the reply),
// "chat" for everything else (greetings, questions, non-Rx) — the reply is the
// agent's own words, not a hardcoded sentence.

import { execFile } from "node:child_process";
import { DRUGS } from "../data/drugs.js";
import { findDrug } from "./engine.js";

const DRUG_NAMES = DRUGS.map((d) => d.name).join(", ");

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

  return `You are RxReach, a warm, concise assistant that helps people in rural
Massachusetts find a pharmacy that will DELIVER their prescription to their home.
You speak like a kind human helper, in plain language, 1-3 short sentences.

Scope: ONLY prescription medications and delivery. You do NOT give medical advice,
diagnose, or handle everyday store items (tissues, vitamins, toothpaste) — if asked
for those, kindly say you only handle prescriptions and a regular delivery app is
better for everyday items. Never mention you are "set" or "hardcoded". If this is an
emergency, tell them to call 911.

Known medications you can search: ${DRUG_NAMES}.

Decide the user's intent and reply in your OWN words.
Return ONLY compact JSON, nothing else:
{
  "reply": "<your natural reply, 1-3 short sentences>",
  "intent": "search" | "chat",
  "drug": "<closest known medication name, or null>",
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
  const drug = findDrug(text);
  const { when, rush } = timeAndRush(text);
  if (drug) {
    return { reply: `Here's who can deliver ${drug}:`, intent: "search", drug, when, rush, source: "rules" };
  }
  return {
    reply: "Tell me the medication you need and when — for example, \"amoxicillin by tonight.\"",
    intent: "chat", drug: null, when, rush, source: "rules"
  };
}
