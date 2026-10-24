import { partialMatches, exactMatch, fuzzySuggestions, CATALOG_PROVENANCE } from "@/lib/catalog.js";

// GET  /api/medication?q=amox        → autocomplete (partial + fuzzy)
// POST /api/medication  { q }        → same, for longer queries
//
// Pure NAME RECOGNITION. Returns preliminary matches with their verification
// warning; it does NOT confirm a medication and is NOT evidence of stock.
function lookup(q, limit) {
  const query = (q || "").trim();
  if (!query) return { query, provenance: CATALOG_PROVENANCE, exact: null, suggestions: [] };

  const exact = exactMatch(query);
  let suggestions = partialMatches(query, limit);
  if (suggestions.length === 0) suggestions = fuzzySuggestions(query, limit);

  return {
    query,
    provenance: CATALOG_PROVENANCE, // preserves source + verification warning
    exact,                           // decorated exact match or null
    suggestions                      // decorated partial/fuzzy matches
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(Number(searchParams.get("limit")) || 8, 20);
  return Response.json(lookup(q, limit));
}

export async function POST(req) {
  const { q, limit } = await req.json().catch(() => ({}));
  return Response.json(lookup(q, Math.min(Number(limit) || 8, 20)));
}
