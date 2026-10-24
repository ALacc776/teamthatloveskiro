import { agentRespond, ruleRespond, rephrase } from "@/lib/agent.js";
import { search } from "@/lib/engine.js";
import { beginConfirmation, advanceConfirmation, toInquiry } from "@/lib/confirmation.js";

function deadlineISO(when) {
  if (when === "asap") return new Date(Date.now() + 6 * 3600000).toISOString();
  const d = new Date();
  if (when === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  return d.toISOString();
}

// Ask Kiro to phrase a confirmation line warmly, but ONLY accept its wording if
// it still contains every must-keep fact verbatim. Otherwise keep the original.
// This gives a conversational feel without ever letting the LLM alter a drug,
// strength, or form — the safety gate's guarantees are preserved.
async function warm(originalReply, intent, facts) {
  const must = Object.values(facts || {})
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => typeof v === "string" && v.length);
  const phrased = await rephrase(intent, facts);
  if (!phrased) return originalReply;
  const ok = must.every((f) => phrased.toLowerCase().includes(String(f).toLowerCase()));
  return ok ? phrased : originalReply;
}

function runSearch({ confirmedName, when, rush, zip, planId, leadIn, inquiry }) {
  const results = search({
    zip: zip || "01301",
    medication: confirmedName,
    neededBy: deadlineISO(when),
    rush: !!rush,
    planId: planId || null,
    sort: rush ? "fastest" : "best"
  });
  results.inquiry = inquiry;
  let reply = leadIn;
  if (results.fallback?.reason === "nearby") {
    reply = `Nothing delivers right to ${results.zip}, but pharmacies in ${results.fallback.town} (about ${results.fallback.miles} mi away) can reach you. Here's what I found — availability still needs confirming with each pharmacy:`;
  } else if (results.fallback?.reason === "mail_only") {
    reply = `No local delivery to ${results.zip} yet — but mail-order can still get it to you (availability not yet confirmed):`;
  }
  return { results, reply };
}

// POST /api/chat  { text, zip, planId, history, pending }
export async function POST(req) {
  const { text, zip, planId, history, pending } = await req.json();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  // ---- 1. Mid-confirmation: interpret this reply against the pending state ----
  if (pending && pending.stage && pending.stage !== "ready") {
    const step = advanceConfirmation(pending, text);
    if (step.ready) {
      const inquiry = toInquiry(step.pending);
      const { results, reply } = runSearch({
        confirmedName: step.pending.entry.name,
        when: step.pending.when || pending.when || "today",
        rush: step.pending.rush ?? pending.rush ?? false,
        zip, planId, leadIn: step.reply, inquiry
      });
      return Response.json({
        parsed: { intent: "search", drug: step.pending.entry.name, source: "confirmed" },
        pending: null, results, reply
      });
    }
    // still collecting — rephrase the question warmly, keep facts exact
    const p = step.pending || {};
    const warmReply = await warm(step.reply, "Ask the patient the next confirmation question.", {
      medication: p.entry?.name,
      strength: p.strength,
      options: p.suggestions?.map((s) => s.name)
    });
    return Response.json({
      parsed: { intent: "confirm", source: "confirmation" },
      pending: step.pending, results: null, reply: warmReply
    });
  }

  // ---- 2. No pending confirmation: let the agent converse ----
  let a = await agentRespond(text, history);
  if (!a || !a.reply) a = ruleRespond(text);

  if (a.intent !== "search" || !a.drug) {
    return Response.json({ parsed: a, pending: null, results: null, reply: a.reply });
  }

  // Medication detected → BEGIN confirmation (no immediate search).
  const conf = beginConfirmation(a.drug);
  const pendingOut = conf.pending ? { ...conf.pending, when: a.when, rush: a.rush } : null;

  // Warmly phrase the confirmation ask; the agent's own lead-in already leads.
  const confFacts = {
    medication: conf.pending?.entry?.name,
    options: conf.pending?.suggestions?.map((s) => s.name)
  };
  const warmConf = await warm(conf.reply, "Confirm the medication with the patient before searching.", confFacts);
  const reply = conf.pending ? `${a.reply}\n\n${warmConf}` : conf.reply;

  return Response.json({
    parsed: { ...a, intent: "confirm" }, pending: pendingOut, results: null, reply
  });
}
