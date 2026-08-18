import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("service_transactions")
    .select("id,internal_reference,service_type,destination,amount,cashback_amount,status,provider_reference,created_at,completed_at,product:service_products(name)")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error || !data) return Response.json({ error: "Transaction not found." }, { status: 404 });
  return Response.json({ transaction: data }, { headers: { "Cache-Control": "private, no-store" } });
}
