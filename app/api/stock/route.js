import { randomUUID } from "node:crypto";
import { putCall, linkVapiId } from "@/lib/callStore.js";

// POST /api/stock  { pharmacyName, phone, medication }
// Places an outbound voice call that asks ONLY about stock, following policy.
// Demo mode (no Vapi env) simulates a result after a short delay.
//
// Env needed for a real call:
//   VAPI_API_KEY         Vapi private key
//   VAPI_PHONE_NUMBER_ID Vapi number id to call FROM
//   VAPI_ASSISTANT_ID    (optional) prebuilt assistant; else we send inline
//   RXREACH_CALLBACK      the callback number the agent reads aloud
//   PUBLIC_BASE_URL       public https base (ngrok) for the webhook

const APP_NAME = "Oasis";

export async function POST(req) {
  const { pharmacyName, phone, medication } = await req.json();
  if (!pharmacyName || !medication)
    return Response.json({ error: "pharmacyName and medication required" }, { status: 400 });

  const callId = randomUUID();
  putCall(callId, { status: "calling", pharmacyName, phone, medication });

  const key = process.env.VAPI_API_KEY;
  const numberId = process.env.VAPI_PHONE_NUMBER_ID;
  const callback = process.env.RXREACH_CALLBACK || "our callback line";
  const base = process.env.PUBLIC_BASE_URL;

  // ----- DEMO MODE: no Vapi configured -----
  if (!key || !numberId || !phone) {
    setTimeout(() => {
      putCall(callId, {
        status: "done", inStock: true, reachedHuman: true,
        readyTime: "about 1 hour",
        summary: `${pharmacyName} confirmed ${medication} is in stock, ready in about an hour.`
      });
    }, 4000);
    return Response.json({ callId, demo: true });
  }

  // ----- REAL CALL via Vapi -----
  const systemPrompt =
`You are an automated assistant from ${APP_NAME} calling a pharmacy on behalf of a
patient. Your ONLY job is to ask whether a medication is in stock. Follow this policy exactly:

Opening (say this first):
"Hi, this is an automated assistant from ${APP_NAME} calling on behalf of a patient.
This call is recorded. Do you have ${medication} in stock?"

Rules:
- If asked for a callback number, give: ${callback}.
- NEVER share the patient's name or any patient information. You have none. If
  asked for patient details, say you are only checking availability.
- Do not place, transfer, or pay for a prescription. Stock question only.
- Keep it under 60 seconds. Be polite and brief.
- When you have a yes or no, thank them and end the call.
- If they say no, or you cannot get an answer, end politely.

At the end, record structured output: inStock (bool), readyTime (string or empty),
reachedHuman (bool), summary (one line).`;

  const payload = {
    phoneNumberId: numberId,
    customer: { number: phone },
    assistantId: process.env.VAPI_ASSISTANT_ID || undefined,
    assistant: process.env.VAPI_ASSISTANT_ID ? undefined : {
      firstMessage: `Hi, this is an automated assistant from ${APP_NAME} calling on behalf of a patient. This call is recorded. Do you have ${medication} in stock?`,
      model: { provider: "openai", model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }] },
      maxDurationSeconds: 120,
      ...(base ? { server: { url: `${base}/api/stock/result` } } : {})
    }
  };

  try {
    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      putCall(callId, { status: "error", summary: data.message || "Call could not be placed." });
      return Response.json({ callId, error: data.message || "call failed" }, { status: 502 });
    }
    if (data.id) linkVapiId(data.id, callId);
    return Response.json({ callId, vapiCallId: data.id });
  } catch (e) {
    putCall(callId, { status: "error", summary: "Call could not be placed." });
    return Response.json({ callId, error: "call failed" }, { status: 502 });
  }
}
