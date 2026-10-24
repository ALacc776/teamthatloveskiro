"use client";

import { useState, useRef, useEffect } from "react";
import { PLANS } from "@/data/plans.js";

const FLAG_TEXT = {
  cold_chain: "❄️ Refrigerated medication — only cold-chain delivery shown.",
  controlled: "⚠️ Controlled substance — ID and signature may be needed on delivery.",
  time_critical: "⏱️ Time-critical — fastest option shown first. If this is an emergency, call 911."
};

// ---- In-chat onboarding steps ----
const STEPS = ["zip", "insurance", "address", "done"];

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

function PharmBubble({ r, profile }) {
  const [stock, setStock] = useState(null);
  const ins =
    r.insurance === "likely_in" ? ["in", "Likely in network"]
    : r.insurance === "likely_out" ? ["out", "May be out of network"]
    : r.insurance === "cash" ? ["", "Cash price"]
    : null;

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
    <div className={`pharm ${r.mode === "rush" ? "rush" : ""}`}>
      <p className="pname">{r.name}</p>
      <p className="eta">{r.etaLabel}</p>
      <div className="facts">
        {r.mode === "rush" && <span className="tag rush">Fast delivery</span>}
        <span className={`tag ${r.fee === 0 ? "free" : ""}`}>{r.feeLabel}</span>
        {ins && <span className={`tag ${ins[0]}`}>{ins[1]}</span>}
        {r.deadlineStatus === "meets" && <span className="tag free">Meets your time</span>}
        {r.deadlineStatus === "tight" && <span className="tag">Tight</span>}
      </div>
      <p className="conf">Order by {r.cutoff} · {r.confidence} confidence · verified {r.lastVerified}</p>
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
        <a className="order" href={r.orderUrl} target="_blank" rel="noreferrer">Start order</a>
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
  const threadRef = useRef(null);

  // Load saved profile; if present, skip onboarding.
  useEffect(() => {
    const saved = localStorage.getItem("rxreach_profile");
    if (saved) {
      const p = JSON.parse(saved);
      setProfile(p);
      setOnboarding(false);
      setMessages([{ from: "agent", text:
        `Welcome back${p.name ? ", " + p.name : ""}. What medication do you need, and when?` }]);
    } else {
      // Start the in-chat onboarding.
      setMessages([{ from: "agent", text:
        "Hi, I'm RxReach. I find a pharmacy that delivers your prescription to your door. " +
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

  // Handle one onboarding answer; advances the step machine.
  function handleOnboarding(text) {
    if (step === "zip") {
      const zip = (text.match(/\d{5}/) || [])[0];
      if (!zip) { addAgent("I just need a 5-digit ZIP code — for example, 01301."); return; }
      setDraft((d) => ({ ...d, zip }));
      setStep("insurance");
      addAgent(`Got it, ${zip}. What insurance do you have? (MassHealth, Medicare Part D, Blue Cross, Tufts, Harvard Pilgrim — or say "none".)`);
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
        msg.cards = [...r.rushResults, ...r.meetsDeadline, ...r.otherOptions]
          .slice(0, 4).map((c) => ({ ...c, drugName: r.drug }));
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
    : onboarding && step === "insurance" ? "Your insurance plan…"
    : onboarding && step === "address" ? "Your delivery address…"
    : "Message RxReach…";

  return (
    <div className="app">
      <div className="chat-head">
        <div className="mark">Rx</div>
        <div className="name">RxReach</div>
        <div className="status">{profile ? `Delivery near ${profile.zip}` : "Setting things up…"}</div>
      </div>

      <div className="thread" ref={threadRef}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={`bubble ${m.from}`}>{m.text}</div>
            {m.flags?.map((f) => (
              <div key={f} className="safety flag">{FLAG_TEXT[f]}</div>
            ))}
            {m.cards?.map((c) => (
              <PharmBubble key={c.pharmacyId} r={c} profile={profile} />
            ))}
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
