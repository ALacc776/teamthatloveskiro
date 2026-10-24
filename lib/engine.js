// RxReach ETA + ranking engine.
// delivery_time = fill_time + batch_wait + drive_time, returned as a WINDOW.
// Never returns empty: widens to nearby ZIPs and mail-order if needed.

import { PHARMACIES, ZIP_CENTROIDS } from "../data/pharmacies.js";
import { DRUGS } from "../data/drugs.js";
import { insuranceFit } from "../data/plans.js";

const AVG_SPEED_MPH = 30;

function milesBetween(a, b) {
  if (!a || !b) return 8;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function hm(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
function fmtTime(d) {
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
}

export function findDrug(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  return DRUGS.find((d) => t.includes(d.generic) || t.includes(d.name.toLowerCase().split(" ")[0])) || null;
}

function feeLabel(fee, freeOver) {
  if (fee === 0) return "Free delivery";
  if (freeOver) return `$${fee} (free over $${freeOver})`;
  return `$${fee} delivery`;
}

function estimate({ pharmacy, userZip, drug, now, deadline, rush }) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fill = pharmacy.fillMinutes + (drug?.extraFillMinutes || 0);
  const miles = milesBetween(ZIP_CENTROIDS[pharmacy.zip], ZIP_CENTROIDS[userZip]);
  const driveMin = Math.round((miles / AVG_SPEED_MPH) * 60);
  const isMail = pharmacy.window.start.endsWith("h");

  // RUSH path: available only if the pharmacy offers it and user wants speed
  if (rush && pharmacy.rush?.available && !isMail) {
    const total = fill + pharmacy.rush.minutes + driveMin;
    const start = new Date(now.getTime() + (total - 20) * 60000);
    const end = new Date(now.getTime() + (total + 20) * 60000);
    return {
      mode: "rush",
      etaWindow: { start, end },
      etaLabel: `Rush — about ${fmtTime(start)}–${fmtTime(end)} today`,
      fee: pharmacy.rush.fee, feeLabel: `$${pharmacy.rush.fee} rush delivery`,
      confidence: pharmacy.reliability >= 0.88 ? "high" : "medium",
      deadlineStatus: deadline ? (end <= deadline ? "meets" : "tight") : "none",
      miles: Math.round(miles)
    };
  }

  let start, end, sameDay;
  if (isMail) {
    const sh = parseInt(pharmacy.window.start), eh = parseInt(pharmacy.window.end);
    start = new Date(now.getTime() + sh * 3600000);
    end = new Date(now.getTime() + eh * 3600000);
    sameDay = false;
  } else {
    const madeCutoff = nowMin + fill <= hm(pharmacy.cutoff);
    const base = new Date(now); base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + (madeCutoff ? 0 : 1));
    start = new Date(base.getTime() + (hm(pharmacy.window.start) + driveMin) * 60000);
    end = new Date(base.getTime() + (hm(pharmacy.window.end) + driveMin) * 60000);
    sameDay = madeCutoff;
  }

  const ageDays = (Date.now() - new Date(pharmacy.lastVerified).getTime()) / 86400000;
  let confidence = "high";
  if (pharmacy.reliability < 0.85 || ageDays > 7) confidence = "medium";
  if (pharmacy.reliability < 0.8 || ageDays > 30) confidence = "low";

  let deadlineStatus = "none";
  if (deadline) deadlineStatus = end <= deadline ? "meets" : start <= deadline ? "tight" : "misses";

  return {
    mode: "standard",
    etaWindow: { start, end },
    etaLabel: isMail
      ? `In ${parseInt(pharmacy.window.start)}–${parseInt(pharmacy.window.end)} hrs by mail`
      : `${sameDay ? "Today" : "Tomorrow"}, ${fmtTime(start)}–${fmtTime(end)}`,
    confidence, deadlineStatus, miles: Math.round(miles)
  };
}

