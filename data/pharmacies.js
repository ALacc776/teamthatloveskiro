// Hand-curated Greenfield, MA (Franklin County) pharmacy delivery directory.
// DEMO DATA: names are real-ish Western MA pharmacies; fees, cutoffs, windows,
// fill times and the RUSH tier are hand-estimated for the hackathon demo.

export const PHARMACIES = [
  {
    id: "ph_baystate",
    name: "Baystate Franklin Pharmacy",
    type: "chain",
    zip: "01301",
    lat: 42.5876, lng: -72.5995,
    deliversTo: ["01301", "01302", "01342", "01376", "01370"],
    fee: 0, freeOver: null,
    cutoff: "13:00",
    window: { start: "15:00", end: "17:00" },
    rush: { available: true, fee: 12, minutes: 90 }, // same-day courier
    fillMinutes: 30, reliability: 0.92,
    lastVerified: "2026-10-20", phone: "413-555-0100",
    orderUrl: "https://example.com/baystate/order"
  },
  {
    id: "ph_greenfield_rx",
    name: "Greenfield Family Pharmacy",
    type: "independent",
    zip: "01301",
    lat: 42.5879, lng: -72.6012,
    deliversTo: ["01301", "01302", "01376", "01339"],
    fee: 3, freeOver: 50,
    cutoff: "15:00",
    window: { start: "16:00", end: "19:00" },
    rush: { available: true, fee: 8, minutes: 75 },
    fillMinutes: 20, reliability: 0.88,
    lastVerified: "2026-10-18", phone: "413-555-0101",
    orderUrl: "https://example.com/gffp/order"
  },
  {
    id: "ph_cvs_main",
    name: "CVS Pharmacy — Main St",
    type: "chain",
    zip: "01301",
    lat: 42.5862, lng: -72.5981,
    deliversTo: ["01301", "01302", "01342"],
    fee: 5, freeOver: null,
    cutoff: "12:00",
    window: { start: "14:00", end: "18:00" },
    rush: { available: false },
    fillMinutes: 45, reliability: 0.8,
    lastVerified: "2026-10-22", phone: "413-555-0102",
    orderUrl: "https://example.com/cvs/order"
  },
  {
    id: "ph_walgreens",
    name: "Walgreens — Mohawk Trail",
    type: "chain",
    zip: "01301",
    lat: 42.5901, lng: -72.6033,
    deliversTo: ["01301", "01370", "01339"],
    fee: 0, freeOver: null,
    cutoff: "11:00",
    window: { start: "13:00", end: "17:00" },
    rush: { available: false },
    fillMinutes: 40, reliability: 0.78,
    lastVerified: "2026-10-15", phone: "413-555-0103",
    orderUrl: "https://example.com/walgreens/order"
  },
  {
    id: "ph_turners",
    name: "Turners Falls Community Pharmacy",
    type: "independent",
    zip: "01376",
    lat: 42.6056, lng: -72.5573,
    deliversTo: ["01376", "01301", "01349", "01351"],
    fee: 0, freeOver: null,
    cutoff: "14:00",
    window: { start: "16:00", end: "18:00" },
    rush: { available: true, fee: 10, minutes: 120 },
    fillMinutes: 25, reliability: 0.9,
    lastVerified: "2026-10-21", phone: "413-555-0104",
    orderUrl: "https://example.com/turners/order"
  },
  {
    id: "ph_shelburne",
    name: "Shelburne Falls Apothecary",
    type: "independent",
    zip: "01370",
    lat: 42.6042, lng: -72.7392,
    deliversTo: ["01370", "01301", "01339", "01338"],
    fee: 4, freeOver: 40,
    cutoff: "12:30",
    window: { start: "15:00", end: "18:00" },
    rush: { available: true, fee: 9, minutes: 100 },
    fillMinutes: 20, reliability: 0.86,
    lastVerified: "2026-10-19", phone: "413-555-0105",
    orderUrl: "https://example.com/shelburne/order"
  },
  {
    id: "ph_mailright",
    name: "MailRight Rx (mail-order)",
    type: "mail-order",
    zip: "02101",
    lat: 42.3601, lng: -71.0589,
    deliversTo: ["*"],
    fee: 0, freeOver: null,
    cutoff: "20:00",
    window: { start: "48h", end: "72h" },
    rush: { available: false },
    fillMinutes: 60, reliability: 0.95,
    lastVerified: "2026-10-23", phone: "800-555-0199",
    orderUrl: "https://example.com/mailright/order"
  }
];

// Approx ZIP centroids for straight-line drive-time + nearest-ZIP fallback.
export const ZIP_CENTROIDS = {
  "01301": { lat: 42.5876, lng: -72.5995, town: "Greenfield" },
  "01302": { lat: 42.5876, lng: -72.5995, town: "Greenfield" },
  "01342": { lat: 42.5412, lng: -72.6007, town: "Deerfield" },
  "01376": { lat: 42.6056, lng: -72.5573, town: "Turners Falls" },
  "01370": { lat: 42.6042, lng: -72.7392, town: "Shelburne Falls" },
  "01339": { lat: 42.6357, lng: -72.7948, town: "Charlemont" },
  "01338": { lat: 42.5503, lng: -72.7612, town: "Buckland" },
  "01349": { lat: 42.5934, lng: -72.4879, town: "Millers Falls" },
  "01351": { lat: 42.5745, lng: -72.5201, town: "Montague" }
};
