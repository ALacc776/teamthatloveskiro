import { search } from "@/lib/engine.js";

// POST /api/text { phone, zip, medication, planId }
//
// Sends your pharmacy options to YOUR phone. Three backends, chosen by which env
// vars are set (checked in this order):
//   1. Textbelt  — set TEXTBELT_KEY (cheap, pay-as-you-go, no number to buy)
//   2. Twilio    — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
//   3. Demo mode — nothing set: returns the message text, sends nothing
//
// SMS policy: we do NOT assume a pharmacy phone supports SMS. The message only
// lists pharmacies the research marked verified + participating (smsEligible).
// `phone` is the PATIENT's own number (where WE text); pharmacy numbers are only
// ever printed for the patient to CALL — never texted by us.
export async function POST(req) {
  const { phone, zip, medication, planId } = await req.json();
  if (!phone || !zip || !medication)
    return Response.json({ error: "phone, zip, medication required" }, { status: 400 });

  const r = search({ zip, medication, planId: planId || null });
  const eligible = r.candidates.filter((x) => x.smsEligible);
  const message = buildMessage(r, eligible.slice(0, 2));

  return deliver({ phone, message, eligibleCount: eligible.length });
}

function buildMessage(r, top) {
  if (top.length === 0) {
    return (
      `RxReach — for ${r.usedZip}, I couldn't confirm a participating delivery ` +
      `pharmacy from verified records. Please call a local pharmacy to ask about delivery.` +
      `\nReply HELP for help. Not for emergencies, call 911.`
    );
  }
  // Privacy: do not echo the medication name (shared phones, lock screens).
  const lines = top.map((x, i) => {
    const fee = x.deliveryFee ? ` (${x.deliveryFee})` : "";
    return `${i + 1}) ${x.name}, ${x.address}${fee}. Call ${x.phone} to confirm delivery + stock.`;
  });
  return (
    `RxReach — documented delivery pharmacies near ${r.usedZip}:\n` +
    lines.join("\n") +
    `\nCall each pharmacy to confirm they deliver to you and have your exact medication in stock.` +
    `\nReply HELP for help. Not for emergencies, call 911.`
  );
}

// Pick a backend by configured env and send.
async function deliver({ phone, message, eligibleCount }) {
  if (process.env.TEXTBELT_KEY) return sendTextbelt({ phone, message, eligibleCount });
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (sid && token && from) return sendTwilio({ phone, message, sid, token, from });
  // Demo mode: show the message, send nothing.
  return Response.json({ demo: true, to: phone, message, eligibleCount });
}

// --- Textbelt: single POST, returns { success, quotaRemaining, textId, error } ---
async function sendTextbelt({ phone, message, eligibleCount }) {
  try {
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ phone, message, key: process.env.TEXTBELT_KEY })
    });
    const data = await res.json();
    if (!data.success) {
      return Response.json(
        { error: data.error || "Textbelt send failed", quotaRemaining: data.quotaRemaining },
        { status: 502 }
      );
    }
    return Response.json({
      sent: true, provider: "textbelt", to: phone, message,
      textId: data.textId, quotaRemaining: data.quotaRemaining, eligibleCount
    });
  } catch {
    return Response.json({ error: "Couldn't reach Textbelt." }, { status: 502 });
  }
}

// --- Twilio: Basic-auth POST to the Messages endpoint ---
async function sendTwilio({ phone, message, sid, token, from }) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ To: phone, From: from, Body: message })
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: data.message || "send failed" }, { status: 502 });
    return Response.json({ sent: true, provider: "twilio", to: phone, message });
  } catch {
    return Response.json({ error: "Couldn't reach Twilio." }, { status: 502 });
  }
}
