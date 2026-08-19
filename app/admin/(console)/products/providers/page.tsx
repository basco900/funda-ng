import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import ProviderWorkspace from "./provider-workspace";

export default async function ProvidersPage() {
  await requireAdminPermission("providers.manage");
  const client = createAdminClient();
  const { data: providers } = await client.from("provider_registry").select("id,name,slug,status,capabilities,priority,environment,api_base_url,catalogue_endpoint,purchase_endpoint,requery_endpoint,balance_endpoint,api_secret_reference,webhook_secret_reference,documentation_url,website_url,support_email,support_phone,notes,last_catalogue_sync_at").order("priority");
  const { data: catalogue } = await client.from("provider_catalogue_items").select("id,provider_id,network_slug,provider_name,provider_cost,is_available").eq("service_type", "data");
  return <ProviderWorkspace providers={providers ?? []} catalogue={catalogue ?? []} />;
}
