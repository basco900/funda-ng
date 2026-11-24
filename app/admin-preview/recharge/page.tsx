import { notFound } from "next/navigation";
import DashboardClient from "@/app/dashboard/dashboard-client";
import AdminShell from "@/app/admin/(console)/admin-shell";
import AirtimeWorkspace from "@/app/admin/products/airtime/airtime-workspace";
import RechargeCardRecovery from "@/components/admin/recharge-card-recovery";

export const dynamic = "force-dynamic";

export default async function RechargePreview({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  const admin = { id: "preview", authUserId: "preview", email: "preview@funda.ng", fullName: "Abbas Abubakar", initials: "AA", role: "Super Admin", roleSlug: "super_admin", permissions: ["*"], bootstrap: false };
  const orderId = "00000000-0000-4000-8000-000000000011";
  const createdAt = "2026-11-23T08:00:00.000Z";
  if (view === "recovery") return <AdminShell admin={admin}><RechargeCardRecovery transactionId={orderId} status="pending" deliveryStatus="partial_pin_batch" quantity={2} pinCount={1} providerReference="PROVIDER-TEST-001" /></AdminShell>;
  if (view === "admin") return <AdminShell admin={admin}><AirtimeWorkspace routes={[{ id: orderId, network: "all", mode: "epin", min_amount: 100, max_amount: 20000, primary_provider: "maskawasub", fallback_provider: null, discount_percentage: 2, cashback_percentage: 1, priority: 10, is_active: true }]} providers={[{ id: "preview", name: "Maskawasub", slug: "maskawasub", status: "operational" }]} recentTransactions={[{ id: orderId, internal_reference: "FND-TEST-RECHARGE-001", provider_reference: "PROVIDER-TEST-001", destination: "MTN recharge cards", amount: 196, discount_amount: 4, cashback_amount: 1.96, status: "pending", service_type: "airtime", created_at: createdAt, mode: "epin", network: "mtn", quantity: 2, unitAmount: 100, pinCount: 1, deliveryStatus: "partial_pin_batch", user: { id: "preview", name: "Preview Customer" } }]} totalRoutesCount={1} rechargeOffers={[{ id: orderId, network: "mtn", denomination: 100, unit_cost: 97, max_quantity: 20, is_active: true, verified_at: createdAt }]} rechargeSummary={{ orders: 9, ready: 8, pending: 1, review: 1, refunded: 0, pins: 24, sales: 9800, held: 196, savings: 200, cashback: 98, margin: 200 }} /></AdminShell>;
  return <DashboardClient
    user={{ id: "00000000-0000-4000-8000-000000000001", fullName: "Preview Customer", firstName: "Preview", initials: "PC", email: "preview@example.test", phone: "08000000000", countryCode: "NG", emailConfirmed: true, phoneConfirmed: true }}
    settings={{ emailNotifications: true, smsNotifications: false, pushNotifications: true, marketingNotifications: false, transactionAlerts: true, securityAlerts: true, preferredLanguage: "en", timezone: "Africa/Lagos" }}
    initialWalletBalance={10000} initialCashbackEarned={1.96}
    initialTransactions={[{ id: orderId, title: "MTN ₦100 recharge cards × 2", category: "airtime", type: "debit", amount: 196, date: "Today", time: "9:00 AM", status: "processing", meta: "MTN recharge cards", reference: "FND-TEST-RECHARGE-001", createdAt, mode: "epin", quantity: 2, unitAmount: 100, faceValue: 200, originalAmount: 200, discountAmount: 4, deliveryStatus: "partial_pin_batch", pinCount: 1 }]}
  />;
}
