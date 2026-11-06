// server-side only payment utilities
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../supabase/admin";

const liveBaseUrl = "https://api.bachs.io";
const sandboxBaseUrl = "https://sandbox-api.bachs.io";
const moneyPattern = /^\d+(\.\d{1,2})?$/;

function credentials() {
  const apiKey = process.env.BACHS_API_KEY?.trim();
  if (!apiKey) throw new Error("BACHS_API_KEY is not configured.");
  if (process.env.NODE_ENV === "production" && !apiKey.startsWith("sk_live_")) {
    throw new Error("Production requires a Bachs live API key.");
  }
  const defaultBaseUrl = apiKey.startsWith("sk_sandbox_") ? sandboxBaseUrl : liveBaseUrl;
  return { apiKey, baseUrl: process.env.BACHS_API_BASE_URL?.trim() || defaultBaseUrl };
}

/** An error whose message is safe and useful to show the customer. */
export class PaymentCustomerError extends Error {}

export function toBachsMoney(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid Bachs amount.");
  return amount.toFixed(2);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type ErrorBody = {
  detail?: string;
  message?: string;
  error_code?: string;
  code?: string;
  details?: Record<string, unknown>;
  error?: string | { message?: string; code?: string; details?: Record<string, unknown> };
  errors?: Array<{ field?: string; message?: string }>;
};

export class BachsApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string | undefined;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(statusCode: number, body: ErrorBody | null, requestId?: string) {
    const nested = body && typeof body.error === "object" ? body.error : undefined;
    const message =
      body?.detail ||
      (typeof body?.error === "string" ? body.error : nested?.message) ||
      body?.message ||
      body?.errors?.find((item) => item.message)?.message ||
      `Bachs request failed (${statusCode}).`;
    super(message);
    this.name = "BachsApiError";
    this.statusCode = statusCode;
    this.errorCode = body?.error_code || body?.code || nested?.code;
    this.details = body?.details || nested?.details;
    this.requestId = requestId;
  }

  /** Bachs will not accept the same request later; retrying is pointless. */
  get definitive() {
    return this.statusCode >= 400 && this.statusCode < 500 && this.statusCode !== 408 && this.statusCode !== 429;
  }
}

async function bachsRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; idempotencyKey?: string; accountId?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const { apiKey, baseUrl } = credentials();
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.accountId) headers["X-Account-Id"] = options.accountId;

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });
  const body = (await response.json().catch(() => null)) as (ErrorBody & { data?: T }) | null;
  if (!response.ok || !body) {
    throw new BachsApiError(response.status, body, response.headers.get("x-request-id") ?? undefined);
  }
  return ("data" in body && body.data !== undefined ? body.data : body) as T;
}

// ---------------------------------------------------------------------------
// Checkout sessions
// ---------------------------------------------------------------------------

export type BachsCheckout = {
  checkout_id: string;
  checkout_url: string;
  status: string;
  expires_at?: string;
  [key: string]: unknown;
};

function cleanPhone(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("234") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  if (raw.startsWith("+") && raw.length >= 10) return raw;
  return undefined;
}

