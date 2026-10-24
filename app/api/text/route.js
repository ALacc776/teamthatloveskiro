import { search } from "@/lib/engine.js";

// POST /api/text { phone, zip, medication, neededBy, rush, planId }
// Demo mode (no Twilio env) returns the message text instead of sending.
export async function POST(req) {
  const { phone, zip, medication, neededBy, rush, planId } = await req.json();
  if (!phone || !zip || !medication)
    return Response.json({ error: "phone, zip, medication required" }, { status: 400 });

  const r = search({ zip, medication, neededBy, rush: !!rush, planId: planId || null });
  const top = [...r.rushResults, ...r.meetsDeadline, ...r.otherOptions].slice(0, 2);

  // Privacy: do not echo the medication name (shared phones, lock screens).
  const lines = top.map((x, i) => {
    const fee = x.fee === 0 ? "free delivery" : `$${x.fee} fee`;
    return `${i + 1}) ${x.name}: ${x.etaLabel}, ${fee}. Order by ${x.cutoff}. ${x.phone}`;
  });
  const message =
    `RxReach — delivery options for ${r.usedZip}:\n` +
    lines.join("\n") +
    `\nReply HELP for help. Not for emergencies, call 911.`;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return Response.json({ demo: true, to: phone, message });

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({ To: phone, From: from, Body: message });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const data = await res.json();
  if (!res.ok) return Response.json({ error: data.message || "send failed" }, { status: 502 });
  return Response.json({ sent: true, to: phone, message });
}
