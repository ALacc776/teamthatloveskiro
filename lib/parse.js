// Parse a free-text user message into { drug, when, rush, intent }.
// Rule-first (instant) so the common case is fast; kiro-cli LLM only fills the
// gap when rules can't find a drug (typos, odd phrasing).

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

function ruleParse(text) {
  const t = text.toLowerCase();
  const drug = findDrug(text);
  const { when, rush } = timeAndRush(text);
  let intent = drug ? "search" : "chat";
  return { drug: drug ? drug.name : null, when, rush, intent, source: "rules" };
}

function kiroParse(text) {
  const prompt =
`Turn a patient's message into JSON for a pharmacy delivery finder.
Known medications: ${DRUG_NAMES}.
Return ONLY compact JSON with keys:
  drug: closest known medication name or null
  when: "asap" | "today" | "tomorrow"
  rush: true if urgent/same-day/now
  intent: "search" if a medication is named or implied, else "chat"
Message: "${text.replace(/"/g, "'")}"`;

  return new Promise((resolve) => {
    const child = execFile(
      "kiro-cli",
      ["chat", "--no-interactive", "--model", "claude-haiku-5.5", prompt],
      { timeout: 8000, maxBuffer: 1 << 20 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const m = stdout.match(/\{[\s\S]*\}/);
        if (!m) return resolve(null);
        try {
          const j = JSON.parse(m[0]);
          resolve({
            drug: j.drug || null,
            when: ["asap", "today", "tomorrow"].includes(j.when) ? j.when : "today",
            rush: !!j.rush,
            intent: j.intent === "chat" ? "chat" : "search",
            source: "kiro"
          });
        } catch { resolve(null); }
      }
    );
    child.on("error", () => resolve(null));
  });
}

export async function parseMessage(text) {
  // 1. Instant rule pass. If it already found a drug, trust it — no LLM wait.
  const rule = ruleParse(text);
  if (rule.drug) return rule;

  // 2. No drug matched (typo / odd phrasing). Ask the LLM, keep time/rush from rules.
  const llm = await kiroParse(text);
  if (llm && llm.drug) {
    const { when, rush } = timeAndRush(text);
    return { ...llm, when: llm.when || when, rush: llm.rush || rush };
  }

  // 3. Still nothing — treat as chat.
  return rule;
}