function scoreOf(p, est, sort) {
  const w = sort === "fastest" ? { speed: 0.6, cost: 0.15, trust: 0.15, fresh: 0.1 }
    : sort === "cheapest" ? { speed: 0.2, cost: 0.55, trust: 0.15, fresh: 0.1 }
    : { speed: 0.35, cost: 0.3, trust: 0.2, fresh: 0.15 };
  const hoursOut = (est.etaWindow.end.getTime() - Date.now()) / 3600000;
  const speed = Math.max(0, 1 - hoursOut / 72);
  const fee = est.fee ?? p.fee;
  const cost = fee === 0 ? 1 : Math.max(0, 1 - fee / 12);
  const ageDays = (Date.now() - new Date(p.lastVerified).getTime()) / 86400000;
  const fresh = Math.max(0, 1 - ageDays / 60);
  return w.speed * speed + w.cost * cost + w.trust * p.reliability + w.fresh * fresh;
}

function buildResult(p, est, planId) {
  return {
    pharmacyId: p.id, name: p.name, type: p.type, phone: p.phone, orderUrl: p.orderUrl,
    fee: est.fee ?? p.fee, feeLabel: est.feeLabel ?? feeLabel(p.fee, p.freeOver),
    cutoff: p.cutoff, lastVerified: p.lastVerified,
    mode: est.mode, etaLabel: est.etaLabel, etaWindow: est.etaWindow,
    confidence: est.confidence, deadlineStatus: est.deadlineStatus, miles: est.miles,
    rushAvailable: !!p.rush?.available,
    insurance: insuranceFit(planId, p.type)
  };
}

// Find the nearest ZIP we actually have pharmacies for (never-say-no).
function nearestServedZip(zip) {
  const target = ZIP_CENTROIDS[zip];
  if (!target) return null;
  const served = new Set();
  PHARMACIES.forEach((p) => p.deliversTo.forEach((z) => z !== "*" && served.add(z)));
  let best = null, bestMiles = Infinity;
  for (const z of served) {
    if (z === zip) continue;
    const m = milesBetween(target, ZIP_CENTROIDS[z]);
    if (m < bestMiles) { bestMiles = m; best = z; }
  }
  return best ? { zip: best, town: ZIP_CENTROIDS[best]?.town, miles: Math.round(bestMiles) } : null;
}

// Main entry. Returns { ... , fallback } — fallback explains any widening.
export function search({ zip, medication, neededBy, sort = "best", rush = false, planId = null, now = new Date() }) {
  const drug = findDrug(medication);
  const deadline = neededBy ? new Date(neededBy) : null;

  const direct = PHARMACIES.filter((p) => p.deliversTo.includes(zip));
  let usedZip = zip, fallback = null;
  let pool = direct;

  if (direct.length === 0) {
    // Never say no: widen to nearest served ZIP, keep mail-order always.
    const near = nearestServedZip(zip);
    const mail = PHARMACIES.filter((p) => p.deliversTo.includes("*"));
    if (near) {
      const nearPharms = PHARMACIES.filter((p) => p.deliversTo.includes(near.zip));
      pool = [...nearPharms, ...mail];
      usedZip = near.zip;
      fallback = { reason: "nearby", town: near.town, zip: near.zip, miles: near.miles };
    } else {
      pool = mail;
      fallback = { reason: "mail_only" };
    }
  }

  const scored = pool.map((p) => {
    const est = estimate({ pharmacy: p, userZip: usedZip, drug, now, deadline, rush });
    return { ...buildResult(p, est, planId), score: scoreOf(p, est, sort) };
  });
  scored.sort((a, b) => b.score - a.score);

  // Rush results float to top when present
  const rushResults = scored.filter((r) => r.mode === "rush");
  const rest = scored.filter((r) => r.mode !== "rush");
  const meetsDeadline = rest.filter((r) => !deadline || r.deadlineStatus === "meets" || r.deadlineStatus === "tight");
  const otherOptions = rest.filter((r) => deadline && r.deadlineStatus === "misses");

  const flags = [];
  if (drug?.special === "cold_chain") flags.push("cold_chain");
  if (drug?.special === "controlled") flags.push("controlled");
  if (drug?.special === "time_critical") flags.push("time_critical");

  return {
    zip, usedZip, fallback,
    drug: drug ? drug.name : medication,
    rushResults, meetsDeadline, otherOptions,
    flags, disclaimers: ["not_emergency", "confirm_availability"]
  };
}
