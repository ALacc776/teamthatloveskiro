"use client";

import { useState, useRef, useEffect } from "react";
import { PLANS } from "@/data/plans.js";

const FLAG_TEXT = {
  cold_chain: "❄️ Refrigerated medication — only cold-chain delivery shown.",
  controlled: "⚠️ Controlled substance — ID and signature may be needed on delivery.",
  time_critical: "⏱️ Time-critical — fastest option shown first. If this is an emergency, call 911."
};

// ---- In-chat onboarding steps ----
const STEPS = ["zip", "phone", "insurance", "address", "done"];

// Normalize a US mobile number to E.164 (+1XXXXXXXXXX). Returns null if it isn't
// a plausible 10-digit number (or 11 digits starting with 1).
function normalizePhone(text) {
  const digits = (text || "").replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  return null;
}

// ---- Saved medications + refill reminders (client-side demo store) ----
// A real product keeps this server-side and sends the reminder by SMS/push even
// when the app is closed. Here it lives in localStorage so the whole loop demos
// with no backend: we remember what you ordered and when to check in again.
const MEDS_KEY = "rxreach_meds";
const DEFAULT_REMIND_DAYS = 14;
const DAY_MS = 86400000;

function loadMeds() {
  try { return JSON.parse(localStorage.getItem(MEDS_KEY) || "[]"); } catch { return []; }
}
function saveMeds(meds) { localStorage.setItem(MEDS_KEY, JSON.stringify(meds)); }

// Record (or refresh) an order so we can reorder it later without re-asking, and
// schedule the next check-in. Keyed by name+strength+form so two strengths of the
// same drug stay separate.
function rememberOrder(order) {
  const meds = loadMeds();
  const key = `${order.name}|${order.strength || ""}|${order.form || ""}`.toLowerCase();
  const now = Date.now();
  const existing = meds.find((m) => m.key === key);
  const remindDays = existing?.remindEveryDays || DEFAULT_REMIND_DAYS;
  const entry = {
    key,
    name: order.name,
    strength: order.strength || null,
    form: order.form || null,
    pharmacyName: order.pharmacyName || null,
    pharmacyId: order.pharmacyId || null,
    eta: order.eta || null,
    lastOrderedAt: now,
    remindEveryDays: remindDays,
    nextRemindAt: now + remindDays * DAY_MS
  };
  const next = existing ? meds.map((m) => (m.key === key ? entry : m)) : [...meds, entry];
  saveMeds(next);
  return next;
}

function medsDueNow(meds) {
  const now = Date.now();
  return (meds || []).filter((m) => m.nextRemindAt && m.nextRemindAt <= now);
}

function medLabel(m) {
  return [m.name, m.strength, m.form].filter(Boolean).join(" ");
}

