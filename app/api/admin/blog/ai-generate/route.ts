import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { generateBlogWithAi } from "@/lib/blog/ai-writer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Require admin session
    await requireAdmin();

    const body = await request.json();
    const result = await generateBlogWithAi({
      title: body.title,
      roughNotes: body.roughNotes,
      category: body.category,
      tone: body.tone,
      action: body.action,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to generate blog content";
    console.error("AI Generation error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
