import { after } from "next/server";
import {
  activateConnectedVirtualAccount,
  creditUserFromVirtualAccountDeposit,
  executeConnectedAccountSweep,
  recordConnectedAccountSweep,
  verifyBachsWebhook,
} from "@/lib/payments/bachs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type BachsBankTransferDetails = {
  sender_name?: string | null;
  sender_bank?: string | null;
  sender_bank_code?: string | null;
  sender_account_number?: string | null;
  session_id?: string | null;
  narration?: string | null;
  virtual_account?: {
    id?: string | null;
    account_number?: string | null;
    bank_name?: string | null;
    type?: string | null;
    expires_at?: string | null;
  } | null;
};

type BachsEvent = {
  id: string;
  type: string;
  created_at: string;
  organization_id: string;
  account?: string | null;
  data: {
    checkout_id?: string | null;
    charge_id?: string | null;
    amount?: string;
    currency?: string;
    settlement_amount?: string;
    settlement_currency?: string;
    processing_fee?: string;
    status?: string;
    overpaid_amount?: string;
    account?: string;
    capability?: string;
    payment_method_details?: {
      type?: string;
      bank_transfer?: BachsBankTransferDetails | null;
    } | null;
    metadata?: Record<string, unknown> | null;
  };
};

type ReviewReason = "unmatched_deposit" | "sender_match_unconfirmed" | "underpaid";

