import { verifyJambProfileCode } from "@/lib/services/routing";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  try {
    const body = await request.json();
    const profileCode = String(body.profileCode || "").trim();
    const examType = String(body.examType || "utme").trim();

    if (!profileCode) {
      return Response.json({ error: "Profile Code is required." }, { status: 400 });
    }

    const result = await verifyJambProfileCode(profileCode, examType);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Profile code verification failed." },
      { status: 500 }
    );
  }
}

