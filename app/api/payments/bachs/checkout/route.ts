import { randomUUID } from "node:crypto";
import {
  BachsApiError,
  createTemporaryVirtualAccount,
} from "@/lib/payments/bachs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

class CustomerError extends Error {}

const naira = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();
    // Look for a pending funding transaction created within the last 28 minutes
    const cutoff = new Date(Date.now() - 28 * 60_000).toISOString();
    const { data: latest } = await admin
      .from("wallet_funding_transactions")
      .select("id, checkout_id, amount, currency, status, provider_payload, merchant_reference, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      return Response.json({ active: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const payload = (latest.provider_payload ?? {}) as {
      accountNumber?: string;
      bankName?: string;
      accountName?: string;
      expiresAt?: string;
      instructions?: {
        account_number?: string;
        bank_name?: string;
        account_name?: string;
        transaction_amount_payable?: string;
        expires_in_minutes?: number;
      };
    };

    const accountNumber = payload.accountNumber || payload.instructions?.account_number;
    if (!accountNumber) {
      return Response.json({ active: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const expiresAt =
      payload.expiresAt ||
      new Date(Date.parse(latest.created_at) + 30 * 60_000).toISOString();

    if (Date.parse(expiresAt) <= Date.now()) {
      return Response.json({ active: false }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json(
      {
        active: true,
        temporaryAccount: {
          checkoutId: latest.checkout_id,
          accountNumber,
          bankName: payload.bankName || payload.instructions?.bank_name || "Nombank MFB",
          accountName: payload.accountName || payload.instructions?.account_name?.trim() || "BACHS/Funda",
          amount: latest.amount,
          currency: latest.currency,
          expiresAt,
          reference: latest.merchant_reference,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load active temporary account", error instanceof Error ? error.message : error);
    return Response.json({ active: false }, { headers: { "Cache-Control": "no-store" } });
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
    if (!user.email) {
      throw new CustomerError("Add a verified email address before funding your wallet.");
    }

    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (
      !Number.isFinite(amount) ||
      amount < 100 ||
      amount > 500_000 ||
      Math.round(amount * 100) !== amount * 100
    ) {
      throw new CustomerError("Enter a valid funding amount (₦100 – ₦500,000).");
    }

    const admin = createAdminClient();
    const [{ data: controls }, { data: headroom, error: headroomError }] = await Promise.all([
      admin.from("customer_account_controls").select("wallet_status").eq("user_id", user.id).maybeSingle(),
      admin.rpc("wallet_funding_headroom", { p_user_id: user.id }),
    ]);
    if (headroomError) {
      console.warn("wallet_funding_headroom warning:", headroomError.message || headroomError);
    }
    if (controls && ["frozen", "credits_blocked"].includes(controls.wallet_status)) {
      throw new CustomerError("Wallet funding is currently restricted on this account. Contact support.");
    }
    if (headroom !== null && headroom !== undefined && amount > Number(headroom)) {
      throw new CustomerError(
        Number(headroom) > 0
          ? `You can fund up to ${naira(Number(headroom))} more today. Complete verification to raise your limit.`
          : "You have reached today's funding limit. Complete verification to raise your limit.",
      );
    }

    const amountText = amount.toFixed(2);
    const internalId = randomUUID();
    const reference = `funda_wallet_${internalId}`;
    const idempotencyKey = `bachs_temp_va_${internalId}`;

    const { error: insertError } = await admin.from("wallet_funding_transactions").insert({
      id: internalId,
      user_id: user.id,
      merchant_reference: reference,
      idempotency_key: idempotencyKey,
      amount: amountText,
      currency: "NGN",
      status: "initializing",
    });
    if (insertError) throw new Error("Wallet funding record could not be created.");

    try {
      const tempVA = await createTemporaryVirtualAccount({
        amount: amountText,
        email: user.email,
        name: String(user.user_metadata?.full_name || "Funda customer"),
        phone: user.phone,
        reference,
        idempotencyKey,
        userId: user.id,
      });

      const { error: updateError } = await admin
        .from("wallet_funding_transactions")
        .update({
          checkout_id: tempVA.checkoutId,
          checkout_url: tempVA.checkoutUrl,
          status: "pending",
          provider_payload: {
            ...tempVA,
            instructions: {
              account_number: tempVA.accountNumber,
              bank_name: tempVA.bankName,
              account_name: tempVA.accountName,
              transaction_amount_payable: tempVA.amount,
              expires_in_minutes: tempVA.expiresInMinutes,
            },
          },
        })
        .eq("id", internalId)
        .eq("status", "initializing");
      if (updateError) throw new Error("Could not persist the virtual account.");

      return Response.json(
        {
          success: true,
          temporaryAccount: tempVA,
        },
        { status: 201 },
      );
    } catch (error) {
      const depositLimit =
        error instanceof BachsApiError && error.errorCode === "DEPOSIT_LIMIT_EXCEEDED" && error.details?.max_allowed_amount
          ? new CustomerError(`Maximum single deposit allowed is ${naira(Number(error.details.max_allowed_amount))}.`)
          : null;
      const reason = depositLimit?.message ?? (error instanceof Error ? error.message : "Temporary virtual account generation failed");
      await admin
        .from("wallet_funding_transactions")
        .update({ status: "failed", failure_reason: reason.slice(0, 500) })
        .eq("id", internalId);
      throw depositLimit ?? error;
    }
  } catch (error) {
    if (error instanceof CustomerError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Temporary virtual account failed", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "Could not generate temporary bank account right now. Please try again shortly." },
      { status: 502 },
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();
    await admin
      .from("wallet_funding_transactions")
      .update({ status: "cancelled" })
      .eq("user_id", user.id)
      .eq("status", "pending");

    return Response.json({ success: true });
  } catch (err) {
    console.error("Failed to cancel funding transaction", err);
    return Response.json({ success: false }, { status: 500 });
  }
}
