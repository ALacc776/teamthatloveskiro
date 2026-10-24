// Demo insurance plans. Real network matching is Phase 2 (needs plan directory
// data). Here each plan lists which pharmacy TYPES it tends to cover, so we can
// show an honest "likely in network" guess without claiming a real match.

export const PLANS = [
  { id: "masshealth", name: "MassHealth", covers: ["chain", "independent", "mail-order"] },
  { id: "medicare_d", name: "Medicare Part D", covers: ["chain", "mail-order"] },
  { id: "bcbs_ma", name: "Blue Cross Blue Shield MA", covers: ["chain", "independent", "mail-order"] },
  { id: "tufts", name: "Tufts Health Plan", covers: ["chain", "independent"] },
  { id: "harvard_pilgrim", name: "Harvard Pilgrim", covers: ["chain", "mail-order"] },
  { id: "none", name: "No insurance / paying cash", covers: ["chain", "independent", "mail-order"] }
];

export function insuranceFit(planId, pharmacyType) {
  if (!planId) return null;
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return null;
  if (plan.id === "none") return "cash";
  return plan.covers.includes(pharmacyType) ? "likely_in" : "likely_out";
}
