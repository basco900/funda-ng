"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { saveProvider } from "../../actions";
import AdminIcon from "../../admin-icon";
import AdminSelect from "../../admin-select";
import styles from "../../../admin.module.css";

type Provider = {
  id: string;
  name: string;
  slug: string;
  status: "operational" | "degraded" | "down" | "maintenance" | "standby";
  capabilities: string[];
  priority: number;
  environment: "sandbox" | "live";
  api_base_url: string | null;
  catalogue_endpoint: string | null;
  purchase_endpoint: string | null;
  requery_endpoint: string | null;
  balance_endpoint: string | null;
  api_secret_reference: string | null;
  webhook_secret_reference: string | null;
  documentation_url: string | null;
  website_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  notes: string | null;
  last_catalogue_sync_at: string | null;
};
type CatalogueItem = {
  id: string;
  provider_id: string;
  network_slug: string | null;
  provider_name: string;
  provider_cost: number;
  is_available: boolean;
};
const blank: Omit<Provider, "id"> = {
  name: "",
  slug: "",
  status: "standby",
  capabilities: ["data"],
  priority: 100,
  environment: "sandbox",
  api_base_url: null,
  catalogue_endpoint: null,
  purchase_endpoint: null,
  requery_endpoint: null,
  balance_endpoint: null,
  api_secret_reference: null,
  webhook_secret_reference: null,
  documentation_url: null,
  website_url: null,
  support_email: null,
  support_phone: null,
  notes: null,
  last_catalogue_sync_at: null,
};

