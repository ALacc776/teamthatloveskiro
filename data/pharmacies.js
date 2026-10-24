// RxReach pharmacy dataset.
//
// The fictional Greenfield demo directory has been REPLACED with real research
// records from data/research/*.csv (see scripts/build-pharmacies.mjs). This file
// is a thin, stable re-export so the rest of the app imports one place.
//
// Source of truth: data/pharmacies.generated.js (auto-generated — do not hand-edit).
// Regenerate with: npm run build:pharmacies

export {
  PHARMACIES,
  PHARMACY_ZIPS,
  PHARMACY_PROVENANCE
} from "./pharmacies.generated.js";
