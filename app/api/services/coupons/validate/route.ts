import { createClient } from "@/lib/supabase/server";
import { validateCoupon } from "@/lib/services/routing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const serviceType = String(body.serviceType || "all");
    const amount = Number(body.amount) || 0;

    if (!code) {
      return Response.json({ valid: false, discountAmount: 0, message: "Enter a coupon code." }, { status: 400 });
    }

    const result = await validateCoupon(code, serviceType, amount, user.id);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { valid: false, discountAmount: 0, message: error instanceof Error ? error.message : "Validation failed." },
      { status: 500 },
    );
  }
}

