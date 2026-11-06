import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { loadCustomer360 } from "../../../../../lib/admin/details";
import { AdminPageHeader } from "../../../../../components/admin/page-pattern";
import CustomerActions from "./customer-actions";

const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("users.view");
  const customer = await loadCustomer360((await params).id);
  if (!customer) notFound();

  return (
    <div className="w-full space-y-6 pb-16 font-sans text-slate-900">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
        >
          ← Back to Customers
        </Link>
      </div>

      <AdminPageHeader
        title={customer.profile.full_name || "Unnamed Customer"}
        stats={[
          { label: "Account Status", value: customer.controls?.account_status || "Active", tone: "success" },
          { label: "Wallet Balance", value: money(Number(customer.wallet?.available_balance ?? 0)) },
          { label: "Total Spend", value: money(customer.metrics.totalSpend) },
          { label: "Transactions", value: String(customer.metrics.transactionCount) },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <CustomerActions
            userId={customer.profile.id}
            accountStatus={customer.controls?.account_status || "active"}
            walletStatus={customer.controls?.wallet_status || "active"}
            riskLevel={customer.controls?.risk_level || "low"}
          />
        </div>

        <article className="rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Recent Transactions
          </h2>
          <div className="space-y-3">
            {customer.transactions.length === 0 ? (
              <p className="text-[12px] text-zinc-400">No transactions recorded for this customer.</p>
            ) : (
              customer.transactions.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/transactions/${item.id}`}
                  className="flex items-center justify-between text-[12px] border-b border-zinc-50 pb-2 hover:bg-zinc-50/80 p-1.5 rounded-[5px] transition-colors"
                >
                  <div>
                    <span className="font-semibold text-zinc-800 block">{item.internal_reference}</span>
                    <small className="text-[11px] text-zinc-400 capitalize">{item.service_type}</small>
                  </div>
                  <div className="text-right">
                    <strong className="block text-[12px] text-zinc-900">{money(Number(item.amount))}</strong>
                    <span className="inline-block rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-700">
                      {item.status}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Internal Notes
          </h2>
          <div className="space-y-3">
            {customer.notes.length ? (
              customer.notes.map((note) => (
                <div key={note.id} className="text-[12px] border-b border-zinc-50 pb-2">
                  <span className="font-medium text-zinc-800 block">{note.note}</span>
                  <small className="text-[10.5px] text-zinc-400">
                    {new Date(note.created_at).toLocaleString("en-NG")}
                  </small>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-zinc-400">No internal notes yet.</p>
            )}
          </div>
        </article>

        <article className="rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Devices &amp; Security
          </h2>
          <div className="space-y-3">
            {customer.devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between text-[12px] border-b border-zinc-50 pb-2">
                <div>
                  <span className="font-semibold text-zinc-800 block">{device.device_name || "Unknown Device"}</span>
                  <small className="text-[11px] text-zinc-400">
                    {device.platform || "Platform"} · {device.last_ip || "No IP"}
                  </small>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                  {device.blocked ? "Blocked" : device.trusted ? "Trusted" : "Unverified"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Support History
          </h2>
          <div className="space-y-3">
            {customer.tickets.length === 0 ? (
              <p className="text-[12px] text-zinc-400">No active or resolved support tickets.</p>
            ) : (
              customer.tickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between text-[12px] border-b border-zinc-50 pb-2">
                  <div>
                    <span className="font-semibold text-zinc-800 block">{ticket.ticket_number}</span>
                    <small className="text-[11px] text-zinc-400">{ticket.subject}</small>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                    {ticket.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
