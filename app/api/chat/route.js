import { agentRespond, ruleRespond } from "@/lib/agent.js";
import { search } from "@/lib/engine.js";
import { beginConfirmation, advanceConfirmation, toInquiry } from "@/lib/confirmation.js";

function deadlineISO(when) {
  if (when === "asap") return new Date(Date.now() + 6 * 3600000).toISOString();
  const d = new Date();
  if (when === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  return d.toISOString();
}

// Run the existing pharmacy search for a USER-CONFIRMED medication and build the
// reply (with never-say-no fallback wording). The medication name passed in is
// exactly what the user confirmed — no substitution happens here or downstream.
function runSearch({ confirmedName, when, rush, zip, planId, leadIn, inquiry }) {
  const results = search({
    zip: zip || "01301",
    medication: confirmedName,
    neededBy: deadlineISO(when),
    rush: !!rush,
    planId: planId || null,
    sort: rush ? "fastest" : "best"
  });

  // Carry the confirmed strength/form + verification warning alongside results
  // so the UI can show them and NEVER implies availability.
  results.inquiry = inquiry;

  let reply = leadIn;
  if (results.fallback?.reason === "nearby") {
    reply = `Nothing delivers right to ${results.zip}, but pharmacies in ${results.fallback.town} (about ${results.fallback.miles} mi away) can reach you. Here's what I found — availability still needs to be confirmed with each pharmacy:`;
  } else if (results.fallback?.reason === "mail_only") {
    reply = `No local delivery to ${results.zip} yet — but mail-order can still get it to you (availability not yet confirmed):`;
  }
  return { results, reply };
}

// POST /api/chat  { text, zip, planId, history, pending }
//
// Flow:
//   1. If a `pending` medication confirmation is in progress, advance it. Only
//      when the user has confirmed EXACT name + strength + dosage form do we run
//      the pharmacy search.
//   2. Otherwise the Kiro agent converses. When it detects a medication we START
//      a confirmation (we do NOT search immediately) — satisfying "confirm the
//      exact medication, strength and dosage form before constructing pharmacy
//      inquiries" and "never automatically substitute".
//   3. Non-medication messages return the agent's own words, unchanged.
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
        zip, planId,
        leadIn: step.reply,
        inquiry
      });
      return Response.json({
        parsed: { intent: "search", drug: step.pending.entry.name, source: "confirmed" },
        pending: null,
        results,
        reply
      });
    }
    // still collecting — keep the pending object alive, no search yet
    return Response.json({
      parsed: { intent: "confirm", source: "confirmation" },
      pending: step.pending,
      results: null,
      reply: step.reply
    });
  }

  // ---- 2. No pending confirmation: let the agent converse ----
  let a = await agentRespond(text, history);
  if (!a || !a.reply) a = ruleRespond(text);

  // Not a medication search → return the agent's own words, no cards, no search.
  if (a.intent !== "search" || !a.drug) {
    return Response.json({ parsed: a, pending: null, results: null, reply: a.reply });
  }

  // Medication detected → BEGIN confirmation instead of searching immediately.
  const conf = beginConfirmation(a.drug);
  // Keep the agent's warm lead-in, then the confirmation question.
  const reply = conf.pending
    ? `${a.reply}\n\n${conf.reply}`
    : conf.reply; // name not found — ask them to recheck spelling

  // Stash when/rush from the agent so we can honor "by tonight" after confirming.
  const pendingOut = conf.pending
    ? { ...conf.pending, when: a.when, rush: a.rush }
    : null;

  return Response.json({
    parsed: { ...a, intent: "confirm" },
    pending: pendingOut,
    results: null,
    reply
  });
}
