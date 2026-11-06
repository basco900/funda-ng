import { listEducationConfigs, listEducationPackages } from "@/lib/services/routing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examBody = searchParams.get("examBody") || undefined;
    const [configs, packages] = await Promise.all([
      listEducationConfigs(),
      listEducationPackages(examBody),
    ]);
    return Response.json(
      { configs, packages },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load education packages." },
      { status: 500 }
    );
  }
}

