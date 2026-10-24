import { putCall, getCall, callIdForVapi } from "@/lib/callStore.js";

// Vapi posts end-of-call reports here (set as assistant.server.url).
// We pull the structured result out and store it against our callId.
// POST /api/stock/result
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: true }); }

  const msg = body?.message || body;
  const type = msg?.type;
  const vapiCallId = msg?.call?.id || body?.call?.id;
  const callId = vapiCallId ? callIdForVapi(vapiCallId) : null;
  if (!callId) return Response.json({ ok: true });

  // Only act on the final report
  if (type && type !== "end-of-call-report" && type !== "status-update") {
    return Response.json({ ok: true });
  }

  // Vapi puts extracted fields in analysis.structuredData (shape depends on setup)
  const sd = msg?.analysis?.structuredData || msg?.structuredData || {};
  const ended = type === "end-of-call-report" || msg?.call?.status === "ended";

  if (ended) {
    const inStock = sd.inStock ?? null;
    putCall(callId, {
      status: "done",
      inStock,
      reachedHuman: sd.reachedHuman ?? null,
      readyTime: sd.readyTime || "",
      summary: sd.summary || (inStock ? "Confirmed in stock." : "Not in stock or no answer.")
    });

    // Policy: if no / not reached, text the user and move on.
    const rec = getCall(callId);
    if ((inStock === false || sd.reachedHuman === false) && rec?.userPhone) {
      try {
        await fetch(`${process.env.PUBLIC_BASE_URL || ""}/api/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: rec.userPhone, zip: rec.zip || "01301",
            medication: rec.medication, neededBy: null
          })
        });
        putCall(callId, { texted: true });
      } catch { /* best effort */ }
    }
  }

  return Response.json({ ok: true });
}

// GET /api/stock/result?callId=... — the UI polls this for the outcome.
export async function GET(req) {
  const callId = new URL(req.url).searchParams.get("callId");
  const rec = callId ? getCall(callId) : null;
  if (!rec) return Response.json({ status: "unknown" });
  return Response.json(rec);
}
