import { createClient } from "@/lib/supabase/server";
import { listUserBeneficiaries, recordServiceBeneficiary, removeServiceBeneficiary } from "@/lib/services/beneficiaries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const serviceType = searchParams.get("service") || undefined;

    const beneficiaries = await listUserBeneficiaries(user.id, serviceType);
    return Response.json({ beneficiaries });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load beneficiaries." },
      { status: 500 },
    );
  }
}

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
    if (!body.serviceType || !body.recipient || !body.networkOrDisco) {
      return Response.json({ error: "Missing required beneficiary fields." }, { status: 400 });
    }

    await recordServiceBeneficiary({
      userId: user.id,
      serviceType: body.serviceType,
      recipient: body.recipient,
      networkOrDisco: body.networkOrDisco,
      label: body.label,
      meterType: body.meterType,
    });

    const beneficiaries = await listUserBeneficiaries(user.id, body.serviceType);
    return Response.json({ success: true, beneficiaries });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save beneficiary." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "Beneficiary ID is required." }, { status: 400 });
    }

    const ok = await removeServiceBeneficiary(user.id, id);
    return Response.json({ success: ok });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to remove beneficiary." },
      { status: 500 },
    );
  }
}

