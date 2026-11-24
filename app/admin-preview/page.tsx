// TEMPORARY dev-only visual preview of the admin shell with sample data. Delete after review.
import { notFound } from "next/navigation";
import AdminShell from "../admin/(console)/admin-shell";
import AirtimeWorkspace from "../admin/products/airtime/airtime-workspace";
import CableTvWorkspace from "../admin/products/tv/tv-workspace";
import ElectricityWorkspace from "../admin/products/electricity/electricity-workspace";
import EducationWorkspace from "../admin/products/education/education-workspace";
import DataBundlesWorkspace from "../admin/(console)/products/data-bundles/data-bundles-workspace";
import ProviderWorkspace from "../admin/(console)/products/providers/provider-workspace";
import CouponsWorkspace from "../admin/growth/coupons/coupons-workspace";
import BlogWorkspace from "../admin/blog/blog-workspace";
import CommentsClient from "../admin/blog/comments/comments-client";
import SupportWorkspace from "../admin/support/support-workspace";
import * as sample from "./samples";
import BlogNavHeader from "../../components/blog/blog-nav-header";
import CouponSearch from "../../components/coupons/coupon-search";
import OfferCard from "../../components/coupons/offer-card";
import couponStyles from "../coupons/coupons.module.css";
import { DataTable } from "../../components/admin/data-table";
import AdminDashboard from "../admin/(console)/dashboard/admin-dashboard";
import { DistributionBand, PageHeader, button } from "../../components/admin/kit";
import { UrlFilterBar, UrlList, UrlPager } from "../../components/admin/list-controls";

export const dynamic = "force-dynamic";

