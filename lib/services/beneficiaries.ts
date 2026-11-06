import "server-only";

import { createAdminClient } from "../supabase/admin";

export type BeneficiaryItem = {
  id: string;
  serviceType: "airtime" | "data" | "electricity" | "cable_tv" | "internet" | "education";
  recipient: string;
  label: string | null;
  networkOrDisco: string;
  meterType?: "prepaid" | "postpaid" | null;
  lastUsedAt: string;
};

/**
 * Loads recent beneficiaries for a user, optionally filtered by service type
 */
export async function listUserBeneficiaries(
  userId: string,
  serviceType?: string,
  limit = 12,
): Promise<BeneficiaryItem[]> {
  const client = createAdminClient();
  let query = client
    .from("user_service_beneficiaries")
    .select("id, service_type, recipient, label, network_or_disco, meter_type, last_used_at")
    .eq("user_id", userId)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (serviceType) {
    query = query.eq("service_type", serviceType);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    serviceType: row.service_type as BeneficiaryItem["serviceType"],
    recipient: row.recipient,
    label: row.label,
    networkOrDisco: row.network_or_disco,
    meterType: row.meter_type as BeneficiaryItem["meterType"],
    lastUsedAt: row.last_used_at,
  }));
}

/**
 * Upserts a beneficiary when a customer completes a purchase
 */
export async function recordServiceBeneficiary(params: {
  userId: string;
  serviceType: "airtime" | "data" | "electricity" | "cable_tv" | "internet" | "education";
  recipient: string;
  networkOrDisco: string;
  label?: string | null;
  meterType?: "prepaid" | "postpaid" | null;
}): Promise<void> {
  const client = createAdminClient();
  const cleanRecipient = params.recipient.trim();
  if (!cleanRecipient || cleanRecipient.length < 8) return;

  try {
    await client
      .from("user_service_beneficiaries")
      .upsert(
        {
          user_id: params.userId,
          service_type: params.serviceType,
          recipient: cleanRecipient,
          network_or_disco: params.networkOrDisco.toLowerCase(),
          label: params.label?.trim() || null,
          meter_type: params.meterType || null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "user_id,service_type,recipient" },
      );
  } catch (err: unknown) {
    console.warn("Beneficiary upsert error:", err instanceof Error ? err.message : err);
  }
}

/**
 * Deletes a saved beneficiary
 */
export async function removeServiceBeneficiary(userId: string, beneficiaryId: string): Promise<boolean> {
  const client = createAdminClient();
  const { error } = await client
    .from("user_service_beneficiaries")
    .delete()
    .eq("id", beneficiaryId)
    .eq("user_id", userId);

  return !error;
}
