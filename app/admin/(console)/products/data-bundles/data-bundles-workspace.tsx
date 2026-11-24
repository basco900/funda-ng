"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  button,
  card,
  PageHeader,
  SectionTitle,
  StatBand,
  StatusBadge,
} from "@/components/admin/kit";
import {
  FilterPicker,
  PurchaseStatusFilter,
  Segmented,
  statusOptionsFrom,
} from "@/components/admin/list-controls";
import type { PurchaseFilter } from "@/lib/admin/purchases";
import { cn } from "@/lib/utils";
import {
  checkSingleDataBundleHealth,
  runDataBundleHealthCheck,
  runProviderRequeryNow,
  saveDataBundle,
  syncAllDataProviders,
  syncProviderCatalogue,
  toggleDataBundleStatus,
} from "../../actions";
import type { HealthOverrideMode, PlanHealthSnapshot } from "../../../../../lib/services/plan-health";
import AdminIcon from "../../admin-icon";
import AdminSelect from "../../admin-select";
import { AdminModal } from "../../admin-ui";
import ExportAction from "../../export-action";
import styles from "../../../admin.module.css";
import {
  dataAmountMbFromName,
  inferCategoryFromValidity,
  parsePlanValidity,
} from "../../../../../lib/test-engine/plan-parser";

type Provider = { id: string; name: string; status: string; slug?: string };
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
type ProductProviderOffer = {
  product_id: string;
  provider_id: string;
  provider_catalogue_item_id: string | null;
  provider_product_code: string;
  provider_cost: number;
  priority: number;
  status: string;
  provider: { id?: string; name: string; slug?: string } | { id?: string; name: string; slug?: string }[] | null;
};
type Bundle = {
  id: string;
  name: string;
  network: string | null;
  description: string | null;
  provider_cost: number;
  selling_price: number;
  cashback_amount?: number | null;
  status: string;
  metadata?: { data_amount_mb?: number; category?: string; health?: Partial<PlanHealthSnapshot> } | null;
  provider_id?: string | null;
  provider_product_code?: string | null;
  validity?: string | null;
  provider: { id?: string; name: string } | { id?: string; name: string }[] | null;
  placement: { surface: string; badge: string | null; is_active: boolean }[] | null;
};
type Category = { network_slug: string; slug: string; name: string; sort_order: number };
type DataCoupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount?: number | null;
  service_type: string;
  used_count?: number;
  max_uses?: number | null;
};
type DataAnalyticsSummary = {
  revenue30d: number;
  supplierCost30d: number;
  grossProfit30d: number;
  cashbackCost30d: number;
  discountCost30d: number;
  totalOrders30d: number;
  successfulCount: number;
  failedCount: number;
  pendingCount: number;
  successRate: number;
  byNetwork: Array<{ network: string; total: number; success: number; revenue: number; profit: number }>;
  byProvider: Array<{ providerId: string; name: string; total: number; success: number; revenue: number; profit: number }>;
};