export default async function AdminPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;

  const admin = {
    id: "preview",
    authUserId: "preview",
    email: "abbas@funda.ng",
    fullName: "Abbas Abubakar",
    initials: "AA",
    role: "Super Admin",
    roleSlug: "super_admin",
    permissions: ["*"],
    bootstrap: false,
  };

  const routes = [
    { id: "r1", network: "mtn", mode: "vtu", min_amount: 50, max_amount: 10000, primary_provider: "maskawasub", fallback_provider: "smeplug", discount_percentage: 2.5, cashback_percentage: 0.5, priority: 10, is_active: true },
    { id: "r2", network: "airtel", mode: "all", min_amount: 100, max_amount: 50000, primary_provider: "maskawasub", fallback_provider: null, discount_percentage: 3, cashback_percentage: 1, priority: 20, is_active: true },
    { id: "r3", network: "glo", mode: "epin", min_amount: 100, max_amount: 5000, primary_provider: "vtpass", fallback_provider: "smeplug", discount_percentage: 1.5, cashback_percentage: 0, priority: 5, is_active: false },
    { id: "r4", network: "9mobile", mode: "vtu", min_amount: 50, max_amount: 20000, primary_provider: "smeplug", fallback_provider: "vtpass", discount_percentage: 2, cashback_percentage: 0.5, priority: 15, is_active: true },
  ];
  const providers = [
    { id: "p1", name: "MaskawaSub", slug: "maskawasub", status: "active" },
    { id: "p2", name: "VTPass", slug: "vtpass", status: "active" },
  ];
  const recentTransactions = [
    { id: "t1", internal_reference: "FND-20261026-9A1B", provider_reference: null, destination: "08163474155", amount: 500, status: "successful", service_type: "airtime", created_at: new Date().toISOString(), user: { id: "u1", phone: "08163474155" } },
    { id: "t2", internal_reference: "FND-20261025-77C2", provider_reference: null, destination: "07025468818", amount: 1000, status: "failed", service_type: "airtime", created_at: new Date().toISOString(), user: { id: "u2", email: "zee@funda.ng" } },
  ];

  if (view === "coupons") {
    const base = { description: null, status: "active" as const, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), copy_count: 0 };
    const offers = [
      { ...base, id: "o1", brand_id: "b1", kind: "code" as const, code: "RBLF10", title: "10% off, up to ₦3,000", discount_text: "10% off", min_spend: "₦10,000", conditions: "Black Friday code.", new_users_only: false, works_in_nigeria: true, source_url: null, source_type: "web" as const, expires_at: new Date(Date.now() + 6 * 86_400_000).toISOString(), last_verified_at: null, worked_count: 9, failed_count: 1, brand: { slug: "jumia", name: "Jumia", domain: "jumia.com.ng" } },
      { ...base, id: "o2", brand_id: "b2", kind: "code" as const, code: "CDNWEB", title: "₦300 off your first order", discount_text: "₦300 off", min_spend: null, conditions: "First order only.", new_users_only: true, works_in_nigeria: true, source_url: "https://chowdeck.com/", source_type: "brand" as const, expires_at: null, last_verified_at: null, worked_count: 0, failed_count: 0, brand: { slug: "chowdeck", name: "Chowdeck", domain: "chowdeck.com" } },
      { ...base, id: "o3", brand_id: "b3", kind: "trial" as const, code: null, title: "$300 free credit for 90 days", discount_text: "$300 credit", min_spend: null, conditions: "New Google Cloud accounts, plus the Always Free tier.", new_users_only: true, works_in_nigeria: true, source_url: null, source_type: "web" as const, expires_at: null, last_verified_at: null, worked_count: 0, failed_count: 0, brand: { slug: "google-cloud", name: "Google Cloud", domain: "cloud.google.com" } },
    ];
    return (
      <>
        <BlogNavHeader />
        <main className={couponStyles.page}>
          <section className={couponStyles.hero}>
            <h1>Coupon codes that <span>actually work</span></h1>
            <CouponSearch />
          </section>
          <div className={couponStyles.offers}>
            {offers.map((offer) => <OfferCard key={offer.id} offer={offer} brand={offer.brand} showBrand />)}
          </div>
        </main>
      </>
    );
  }

  const workspace = (() => {
    switch (view) {
      case "tv": return <CableTvWorkspace tvConfigs={sample.tvConfigs} tvPackages={sample.tvPackages} providers={sample.providers} recentTransactions={sample.tvTransactions} purchaseFilter={sample.purchaseFilter} />;
      case "electricity": return <ElectricityWorkspace discoConfigs={sample.discos} providers={sample.providers} recentTransactions={sample.electricityTransactions} purchaseFilter={sample.purchaseFilter} />;
      case "education": return <EducationWorkspace educationConfigs={sample.educationConfigs} educationPackages={sample.educationPackages} providers={sample.providers} recentTransactions={sample.educationTransactions} purchaseFilter={sample.purchaseFilter} />;
      case "bundles": return <DataBundlesWorkspace providers={sample.bundleProviders} offers={[]} bundles={sample.bundles} categories={sample.bundleCategories} />;
      case "providers": return <ProviderWorkspace providers={sample.registry} catalogue={sample.catalogue} />;
      case "coupons": return <CouponsWorkspace coupons={sample.coupons} totalCoupons={sample.coupons.length} />;
      case "blog": return <BlogWorkspace posts={sample.posts} categories={sample.categories} totalCommentsCount={4} />;
      case "comments": return <CommentsClient initialComments={sample.comments} />;
      case "support": return <SupportWorkspace initialThreads={sample.threads} hasTelegramConfig={false} />;
      default: return null;
    }
  })();
  if (workspace) return <AdminShell admin={admin}>{workspace}</AdminShell>;

  if (view === "list") {
    const statuses = [{ value: "successful", label: "Successful", count: 1824 }, { value: "pending", label: "Pending", count: 46 }, { value: "processing", label: "Processing", count: 12 }, { value: "failed", label: "Failed", count: 63 }, { value: "refunded", label: "Refunded", count: 9 }];
    return (
      <AdminShell admin={admin}>
        <div className="space-y-6 pb-10">
          <PageHeader title="Transactions" actions={<span className={button.primary}>Add New</span>} />
          <DistributionBand value="1,954" label="records" segments={statuses.map((option) => ({ key: option.value, label: option.label, count: option.count, href: "/admin-preview?view=list" }))} />
          <UrlList values={{ status: "failed", facet: "", q: "", range: "7" }}>
            <div className="space-y-5">
              <UrlFilterBar spec={{ status: { total: 1954, options: statuses }, facet: { label: "Service", options: [{ value: "airtime", label: "Airtime" }, { value: "data", label: "Data" }] }, search: "Search reference or destination", range: true }} />
              <DataTable empty={null} columns={[{ key: "reference", label: "Reference" }, { key: "service", label: "Service" }, { key: "destination", label: "Destination" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]} rows={Array.from({ length: 6 }, (_, i) => ({ id: String(i), href: "/admin-preview", cells: { reference: `FND-2026112${i}-7C${i}A`, service: i % 2 ? "Data" : "Airtime", destination: `0803${4410000 + i * 731}`, amount: `₦${(i + 2) * 450}`, status: "Failed", created: `${22 - i} Nov, 14:0${i}` } }))} />
              <UrlPager page={1} pageSize={25} total={63} />
            </div>
          </UrlList>
        </div>
      </AdminShell>
    );
  }

  if (view === "dashboard") {
    // eslint-disable-next-line react-hooks/purity -- dev-only sample data
    const now = Date.now();
    const chart = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: [520_000, 610_000, 480_000, 790_000, 905_000, 640_000, 867_500][i], count: [41, 52, 39, 66, 74, 55, 85][i] }));
    const overview = {
      connected: true,
      periodDays: 7,
      hero: { metric: "deposits" as const, scope: "all", outcome: "completed" as const, totalValue: 4_812_500, matchingCount: 412, completedCount: 412, settledCount: 427, successRate: 96.4, statuses: { succeeded: 412, pending: 9, initializing: 4, failed: 11, expired: 3, underpaid: 1 }, chart },
      metrics: { walletDeposits: 4_812_500, walletFloat: 12_904_220, successRate: 96.4, registeredUsers: 18_342, pendingValue: 184_000, failedValue: 62_000 },
      statuses: { succeeded: 412, pending: 9, initializing: 4, failed: 11, expired: 3, underpaid: 1 },
      chart,
      recent: ["Amina Bello", "Chinedu Okafor", "Tunde Bakare", "Zainab Yusuf", "Ifeoma Nwosu", "Musa Danjuma"].map((customer, i) => ({ id: String(i), reference: `FND-${8812 + i}-BX`, amount: [5000, 12000, 2500, 30000, 7500, 1000][i], status: ["succeeded", "succeeded", "pending", "succeeded", "failed", "succeeded"][i], provider: "bachs", customer, createdAt: new Date(now - i * 1_380_000).toISOString() })),
      alerts: [
        { tone: "warning" as const, title: "13 funding payments need attention", detail: "", href: "/admin/operations/pending" },
        { tone: "critical" as const, title: "15 unsuccessful payments", detail: "", href: "/admin/operations/failed" },
      ],
    };
    return (
      <AdminShell admin={admin}>
        <AdminDashboard admin={admin} overview={overview} activity="" />
      </AdminShell>
    );
  }

  return (
    <AdminShell admin={admin}>
      <AirtimeWorkspace routes={routes} providers={providers} recentTransactions={recentTransactions} totalRoutesCount={4} />
      <div className="mt-6"><DataTable empty={null} columns={[{ key: "reference", label: "Reference" }, { key: "service", label: "Service" }, { key: "destination", label: "Destination" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]} rows={["Successful","Failed","Pending","Successful","Refunded","Processing","Successful","Failed"].map((status, i) => ({ id: String(i), href: "/admin-preview", cells: { reference: `FND-2026102${i}-9A1B${i}`, service: i % 3 ? "Data" : "Airtime", destination: "08163474155", amount: `₦${(i + 1) * 120}`, status, created: "25 Oct, 20:05" } }))} /></div>
    </AdminShell>
  );
}
