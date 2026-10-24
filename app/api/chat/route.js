import { agentRespond, ruleRespond } from "@/lib/agent.js";
import { search, findDrug } from "@/lib/engine.js";

function deadlineISO(when) {
  if (when === "asap") return new Date(Date.now() + 6 * 3600000).toISOString();
  const d = new Date();
  if (when === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  return d.toISOString();
}

// POST /api/chat  { text, zip, planId, history }
// The agent (Kiro LLM) writes the reply in its own words. When it detects a
// medication, we run the real search and attach pharmacy cards under the reply.
export async function POST(req) {
  const { text, zip, planId, history } = await req.json();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  // Let the Kiro agent converse. Fall back to rules only if the LLM errors.
  let a = await agentRespond(text, history);
  if (!a || !a.reply) a = ruleRespond(text);

  // Not a medication search → return the agent's own words, no cards.
  if (a.intent !== "search" || !a.drug) {
    return Response.json({ parsed: a, results: null, reply: a.reply });
  }

  const results = search({
    zip: zip || "01301",
    medication: a.drug,
    neededBy: deadlineISO(a.when),
    rush: a.rush,
    planId: planId || null,
    sort: a.rush ? "fastest" : "best"
  });

  // Prefer the agent's natural lead-in; add a note if we had to widen the search.
  let reply = a.reply;
  if (results.fallback?.reason === "nearby") {
    reply = `Nothing delivers right to ${results.zip}, but pharmacies in ${results.fallback.town} (about ${results.fallback.miles} mi away) can reach you. Here's what I found:`;
  } else if (results.fallback?.reason === "mail_only") {
    reply = `No local delivery to ${results.zip} yet — but mail-order can still get it to you:`;
  }

  return Response.json({ parsed: a, results, reply });
}