const EMPTY_ANALYTICS: DataAnalyticsSummary = {
  revenue30d: 0,
  supplierCost30d: 0,
  grossProfit30d: 0,
  cashbackCost30d: 0,
  discountCost30d: 0,
  totalOrders30d: 0,
  successfulCount: 0,
  failedCount: 0,
  pendingCount: 0,
  successRate: 0,
  byNetwork: [],
  byProvider: [],
};

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

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
    return normalized.replace(/["'“”‘’]/g, " ").trim().split(/\s+/).filter(Boolean);
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
  const periodStr =
    days === 1
      ? "daily 24h 24 hours 1day 1 day"
      : days === 7
        ? "weekly 7days 7 days 7 day"
        : days === 30 || days === 31
          ? "monthly 30days 30 days 30 day"
          : "";
  return `${offer.provider_name} ${offer.provider_product_code} ${sizeLabel} ${sizeGb} ${sizeMb} ${validityLabel} ${daysStr} ${periodStr} ${offer.provider_cost}`.toLowerCase();
}

function formatOfferOptionLabel(offer: Offer): string {
  const size = dataLabel(offer);
  const { label: validity } = getOfferValidity(offer);
  const raw = offer.provider_name || "";
  let planType = "";
  if (/corporate\s*gifting/i.test(raw)) {
    planType = /sme2/i.test(raw) ? "Corporate Gifting (SME2)" : "Corporate Gifting";
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
  productOffers = [],
  recentPurchases = [],
  purchaseFilter,
  cashbackEnabled = true,
  activeCoupons = [],
  analytics = EMPTY_ANALYTICS,
}: {
  providers: Provider[];
  offers: Offer[];
  bundles: Bundle[];
  categories: Category[];
  productOffers?: ProductProviderOffer[];
  recentPurchases?: Record<string, unknown>[];
  purchaseFilter?: PurchaseFilter;
  cashbackEnabled?: boolean;
  activeCoupons?: DataCoupon[];
  analytics?: DataAnalyticsSummary;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"inventory" | "purchases" | "analytics">(
    purchaseFilter?.status ? "purchases" : "inventory",
  );

  // Add Studio state
  const [studioOpen, setStudioOpen] = useState(false);
  const [network, setNetwork] = useState("mtn");
  const [providerId, setProviderId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [offerFilter, setOfferFilter] = useState("all");
  const [retail, setRetail] = useState("");
  const [margin, setMargin] = useState("");
  const [cashback, setCashback] = useState("0");
  const [studioStatus, setStudioStatus] = useState<"active" | "draft" | "disabled">("active");
  const [fallbackProviderId, setFallbackProviderId] = useState("");
  const [fallbackOfferId, setFallbackOfferId] = useState("");

  // Directory filters
  const [tableNetwork, setTableNetwork] = useState("all");
  const [tableCategory, setTableCategory] = useState("all");
  const [tableQuery, setTableQuery] = useState("");
  const [tableStatus, setTableStatus] = useState("");
  const statusOptions = useMemo(() => statusOptionsFrom(bundles, (bundle) => bundle.status), [bundles]);

  // Edit Drawer state
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [editRetail, setEditRetail] = useState("");
  const [editMargin, setEditMargin] = useState("");
  const [editCashback, setEditCashback] = useState("0");
  const [editStatus, setEditStatus] = useState<"active" | "draft" | "disabled">("draft");
  const [editProviderId, setEditProviderId] = useState("");
  const [editOfferId, setEditOfferId] = useState("");
  const [editFallbackProviderId, setEditFallbackProviderId] = useState("");
  const [editFallbackOfferId, setEditFallbackOfferId] = useState("");
  const [editHealthOverride, setEditHealthOverride] = useState<HealthOverrideMode>("auto");
  const [editAdvisoryNote, setEditAdvisoryNote] = useState("");

  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busyTxId, setBusyTxId] = useState<string | null>(null);
  const [busyBundleId, setBusyBundleId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();
  const [checkingHealth, startHealthCheck] = useTransition();
  const [opPending, startOp] = useTransition();

  const offersByProduct = useMemo(() => {
    const map = new Map<string, ProductProviderOffer[]>();
    for (const po of productOffers) {
      if (po.status !== "active") continue;
      const list = map.get(po.product_id) ?? [];
      list.push(po);
      map.set(po.product_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.priority - b.priority);
    }
    return map;
  }, [productOffers]);

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
      if (tableNetwork !== "all" && b.network?.toLowerCase() !== tableNetwork.toLowerCase()) return false;
      if (catSlug === "all") return true;
      const cat = b.metadata?.category?.toLowerCase();
      const desc = b.description?.toLowerCase() ?? "";
      return cat === catSlug.toLowerCase() || desc.includes(catSlug.toLowerCase());
    }).length;
  }

  const visibleBundles = useMemo(() => {
    return bundles.filter((bundle) => {
      if (tableStatus && bundle.status !== tableStatus) return false;
      if (tableNetwork !== "all" && bundle.network?.toLowerCase() !== tableNetwork.toLowerCase()) return false;
      if (tableCategory !== "all") {
        const cat = bundle.metadata?.category?.toLowerCase();
        const desc = (bundle.description ?? "").toLowerCase();
        if (cat !== tableCategory.toLowerCase() && !desc.includes(tableCategory.toLowerCase())) return false;
      }
      if (tableQuery.trim()) {
        const terms = parseSearchTokens(tableQuery);
        const searchIndex = `${bundle.name} ${bundle.description ?? ""} ${bundle.network ?? ""} ${bundle.validity ?? ""} ${bundle.provider_product_code ?? ""}`.toLowerCase();
        if (!terms.every((term) => searchIndex.includes(term))) return false;
      }
      return true;
    });
  }, [bundles, tableNetwork, tableCategory, tableQuery, tableStatus]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const providerScopedOffers = useMemo(
    () =>
      offers.filter(
        (offer) =>
          offer.network_slug === network &&
          (!providerId || offer.provider_id === providerId) &&
          offer.is_available,
      ),
    [offers, network, providerId],
  );

  const offerFilterTabs = useMemo(() => {
    const classify = (offer: Offer) => {
      const name = offer.provider_name || "";
      const mb = offer.data_amount_mb ?? dataAmountMbFromName(name);
      const { hours } = getOfferValidity(offer);
      const isNightWknd = /\b(night|midnight|weekend)\b/i.test(name);
      const isSocial = /\b(whatsapp|social|instagram|tiktok|youtube|facebook|opera)\b|yt\/ig/i.test(name);
      const isDaily =
        (hours !== null && hours <= 48 && !isNightWknd) ||
        /\b(daily|24h|1\s*day|2\s*days|hr|hour|1hr)\b/i.test(name);
      const isWeekly =
        (hours !== null && hours > 48 && hours <= 14 * 24) ||
        /\b(week|2-week|7\s*days|14\s*days)\b/i.test(name);
      const isMonthly =
        (hours !== null && hours > 14 * 24 && hours <= 45 * 24) ||
        /\b(monthly|1\s*month|30\s*days)\b/i.test(name);
      const isMega = (mb !== null && mb >= 10_000) || (hours !== null && hours > 45 * 24);
      const isSmall = mb !== null && mb > 0 && mb < 1000;
      const isSme = /\b(sme|sme2|corporate|cg)\b/i.test(name);
      const isAwoof = /\b(awoof|promo|coupon|bonus)\b/i.test(name);
      const isOther = !isDaily && !isWeekly && !isMonthly && !isMega && !isSmall && !isSocial && !isNightWknd;
      return { isSmall, isDaily, isWeekly, isMonthly, isMega, isSme, isAwoof, isSocial, isNightWknd, isOther };
    };

    const defs: Array<{ id: string; label: string; test: (f: ReturnType<typeof classify>) => boolean }> = [
      { id: "small", label: "Small", test: (f) => f.isSmall },
      { id: "daily", label: "Daily", test: (f) => f.isDaily },
      { id: "weekly", label: "Weekly", test: (f) => f.isWeekly },
      { id: "monthly", label: "Monthly", test: (f) => f.isMonthly },
      { id: "mega", label: "Mega", test: (f) => f.isMega },
      { id: "sme", label: "SME / CG", test: (f) => f.isSme },
      { id: "awoof", label: "Awoof", test: (f) => f.isAwoof },
      { id: "social", label: "Social", test: (f) => f.isSocial },
      { id: "night", label: "Night / Wknd", test: (f) => f.isNightWknd },
      { id: "other", label: "Other", test: (f) => f.isOther },
    ];

    const counts = new Map<string, number>();
    for (const offer of providerScopedOffers) {
      const f = classify(offer);
      for (const def of defs) {
        if (def.test(f)) counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
      }
    }

    const tabs = [{ id: "all", label: "All", count: providerScopedOffers.length }];
    for (const def of defs) {
      const count = counts.get(def.id) ?? 0;
      if (count > 0) tabs.push({ id: def.id, label: def.label, count });
    }
    return { tabs, classify, defs };
  }, [providerScopedOffers]);

  const activeOfferFilter = offerFilterTabs.tabs.some((t) => t.id === offerFilter) ? offerFilter : "all";

  const visibleOffers = useMemo(() => {
    const terms = parseSearchTokens(query);
    const activeDef = offerFilterTabs.defs.find((d) => d.id === activeOfferFilter);
    return providerScopedOffers.filter((offer) => {
      if (activeDef && !activeDef.test(offerFilterTabs.classify(offer))) return false;
      if (terms.length === 0) return true;
      return terms.every((term) => buildOfferSearchIndex(offer).includes(term));
    });
  }, [providerScopedOffers, activeOfferFilter, offerFilterTabs, query]);

  const selected = offers.find((offer) => offer.id === selectedId);
  const categoriesForNetwork = categories.filter((category) => category.network_slug === network);
  const cost = selected?.provider_cost ?? 0;

  const fallbackOffersForStudio = useMemo(() => {
    if (!fallbackProviderId) return [];
    return offers.filter(
      (o) => (o.network_slug || "").toLowerCase() === network && o.provider_id === fallbackProviderId && o.is_available,
    );
  }, [offers, network, fallbackProviderId]);

  const selectedFallbackOffer = offers.find((o) => o.id === fallbackOfferId);

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
      setNotice({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  function syncAll() {
    startSync(async () => {
      const result = await syncAllDataProviders();
      setNotice({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  function quickToggleStatus(bundle: Bundle) {
    const nextStatus = bundle.status === "active" ? "disabled" : "active";
    setBusyBundleId(bundle.id);
    startOp(async () => {
      try {
        const result = await toggleDataBundleStatus({ id: bundle.id, status: nextStatus });
        setNotice({ tone: result.ok ? "success" : "error", text: result.message });
        if (result.ok) router.refresh();
      } finally {
        setBusyBundleId(null);
      }
    });
  }

  function quickRequeryTx(transactionId: string) {
    setBusyTxId(transactionId);
    startOp(async () => {
      try {
        const result = await runProviderRequeryNow({
          transactionId,
          reason: "Requeried directly from Data Bundles workspace.",
        });
        setNotice({ tone: result.ok ? "success" : "error", text: result.message });
        router.refresh();
      } finally {
        setBusyTxId(null);
      }
    });
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const category = String(fd.get("category") || "").trim();
    if (!category) {
      setNotice({ tone: "error", text: "Please select a duration group." });
      return;
    }
    const selectedValidity = selected ? getOfferValidity(selected) : { label: "", hours: null };
    const effectiveMb =
      Number(selected?.data_amount_mb ?? dataAmountMbFromName(selected?.provider_name || "")) ||
      Number(fd.get("dataAmountMb")) ||
      0;
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
        fallbackProviderId: selectedFallbackOffer?.provider_id ?? null,
        fallbackCatalogueItemId: selectedFallbackOffer?.id ?? null,
        fallbackProductCode: selectedFallbackOffer?.provider_product_code ?? null,
        fallbackCost: selectedFallbackOffer?.provider_cost ?? 0,
        sellingPrice: Number(retail),
        cashbackAmount: Number(cashback) || 0,
        placement: String(fd.get("placement")),
        badge: String(fd.get("badge")) || null,
        status: String(fd.get("status")),
      });
      setNotice({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setStudioOpen(false);
        setSelectedId("");
        setRetail("");
        setMargin("");
        setCashback("0");
        setFallbackProviderId("");
        setFallbackOfferId("");
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

  const availableEditFallbackOffers = useMemo(() => {
    if (!editingBundle || !editFallbackProviderId) return [];
    const net = (editingBundle.network || "mtn").toLowerCase();
    return offers.filter(
      (o) => (o.network_slug || "").toLowerCase() === net && o.provider_id === editFallbackProviderId && o.is_available,
    );
  }, [offers, editingBundle, editFallbackProviderId]);

  const activeEditOffer = useMemo(() => offers.find((o) => o.id === editOfferId), [offers, editOfferId]);
  const activeEditFallbackOffer = useMemo(() => offers.find((o) => o.id === editFallbackOfferId), [offers, editFallbackOfferId]);
  const editCost = activeEditOffer ? activeEditOffer.provider_cost : (editingBundle?.provider_cost || 0);

  function bundleHealthDisplay(bundle: Bundle) {
    const h = bundle.metadata?.health;
    const effective = h?.overrideStatus && h.overrideStatus !== "auto" ? h.overrideStatus : (h?.status ?? "unverified");
    const rate = typeof h?.successRate === "number" ? `${h.successRate}%` : null;
    const total = typeof h?.recentTotal === "number" && h.recentTotal > 0 ? `${h.recentTotal} tx` : null;
    const statsSub = [rate, total].filter(Boolean).join(" · ");

    if (effective === "outage") {
      return {
        label: h?.catalogueAvailable === false ? "Missing in Sync" : "Unavailable",
        badgeClass: "bg-rose-50 text-rose-700",
        dotClass: "bg-rose-500",
        sub: h?.lastError || statsSub || "Suspended from customer checkout",
      };
    }
    if (effective === "degraded") {
      return {
        label: "Degraded",
        badgeClass: "bg-amber-50 text-amber-700",
        dotClass: "bg-amber-500",
        sub: h?.lastError || statsSub || "Elevated failure rate",
      };
    }
    if (effective === "advisory") {
      return {
        label: "SIM Advisory",
        badgeClass: "bg-sky-50 text-sky-700",
        dotClass: "bg-sky-500",
        sub: h?.customNotice || h?.lastError || "Eligible subscriber SIMs only",
      };
    }
    if (effective === "healthy") {
      return {
        label: "Verified",
        badgeClass: "bg-emerald-50 text-emerald-700",
        dotClass: "bg-emerald-500",
        sub: statsSub || "Live catalogue verified",
      };
    }
    return {
      label: "Unchecked",
      badgeClass: "bg-zinc-100 text-zinc-600",
      dotClass: "bg-zinc-400",
      sub: "Run health check",
    };
  }

  function runHealthCheck() {
    startHealthCheck(async () => {
      const result = await runDataBundleHealthCheck();
      setNotice({ tone: result.ok ? "success" : "error", text: result.message });
      router.refresh();
    });
  }

  function runSingleHealthCheck(productId: string) {
    setBusyBundleId(productId);
    startOp(async () => {
      try {
        const result = await checkSingleDataBundleHealth({ productId });
        setNotice({ tone: result.ok ? "success" : "error", text: result.message });
        router.refresh();
      } finally {
        setBusyBundleId(null);
      }
    });
  }

  function openEditDrawer(bundle: Bundle) {
    setEditingBundle(bundle);
    setEditRetail(String(bundle.selling_price));
    setEditCashback(String(Number(bundle.cashback_amount ?? 0)));
    setEditStatus(
      bundle.status === "active" || bundle.status === "disabled" ? bundle.status : "draft",
    );
    const health = bundle.metadata?.health;
    setEditHealthOverride(health?.overrideStatus ?? "auto");
    setEditAdvisoryNote(health?.customNotice ?? "");
    const costVal = bundle.provider_cost || 0;
    setEditMargin(bundle.selling_price >= costVal ? String(bundle.selling_price - costVal) : "");

    const provider = pickOne(bundle.provider);
    const initialProviderId = bundle.provider_id || provider?.id || "";
    setEditProviderId(initialProviderId);

    const matchedOffer = offers.find(
      (o) =>
        (o.network_slug || "").toLowerCase() === (bundle.network || "").toLowerCase() &&
        (!initialProviderId || o.provider_id === initialProviderId) &&
        (bundle.provider_product_code ? o.provider_product_code === bundle.provider_product_code : false),
    );
    setEditOfferId(matchedOffer?.id || "");

    const activeRoutes = offersByProduct.get(bundle.id) ?? [];
    const fallbackRoute = activeRoutes.find((r) => r.priority > 100 && r.provider_id !== initialProviderId) ?? activeRoutes[1];
    if (fallbackRoute) {
      setEditFallbackProviderId(fallbackRoute.provider_id);
      const matchedFallback = offers.find(
        (o) =>
          o.id === fallbackRoute.provider_catalogue_item_id ||
          (o.provider_id === fallbackRoute.provider_id && o.provider_product_code === fallbackRoute.provider_product_code),
      );
      setEditFallbackOfferId(matchedFallback?.id || "");
    } else {
      setEditFallbackProviderId("");
      setEditFallbackOfferId("");
    }
  }

  function handleEditProviderChange(newProviderId: string) {
    setEditProviderId(newProviderId);
    const net = (editingBundle?.network || "mtn").toLowerCase();
    const providerOffers = offers.filter(
      (o) => (o.network_slug || "").toLowerCase() === net && o.provider_id === newProviderId && o.is_available,
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
      setNotice({ tone: "error", text: "Please select a duration group." });
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

      const result = await saveDataBundle({
        id: editingBundle.id,
        name: String(fd.get("name")),
        network: editingBundle.network || "mtn",
        category,
        dataAmountMb: finalDataAmountMb,
        validity: finalValidity,
        providerCatalogueItemId: selectedOffer?.id ?? null,
        providerId: finalProviderId,
        providerProductCode: finalProductCode,
        providerCost: finalCost,
        fallbackProviderId: activeEditFallbackOffer?.provider_id ?? null,
        fallbackCatalogueItemId: activeEditFallbackOffer?.id ?? null,
        fallbackProductCode: activeEditFallbackOffer?.provider_product_code ?? null,
        fallbackCost: activeEditFallbackOffer?.provider_cost ?? 0,
        sellingPrice: Number(editRetail),
        cashbackAmount: Number(editCashback) || 0,
        placement: String(fd.get("placement")),
        badge: String(fd.get("badge")) || null,
        advisoryNote: editAdvisoryNote.trim() || null,
        healthOverride: editHealthOverride,
        status: String(fd.get("status")),
      });
      setNotice({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setEditingBundle(null);
        router.refresh();
      }
    });
  }

  const activeBundleCount = bundles.filter((b) => b.status === "active").length;
  const studioNetProfit = Number(retail || 0) - cost - Number(cashback || 0);
  const editNetProfit = Number(editRetail || 0) - editCost - Number(editCashback || 0);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Data Bundles"
        actions={
          <>
            <button
              type="button"
              className={button.secondary}
              disabled={checkingHealth}
              onClick={runHealthCheck}
            >
              <AdminIcon name="health" className={cn(checkingHealth && "animate-pulse")} />
              {checkingHealth ? "Checking…" : "Check health"}
            </button>
            <button
              type="button"
              className={button.secondary}
              disabled={syncing}
              onClick={syncAll}
            >
              <AdminIcon name="refresh" className={cn(syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync providers"}
            </button>
            <ExportAction source="service_products" />
            <button type="button" className={button.primary} onClick={() => setStudioOpen(true)}>
              <AdminIcon name="plus" />
              Add bundle
            </button>
          </>
        }
      />

      <StatBand
        stats={[
          { label: "30d success rate", value: `${analytics.successRate}%`, ring: analytics.successRate },
          { label: "30d sales volume", value: money.format(analytics.revenue30d), icon: "wallet", tone: "primary" },
          {
            label: "30d net profit",
            value: money.format(analytics.grossProfit30d),
            icon: analytics.grossProfit30d < 0 ? "trendDown" : "trendUp",
            tone: analytics.grossProfit30d < 0 ? "rose" : "emerald",
          },
          analytics.pendingCount > 0
            ? { label: "Needs attention", value: analytics.pendingCount, icon: "clock", tone: "amber" }
            : { label: "Active bundles", value: `${activeBundleCount}/${bundles.length}`, icon: "wifi", tone: "primary" },
        ]}
      />

      {/* Rewards & Promotions Context Strip */}
      <section className={cn(card, "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5")}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/admin/platform/features" className="inline-flex items-center gap-2 text-[13px] font-semibold text-zinc-800 hover:text-primary">
            <span className={cn("size-2 rounded-full", cashbackEnabled ? "bg-emerald-500" : "bg-zinc-400")} />
            <span>Cashback {cashbackEnabled ? "Active" : "Paused"}</span>
            <span className="font-mono text-[12px] font-normal text-zinc-500">
              {money.format(analytics.cashbackCost30d)} (30d)
            </span>
          </Link>

          <span className="hidden h-4 w-px bg-[color:var(--a-border)] sm:inline-block" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800">
              <AdminIcon name="coupon" className="size-4 text-primary" />
              Promos
            </span>
            {activeCoupons.slice(0, 3).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center rounded-[7px] bg-a-primary-soft px-2 py-0.5 font-mono text-[11.5px] font-semibold text-primary"
              >
                {c.code}
              </span>
            ))}
            <span className="font-mono text-[12px] text-zinc-500">
              {money.format(analytics.discountCost30d)} redeemed
            </span>
          </div>
        </div>

        <Link href="/admin/growth/coupons" className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">
          Manage promos
          <AdminIcon name="arrowUpRight" className="size-3.5" />
        </Link>
      </section>

      {notice ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-[8px] border px-4 py-3 text-[13px] font-medium",
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          <span className="flex items-center gap-2">
            <AdminIcon name={notice.tone === "success" ? "checkCircle" : "alert"} className="size-4 shrink-0" />
            {notice.text}
          </span>
          <button
            type="button"
            className="rounded-[6px] p-1 text-current opacity-60 hover:opacity-100"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <AdminIcon name="close" className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* Main Workspace Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Data bundle sections"
          value={activeTab}
          onChange={(value) => setActiveTab(value as "inventory" | "purchases" | "analytics")}
          options={[
            { value: "inventory", label: "Bundles", count: bundles.length },
            { value: "purchases", label: "Purchases", count: recentPurchases.length },
            { value: "analytics", label: "Analytics", count: analytics.totalOrders30d },
          ]}
        />
      </div>

      {/* TAB 1: BUNDLE INVENTORY */}
      {activeTab === "inventory" ? (
        <section className={styles.workspacePanel}>
          <div className={styles.directoryHeader}>
            <div className={styles.directoryTop}>
              <div className={styles.directoryTitle}>
                <h2>Bundle directory</h2>
                <span className={styles.countPill}>{visibleBundles.length}</span>
              </div>
              <div className={styles.directoryTools}>
                <label className={styles.directorySearch}>
                  <AdminIcon name="search" />
                  <input
                    value={tableQuery}
                    onChange={(e) => setTableQuery(e.target.value)}
                    placeholder="Search bundles or codes..."
                  />
                </label>
                <FilterPicker
                  value={tableStatus}
                  onChange={setTableStatus}
                  options={statusOptions}
                  allLabel="All statuses"
                  width={150}
                />
                <button
                  type="button"
                  className={button.soft}
                  disabled={checkingHealth}
                  onClick={runHealthCheck}
                >
                  <AdminIcon name="health" className={cn(checkingHealth && "animate-pulse")} />
                  {checkingHealth ? "Checking…" : "Run health check"}
                </button>
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

          {/* Desktop Table */}
          <div className={cn(styles.workspaceTableWrap, "hidden md:block")}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Bundle</th>
                  <th>Routing & Fallback</th>
                  <th>Pricing & Cashback</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleBundles.length ? (
                  visibleBundles.map((bundle) => {
                    const provider = pickOne(bundle.provider);
                    const placement = bundle.placement?.[0];
                    const categoryName = getBundleCategory(bundle);
                    const cashbackAmt = Number(bundle.cashback_amount ?? 0);
                    const netProfit = bundle.selling_price - (bundle.provider_cost || 0) - cashbackAmt;
                    const routes = offersByProduct.get(bundle.id) ?? [];
                    const fallbackRoute = routes.find((r) => r.priority > 100) ?? routes[1];
                    const fallbackProvider = fallbackRoute ? pickOne(fallbackRoute.provider) : null;
                    const health = bundleHealthDisplay(bundle);

                    return (
                      <tr key={bundle.id}>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong>{bundle.name}</strong>
                            <small className="font-mono">
                              {bundle.network?.toUpperCase() || "DATA"} · {categoryName}
                              {bundle.provider_product_code ? ` · ${bundle.provider_product_code}` : ""}
                              {placement?.is_active ? ` · ${placement.badge || placement.surface.replace("_", " ")}` : ""}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong>{provider ? provider.name : "Unlinked"}</strong>
                            <small className="font-mono">
                              {provider ? `Cost ${money.format(bundle.provider_cost)}` : "No offer"}
                              {fallbackProvider ? ` · Fallback: ${fallbackProvider.name}` : ""}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className={styles.cellValue}>
                            <strong>{money.format(bundle.selling_price)}</strong>
                            <small className="font-mono">
                              {cashbackAmt > 0 ? `+${money.format(cashbackAmt)} CB · ` : ""}
                              {netProfit >= 0 ? `+${money.format(netProfit)}` : money.format(netProfit)} net
                            </small>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => runSingleHealthCheck(bundle.id)}
                            disabled={opPending && busyBundleId === bundle.id}
                            className="group flex cursor-pointer flex-col items-start gap-0.5 rounded-[8px] px-1.5 py-1 -mx-1.5 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Click to run health check"
                          >
                            <span
                              className={cn(
                                "inline-flex w-fit items-center gap-1.5 rounded-[7px] border border-transparent px-2 py-0.5 text-[11.5px] font-semibold transition-colors group-hover:border-primary/20",
                                health.badgeClass,
                              )}
                            >
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  health.dotClass,
                                  opPending && busyBundleId === bundle.id && "animate-ping",
                                )}
                              />
                              {opPending && busyBundleId === bundle.id ? "Checking…" : health.label}
                            </span>
                            <small className="max-w-[190px] truncate font-mono text-[11px] text-zinc-500 group-hover:text-primary group-hover:underline">
                              {health.sub}
                            </small>
                          </button>
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
                              disabled={opPending && busyBundleId === bundle.id}
                              aria-label="Run health check"
                              data-tip="Run health check"
                              onClick={() => runSingleHealthCheck(bundle.id)}
                            >
                              <AdminIcon name="health" className={cn(opPending && busyBundleId === bundle.id && "animate-pulse")} />
                            </button>
                            <button
                              type="button"
                              className={styles.iconAction}
                              disabled={opPending && busyBundleId === bundle.id}
                              aria-label={bundle.status === "active" ? "Pause bundle" : "Activate bundle"}
                              data-tip={bundle.status === "active" ? "Pause bundle" : "Activate bundle"}
                              onClick={() => quickToggleStatus(bundle)}
                            >
                              <AdminIcon name={bundle.status === "active" ? "blocked" : "checkCircle"} />
                            </button>
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
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="divide-y divide-[color:var(--a-border)] md:hidden">
            {visibleBundles.length ? (
              visibleBundles.map((bundle) => {
                const provider = pickOne(bundle.provider);
                const cashbackAmt = Number(bundle.cashback_amount ?? 0);
                const netProfit = bundle.selling_price - (bundle.provider_cost || 0) - cashbackAmt;
                const health = bundleHealthDisplay(bundle);
                return (
                  <div key={bundle.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="truncate text-[14px] font-semibold text-zinc-900">{bundle.name}</strong>
                        <StatusBadge value={bundle.status} size="sm" />
                        <button
                          type="button"
                          onClick={() => runSingleHealthCheck(bundle.id)}
                          disabled={opPending && busyBundleId === bundle.id}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50",
                            health.badgeClass,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", health.dotClass)} />
                          {opPending && busyBundleId === bundle.id ? "Checking…" : health.label}
                        </button>
                      </div>
                      <p className="truncate font-mono text-[11.5px] text-zinc-500">
                        {bundle.network?.toUpperCase()} · {provider?.name || "Unlinked"} · Cost {money.format(bundle.provider_cost)}
                      </p>
                      <p className="truncate font-mono text-[11px] text-zinc-500">
                        {money.format(bundle.selling_price)} · {netProfit >= 0 ? `+${money.format(netProfit)}` : money.format(netProfit)} net · {health.sub}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        className={styles.iconAction}
                        disabled={opPending && busyBundleId === bundle.id}
                        onClick={() => runSingleHealthCheck(bundle.id)}
                        aria-label="Run health check"
                      >
                        <AdminIcon name="health" className={cn(opPending && busyBundleId === bundle.id && "animate-pulse")} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconAction}
                        disabled={opPending && busyBundleId === bundle.id}
                        onClick={() => quickToggleStatus(bundle)}
                        aria-label={bundle.status === "active" ? "Pause bundle" : "Activate bundle"}
                      >
                        <AdminIcon name={bundle.status === "active" ? "blocked" : "checkCircle"} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconAction}
                        onClick={() => openEditDrawer(bundle)}
                        aria-label="Edit bundle"
                      >
                        <AdminIcon name="pencil" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-[13px] font-medium text-zinc-500">No bundles match filters</div>
            )}
          </div>

          <footer className={styles.workspaceFooter}>
            <span>Showing {visibleBundles.length} of {bundles.length} bundles</span>
          </footer>
        </section>
      ) : null}

      {/* TAB 2: PURCHASES & CONFLICT RESOLUTION */}
      {activeTab === "purchases" ? (
        <section className={styles.workspacePanel}>
          <div className={styles.directoryHeader}>
            <div className={styles.directoryTop}>
              <div className={styles.directoryTitle}>
                <h2>Data orders</h2>
                <span className={styles.countPill}>{recentPurchases.length}</span>
              </div>
              <ExportAction source="service_transactions" />
            </div>
            {purchaseFilter ? <PurchaseStatusFilter filter={purchaseFilter} /> : null}
          </div>

          {/* Desktop Table */}
          <div className={cn(styles.workspaceTableWrap, "hidden md:block")}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Recipient & Plan</th>
                  <th>Customer</th>
                  <th>Provider</th>
                  <th data-align="right">Economics</th>
                  <th>Status</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.length ? (
                  recentPurchases.map((raw) => {
                    const txId = String(raw.id);
                    const status = String(raw.status || "pending");
                    const ref = String(raw.internal_reference || "");
                    const providerRef = typeof raw.provider_reference === "string" ? raw.provider_reference : "";
                    const destination = String(raw.destination || "—");
                    const amount = Number(raw.amount ?? 0);
                    const costAmt = Number(raw.provider_cost ?? 0);
                    const cbAmt = Number(raw.cashback_amount ?? 0);
                    const marginAmt = Number(raw.gross_margin ?? amount - costAmt - cbAmt);
                    const meta = (raw.metadata ?? {}) as Record<string, unknown>;
                    const userRel = pickOne(raw.user as { id?: string; phone?: string; email?: string } | null);
                    const providerRel = pickOne(raw.provider as { name?: string } | null);
                    const when = new Date(String(raw.created_at));
                    const isFinal = ["successful", "refunded", "reversed", "cancelled"].includes(status);

                    return (
                      <tr key={txId}>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong className="font-mono">{destination}</strong>
                            <small className="font-mono">
                              {String(meta.productName || "Data Bundle")} · {ref}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong>{userRel?.email || userRel?.phone || "Customer"}</strong>
                            <small className="font-mono">
                              {when.toLocaleDateString("en-NG", { day: "numeric", month: "short" })} ·{" "}
                              {when.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong>{providerRel?.name || "Pending route"}</strong>
                            <small className="font-mono">{providerRef || "No vendor ref"}</small>
                          </div>
                        </td>
                        <td data-align="right">
                          <div className={styles.cellValue}>
                            <strong>{money.format(amount)}</strong>
                            <small className="font-mono">
                              Cost {money.format(costAmt)}
                              {cbAmt > 0 ? ` · CB ${money.format(cbAmt)}` : ""} ·{" "}
                              {marginAmt >= 0 ? `+${money.format(marginAmt)}` : money.format(marginAmt)}
                            </small>
                          </div>
                        </td>
                        <td>
                          <StatusBadge value={status} size="sm" />
                        </td>
                        <td data-align="right">
                          <div className={styles.rowActions}>
                            {!isFinal ? (
                              <button
                                type="button"
                                className={styles.iconAction}
                                disabled={opPending && busyTxId === txId}
                                aria-label="Requery provider"
                                data-tip="Requery provider now"
                                onClick={() => quickRequeryTx(txId)}
                              >
                                <AdminIcon name="refresh" className={cn(busyTxId === txId && "animate-spin")} />
                              </button>
                            ) : null}
                            <Link
                              href={`/admin/transactions/${txId}`}
                              className={styles.iconAction}
                              aria-label="Inspect transaction"
                              data-tip="Troubleshoot & resolve"
                            >
                              <AdminIcon name="arrowUpRight" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name="transactions" />
                        <strong>No data orders in this view</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="divide-y divide-[color:var(--a-border)] md:hidden">
            {recentPurchases.length ? (
              recentPurchases.map((raw) => {
                const txId = String(raw.id);
                const status = String(raw.status || "pending");
                const destination = String(raw.destination || "—");
                const amount = Number(raw.amount ?? 0);
                const meta = (raw.metadata ?? {}) as Record<string, unknown>;
                const isFinal = ["successful", "refunded", "reversed", "cancelled"].includes(status);

                return (
                  <div key={txId} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="font-mono text-[13.5px] font-semibold text-zinc-900">{destination}</strong>
                        <StatusBadge value={status} size="sm" />
                      </div>
                      <p className="truncate font-mono text-[11.5px] text-zinc-500">
                        {String(meta.productName || "Data Bundle")} · {money.format(amount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!isFinal ? (
                        <button
                          type="button"
                          className={styles.iconAction}
                          disabled={opPending && busyTxId === txId}
                          onClick={() => quickRequeryTx(txId)}
                          aria-label="Requery provider"
                        >
                          <AdminIcon name="refresh" />
                        </button>
                      ) : null}
                      <Link href={`/admin/transactions/${txId}`} className={styles.iconAction} aria-label="Inspect">
                        <AdminIcon name="arrowUpRight" />
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-[13px] font-medium text-zinc-500">No data orders yet</div>
            )}
          </div>
        </section>
      ) : null}

      {/* TAB 3: DATA ANALYTICS (30D) */}
      {activeTab === "analytics" ? (
        <div className="space-y-5">
          <StatBand
            stats={[
              { label: "Total orders", value: analytics.totalOrders30d, icon: "transactions", tone: "neutral" },
              { label: "Supplier cost", value: money.format(analytics.supplierCost30d), icon: "provider", tone: "neutral" },
              { label: "Cashback paid", value: money.format(analytics.cashbackCost30d), icon: "gift", tone: "amber" },
              { label: "Promo discounts", value: money.format(analytics.discountCost30d), icon: "coupon", tone: "primary" },
            ]}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className={cn(card, "p-5 sm:p-6")}>
              <SectionTitle title="Performance by Network" count={analytics.byNetwork.length} />
              {analytics.byNetwork.length ? (
                <div className="mt-4 divide-y divide-[color:var(--a-border)]">
                  {analytics.byNetwork.map((row) => {
                    const rate = row.total ? Math.round((row.success / row.total) * 100) : 0;
                    return (
                      <div key={row.network} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <strong className="block text-[14px] font-semibold tracking-tight text-zinc-900 uppercase">
                            {row.network}
                          </strong>
                          <span className="font-mono text-[11.5px] text-zinc-500">
                            {row.success}/{row.total} settled · {rate}% success
                          </span>
                        </div>
                        <div className="text-right">
                          <strong className="block text-[14px] font-semibold text-zinc-900 tabular-nums">
                            {money.format(row.revenue)}
                          </strong>
                          <span className="font-mono text-[11.5px] text-emerald-600">
                            +{money.format(row.profit)} net
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-[13px] font-medium text-zinc-500">No 30d network traffic yet</div>
              )}
            </section>

            <section className={cn(card, "p-5 sm:p-6")}>
              <SectionTitle title="Performance by Provider" count={analytics.byProvider.length} />
              {analytics.byProvider.length ? (
                <div className="mt-4 divide-y divide-[color:var(--a-border)]">
                  {analytics.byProvider.map((row) => {
                    const rate = row.total ? Math.round((row.success / row.total) * 100) : 0;
                    return (
                      <div key={row.providerId} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <strong className="block truncate text-[14px] font-semibold text-zinc-900">
                            {row.name}
                          </strong>
                          <span className="font-mono text-[11.5px] text-zinc-500">
                            {row.success}/{row.total} orders · {rate}% success
                          </span>
                        </div>
                        <div className="text-right">
                          <strong className="block text-[14px] font-semibold text-zinc-900 tabular-nums">
                            {money.format(row.revenue)}
                          </strong>
                          <span className="font-mono text-[11.5px] text-emerald-600">
                            +{money.format(row.profit)} net
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-[13px] font-medium text-zinc-500">No 30d provider traffic yet</div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {/* ADD BUNDLE STUDIO MODAL */}
      {studioOpen ? (() => {
        const netTheme: Record<string, { label: string; dot: string; activePill: string; tile: string }> = {
          mtn: {
            label: "MTN",
            dot: "bg-amber-400",
            activePill: "border-amber-300 bg-amber-50 text-amber-800",
            tile: "bg-amber-50 text-amber-700 border-amber-200",
          },
          airtel: {
            label: "Airtel",
            dot: "bg-rose-500",
            activePill: "border-rose-300 bg-rose-50 text-rose-800",
            tile: "bg-rose-50 text-rose-700 border-rose-200",
          },
          glo: {
            label: "Glo",
            dot: "bg-emerald-500",
            activePill: "border-emerald-300 bg-emerald-50 text-emerald-800",
            tile: "bg-emerald-50 text-emerald-700 border-emerald-200",
          },
          "9mobile": {
            label: "9mobile",
            dot: "bg-sky-500",
            activePill: "border-sky-300 bg-sky-50 text-sky-800",
            tile: "bg-sky-50 text-sky-700 border-sky-200",
          },
        };
        const currentTheme = netTheme[network] ?? netTheme.mtn;
        const studioRetailNum = Math.max(0, Number(retail) || 0);
        const studioCashbackNum = Math.max(0, Number(cashback) || 0);
        const studioPositiveNet = Math.max(0, studioNetProfit);
        const studioSplitTotal = Math.max(1, cost + studioCashbackNum + studioPositiveNet);
        const studioMarginPct = studioRetailNum > 0 ? ((studioNetProfit / studioRetailNum) * 100).toFixed(1) : "0.0";

        const offerTier = (name: string) => {
          if (/corporate/i.test(name)) return { label: "Corporate", cls: "bg-a-primary-soft text-primary" };
          if (/sme2/i.test(name)) return { label: "SME2", cls: "bg-sky-50 text-sky-700" };
          if (/sme/i.test(name)) return { label: "SME", cls: "bg-sky-50 text-sky-700" };
          if (/awoof/i.test(name)) return { label: "Awoof", cls: "bg-amber-50 text-amber-700" };
          if (/gifting/i.test(name)) return { label: "Gifting", cls: "bg-emerald-50 text-emerald-700" };
          if (/coupon/i.test(name)) return { label: "Coupon", cls: "bg-violet-50 text-violet-700" };
          return null;
        };

        return (
          <AdminModal
            title="Add Data Bundle"
            eyebrow={`${currentTheme.label} Catalogue`}
            onClose={() => setStudioOpen(false)}
            width={1080}
            flush
          >
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:h-[min(640px,calc(100dvh-140px))] lg:grid-cols-[460px_minmax(0,1fr)] lg:overflow-hidden">
              {/* LEFT PANE: NETWORK PILLS, PROVIDER & SUB-FILTERS */}
              <div className="flex min-h-0 flex-col border-b border-a-line bg-zinc-50/50 lg:border-r lg:border-b-0">
                <div className="space-y-3 border-b border-[color:var(--a-border)] bg-a-surface p-4">
                  {/* Colorful Network Pills */}
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Network">
                    {(["mtn", "airtel", "glo", "9mobile"] as const).map((netId) => {
                      const t = netTheme[netId];
                      const active = network === netId;
                      return (
                        <button
                          key={netId}
                          type="button"
                          onClick={() => {
                            setNetwork(netId);
                            setOfferFilter("all");
                            setSelectedId("");
                            setFallbackOfferId("");
                          }}
                          className={cn(
                            "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border text-[12px] font-semibold transition-all",
                            active
                              ? t.activePill
                              : "border-a-line bg-a-surface text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", t.dot)} />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Provider Picker + Sync */}
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <AdminSelect
                        id="provider-select"
                        value={providerId}
                        searchable={providers.length > 7}
                        searchPlaceholder="Search providers"
                        placeholder="All providers"
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
                          setOfferFilter("all");
                          setSelectedId("");
                          setQuery("");
                        }}
                      />
                    </div>
                    {selectedProvider ? (
                      <button
                        className={button.secondary}
                        type="button"
                        onClick={syncProvider}
                        disabled={syncing}
                        aria-label="Sync provider"
                      >
                        <AdminIcon name="refresh" className={cn(syncing && "animate-spin")} />
                        {syncing ? "Syncing…" : "Sync"}
                      </button>
                    ) : null}
                  </div>

                  {/* Search + Offer Count Pill */}
                  <div className="flex items-center gap-2">
                    <label className={cn(styles.directorySearch, "!h-9 !w-auto flex-1")}>
                      <AdminIcon name="search" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search size, SME, 30 days or code..."
                      />
                    </label>
                    <span className="inline-flex h-9 min-w-10 shrink-0 items-center justify-center rounded-[8px] bg-a-primary-soft px-2.5 font-mono text-[11.5px] font-semibold text-primary tabular-nums">
                      {visibleOffers.length}
                    </span>
                  </div>

                  {/* Dynamic Provider Sub-Filter Tabs */}
                  {offerFilterTabs.tabs.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5" role="tablist" aria-label="Plan filters">
                      {offerFilterTabs.tabs.map((tab) => {
                        const isActive = activeOfferFilter === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setOfferFilter(tab.id)}
                            className={cn(
                              "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11px] font-semibold transition-all",
                              isActive
                                ? "bg-primary text-white shadow-xs"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900",
                            )}
                          >
                            <span>{tab.label}</span>
                            <span
                              className={cn(
                                "font-mono text-[10px] tabular-nums",
                                isActive ? "text-white/80" : "text-zinc-400",
                              )}
                            >
                              {tab.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* Scrollable Supplier Offers */}
                <div className="min-h-[240px] flex-1 space-y-2 overflow-y-auto p-3.5">
                  {visibleOffers.length ? (
                    visibleOffers.map((offer) => {
                      const isSelected = selectedId === offer.id;
                      const tier = offerTier(offer.provider_name);
                      const val = getOfferValidity(offer).label || (offer.validity_hours ? `${offer.validity_hours}h` : "Standard");
                      return (
                        <button
                          key={offer.id}
                          type="button"
                          onClick={() => chooseOffer(offer.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-all",
                            isSelected
                              ? "border-primary/40 bg-a-primary-soft/60 shadow-xs"
                              : "border-[color:var(--a-border)] bg-a-surface hover:border-zinc-300",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex h-9 min-w-12 shrink-0 items-center justify-center rounded-[8px] border px-1.5 font-mono text-[11px] font-bold tabular-nums",
                              isSelected ? "border-primary/30 bg-primary text-white" : currentTheme.tile,
                            )}
                          >
                            {dataLabel(offer)}
                          </span>

                          <div className="min-w-0 flex-1 space-y-1">
                            <strong className="block truncate text-[12.5px] font-semibold text-zinc-900">
                              {offer.provider_name}
                            </strong>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {tier ? (
                                <span className={cn("rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold", tier.cls)}>
                                  {tier.label}
                                </span>
                              ) : null}
                              <span className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-600">
                                {val}
                              </span>
                              <span className="font-mono text-[10px] text-zinc-400">
                                #{offer.provider_product_code}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-[12.5px] font-semibold text-zinc-900 tabular-nums">
                              {money.format(offer.provider_cost)}
                            </span>
                            {isSelected ? (
                              <span className="grid size-5 place-items-center rounded-full bg-primary text-white">
                                <AdminIcon name="check" className="size-3" />
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-a-line bg-a-surface/70 p-6 text-center">
                      <AdminIcon name="catalogue" className="size-6 text-zinc-400" />
                      <strong className="text-[13px] font-semibold text-zinc-700">
                        {providerId ? "No matching plans" : "No plans for filter"}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: CONFIGURATION, ECONOMICS & SUBMIT */}
              <form
                key={selectedId || `unlinked-${network}`}
                className="flex min-h-0 flex-col bg-a-surface"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit(event.currentTarget);
                }}
              >
                <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
                  {/* Selected Offer Spotlight */}
                  {selected ? (() => {
                    const offerValidity = getOfferValidity(selected);
                    const offerMb = selected.data_amount_mb ?? dataAmountMbFromName(selected.provider_name);
                    const tier = offerTier(selected.provider_name);
                    return (
                      <div className="rounded-[12px] border border-primary/20 bg-a-primary-soft/50 p-3.5">
                        <input type="hidden" name="dataAmountMb" value={offerMb ?? ""} />
                        <input
                          type="hidden"
                          name="validity"
                          value={offerValidity.label || (selected.validity_hours ? `${selected.validity_hours / 24} days` : "")}
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={cn("inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[10.5px] font-semibold", currentTheme.activePill)}>
                                <span className={cn("size-1.5 rounded-full", currentTheme.dot)} />
                                {currentTheme.label}
                              </span>
                              <span className="rounded-[6px] bg-a-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold text-zinc-700">
                                {dataLabel(selected)}
                              </span>
                              {tier ? (
                                <span className={cn("rounded-[6px] px-2 py-0.5 text-[10.5px] font-semibold", tier.cls)}>
                                  {tier.label}
                                </span>
                              ) : null}
                              <span className="rounded-[6px] bg-a-surface px-2 py-0.5 font-mono text-[10.5px] text-zinc-500">
                                {offerValidity.label || "Standard"}
                              </span>
                            </div>
                            <strong className="block truncate text-[13.5px] font-semibold text-zinc-900">
                              {selected.provider_name}
                            </strong>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="block font-mono text-[10px] font-semibold text-zinc-500 uppercase">Cost</span>
                            <strong className="font-mono text-[15px] font-bold text-primary tabular-nums">
                              {money.format(cost)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-a-line bg-zinc-50/70 px-4 py-3 text-[12.5px] font-medium text-zinc-500">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border", currentTheme.tile)}>
                        <AdminIcon name="wifi" className="size-4" />
                      </span>
                      <span>Pick a {currentTheme.label} supplier offer on the left to link pricing & plan specs.</span>
                    </div>
                  )}

                  {/* Name & Category */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className={styles.fieldGroup}>
                      <label className={styles.inputLabel}>Bundle Name</label>
                      <input
                        name="name"
                        required
                        defaultValue={
                          selected
                            ? `${currentTheme.label.toUpperCase()} ${dataLabel(selected)} ${getOfferValidity(selected).label || "Data"}`
                            : ""
                        }
                        placeholder={`e.g. ${currentTheme.label} 5GB Weekly`}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.inputLabel}>
                        Duration Group <span className={styles.requiredMark}>*</span>
                      </label>
                      <AdminSelect
                        key={`${network}-${selected?.id || "none"}`}
                        name="category"
                        defaultValue={
                          selected
                            ? inferCategoryFromValidity(
                                getOfferValidity(selected).label,
                                getOfferValidity(selected).hours,
                                categoriesForNetwork,
                              )
                            : ""
                        }
                        placeholder="Select group"
                        options={categoriesForNetwork.map((category) => ({
                          value: category.slug,
                          label: category.name,
                        }))}
                      />
                    </div>
                  </div>

                  {/* Economics & Pricing */}
                  <div className="space-y-3 rounded-[12px] border border-a-line bg-zinc-50/50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-[10.5px] font-semibold tracking-wider text-zinc-400 uppercase">
                          Pricing Breakdown
                        </span>
                        <strong className="block text-[20px] leading-tight font-semibold tracking-[-0.03em] text-zinc-950 tabular-nums">
                          {retail ? money.format(studioRetailNum) : "₦0"}
                        </strong>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 font-mono text-[11.5px] font-semibold tabular-nums",
                          studioNetProfit < 0
                            ? "bg-rose-50 text-rose-700"
                            : retail
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-500",
                        )}
                      >
                        {retail
                          ? `${studioNetProfit >= 0 ? "+" : ""}${money.format(studioNetProfit)} net · ${studioMarginPct}%`
                          : "Enter price"}
                      </span>
                    </div>

                    <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-200/70">
                      {cost > 0 ? (
                        <span className="h-full rounded-full bg-zinc-400 transition-all" style={{ width: `${(cost / studioSplitTotal) * 100}%` }} />
                      ) : null}
                      {studioCashbackNum > 0 ? (
                        <span className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(studioCashbackNum / studioSplitTotal) * 100}%` }} />
                      ) : null}
                      {studioPositiveNet > 0 ? (
                        <span className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(studioPositiveNet / studioSplitTotal) * 100}%` }} />
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Selling Price</label>
                        <div className="flex h-10 items-center gap-1.5 rounded-[8px] border border-a-line bg-a-surface px-3 focus-within:border-primary/40">
                          <span className="font-mono text-[12px] text-zinc-400">₦</span>
                          <input
                            type="number"
                            min={cost}
                            step="0.01"
                            value={retail}
                            style={{ border: "none", background: "transparent", padding: 0, height: "100%", boxShadow: "none" }}
                            onChange={(event) => {
                              const val = event.target.value;
                              setRetail(val);
                              if (cost && Number(val) >= cost) setMargin(String(Number(val) - cost));
                              else setMargin("");
                            }}
                            required
                            placeholder="1500"
                          />
                        </div>
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Markup</label>
                        <div className="flex h-10 items-center gap-1.5 rounded-[8px] border border-a-line bg-a-surface px-3 focus-within:border-primary/40">
                          <span className="font-mono text-[12px] text-zinc-400">₦</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={margin}
                            style={{ border: "none", background: "transparent", padding: 0, height: "100%", boxShadow: "none" }}
                            onChange={(event) => setFromMargin(event.target.value)}
                            disabled={!selected}
                            placeholder={selected ? "100" : "—"}
                          />
                        </div>
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Cashback</label>
                        <div className="flex h-10 items-center gap-1.5 rounded-[8px] border border-a-line bg-a-surface px-3 focus-within:border-primary/40">
                          <span className="font-mono text-[12px] text-zinc-400">₦</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={cashback}
                            style={{ border: "none", background: "transparent", padding: 0, height: "100%", boxShadow: "none" }}
                            onChange={(event) => setCashback(event.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visibility Segmented Pills & Merchandising */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className={styles.fieldGroup}>
                      <label className={styles.inputLabel}>Visibility</label>
                      <input type="hidden" name="status" value={studioStatus} />
                      <div className="grid h-10 grid-cols-3 gap-1 rounded-[8px] border border-[color:var(--a-border)] bg-zinc-100 p-1">
                        {(
                          [
                            { value: "active", label: "Live", dot: "bg-emerald-500" },
                            { value: "draft", label: "Draft", dot: "bg-amber-500" },
                            { value: "disabled", label: "Off", dot: "bg-rose-500" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setStudioStatus(opt.value)}
                            className={cn(
                              "inline-flex items-center justify-center gap-1 rounded-[6px] text-[11.5px] font-semibold transition-all",
                              studioStatus === opt.value
                                ? "bg-a-surface text-zinc-950 shadow-xs"
                                : "text-zinc-500 hover:text-zinc-900",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", opt.dot)} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

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
                      <input name="badge" placeholder="Hot, Best Value…" />
                    </div>
                  </div>

                  {/* Failover Route */}
                  <div className="grid grid-cols-1 gap-3 rounded-[10px] border border-[color:var(--a-border)] bg-zinc-50/50 p-3 sm:grid-cols-5">
                    <div className={cn(styles.fieldGroup, "sm:col-span-2")}>
                      <label className={styles.inputLabel}>Failover Provider</label>
                      <AdminSelect
                        value={fallbackProviderId}
                        onValueChange={(val) => {
                          setFallbackProviderId(val);
                          setFallbackOfferId("");
                        }}
                        placeholder="Optional"
                        options={[
                          { value: "", label: "None" },
                          ...providers
                            .filter((p) => p.id !== selected?.provider_id)
                            .map((p) => ({ value: p.id, label: p.name, description: p.status })),
                        ]}
                      />
                    </div>
                    <div className={cn(styles.fieldGroup, "sm:col-span-3")}>
                      <label className={styles.inputLabel}>Failover Plan</label>
                      <AdminSelect
                        value={fallbackOfferId}
                        searchable
                        searchPlaceholder="Search fallback plan..."
                        onValueChange={setFallbackOfferId}
                        placeholder={fallbackProviderId ? "Choose plan" : "Pick provider first"}
                        options={
                          fallbackOffersForStudio.length > 0
                            ? fallbackOffersForStudio.map((o) => ({
                                value: o.id,
                                label: formatOfferOptionLabel(o),
                                description: `${money.format(o.provider_cost)} (${o.provider_product_code})`,
                              }))
                            : [{ value: "", label: "None" }]
                        }
                      />
                    </div>
                  </div>
                </div>

                <footer className="flex items-center justify-between gap-3 border-t border-a-line px-5 py-3.5 sm:px-6">
                  <span className="font-mono text-[11px] text-zinc-400">
                    {selected ? `${selected.provider_product_code} · ${money.format(cost)} cost` : "Ready to publish"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={button.secondary}
                      onClick={() => setStudioOpen(false)}
                    >
                      Cancel
                    </button>
                    <button className={button.primary} disabled={saving} type="submit">
                      {saving ? "Saving…" : "Save Bundle"}
                    </button>
                  </div>
                </footer>
              </form>
            </div>
          </AdminModal>
        );
      })() : null}

      {/* CENTERED EDIT BUNDLE MODAL */}
      {editingBundle ? (() => {
        const netKey = (editingBundle.network || "mtn").toLowerCase();
        const netStyles: Record<string, { label: string; dot: string; pill: string; tile: string; cardBg: string }> = {
          mtn: {
            label: "MTN",
            dot: "bg-amber-400",
            pill: "border-amber-200 bg-amber-50 text-amber-800",
            tile: "border-amber-200 bg-amber-50 text-amber-700",
            cardBg: "border-amber-200/80 bg-amber-50/35",
          },
          airtel: {
            label: "Airtel",
            dot: "bg-rose-500",
            pill: "border-rose-200 bg-rose-50 text-rose-800",
            tile: "border-rose-200 bg-rose-50 text-rose-700",
            cardBg: "border-rose-200/80 bg-rose-50/35",
          },
          glo: {
            label: "Glo",
            dot: "bg-emerald-500",
            pill: "border-emerald-200 bg-emerald-50 text-emerald-800",
            tile: "border-emerald-200 bg-emerald-50 text-emerald-700",
            cardBg: "border-emerald-200/80 bg-emerald-50/35",
          },
          "9mobile": {
            label: "9mobile",
            dot: "bg-sky-500",
            pill: "border-sky-200 bg-sky-50 text-sky-800",
            tile: "border-sky-200 bg-sky-50 text-sky-700",
            cardBg: "border-sky-200/80 bg-sky-50/35",
          },
        };
        const t = netStyles[netKey] ?? netStyles.mtn;
        const editRetailNum = Math.max(0, Number(editRetail) || 0);
        const editCashbackNum = Math.max(0, Number(editCashback) || 0);
        const editMarginPct = editRetailNum > 0 ? ((editNetProfit / editRetailNum) * 100).toFixed(1) : "0.0";
        const positiveNet = Math.max(0, editNetProfit);
        const splitTotal = Math.max(1, editCost + editCashbackNum + positiveNet);
        const costWidth = (editCost / splitTotal) * 100;
        const cashbackWidth = (editCashbackNum / splitTotal) * 100;
        const profitWidth = (positiveNet / splitTotal) * 100;
        const activeCode = activeEditOffer?.provider_product_code || editingBundle.provider_product_code || "Unlinked";
        const activeSize = activeEditOffer
          ? dataLabel(activeEditOffer)
          : editingBundle.metadata?.data_amount_mb
            ? editingBundle.metadata.data_amount_mb >= 1000
              ? `${editingBundle.metadata.data_amount_mb / 1000}GB`
              : `${editingBundle.metadata.data_amount_mb}MB`
            : "Data";
        const activeValidity = activeEditOffer
          ? getOfferValidity(activeEditOffer).label || editingBundle.validity || "Standard"
          : editingBundle.validity || "Standard";

        return (
          <AdminModal
            title={editingBundle.name}
            eyebrow={`${t.label} · ${activeSize} · ${activeCode}`}
            onClose={() => setEditingBundle(null)}
            width={960}
            flush
          >
            <form
              className="flex max-h-[min(700px,calc(100dvh-96px))] min-h-0 flex-1 flex-col bg-a-surface"
              onSubmit={(event) => {
                event.preventDefault();
                submitEdit(event.currentTarget);
              }}
            >
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                {/* Top Split: Economics & Diagnostics + Bundle Settings */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* Left: Carrier Identity, Economics & Health Diagnostics */}
                  <div className={cn("flex flex-col justify-between gap-4 rounded-[12px] border p-5 lg:col-span-5", t.cardBg)}>
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-2.5 py-1 text-[11px] font-semibold", t.pill)}>
                            <span className={cn("size-1.5 rounded-full", t.dot)} />
                            {t.label}
                          </span>
                          <span className={cn("inline-flex items-center whitespace-nowrap rounded-[7px] border px-2.5 py-1 font-mono text-[11px] font-bold", t.tile)}>
                            {activeSize}
                          </span>
                          <span className="whitespace-nowrap rounded-[7px] border border-[color:var(--a-border)] bg-a-surface px-2.5 py-1 font-mono text-[11px] font-medium text-zinc-600">
                            {activeValidity}
                          </span>
                        </div>
                        <StatusBadge value={editStatus} size="sm" />
                      </div>

                      <div className="space-y-1.5">
                        <span className="block font-mono text-[10.5px] font-semibold tracking-wider text-zinc-500 uppercase">
                          Customer Price
                        </span>
                        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                          <strong className="text-[30px] leading-none font-semibold tracking-[-0.03em] text-zinc-950 tabular-nums">
                            {money.format(editRetailNum)}
                          </strong>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[8px] px-2.5 py-1 font-mono text-[11.5px] font-semibold tabular-nums",
                              editNetProfit < 0
                                ? "bg-rose-50 text-rose-700"
                                : "bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {editNetProfit >= 0 ? "+" : ""}
                            {money.format(editNetProfit)} ({editMarginPct}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[10px] border border-[color:var(--a-border)] bg-a-surface p-4">
                      <div className="flex h-2 w-full gap-1 overflow-hidden rounded-full bg-zinc-100">
                        {editCost > 0 ? (
                          <span className="h-full rounded-full bg-zinc-400 transition-all" style={{ width: `${costWidth}%` }} />
                        ) : null}
                        {editCashbackNum > 0 ? (
                          <span className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${cashbackWidth}%` }} />
                        ) : null}
                        {positiveNet > 0 ? (
                          <span className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${profitWidth}%` }} />
                        ) : null}
                      </div>
                      <div className="grid grid-cols-3 gap-3 font-mono">
                        <div className="space-y-0.5">
                          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase">
                            <span className="size-1.5 rounded-full bg-zinc-400" />
                            Cost
                          </span>
                          <span className="block truncate text-[12px] font-semibold text-zinc-800 tabular-nums">
                            {money.format(editCost)}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="flex items-center gap-1.5 text-[10px] text-amber-700 uppercase">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            Cashback
                          </span>
                          <span className="block truncate text-[12px] font-semibold text-amber-700 tabular-nums">
                            {money.format(editCashbackNum)}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center justify-end gap-1.5 text-[10px] uppercase",
                              editNetProfit < 0 ? "text-rose-600" : "text-emerald-700",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", editNetProfit < 0 ? "bg-rose-500" : "bg-emerald-500")} />
                            Net
                          </span>
                          <span
                            className={cn(
                              "block truncate text-[12px] font-semibold tabular-nums",
                              editNetProfit < 0 ? "text-rose-600" : "text-emerald-700",
                            )}
                          >
                            {money.format(editNetProfit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Plan Diagnostics Card */}
                    {(() => {
                      const hMeta = bundleHealthDisplay(editingBundle);
                      const snap = editingBundle.metadata?.health;
                      const detailText = snap?.lastError
                        ? snap.lastError
                        : snap?.catalogueAvailable === true
                          ? "Active in live vendor catalogue"
                          : snap?.catalogueAvailable === false
                            ? "Missing from supplier sync"
                            : hMeta.sub;
                      return (
                        <div className="space-y-2.5 rounded-[10px] border border-[color:var(--a-border)] bg-a-surface p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold", hMeta.badgeClass)}>
                              <span className={cn("size-1.5 rounded-full", hMeta.dotClass)} />
                              {hMeta.label}
                            </span>
                            <button
                              type="button"
                              disabled={opPending && busyBundleId === editingBundle.id}
                              onClick={() => runSingleHealthCheck(editingBundle.id)}
                              className="shrink-0 whitespace-nowrap rounded-[8px] border border-primary/20 bg-primary/[0.08] px-3 py-1.5 text-[11.5px] font-semibold text-primary transition hover:bg-primary/[0.14] disabled:opacity-50"
                            >
                              {opPending && busyBundleId === editingBundle.id ? "Checking…" : "Run check"}
                            </button>
                          </div>
                          {detailText ? (
                            <p
                              className={cn(
                                "text-[11.5px] leading-relaxed",
                                snap?.lastError ? "text-rose-700" : "text-zinc-500",
                              )}
                            >
                              {detailText}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right: Identity, Pricing & Visibility Controls */}
                  <div className="space-y-4 rounded-[12px] border border-a-line bg-a-surface p-5 lg:col-span-7">
                    <input type="hidden" name="status" value={editStatus} />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                      <div className={cn(styles.fieldGroup, "sm:col-span-7")}>
                        <label className={styles.inputLabel}>Bundle Name</label>
                        <input name="name" defaultValue={editingBundle.name} required />
                      </div>

                      <div className={cn(styles.fieldGroup, "sm:col-span-5")}>
                        <label className={styles.inputLabel}>
                          Duration Group <span className={styles.requiredMark}>*</span>
                        </label>
                        <AdminSelect
                          name="category"
                          variant="compact"
                          defaultValue={editingBundle.metadata?.category || ""}
                          placeholder="Select group"
                          options={categories
                            .filter((c) => !editingBundle.network || c.network_slug.toLowerCase() === editingBundle.network.toLowerCase())
                            .map((c) => ({ value: c.slug, label: c.name }))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Selling Price</label>
                        <div className="flex h-10 items-center gap-2 rounded-[8px] border border-[color:var(--a-border)] bg-a-surface px-3.5 transition hover:border-zinc-300 focus-within:border-primary/40">
                          <span className="shrink-0 font-mono text-[12px] text-zinc-400">₦</span>
                          <input
                            type="number"
                            min={editCost}
                            step="0.01"
                            value={editRetail}
                            style={{ border: "none", background: "transparent", padding: 0, height: "100%", boxShadow: "none", outline: "none" }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditRetail(val);
                              if (Number(val) >= editCost) setEditMargin(String(Number(val) - editCost));
                              else setEditMargin("");
                            }}
                            required
                          />
                        </div>
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Markup</label>
                        <div className="flex h-10 items-center gap-2 rounded-[8px] border border-[color:var(--a-border)] bg-a-surface px-3.5 transition hover:border-zinc-300 focus-within:border-primary/40">
                          <span className="shrink-0 font-mono text-[12px] text-zinc-400">₦</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editMargin}
                            style={{ border: "none", background: "transparent", padding: 0, height: "100%", boxShadow: "none", outline: "none" }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditMargin(val);
                              if (Number(val) >= 0) setEditRetail(String(editCost + Number(val)));
                            }}
                            placeholder="100"
                          />
                        </div>
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Cashback</label>
                        <div className="flex h-10 items-center gap-2 rounded-[8px] border border-[color:var(--a-border)] bg-a-surface px-3.5 transition hover:border-zinc-300 focus-within:border-primary/40">
                          <span className="shrink-0 font-mono text-[12px] text-zinc-400">₦</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editCashback}
                            style={{ border: "none", background: "transparent", padding: 0, height: "100%", boxShadow: "none", outline: "none" }}
                            onChange={(e) => setEditCashback(e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Visibility</label>
                        <div
                          role="radiogroup"
                          aria-label="Publishing status"
                          className="grid h-10 grid-cols-3 gap-1 rounded-[8px] border border-[color:var(--a-border)] bg-zinc-100 p-1"
                        >
                          {(
                            [
                              { value: "active", label: "Live", dot: "bg-emerald-500" },
                              { value: "draft", label: "Draft", dot: "bg-amber-500" },
                              { value: "disabled", label: "Off", dot: "bg-rose-500" },
                            ] as const
                          ).map((opt) => {
                            const selectedOpt = editStatus === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={selectedOpt}
                                onClick={() => setEditStatus(opt.value)}
                                className={cn(
                                  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 text-[12px] font-semibold transition-all",
                                  selectedOpt
                                    ? "bg-a-surface text-zinc-950 shadow-xs"
                                    : "text-zinc-500 hover:text-zinc-900",
                                )}
                              >
                                <span className={cn("size-1.5 shrink-0 rounded-full", opt.dot)} />
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Placement</label>
                        <AdminSelect
                          name="placement"
                          variant="compact"
                          defaultValue={editingBundle.placement?.[0]?.surface || "none"}
                          options={[
                            { value: "none", label: "Standard List" },
                            { value: "home_quick", label: "Home Quick Row" },
                            { value: "data_top", label: "Top Picks" },
                            { value: "data_recommended", label: "Recommended" },
                          ]}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Health Mode</label>
                        <AdminSelect
                          variant="compact"
                          value={editHealthOverride}
                          onValueChange={(val) => setEditHealthOverride(val as HealthOverrideMode)}
                          options={[
                            { value: "auto", label: "Auto" },
                            { value: "healthy", label: "Verified" },
                            { value: "advisory", label: "SIM Advisory" },
                            { value: "outage", label: "Unavailable" },
                          ]}
                        />
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.inputLabel}>Badge</label>
                        <input
                          name="badge"
                          defaultValue={editingBundle.placement?.[0]?.badge || ""}
                          placeholder="Hot, Best Value…"
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.inputLabel}>Customer Advisory</label>
                      <input
                        value={editAdvisoryNote}
                        onChange={(e) => setEditAdvisoryNote(e.target.value)}
                        placeholder="Optional advisory note (e.g. Eligible SIMs only)"
                        maxLength={240}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Side-by-Side Routing Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-3.5 rounded-[12px] border border-a-line bg-zinc-50/60 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Primary Route
                      </span>
                      <span className="rounded-[7px] border border-[color:var(--a-border)] bg-a-surface px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-700 tabular-nums">
                        {money.format(editCost)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
                      <div className={cn(styles.fieldGroup, "sm:col-span-5")}>
                        <label className={styles.inputLabel}>Provider</label>
                        <AdminSelect
                          name="editProvider"
                          variant="compact"
                          value={editProviderId}
                          onValueChange={handleEditProviderChange}
                          options={providers.map((p) => ({
                            value: p.id,
                            label: p.name,
                            description: p.status === "operational" ? "Active" : p.status,
                          }))}
                        />
                      </div>
                      <div className={cn(styles.fieldGroup, "sm:col-span-7")}>
                        <label className={styles.inputLabel}>Plan</label>
                        <AdminSelect
                          name="editOffer"
                          variant="compact"
                          value={editOfferId}
                          searchable
                          searchPlaceholder="Search plan or code..."
                          onValueChange={handleEditOfferChange}
                          options={
                            availableEditOffers.length > 0
                              ? availableEditOffers.map((offer) => ({
                                  value: offer.id,
                                  label: formatOfferOptionLabel(offer),
                                  description: `${money.format(offer.provider_cost)} (${offer.provider_product_code || ""})`,
                                }))
                              : [{ value: "", label: "No available plans" }]
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3.5 rounded-[12px] border border-a-line bg-zinc-50/60 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        <span className="size-1.5 rounded-full bg-sky-500" />
                        Failover Route
                      </span>
                      {editFallbackProviderId ? (
                        <div className="flex items-center gap-2.5">
                          {activeEditFallbackOffer ? (
                            <span className="rounded-[7px] border border-[color:var(--a-border)] bg-a-surface px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-600 tabular-nums">
                              {money.format(activeEditFallbackOffer.provider_cost)}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-zinc-500 transition hover:text-rose-600"
                            onClick={() => {
                              setEditFallbackProviderId("");
                              setEditFallbackOfferId("");
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <span className="rounded-[7px] bg-zinc-100 px-2.5 py-1 font-mono text-[10.5px] font-medium text-zinc-500">
                          Optional
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
                      <div className={cn(styles.fieldGroup, "sm:col-span-5")}>
                        <label className={styles.inputLabel}>Provider</label>
                        <AdminSelect
                          name="editFallbackProvider"
                          variant="compact"
                          value={editFallbackProviderId}
                          onValueChange={(val) => {
                            setEditFallbackProviderId(val);
                            setEditFallbackOfferId("");
                          }}
                          placeholder="None"
                          options={[
                            { value: "", label: "None" },
                            ...providers
                              .filter((p) => p.id !== editProviderId)
                              .map((p) => ({ value: p.id, label: p.name, description: p.status })),
                          ]}
                        />
                      </div>
                      <div className={cn(styles.fieldGroup, "sm:col-span-7")}>
                        <label className={styles.inputLabel}>Plan</label>
                        <AdminSelect
                          name="editFallbackOffer"
                          variant="compact"
                          value={editFallbackOfferId}
                          searchable
                          searchPlaceholder="Search fallback plan..."
                          onValueChange={setEditFallbackOfferId}
                          placeholder={editFallbackProviderId ? "Choose fallback plan" : "None"}
                          options={
                            availableEditFallbackOffers.length > 0
                              ? availableEditFallbackOffers.map((offer) => ({
                                  value: offer.id,
                                  label: formatOfferOptionLabel(offer),
                                  description: `${money.format(offer.provider_cost)} (${offer.provider_product_code || ""})`,
                                }))
                              : [{ value: "", label: "None" }]
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <footer className="flex items-center justify-between gap-4 border-t border-a-line bg-a-surface px-6 py-4">
                <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline">
                  {editStatus === "active"
                    ? "Live on customer app"
                    : editStatus === "disabled"
                      ? "Paused for users"
                      : "Hidden draft"}
                </span>
                <div className="flex items-center gap-2.5 sm:ml-auto">
                  <button
                    type="button"
                    className={button.secondary}
                    onClick={() => setEditingBundle(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={button.primary}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </footer>
            </form>
          </AdminModal>
        );
      })() : null}
    </div>
  );
}
