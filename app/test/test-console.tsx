"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataPlan, NetworkId, ServiceType, VendorId } from "@/lib/test-engine/types";

type Config = {
  mode: "sandbox" | "live";
  paymentReady: boolean;
  vendors: Record<VendorId, boolean>;
  vendorNotes?: Partial<Record<VendorId, string>>;
  testUser: { name: string; email: string; phone: string };
};

type ResultOrder = {
  reference: string;
  type: ServiceType;
  network: NetworkId;
  vendor: VendorId;
  amount: number;
  phone: string;
  status: string;
  result?: { status: string; message: string; reference: string; providerReference?: string };
};

const networks: { id: NetworkId; label: string; mark: string; color: string }[] = [
  { id: "mtn", label: "MTN", mark: "MTN", color: "#ffcb05" },
  { id: "airtel", label: "Airtel", mark: "a", color: "#ef2029" },
  { id: "glo", label: "Glo", mark: "glo", color: "#18a34a" },
  { id: "9mobile", label: "9mobile", mark: "9", color: "#006b3f" },
];

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 });

function Icon({ name, size = 20 }: { name: "signal" | "phone" | "shield" | "chevron" | "spark" | "clock" | "user"; size?: number }) {
  const paths = {
    signal: <><path d="M5 19v-3M10 19v-7M15 19V8M20 19V4" /></>,
    phone: <path d="M7 3h3l1.5 4-2 1.5a14 14 0 0 0 6 6l1.5-2 4 1.5v3a4 4 0 0 1-4 4C9.3 20 4 14.7 3 8a4 4 0 0 1 4-5Z" />,
    shield: <path d="M12 3 4.5 6v5.5c0 4.7 3.2 8 7.5 9.5 4.3-1.5 7.5-4.8 7.5-9.5V6L12 3Zm-3 9 2 2 4-4" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    spark: <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    user: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function TestConsole() {
  const [config, setConfig] = useState<Config | null>(null);
  const [service, setService] = useState<ServiceType>("data");
  const [network, setNetwork] = useState<NetworkId>("mtn");
  const [vendor, setVendor] = useState<VendorId>("gladtidings");
  const [phone, setPhone] = useState("08163474155");
  const [email, setEmail] = useState("test@example.com");
  const [amount, setAmount] = useState("100");
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [showFund, setShowFund] = useState(false);
  const [fundAmount, setFundAmount] = useState("1000");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultOrder | null>(null);

  useEffect(() => {
    fetch("/api/test/config").then((response) => response.json()).then((data: Config) => {
      setConfig(data);
      setPhone(data.testUser.phone);
      setEmail(data.testUser.email);
      if (data.vendors.pairgate) setVendor("pairgate");
    });
    fetch("/api/test/wallet").then((response) => response.json()).then((data) => setBalance(data.balance ?? 0));
  }, []);

  const loadPlans = useCallback(async () => {
    if (service !== "data") return;
    setLoadingPlans(true);
    setError("");
    setPlans([]);
    setPlanId("");
    try {
      const response = await fetch(`/api/test/products?vendor=${vendor}&network=${network}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPlans(data.plans);
      setPlanId(data.plans[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load data plans.");
    } finally {
      setLoadingPlans(false);
    }
  }, [network, service, vendor]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadPlans(), 0);
    return () => window.clearTimeout(task);
  }, [loadPlans, config]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const transactionId = query.get("transaction_id");
    const status = query.get("status");
    if (!transactionId || status !== "successful") return;
    window.history.replaceState({}, "", "/test");
    window.setTimeout(() => setSubmitting(true), 0);
    fetch("/api/test/wallet/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBalance(data.balance);
      setShowFund(false);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not complete the order."))
      .finally(() => setSubmitting(false));
  }, []);

  const chosenPlan = useMemo(() => plans.find((plan) => plan.id === planId), [planId, plans]);
  const total = service === "data" ? chosenPlan?.amount ?? 0 : Number(amount) || 0;

  async function pay() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/test/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, type: service, network, vendor, phone, email, amount: Number(amount), planId, name: config?.testUser.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data.order);
      setBalance(data.balance);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Checkout could not start.";
      if (service === "data") await loadPlans();
      setError(message);
      setSubmitting(false);
    }
  }

  async function fundWallet() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/test/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(fundAmount), email, phone, name: config?.testUser.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.assign(data.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet funding could not start.");
      setSubmitting(false);
    }
  }

  async function refreshStatus() {
    if (!result) return;
    setSubmitting(true);
    const response = await fetch(`/api/test/status/${result.reference}`);
    const data = await response.json();
    if (response.ok) setResult(data.order); else setError(data.error);
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[#f3f5f3] text-[#15251d]">
      <div className="mx-auto min-h-screen max-w-[1180px] lg:grid lg:grid-cols-[1fr_510px] lg:gap-16 lg:px-10">
        <aside className="hidden py-16 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-20 flex items-center gap-3 text-lg font-semibold"><span className="grid size-10 place-items-center rounded-xl bg-[#123d2a] text-white"><Icon name="spark" /></span> Orbit</div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[.22em] text-[#e46f3d]">Core engine</p>
            <h1 className="max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-.05em]">One clean flow for every connection.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#66736c]">Test payments and route fulfilment between providers from a single, controlled workspace.</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#66736c]"><span className="grid size-9 place-items-center rounded-full bg-white text-[#1c6846]"><Icon name="shield" /></span> Server-verified payments · Provider-safe references</div>
        </aside>

        <section className="relative min-h-screen bg-[#fbfcfa] pb-32 shadow-[0_0_70px_rgba(24,54,39,.08)] lg:my-6 lg:min-h-[calc(100vh-3rem)] lg:rounded-[32px] lg:border lg:border-white">
          <header className="flex items-center justify-between px-5 pb-5 pt-7 sm:px-8">
            <div><p className="text-xs font-medium text-[#7b8981]">Good morning</p><p className="mt-1 font-semibold">{config?.testUser.name ?? "Test Customer"}</p></div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${config?.mode === "live" ? "bg-[#fee7df] text-[#b74720]" : "bg-[#e4f3e9] text-[#24724d]"}`}>{config?.mode ?? "loading"}</span>
              <span className="grid size-10 place-items-center rounded-full bg-[#ecf2ee] text-[#37614b]"><Icon name="user" /></span>
            </div>
          </header>

          <div className="px-5 sm:px-8">
            <div className="relative overflow-hidden rounded-[28px] bg-[#123d2a] p-6 text-white shadow-[0_20px_40px_rgba(18,61,42,.2)]">
              <div className="absolute -right-12 -top-16 size-48 rounded-full border-[35px] border-white/[.04]" />
              <div className="relative flex items-start justify-between"><div><p className="text-xs text-white/60">Available balance</p><button onClick={() => setShowBalance((value) => !value)} className="mt-2 text-left text-3xl font-semibold tracking-[-.03em]">{showBalance ? money.format(balance) : "₦ ••••••"}</button></div><span className="grid size-11 place-items-center rounded-2xl bg-white/10"><Icon name="signal" /></span></div>
              <div className="relative mt-7 flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-white/70"><span className={`size-2 rounded-full ${config?.paymentReady ? "bg-[#62e39b]" : "bg-[#ffb38e]"}`} /> Flutterwave {config?.paymentReady ? "connected" : "awaiting keys"}</div><button onClick={() => setShowFund(true)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#123d2a]">+ Fund wallet</button></div>
            </div>

            <div className="mt-8">
              <div className="flex rounded-2xl bg-[#edf1ee] p-1.5">
                {(["data", "airtime"] as ServiceType[]).map((item) => <button key={item} onClick={() => setService(item)} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold capitalize transition ${service === item ? "bg-white text-[#173d2c] shadow-sm" : "text-[#768279]"}`}>{item === "data" ? "Buy data" : "Recharge airtime"}</button>)}
              </div>
            </div>

            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between"><label className="text-sm font-semibold">Choose network</label><span className="text-xs text-[#89938d]">Nigeria</span></div>
              <div className="grid grid-cols-4 gap-3">
                {networks.map((item) => <button key={item.id} onClick={() => setNetwork(item.id)} className={`rounded-2xl border px-2 py-3 transition ${network === item.id ? "border-[#1b6646] bg-[#edf7f1] shadow-[0_0_0_2px_rgba(27,102,70,.08)]" : "border-[#e4e9e5] bg-white"}`}><span className="mx-auto grid size-10 place-items-center rounded-full text-xs font-black text-white" style={{ background: item.color, color: item.id === "mtn" ? "#161616" : "white" }}>{item.mark}</span><span className="mt-2 block text-[11px] font-semibold">{item.label}</span></button>)}
              </div>
            </div>

            <div className="mt-7 space-y-5">
              <label className="block"><span className="mb-2 block text-sm font-semibold">Recipient number</span><div className="flex items-center rounded-2xl border border-[#e0e7e2] bg-white px-4 focus-within:border-[#24724d] focus-within:ring-4 focus-within:ring-[#24724d]/5"><span className="mr-3 text-[#809087]"><Icon name="phone" /></span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" className="h-14 min-w-0 flex-1 bg-transparent text-base font-medium outline-none" placeholder="080 1234 5678" /></div></label>

              {service === "data" ? <label className="block"><span className="mb-2 flex items-center justify-between text-sm font-semibold">Data bundle <button type="button" onClick={loadPlans} className="text-xs font-medium text-[#28734f]">Refresh plans</button></span><div className="relative"><select value={planId} onChange={(event) => setPlanId(event.target.value)} disabled={loadingPlans || !plans.length} className="h-14 w-full appearance-none rounded-2xl border border-[#e0e7e2] bg-white px-4 pr-12 text-sm font-medium outline-none focus:border-[#24724d] disabled:text-[#98a19c]"><option value="">{loadingPlans ? "Loading live plans…" : plans.length ? "Select a bundle" : "No plans available"}</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {money.format(plan.amount)}</option>)}</select><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-[#78857e]"><Icon name="chevron" /></span></div></label> : <label className="block"><span className="mb-2 block text-sm font-semibold">Recharge amount</span><div className="flex h-14 items-center rounded-2xl border border-[#e0e7e2] bg-white px-4 focus-within:border-[#24724d]"><span className="mr-2 font-semibold text-[#718078]">₦</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent font-semibold outline-none" /></div></label>}

              <div><span className="mb-2 block text-sm font-semibold">Fulfilment route</span><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(["pairgate", "vtpass", "smeplug", "gladtidings"] as VendorId[]).map((item) => <button key={item} onClick={() => setVendor(item)} className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${vendor === item ? "border-[#1b6646] bg-[#edf7f1]" : "border-[#e0e7e2] bg-white"}`}><span><span className="block text-sm font-semibold">{item === "vtpass" ? "VTpass" : item === "smeplug" ? "SMEPlug" : item === "gladtidings" ? "GladTidings" : "Pairgate"}</span><span className={`mt-1 block text-[11px] ${config?.vendors[item] ? "text-[#278557]" : "text-[#a16b54]"}`}>{config?.vendorNotes?.[item] ?? (config?.vendors[item] ? "Connected" : "Awaiting key")}</span></span><span className={`size-3 rounded-full border-2 ${vendor === item ? "border-[#1b6646] bg-[#1b6646] shadow-[inset_0_0_0_2px_white]" : "border-[#b8c2bc]"}`} /></button>)}</div></div>
            </div>

            {error && <div className="mt-5 rounded-2xl border border-[#f4d8cb] bg-[#fff4ef] p-4 text-sm leading-6 text-[#9d4525]">{error}</div>}
            {result && <div className="mt-5 rounded-2xl border border-[#cfe7d8] bg-[#eff9f3] p-4"><div className="flex items-center justify-between"><p className="font-semibold capitalize">{result.result?.status ?? result.status}</p><span className="text-xs text-[#56806a]">{result.vendor}</span></div><p className="mt-2 text-sm text-[#527060]">{result.result?.message}</p><p className="mt-3 break-all font-mono text-[10px] text-[#718078]">{result.result?.providerReference || result.reference}</p>{result.result?.status === "pending" && <button onClick={refreshStatus} className="mt-3 text-xs font-semibold text-[#1b6646]">Check status again</button>}</div>}

            <div className="mt-7 rounded-2xl bg-[#f0f3f0] p-4"><div className="flex items-center justify-between text-sm"><span className="text-[#708078]">You&apos;ll pay</span><strong className="text-lg">{money.format(total)}</strong></div><div className="mt-3 flex items-center gap-2 text-[11px] text-[#7d8982]"><Icon name="shield" size={15} /> Payment is verified before fulfilment</div></div>

            <button onClick={pay} disabled={submitting || total <= 0 || !config?.vendors[vendor]} className="mt-5 flex h-15 w-full items-center justify-center gap-2 rounded-2xl bg-[#e76836] px-5 font-semibold text-white shadow-[0_12px_28px_rgba(231,104,54,.25)] transition hover:bg-[#d95c2b] disabled:cursor-not-allowed disabled:bg-[#bdc5c0] disabled:shadow-none">{submitting ? "Processing purchase…" : <>Pay from wallet <Icon name="chevron" size={18} /></>}</button>
          </div>

          <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[510px] items-center justify-around border-t border-[#e9edea] bg-white/95 px-5 py-3 backdrop-blur lg:absolute lg:rounded-b-[32px]">
            <span className="flex flex-col items-center gap-1 text-[10px] font-semibold text-[#216b49]"><Icon name="spark" />Test</span><span className="flex flex-col items-center gap-1 text-[10px] text-[#929c96]"><Icon name="clock" />Activity</span><span className="flex flex-col items-center gap-1 text-[10px] text-[#929c96]"><Icon name="user" />Profile</span>
          </nav>
          {showFund && <div className="fixed inset-0 z-30 grid place-items-end bg-[#0d2118]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"><div className="w-full max-w-md rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px]"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#e76836]">Test wallet</p><h3 className="mt-2 text-2xl font-semibold tracking-[-.03em]">Add money</h3></div><button onClick={() => setShowFund(false)} className="grid size-9 place-items-center rounded-full bg-[#edf1ee] text-xl">×</button></div><p className="mt-3 text-sm leading-6 text-[#718078]">Flutterwave will collect a real payment when live keys are active. This in-memory balance resets when the server restarts.</p><label className="mt-6 block"><span className="mb-2 block text-sm font-semibold">Amount</span><div className="flex h-14 items-center rounded-2xl border border-[#dfe6e1] px-4"><span className="mr-2 font-semibold text-[#718078]">₦</span><input autoFocus value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none" /></div></label><div className="mt-3 grid grid-cols-3 gap-2">{[1000, 2000, 5000].map((value) => <button key={value} onClick={() => setFundAmount(String(value))} className="rounded-xl bg-[#f0f3f0] py-2 text-xs font-semibold">₦{value.toLocaleString()}</button>)}</div><button onClick={fundWallet} disabled={submitting || !config?.paymentReady} className="mt-6 h-14 w-full rounded-2xl bg-[#123d2a] font-semibold text-white disabled:bg-[#aeb8b2]">{submitting ? "Opening checkout…" : "Continue with Flutterwave"}</button></div></div>}
        </section>
      </div>
    </main>
  );
}