function matchPlan(text) {
  const t = text.toLowerCase().trim();
  if (/\b(no|none|cash|don't|dont|nothing|skip)\b/.test(t)) return "none";
  // try id or name contains
  const byName = PLANS.find(
    (p) => p.id !== "none" && (t.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(t))
  );
  if (byName) return byName.id;
  if (/mass\s*health|medicaid/.test(t)) return "masshealth";
  if (/medicare|part d/.test(t)) return "medicare_d";
  if (/blue cross|bcbs/.test(t)) return "bcbs_ma";
  if (/tufts/.test(t)) return "tufts";
  if (/harvard|pilgrim/.test(t)) return "harvard_pilgrim";
  return null;
}

function PharmBubble({ r, profile, onOrdered }) {
  const [stock, setStock] = useState(null);
  const ins =
    r.insurance === "likely_in" ? ["in", "In network"]
    : r.insurance === "cash" ? ["", "Cash price"]
    : null;  // uncertain / out-of-network: show nothing rather than a hedge

  // Opening the pharmacy website is how an order actually starts. We still record
  // the med so the refill check-in has something to remember.
  function openOrderSite() {
    onOrdered?.({
      name: r.drugName || "your prescription",
      strength: r.strength || null,
      form: r.form || null,
      pharmacyName: r.name,
      pharmacyId: r.pharmacyId
    });
  }

  async function checkStock() {
    setStock({ status: "calling" });
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pharmacyName: r.name, phone: r.phone, medication: r.drugName })
    });
    const { callId } = await res.json();
    if (!callId) { setStock({ status: "error" }); return; }
    const started = Date.now();
    const timer = setInterval(async () => {
      const p = await fetch(`/api/stock/result?callId=${callId}`);
      const data = await p.json();
      if (data.status === "done" || data.status === "error" || Date.now() - started > 90000) {
        clearInterval(timer);
        setStock(data);
      } else setStock({ status: "calling" });
    }, 1500);
  }

  return (
    <div className="pharm">
      <p className="pname">{r.name}</p>
      <p className="paddr">{[r.street, r.city].filter(Boolean).join(", ")}</p>
      <p className="eta">{r.deliveryLabel || r.etaLabel}</p>
      <div className="facts">
        {r.distanceLabel && <span className="tag dist">{r.distanceLabel}</span>}
        <span className="tag">{r.feeLabel}</span>
        {ins && <span className={`tag ${ins[0]}`}>{ins[1]}</span>}
      </div>
      {stock && (
        <div className={`stock ${stock.status === "done" ? (stock.inStock ? "in" : "out") : stock.status}`}>
          {stock.status === "calling" && <><span className="dot" /> Calling {r.name} to check stock…</>}
          {stock.status === "done" && stock.inStock && <>✅ In stock{stock.readyTime ? ` — ready in ${stock.readyTime}` : ""}.</>}
          {stock.status === "done" && stock.inStock === false && <>❌ Not in stock. I'll text you other options.</>}
          {stock.status === "done" && stock.inStock == null && <>☎️ {stock.summary || "Couldn't confirm — try calling."}</>}
          {stock.status === "error" && <>Couldn't place the call.</>}
        </div>
      )}
      <div className="acts">
        {r.orderUrl ? (
          <a className="order" href={r.orderUrl} target="_blank" rel="noopener noreferrer" onClick={openOrderSite}>
            Pharmacy website ↗
          </a>
        ) : (
          <span className="order disabled">No website on file</span>
        )}
        <button className="call" type="button" onClick={checkStock} disabled={stock?.status === "calling"}>
          {stock?.status === "calling" ? "Calling…" : "Check stock"}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [profile, setProfile] = useState(null);     // null until onboarding done
  const [draft, setDraft] = useState({});            // collected during onboarding
  const [step, setStep] = useState("zip");           // current onboarding step
  const [onboarding, setOnboarding] = useState(true);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // medication confirmation in progress
  const [meds, setMeds] = useState([]);          // saved meds + refill reminders
  const threadRef = useRef(null);

  // Load saved profile; if present, skip onboarding. Then surface any refill
  // reminders that are due ("it's been 14 days — reorder?").
  useEffect(() => {
    const savedMeds = loadMeds();
    setMeds(savedMeds);
    const saved = localStorage.getItem("rxreach_profile");
    if (saved) {
      const p = JSON.parse(saved);
      setProfile(p);
      setOnboarding(false);

      const due = medsDueNow(savedMeds);
      if (due.length) {
        const list = due.map((m) => medLabel(m)).join(", ");
        setMessages([{
          from: "agent",
          text: `Welcome back${p.name ? ", " + p.name : ""}. It's been about ${due[0].remindEveryDays} days — time to reorder ${list}? Tap below and I'll send it to the same pharmacy, no questions.`,
          reminders: due
        }]);
      } else {
        setMessages([{ from: "agent", text:
          `Welcome back${p.name ? ", " + p.name : ""}. What medication do you need, and when?` }]);
      }
    } else {
      // Start the in-chat onboarding.
      setMessages([{ from: "agent", text:
        "Hi, I'm Oasis. I find a pharmacy that delivers your prescription to your door. " +
        "First, what's your ZIP code?" }]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages, busy]);

  function addAgent(text) {
    setMessages((m) => [...m, { from: "agent", text }]);
  }

  // An order finished in a card → remember it and (re)schedule its check-in.
  function handleOrdered(order) {
    const next = rememberOrder(order);
    setMeds(next);
  }

  // Reorder a saved med WITHOUT re-asking name/strength/form. We already have a
  // user-confirmed medication, so we go straight to the pharmacy search and show
  // the cards. This is the fix for "don't make me confirm every time".
  async function reorder(med) {
    setMessages((m) => [...m, { from: "user", text: `Reorder ${medLabel(med)}` }]);
    setBusy(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: profile.zip, medication: med.name, planId: profile.planId })
      });
      const r = await res.json();
      const cards = (r.candidates || [])
        .slice(0, 4)
        .map((c) => ({ ...c, drugName: med.name, strength: med.strength, form: med.form }));
      setMessages((m) => [...m, {
        from: "agent",
        text: `Here's ${medLabel(med)} again — same options near ${profile.zip}. Confirm delivery and stock with the pharmacy:`,
        cards, flags: r.flags
      }]);
    } catch {
      setMessages((m) => [...m, { from: "agent", text: "Couldn't pull up your reorder. Please try again." }]);
    }
    setBusy(false);
  }

  // Text the current options to the user's phone. Sends a real SMS when Twilio
  // is configured; otherwise the API returns demo text and we show it in-app.
  async function textMe(drug) {
    if (!profile?.phone) {
      addAgent("I don't have your mobile number yet. Tell me your number (like 617-555-0123) and I'll text your options.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone, zip: profile.zip, medication: drug, planId: profile.planId })
      });
      const data = await res.json();
      if (data.sent) addAgent(`📲 Sent to ${profile.phone}. Check your Messages.`);
      else if (data.demo) addAgent(`📲 Demo mode (no SMS keys set) — this is the text I'd send to ${profile.phone}:\n\n${data.message}`);
      else addAgent(data.error ? `Couldn't send the text: ${data.error}` : "Couldn't send the text just now.");
    } catch {
      addAgent("Couldn't reach the texting service. Please try again.");
    }
    setBusy(false);
  }

  function snooze(med) {
    const next = loadMeds().map((m) =>
      m.key === med.key ? { ...m, nextRemindAt: Date.now() + (m.remindEveryDays || DEFAULT_REMIND_DAYS) * DAY_MS } : m
    );
    saveMeds(next); setMeds(next);
    addAgent(`Okay — I'll check in again in about ${med.remindEveryDays || DEFAULT_REMIND_DAYS} days.`);
  }

  // DEMO ONLY: fast-forward every saved med's check-in to now, so you can see the
  // "time to reorder" flow without waiting 14 days. Real builds drop this.
  function demoDueNow() {
    const now = Date.now();
    const next = loadMeds().map((m) => ({ ...m, nextRemindAt: now - 1 }));
    saveMeds(next); setMeds(next);
    const due = medsDueNow(next);
    if (!due.length) { addAgent("You don't have any saved medications yet — place an order first."); return; }
    const list = due.map((m) => medLabel(m)).join(", ");
    setMessages((m) => [...m, {
      from: "agent",
      text: `(Demo) It's been 14 days — time to reorder ${list}? I'll send it to the same pharmacy, no questions.`,
      reminders: due
    }]);
  }

  // Handle one onboarding answer; advances the step machine.
  function handleOnboarding(text) {
    if (step === "zip") {
      const zip = (text.match(/\d{5}/) || [])[0];
      if (!zip) { addAgent("I just need a 5-digit ZIP code — for example, 01301."); return; }
      setDraft((d) => ({ ...d, zip }));
      setStep("phone");
      addAgent(`Got it, ${zip}. What's your mobile number? I'll text your pharmacy options and refill check-ins there. (US number, like 617-555-0123 — or say "skip".)`);
      return;
    }
    if (step === "phone") {
      if (/\b(skip|no|none)\b/i.test(text.trim())) {
        setDraft((d) => ({ ...d, phone: "" }));
        setStep("insurance");
        addAgent("No problem — I'll show options in the app instead. What insurance do you have? (MassHealth, Medicare Part D, Blue Cross, Tufts, Harvard Pilgrim — or say \"none\".)");
        return;
      }
      const phone = normalizePhone(text);
      if (!phone) { addAgent("That doesn't look like a 10-digit US mobile number. Try again like 617-555-0123, or say \"skip\"."); return; }
      setDraft((d) => ({ ...d, phone }));
      setStep("insurance");
      addAgent(`Thanks — I'll text ${phone}. What insurance do you have? (MassHealth, Medicare Part D, Blue Cross, Tufts, Harvard Pilgrim — or say "none".)`);
      return;
    }
    if (step === "insurance") {
      const planId = matchPlan(text);
      if (!planId) { addAgent("I didn't catch that plan. You can say MassHealth, Medicare Part D, Blue Cross, Tufts, Harvard Pilgrim, or \"none\"."); return; }
      setDraft((d) => ({ ...d, planId }));
      setStep("address");
      addAgent("Thanks. What's your delivery address? (Street and town is fine — or say \"skip\".)");
      return;
    }
    if (step === "address") {
      const address = /\b(skip|no|none)\b/i.test(text.trim()) ? "" : text.trim();
      const finalProfile = { ...draft, address };
      localStorage.setItem("rxreach_profile", JSON.stringify(finalProfile));
      setProfile(finalProfile);
      setOnboarding(false);
      setStep("done");
      addAgent("You're all set. Now — what medication do you need, and when? For example, \"amoxicillin by tonight.\"");
      return;
    }
  }

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text }]);

    // Onboarding path: deterministic, instant, no server call.
    if (onboarding) { handleOnboarding(text); return; }

    // Normal chat path through the Kiro agent.
    const history = messages.slice(-6).map((m) => ({ from: m.from, text: m.text }));
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, zip: profile.zip, planId: profile.planId, history, pending })
      });
      const data = await res.json();
      setPending(data.pending ?? null);
      const msg = { from: "agent", text: data.reply };
      if (data.results) {
        const r = data.results;
        const inq = r.inquiry || {};
        msg.cards = [...r.rushResults, ...r.meetsDeadline, ...r.otherOptions]
          .slice(0, 4).map((c) => ({ ...c, drugName: r.drug, strength: inq.strength || null, form: inq.form || null }));
        msg.flags = r.flags;
      }
      setMessages((m) => [...m, msg]);
    } catch {
      setMessages((m) => [...m, { from: "agent", text: "Something went wrong. Please try again." }]);
    }
    setBusy(false);
  }

  if (!ready) return null;

  const placeholder =
    onboarding && step === "zip" ? "Enter your ZIP code…"
    : onboarding && step === "phone" ? "Your mobile number…"
    : onboarding && step === "insurance" ? "Your insurance plan…"
    : onboarding && step === "address" ? "Your delivery address…"
    : "Message Oasis…";

  return (
    <div className="app">
      <div className="chat-head">
        <div className="mark">Rx</div>
        <div className="name">Oasis</div>
        <div className="status">{profile ? `Delivery near ${profile.zip}` : "Setting things up…"}</div>
      </div>

      <div className="thread" ref={threadRef}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={`bubble ${m.from}`}>{m.text}</div>
            {m.flags?.map((f) => (
              <div key={f} className="safety flag">{FLAG_TEXT[f]}</div>
            ))}
            {m.reminders?.map((med) => (
              <div key={med.key} className="reminder">
                <span className="reminder-name">{medLabel(med)}</span>
                <div className="reminder-acts">
                  <button className="reorder" type="button" onClick={() => reorder(med)}>Reorder</button>
                  <button className="later" type="button" onClick={() => snooze(med)}>Not now</button>
                </div>
              </div>
            ))}
            {m.cards?.map((c) => (
              <PharmBubble key={c.pharmacyId} r={c} profile={profile} onOrdered={handleOrdered} />
            ))}
            {/* Text-me button hidden for now (SMS paused). Code kept for later. */}
            {false && m.cards?.length > 0 && (
              <button className="textme" type="button" disabled={busy} onClick={() => textMe(m.cards[0].drugName)}>
                📲 Text me these options
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="bubble agent"><div className="typing"><span /><span /><span /></div></div>
        )}
      </div>

      {!onboarding && messages.length <= 1 && (
        <div className="chips">
          <button onClick={() => send("I need amoxicillin by tonight")}>Amoxicillin by tonight</button>
          <button onClick={() => send("my insulin as soon as possible")}>Insulin, ASAP</button>
          <button onClick={() => send("metformin refill tomorrow")}>Metformin tomorrow</button>
        </div>
      )}

      {/* Simulate check-in chip hidden for now. Code kept for later demos. */}
      {false && !onboarding && meds.length > 0 && (
        <div className="chips demo">
          <button className="demo-btn" onClick={demoDueNow} title="Demo: skip the 14-day wait">
            ⏩ Simulate 14-day check-in
          </button>
        </div>
      )}

      <div className="composer">
        <button className="plus" aria-label="More" onClick={() => !onboarding && send("What can you do?")}>+</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={placeholder}
        />
        <button className="send" aria-label="Send" disabled={busy || !input.trim()} onClick={() => send()}>↑</button>
      </div>
    </div>
  );
}
