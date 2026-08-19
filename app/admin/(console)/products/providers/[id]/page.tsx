import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../../../lib/admin/auth";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import styles from "../../../../admin.module.css";

type ProviderProduct = { name: string; network: string | null; selling_price: number | null };

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("providers.manage");
  const { id } = await params;
  const client = createAdminClient();

  const [{ data: provider }, { data: offers }, { count: catalogCount }] = await Promise.all([
    client
      .from("provider_registry")
      .select(
        "id,name,slug,status,capabilities,priority,environment,api_base_url,catalogue_endpoint,purchase_endpoint,requery_endpoint,balance_endpoint,api_secret_reference,webhook_secret_reference,documentation_url,website_url,support_email,support_phone,notes,last_catalogue_sync_at,last_health_check_at,created_at,updated_at",
      )
      .eq("id", id)
      .maybeSingle(),
    client
      .from("product_provider_offers")
      .select("id,status,priority,product:service_products(name,network,selling_price)")
      .eq("provider_id", id)
      .order("priority")
      .limit(30),
    client
      .from("provider_catalogue_items")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", id),
  ]);

  if (!provider) notFound();

  const endpointRows = [
    ["Base URL", provider.api_base_url],
    ["Catalogue", provider.catalogue_endpoint],
    ["Purchase", provider.purchase_endpoint],
    ["Transaction requery", provider.requery_endpoint],
    ["Balance", provider.balance_endpoint],
  ];
  const capabilities = Array.isArray(provider.capabilities)
    ? provider.capabilities.filter((capability): capability is string => typeof capability === "string")
    : [];

  return (
    <div className={styles.workspacePage}>
      <Link className={styles.backLink} href="/admin/products/providers">
        ← All providers
      </Link>

      <section className={styles.detailHero}>
        <div>
          <span className={styles.pageEyebrow}>Provider profile</span>
          <h1>{provider.name}</h1>
          <p>
            {provider.slug} · {provider.environment} environment · priority {provider.priority}
          </p>
        </div>
        <div className={styles.detailPills}>
          <span>{provider.status}</span>
          {capabilities.map((capability) => (
            <span key={capability}>{capability}</span>
          ))}
        </div>
      </section>

      <section className={styles.workspaceMetrics}>
        <article>
          <span>Imported catalogue</span>
          <strong>{catalogCount ?? 0}</strong>
          <small>Raw supplier offers in Funda</small>
        </article>
        <article>
          <span>Mapped products</span>
          <strong>{offers?.length ?? 0}</strong>
          <small>Customer products linked to this provider</small>
        </article>
        <article>
          <span>Secret reference</span>
          <strong>{provider.api_secret_reference || "—"}</strong>
          <small>Reference only; the value remains in Coolify</small>
        </article>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.workspacePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Integration</span>
              <h2>Connection details</h2>
            </div>
          </div>
          <div className={styles.detailList}>
            {endpointRows.map(([label, value]) => (
              <div key={label}>
                <span>
                  <strong>{label}</strong>
                  <small>{value || "Not configured"}</small>
                </span>
                <em>{value ? "ready" : "pending"}</em>
              </div>
            ))}
            <div>
              <span>
                <strong>Documentation</strong>
                <small>{provider.documentation_url || "Not linked"}</small>
              </span>
              {provider.documentation_url ? (
                <a href={provider.documentation_url} target="_blank" rel="noreferrer">
                  Open ↗
                </a>
              ) : (
                <em>pending</em>
              )}
            </div>
            <div>
              <span>
                <strong>Website</strong>
                <small>{provider.website_url || "Not linked"}</small>
              </span>
              {provider.website_url ? (
                <a href={provider.website_url} target="_blank" rel="noreferrer">
                  Open ↗
                </a>
              ) : (
                <em>pending</em>
              )}
            </div>
          </div>
        </article>

        <article className={styles.workspacePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Operations</span>
              <h2>Support & notes</h2>
            </div>
          </div>
          <div className={styles.detailList}>
            <div>
              <span>
                <strong>Support email</strong>
                <small>{provider.support_email || "Not configured"}</small>
              </span>
            </div>
            <div>
              <span>
                <strong>Support phone</strong>
                <small>{provider.support_phone || "Not configured"}</small>
              </span>
            </div>
            <div>
              <span>
                <strong>Last catalogue sync</strong>
                <small>
                  {provider.last_catalogue_sync_at
                    ? new Date(provider.last_catalogue_sync_at).toLocaleString("en-NG")
                    : "Not synced yet"}
                </small>
              </span>
            </div>
            <div>
              <span>
                <strong>Integration notes</strong>
                <small>{provider.notes || "No notes yet"}</small>
              </span>
            </div>
          </div>
        </article>

        <article className={styles.workspacePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Catalogue mappings</span>
              <h2>Funda products using {provider.name}</h2>
            </div>
          </div>
          <div className={styles.detailList}>
            {offers?.length ? (
              offers.map((offer) => {
                const relation = offer.product as ProviderProduct | ProviderProduct[] | null;
                const product = Array.isArray(relation) ? relation[0] : relation;
                return (
                  <div key={offer.id}>
                    <span>
                      <strong>{product?.name || "Unknown product"}</strong>
                      <small>
                        {product?.network?.toUpperCase() || "DATA"} · ₦
                        {Number(product?.selling_price ?? 0).toLocaleString("en-NG")}
                      </small>
                    </span>
                    <em>
                      {offer.status} · #{offer.priority}
                    </em>
                  </div>
                );
              })
            ) : (
              <p className={styles.detailEmpty}>
                No Funda products are mapped yet. Create your bundle, then select an imported offer from this provider.
              </p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
