"use client";

import Link from "next/link";
import { loadBachs, type BachsCheckoutEvent } from "@bachs/js";
import { useEffect, useState } from "react";
import styles from "./dashboard.module.css";
import ProfileCenter, { type ProfileCenterSettings, type ProfileCenterUser } from "./profile-center";

export interface DashboardClientProps {
  user: ProfileCenterUser & {
    firstName: string;
  };
  settings: ProfileCenterSettings;
  initialWalletBalance: number;
}

type ServiceItem = {
  id: string;
  name: string;
  subtitle: string;
  badge?: string;
  tone: "violet" | "coral" | "amber" | "cyan" | "blue" | "lime" | "pink" | "silver";
  iconName: string;
};

const SERVICES: ServiceItem[] = [
  { id: "data", name: "Data Bundles", subtitle: "Instant 4G/5G", badge: "Hot", tone: "violet", iconName: "data" },
  { id: "airtime", name: "Airtime Top-up", subtitle: "3% Cashback", badge: "Cashback", tone: "coral", iconName: "airtime" },
  { id: "electricity", name: "Electricity", subtitle: "Token in 3s", badge: "24/7", tone: "amber", iconName: "bolt" },
  { id: "tv", name: "Cable TV", subtitle: "DSTV, GOtv, StarTimes", tone: "cyan", iconName: "tv" },
  { id: "internet", name: "Broadband", subtitle: "Spectranet & Smile", tone: "blue", iconName: "internet" },
  { id: "betting", name: "Betting Wallet", subtitle: "SportyBet, Bet9ja", tone: "lime", iconName: "ticket" },
  { id: "education", name: "Exam Pins", subtitle: "WAEC, JAMB, NECO", tone: "pink", iconName: "education" },
  { id: "more", name: "More Services", subtitle: "Giftcards & APIs", badge: "New", tone: "silver", iconName: "grid" },
];

type TransactionItem = {
  id: string;
  title: string;
  category: "data" | "electricity" | "airtime" | "tv" | "funding" | "internet";
  type: "debit" | "credit";
  amount: number;
  date: string;
  time: string;
  status: "completed" | "processing" | "failed";
  meta: string;
  reference: string;
  cashback?: string;
  token?: string;
};

const RECENT_TRANSACTIONS: TransactionItem[] = [
  {
    id: "tx-1",
    title: "MTN 15GB 30-Day SME",
    category: "data",
    type: "debit",
    amount: 4500,
    date: "Today",
    time: "11:42 AM",
    status: "completed",
    meta: "0803 491 8210",
    reference: "FND-DT-894218",
    cashback: "+₦135 cashback",
  },
  {
    id: "tx-2",
    title: "Ikeja Electric Prepaid Token",
    category: "electricity",
    type: "debit",
    amount: 10000,
    date: "Yesterday",
    time: "08:15 PM",
    status: "completed",
    meta: "Meter #4502-9912-3401",
    reference: "FND-EL-773190",
    token: "4910 3819 2041 9920 1847",
  },
  {
    id: "tx-3",
    title: "Wallet Top-up via Bank Transfer",
    category: "funding",
    type: "credit",
    amount: 25000,
    date: "14 Aug 2026",
    time: "02:20 PM",
    status: "completed",
    meta: "Wema Bank / Moniepoint Transfer",
    reference: "FND-FD-103982",
  },
  {
    id: "tx-4",
    title: "Airtel ₦2,000 Airtime",
    category: "airtime",
    type: "debit",
    amount: 2000,
    date: "10 Aug 2026",
    time: "04:10 PM",
    status: "completed",
    meta: "0902 110 4921",
    reference: "FND-AT-339184",
    cashback: "+₦60 cashback",
  },
  {
    id: "tx-5",
    title: "DSTV Compact Plus Monthly",
    category: "tv",
    type: "debit",
    amount: 19800,
    date: "08 Aug 2026",
    time: "07:30 PM",
    status: "completed",
    meta: "Smartcard #1049281729",
    reference: "FND-TV-991048",
  },
];

const RECENT_BENEFICIARIES = [
  {
    id: "ben-1",
    title: "MTN 10GB Monthly",
    recipient: "0803 491 8210",
    service: "data",
    amount: "₦2,950",
    tone: "violet",
  },
  {
    id: "ben-2",
    title: "IKEDC Home Meter",
    recipient: "Meter #4502-9912",
    service: "electricity",
    amount: "₦10,000",
    tone: "amber",
  },
  {
    id: "ben-3",
    title: "Airtel Airtime",
    recipient: "0902 110 4921",
    service: "airtime",
    amount: "₦2,000",
    tone: "coral",
  },
];

function SvgIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  switch (name) {
    case "bell":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "sparkles":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
        </svg>
      );
    case "eye":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
      );
    case "refresh":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
      );
    case "plus":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "wallet":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M20 7V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v8a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V7" />
          <path d="M16 14h.01" />
        </svg>
      );
    case "clock":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "data":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
        </svg>
      );
    case "airtime":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
          <path d="M9 5h6" />
        </svg>
      );
    case "bolt":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "tv":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <polyline points="17 2 12 7 7 2" />
        </svg>
      );
    case "internet":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "ticket":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      );
    case "education":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      );
    case "grid":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
        </svg>
      );
    case "home":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "user":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "shield":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case "search":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "copy":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "check":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "close":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardClient({ user, settings, initialWalletBalance }: DashboardClientProps) {
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance);
  const [cashbackBalance] = useState(420.0);
  const [showBalance, setShowBalance] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "services" | "history" | "profile">("home");
  const [transactionFilter, setTransactionFilter] = useState<"all" | "data" | "airtime" | "electricity" | "funding">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);

  // Modals / Sheet States
  const [showFundModal, setShowFundModal] = useState(false);
  const [showQuickServiceModal, setShowQuickServiceModal] = useState<ServiceItem | null>(null);
  const [showQuickActionDockMenu, setShowQuickActionDockMenu] = useState(false);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
  const [showAccountDrawer, setShowAccountDrawer] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states for modals
  const [fundAmount, setFundAmount] = useState("5000");
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [serviceRecipient, setServiceRecipient] = useState("");
  const [servicePackage, setServicePackage] = useState("1000");
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fundingState = params.get("funding");
    const checkoutId = params.get("checkout_id");
    if (fundingState === "cancelled") {
      window.setTimeout(() => {
        setFundingError("Payment was cancelled. Your wallet was not charged.");
        setShowFundModal(true);
      }, 0);
      window.history.replaceState(null, "", "/dashboard");
      return;
    }
    if (fundingState !== "return" || !checkoutId) return;

    let cancelled = false;
    let attempts = 0;
    const checkStatus = async () => {
      attempts += 1;
      const response = await fetch(`/api/payments/bachs/status?checkout_id=${encodeURIComponent(checkoutId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (body.status === "succeeded") {
        setWalletBalance(Number(body.balance));
        setActionSuccessMsg(`₦${Number(body.amount).toLocaleString()} added to your wallet.`);
        window.history.replaceState(null, "", "/dashboard");
        window.setTimeout(() => setActionSuccessMsg(null), 5000);
        return;
      }
      if (["failed", "underpaid", "expired"].includes(body.status)) {
        setFundingError(`Payment ${body.status}. Your wallet was not credited.`);
        window.history.replaceState(null, "", "/dashboard");
        return;
      }
      if (attempts < 15) window.setTimeout(checkStatus, 2000);
      else setFundingError("Payment is still processing. Your wallet will update after confirmation.");
    };
    void checkStatus();
    return () => { cancelled = true; };
  }, []);

  // Filter transactions
  const filteredTransactions = RECENT_TRANSACTIONS.filter((tx) => {
    if (transactionFilter !== "all" && tx.category !== transactionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        tx.title.toLowerCase().includes(q) ||
        tx.meta.toLowerCase().includes(q) ||
        tx.reference.toLowerCase().includes(q) ||
        (tx.token && tx.token.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setActionSuccessMsg("Wallet balance updated");
      setTimeout(() => setActionSuccessMsg(null), 3000);
    }, 600);
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSimulatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (showFundModal) {
      const added = Number(fundAmount) || 0;
      setWalletBalance((prev) => prev + added);
      setActionSuccessMsg(`₦${added.toLocaleString()} added to your wallet!`);
    } else {
      setActionSuccessMsg("Payment successful! Token/bundle delivered.");
    }
    setTimeout(() => {
      setShowFundModal(false);
      setShowQuickServiceModal(null);
      setShowQuickActionDockMenu(false);
      setActionSuccessMsg(null);
    }, 1200);
  };

  const handleFundWallet = async (event: React.FormEvent) => {
    event.preventDefault();
    setFundingBusy(true);
    setFundingError(null);
    try {
      const response = await fetch("/api/payments/bachs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(fundAmount) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.checkoutUrl) throw new Error(body.error || "Unable to start payment.");

      const reconcilePayment = async () => {
        for (let attempt = 0; attempt < 15; attempt += 1) {
          const statusResponse = await fetch(
            `/api/payments/bachs/status?checkout_id=${encodeURIComponent(body.checkoutId)}`,
            { cache: "no-store" },
          );
          const statusBody = await statusResponse.json().catch(() => ({}));
          if (statusBody.status === "succeeded") {
            setWalletBalance(Number(statusBody.balance));
            setActionSuccessMsg(`₦${Number(statusBody.amount).toLocaleString()} added to your wallet.`);
            window.setTimeout(() => setActionSuccessMsg(null), 5000);
            return;
          }
          if (["failed", "underpaid", "expired"].includes(statusBody.status)) {
            setFundingError(`Payment ${statusBody.status}. Your wallet was not credited.`);
            setShowFundModal(true);
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
        setFundingError("Payment is still processing. Your wallet will update after confirmation.");
      };

      const handleCheckoutEvent = (checkoutEvent: BachsCheckoutEvent) => {
        if (checkoutEvent.type === "checkout.completed") {
          setActionSuccessMsg("Payment received. Confirming your wallet credit…");
          void reconcilePayment();
        } else if (checkoutEvent.type === "checkout.failed" || checkoutEvent.type === "checkout.expired") {
          setFundingError(checkoutEvent.type === "checkout.expired"
            ? "Checkout expired. Please start again."
            : "Payment failed. Please try again.");
          setShowFundModal(true);
        } else if (checkoutEvent.type === "checkout.error") {
          const message = typeof checkoutEvent.data.message === "string"
            ? checkoutEvent.data.message
            : "Unable to display the secure checkout.";
          setFundingError(message);
          setShowFundModal(true);
        }
      };

      const bachs = await loadBachs();
      bachs.Initialize();
      await bachs.Checkout.open({
        checkoutUrl: body.checkoutUrl,
        onEvent: handleCheckoutEvent,
        options: { showCloseButton: true, autoCloseOnComplete: true },
      });
      setShowFundModal(false);
      setFundingBusy(false);
    } catch (error) {
      setFundingBusy(false);
      setFundingError(error instanceof Error ? error.message : "Unable to start payment.");
    }
  };

  return (
    <div className={styles.iosViewport}>
      {/* Subtle Atmospheric Mesh Background */}
      <div className={styles.ambientMeshContainer} aria-hidden="true">
        <div className={styles.glowOrbPrimary} />
        <div className={styles.glowOrbSecondary} />
        <div className={styles.glowOrbAccent} />
      </div>

      <header className={styles.desktopHomepageNav}>
        <Link href="/" className={styles.desktopWordmark} aria-label="Funda home">
          funda<span>.</span>
        </Link>
        <div className={styles.desktopNavActions}>
          <button
            type="button"
            className={styles.frostedIconButton}
            onClick={() => setShowNotificationDrawer(true)}
            aria-label="Notifications"
          >
            <SvgIcon name="bell" size={19} />
            <span className={styles.unreadBadgeDot} />
          </button>
          <button
            type="button"
            className={styles.profileAvatarBtn}
            onClick={() => setShowAccountDrawer(true)}
            aria-label="Profile and settings"
          >
            <span>{user.initials}</span>
          </button>
        </div>
      </header>

      {/* Action Success Toast */}
      {actionSuccessMsg && (
        <div className={styles.floatingToast}>
          <span className={styles.toastIcon}><SvgIcon name="check" size={16} /></span>
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      <main className={styles.appContainer}>
        {/* iOS Dynamic Header */}
        <header className={styles.iosTopBar}>
          <div className={styles.brandProfile}>
            <div className={styles.brandBadge}>
              <span className={styles.brandLetter}>f.</span>
              <div className={styles.brandText}>
                <span className={styles.appName}>funda<span className={styles.appNameDot}>.</span></span>
                <span className={styles.liveStatusBeacon}>
                  <i className={styles.beaconDot} /> Ready • ₦ NGN
                </span>
              </div>
            </div>
          </div>

          <div className={styles.topBarRight}>
            {/* Notification Bell */}
            <button
              type="button"
              className={styles.frostedIconButton}
              onClick={() => setShowNotificationDrawer(true)}
              aria-label="Notifications"
            >
              <SvgIcon name="bell" size={19} />
              <span className={styles.unreadBadgeDot} />
            </button>

            {/* Profile Avatar Trigger */}
            <button
              type="button"
              className={styles.profileAvatarBtn}
              onClick={() => setShowAccountDrawer(true)}
              aria-label="Profile and Settings"
            >
              <span>{user.initials}</span>
            </button>
          </div>
        </header>

        {/* Greeting */}
        <section className={styles.greetingHeader}>
          <div className={styles.greetingText}>
            <span className={styles.todayDateText}>
              {new Intl.DateTimeFormat("en-NG", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </span>
            <h1 className={styles.greetingTitle}>
              Hi, {user.firstName}
              <span className={styles.greetingDot}>.</span>
            </h1>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* HERO: COOL SLEEK FUNDA WALLET CARD                                        */}
        {/* ========================================================================= */}
        <section className={styles.walletCardSection} aria-label="Wallet Overview">
          <div className={styles.proWalletHeroCard}>
            <div className={styles.cardInnerGlow} />

            {/* Card Header Row: Funda balance + Dedicated Account Chip + Controls */}
            <div className={styles.cardTopRow}>
              <button
                type="button"
                className={styles.virtualAccountChip}
                onClick={() => copyToClipboard("9920184719", "wema-top")}
                aria-label="Copy virtual bank account number"
              >
                <span className={styles.nigeriaFlagPill}>🇳🇬</span>
                <span>Wema • <strong>9920184719</strong></span>
                <SvgIcon name={copiedField === "wema-top" ? "check" : "copy"} size={12} />
              </button>

              <div className={styles.cardRightControls}>
                <button
                  type="button"
                  className={styles.cardHistorySubtleBtn}
                  onClick={() => {
                    const el = document.getElementById("transactions-section-anchor");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  aria-label="View transaction history"
                >
                  <SvgIcon name="clock" size={13} />
                  <span>History</span>
                </button>
                <button
                  type="button"
                  className={`${styles.cardIconBtn} ${isRefreshing ? styles.spinning : ""}`}
                  onClick={handleRefresh}
                  aria-label="Refresh wallet balance"
                >
                  <SvgIcon name="refresh" size={14} />
                </button>
                <button
                  type="button"
                  className={styles.cardIconBtn}
                  onClick={() => setShowBalance(!showBalance)}
                  aria-label={showBalance ? "Hide balance" : "Show balance"}
                >
                  <SvgIcon name={showBalance ? "eye" : "eye-off"} size={14} />
                </button>
              </div>
            </div>

            {/* Balance Left-Aligned Readout */}
            <div className={styles.balanceLeftBlock}>
              <span className={styles.balanceSubLabel}>Available Balance</span>
              <div className={styles.balanceAmountRow}>
                <span className={styles.currencyPrefix}>₦</span>
                <strong className={styles.balanceValue}>
                  {showBalance
                    ? walletBalance.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "••••••••"}
                </strong>
              </div>
              <div className={styles.cashbackBadgeRow}>
                <span className={styles.cashbackBadgePill}>
                  <SvgIcon name="sparkles" size={11} />
                  <span>Cashback: <strong>₦{cashbackBalance.toFixed(2)}</strong></span>
                </span>
              </div>
            </div>

            {/* Wallet actions: primary funding action, then purchase shortcuts */}
            <div className={styles.heroPrimaryActionRow}>
              <button
                type="button"
                className={styles.fundWalletPrimaryBtn}
                onClick={() => setShowFundModal(true)}
              >
                <span className={styles.actionBtnIcon}><SvgIcon name="wallet" size={18} /></span>
                <span>Fund Wallet</span>
              </button>

              <button
                type="button"
                className={styles.walletSecondaryActionBtn}
                onClick={() => setShowQuickServiceModal(SERVICES.find((service) => service.id === "data") || SERVICES[0])}
              >
                <span className={styles.actionBtnIcon}><SvgIcon name="data" size={17} /></span>
                <span>Buy Data</span>
              </button>

              <button
                type="button"
                className={styles.walletSecondaryActionBtn}
                onClick={() => setShowQuickServiceModal(SERVICES.find((service) => service.id === "airtime") || SERVICES[1])}
              >
                <span className={styles.actionBtnIcon}><SvgIcon name="airtime" size={17} /></span>
                <span>Buy Airtime</span>
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PRO BENTO UTILITY SERVICES GRID (Data, Airtime, Electricity, etc.)        */}
        {/* ========================================================================= */}
        <section className={styles.servicesGridSection} id="services-grid-anchor" aria-label="Funda Utilities">
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <span className={styles.sectionEyebrow}>UTILITIES & ESSENTIALS</span>
              <h2 className={styles.sectionMainTitle}>Quick Services</h2>
            </div>
            <Link href="/test" className={styles.seeAllLink}>
              Console <SvgIcon name="chevron-right" size={13} />
            </Link>
          </div>

          <div className={styles.bentoServicesGrid}>
            {SERVICES.map((srv) => (
              <button
                key={srv.id}
                type="button"
                className={styles.bentoServiceTile}
                onClick={() => setShowQuickServiceModal(srv)}
                aria-label={`Buy ${srv.name}`}
              >
                <div className={styles.tileIconBackdrop} data-tone={srv.tone}>
                  <SvgIcon name={srv.iconName} size={22} />
                  {srv.badge && <span className={styles.tileBadge}>{srv.badge}</span>}
                </div>
                <span className={styles.tileName}>{srv.name}</span>
                <span className={styles.tileSub}>{srv.subtitle}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SMART REPEAT / FREQUENT RECHARGES                                         */}
        {/* ========================================================================= */}
        <section className={styles.smartAssistantSection} aria-label="Frequent Bills">
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <span className={styles.sectionEyebrow}>
                <SvgIcon name="sparkles" size={12} /> ONE-TAP RECHARGE
              </span>
              <h2 className={styles.sectionMainTitle}>Recent Beneficiaries</h2>
            </div>
            <span className={styles.oneTapPill}>Instant 1-tap</span>
          </div>

          <div className={styles.smartRepeatScrollDeck}>
            {RECENT_BENEFICIARIES.map((item) => (
              <div key={item.id} className={styles.smartRepeatCard}>
                <div className={styles.smartRepeatHeader}>
                  <span className={styles.smartIconSquircle} data-tone={item.tone}>
                    <SvgIcon name={item.service} size={19} />
                  </span>
                  <span className={styles.smartPriceTag}>{item.amount}</span>
                </div>
                <div className={styles.smartRepeatBody}>
                  <strong className={styles.smartTitle}>{item.title}</strong>
                  <span className={styles.smartRecipient}>{item.recipient}</span>
                </div>
                <button
                  type="button"
                  className={styles.smartRepeatBtn}
                  onClick={() => {
                    setActionSuccessMsg(`Recharged ${item.title} (${item.amount}) instantly!`);
                    setTimeout(() => setActionSuccessMsg(null), 3000);
                  }}
                >
                  Repeat ⚡
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* TRANSACTIONS SECTION (PayPal Reference Style)                             */}
        {/* ========================================================================= */}
        <section className={styles.activitySection} id="transactions-section-anchor" aria-label="Recent Transactions">
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <h2 className={styles.sectionMainTitle}>Transactions</h2>
            </div>
            <div className={styles.txTogglePillGroup}>
              <button
                type="button"
                className={`${styles.txTogglePill} ${transactionFilter === "all" ? styles.txTogglePillActive : ""}`}
                onClick={() => setTransactionFilter("all")}
              >
                Recent
              </button>
              <button
                type="button"
                className={styles.txTogglePill}
                onClick={() => {
                  const el = document.getElementById("transactions-filter-anchor");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                View All
              </button>
            </div>
          </div>

          {/* Category Filter Pills & Search */}
          <div className={styles.filterControlsRow} id="transactions-filter-anchor">
            <div className={styles.segmentedControl}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${transactionFilter === "all" ? styles.segmentedActive : ""}`}
                onClick={() => setTransactionFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${transactionFilter === "data" ? styles.segmentedActive : ""}`}
                onClick={() => setTransactionFilter("data")}
              >
                Data
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${transactionFilter === "electricity" ? styles.segmentedActive : ""}`}
                onClick={() => setTransactionFilter("electricity")}
              >
                Power
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${transactionFilter === "airtime" ? styles.segmentedActive : ""}`}
                onClick={() => setTransactionFilter("airtime")}
              >
                Airtime
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${transactionFilter === "funding" ? styles.segmentedActive : ""}`}
                onClick={() => setTransactionFilter("funding")}
              >
                Top-up
              </button>
            </div>

            <div className={styles.searchBarWrapper}>
              <SvgIcon name="search" size={15} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search phone, meter, or reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.txSearchInput}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className={styles.clearSearchBtn}
                >
                  <SvgIcon name="close" size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Transaction List Cards */}
          <div className={styles.txListContainer}>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((tx) => {
                const isCredit = tx.type === "credit";
                return (
                  <div
                    key={tx.id}
                    className={styles.txItemCard}
                    onClick={() => setSelectedTx(tx)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.txIconWrapper} data-category={tx.category}>
                      <SvgIcon
                        name={
                          tx.category === "data"
                            ? "data"
                            : tx.category === "electricity"
                            ? "bolt"
                            : tx.category === "funding"
                            ? "plus"
                            : tx.category === "airtime"
                            ? "airtime"
                            : tx.category === "tv"
                            ? "tv"
                            : "plus"
                        }
                        size={20}
                      />
                    </div>

                    <div className={styles.txInfoCol}>
                      <div className={styles.txTitleRow}>
                        <strong className={styles.txTitle}>{tx.title}</strong>
                        {tx.cashback && <span className={styles.cashbackTag}>{tx.cashback}</span>}
                      </div>
                      <div className={styles.txSubRow}>
                        <span>{tx.meta}</span>
                        <span className={styles.txDotSep}>•</span>
                        <span>{tx.date}, {tx.time}</span>
                      </div>
                    </div>

                    <div className={styles.txAmountCol}>
                      <strong className={isCredit ? styles.amountPositive : styles.amountNegative}>
                        {isCredit ? "+" : "-"}₦{tx.amount.toLocaleString()}
                      </strong>
                      <span className={styles.txStatusPill}>{tx.status}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.emptyStateBox}>
                <span className={styles.emptyIcon}><SvgIcon name="search" size={24} /></span>
                <strong>No matching transactions</strong>
                <p>Try clearing your search query or switching filters.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* FLOATING iOS CAPSULE DOCK                                                 */}
      {/* ========================================================================= */}
      {showQuickActionDockMenu && (
        <div
          className={styles.dockMenuOverlay}
          onClick={() => setShowQuickActionDockMenu(false)}
          aria-hidden="true"
        />
      )}

      <nav className={styles.floatingIosDock} aria-label="Main Navigation">
        <button
          type="button"
          className={`${styles.dockTabBtn} ${activeTab === "home" ? styles.dockTabActive : ""}`}
          onClick={() => {
            setActiveTab("home");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span className={styles.dockIconWrapper}>
            <SvgIcon name="home" size={20} />
          </span>
          <span className={styles.dockLabel}>Home</span>
        </button>

        <button
          type="button"
          className={`${styles.dockTabBtn} ${activeTab === "services" ? styles.dockTabActive : ""}`}
          onClick={() => {
            setActiveTab("services");
            const el = document.getElementById("services-grid-anchor");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span className={styles.dockIconWrapper}>
            <SvgIcon name="grid" size={20} />
          </span>
          <span className={styles.dockLabel}>Services</span>
        </button>

        {/* Elevated Floating + Action Button (Opens Quick Bill Purchase Menu) */}
        <div className={styles.dockCenterElevatedContainer}>
          <button
            type="button"
            className={`${styles.dockCenterFloatingBtn} ${showQuickActionDockMenu ? styles.dockCenterActive : ""}`}
            onClick={() => setShowQuickActionDockMenu(!showQuickActionDockMenu)}
            aria-label="Quick Pay"
          >
            <SvgIcon name="plus" size={24} />
          </button>

          {/* Floating Popup Menu from Central + Button */}
          {showQuickActionDockMenu && (
            <div className={styles.quickActionFloatingMenu}>
              <div className={styles.quickMenuHeader}>
                <span className={styles.quickMenuTitle}>Quick Actions</span>
                <span className={styles.quickMenuBadge}>Instant</span>
              </div>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowQuickServiceModal(SERVICES[0]);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="violet"><SvgIcon name="data" size={17} /></span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>Buy Data Bundle</span>
                  <span className={styles.quickMenuItemSub}>SME & Direct data</span>
                </div>
                <span className={styles.quickMenuChevron}><SvgIcon name="chevron-right" size={14} /></span>
              </button>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowQuickServiceModal(SERVICES[1]);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="coral"><SvgIcon name="airtime" size={17} /></span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>Buy Airtime Top-up</span>
                  <span className={styles.quickMenuItemSub}>Instant VTU with cashback</span>
                </div>
                <span className={styles.quickMenuChevron}><SvgIcon name="chevron-right" size={14} /></span>
              </button>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowQuickServiceModal(SERVICES[2]);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="amber"><SvgIcon name="bolt" size={17} /></span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>Pay Electricity</span>
                  <span className={styles.quickMenuItemSub}>Prepaid & Postpaid</span>
                </div>
                <span className={styles.quickMenuChevron}><SvgIcon name="chevron-right" size={14} /></span>
              </button>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowFundModal(true);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="blue"><SvgIcon name="plus" size={17} /></span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>Fund Funda Wallet</span>
                  <span className={styles.quickMenuItemSub}>Bank transfer or card</span>
                </div>
                <span className={styles.quickMenuChevron}><SvgIcon name="chevron-right" size={14} /></span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`${styles.dockTabBtn} ${activeTab === "history" ? styles.dockTabActive : ""}`}
          onClick={() => {
            setActiveTab("history");
            const el = document.getElementById("transactions-section-anchor");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span className={styles.dockIconWrapper}>
            <SvgIcon name="clock" size={20} />
          </span>
          <span className={styles.dockLabel}>History</span>
        </button>

        <button
          type="button"
          className={`${styles.dockTabBtn} ${activeTab === "profile" ? styles.dockTabActive : ""}`}
          onClick={() => {
            setActiveTab("profile");
            setShowAccountDrawer(true);
          }}
        >
          <span className={styles.dockIconWrapper}>
            <SvgIcon name="user" size={20} />
          </span>
          <span className={styles.dockLabel}>Profile</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* MODAL 1: FUND WALLET SHEET                                                */}
      {/* ========================================================================= */}
      {showFundModal && (
        <div className={styles.modalOverlay} onClick={() => setShowFundModal(false)}>
          <div className={styles.iosBottomSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div>
                <h3 className={styles.sheetTitle}>Fund Funda Wallet</h3>
                <p className={styles.sheetSub}>Instant automated bank transfer or debit card top-up</p>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowFundModal(false)}
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            {/* Bachs hosted payment assurance */}
            <div className={styles.virtualBankCard}>
              <span className={styles.bankTag}>SECURE CHECKOUT POWERED BY BACHS</span>
              <div className={styles.bankDetailRow}>
                <div>
                  <span className={styles.bankLabel}>Payment methods</span>
                  <strong className={styles.bankValue}>Card, bank transfer and supported local methods</strong>
                </div>
                <div>
                  <span className={styles.bankLabel}>Wallet owner</span>
                  <strong className={styles.bankValue}>{user.fullName}</strong>
                </div>
              </div>
            </div>

            {/* Instant Card / Online Top Up */}
            <form onSubmit={handleFundWallet} className={styles.modalForm}>
              <label className={styles.inputLabel}>
                <span>Or Enter Amount to Top-up via Card</span>
                <div className={styles.currencyInputBox}>
                  <span className={styles.inputPrefix}>₦</span>
                  <input
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="5,000"
                    min="1000"
                    max="500000"
                    step="0.01"
                    className={styles.textInput}
                    required
                  />
                </div>
              </label>

              {/* Quick Amount Chips */}
              <div className={styles.amountChipsRow}>
                {["1000", "2000", "5000", "10000", "20000", "50000"].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={`${styles.amountChip} ${fundAmount === amt ? styles.amountChipActive : ""}`}
                    onClick={() => setFundAmount(amt)}
                  >
                    ₦{Number(amt).toLocaleString()}
                  </button>
                ))}
              </div>

              {fundingError && <div className={styles.paymentError} role="alert">{fundingError}</div>}

              <button type="submit" className={styles.submitPrimaryBtn} disabled={fundingBusy}>
                {fundingBusy ? "Opening secure checkout…" : `Fund ₦${Number(fundAmount || 0).toLocaleString()} with Bachs`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: QUICK UTILITY SERVICE PURCHASE SHEET                             */}
      {/* ========================================================================= */}
      {showQuickServiceModal && (
        <div className={styles.modalOverlay} onClick={() => setShowQuickServiceModal(null)}>
          <div className={styles.iosBottomSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div className={styles.sheetServiceTitleGroup}>
                <span className={styles.sheetServiceIcon} data-tone={showQuickServiceModal.tone}>
                  <SvgIcon name={showQuickServiceModal.iconName} size={22} />
                </span>
                <div>
                  <h3 className={styles.sheetTitle}>{showQuickServiceModal.name}</h3>
                  <p className={styles.sheetSub}>{showQuickServiceModal.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowQuickServiceModal(null)}
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            <form onSubmit={handleSimulatePayment} className={styles.modalForm}>
              {/* Provider / Network Select */}
              <div className={styles.networkSelectGrid}>
                {["MTN", "Airtel", "Glo", "9mobile"].map((net) => (
                  <button
                    key={net}
                    type="button"
                    className={`${styles.networkSelectBtn} ${net === "MTN" ? styles.networkActive : ""}`}
                  >
                    {net}
                  </button>
                ))}
              </div>

              <label className={styles.inputLabel}>
                <span>Recipient Phone / Meter / Smartcard Number</span>
                <input
                  type="text"
                  placeholder="0803 491 8210"
                  value={serviceRecipient}
                  onChange={(e) => setServiceRecipient(e.target.value)}
                  className={styles.textInput}
                  required
                />
              </label>

              <label className={styles.inputLabel}>
                <span>Select Plan / Bundle</span>
                <select
                  value={servicePackage}
                  onChange={(e) => setServicePackage(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="350">1GB 30-Day SME — ₦350</option>
                  <option value="950">3GB 30-Day SME — ₦950</option>
                  <option value="1500">5GB 30-Day SME — ₦1,500</option>
                  <option value="2950">10GB 30-Day SME — ₦2,950</option>
                  <option value="5800">20GB 30-Day SME — ₦5,800</option>
                </select>
              </label>

              <div className={styles.cashbackBenefitNotice}>
                <SvgIcon name="sparkles" size={14} />
                <span>Earn <strong>₦90 instant cashback</strong> into your Funda wallet</span>
              </div>

              <button type="submit" className={styles.submitPrimaryBtn}>
                Pay from Wallet • Instant 3s Fulfilment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: TRANSACTION RECEIPT SHEET                                        */}
      {/* ========================================================================= */}
      {selectedTx && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTx(null)}>
          <div className={styles.iosReceiptSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.receiptTopHeader}>
              <div className={styles.receiptCheckIcon}><SvgIcon name="check" size={24} /></div>
              <strong className={styles.receiptAmount}>
                {selectedTx.type === "credit" ? "+" : "-"}₦{selectedTx.amount.toLocaleString()}
              </strong>
              <span className={styles.receiptStatusTag}>Payment Completed</span>
              <p className={styles.receiptTitle}>{selectedTx.title}</p>
            </div>

            {/* Electricity Token Callout if applicable */}
            {selectedTx.token && (
              <div className={styles.tokenHighlightBox}>
                <span className={styles.tokenLabel}>TOKEN CODE</span>
                <strong className={styles.tokenCode}>{selectedTx.token}</strong>
                <button
                  type="button"
                  className={styles.copyTokenBtn}
                  onClick={() => copyToClipboard(selectedTx.token!, "tx-token")}
                >
                  <SvgIcon name={copiedField === "tx-token" ? "check" : "copy"} size={14} />
                  <span>{copiedField === "tx-token" ? "Copied Token!" : "Copy Token"}</span>
                </button>
              </div>
            )}

            <div className={styles.receiptDetailsList}>
              <div className={styles.receiptRow}>
                <span>Reference</span>
                <button
                  type="button"
                  className={styles.receiptCopyValue}
                  onClick={() => copyToClipboard(selectedTx.reference, "tx-ref")}
                >
                  <strong>{selectedTx.reference}</strong>
                  <SvgIcon name={copiedField === "tx-ref" ? "check" : "copy"} size={13} />
                </button>
              </div>
              <div className={styles.receiptRow}>
                <span>Date & Time</span>
                <strong>{selectedTx.date}, {selectedTx.time}</strong>
              </div>
              <div className={styles.receiptRow}>
                <span>Destination / Meter</span>
                <strong>{selectedTx.meta}</strong>
              </div>
              <div className={styles.receiptRow}>
                <span>Payment Method</span>
                <strong>Funda Wallet (₦ NGN)</strong>
              </div>
              {selectedTx.cashback && (
                <div className={styles.receiptRow}>
                  <span>Reward Earned</span>
                  <strong className={styles.receiptRewardHighlight}>{selectedTx.cashback}</strong>
                </div>
              )}
            </div>

            <div className={styles.receiptActionsRow}>
              <button
                type="button"
                className={styles.receiptSecondaryBtn}
                onClick={() => {
                  setActionSuccessMsg("Receipt saved / copied!");
                  setTimeout(() => setActionSuccessMsg(null), 2500);
                }}
              >
                Share Receipt
              </button>
              <button
                type="button"
                className={styles.submitPrimaryBtn}
                onClick={() => setSelectedTx(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: NOTIFICATIONS                                                     */}
      {/* ========================================================================= */}
      {showNotificationDrawer && (
        <div className={styles.modalOverlay} onClick={() => setShowNotificationDrawer(false)}>
          <div className={styles.sideDrawerSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeaderRow}>
              <h3 className={styles.sheetTitle}>Notifications</h3>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowNotificationDrawer(false)}
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            <div className={styles.notificationList}>
              <div className={styles.notifCard}>
                <span className={styles.notifIcon}><SvgIcon name="sparkles" size={17} /></span>
                <div>
                  <strong>Cashback Credited</strong>
                  <p>₦135 bonus credited to your wallet from MTN bundle.</p>
                  <small>15m ago</small>
                </div>
              </div>
              <div className={styles.notifCard}>
                <span className={styles.notifIcon}><SvgIcon name="bolt" size={17} /></span>
                <div>
                  <strong>Electricity Token Delivered</strong>
                  <p>Meter #4502-9912 token generated successfully.</p>
                  <small>Yesterday</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: ACCOUNT & PREFERENCES                                             */}
      {/* ========================================================================= */}
      {showAccountDrawer && (
        <div className={styles.modalOverlay} onClick={() => setShowAccountDrawer(false)}>
          <ProfileCenter user={user} settings={settings} onClose={() => setShowAccountDrawer(false)} />
        </div>
      )}
    </div>
  );
}
