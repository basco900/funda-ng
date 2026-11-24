import { redirect } from "next/navigation";
import SupabaseRuntimeConfig from "../../components/supabase-runtime-config";
import { onboardingStepFor, profileNameFor } from "../../lib/auth/onboarding";
import { getSupabaseConfig } from "../../lib/supabase/config";
import { createAdminClient } from "../../lib/supabase/admin";
import { createClient } from "../../lib/supabase/server";
import { decryptPins } from "../../lib/security/pin-vault";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard · Funda",
  description: "Your Funda wallet, everyday services, and recent activity in one pro iOS space.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 28 * 60_000).toISOString();

  const [
    { data: profile },
    { data: settings },
    { data: wallet },
    { data: transactionsData },
    { data: fundingEntriesData },
    { data: virtualAccountData },
    { data: notificationsData },
    { data: latestPendingFunding },
    { data: cashbackEarned },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, display_name, date_of_birth, country_code, state, city, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_settings")
      .select("email_notifications, sms_notifications, push_notifications, marketing_notifications, transaction_alerts, security_alerts, preferred_language, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("available_balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("service_transactions")
      .select("id, internal_reference, service_type, destination, amount, discount_amount, cashback_amount, status, metadata, created_at, provider_reference")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("wallet_ledger_entries")
      .select("id, entry_type, amount, reference, description, metadata, created_at")
      .eq("user_id", user.id)
      .eq("entry_type", "credit")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("user_virtual_accounts")
      .select("id, account_scope, bachs_account_id, virtual_account_id, account_number, account_name, bank_name, bank_code, currency, status, status_reason, transfer_reference_code, known_sender_accounts, metadata")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("user_notifications")
      .select("id, title, body, kind, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(35),
    admin
      .from("wallet_funding_transactions")
      .select("id, checkout_id, amount, currency, status, provider_payload, merchant_reference, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.rpc("customer_cashback_total", { p_user_id: user.id }),
  ]);

  const formatTxTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    const dateStr = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
    const timeStr = d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true });
    return { dateStr, timeStr, ts: d.getTime() };
  };

  const serviceTxs = (transactionsData || []).map((tx) => {
    const { dateStr, timeStr, ts } = formatTxTime(tx.created_at);
    const metaObj = (tx.metadata as {
      productName?: string;
      listPrice?: number;
      discountAmount?: number;
      couponCode?: string;
      pins?: Array<{ pin: string; serial?: string; amount: number; network: string; dialCode: string }>;
      pins_encrypted?: string;
      mode?: "vtu" | "epin";
      quantity?: number;
      unitAmount?: number;
      faceValue?: number;
      deliveryStatus?: string;
      pinCount?: number;
    } | null) || null;

    return {
      _ts: ts,
      item: {
        id: tx.id,
        title: metaObj?.productName || `${tx.service_type?.toUpperCase()} Purchase`,
        category: (tx.service_type || "data") as "data" | "electricity" | "airtime" | "tv" | "funding" | "internet",
        type: "debit" as const,
        amount: Number(tx.amount || 0),
        originalAmount: typeof metaObj?.listPrice === "number" ? metaObj.listPrice : undefined,
        discountAmount: typeof metaObj?.discountAmount === "number" ? metaObj.discountAmount : undefined,
        couponCode: metaObj?.couponCode || undefined,
        date: dateStr,
        time: timeStr,
        status: tx.status === "successful" ? "completed" as const : ["failed", "refunded", "reversed", "cancelled"].includes(tx.status) ? "failed" as const : "processing" as const,
        meta: tx.destination || "",
        reference: tx.internal_reference,
        createdAt: tx.created_at,
        providerReference: tx.provider_reference || undefined,
        cashback: tx.status === "successful" && tx.cashback_amount > 0 ? `+₦${tx.cashback_amount} cashback` : undefined,
        // Legacy rows stored plaintext PINs; new rows keep them encrypted at rest.
        pins: metaObj?.mode === "epin" ? undefined : decryptPins(metaObj?.pins_encrypted) ?? metaObj?.pins,
        ...(metaObj?.mode === "epin" ? { mode: "epin" as const, quantity: metaObj.quantity, unitAmount: metaObj.unitAmount, faceValue: metaObj.faceValue, originalAmount: metaObj.faceValue, discountAmount: Number(tx.discount_amount), deliveryStatus: metaObj.deliveryStatus, pinCount: metaObj.pinCount } : {}),
      },
    };
  });

  const creditTxs = (fundingEntriesData || []).map((entry) => {
    const { dateStr, timeStr, ts } = formatTxTime(entry.created_at);
    const metaObj = (entry.metadata as {
      sender_name?: string;
      sender_bank?: string;
      sender_account_number?: string;
      narration?: string;
      channel?: string;
    } | null) || null;
    const isVa = metaObj?.channel === "virtual_account";
    return {
      _ts: ts,
      item: {
        id: entry.id,
        title: entry.description || (isVa ? "Virtual Account Deposit" : "Wallet Funding"),
        category: "funding" as const,
        type: "credit" as const,
        amount: Number(entry.amount || 0),
        date: dateStr,
        time: timeStr,
        status: "completed" as const,
        meta: metaObj?.sender_bank
          ? `${metaObj.sender_bank}${metaObj.sender_name ? ` • ${metaObj.sender_name}` : ""}`
          : isVa
          ? "Bank Transfer (Virtual Account)"
          : "Bachs Checkout",
        reference: entry.reference,
        createdAt: entry.created_at,
        channel: metaObj?.channel,
        senderName: metaObj?.sender_name || undefined,
        senderBank: metaObj?.sender_bank || undefined,
        senderAccount: metaObj?.sender_account_number || undefined,
        narration: metaObj?.narration || undefined,
      },
    };
  });

  const initialTransactions = [...serviceTxs, ...creditTxs]
    .sort((a, b) => b._ts - a._ts)
    .slice(0, 45)
    .map((entry) => entry.item);

  const fullName = profileNameFor(user, profile?.full_name) || "Funda friend";
  const firstName = fullName.split(/\s+/)[0];
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const pendingPayload = (latestPendingFunding?.provider_payload ?? {}) as {
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

  const initialTemporaryAccount =
    latestPendingFunding &&
    (pendingPayload.accountNumber || pendingPayload.instructions?.account_number)
      ? {
          checkoutId: latestPendingFunding.checkout_id,
          accountNumber: (
            pendingPayload.accountNumber ||
            pendingPayload.instructions?.account_number ||
            ""
          ).trim(),
          bankName:
            pendingPayload.bankName ||
            pendingPayload.instructions?.bank_name ||
            "Nombank MFB",
          accountName:
            pendingPayload.accountName ||
            pendingPayload.instructions?.account_name?.trim() ||
            "BACHS/Funda",
          amount: String(latestPendingFunding.amount),
          currency: latestPendingFunding.currency,
          expiresAt:
            pendingPayload.expiresAt ||
            new Date(
              Date.parse(latestPendingFunding.created_at) + 30 * 60_000,
            ).toISOString(),
          reference: latestPendingFunding.merchant_reference,
        }
      : null;

  const supabaseConfig = getSupabaseConfig();

  return (
    <>
      <SupabaseRuntimeConfig url={supabaseConfig.url} publishableKey={supabaseConfig.publishableKey} />
      <DashboardClient
        user={{
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName,
        displayName: profile?.display_name,
        firstName,
        initials,
        dateOfBirth: profile?.date_of_birth,
        countryCode: profile?.country_code || "NG",
        state: profile?.state,
        city: profile?.city,
        createdAt: profile?.created_at || user.created_at,
        lastSignInAt: user.last_sign_in_at,
        emailConfirmed: Boolean(user.email_confirmed_at),
        phoneConfirmed: Boolean(user.phone_confirmed_at),
      }}
      settings={{
        emailNotifications: settings?.email_notifications ?? true,
        smsNotifications: settings?.sms_notifications ?? true,
        pushNotifications: settings?.push_notifications ?? true,
        marketingNotifications: settings?.marketing_notifications ?? false,
        transactionAlerts: settings?.transaction_alerts ?? true,
        securityAlerts: settings?.security_alerts ?? true,
        preferredLanguage: "en",
        timezone: settings?.timezone || "Africa/Lagos",
      }}
      initialWalletBalance={Number(wallet?.available_balance ?? 0)}
      initialCashbackEarned={Number(cashbackEarned ?? 0)}
      initialTransactions={initialTransactions}
      initialNotifications={notificationsData ?? []}
        initialVirtualAccount={virtualAccountData ?? null}
        initialTemporaryAccount={initialTemporaryAccount}
      />
    </>
  );
}
