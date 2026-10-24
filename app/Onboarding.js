"use client";

import { useState } from "react";
import { PLANS } from "@/data/plans.js";

export default function Onboarding({ onDone }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [planId, setPlanId] = useState("");

  const valid = /^\d{5}$/.test(zip) && planId;

  function finish() {
    const profile = { name: name.trim(), address: address.trim(), zip, planId };
    localStorage.setItem("rxreach_profile", JSON.stringify(profile));
    onDone(profile);
  }

  return (
    <div className="onboard">
      <h1 className="hero">
        Hi, I'm <span className="rx">RxReach</span>.
      </h1>
      <p className="sub">
        Tell me where to deliver and I'll find a pharmacy that brings your
        medication to your door. Takes one minute.
      </p>

      <label>What should I call you? (optional)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" />

      <label>Delivery address</label>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="e.g. 14 Main St, Greenfield"
        autoComplete="street-address"
      />

      <label>ZIP code</label>
      <input
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
        inputMode="numeric"
        placeholder="e.g. 01301"
      />

      <label>Insurance</label>
      <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
        <option value="">Choose your plan…</option>
        {PLANS.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <button className="go" disabled={!valid} onClick={finish}>
        Start
      </button>
      <p className="fineprint">
        Your info stays on this phone. Not for emergencies — call 911.
      </p>
    </div>
  );
}