const moneyPattern = /^\d+(\.\d{1,2})?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const received = (extra: Record<string, unknown> = {}) => Response.json({ received: true, ...extra });
// 500 makes Bachs retry delivery; only used for transient failures on our side.
const retryLater = (error: string) => Response.json({ error }, { status: 500 });

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (
    !verifyBachsWebhook(
      rawBody,
      request.headers.get("x-bachs-timestamp"),
      request.headers.get("x-bachs-signature"),
      request.headers.get("x-bachs-signature-v2"),
    )
  ) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: BachsEvent;
  try {
    event = JSON.parse(rawBody) as BachsEvent;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!event.id || !event.type || !event.data) {
    return Response.json({ error: "Invalid event envelope." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Dedicated virtual account becomes available once the capability is active.
  if (event.type === "capability.updated") {
    const connectedAccountId = event.account || event.data.account || null;
    if (event.data.capability === "virtual_accounts" && event.data.status === "active" && connectedAccountId?.startsWith("acct_")) {
      try {
        await activateConnectedVirtualAccount(connectedAccountId);
      } catch {
        return retryLater("Temporary failure provisioning virtual account.");
      }
    }
    return received();
  }

  // 2. Money received: checkout payments, temporary accounts and permanent virtual account deposits.
  if (event.type === "collection.succeeded" || event.type === "collection.underpaid") {
    const { checkout_id, charge_id, amount, currency } = event.data;
    if (!charge_id || !amount || !currency || !moneyPattern.test(amount) || Number(amount) <= 0) {
      return Response.json({ error: "Invalid collection payload." }, { status: 400 });
    }

    const transfer = event.data.payment_method_details?.bank_transfer ?? null;
    const vaNumberRaw = transfer?.virtual_account?.account_number?.trim() || null;
    const vaNumber = vaNumberRaw && /^\d{10}$/.test(vaNumberRaw) ? vaNumberRaw : null;
    const vaIdRaw = transfer?.virtual_account?.id?.trim() || null;
    const vaId = vaIdRaw && /^va_[A-Za-z0-9_]+$/.test(vaIdRaw) ? vaIdRaw : null;
    const senderAccountNumber = transfer?.sender_account_number?.trim() || null;
    const narration = transfer?.narration?.trim() || null;
    const connectedAccountId = event.account?.startsWith("acct_") ? event.account : null;
    const metaUserIdRaw = event.data.metadata?.funda_user_id;
    const metaUserId = typeof metaUserIdRaw === "string" && uuidPattern.test(metaUserIdRaw) ? metaUserIdRaw : null;
    const isTempVaPurpose = event.data.metadata?.purpose === "temporary_virtual_account";

    // 2a. Wallet checkout / temporary virtual account: credit the wallet directly.
    if (checkout_id) {
      const { data, error } = await admin.rpc("credit_bachs_wallet", {
        p_event_id: event.id,
        p_checkout_id: checkout_id,
        p_charge_id: charge_id,
        p_amount: amount,
        p_currency: currency,
        p_payload: event,
        p_event_type: event.type,
        // SUCCEEDED credits; OVERPAID credits the amount due and holds the extra; ACCEPTED is held.
        p_charge_status: event.data.status ?? null,
        p_overpaid_amount: event.data.overpaid_amount && moneyPattern.test(event.data.overpaid_amount) ? event.data.overpaid_amount : null,
      });
      if (error) return retryLater("Wallet credit failed.");
      const outcome = data?.[0]?.outcome as string | undefined;
      if (outcome && outcome !== "unknown_checkout") return received({ outcome });
      // Not one of our wallet checkouts: continue with deposit matching below.
    }

    const holdForReview = async (reason: ReviewReason, userId: string | null, suggestedUserId: string | null = null) => {
      const { error } = await admin.rpc("hold_payment_for_review", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_user_id: userId,
        p_suggested_user_id: suggestedUserId,
        p_reason: reason,
        p_charge_id: charge_id,
        p_checkout_id: checkout_id ?? null,
        p_amount: amount,
        p_currency: currency,
        p_payload: event,
      });
      if (error) return retryLater("Payment could not be queued for review.");
      return received({ outcome: "held_for_review", reason });
    };

    let matchedUserId: string | null = metaUserId;

    // Match 0: temporary account checkouts (indexed jsonb containment).
    if (!matchedUserId && (checkout_id || vaNumber)) {
      const probes: Array<Record<string, unknown>> = [];
      if (checkout_id) probes.push({ temp_checkout_id: checkout_id }, { temp_history: [{ checkout_id }] });
      if (vaNumber) probes.push({ temp_history: [{ account_number: vaNumber }] });
      for (const probe of probes) {
        const { data } = await admin.from("user_virtual_accounts").select("user_id").contains("metadata", probe).limit(2);
        if (data?.length === 1) {
          matchedUserId = data[0].user_id;
          break;
        }
      }
    }

    // Match 1: the deposit landed on the customer's own connected account.
    if (!matchedUserId && connectedAccountId) {
      const { data } = await admin.from("user_virtual_accounts").select("user_id").eq("bachs_account_id", connectedAccountId).maybeSingle();
      if (data?.user_id) matchedUserId = data.user_id;
    }

    // Match 2: dedicated virtual account id or account number.
    if (!matchedUserId && vaId) {
      const { data } = await admin.from("user_virtual_accounts").select("user_id").eq("account_scope", "connected").eq("virtual_account_id", vaId).limit(2);
      if (data?.length === 1) matchedUserId = data[0].user_id;
    }
    if (!matchedUserId && vaNumber) {
      const { data } = await admin.from("user_virtual_accounts").select("user_id").eq("account_scope", "connected").eq("account_number", vaNumber).limit(2);
      if (data?.length === 1) matchedUserId = data[0].user_id;
    }

    // Match 3: the customer's transfer reference code (FND-XXXXXX) in the narration.
    if (!matchedUserId && narration) {
      const codeMatch = narration.toUpperCase().match(/FND-[A-Z0-9]{6}/);
      if (codeMatch) {
        const { data } = await admin.from("user_virtual_accounts").select("user_id").eq("transfer_reference_code", codeMatch[0]).maybeSingle();
        if (data?.user_id) matchedUserId = data.user_id;
      }
    }

    if (event.type === "collection.underpaid") return holdForReview("underpaid", matchedUserId);

    if (!matchedUserId) {
      // Match 4: a previously seen sender account is only a suggestion. Shared family, business and
      // agent accounts make automatic crediting unsafe, so an operator confirms it.
      let suggestedUserId: string | null = null;
      if (senderAccountNumber) {
        const { data } = await admin.from("user_virtual_accounts").select("user_id").contains("known_sender_accounts", [senderAccountNumber]).limit(2);
        if (data?.length === 1) suggestedUserId = data[0].user_id;
      }
      return holdForReview(suggestedUserId ? "sender_match_unconfirmed" : "unmatched_deposit", null, suggestedUserId);
    }

    let outcome: string;
    try {
      ({ outcome } = await creditUserFromVirtualAccountDeposit({
        eventId: event.id,
        userId: matchedUserId,
        chargeId: charge_id,
        amount,
        currency,
        senderName: transfer?.sender_name ?? null,
        senderBank: transfer?.sender_bank ?? null,
        senderAccountNumber,
        narration,
        payload: event,
      }));
    } catch {
      return retryLater("Virtual account deposit could not be credited.");
    }

    // Money on a connected account is swept back to the platform balance. The sweep is recorded
    // before responding (retried by the job worker on failure) and attempted right after the response.
    if (connectedAccountId && outcome !== "held_for_review") {
      const sweepAmount = event.data.settlement_amount && moneyPattern.test(event.data.settlement_amount) ? event.data.settlement_amount : amount;
      try {
        await recordConnectedAccountSweep({ chargeId: charge_id, accountId: connectedAccountId, amount: sweepAmount });
      } catch {
        return retryLater("Sweep could not be recorded.");
      }
      after(async () => {
        await executeConnectedAccountSweep(charge_id).catch(() => null);
      });
    }

    return received({ outcome });
  }

  // 3. Checkout lifecycle. collection.failed is not final (the checkout stays open for another
  // attempt) and a payment can still complete after expiry; the credit RPC accepts either case.
  if (event.type === "collection.failed" || event.type === "checkout.expired") {
    const { error } = await admin
      .from("payment_webhook_events")
      .upsert({ event_id: event.id, event_type: event.type, payload: event }, { onConflict: "event_id", ignoreDuplicates: true });
    if (error) return retryLater("Event could not be recorded.");
    if (event.type === "checkout.expired" && event.data.checkout_id) {
      await admin
        .from("wallet_funding_transactions")
        .update({ status: "expired", failure_reason: event.type })
        .eq("checkout_id", event.data.checkout_id)
        .eq("status", "pending");
    }
  }
  return received();
}
