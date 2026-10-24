import { smsConversation, toTwiml } from "@/lib/smsConversation.js";

// Twilio inbound SMS webhook.
// Configure Twilio "Receive an SMS" -> Custom -> HTTP POST with:
//   https://YOUR-PUBLIC-HOST/api/sms
//
// Twilio posts application/x-www-form-urlencoded fields including:
//   From=+1617...&Body=hello
// We return TwiML, and Twilio sends the <Message> text back to that phone.
export async function POST(req) {
  const contentType = req.headers.get("content-type") || "";
  let from = "";
  let body = "";

  if (contentType.includes("application/json")) {
    const data = await req.json();
    from = data.From || data.from || "";
    body = data.Body || data.body || "";
  } else {
    const params = new URLSearchParams(await req.text());
    from = params.get("From") || "";
    body = params.get("Body") || "";
  }

  const reply = smsConversation.handle({ from, body });
  return new Response(toTwiml(reply), {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// Small health check. Twilio itself should use POST.
export function GET() {
  return Response.json({ service: "Oasis inbound SMS", ready: true });
}
