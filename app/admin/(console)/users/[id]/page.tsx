import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { loadCustomer360 } from "../../../../../lib/admin/details";
import CustomerActions from "./customer-actions";
import styles from "../../../admin.module.css";

const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPermission("users.view");
  const customer = await loadCustomer360((await params).id);
  if (!customer) notFound();
  return <div className={styles.workspacePage}>
    <Link href="/admin/users" className={styles.backLink}>← Customers</Link>
    <section className={styles.detailHero}><div><span className={styles.pageEyebrow}>Customer 360</span><h1>{customer.profile.full_name || "Unnamed customer"}</h1><p>{customer.auth?.email || "No email"} · {customer.auth?.phone || "No phone"} · {customer.profile.id}</p></div><div className={styles.detailPills}><span>{customer.controls?.account_status || "active"}</span><span>{customer.kyc?.status || "not started"}</span></div></section>
    <section className={styles.workspaceMetrics}>{[["Wallet",money(Number(customer.wallet?.available_balance ?? 0)),"Available balance"],["Total spend",money(customer.metrics.totalSpend),"Latest 30 transactions"],["Transactions",String(customer.metrics.transactionCount),"Visible history"]].map(([label,value,detail])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <section className={styles.detailGrid}><CustomerActions userId={customer.profile.id} accountStatus={customer.controls?.account_status||"active"} walletStatus={customer.controls?.wallet_status||"active"} riskLevel={customer.controls?.risk_level||"low"}/><article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Recent transactions</h2></div><div className={styles.detailList}>{customer.transactions.map(item=><Link key={item.id} href={`/admin/transactions/${item.id}`}><span>{item.internal_reference}<small>{item.service_type}</small></span><strong>{money(Number(item.amount))}</strong><em>{item.status}</em></Link>)}</div></article><article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Internal notes</h2></div><div className={styles.detailList}>{customer.notes.length?customer.notes.map(note=><div key={note.id}><span>{note.note}<small>{new Date(note.created_at).toLocaleString("en-NG")}</small></span></div>):<p className={styles.detailEmpty}>No internal notes yet.</p>}</div></article><article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Devices & security</h2></div><div className={styles.detailList}>{customer.devices.map(device=><div key={device.id}><span>{device.device_name || "Unknown device"}<small>{device.platform || "Unknown platform"} · {device.last_ip || "No IP"}</small></span><em>{device.blocked?"blocked":device.trusted?"trusted":"unverified"}</em></div>)}</div></article><article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Support history</h2></div><div className={styles.detailList}>{customer.tickets.map(ticket=><div key={ticket.id}><span>{ticket.ticket_number}<small>{ticket.subject}</small></span><em>{ticket.status}</em></div>)}</div></article></section>
  </div>;
}
