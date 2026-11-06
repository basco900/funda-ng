import { listCableTvPackages } from "@/lib/services/routing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get("operator") || undefined;
    const packages = await listCableTvPackages(operator);
    return Response.json({ packages }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load TV packages." },
      { status: 500 },
    );
  }
}

