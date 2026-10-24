"use client";

import { useState, useRef, useEffect } from "react";
import Onboarding from "./Onboarding.js";

const FLAG_TEXT = {
  cold_chain: "❄️ Refrigerated medication — only cold-chain delivery shown.",
  controlled: "⚠️ Controlled substance — ID and signature may be needed on delivery.",
  time_critical: "⏱️ Time-critical — fastest option shown first. If this is an emergency, call 911."
};

function PharmBubble({ r, profile, when, rush }) {
  const [sms, setSms] = useState(null);
  const [stock, setStock] = useState(null); // {status, inStock, summary, ...}
  const ins =
    r.insurance === "likely_in" ? ["in", "Likely in network"]
    : r.insurance === "likely_out" ? ["out", "May be out of network"]
    : r.insurance === "cash" ? ["", "Cash price"]
    : null;

  async function textMe() {
    const res = await fetch("/api/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: profile.phone || "+15550000000",
        zip: profile.zip, medication: r.drugName, neededBy: null,
        rush, planId: profile.planId
      })
    });
    setSms(await res.json());
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
    // poll for the result
    const started = Date.now();
    const timer = setInterval(async () => {
      const p = await fetch(`/api/stock/result?callId=${callId}`);
      const data = await p.json();
      if (data.status === "done" || data.status === "error" || Date.now() - started > 90000) {
        clearInterval(timer);
        setStock(data);
      } else {
        setStock({ status: "calling" });
      }
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
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("rxreach_profile");
    if (saved) setProfile(JSON.parse(saved));
    setReady(true);
  }, []);

  useEffect(() => {
    if (profile && messages.length === 0) {
      const hi = profile.name ? `Hi ${profile.name}!` : "Hi!";
      setMessages([{ from: "agent", text:
        `${hi} Tell me what medication you need and when, in your own words. ` +
        `For example: "I need amoxicillin by tonight" or "my mom's insulin as soon as possible".` }]);
    }
  }, [profile]); // eslint-disable-line

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages, busy]);

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const history = messages.slice(-6).map((m) => ({ from: m.from, text: m.text }));
    setMessages((m) => [...m, { from: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, zip: profile.zip, planId: profile.planId, history })
      });
      const data = await res.json();
      const msg = { from: "agent", text: data.reply };
      if (data.results) {
        const r = data.results;
        const cards = [...r.rushResults, ...r.meetsDeadline, ...r.otherOptions]
          .slice(0, 4)
          .map((c) => ({ ...c, drugName: r.drug }));
        msg.cards = cards;
        msg.flags = r.flags;
        msg.when = data.parsed.when;
        msg.rush = data.parsed.rush;
      }
      setMessages((m) => [...m, msg]);
    } catch {
      setMessages((m) => [...m, { from: "agent", text: "Something went wrong. Please try again." }]);
    }
    setBusy(false);
  }

  if (!ready) return null;
  if (!profile) return <Onboarding onDone={setProfile} />;

  return (
    <div className="app">
      <div className="chat-head">
        <div className="mark">Rx</div>
        <div className="name">RxReach</div>
        <div className="status">Delivery near {profile.zip}</div>
      </div>

      <div className="thread" ref={threadRef}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={`bubble ${m.from}`}>{m.text}</div>
            {m.flags?.map((f) => (
              <div key={f} className="safety flag">{FLAG_TEXT[f]}</div>
            ))}
            {m.cards?.map((c) => (
              <PharmBubble key={c.pharmacyId} r={c} profile={profile} when={m.when} rush={m.rush} />
            ))}
          </div>
        ))}
        {busy && (
          <div className="bubble agent"><div className="typing"><span /><span /><span /></div></div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="chips">
          <button onClick={() => send("I need amoxicillin by tonight")}>Amoxicillin by tonight</button>
          <button onClick={() => send("my insulin as soon as possible")}>Insulin, ASAP</button>
          <button onClick={() => send("metformin refill tomorrow")}>Metformin tomorrow</button>
        </div>
      )}

      <div className="composer">
        <button className="plus" aria-label="More" onClick={() => send("What can you do?")}>+</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message RxReach…"
        />
        <button className="send" aria-label="Send" disabled={busy || !input.trim()} onClick={() => send()}>↑</button>
      </div>
    </div>
  );
}
