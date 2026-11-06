"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import { saveDataBundle, syncProviderCatalogue } from "../../actions";
import AdminIcon from "../../admin-icon";
import AdminSelect from "../../admin-select";
import { AdminModal } from "../../admin-ui";
import styles from "../../../admin.module.css";
import {
  dataAmountMbFromName,
  parsePlanValidity,
  inferCategoryFromValidity,
} from "../../../../../lib/test-engine/plan-parser";

type Provider = { id: string; name: string; status: string };
type Offer = {
  id: string;
  provider_id: string;
  network_slug: string | null;
  provider_product_code: string;
  provider_name: string;
  data_amount_mb: number | null;
  validity_label: string | null;
  validity_hours: number | null;
  provider_cost: number;
  is_available: boolean;
};
type Bundle = {
  id: string;
  name: string;
  network: string | null;
  description: string | null;
  provider_cost: number;
  selling_price: number;
  status: string;
  metadata?: { data_amount_mb?: number; category?: string } | null;
  provider_id?: string | null;
  provider_product_code?: string | null;
  validity?: string | null;
  provider: { id?: string; name: string } | { id?: string; name: string }[] | null;
  placement: { surface: string; badge: string | null; is_active: boolean }[] | null;
};
type Category = { network_slug: string; slug: string; name: string; sort_order: number };

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

function dataLabel(offer: Offer): string {
  const mb = offer.data_amount_mb ?? dataAmountMbFromName(offer.provider_name);
  if (mb) {
    return mb >= 1000 ? `${mb / 1000}GB` : `${mb}MB`;
  }
  return "Plan";
}

export function getOfferValidity(offer: Offer): { label: string; hours: number | null } {
  if (offer.validity_label && offer.validity_label.trim()) {
    return { label: offer.validity_label.trim(), hours: offer.validity_hours };
  }
  const parsed = parsePlanValidity(offer.provider_name);
  if (parsed.label) {
    return { label: parsed.label, hours: parsed.hours };
  }
  if (offer.validity_hours) {
    const days = Math.round(offer.validity_hours / 24);
    return { label: days === 1 ? "1 Day" : `${days} Days`, hours: offer.validity_hours };
  }
  return { label: "", hours: null };
}

