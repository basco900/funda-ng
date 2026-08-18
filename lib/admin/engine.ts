import "server-only";

import { createAdminClient } from "../supabase/admin";

export type PurchasePolicyDecision = {
  allowed: boolean;
  code: string;
  reason: string;
  limits: { perTransaction: number | null; dailyValue: number | null; dailyCount: number | null };
  usage: { dailyValue: number; dailyCount: number };
};

export async function evaluateCustomerPurchasePolicy(userId: string, serviceType: string, amount: number): Promise<PurchasePolicyDecision> {
  const deny = (code: string, reason: string): PurchasePolicyDecision => ({ allowed: false, code, reason, limits: { perTransaction: null, dailyValue: null, dailyCount: null }, usage: { dailyValue: 0, dailyCount: 0 } });
  if (!Number.isFinite(amount) || amount <= 0) return deny("INVALID_AMOUNT", "Transaction amount is invalid.");

  const client = createAdminClient();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [controlsResult, kycResult, overrideResult, usageResult] = await Promise.all([
    client.from("customer_account_controls").select("account_status,wallet_status,risk_level").eq("user_id", userId).maybeSingle(),
    client.from("kyc_reviews").select("tier").eq("user_id", userId).eq("status", "approved").order("tier", { ascending: false }).limit(1).maybeSingle(),
    client.from("customer_limit_overrides").select("per_transaction_limit,daily_value_limit,daily_count_limit").eq("user_id", userId).or(`service_type.eq.${serviceType},service_type.is.null`).or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("service_transactions").select("amount").eq("user_id", userId).in("status", ["initiated", "processing", "pending", "successful"]).gte("created_at", dayStart.toISOString()).limit(5000),
  ]);
  if (controlsResult.error || kycResult.error || overrideResult.error || usageResult.error) return deny("POLICY_UNAVAILABLE", "Purchase policy could not be verified.");

  const controls = controlsResult.data;
  if (controls && controls.account_status !== "active") return deny("ACCOUNT_RESTRICTED", "This account is not available for purchases.");
  if (controls && ["frozen", "debits_blocked"].includes(controls.wallet_status)) return deny("WALLET_RESTRICTED", "Wallet debits are currently restricted.");

  const tier = Number(kycResult.data?.tier ?? 0);
  const { data: rule, error: ruleError } = await client.from("account_limit_rules").select("per_transaction_limit,daily_value_limit,daily_count_limit").eq("kyc_tier", tier).eq("enabled", true).or(`service_type.eq.${serviceType},service_type.is.null`).order("service_type", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (ruleError || !rule) return deny("LIMITS_UNAVAILABLE", "Account limits are not configured.");

  const override = overrideResult.data;
  const limits = {
    perTransaction: Number(override?.per_transaction_limit ?? rule.per_transaction_limit) || null,
    dailyValue: Number(override?.daily_value_limit ?? rule.daily_value_limit) || null,
    dailyCount: Number(override?.daily_count_limit ?? rule.daily_count_limit) || null,
  };
  const usage = { dailyValue: (usageResult.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0), dailyCount: usageResult.data?.length ?? 0 };
  const decision = { limits, usage };
  if (limits.perTransaction !== null && amount > limits.perTransaction) return { allowed: false, code: "PER_TRANSACTION_LIMIT", reason: "This purchase exceeds the account’s per-transaction limit.", ...decision };
  if (limits.dailyValue !== null && usage.dailyValue + amount > limits.dailyValue) return { allowed: false, code: "DAILY_VALUE_LIMIT", reason: "This purchase would exceed the account’s daily limit.", ...decision };
  if (limits.dailyCount !== null && usage.dailyCount + 1 > limits.dailyCount) return { allowed: false, code: "DAILY_COUNT_LIMIT", reason: "This account has reached its daily transaction count.", ...decision };
  return { allowed: true, code: "ALLOWED", reason: "Purchase passes account and wallet controls.", ...decision };
}

export type ProviderRoute = { ruleId: string; providerId: string; provider: string; slug: string; priority: number };

export async function selectProviderRoute(serviceType: string, network?: string | null, productId?: string | null): Promise<ProviderRoute | null> {
  const client = createAdminClient();
  let query = client.from("provider_routing_rules").select("id,provider_id,priority,minimum_success_rate,maximum_latency_ms,minimum_balance,network,product_id").eq("service_type", serviceType).eq("enabled", true).order("priority", { ascending: true }).limit(50);
  if (network) query = query.or(`network.eq.${network},network.is.null`);
  else query = query.is("network", null);
  const { data: rules, error } = await query;
  if (error || !rules?.length) return null;

  const providerIds = [...new Set(rules.map((rule) => rule.provider_id))];
  const { data: providers } = await client.from("provider_registry").select("id,name,slug,status").in("id", providerIds).in("status", ["operational", "degraded"]);
  const providerMap = new Map((providers ?? []).map((provider) => [provider.id, provider]));

  for (const rule of rules) {
    if (rule.product_id && rule.product_id !== productId) continue;
    const provider = providerMap.get(rule.provider_id);
    if (!provider) continue;
    const [{ data: health }, { data: balance }] = await Promise.all([
      client.from("provider_health_checks").select("status,latency_ms,success_rate").eq("provider_id", rule.provider_id).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("provider_balances").select("balance").eq("provider_id", rule.provider_id).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (health?.status === "down") continue;
    if (health?.success_rate !== null && health?.success_rate !== undefined && Number(health.success_rate) < Number(rule.minimum_success_rate)) continue;
    if (rule.maximum_latency_ms && health?.latency_ms && health.latency_ms > rule.maximum_latency_ms) continue;
    if (rule.minimum_balance && balance && Number(balance.balance) < Number(rule.minimum_balance)) continue;
    return { ruleId: rule.id, providerId: provider.id, provider: provider.name, slug: provider.slug, priority: rule.priority };
  }
  return null;
}

export async function calculateProductPrice(productId: string, customerSegment = "standard") {
  const client = createAdminClient();
  const { data: product, error } = await client.from("service_products").select("id,provider_cost,selling_price,cashback_amount,status,service_type").eq("id", productId).single();
  if (error || !product || product.status !== "active") return null;
  const now = new Date().toISOString();
  const { data: rules } = await client.from("pricing_rules").select("rule_type,value,minimum_amount,maximum_amount,priority").eq("enabled", true).or(`product_id.eq.${productId},service_type.eq.${product.service_type}`).or(`customer_segment.eq.${customerSegment},customer_segment.is.null`).or(`starts_at.lte.${now},starts_at.is.null`).or(`ends_at.gt.${now},ends_at.is.null`).order("priority", { ascending: true });
  let price = Number(product.selling_price);
  for (const rule of rules ?? []) {
    if (rule.minimum_amount !== null && price < Number(rule.minimum_amount)) continue;
    if (rule.maximum_amount !== null && price > Number(rule.maximum_amount)) continue;
    const value = Number(rule.value);
    if (rule.rule_type === "fixed_markup") price += value;
    if (rule.rule_type === "percentage_markup") price *= 1 + value / 100;
    if (rule.rule_type === "fixed_discount") price -= value;
    if (rule.rule_type === "percentage_discount") price *= 1 - value / 100;
    if (rule.rule_type === "override_price") price = value;
    break;
  }
  const finalPrice = Math.max(0, Math.round(price * 100) / 100);
  return { productId, providerCost: Number(product.provider_cost), basePrice: Number(product.selling_price), price: finalPrice, cashback: Number(product.cashback_amount), margin: finalPrice - Number(product.provider_cost) - Number(product.cashback_amount) };
}
