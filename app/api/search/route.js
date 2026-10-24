import { search } from "@/lib/engine.js";

// POST /api/search
export async function POST(req) {
  const body = await req.json();
  const { zip, medication, neededBy, sort } = body;

  if (!zip || !medication) {
    return Response.json(
      { error: "zip and medication are required" },
      { status: 400 }
    );
  }

  const results = search({ zip, medication, neededBy, sort });
  return Response.json(results);
}