function parseSearchTokens(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const regex = /["'“‘]([^"'“”‘’]+)["'”’]|([^\s"'“”‘’]+)/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const token = (match[1] || match[2] || "").trim();
    if (token) tokens.push(token);
  }

  if (tokens.length === 0) {
    const cleaned = normalized.replace(/["'“”‘’]/g, " ").trim();
    return cleaned.split(/\s+/).filter(Boolean);
  }

  return tokens;
}

function buildOfferSearchIndex(offer: Offer): string {
  const mb = offer.data_amount_mb ?? dataAmountMbFromName(offer.provider_name);
  const sizeGb = mb ? `${mb / 1000}gb` : "";
  const sizeMb = mb ? `${mb}mb` : "";
  const sizeLabel = dataLabel(offer).toLowerCase();

  const { label: validityLabel, hours: validityHours } = getOfferValidity(offer);
  const days = validityHours ? Math.round(validityHours / 24) : null;
  const daysStr = days ? `${days} days ${days}days ${days}d ${days} day ${days}-day` : "";
  const periodStr = days === 1 ? "daily 24h 24 hours 1day 1 day" : days === 7 ? "weekly 7days 7 days 7 day" : (days === 30 || days === 31) ? "monthly 30days 30 days 30 day" : "";

  return `${offer.provider_name} ${offer.provider_product_code} ${sizeLabel} ${sizeGb} ${sizeMb} ${validityLabel} ${daysStr} ${periodStr} ${offer.provider_cost}`.toLowerCase();
}

function formatOfferOptionLabel(offer: Offer): string {
  const size = dataLabel(offer);
  const { label: validity } = getOfferValidity(offer);
  
  const raw = offer.provider_name || "";
  let planType = "";
  if (/corporate\s*gifting/i.test(raw)) {
    planType = "Corporate Gifting";
    if (/sme2/i.test(raw)) planType = "Corporate Gifting (SME2)";
  } else if (/sme/i.test(raw)) {
    planType = "SME";
  } else if (/gifting/i.test(raw)) {
    planType = "Direct Gifting";
  } else if (/awoof/i.test(raw)) {
    planType = "Awoof Promo";
  } else if (/coupon/i.test(raw)) {
    planType = "Data Coupon";
  } else {
    planType = raw.replace(/\s*-\s*\d+.*MB.*/i, "").trim() || "Data Plan";
  }

  const repeatsValidity = validity && planType.toLowerCase().includes(validity.toLowerCase());
  return validity && !repeatsValidity ? `${size} · ${planType} (${validity})` : `${size} · ${planType}`;
}

export default function DataBundlesWorkspace({
  providers,
  offers,
  bundles,
  categories,
}: {
  providers: Provider[];
  offers: Offer[];
  bundles: Bundle[];
  categories: Category[];
}) {
  const router = useRouter();
  const [network, setNetwork] = useState("mtn");
  const [providerId, setProviderId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [retail, setRetail] = useState("");
  const [margin, setMargin] = useState("");
  const [notice, setNotice] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const [tableNetwork, setTableNetwork] = useState("all");
  const [tableCategory, setTableCategory] = useState("all");
  const [tableQuery, setTableQuery] = useState("");
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [editRetail, setEditRetail] = useState("");
  const [editMargin, setEditMargin] = useState("");
  const [editProviderId, setEditProviderId] = useState("");
  const [editOfferId, setEditOfferId] = useState("");
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();

  const publishedNetworks = [
    { id: "all", label: "All Networks" },
    { id: "mtn", label: "MTN" },
    { id: "airtel", label: "Airtel" },
    { id: "glo", label: "GLO" },
    { id: "9mobile", label: "9mobile" },
  ];

  const availableTableCategories = useMemo(() => {
    if (tableNetwork === "all") {
      const seen = new Set<string>();
      const list: { slug: string; name: string }[] = [];
      categories.forEach((cat) => {
        if (!seen.has(cat.slug.toLowerCase())) {
          seen.add(cat.slug.toLowerCase());
          list.push({ slug: cat.slug, name: cat.name });
        }
      });
      return list;
    }
    return categories.filter((c) => c.network_slug.toLowerCase() === tableNetwork.toLowerCase());
  }, [categories, tableNetwork]);

  function getBundleCategory(bundle: Bundle) {
    if (bundle.metadata?.category) {
      const found = categories.find((c) => c.slug.toLowerCase() === bundle.metadata?.category?.toLowerCase());
      return found ? found.name : bundle.metadata.category;
    }
    if (bundle.description) {
      const parts = bundle.description.split("·").map((s) => s.trim());
      if (parts.length >= 2) {
        const found = categories.find((c) => c.slug.toLowerCase() === parts[1].toLowerCase());
        return found ? found.name : parts[1];
      }
    }
    return "General";
  }

  function getNetworkBundleCount(net: string) {
    if (net === "all") return bundles.length;
    return bundles.filter((b) => b.network?.toLowerCase() === net.toLowerCase()).length;
  }

  function getCategoryBundleCount(catSlug: string) {
    return bundles.filter((b) => {
      if (tableNetwork !== "all" && b.network?.toLowerCase() !== tableNetwork.toLowerCase()) {
        return false;
      }
      if (catSlug === "all") return true;
      const cat = b.metadata?.category?.toLowerCase();
      const desc = b.description?.toLowerCase() ?? "";
      return cat === catSlug.toLowerCase() || desc.includes(catSlug.toLowerCase());
    }).length;
  }

  const visibleBundles = useMemo(() => {
    return bundles.filter((bundle) => {
      if (tableNetwork !== "all" && bundle.network?.toLowerCase() !== tableNetwork.toLowerCase()) {
        return false;
      }
      if (tableCategory !== "all") {
        const cat = bundle.metadata?.category?.toLowerCase();
        const desc = (bundle.description ?? "").toLowerCase();
        if (cat !== tableCategory.toLowerCase() && !desc.includes(tableCategory.toLowerCase())) {
          return false;
        }
      }
      if (tableQuery.trim()) {
        const terms = parseSearchTokens(tableQuery);
        const name = bundle.name.toLowerCase();
        const desc = (bundle.description ?? "").toLowerCase();
        const net = (bundle.network ?? "").toLowerCase();
        const validity = (bundle.validity ?? "").toLowerCase();
        const code = (bundle.provider_product_code ?? "").toLowerCase();
        const searchIndex = `${name} ${desc} ${net} ${validity} ${code}`;
        if (!terms.every((term) => searchIndex.includes(term))) {
          return false;
        }
      }
      return true;
    });
  }, [bundles, tableNetwork, tableCategory, tableQuery]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);

  const visibleOffers = useMemo(() => {
    const terms = parseSearchTokens(query);
    return offers.filter((offer) => {
      if (offer.network_slug !== network) return false;
      if (providerId && offer.provider_id !== providerId) return false;
      if (!offer.is_available) return false;
      if (terms.length === 0) return true;
      const searchIndex = buildOfferSearchIndex(offer);
      return terms.every((term) => searchIndex.includes(term));
    });
  }, [offers, network, providerId, query]);

  const selected = offers.find((offer) => offer.id === selectedId);
  const categoriesForNetwork = categories.filter((category) => category.network_slug === network);
  const cost = selected?.provider_cost ?? 0;
  const calculatedMargin = retail && cost ? ((Number(retail) - cost) / Number(retail)) * 100 : 0;

  function chooseOffer(value: string) {
    setSelectedId(value);
    const offer = offers.find((item) => item.id === value);
    if (offer && margin) setRetail(String(offer.provider_cost + Number(margin)));
  }

  function setFromMargin(value: string) {
    setMargin(value);
    if (cost && Number(value) >= 0) {
      setRetail(String(cost + Number(value)));
    }
  }

  function syncProvider() {
    if (!providerId) return;
    startSync(async () => {
      const result = await syncProviderCatalogue({ providerId });
      setNotice(result.message);
      if (result.ok) router.refresh();
    });
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const category = String(fd.get("category") || "").trim();
    if (!category) {
      setNotice("Please select a duration group (mandatory).");
      return;
    }
    const selectedValidity = selected ? getOfferValidity(selected) : { label: "", hours: null };
    const effectiveMb = Number(selected?.data_amount_mb ?? dataAmountMbFromName(selected?.provider_name || "")) || Number(fd.get("dataAmountMb")) || 0;
    const effectiveValidity = selectedValidity.label || String(fd.get("validity") || "");

    startSave(async () => {
      const result = await saveDataBundle({
        name: String(fd.get("name")),
        network,
        category,
        dataAmountMb: effectiveMb,
        validity: effectiveValidity,
        providerCatalogueItemId: selected?.id ?? null,
        providerId: selected?.provider_id ?? null,
        providerProductCode: selected?.provider_product_code ?? null,
        providerCost: selected?.provider_cost ?? 0,
        sellingPrice: Number(retail),
        placement: String(fd.get("placement")),
        badge: String(fd.get("badge")) || null,
        status: String(fd.get("status")),
      });
      setNotice(result.message);
      if (result.ok) {
        setStudioOpen(false);
        setSelectedId("");
        setRetail("");
        setMargin("");
        form.reset();
        router.refresh();
      }
    });
  }

  const availableEditOffers = useMemo(() => {
    if (!editingBundle) return [];
    const net = (editingBundle.network || "mtn").toLowerCase();
    return offers.filter((o) => {
      if ((o.network_slug || "").toLowerCase() !== net) return false;
      if (editProviderId && o.provider_id !== editProviderId) return false;
      return o.is_available;
    });
  }, [offers, editingBundle, editProviderId]);

  const activeEditOffer = useMemo(() => {
    return offers.find((o) => o.id === editOfferId);
  }, [offers, editOfferId]);

  const editCost = activeEditOffer ? activeEditOffer.provider_cost : (editingBundle?.provider_cost || 0);

  function openEditDrawer(bundle: Bundle) {
    setEditingBundle(bundle);
    setEditRetail(String(bundle.selling_price));
    const cost = bundle.provider_cost || 0;
    if (bundle.selling_price >= cost) {
      setEditMargin(String(bundle.selling_price - cost));
    } else {
      setEditMargin("");
    }

    const provider = Array.isArray(bundle.provider) ? bundle.provider[0] : bundle.provider;
    const initialProviderId = bundle.provider_id || (provider as { id?: string })?.id || "";
    setEditProviderId(initialProviderId);

    const matchedOffer = offers.find(
      (o) =>
        (o.network_slug || "").toLowerCase() === (bundle.network || "").toLowerCase() &&
        (!initialProviderId || o.provider_id === initialProviderId) &&
        (bundle.provider_product_code ? o.provider_product_code === bundle.provider_product_code : false)
    );
    setEditOfferId(matchedOffer?.id || "");
  }

  function handleEditProviderChange(newProviderId: string) {
    setEditProviderId(newProviderId);
    const net = (editingBundle?.network || "mtn").toLowerCase();
    const providerOffers = offers.filter(
      (o) => (o.network_slug || "").toLowerCase() === net && o.provider_id === newProviderId && o.is_available
    );
    if (providerOffers.length > 0) {
      const first = providerOffers[0];
      setEditOfferId(first.id);
      const m = Number(editMargin) >= 0 && editMargin !== "" ? Number(editMargin) : 0;
      setEditRetail(String(first.provider_cost + m));
    } else {
      setEditOfferId("");
    }
  }

  function handleEditOfferChange(newOfferId: string) {
    setEditOfferId(newOfferId);
    const offer = offers.find((o) => o.id === newOfferId);
    if (offer) {
      const m = Number(editMargin) >= 0 && editMargin !== "" ? Number(editMargin) : 0;
      setEditRetail(String(offer.provider_cost + m));
    }
  }

  function submitEdit(form: HTMLFormElement) {
    if (!editingBundle) return;
    const fd = new FormData(form);
    const category = String(fd.get("category") || "").trim();
    if (!category) {
      setNotice("Please select a duration group (mandatory).");
      return;
    }
    startSave(async () => {
      const selectedOffer = offers.find((o) => o.id === editOfferId);
      const offerVal = selectedOffer ? getOfferValidity(selectedOffer) : null;
      const finalCost = selectedOffer ? selectedOffer.provider_cost : (editingBundle.provider_cost || 0);
      const finalDataAmountMb = selectedOffer
        ? (selectedOffer.data_amount_mb || dataAmountMbFromName(selectedOffer.provider_name) || 0)
        : (Number(editingBundle.metadata?.data_amount_mb) || 0);
      const finalValidity = offerVal?.label || selectedOffer?.validity_label || (editingBundle.validity || "Standard");
      const finalProductCode = selectedOffer ? selectedOffer.provider_product_code : (editingBundle.provider_product_code || null);
      const finalProviderId = editProviderId || (selectedOffer?.provider_id ?? null) || editingBundle.provider_id || null;
      const finalCatalogueItemId = selectedOffer?.id ?? null;

      const result = await saveDataBundle({
        id: editingBundle.id,
        name: String(fd.get("name")),
        network: editingBundle.network || "mtn",
        category,
        dataAmountMb: finalDataAmountMb,
        validity: finalValidity,
        providerCatalogueItemId: finalCatalogueItemId,
        providerId: finalProviderId,
        providerProductCode: finalProductCode,
        providerCost: finalCost,
        sellingPrice: Number(editRetail),
        placement: String(fd.get("placement")),
        badge: String(fd.get("badge")) || null,
        status: String(fd.get("status")),
      });
      setNotice(result.message);
      if (result.ok) {
        setEditingBundle(null);
        router.refresh();
      }
    });
  }

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Data Bundles"
        actions={
          <>
            <button type="button" className={styles.primaryButton} onClick={() => setStudioOpen(true)}>
              <AdminIcon name="plus" />
              Add bundle
            </button>
          </>
        }
        stats={[
          { icon: "wifi", tone: "slate", value: bundles.length, label: "Bundles", note: "published data plans" },
          { icon: "check", tone: "emerald", value: bundles.filter((bundle) => bundle.status === "active").length, label: "Active", note: "visible to customers" },
          { icon: "pencil", tone: "amber", value: bundles.filter((bundle) => bundle.status === "draft").length, label: "Drafts", note: "not yet published" },
          { icon: "provider", tone: "primary", value: providers.length, label: "Providers", note: "supplying offers" },
        ]}
      />

      {notice ? <div className={styles.productNotice}>{notice}</div> : null}

      {/* Unified Inventory Table */}
      <section className={`${styles.workspacePanel} ${styles.dataBundleRegistry}`}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div>
              <div className={styles.directoryTitle}>
                <h2>Bundle directory</h2>
                <span className={styles.countPill}>{visibleBundles.length}</span>
              </div>
              <p className={styles.directorySub}>Network, category, pricing and status.</p>
            </div>
            <div className={styles.directoryTools}>
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input
                  value={tableQuery}
                  onChange={(e) => setTableQuery(e.target.value)}
                  placeholder="Search bundles..."
                />
              </label>
            </div>
          </div>

          <nav className={styles.segmentedTabs} aria-label="Network">
            {publishedNetworks.map((net) => {
              const count = getNetworkBundleCount(net.id);
              return (
                <button
                  key={net.id}
                  type="button"
                  data-active={tableNetwork === net.id}
                  className={styles.networkUnderlineTab}
                  onClick={() => {
                    setTableNetwork(net.id);
                    setTableCategory("all");
                  }}
                >
                  {net.label}
                  <span className={styles.countPill}>{count}</span>
                </button>
              );
            })}
          </nav>

          <div className={styles.filterPillRow}>
            <button
              type="button"
              data-active={tableCategory === "all"}
              className={styles.categoryFilterPill}
              onClick={() => setTableCategory("all")}
            >
              All
            </button>
            {availableTableCategories.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                data-active={tableCategory === cat.slug}
                className={styles.categoryFilterPill}
                onClick={() => setTableCategory(cat.slug)}
              >
                {cat.name}
                <span className={styles.countPill}>{getCategoryBundleCount(cat.slug)}</span>
              </button>
            ))}
          </div>

        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Bundle</th>
                <th>Provider</th>
                <th>Price</th>
                <th>Placement</th>
                <th>Status</th>
                <th data-align="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleBundles.length ? (
                visibleBundles.map((bundle) => {
                  const provider = Array.isArray(bundle.provider) ? bundle.provider[0] : bundle.provider;
                  const placement = bundle.placement?.[0];
                  const categoryName = getBundleCategory(bundle);
                  const profit = bundle.selling_price - (bundle.provider_cost || 0);
                  return (
                    <tr key={bundle.id}>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{bundle.name}</strong>
                          <small>{bundle.network?.toUpperCase() || "DATA"} · {categoryName}</small>
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{provider ? provider.name : "Unlinked"}</strong>
                          <small>{provider ? `Cost ${money.format(bundle.provider_cost)}` : "No supplier offer"}</small>
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellValue}>
                          <strong>{money.format(bundle.selling_price)}</strong>
                          <small>{provider ? `${money.format(profit)} profit` : "No margin"}</small>
                        </div>
                      </td>
                      <td className={styles.cellPlain}>
                        {placement?.is_active ? placement.badge || placement.surface.replace("_", " ") : "Standard"}
                      </td>
                      <td>
                        <span className={styles.statusPill} data-status={bundle.status}>
                          {bundle.status}
                        </span>
                      </td>
                      <td data-align="right">
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconAction}
                            aria-label="Edit bundle"
                            data-tip="Edit bundle"
                            onClick={() => openEditDrawer(bundle)}
                          >
                            <AdminIcon name="pencil" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="catalogue" />
                      <strong>No bundles found</strong>
                      <span>{bundles.length ? "Change the network or category filter." : "Add your first bundle."}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.workspaceFooter}>
          <span>Showing {visibleBundles.length} of {bundles.length} bundles</span>
        </footer>
      </section>

      {studioOpen ? (
        <AdminModal title="Add data bundle" onClose={() => setStudioOpen(false)} width={1040}>
          <div className={styles.bundleBuilder}>
            <div className={styles.bundleBuilderSource}>
              <div className={styles.builderSection}>
                <span className={styles.builderLabel}>Network</span>
                <nav className={styles.segmentedTabs} aria-label="Network">
                  {[
                    { id: "mtn", label: "MTN" },
                    { id: "airtel", label: "Airtel" },
                    { id: "glo", label: "Glo" },
                    { id: "9mobile", label: "9mobile" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.networkUnderlineTab}
                      data-active={network === item.id}
                      onClick={() => {
                        setNetwork(item.id);
                        setSelectedId("");
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className={styles.builderSection}>
                <span className={styles.builderLabel}>Provider</span>
                <div className={styles.builderProviderRow}>
                  <AdminSelect
                    id="provider-select"
                    value={providerId}
                    searchable={providers.length > 7}
                    searchPlaceholder="Search providers"
                    placeholder="Select provider"
                    options={[
                      { value: "", label: "All providers" },
                      ...providers.map((provider) => ({
                        value: provider.id,
                        label: provider.name,
                        description: provider.status,
                      })),
                    ]}
                    onValueChange={(nextProviderId) => {
                      setProviderId(nextProviderId);
                      setSelectedId("");
                      setQuery("");
                    }}
                  />
                  {selectedProvider ? (
                    <button className={styles.secondaryButton} type="button" onClick={syncProvider} disabled={syncing}>
                      <AdminIcon name="refresh" />
                      {syncing ? "Syncing…" : "Sync"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.builderSection}>
                <div className={styles.builderLabelRow}>
                  <span className={styles.builderLabel}>Supplier offer</span>
                  <span className={styles.countPill}>{visibleOffers.length}</span>
                </div>
                <label className={styles.directorySearch}>
                  <AdminIcon name="search" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search 5GB, 7 days, SME or code..."
                  />
                </label>
                <div className={styles.offerList}>
                  {visibleOffers.length ? (
                    visibleOffers.map((offer) => {
                      const isSelected = selectedId === offer.id;
                      return (
                        <button
                          key={offer.id}
                          type="button"
                          data-selected={isSelected}
                          onClick={() => chooseOffer(offer.id)}
                          className={styles.offerItem}
                        >
                          <span className={styles.offerSize}>{dataLabel(offer)}</span>
                          <span className={styles.offerText}>
                            <strong>{offer.provider_name}</strong>
                            <small>{getOfferValidity(offer).label || (offer.validity_hours ? `${offer.validity_hours}h` : "Standard")} · {offer.provider_product_code}</small>
                          </span>
                          <span className={styles.offerPrice}>{money.format(offer.provider_cost)}</span>
                          {isSelected ? <AdminIcon name="check" className={styles.offerCheck} /> : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="catalogue" />
                      <strong>{providerId ? "No matching offers" : "Choose a provider"}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>

        {/* PANE 3: FUNDA PRODUCT FORM */}
        <form
          key={selectedId || "unlinked"}
          className={styles.bundleBuilderForm}
          onSubmit={(event) => {
            event.preventDefault();
            submit(event.currentTarget);
          }}
        >

          {selected ? (() => {
            const offerValidity = getOfferValidity(selected);
            const offerMb = selected.data_amount_mb ?? dataAmountMbFromName(selected.provider_name);
            const inferredCategory = inferCategoryFromValidity(offerValidity.label, offerValidity.hours, categoriesForNetwork);
            return (
              <>
                <div className={styles.selectedOffer}>
                  <div className={styles.selectedOfferTop}>
                    <strong>{selected.provider_name}</strong>
                    <span>{money.format(cost)}</span>
                  </div>
                  <small>{dataLabel(selected)} · {offerValidity.label || "Standard"} · {selected.provider_product_code}</small>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.inputLabel}>Name</label>
                  <input
                    name="name"
                    required
                    defaultValue={`${network.toUpperCase()} ${dataLabel(selected)} ${offerValidity.label || "Data"}`}
                    placeholder="e.g. MTN 5GB Weekly"
                  />
                </div>

                <div className={styles.twoFields}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.inputLabel}>Data Size (MB)</label>
                    <input
                      name="dataAmountMb"
                      value={offerMb ?? ""}
                      readOnly
                      placeholder={selected ? "" : "No provider linked"}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.inputLabel}>Validity</label>
                    <input
                      name="validity"
                      value={offerValidity.label || (selected.validity_hours ? `${selected.validity_hours / 24} days` : "")}
                      readOnly
                      placeholder={selected ? "" : "No provider linked"}
                    />
                  </div>
                </div>

                <div className={styles.twoFields}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.inputLabel}>
                      Duration Group <span className={styles.requiredMark}>*</span>
                    </label>
                    <AdminSelect
                      key={`${network}-${selected.id}`}
                      name="category"
                      defaultValue={inferredCategory}
                      placeholder="-- Select group --"
                      options={categoriesForNetwork.map((category) => ({ value: category.slug, label: category.name }))}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.inputLabel}>Supplier Cost</label>
                    <input value={money.format(cost)} readOnly />
                  </div>
                </div>
              </>
            );
          })() : (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.inputLabel}>Name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. MTN 5GB Weekly"
                />
              </div>

              <div className={styles.twoFields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.inputLabel}>Data Size (MB)</label>
                  <input
                    name="dataAmountMb"
                    readOnly
                    placeholder="No provider linked"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.inputLabel}>Validity</label>
                  <input
                    name="validity"
                    readOnly
                    placeholder="No provider linked"
                  />
                </div>
              </div>

              <div className={styles.twoFields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.inputLabel}>
                    Duration Group <span className={styles.requiredMark}>*</span>
                  </label>
                  <AdminSelect
                    key={network}
                    name="category"
                    defaultValue=""
                    placeholder="-- Select group --"
                    options={categoriesForNetwork.map((category) => ({ value: category.slug, label: category.name }))}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.inputLabel}>Supplier Cost</label>
                  <input value="No provider linked" readOnly />
                </div>
              </div>
            </>
          )}

          <div className={styles.twoFields}>
            <div className={styles.fieldGroup}>
              <label className={styles.inputLabel}>Selling Price (₦)</label>
              <input
                type="number"
                min={cost}
                step="0.01"
                value={retail}
                onChange={(event) => {
                  const val = event.target.value;
                  setRetail(val);
                  if (cost && Number(val) >= cost) {
                    setMargin(String(Number(val) - cost));
                  } else {
                    setMargin("");
                  }
                }}
                required
                placeholder="e.g. 1500"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.inputLabel}>Target Margin (₦)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={margin}
                onChange={(event) => setFromMargin(event.target.value)}
                disabled={!selected}
                placeholder={selected ? "e.g. 100" : "Link offer first"}
              />
            </div>
          </div>

          <div className={styles.marginPreview}>
            <div>
              <span>Gross Profit per Sale</span>
              <small>{selected && retail && Number(retail) >= cost ? `${((Number(retail) - cost) / Number(retail) * 100).toFixed(1)}% margin` : "Profit calculates after pricing"}</small>
            </div>
            <strong>{selected && retail && Number(retail) >= cost ? money.format(Number(retail) - cost) : "—"}</strong>
          </div>

          <div className={styles.twoFields}>
            <div className={styles.fieldGroup}>
              <label className={styles.inputLabel}>Placement</label>
              <AdminSelect
                name="placement"
                defaultValue="none"
                options={[
                  { value: "none", label: "Standard List" },
                  { value: "home_quick", label: "Home Quick Row" },
                  { value: "data_top", label: "Top Picks" },
                  { value: "data_recommended", label: "Recommended" },
                ]}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.inputLabel}>Badge</label>
              <input name="badge" placeholder="e.g. Hot · Best value" />
            </div>
          </div>

          <div className={styles.fieldGroup}>
              <label className={styles.inputLabel}>Status</label>
            <AdminSelect
              name="status"
              defaultValue="draft"
              options={[
                { value: "draft", label: "Draft", description: "Private" },
                { value: "active", label: "Active", description: "Visible to customers" },
                { value: "disabled", label: "Paused", description: "Temporarily unavailable" },
              ]}
            />
          </div>

          <button className={`${styles.primaryButton} ${styles.builderSubmit}`} disabled={saving} type="submit">
            {saving ? "Saving…" : "Save bundle"}
          </button>
        </form>
          </div>
        </AdminModal>
      ) : null}

      {/* Slide-Over Edit Drawer */}
      {editingBundle && (
        <div className={styles.productDrawerBackdrop}>
          <form
            className={styles.productDrawer}
            onSubmit={(event) => {
              event.preventDefault();
              submitEdit(event.currentTarget);
            }}
          >
            <header>
              <div>
                <span>Edit Published Bundle</span>
                <h2>{editingBundle.name}</h2>
              </div>
              <button type="button" onClick={() => setEditingBundle(null)}>
                ×
              </button>
            </header>

            {/* Section 1: Fulfilment Setup */}
            <div className={styles.drawerSection}>
              <div className={styles.drawerSubheading}>
                <span>1. Fulfilment & Provider Configuration</span>
                <span className={styles.networkTag} data-network={editingBundle.network?.toLowerCase()}>
                  {editingBundle.network?.toUpperCase() || "DATA"}
                </span>
              </div>

              <div className={styles.drawerGrid2}>
                <label>
                  Fulfilment Provider
                  <AdminSelect
                    name="editProvider"
                    value={editProviderId}
                    onValueChange={handleEditProviderChange}
                    options={providers.map((p) => ({
                      value: p.id,
                      label: p.name,
                      description: p.status === "operational" ? "Active" : p.status,
                    }))}
                  />
                </label>

                <label>
                  Provider Plan / Bundle Option
                  <AdminSelect
                    name="editOffer"
                    value={editOfferId}
                    searchable
                    searchPlaceholder="Search 5GB, SME, Gifting, code..."
                    onValueChange={handleEditOfferChange}
                    options={
                      availableEditOffers.length > 0
                        ? availableEditOffers.map((offer) => ({
                            value: offer.id,
                            label: formatOfferOptionLabel(offer),
                            description: `${money.format(offer.provider_cost)} (${offer.provider_product_code || ""})`,
                          }))
                        : [{ value: "", label: "-- No available plans for this network --" }]
                    }
                  />
                </label>
              </div>

              {/* Clean Live Link Summary Card */}
              <div className={styles.drawerOfferStrip}>
                <div>
                  <strong>Linked Baseline:</strong>{" "}
                  {activeEditOffer
                    ? `${activeEditOffer.provider_name} (${activeEditOffer.provider_product_code || "Code"}) · ${dataLabel(activeEditOffer)} · ${getOfferValidity(activeEditOffer).label || "Standard"}`
                    : (Array.isArray(editingBundle.provider) ? editingBundle.provider[0]?.name : editingBundle.provider?.name || "Unlinked Supplier")}
                </div>
                <div>
                  Supplier Cost: <strong className={styles.profitText}>{money.format(editCost)}</strong>
                </div>
              </div>
            </div>

            {/* Section 2: Customer Definition & Pricing */}
            <div className={styles.drawerSection}>
              <div className={styles.drawerSubheading}>
                <span>2. Customer Pricing & Definition</span>
              </div>

              <div className={styles.drawerGrid2}>
                <label>
                  Customer-Facing Name
                  <input name="name" defaultValue={editingBundle.name} required />
                </label>

                <label>
                  <span>Duration Group <span className={styles.requiredMark}>*</span></span>
                  <AdminSelect
                    name="category"
                    defaultValue={editingBundle.metadata?.category || ""}
                    placeholder="-- Select group --"
                    options={categories
                      .filter((c) => !editingBundle.network || c.network_slug.toLowerCase() === editingBundle.network.toLowerCase())
                      .map((c) => ({ value: c.slug, label: c.name }))}
                  />
                </label>
              </div>

              <div className={styles.drawerGrid2}>
                <label>
                  Target Margin (₦)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editMargin}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditMargin(val);
                      if (Number(val) >= 0) {
                        setEditRetail(String(editCost + Number(val)));
                      }
                    }}
                    placeholder="e.g. 100"
                  />
                </label>

                <label>
                  Selling Price (₦)
                  <input
                    type="number"
                    min={editCost}
                    step="0.01"
                    value={editRetail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditRetail(val);
                      if (Number(val) >= editCost) {
                        setEditMargin(String(Number(val) - editCost));
                      } else {
                        setEditMargin("");
                      }
                    }}
                    required
                  />
                </label>
              </div>

              <div className={styles.drawerGrid2}>
                <label>
                  Placement
                  <AdminSelect
                    name="placement"
                    defaultValue={editingBundle.placement?.[0]?.surface || "none"}
                    options={[
                      { value: "none", label: "Standard List" },
                      { value: "home_quick", label: "Home Quick Row" },
                      { value: "data_top", label: "Top Picks" },
                      { value: "data_recommended", label: "Recommended" },
                    ]}
                  />
                </label>

                <label>
                  Badge Text
                  <input
                    name="badge"
                    defaultValue={editingBundle.placement?.[0]?.badge || ""}
                    placeholder="e.g. Hot · Best Value"
                  />
                </label>
              </div>

              <label>
                Publishing Status
                <AdminSelect
                  name="status"
                  defaultValue={editingBundle.status}
                  options={[
                    { value: "draft", label: "Draft", description: "Private / Hidden" },
                    { value: "active", label: "Active", description: "Visible to customers" },
                    { value: "disabled", label: "Paused", description: "Temporarily unavailable" },
                  ]}
                />
              </label>
            </div>

            <footer>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setEditingBundle(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={saving}
              >
                {saving ? "Saving Changes…" : "Save Changes"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