export async function createBachsCheckout(input: {
  amount: string;
  email: string;
  name: string;
  phone?: string | null;
  reference: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
  /** "bank_transfer" restricts the checkout to NGN bank transfer: Bachs then shows a one-time account number. */
  method?: "any" | "bank_transfer";
}) {
  const formattedPhone = cleanPhone(input.phone);
  const checkout = await bachsRequest<BachsCheckout>("/v1/checkout-sessions", {
    idempotencyKey: input.idempotencyKey,
    body: {
      pricing: { currency: "NGN", amount: input.amount },
      customer: {
        email: input.email,
        name: input.name,
        ...(formattedPhone ? { phone_number: formattedPhone } : {}),
      },
      reference: input.reference,
      metadata: { purpose: "wallet_funding", funda_user_id: input.userId },
      ...(input.method === "bank_transfer" ? { payment_method_types: ["NGN_BANK_TRANSFER"] } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_in_minutes: 60,
    },
  });
  if (!checkout?.checkout_id || !checkout.checkout_url) throw new Error("Bachs returned an invalid checkout response.");
  return checkout;
}

export type TemporaryVirtualAccount = {
  checkoutId: string;
  checkoutUrl: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  accountReference?: string | null;
  amount: string;
  currency: string;
  expiresInMinutes: number;
  expiresAt: string;
  reference: string;
};

/**
 * Creates a one-time dynamic NGN Virtual Account using Bachs Bank Transfer.
 * This directly generates and returns the 10-digit bank account number, bank name,
 * and transfer instructions without opening any Bachs checkout overlay.
 */
export async function createTemporaryVirtualAccount(input: {
  amount: string;
  email: string;
  name: string;
  phone?: string | null;
  reference: string;
  idempotencyKey: string;
  userId: string;
}): Promise<TemporaryVirtualAccount> {
  const { baseUrl } = credentials();
  const checkout = await createBachsCheckout({
    amount: input.amount,
    email: input.email,
    name: input.name,
    phone: input.phone,
    reference: input.reference,
    idempotencyKey: input.idempotencyKey,
    successUrl: "https://funda.ng/dashboard?funding=return",
    cancelUrl: "https://funda.ng/dashboard?funding=cancelled",
    userId: input.userId,
    method: "bank_transfer",
  });

  const token = checkout.checkout_url.split("/c/")[1];
  if (!token) {
    throw new Error("Could not parse checkout token from Bachs.");
  }

  // 1. Request Quote for bank transfer
  const quoteRes = await fetch(`${baseUrl}/v1/public/checkouts/${encodeURIComponent(token)}/get-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ payment_method: "NGN_BANK_TRANSFER", currency: "NGN" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const quote = (await quoteRes.json().catch(() => null)) as { quote_id?: string; detail?: string; message?: string } | null;
  if (!quoteRes.ok || !quote?.quote_id) {
    throw new Error(quote?.detail || quote?.message || "Failed to generate bank transfer quote.");
  }

  // 2. Complete checkout to retrieve the active virtual account instructions
  const completeRes = await fetch(`${baseUrl}/v1/public/checkouts/${encodeURIComponent(token)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      payment_method: "NGN_BANK_TRANSFER",
      currency: "NGN",
      quote_id: quote.quote_id,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const complete = (await completeRes.json().catch(() => null)) as {
    instructions?: {
      account_number?: string;
      bank_name?: string;
      account_name?: string;
      account_reference?: string;
      transaction_amount_payable?: string;
      expires_in_minutes?: number;
    };
    detail?: string;
    message?: string;
  } | null;

  const instructions = complete?.instructions;
  if (!completeRes.ok || !instructions?.account_number) {
    throw new Error(complete?.detail || complete?.message || "Failed to retrieve bank transfer account details.");
  }

  const expiresInMinutes = Number(instructions.expires_in_minutes) || 30;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
  const payableAmount = instructions.transaction_amount_payable
    ? Number(instructions.transaction_amount_payable).toFixed(2)
    : input.amount;

  return {
    checkoutId: checkout.checkout_id,
    checkoutUrl: checkout.checkout_url,
    accountNumber: instructions.account_number.trim(),
    bankName: instructions.bank_name?.trim() || "Nombank MFB",
    accountName: instructions.account_name?.trim() || "BACHS/Funda",
    accountReference: instructions.account_reference || null,
    amount: payableAmount,
    currency: "NGN",
    expiresInMinutes,
    expiresAt,
    reference: input.reference,
  };
}

type BachsCheckoutSession = {
  checkout_id: string;
  status: string;
  amount?: string;
  currency?: string;
  payment_status?: string | null;
  charge?: { payment_id?: string; id?: string; status?: string; amount?: string; currency?: string } | null;
};

export function getBachsCheckout(checkoutId: string) {
  return bachsRequest<BachsCheckoutSession>(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
}

/**
 * Recovers wallet checkouts whose webhook never arrived. The credit RPC is
 * idempotent per checkout, so a late webhook after this cannot double-credit.
 */
export async function reconcileBachsCheckout(checkoutId: string) {
  const session = await getBachsCheckout(checkoutId);
  const chargeId = session.charge?.payment_id || session.charge?.id || null;
  const paid =
    session.payment_status === "succeeded" ||
    session.charge?.status === "succeeded" ||
    (session.status === "completed" && Boolean(chargeId));

  const admin = createAdminClient();
  if (paid && chargeId) {
    const amount = session.charge?.amount || session.amount;
    const currency = session.charge?.currency || session.currency || "NGN";
    if (!amount || !moneyPattern.test(amount)) throw new Error("Bachs checkout has no usable amount.");
    const { data, error } = await admin.rpc("credit_bachs_wallet", {
      p_event_id: `reconcile:${checkoutId}`,
      p_checkout_id: checkoutId,
      p_charge_id: chargeId,
      p_amount: amount,
      p_currency: currency,
      p_payload: { source: "reconciliation", session },
      p_event_type: "collection.succeeded",
    });
    if (error) throw new Error("Checkout reconciliation credit failed.");
    return (data?.[0]?.outcome as string | undefined) ?? "unknown";
  }

  if (session.status === "expired") {
    await admin
      .from("wallet_funding_transactions")
      .update({ status: "expired", failure_reason: "checkout.expired (reconciled)" })
      .eq("checkout_id", checkoutId)
      .eq("status", "pending");
    return "expired";
  }
  return "pending";
}

export async function reconcilePendingCheckouts(limit = 50) {
  const admin = createAdminClient();
  const olderThan = new Date(Date.now() - 10 * 60_000).toISOString();
  const newerThan = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
  const { data, error } = await admin
    .from("wallet_funding_transactions")
    .select("checkout_id")
    .eq("status", "pending")
    .not("checkout_id", "is", null)
    .lt("created_at", olderThan)
    .gt("created_at", newerThan)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Pending checkouts could not be loaded.");
  const outcomes: Record<string, number> = {};
  for (const row of data ?? []) {
    try {
      const outcome = await reconcileBachsCheckout(String(row.checkout_id));
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    } catch {
      outcomes.error = (outcomes.error ?? 0) + 1;
    }
  }
  return { checked: data?.length ?? 0, outcomes };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function hmacMatches(secret: string, timestamp: string, rawBody: string, signatures: string[]) {
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((signature) => /^[a-f\d]{64}$/i.test(signature) && timingSafeEqual(expected, Buffer.from(signature, "hex")));
}

/**
 * Verifies X-Bachs-Signature-V2 (`t=…,v1=…[,v1=…]`, any v1 may match during
 * secret rotation) and falls back to the legacy timestamp + signature pair.
 * A malformed V2 header is rejected rather than downgraded.
 */
export function verifyBachsWebhook(rawBody: string, timestamp: string | null, signature: string | null, signatureV2?: string | null) {
  const secret = process.env.BACHS_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  let signedAt: string | undefined;
  let signatures: string[];
  if (signatureV2) {
    const fields = signatureV2.split(",").map((part) => part.trim());
    const timestamps = fields.filter((part) => part.startsWith("t="));
    if (timestamps.length !== 1) return false;
    signedAt = timestamps[0].slice(2);
    signatures = fields.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  } else {
    signedAt = timestamp ?? undefined;
    signatures = signature ? [signature] : [];
  }

  if (!signedAt || !/^\d+$/.test(signedAt) || !signatures.length) return false;
  const sentAt = Number(signedAt);
  if (!Number.isSafeInteger(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 300) return false;
  return hmacMatches(secret, signedAt, rawBody, signatures);
}

// ---------------------------------------------------------------------------
// Virtual accounts
// ---------------------------------------------------------------------------

export type BachsVirtualAccount = {
  id: string;
  account_number: string;
  account_name?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  currency?: string;
  status?: string;
  type?: string | null;
  expires_at?: string | null;
};

type UserVirtualAccountRow = {
  id: string;
  user_id: string;
  account_scope: "connected" | "platform";
  bachs_account_id: string | null;
  virtual_account_id: string | null;
  account_number: string | null;
  account_name: string | null;
  bank_name: string | null;
  bank_code: string | null;
  currency: string;
  status: "pending" | "active" | "inactive" | "failed";
  status_reason: string | null;
  transfer_reference_code: string;
  known_sender_accounts: string[];
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

const virtualAccountColumns =
  "id, user_id, account_scope, bachs_account_id, virtual_account_id, account_number, account_name, bank_name, bank_code, currency, status, status_reason, transfer_reference_code, known_sender_accounts, metadata, updated_at";

function assertVirtualAccount(value: BachsVirtualAccount | null | undefined) {
  if (!value?.id || !/^\d{10}$/.test(String(value.account_number ?? ""))) {
    throw new Error("Bachs returned an invalid virtual account.");
  }
  return value;
}

/** Idempotent: Bachs returns the same permanent account for repeated calls. */
export async function createOrGetBachsVirtualAccount(accountId: string | null, idempotencyKey: string) {
  const account = await bachsRequest<BachsVirtualAccount>("/v1/virtual-accounts", {
    accountId,
    idempotencyKey,
    body: { currency: "NGN" },
  });
  return assertVirtualAccount(account);
}

function newTransferReferenceCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FND-";
  for (let index = 0; index < 6; index += 1) code += alphabet[randomInt(alphabet.length)];
  return code;
}

async function loadOrCreateVirtualAccountRow(userId: string) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("user_virtual_accounts").select(virtualAccountColumns).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Virtual account records are not ready. Apply the latest migration.");
  if (existing) return existing as UserVirtualAccountRow;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error: insertError } = await admin
      .from("user_virtual_accounts")
      .insert({ user_id: userId, transfer_reference_code: newTransferReferenceCode(), status: "pending" })
      .select(virtualAccountColumns)
      .single();
    if (!insertError && data) return data as UserVirtualAccountRow;
    // A concurrent request may have created the row first.
    const { data: raced } = await admin.from("user_virtual_accounts").select(virtualAccountColumns).eq("user_id", userId).maybeSingle();
    if (raced) return raced as UserVirtualAccountRow;
  }
  throw new Error("Could not create a virtual account record.");
}

async function updateVirtualAccountRow(id: string, values: Partial<UserVirtualAccountRow>) {
  const { data, error } = await createAdminClient()
    .from("user_virtual_accounts")
    .update(values)
    .eq("id", id)
    .select(virtualAccountColumns)
    .single();
  if (error || !data) throw new Error("Could not save the virtual account.");
  return data as UserVirtualAccountRow;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || parts[0] || "" };
}

function representativeFor(input: { bvn?: string | null; firstName?: string | null; lastName?: string | null; fullName: string }) {
  const bvn = input.bvn?.replace(/\D/g, "");
  if (bvn && /^\d{11}$/.test(bvn)) {
    const fallback = splitName(input.fullName);
    return {
      source: "customer" as const,
      firstName: input.firstName?.trim() || fallback.firstName,
      lastName: input.lastName?.trim() || fallback.lastName,
      bvn,
    };
  }
  const platformBvn = process.env.BACHS_REPRESENTATIVE_BVN?.replace(/\D/g, "");
  const firstName = process.env.BACHS_REPRESENTATIVE_FIRST_NAME?.trim();
  const lastName = process.env.BACHS_REPRESENTATIVE_LAST_NAME?.trim();
  if (platformBvn && /^\d{11}$/.test(platformBvn) && firstName && lastName) {
    return { source: "platform" as const, firstName, lastName, bvn: platformBvn };
  }
  return null;
}

async function ensureConnectedAccount(row: UserVirtualAccountRow, input: { userId: string; email: string; fullName: string }) {
  if (row.bachs_account_id) return row;
  const account = await bachsRequest<{ id: string }>("/v1/accounts", {
    idempotencyKey: `funda_conn_acct_${input.userId}`,
    body: {
      contact_email: input.email,
      display_name: `Funda - ${input.fullName}`.slice(0, 80),
      country: "NG",
      metadata: { funda_user_id: input.userId },
      configuration: {
        merchant: { capabilities: { virtual_accounts: { requested: true } } },
        recipient: { capabilities: { transfers: { requested: true } } },
      },
    },
  });
  if (!account?.id?.startsWith("acct_")) throw new Error("Bachs returned an invalid connected account.");
  return updateVirtualAccountRow(row.id, { bachs_account_id: account.id });
}

/** The BVN is sent to Bachs only; it is never stored or logged by Funda. */
async function submitRepresentative(row: UserVirtualAccountRow, representative: NonNullable<ReturnType<typeof representativeFor>>) {
  await bachsRequest(`/v1/accounts/${encodeURIComponent(String(row.bachs_account_id))}`, {
    idempotencyKey: `funda_rep_${row.user_id}_${representative.source}`,
    body: {
      first_name: representative.firstName,
      last_name: representative.lastName,
      id_numbers: [{ type: "bvn", value: representative.bvn, issuing_country: "NG" }],
      relationship: { representative: true },
    },
  });
  return updateVirtualAccountRow(row.id, {
    metadata: { ...(row.metadata ?? {}), representative_submitted: true, representative_source: representative.source },
  });
}

function withoutTemporary(metadata: Record<string, unknown> | null) {
  const next = { ...(metadata ?? {}) };
  delete next.is_temporary;
  delete next.temp_checkout_id;
  delete next.temp_expires_at;
  delete next.permanent_account;
  return next;
}

/** Cleans up rows marked temporary by an earlier implementation once their number has expired. */
async function restoreExpiredTemporaryAccount(row: UserVirtualAccountRow) {
  const meta = row.metadata ?? {};
  const expiresAt = typeof meta.temp_expires_at === "string" ? Date.parse(meta.temp_expires_at) : NaN;
  if (!meta.is_temporary || !(expiresAt < Date.now())) return row;
  const permanent = (meta.permanent_account ?? {}) as Partial<UserVirtualAccountRow>;
  return updateVirtualAccountRow(row.id, {
    account_scope: permanent.account_scope ?? row.account_scope,
    virtual_account_id: permanent.virtual_account_id ?? null,
    account_number: permanent.account_number ?? null,
    account_name: permanent.account_name ?? null,
    bank_name: permanent.bank_name ?? null,
    bank_code: permanent.bank_code ?? null,
    status: permanent.account_number ? "active" : "pending",
    metadata: withoutTemporary(row.metadata),
  });
}

export async function provisionOrSyncUserVirtualAccount(input: {
  userId: string;
  email: string;
  fullName: string;
  bvn?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  forceRefresh?: boolean;
}) {
  let row = await restoreExpiredTemporaryAccount(await loadOrCreateVirtualAccountRow(input.userId));

  const hasBvn = Boolean(input.bvn);
  const settled = row.status === "active" && row.account_number && row.account_scope === "connected";
  if (settled && !hasBvn) return row;
  if (row.account_number && !input.forceRefresh && !hasBvn) return row;
  // Throttle provider calls: a recent attempt is reused unless the customer is submitting a BVN.
  const lastAttempt = typeof row.metadata?.last_sync_attempt_at === "string" ? Date.parse(row.metadata.last_sync_attempt_at) : 0;
  if (!hasBvn && Date.now() - lastAttempt < 30_000) return row;
  row = await updateVirtualAccountRow(row.id, { metadata: { ...(row.metadata ?? {}), last_sync_attempt_at: new Date().toISOString() } });

  let connectedReason: string | null = null;
  try {
    row = await ensureConnectedAccount(row, input);
    const representative = representativeFor(input);
    const submitted = row.metadata?.representative_submitted === true;
    const upgradingToCustomerBvn = representative?.source === "customer" && row.metadata?.representative_source !== "customer";
    if (representative && (!submitted || upgradingToCustomerBvn)) {
      row = await submitRepresentative(row, representative);
    }
    if (!representative && !submitted) {
      connectedReason = "Add your BVN to activate a dedicated account number.";
    } else {
      const account = await createOrGetBachsVirtualAccount(row.bachs_account_id, `funda_conn_va_${input.userId}`);
      const details = {
        account_scope: "connected" as const,
        virtual_account_id: account.id,
        account_number: account.account_number,
        account_name: account.account_name ?? null,
        bank_name: account.bank_name ?? null,
        bank_code: account.bank_code ?? null,
      };
      return updateVirtualAccountRow(row.id, { ...details, status: "active", status_reason: null, metadata: withoutTemporary(row.metadata) });
    }
  } catch (error) {
    // Capability still activating (live mode) or Connect not enabled: fall back to the platform account below.
    connectedReason = error instanceof BachsApiError ? "Your dedicated account is being activated." : "Dedicated account is temporarily unavailable.";
  }

  if (row.account_number && row.account_scope === "platform") {
    return updateVirtualAccountRow(row.id, { status_reason: `${connectedReason ?? ""} Include ${row.transfer_reference_code} in your transfer narration.`.trim() });
  }
  const platform = await createOrGetBachsVirtualAccount(null, "funda_platform_va");
  return updateVirtualAccountRow(row.id, {
    account_scope: "platform",
    virtual_account_id: platform.id,
    account_number: platform.account_number,
    account_name: platform.account_name ?? null,
    bank_name: platform.bank_name ?? null,
    bank_code: platform.bank_code ?? null,
    status: "active",
    status_reason: `${connectedReason ?? ""} Include ${row.transfer_reference_code} in your transfer narration.`.trim(),
  });
}

/** Called when Bachs reports the virtual_accounts capability active for a connected account. */
export async function activateConnectedVirtualAccount(accountId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("user_virtual_accounts").select(virtualAccountColumns).eq("bachs_account_id", accountId).maybeSingle();
  if (error) throw new Error("Virtual account lookup failed.");
  if (!data) return null;
  const row = data as UserVirtualAccountRow;
  const account = await createOrGetBachsVirtualAccount(accountId, `funda_conn_va_${row.user_id}`);
  const details = {
    account_scope: "connected" as const,
    virtual_account_id: account.id,
    account_number: account.account_number,
    account_name: account.account_name ?? null,
    bank_name: account.bank_name ?? null,
    bank_code: account.bank_code ?? null,
  };
  return updateVirtualAccountRow(row.id, { ...details, status: "active", status_reason: null, metadata: withoutTemporary(row.metadata) });
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export type DepositOutcome = "credited" | "duplicate" | "held_for_review";

export async function creditUserFromVirtualAccountDeposit(input: {
  eventId: string;
  userId: string;
  chargeId: string;
  amount: string;
  currency: string;
  senderName: string | null;
  senderBank: string | null;
  senderAccountNumber: string | null;
  narration: string | null;
  payload: unknown;
}) {
  const { data, error } = await createAdminClient().rpc("credit_bachs_virtual_account_deposit", {
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_charge_id: input.chargeId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_sender_name: input.senderName,
    p_sender_bank: input.senderBank,
    p_sender_account_number: input.senderAccountNumber,
    p_narration: input.narration,
    p_payload: input.payload,
  });
  if (error || !data?.[0]) throw new Error("Virtual account deposit could not be credited.");
  return { outcome: data[0].outcome as DepositOutcome, balance: Number(data[0].balance) };
}

// ---------------------------------------------------------------------------
// Connected account sweeps
// ---------------------------------------------------------------------------

const maxSweepAttempts = 8;

/** Persists the sweep before any network call so failures are always visible and retried. */
export async function recordConnectedAccountSweep(input: { chargeId: string; accountId: string; amount: string }) {
  if (!moneyPattern.test(input.amount) || Number(input.amount) <= 0) return;
  const { error } = await createAdminClient()
    .from("connected_account_sweeps")
    .upsert(
      { charge_id: input.chargeId, account_id: input.accountId, amount: input.amount, currency: "NGN" },
      { onConflict: "charge_id", ignoreDuplicates: true },
    );
  if (error) throw new Error("Connected account sweep could not be recorded.");
}

export async function executeConnectedAccountSweep(chargeId: string) {
  const admin = createAdminClient();
  const { data: sweep } = await admin
    .from("connected_account_sweeps")
    .select("id, charge_id, account_id, amount, status, attempts")
    .eq("charge_id", chargeId)
    .maybeSingle();
  if (!sweep || sweep.status !== "pending") return sweep?.status ?? "missing";

  try {
    const transfer = await bachsRequest<{ id?: string }>("/v1/transfers", {
      accountId: sweep.account_id,
      idempotencyKey: `funda_sweep_${sweep.charge_id}`,
      body: { destination: "self", currency: "NGN", amount: toBachsMoney(sweep.amount) },
    });
    await admin
      .from("connected_account_sweeps")
      .update({ status: "succeeded", transfer_id: transfer?.id ?? null, attempts: sweep.attempts + 1, last_error: null, completed_at: new Date().toISOString() })
      .eq("id", sweep.id);
    return "succeeded";
  } catch (error) {
    const attempts = sweep.attempts + 1;
    const definitive = error instanceof BachsApiError && error.definitive;
    await admin
      .from("connected_account_sweeps")
      .update({
        status: definitive || attempts >= maxSweepAttempts ? "failed" : "pending",
        attempts,
        last_error: (error instanceof Error ? error.message : "Sweep failed.").slice(0, 500),
      })
      .eq("id", sweep.id);
    return "error";
  }
}

export async function sweepPendingConnectedAccounts(limit = 50) {
  const { data, error } = await createAdminClient()
    .from("connected_account_sweeps")
    .select("charge_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Pending sweeps could not be loaded.");
  const outcomes: Record<string, number> = {};
  for (const row of data ?? []) {
    const outcome = await executeConnectedAccountSweep(String(row.charge_id));
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { checked: data?.length ?? 0, outcomes };
}
