import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { loadCustomer360 } from "../../../../../lib/admin/details";
import { card, PageHeader, SectionTitle, StatBand, StatusBadge } from "../../../../../components/admin/kit";
import { UrlList, UrlStatusChips } from "../../../../../components/admin/list-controls";
import { cn } from "../../../../../lib/utils";
import AdminIcon from "../../admin-icon";
import CustomerActions from "./customer-actions";

const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
const dateTime = (value: string) => new Date(value).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("users.view");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const customer = await loadCustomer360(id);
  if (!customer) notFound();

  const txStatus = typeof query.tx === "string" ? query.tx : "";
  const statusCounts = new Map<string, number>();
  for (const item of customer.transactions) statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
  const transactions = txStatus ? customer.transactions.filter((item) => item.status === txStatus) : customer.transactions;
  const accountStatus = customer.controls?.account_status || "active";

  return (
    <div className="space-y-6 pb-10">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
        <AdminIcon name="arrowLeft" className="size-3.5" />
        Customers
      </Link>

      <PageHeader title={customer.profile.full_name || "Unnamed Customer"} actions={<StatusBadge value={accountStatus} />} />

      <StatBand
        stats={[
          { label: "Wallet balance", value: money(Number(customer.wallet?.available_balance ?? 0)), icon: "wallet", tone: "primary" },
          { label: "Total spent", value: money(customer.metrics.totalSpend), icon: "transactions", tone: "neutral" },
          { label: "Funded", value: money(customer.metrics.funded), icon: "funding", tone: "emerald" },
          { label: customer.metrics.transactionCount === 1 ? "Transaction" : "Transactions", value: customer.metrics.transactionCount.toLocaleString("en-NG"), icon: "chart", tone: "accent" },
        ]}
      />

      <CustomerActions
        userId={customer.profile.id}
        accountStatus={accountStatus}
        walletStatus={customer.controls?.wallet_status || "active"}
        riskLevel={customer.controls?.risk_level || "low"}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className={cn(card, "a-in p-5 sm:p-6")}>
          <SectionTitle title="Transactions" count={transactions.length} />
          {statusCounts.size > 1 ? (
            <div className="mt-4">
              <UrlList values={{ tx: txStatus }}>
                <UrlStatusChips
                  param="tx"
                  total={customer.transactions.length}
                  options={[...statusCounts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1), count }))}
                />
              </UrlList>
            </div>
          ) : null}
          <List empty="No Transactions Yet">
            {transactions.map((item) => (
              <Row
                key={item.id}
                href={`/admin/transactions/${item.id}`}
                icon="transactions"
                title={item.internal_reference}
                detail={`${item.service_type.replaceAll("_", " ")} · ${dateTime(item.created_at)}`}
                trailing={
                  <>
                    <span className="hidden text-[13.5px] font-semibold text-zinc-900 tabular-nums sm:block">{money(Number(item.amount))}</span>
                    <StatusBadge value={item.status} size="sm" />
                  </>
                }
              />
            ))}
          </List>
        </section>

        <div className="space-y-5">
          <section className={cn(card, "a-in p-5 sm:p-6")}>
            <SectionTitle title="Internal Notes" count={customer.notes.length} />
            <List empty="No Notes Yet">
              {customer.notes.map((note) => (
                <div key={note.id} className="py-3">
                  <p className="text-[14px] text-zinc-800">{note.note}</p>
                  <p className="mt-1 text-[12px] text-zinc-500 tabular-nums">{dateTime(note.created_at)}</p>
                </div>
              ))}
            </List>
          </section>

          <section className={cn(card, "a-in p-5 sm:p-6")}>
            <SectionTitle title="Devices" count={customer.devices.length} />
            <List empty="No Devices Seen">
              {customer.devices.map((device) => (
                <Row
                  key={device.id}
                  icon="device"
                  title={device.device_name || "Unknown device"}
                  detail={[device.platform, device.last_ip].filter(Boolean).join(" · ") || "No details"}
                  trailing={<StatusBadge value={device.blocked ? "Blocked" : device.trusted ? "Verified" : "Pending"} size="sm" />}
                />
              ))}
            </List>
          </section>

          <section className={cn(card, "a-in p-5 sm:p-6")}>
            <SectionTitle title="Support" count={customer.tickets.length} />
            <List empty="No Tickets">
              {customer.tickets.map((ticket) => (
                <Row key={ticket.id} icon="support" title={ticket.subject || ticket.ticket_number} detail={`${ticket.ticket_number} · ${dateTime(ticket.created_at)}`} trailing={<StatusBadge value={ticket.status} size="sm" />} />
              ))}
            </List>
          </section>
        </div>
      </div>
    </div>
  );
}

function List({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length ? (
    <div className="mt-3 divide-y divide-[color:var(--a-border)]">{children}</div>
  ) : (
    <div className="mt-4 rounded-[8px] border border-dashed border-zinc-200 bg-zinc-50/60 px-5 py-8 text-center text-[14px] font-semibold text-zinc-500">{empty}</div>
  );
}

function Row({ href, icon, title, detail, trailing }: { href?: string; icon: string; title: string; detail: string; trailing?: ReactNode }) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-a-primary-soft text-primary">
        <AdminIcon name={icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-zinc-800 group-hover:text-primary">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-zinc-500 capitalize">{detail}</span>
      </span>
      {trailing}
    </>
  );
  return href ? (
    <Link href={href} className="group flex items-center gap-3 py-3">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-3">{body}</div>
  );
}
