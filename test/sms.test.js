import { test } from "node:test";
import assert from "node:assert/strict";

import { createSmsConversation, toTwiml } from "../lib/smsConversation.js";

function fakeSearch({ zip, medication }) {
  return {
    usedZip: zip,
    drug: medication,
    candidates: [
      { name: "First Pharmacy", participating: true, phone: "617-555-0101", distanceLabel: "In your ZIP", feeLabel: "Free delivery" },
      { name: "Second Pharmacy", participating: true, phone: "617-555-0102", distanceLabel: "~2 mi away", feeLabel: "$5 delivery" },
      { name: "Third Pharmacy", participating: true, phone: "617-555-0103", distanceLabel: "~3 mi away", feeLabel: "Free delivery" },
      { name: "Fourth Pharmacy", participating: true, phone: "617-555-0104", distanceLabel: "~4 mi away", feeLabel: "Free delivery" }
    ]
  };
}

test("new SMS conversation asks for ZIP", () => {
  const sms = createSmsConversation({ searchFn: fakeSearch });
  assert.match(sms.handle({ from: "+16175550000", body: "Hi" }), /5-digit ZIP/i);
});

test("ZIP then medication asks for strength and form", () => {
  const sms = createSmsConversation({ searchFn: fakeSearch });
  const from = "+16175550001";
  assert.match(sms.handle({ from, body: "02215" }), /medication/i);
  const reply = sms.handle({ from, body: "amoxicillin" });
  assert.match(reply, /strength and form/i);
  assert.match(reply, /500 mg tablet/i);
});

test("completed details return exactly top three pharmacies", () => {
  const sms = createSmsConversation({ searchFn: fakeSearch });
  const from = "+16175550002";
  sms.handle({ from, body: "02215" });
  sms.handle({ from, body: "amoxicillin" });
  const reply = sms.handle({ from, body: "500 mg tablet" });
  assert.match(reply, /Oasis options near 02215/i);
  assert.match(reply, /First Pharmacy/);
  assert.match(reply, /Second Pharmacy/);
  assert.match(reply, /Third Pharmacy/);
  assert.doesNotMatch(reply, /Fourth Pharmacy/);
});

test("one text can contain ZIP, medication, strength, and form", () => {
  const sms = createSmsConversation({ searchFn: fakeSearch });
  const reply = sms.handle({
    from: "+16175550003",
    body: "02215 amoxicillin 500 mg tablet"
  });
  assert.match(reply, /Oasis options near 02215/i);
  assert.match(reply, /First Pharmacy/);
});

test("RESET clears prior conversation state", () => {
  const sms = createSmsConversation({ searchFn: fakeSearch });
  const from = "+16175550004";
  sms.handle({ from, body: "02215" });
  const reply = sms.handle({ from, body: "RESET" });
  assert.match(reply, /Welcome to Oasis/i);
  assert.match(sms.handle({ from, body: "amoxicillin" }), /5-digit ZIP/i);
});

test("HELP explains the service and emergency action", () => {
  const sms = createSmsConversation({ searchFn: fakeSearch });
  const reply = sms.handle({ from: "+16175550005", body: "HELP" });
  assert.match(reply, /Oasis finds nearby pharmacies/i);
  assert.match(reply, /911/);
});

test("TwiML escapes XML-sensitive message text", () => {
  const xml = toTwiml(`A & B < C > D "yes"`);
  assert.match(xml, /<Response><Message>/);
  assert.match(xml, /A &amp; B &lt; C &gt; D &quot;yes&quot;/);
  assert.doesNotMatch(xml, /A & B/);
});
