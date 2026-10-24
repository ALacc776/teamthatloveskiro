// One-time build: RxReach_Broad_Medication_Catalog.csv -> data/catalog.generated.js
// Run: node build-catalog.mjs <csv> <out.js>
// Proper RFC-4180-ish CSV parsing (handles quoted fields containing commas).
import { readFileSync, writeFileSync } from "node:fs";

const [, , csvPath, outPath] = process.argv;
if (!csvPath || !outPath) {
  console.error("usage: node build-catalog.mjs <csv> <out.js>");
  process.exit(1);
}

function parseCsv(text) {
  // Strip a BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // ignore; \n handles the newline
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = readFileSync(csvPath, "utf8");
const rows = parseCsv(raw).filter((r) => r.length > 1 && r.some((c) => c.trim() !== ""));
const header = rows[0].map((h) => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const records = rows.slice(1).map((r) => ({
  name: (r[idx.medication_name] || "").trim(),
  nameType: (r[idx.name_type] || "").trim(),          // "brand" | "generic_or_descriptive"
  category: (r[idx.category] || "").trim(),
  accessLabel: (r[idx.access_label_preliminary] || "").trim(),
  rxcui: (r[idx.rxcui] || "").trim() || null,
  verificationStatus: (r[idx.verification_status] || "").trim(),
  usageNote: (r[idx.usage_note] || "").trim()
})).filter((x) => x.name);

// The source, source_url, verification_status and usage_note are identical on
// every row, so hoist them into one shared "provenance" object to keep the
// bundle small while PRESERVING every warning. Per-row verificationStatus/usageNote
// are kept only if they ever differ from the shared value.
const srcUrl = (rows[1] || [])[idx.source_url]?.trim() || "https://lhncbc.nlm.nih.gov/MOR/RxTerms/";
const source = (rows[1] || [])[idx.source]?.trim() || "Curated broad medication name index";
const sharedVerification = records[0]?.verificationStatus || "needs_RxNorm_and_FDA_verification";
const sharedNote = records[0]?.usageNote || "";

const allSameVerification = records.every((x) => x.verificationStatus === sharedVerification);
const allSameNote = records.every((x) => x.usageNote === sharedNote);

const slim = records.map((x) => {
  const o = {
    name: x.name,
    type: x.nameType === "brand" ? "brand" : "generic",
    category: x.category,
    access: x.accessLabel,
    rxcui: x.rxcui
  };
  if (!allSameVerification) o.verificationStatus = x.verificationStatus;
  if (!allSameNote) o.usageNote = x.usageNote;
  return o;
});

const banner = `// AUTO-GENERATED from RxReach_Broad_Medication_Catalog.csv — DO NOT EDIT BY HAND.
// Regenerate with the build-catalog script (see lib/catalog.js header).
// This is a PRELIMINARY name-recognition index, NOT a clinically verified
// formulary. Every name still needs RxNorm + FDA verification, and a listed
// name is NOT evidence of pharmacy stock.`;

const out =
`${banner}

export const CATALOG_PROVENANCE = ${JSON.stringify({
  source,
  sourceUrl: srcUrl,
  verificationStatus: sharedVerification,
  usageNote: sharedNote,
  replaceableBy: "NLM RxTerms (https://lhncbc.nlm.nih.gov/MOR/RxTerms/)",
  recordCount: slim.length
}, null, 2)};

// Each entry: { name, type:"brand"|"generic", category, access, rxcui }
// (verificationStatus/usageNote are shared via CATALOG_PROVENANCE unless a row overrides.)
export const CATALOG_ENTRIES = ${JSON.stringify(slim)};
`;

writeFileSync(outPath, out);
console.log(`wrote ${slim.length} entries -> ${outPath}`);
console.log(`brand=${slim.filter((x) => x.type === "brand").length} generic=${slim.filter((x) => x.type === "generic").length}`);
console.log(`allSameVerification=${allSameVerification} allSameNote=${allSameNote}`);
