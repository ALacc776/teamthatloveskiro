import { parseMessage } from "@/lib/parse.js";
import { search } from "@/lib/engine.js";

function deadlineISO(when) {
  if (when === "asap") return new Date(Date.now() + 6 * 3600000).toISOString();
  const d = new Date();
  if (when === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  return d.toISOString();
}

// POST /api/chat  { text, zip, planId }
// Returns { reply, parsed, results } — results null when it's just chat.
export async function POST(req) {
  const { text, zip, planId } = await req.json();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  const parsed = await parseMessage(text);

  if (parsed.intent === "chat" || !parsed.drug) {
    return Response.json({
      parsed,
      results: null,
      reply:
        "I can find a pharmacy that delivers your medication home. " +
        "Just tell me what you need — like \"I need amoxicillin by tonight\" or " +
        "\"my mom's insulin, as soon as possible\"."
    });
  }

  const results = search({
    zip: zip || "01301",
    medication: parsed.drug,
    neededBy: deadlineISO(parsed.when),
    rush: parsed.rush,
    planId: planId || null,
    sort: parsed.rush ? "fastest" : "best"
  });

  // Build a short human reply line
  const total = results.rushResults.length + results.meetsDeadline.length;
  let reply;
  if (results.fallback?.reason === "nearby") {
    reply = `Nothing delivers right to ${results.zip}, but pharmacies in ${results.fallback.town} (${results.fallback.miles} mi away) do. Here's what can reach you:`;
  } else if (results.fallback?.reason === "mail_only") {
    reply = `No local delivery to ${results.zip} yet — but mail-order can still get it to you:`;
  } else if (results.rushResults.length) {
    reply = `You need this fast. Here are the quickest options for ${results.drug}:`;
  } else if (total) {
    reply = `Here's who can deliver ${results.drug} to ${results.zip}:`;
  } else {
    reply = `These can't quite hit your deadline, but they're your closest options for ${results.drug}:`;
  }

  return Response.json({ parsed, results, reply });
}