export default function ProviderWorkspace({
  providers,
  catalogue,
}: {
  providers: Provider[];
  catalogue: CatalogueItem[];
}) {
  const [editing, setEditing] = useState<Provider | Omit<Provider, "id"> | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const counts = useMemo(
    () => new Map(providers.map((provider) => [provider.id, catalogue.filter((item) => item.provider_id === provider.id).length])),
    [providers, catalogue]
  );

  function submit(form: HTMLFormElement) {
    const formData = new FormData(form);
    const values = {
      ...("id" in (editing ?? {}) ? { id: (editing as Provider).id } : {}),
      name: String(formData.get("name")),
      slug: String(formData.get("slug")).toLowerCase().replace(/\s+/g, "-"),
      status: String(formData.get("status")),
      priority: Number(formData.get("priority")),
      environment: String(formData.get("environment")),
      capabilities: formData.getAll("capabilities").map(String),
      apiBaseUrl: String(formData.get("apiBaseUrl")) || null,
      catalogueEndpoint: String(formData.get("catalogueEndpoint")) || null,
      purchaseEndpoint: String(formData.get("purchaseEndpoint")) || null,
      requeryEndpoint: String(formData.get("requeryEndpoint")) || null,
      balanceEndpoint: String(formData.get("balanceEndpoint")) || null,
      apiSecretReference: String(formData.get("apiSecretReference")) || null,
      webhookSecretReference: String(formData.get("webhookSecretReference")) || null,
      documentationUrl: String(formData.get("documentationUrl")) || null,
      websiteUrl: String(formData.get("websiteUrl")) || null,
      supportEmail: String(formData.get("supportEmail")) || null,
      supportPhone: String(formData.get("supportPhone")) || null,
      notes: String(formData.get("notes")) || null,
    };
    startTransition(async () => {
      const result = await saveProvider(values);
      setNotice(result.message);
      if (result.ok) setEditing(null);
    });
  }

  return (
    <div className={styles.productWorkspace}>
      <header className={styles.pageHeading}>
        <div>
          <span className={styles.pageEyebrow}>PRODUCTS / SUPPLY</span>
          <h1>Providers</h1>
          <p>Connect suppliers safely, then review their raw catalogue before a plan reaches customers.</p>
        </div>
        <div className={styles.pageHeadingActions}>
          <button className={styles.primaryButton} onClick={() => setEditing(blank)}>
            <AdminIcon name="plug" />
            <span>Add Provider</span>
          </button>
        </div>
      </header>

      {notice && <p className={styles.productNotice}>{notice}</p>}

      {/* Unified Provider Master Table */}
      <section className={`${styles.workspacePanel} ${styles.providerRegistry}`}>
        <div className={styles.workspaceToolbar}>
          <div className={styles.sectionHeadingRow}>
            <h2>Connected Suppliers</h2>
          </div>
          <span className={styles.countPill}>{providers.length} registered</span>
        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Supplied Products</th>
                <th>Raw Offers</th>
                <th data-align="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.length ? (
                providers.map((provider) => (
                  <tr key={provider.id}>
                    <td>
                      <div className={styles.tableEntity}>
                        <span className={styles.providerLogo}>{provider.name.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <strong>{provider.name}</strong>
                          <small>@{provider.slug}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.environmentPill} data-env={provider.environment}>
                        {provider.environment}
                      </span>
                    </td>
                    <td>
                      <span className={styles.statusPill} data-status={provider.status}>
                        {provider.status}
                      </span>
                    </td>
                    <td>
                      {provider.priority}
                    </td>
                    <td>
                      <div className={styles.capabilityPills}>
                        {provider.capabilities.map((cap) => (
                          <span key={cap} className={styles.subtleChip}>{cap}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong>{counts.get(provider.id) ?? 0}</strong> <small className={styles.unlinkedText}>offers</small>
                    </td>
                    <td data-align="right">
                      <div className={styles.rowActionGroup}>
                        <button type="button" className={styles.ghostButton} onClick={() => setEditing(provider)}>
                          Configure
                        </button>
                        <Link href={`/admin/products/providers/${provider.id}`} className={styles.secondaryButton}>
                          <span>View Profile</span>
                          <AdminIcon name="chevron" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="plug" />
                      <strong>No providers connected</strong>
                      <span>Add your first supplier to begin syncing catalogues.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <div className={styles.productDrawerBackdrop}>
          <form
            className={styles.productDrawer}
            onSubmit={(event) => {
              event.preventDefault();
              submit(event.currentTarget);
            }}
          >
            <header>
              <div>
                <span>{"id" in editing ? "Provider Configuration" : "New Provider"}</span>
                <h2>{"id" in editing ? editing.name : "Add a Supplier"}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                ×
              </button>
            </header>
            <p className={styles.drawerSafety}>
              Keys are never stored here. Enter only the Coolify environment-variable references.
            </p>
            <div className={styles.drawerGrid}>
              <label>
                Provider name
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                Short slug
                <input name="slug" defaultValue={editing.slug} required />
              </label>
              <label>
                Environment
                <AdminSelect
                  name="environment"
                  defaultValue={editing.environment}
                  options={[
                    { value: "sandbox", label: "Sandbox", description: "Safe testing environment" },
                    { value: "live", label: "Live", description: "Production traffic" },
                  ]}
                />
              </label>
              <label>
                Status
                <AdminSelect
                  name="status"
                  defaultValue={editing.status}
                  options={[
                    { value: "standby", label: "Standby" },
                    { value: "operational", label: "Operational" },
                    { value: "maintenance", label: "Maintenance" },
                    { value: "degraded", label: "Degraded" },
                    { value: "down", label: "Down" },
                  ]}
                />
              </label>
              <label>
                Routing priority
                <input name="priority" type="number" min="1" max="1000" defaultValue={editing.priority} required />
              </label>
              <fieldset>
                <legend>Products supplied</legend>
                {["data", "airtime", "electricity", "cable"].map((name) => (
                  <label key={name}>
                    <input
                      name="capabilities"
                      type="checkbox"
                      value={name}
                      defaultChecked={editing.capabilities.includes(name)}
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className={styles.drawerSection}>
              <h3>API map</h3>
              <div className={styles.drawerGrid}>
                <label>
                  Base URL
                  <input name="apiBaseUrl" type="url" defaultValue={editing.api_base_url ?? ""} placeholder="https://api.provider.com" />
                </label>
                <label>
                  Catalogue endpoint
                  <input name="catalogueEndpoint" defaultValue={editing.catalogue_endpoint ?? ""} placeholder="/data/plans" />
                </label>
                <label>
                  Purchase endpoint
                  <input name="purchaseEndpoint" defaultValue={editing.purchase_endpoint ?? ""} placeholder="/purchase" />
                </label>
                <label>
                  Requery endpoint
                  <input name="requeryEndpoint" defaultValue={editing.requery_endpoint ?? ""} placeholder="/transactions/{reference}" />
                </label>
                <label>
                  Balance endpoint
                  <input name="balanceEndpoint" defaultValue={editing.balance_endpoint ?? ""} placeholder="/balance" />
                </label>
                <label>
                  API key reference
                  <input name="apiSecretReference" defaultValue={editing.api_secret_reference ?? ""} placeholder="SMEPLUG_API_KEY" />
                </label>
                <label>
                  Webhook key reference
                  <input name="webhookSecretReference" defaultValue={editing.webhook_secret_reference ?? ""} placeholder="SMEPLUG_WEBHOOK_SECRET" />
                </label>
              </div>
            </div>
            <div className={styles.drawerSection}>
              <h3>Provider Profile</h3>
              <div className={styles.drawerGrid}>
                <label>
                  Documentation URL
                  <input name="documentationUrl" type="url" defaultValue={editing.documentation_url ?? ""} placeholder="https://docs.provider.com" />
                </label>
                <label>
                  Website URL
                  <input name="websiteUrl" type="url" defaultValue={editing.website_url ?? ""} placeholder="https://provider.com" />
                </label>
                <label>
                  Support email
                  <input name="supportEmail" type="email" defaultValue={editing.support_email ?? ""} placeholder="support@provider.com" />
                </label>
                <label>
                  Support phone
                  <input name="supportPhone" defaultValue={editing.support_phone ?? ""} placeholder="0800 000 0000" />
                </label>
              </div>
              <label>
                Internal integration notes
                <textarea name="notes" defaultValue={editing.notes ?? ""} placeholder="Known API behaviour, fulfilment notes, escalation instructions…" />
              </label>
            </div>
            <footer>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className={styles.primaryButton} disabled={pending}>
                {pending ? "Saving…" : "Save Provider"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
