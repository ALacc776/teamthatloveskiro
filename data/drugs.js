// Small drug catalog for the demo. In the real product this comes from RxNorm.
// `extraFillMinutes` reflects drugs that take longer to prepare/approve.
// `special` flags drive the safety notices (cold chain, controlled, time-critical).

export const DRUGS = [
  { name: "Amoxicillin", generic: "amoxicillin", extraFillMinutes: 0, special: null },
  { name: "Metformin", generic: "metformin", extraFillMinutes: 0, special: null },
  { name: "Lisinopril", generic: "lisinopril", extraFillMinutes: 0, special: null },
  { name: "Atorvastatin", generic: "atorvastatin", extraFillMinutes: 0, special: null },
  { name: "Insulin (Lantus)", generic: "insulin glargine", extraFillMinutes: 15, special: "cold_chain" },
  { name: "Albuterol inhaler", generic: "albuterol", extraFillMinutes: 0, special: "time_critical" },
  { name: "EpiPen", generic: "epinephrine", extraFillMinutes: 10, special: "time_critical" },
  { name: "Adderall", generic: "amphetamine", extraFillMinutes: 20, special: "controlled" },
  { name: "Levothyroxine", generic: "levothyroxine", extraFillMinutes: 0, special: null },
  { name: "Amlodipine", generic: "amlodipine", extraFillMinutes: 0, special: null }
];
