"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./dashboard.module.css";
import FundaSelect from "./funda-select";
import ProfileCenter, {
  type ProfileCenterSettings,
  type ProfileCenterUser,
} from "./profile-center";
import {
  buildReceipt,
  receiptFileName,
  receiptToText,
  renderReceiptImage,
} from "./receipt";
import { SERVICE_CATALOG, type CatalogItem } from "./service-catalog";
import { useTheme } from "../../lib/theme";
import { SpinnerIcon } from "../onboarding/icons";
import { RECHARGE_DENOMINATIONS, RECHARGE_MAX_QUANTITY, rechargeDeliveryLabel, type RechargeReceipt } from "../../lib/recharge-cards";
import { RechargePriceSummary, useRechargeAvailability, useRechargeQuote } from "./recharge-card-checkout";
import { useRechargeReceipt, withRechargeReceipt } from "./use-recharge-receipt";
import { rechargeCardPrintHtml } from "../../lib/recharge-card-print";
import { useRechargeHistory } from "./use-recharge-history";

export type VirtualAccountInfo = {
  id: string;
  account_scope: "connected" | "platform" | string;
  bachs_account_id: string | null;
  virtual_account_id: string | null;
  account_number: string | null;
  account_name: string | null;
  bank_name: string | null;
  bank_code: string | null;
  currency: string;
  status: "pending" | "active" | "inactive" | "failed" | string;
  status_reason: string | null;
  transfer_reference_code: string;
  known_sender_accounts?: string[];
  metadata?: {
    is_temporary?: boolean;
    temp_checkout_id?: string | null;
    temp_charge_id?: string | null;
    temp_expires_at?: string | null;
    verified_sender_name?: string | null;
    verified_sender_bank?: string | null;
    verified_sender_account?: string | null;
    last_deposit_amount?: number | null;
    last_deposit_at?: string | null;
    [key: string]: unknown;
  };
};

export type TemporaryAccountInfo = {
  checkoutId: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  amount: string;
  currency: string;
  expiresAt: string;
  reference: string;
};

export interface DashboardClientProps {
  initialVirtualAccount?: VirtualAccountInfo | null;
  initialTemporaryAccount?: TemporaryAccountInfo | null;
  user: ProfileCenterUser & {
    firstName: string;
  };
  settings: ProfileCenterSettings;
  initialWalletBalance: number;
  initialCashbackEarned?: number;
  initialTransactions?: TransactionItem[];
  initialNotifications?: Array<{
    id: string;
    title: string;
    body: string;
    kind: string;
    read_at: string | null;
    created_at: string;
  }>;
}

type ServiceItem = {
  id: string;
  name: string;
  subtitle: string;
  badge?: string;
  tone:
    | "violet"
    | "coral"
    | "amber"
    | "cyan"
    | "blue"
    | "lime"
    | "pink"
    | "silver";
  iconName: string;
};

const SERVICES: ServiceItem[] = [
  {
    id: "data",
    name: "Data Bundles",
    subtitle: "Instant 4G/5G",
    badge: "Hot",
    tone: "violet",
    iconName: "data",
  },
  {
    id: "airtime",
    name: "Airtime & PIN",
    subtitle: "VTU & Recharge Card",
    badge: "Instant",
    tone: "coral",
    iconName: "airtime",
  },
  {
    id: "electricity",
    name: "Electricity",
    subtitle: "Token in 3s",
    badge: "24/7",
    tone: "amber",
    iconName: "bolt",
  },
  {
    id: "tv",
    name: "Cable TV",
    subtitle: "DSTV, GOtv, StarTimes",
    tone: "cyan",
    iconName: "tv",
  },
  {
    id: "internet",
    name: "Broadband",
    subtitle: "Spectranet & Smile",
    tone: "blue",
    iconName: "internet",
  },
  {
    id: "betting",
    name: "Betting Wallet",
    subtitle: "SportyBet, Bet9ja",
    tone: "lime",
    iconName: "ticket",
  },
  {
    id: "education",
    name: "Exam Pins",
    subtitle: "WAEC, JAMB, NECO",
    tone: "pink",
    iconName: "education",
  },
  {
    id: "more",
    name: "More Services",
    subtitle: "Giftcards & APIs",
    badge: "New",
    tone: "silver",
    iconName: "grid",
  },
];

type RechargePinItem = {
  pin: string;
  serial?: string;
  amount?: number;
  network?: string;
  dialCode?: string;
  examBody?: string;
  serviceName?: string;
  instructions?: string;
};

export type TransactionItem = {
  id: string;
  title: string;
  category:
    | "data"
    | "electricity"
    | "airtime"
    | "tv"
    | "education"
    | "funding"
    | "internet";
  type: "debit" | "credit";
  amount: number;
  date: string;
  time: string;
  status: "completed" | "processing" | "failed";
  meta: string;
  reference: string;
  cashback?: string;
  token?: string;
  pins?: RechargePinItem[];
  // Receipt detail; present when the row came from the database.
  createdAt?: string;
  providerReference?: string;
  channel?: string;
  senderName?: string;
  senderBank?: string;
  senderAccount?: string;
  narration?: string;
  originalAmount?: number;
  discountAmount?: number;
  couponCode?: string;
  mode?: "vtu" | "epin";
  quantity?: number;
  unitAmount?: number;
  faceValue?: number;
  deliveryStatus?: string;
  pinCount?: number;
  refunded?: boolean;
  cardName?: string;
};

type LiveProduct = {
  id: string;
  name: string;
  service_type: "data" | "airtime";
  network: string | null;
  basePrice?: number;
  price: number;
  cashback: number;
  provider_product_code: string | null;
  category?: string;
  validity?: string | null;
  featured?: boolean;
  health?: {
    status: "healthy" | "advisory" | "degraded" | "outage" | "unverified";
    badge: string | null;
    notice: string | null;
    successRate: number | null;
  };
};

const NETWORK_PROVIDERS = [
  { id: "mtn", name: "MTN", initial: "M", color: "#f59e0b" },
  { id: "airtel", name: "Airtel", initial: "A", color: "#ef4444" },
  { id: "glo", name: "Glo", initial: "G", color: "#16a34a" },
  { id: "9mobile", name: "9mobile", initial: "9", color: "#65a30d" },
] as const;

export type BeneficiaryItem = {
  id: string;
  serviceType:
    | "airtime"
    | "data"
    | "electricity"
    | "cable_tv"
    | "internet"
    | "education";
  recipient: string;
  label: string | null;
  networkOrDisco: string;
  meterType?: "prepaid" | "postpaid" | null;
  lastUsedAt: string;
};

const ELECTRICITY_DISCOS = [
  {
    code: "ikedc",
    name: "Ikeja Electric",
    short: "IKEDC",
    area: "Lagos (Ikeja, Alausa)",
  },
  {
    code: "ekedc",
    name: "Eko Electric",
    short: "EKEDC",
    area: "Lagos (Island, Lekki)",
  },
  {
    code: "aedc",
    name: "Abuja Electric",
    short: "AEDC",
    area: "FCT, Kogi, Niger, Nasarawa",
  },
  {
    code: "ibedc",
    name: "Ibadan Electric",
    short: "IBEDC",
    area: "Oyo, Ogun, Osun, Kwara",
  },
  {
    code: "eedc",
    name: "Enugu Electric",
    short: "EEDC",
    area: "Enugu, Abia, Imo, Anambra",
  },
  {
    code: "phed",
    name: "Port Harcourt",
    short: "PHED",
    area: "Rivers, Bayelsa, Akwa Ibom",
  },
  {
    code: "kedco",
    name: "Kano Electric",
    short: "KEDCO",
    area: "Kano, Katsina, Jigawa",
  },
  {
    code: "kaedco",
    name: "Kaduna Electric",
    short: "KAEDCO",
    area: "Kaduna, Kebbi, Sokoto",
  },
  {
    code: "jed",
    name: "Jos Electric",
    short: "JED",
    area: "Plateau, Bauchi, Benue",
  },
  {
    code: "bedc",
    name: "Benin Electric",
    short: "BEDC",
    area: "Edo, Delta, Ondo, Ekiti",
  },
  {
    code: "yedc",
    name: "Yola Electric",
    short: "YEDC",
    area: "Adamawa, Borno, Taraba",
  },
  {
    code: "aple",
    name: "Aba Electric (APLE)",
    short: "APLE",
    area: "Aba Commercial Ring",
  },
] as const;

const TV_OPERATORS = [
  {
    id: "dstv",
    name: "DStv",
    fullName: "DStv (MultiChoice)",
    color: "#0085ca",
    badge: "HD",
  },
  {
    id: "gotv",
    name: "GOtv",
    fullName: "GOtv (MultiChoice)",
    color: "#00a651",
    badge: "Max",
  },
  {
    id: "startimes",
    name: "StarTimes",
    fullName: "StarTimes Digital",
    color: "#e30613",
    badge: "Dish/Antenna",
  },
  {
    id: "showmax",
    name: "Showmax",
    fullName: "Showmax Streaming",
    color: "#6b21a8",
    badge: "Live Sport",
  },
] as const;

const EDUCATION_BOARDS = [
  {
    id: "waec",
    name: "WAEC",
    fullName: "West African Examinations Council",
    badge: "Result & GCE",
    color: "#004080",
    icon: "📝",
  },
  {
    id: "neco",
    name: "NECO",
    fullName: "National Examinations Council",
    badge: "SSCE & BECE",
    color: "#0b6623",
    icon: "📗",
  },
  {
    id: "jamb",
    name: "JAMB",
    fullName: "Joint Admissions & Matriculation",
    badge: "UTME & DE",
    color: "#006400",
    icon: "🎓",
  },
  {
    id: "nabteb",
    name: "NABTEB",
    fullName: "National Business & Tech Board",
    badge: "Modular & Cards",
    color: "#8b0000",
    icon: "📜",
  },
  {
    id: "nbais",
    name: "NBAIS",
    fullName: "National Board for Arabic & Islamic",
    badge: "SAISSCE & Tokens",
    color: "#0d9488",
    icon: "📖",
  },
] as const;

type FrontendEduConfig = {
  examBody: "waec" | "neco" | "jamb" | "nabteb" | "nbais";
  name: string;
  shortName: string;
  description: string;
  requiresProfileCode: boolean;
  profileCodeLabel: string;
  isActive: boolean;
  maintenanceNotice: string | null;
  instructions: string;
  portalUrl: string;
};

type FrontendEduPackage = {
  id: string;
  examBody: "waec" | "neco" | "jamb" | "nabteb" | "nbais";
  packageCode: string;
  name: string;
  description: string;
  price: number;
  faceValue: number;
  isActive: boolean;
};

const NIGERIAN_NETWORK_PREFIXES: Record<string, string[]> = {
  mtn: [
    "803",
    "806",
    "703",
    "706",
    "813",
    "816",
    "810",
    "814",
    "903",
    "906",
    "913",
    "916",
    "704",
    "7025",
    "7026",
    "707",
  ],
  airtel: [
    "802",
    "808",
    "708",
    "812",
    "701",
    "902",
    "901",
    "904",
    "907",
    "912",
    "911",
  ],
  glo: ["805", "807", "705", "815", "811", "905", "915"],
  "9mobile": ["809", "817", "818", "909", "908"],
};

function cleanNigerianPhone(val: string): string {
  let digits = val.replace(/\D/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function formatNigerianPhone(digits: string): string {
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
}

function detectNetwork(
  val: string,
): "mtn" | "airtel" | "glo" | "9mobile" | null {
  const digits = cleanNigerianPhone(val);
  if (digits.length < 3) return null;

  for (const [net, prefixes] of Object.entries(NIGERIAN_NETWORK_PREFIXES)) {
    for (const prefix of prefixes) {
      if (digits.startsWith(prefix)) {
        return net as "mtn" | "airtel" | "glo" | "9mobile";
      }
    }
  }
  return null;
}

function validateNigerianPhone(val: string): {
  isValid: boolean;
  network: "mtn" | "airtel" | "glo" | "9mobile" | null;
  error: string | null;
} {
  const digits = cleanNigerianPhone(val);
  const net = detectNetwork(val);
  if (digits.length === 0)
    return { isValid: false, network: null, error: null };
  if (digits.length < 10) return { isValid: false, network: net, error: null };
  if (!net)
    return {
      isValid: false,
      network: null,
      error: "Unrecognized Nigerian mobile network prefix.",
    };
  return { isValid: true, network: net, error: null };
}

function parseBundleDisplay(product: LiveProduct) {
  const name = product.name;
  const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  const qtyNum = sizeMatch ? sizeMatch[1] : name.match(/\d+/)?.[0] || "";
  const qtyUnit = sizeMatch ? sizeMatch[2].toUpperCase() : "MB";
  const valMatch = (product.validity || name).match(
    /(\d+\s*(?:day|days|hour|hours|month|months|week|weeks))/i,
  );
  const validity = product.validity || (valMatch ? valMatch[1] : "Standard");

  const isHot = Boolean(
    product.featured || /1gb|2\.5gb|5gb|awoof|hot/i.test(name),
  );
  const isCheap = product.price <= 350 && !isHot;
  const isValue = /monthly|30\s*days|10gb|15gb|20gb/i.test(name) && !isHot;

  return {
    qtyNum,
    qtyUnit,
    validity,
    fullName: name,
    isHot,
    isCheap,
    isValue,
  };
}

const RECENT_TX_LIMIT = 5;

const TX_FILTERS: {
  id: "all" | "data" | "airtime" | "epin" | "electricity" | "funding";
  label: string;
  icon: string;
}[] = [
  { id: "all", label: "All", icon: "grid" },
  { id: "data", label: "Data", icon: "data" },
  { id: "electricity", label: "Power", icon: "bolt" },
  { id: "airtime", label: "Airtime", icon: "airtime" },
  { id: "epin", label: "Recharge cards", icon: "ticket" },
  { id: "funding", label: "Top-up", icon: "wallet" },
];

type NotificationTone = "in" | "out" | "wait" | "fail" | "info";

// Notifications carry only free text, so the icon and colour are inferred from the wording.
function describeNotification(notif: {
  title: string;
  body: string;
  kind: string;
}): { icon: string; tone: NotificationTone } {
  const title = notif.title.toLowerCase();
  const text = `${title} ${notif.body.toLowerCase()}`;
  if (notif.kind !== "transaction") return { icon: "bell", tone: "info" };
  if (title.includes("refund")) return { icon: "refund", tone: "wait" };
  if (/fail|declin|unsuccessful/.test(title))
    return { icon: "alert", tone: "fail" };
  if (/fund|credit|deposit/.test(title)) return { icon: "wallet", tone: "in" };
  if (/pending|processing/.test(title)) return { icon: "clock", tone: "wait" };
  if (/electric|token|meter/.test(text)) return { icon: "bolt", tone: "out" };
  if (/dstv|gotv|startimes|cable/.test(text))
    return { icon: "tv", tone: "out" };
  if (/airtime|recharge pin|e-pin/.test(text))
    return { icon: "airtime", tone: "out" };
  if (/data|\dgb|\dmb/.test(text)) return { icon: "data", tone: "out" };
  return { icon: "check", tone: "out" };
}

function notificationDayLabel(createdAt: string, now: Date): string {
  const day = new Date(createdAt);
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return day.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: day.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function SvgIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  switch (name) {
    case "bell":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "sparkles":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
        </svg>
      );
    case "eye":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
      );
    case "refresh":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
      );
    case "plus":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "wallet":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M20 7V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v8a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V7" />
          <path d="M16 14h.01" />
        </svg>
      );
    case "clock":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "data":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
        </svg>
      );
    case "airtime":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
          <path d="M9 5h6" />
        </svg>
      );
    case "bolt":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "tv":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <polyline points="17 2 12 7 7 2" />
        </svg>
      );
    case "internet":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "ticket":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      );
    case "education":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      );
    case "grid":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
        </svg>
      );
    case "home":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "user":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "shield":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case "search":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "bank":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M5 10v7" />
          <path d="M9 10v7" />
          <path d="M15 10v7" />
          <path d="M19 10v7" />
          <path d="M12 3 2 8h20Z" />
        </svg>
      );
    case "download":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "share":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 15V3" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
      );
    case "copy":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "pencil":
    case "edit":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case "check":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "close":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case "info":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "alert":
    case "warning":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case "refund":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      );
    case "sun":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    case "moon":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case "message":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "droplet":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );
    case "trash":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M3 6h18" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      );
    case "building":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M3 22h18" />
          <path d="M6 18v-7M10 18v-7M14 18v-7M18 18v-7" />
          <path d="M12 2l8 5H4z" />
        </svg>
      );
    case "gamepad":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M6 11h4M8 9v4" />
          <path d="M15 12h.01M18 10h.01" />
          <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59l-.6 6A3 3 0 0 0 5 18c1 0 2-.5 2.5-1.5L9 14h6l1.5 2.5c.5 1 1.5 1.5 2.5 1.5a3 3 0 0 0 2.9-3.41l-.6-6A4 4 0 0 0 17.32 5z" />
        </svg>
      );
    case "gift":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M20 12v10H4V12" />
          <rect x="2" y="7" width="20" height="5" />
          <path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      );
    case "play":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M10 8l6 4-6 4z" />
        </svg>
      );
    case "plane":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case "car":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M5 17H3v-5l2-5h14l2 5v5h-2" />
          <path d="M9 17h6" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );
    case "card":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case "send":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4z" />
        </svg>
      );
    case "heart":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardClient({
  user,
  settings,
  initialWalletBalance,
  initialCashbackEarned = 0,
  initialTransactions,
  initialNotifications,
  initialVirtualAccount,
  initialTemporaryAccount,
}: DashboardClientProps) {
  const router = useRouter();
  const { resolved: resolvedTheme, toggleTheme } = useTheme();
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance);
  const [transactions, setTransactions] = useState<TransactionItem[]>(
    initialTransactions ?? [],
  );
  const [notifications, setNotifications] = useState(
    initialNotifications ?? [],
  );
  // Ids that were unread when the sheet opened, so they stay highlighted while it's open.
  const [unreadAtOpen, setUnreadAtOpen] = useState<Set<string>>(
    () => new Set(),
  );
  const unreadNotificationCount = notifications.filter(
    (n) => !n.read_at,
  ).length;
  const cashbackBalance = initialCashbackEarned;
  const [showBalance, setShowBalance] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "home" | "services" | "history" | "profile"
  >("home");
  const [transactionFilter, setTransactionFilter] = useState<
    "all" | "data" | "airtime" | "epin" | "electricity" | "funding"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const rechargeHistory = useRechargeHistory(transactionFilter === "epin", searchQuery, setTransactions);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const filterChipsRef = useRef<HTMLDivElement>(null);
  const [chipScroll, setChipScroll] = useState({ left: false, right: false });
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);
  const rechargeReceiptError = useRechargeReceipt(selectedTx, setSelectedTx, setTransactions, setWalletBalance);

  // Modals / Sheet States
  const [showFundModal, setShowFundModal] = useState(false);
  const [showQuickServiceModal, setShowQuickServiceModal] =
    useState<ServiceItem | null>(null);
  const [showQuickActionDockMenu, setShowQuickActionDockMenu] = useState(false);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
  const [showAccountDrawer, setShowAccountDrawer] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states for modals
  const [fundAmount, setFundAmount] = useState<string>(() =>
    initialTemporaryAccount?.amount
      ? String(initialTemporaryAccount.amount)
      : "500",
  );
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [fundingTab, setFundingTab] = useState<"transfer" | "checkout">(
    "transfer",
  );
  const [virtualAccount, setVirtualAccount] =
    useState<VirtualAccountInfo | null>(initialVirtualAccount ?? null);
  const [vaBusy, setVaBusy] = useState(false);
  const [vaBvn, setVaBvn] = useState("");
  const [showBvnForm, setShowBvnForm] = useState(false);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [tempAccount, setTempAccount] = useState<TemporaryAccountInfo | null>(
    initialTemporaryAccount ?? null,
  );
  const [tempAccountTimer, setTempAccountTimer] = useState<string | null>(null);
  const [isVerifyingTempPayment, setIsVerifyingTempPayment] = useState(false);

  useEffect(() => {
    if (tempAccount?.amount) {
      setFundAmount(String(tempAccount.amount));
      setIsEditingAmount(false);
    }
  }, [tempAccount]);
  const [serviceRecipient, setServiceRecipient] = useState("");
  const [servicePackage, setServicePackage] = useState("");
  const [serviceNetwork, setServiceNetwork] = useState("mtn");
  const [serviceCategory, setServiceCategory] = useState<string>("top");
  const [airtimeMode, setAirtimeMode] = useState<"vtu" | "epin">("vtu");
  const [airtimeAmount, setAirtimeAmount] = useState<string>("500");
  const [epinDenomination, setEpinDenomination] = useState<number>(200);
  const [epinQuantity, setEpinQuantity] = useState<number>(1);
  const [epinCardName, setEpinCardName] = useState<string>("Funda");
  const rechargeCheckout = useRechargeQuote(serviceNetwork, epinDenomination, epinQuantity, showQuickServiceModal?.id === "airtime" && airtimeMode === "epin");
  const rechargeOffers = useRechargeAvailability(showQuickServiceModal?.id === "airtime" && airtimeMode === "epin");
  const rechargeOrderLimit = rechargeOffers?.find((offer) => offer.network === serviceNetwork && offer.denomination === epinDenomination)?.maxQuantity ?? RECHARGE_MAX_QUANTITY;
  const rechargeAttempts = useRef<Record<string, string>>({});

  // Beneficiaries & Electricity states
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryItem[]>([]);
  const [electricityDisco, setElectricityDisco] = useState<string>("ikedc");
  const [electricityMeterType, setElectricityMeterType] = useState<
    "prepaid" | "postpaid"
  >("prepaid");
  const [electricityMeterNumber, setElectricityMeterNumber] =
    useState<string>("");
  const [electricityAmount, setElectricityAmount] = useState<string>("2000");
  const [verifiedCustomer, setVerifiedCustomer] = useState<{
    valid: boolean;
    customerName?: string;
    customerAddress?: string;
    meterNumber?: string;
    message?: string;
  } | null>(null);
  const [isVerifyingMeter, setIsVerifyingMeter] = useState(false);
  const [meterVerificationError, setMeterVerificationError] = useState<
    string | null
  >(null);

  // Cable TV states
  const [tvOperator, setTvOperator] = useState<
    "dstv" | "gotv" | "startimes" | "showmax"
  >("dstv");
  const [tvSmartcard, setTvSmartcard] = useState<string>("");
  const [tvSubscriptionType, setTvSubscriptionType] = useState<
    "renew" | "change"
  >("renew");
  const [tvPackageCode, setTvPackageCode] = useState<string>("");
  const [tvPackages, setTvPackages] = useState<
    {
      id: string;
      packageCode: string;
      name: string;
      price: number;
      durationMonths: number;
    }[]
  >([]);
  const [isVerifyingSmartcard, setIsVerifyingSmartcard] = useState(false);
  const [smartcardVerificationError, setSmartcardVerificationError] = useState<
    string | null
  >(null);
  const [verifiedSmartcard, setVerifiedSmartcard] = useState<{
    valid: boolean;
    customerName?: string;
    customerNumber?: string;
    currentBouquet?: string;
    dueDate?: string;
    operatorName?: string;
  } | null>(null);

  // Education & Exam Pin states
  const [eduExamBody, setEduExamBody] = useState<
    "waec" | "neco" | "jamb" | "nabteb" | "nbais"
  >("waec");
  const [eduPackageCode, setEduPackageCode] = useState<string>("waec-result");
  const [eduQuantity, setEduQuantity] = useState<number>(1);
  const [eduCandidatePhone, setEduCandidatePhone] = useState<string>("");
  const [eduCandidateEmail, setEduCandidateEmail] = useState<string>("");
  const [eduProfileCode, setEduProfileCode] = useState<string>("");
  const [eduCandidateName, setEduCandidateName] = useState<string>("");
  const [eduConfigs, setEduConfigs] = useState<FrontendEduConfig[]>([]);
  const [eduPackages, setEduPackages] = useState<FrontendEduPackage[]>([]);
  const [isVerifyingEduProfile, setIsVerifyingEduProfile] = useState(false);
  const [eduProfileVerificationError, setEduProfileVerificationError] =
    useState<string | null>(null);
  const [verifiedEduCandidate, setVerifiedEduCandidate] = useState<{
    valid: boolean;
    candidateName?: string;
    profileCode?: string;
    examType?: string;
    message?: string;
  } | null>(null);

  // Coupon promo states
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    message: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [liveProducts, setLiveProducts] = useState<LiveProduct[]>([]);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "refund" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "refund" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

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
      const response = await fetch(
        `/api/payments/bachs/status?checkout_id=${encodeURIComponent(checkoutId)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (body.status === "succeeded") {
        setWalletBalance(Number(body.balance));
        showToast(
          `₦${Number(body.amount).toLocaleString()} added to your wallet.`,
          "success",
        );
        window.history.replaceState(null, "", "/dashboard");
        return;
      }
      if (["review", "underpaid"].includes(body.status)) {
        setFundingError(
          "We received your payment and are reviewing it before crediting your wallet. No action is needed.",
        );
        window.history.replaceState(null, "", "/dashboard");
        return;
      }
      if (["failed", "expired"].includes(body.status)) {
        setFundingError(
          `Payment ${body.status}. Your wallet was not credited.`,
        );
        window.history.replaceState(null, "", "/dashboard");
        return;
      }
      if (attempts < 15) window.setTimeout(checkStatus, 2000);
      else
        setFundingError(
          "Payment is still processing. Your wallet will update after confirmation.",
        );
    };
    void checkStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showQuickServiceModal || showQuickServiceModal.id !== "data") return;
    let active = true;
    void fetch(
      `/api/services/catalog?service=${showQuickServiceModal.id}&network=${serviceNetwork}`,
      { cache: "no-store" },
    )
      .then(async (response) => ({
        ok: response.ok,
        body: await response.json().catch(() => ({})),
      }))
      .then(({ ok, body }) => {
        if (!active) return;
        if (!ok) throw new Error(body.error || "Products are unavailable.");
        const products = (body.products ?? []) as LiveProduct[];
        setLiveProducts(products);
        setServicePackage((current) =>
          products.some((product) => product.id === current)
            ? current
            : (products[0]?.id ?? ""),
        );
      })
      .catch((error: unknown) => {
        if (active)
          setServiceError(
            error instanceof Error
              ? error.message
              : "Products are unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [showQuickServiceModal, serviceNetwork]);

  const filteredLiveProducts = useMemo(() => {
    if (!liveProducts.length) return [];
    if (showQuickServiceModal?.id !== "data") return liveProducts;

    let list: LiveProduct[] = [];
    if (serviceCategory === "top") {
      const top = liveProducts.filter(
        (p) => p.featured || /1gb|2\.5gb|5gb|weekly/i.test(p.name),
      );
      list = top.length ? top : liveProducts;
    } else if (serviceCategory === "all") {
      list = liveProducts;
    } else {
      list = liveProducts.filter((p) => {
        const cat = (p.category || "daily").toLowerCase();
        const name = p.name.toLowerCase();
        const val = (p.validity || "").toLowerCase();
        return (
          cat === serviceCategory ||
          name.includes(serviceCategory) ||
          val.includes(serviceCategory)
        );
      });
    }

    return [...list].sort((a, b) => {
      const aHot =
        a.featured || /1gb|2\.5gb|5gb|awoof|hot/i.test(a.name) ? 1 : 0;
      const bHot =
        b.featured || /1gb|2\.5gb|5gb|awoof|hot/i.test(b.name) ? 1 : 0;
      if (aHot !== bHot) return bHot - aHot;
      return a.price - b.price;
    });
  }, [liveProducts, serviceCategory, showQuickServiceModal]);

  useEffect(() => {
    if (filteredLiveProducts.length > 0) {
      if (!filteredLiveProducts.some((p) => p.id === servicePackage)) {
        setServicePackage(filteredLiveProducts[0].id);
      }
    }
  }, [filteredLiveProducts, servicePackage]);

  const phoneValidation = useMemo(
    () => validateNigerianPhone(serviceRecipient),
    [serviceRecipient],
  );
  const detectedNetworkItem = NETWORK_PROVIDERS.find(
    (n) =>
      n.id === (phoneValidation.network || detectNetwork(serviceRecipient)),
  );

  const handlePhoneInputChange = (rawVal: string) => {
    const digits = cleanNigerianPhone(rawVal);
    setServiceRecipient(digits);
    const detected = detectNetwork(digits);
    if (detected && detected !== serviceNetwork) {
      setServiceNetwork(detected);
    }
  };

  const handleUseMyNumber = () => {
    if (!user.phone) return;
    const digits = cleanNigerianPhone(user.phone);
    setServiceRecipient(digits);
    const detected = detectNetwork(digits);
    if (detected && detected !== serviceNetwork) {
      setServiceNetwork(detected);
    }
  };

  const refreshBeneficiaries = useCallback(() => {
    fetch("/api/services/beneficiaries")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBeneficiaries(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshBeneficiaries();
  }, [refreshBeneficiaries]);

  const handleSelectBeneficiary = (b: BeneficiaryItem) => {
    if (b.serviceType === "electricity") {
      setElectricityMeterNumber(b.recipient);
      if (b.networkOrDisco) setElectricityDisco(b.networkOrDisco);
      if (b.meterType) setElectricityMeterType(b.meterType);
      setVerifiedCustomer(null);
      setMeterVerificationError(null);
    } else if (b.serviceType === "cable_tv") {
      setTvSmartcard(b.recipient);
      if (
        b.networkOrDisco &&
        ["dstv", "gotv", "startimes", "showmax"].includes(b.networkOrDisco)
      ) {
        setTvOperator(b.networkOrDisco as typeof tvOperator);
      }
      setVerifiedSmartcard(null);
      setSmartcardVerificationError(null);
    } else if (b.serviceType === "education") {
      setEduCandidatePhone(b.recipient);
      if (
        b.networkOrDisco &&
        ["waec", "neco", "jamb", "nabteb", "nbais"].includes(b.networkOrDisco)
      ) {
        setEduExamBody(b.networkOrDisco as typeof eduExamBody);
      }
      if (b.label && !eduCandidateName) setEduCandidateName(b.label);
    } else {
      const digits = cleanNigerianPhone(b.recipient);
      setServiceRecipient(digits);
      if (
        b.networkOrDisco &&
        ["mtn", "airtel", "glo", "9mobile"].includes(b.networkOrDisco)
      ) {
        setServiceNetwork(b.networkOrDisco);
      } else {
        const detected = detectNetwork(digits);
        if (detected) setServiceNetwork(detected);
      }
    }
  };

  const handleVerifyMeter = async () => {
    const cleanMeter = electricityMeterNumber.trim().replace(/\D/g, "");
    if (cleanMeter.length < 6) {
      setMeterVerificationError(
        "Enter a valid meter number (at least 6 digits).",
      );
      return;
    }
    setIsVerifyingMeter(true);
    setMeterVerificationError(null);
    setVerifiedCustomer(null);
    try {
      const res = await fetch("/api/services/electricity/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disco: electricityDisco,
          meterNumber: cleanMeter,
          meterType: electricityMeterType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setMeterVerificationError(
          data.error || data.message || "Meter verification failed. Check the meter number.",
        );
      } else {
        setVerifiedCustomer({
          valid: true,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          meterNumber: cleanMeter,
        });
      }
    } catch {
      setMeterVerificationError("Network error. Could not verify meter.");
    } finally {
      setIsVerifyingMeter(false);
    }
  };

  const handleApplyCoupon = async (serviceType: string, amount: number) => {
    if (!couponInput.trim()) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/services/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponInput.trim(),
          serviceType,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setCouponError(data.message || "Invalid coupon code.");
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          discountAmount: data.discountAmount,
          message: data.message,
        });
        setCouponInput("");
        showToast(data.message, "success");
      }
    } catch {
      setCouponError("Could not validate coupon.");
    } finally {
      setCouponBusy(false);
    }
  };

  const selectedLiveProduct = liveProducts.find((p) => p.id === servicePackage);
  const isAirtimeModal = showQuickServiceModal?.id === "airtime";
  const isElectricityModal = showQuickServiceModal?.id === "electricity";
  const isTvModal = showQuickServiceModal?.id === "tv";
  const selectedTvPackage = tvPackages.find(
    (p) => p.packageCode === tvPackageCode,
  );
  const tvBouquetPrice = selectedTvPackage?.price || 0;

  useEffect(() => {
    if (showQuickServiceModal?.id !== "tv") return;
    let cancelled = false;
    fetch(`/api/services/tv/packages?operator=${tvOperator}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const pkgs = d.packages || [];
        setTvPackages(pkgs);
        if (pkgs.length > 0) {
          setTvPackageCode(pkgs[0].packageCode);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showQuickServiceModal, tvOperator]);

  const handleVerifySmartcard = async (cardNum?: string) => {
    const num = (cardNum || tvSmartcard).replace(/[^0-9A-Za-z]/g, "").trim();
    if (!num || num.length < 5) {
      setSmartcardVerificationError("Enter a valid smartcard or IUC number.");
      return;
    }
    setIsVerifyingSmartcard(true);
    setSmartcardVerificationError(null);
    try {
      const res = await fetch("/api/services/tv/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator: tvOperator,
          smartcardNumber: num,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setSmartcardVerificationError(
          data.error || "Unable to verify smartcard.",
        );
        setVerifiedSmartcard(null);
      } else {
        setVerifiedSmartcard(data);
        setSmartcardVerificationError(null);
      }
    } catch {
      setSmartcardVerificationError("Network verification failed. Try again.");
    } finally {
      setIsVerifyingSmartcard(false);
    }
  };

  const isEducationModal = showQuickServiceModal?.id === "education";
  const selectedEduConfig = eduConfigs.find((c) => c.examBody === eduExamBody);
  const selectedEduPackage =
    eduPackages.find((p) => p.packageCode === eduPackageCode) || eduPackages[0];
  const eduUnitPrice = selectedEduPackage?.price || 0;
  const computedEduSubtotal = eduUnitPrice * eduQuantity;
  const computedEduTotal = isEducationModal
    ? Math.max(0, computedEduSubtotal - (appliedCoupon?.discountAmount || 0))
    : 0;

  useEffect(() => {
    if (showQuickServiceModal?.id !== "education") return;
    let cancelled = false;
    fetch(`/api/services/education/packages?examBody=${eduExamBody}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.configs)) setEduConfigs(d.configs);
        const pkgs = (d.packages || []) as FrontendEduPackage[];
        setEduPackages(pkgs);
        if (
          pkgs.length > 0 &&
          (!eduPackageCode ||
            !pkgs.some((p) => p.packageCode === eduPackageCode))
        ) {
          setEduPackageCode(pkgs[0].packageCode);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showQuickServiceModal, eduExamBody, eduPackageCode]);

  const handleVerifyEduProfile = async () => {
    const code = eduProfileCode.trim().replace(/\D/g, "");
    if (code.length !== 10) {
      setEduProfileVerificationError(
        "Enter a valid 10-digit JAMB Profile Code.",
      );
      return;
    }
    setIsVerifyingEduProfile(true);
    setEduProfileVerificationError(null);
    try {
      const res = await fetch("/api/services/education/verify-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileCode: code,
          examType: eduPackageCode.includes("direct-entry") ? "de" : "utme",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setEduProfileVerificationError(
          data.error ||
            data.message ||
            "Unable to verify candidate profile code.",
        );
        setVerifiedEduCandidate(null);
      } else {
        setVerifiedEduCandidate(data);
        if (data.candidateName) {
          setEduCandidateName(data.candidateName);
        }
        setEduProfileVerificationError(null);
      }
    } catch {
      setEduProfileVerificationError("Network verification failed. Try again.");
    } finally {
      setIsVerifyingEduProfile(false);
    }
  };

  const computedAirtimeTotal = isAirtimeModal
    ? airtimeMode === "epin"
      ? epinDenomination * epinQuantity
      : Math.max(0, Number(airtimeAmount) || 0)
    : 0;
  const computedElectricityTotal = isElectricityModal
    ? Math.max(
        0,
        (Number(electricityAmount) || 0) +
          100 -
          (appliedCoupon?.discountAmount || 0),
      )
    : 0;
  const computedTvTotal = isTvModal
    ? Math.max(0, tvBouquetPrice - (appliedCoupon?.discountAmount || 0))
    : 0;
  const computedDataTotal = showQuickServiceModal?.id === "data"
    ? Math.max(
        0,
        (selectedLiveProduct?.price ?? 0) -
          (appliedCoupon?.discountAmount || 0),
      )
    : 0;
  const activePayableAmount = isAirtimeModal
    ? airtimeMode === "epin" ? rechargeCheckout.quote?.payable ?? 0 : computedAirtimeTotal
    : isElectricityModal
      ? computedElectricityTotal
      : isTvModal
        ? computedTvTotal
        : isEducationModal
          ? computedEduTotal
          : computedDataTotal;
  const filteredTransactions = transactions.filter((tx) => {
    if (transactionFilter === "epin" ? tx.mode !== "epin" : transactionFilter !== "all" && (tx.category !== transactionFilter || (transactionFilter === "airtime" && tx.mode === "epin")))
      return false;
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

  const selectedReceipt = selectedTx
    ? buildReceipt(selectedTx, {
        customerName: user.fullName,
        customerPhone: user.phone,
        virtualAccount,
      })
    : null;
  const [receiptBusy, setReceiptBusy] = useState<"download" | "share" | null>(
    null,
  );

  const downloadReceipt = async () => {
    if (!selectedReceipt) return;
    setReceiptBusy("download");
    try {
      const blob = await renderReceiptImage(selectedReceipt);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receiptFileName(selectedReceipt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Receipt saved to your downloads", "success");
    } catch {
      showToast(
        "Couldn't create the receipt image. Please try again.",
        "error",
      );
    } finally {
      setReceiptBusy(null);
    }
  };

  // Share the receipt image where the device supports files, otherwise the text version.
  const shareReceipt = async () => {
    if (!selectedReceipt) return;
    setReceiptBusy("share");
    const text = receiptToText(selectedReceipt);
    try {
      if (typeof navigator.share === "function") {
        const blob = await renderReceiptImage(selectedReceipt).catch(
          () => null,
        );
        const file = blob
          ? new File([blob], receiptFileName(selectedReceipt), {
              type: "image/png",
            })
          : null;
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Funda receipt",
            text: selectedReceipt.title,
          });
        } else {
          await navigator.share({ title: "Funda receipt", text });
        }
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast("Receipt copied — paste it anywhere to share", "success");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        showToast(
          "Couldn't share the receipt. Try downloading it instead.",
          "error",
        );
      }
    } finally {
      setReceiptBusy(null);
    }
  };

  const [refreshingTxId, setRefreshingTxId] = useState<string | null>(null);

  const handleRefreshTxStatus = async (tx: TransactionItem) => {
    if (refreshingTxId) return;
    setRefreshingTxId(tx.id);
    try {
      const res = await fetch(
        `/api/services/transactions/${encodeURIComponent(tx.id)}?refresh=1`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.transaction) {
        throw new Error(data.error || "Could not refresh status yet.");
      }
      if (data.purchase) {
        setSelectedTx((previous) => previous?.id === tx.id ? withRechargeReceipt(previous, data.purchase as RechargeReceipt) : previous);
        setTransactions((previous) => previous.map((item) => item.id === tx.id ? withRechargeReceipt(item, data.purchase as RechargeReceipt) : item));
      }
      if (typeof data.balance === "number") {
        setWalletBalance(Number(data.balance));
      }
      const nextRawStatus = String(data.transaction.status || "");
      const nextStatus: TransactionItem["status"] =
        nextRawStatus === "successful"
          ? "completed"
          : ["failed", "refunded", "reversed", "cancelled"].includes(
                nextRawStatus,
              )
            ? "failed"
            : "processing";
      const nextProviderRef =
        typeof data.transaction.provider_reference === "string"
          ? data.transaction.provider_reference
          : tx.providerReference;

      setTransactions((prev) =>
        prev.map((item) =>
          item.id === tx.id
            ? {
                ...item,
                status: nextStatus,
                providerReference: nextProviderRef,
              }
            : item,
        ),
      );
      setSelectedTx((prev) =>
        prev && prev.id === tx.id
          ? {
              ...prev,
              status: nextStatus,
              providerReference: nextProviderRef,
            }
          : prev,
      );

      if (data.purchase && !["ready", "refunded"].includes(data.purchase.deliveryStatus)) {
        showToast(rechargeDeliveryLabel(data.purchase.deliveryStatus), "info");
      } else if (nextStatus === "completed") {
        showToast("Delivery confirmed!", "success");
      } else if (nextStatus === "failed") {
        showToast(data.purchase?.refunded === false ? "This purchase failed. Check the receipt for its refund status." : "Transaction failed and wallet refunded.", "info");
      } else {
        showToast("Still processing with network provider.", "info");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not check status.",
        "error",
      );
    } finally {
      setRefreshingTxId(null);
    }
  };

  const closeAllServices = () => {
    setShowAllServices(false);
    setServiceSearch("");
    setActiveTab("home");
  };

  const openCatalogItem = (item: CatalogItem) => {
    const service = item.serviceId
      ? SERVICES.find((srv) => srv.id === item.serviceId)
      : undefined;
    if (!service) {
      showToast(`${item.name} is coming soon`, "info");
      return;
    }
    closeAllServices();
    if (item.serviceId === "airtime") setAirtimeMode(item.id === "epin" ? "epin" : "vtu");
    setShowQuickServiceModal(service);
  };

  const catalogQuery = serviceSearch.trim().toLowerCase();
  const visibleCatalog = SERVICE_CATALOG.map((category) => ({
    ...category,
    items: catalogQuery
      ? category.items.filter((item) =>
          `${item.name} ${item.subtitle} ${category.title}`
            .toLowerCase()
            .includes(catalogQuery),
        )
      : category.items,
  })).filter((category) => category.items.length > 0);
  const liveServiceCount = SERVICE_CATALOG.reduce(
    (sum, category) =>
      sum + category.items.filter((item) => item.serviceId).length,
    0,
  );

  const openTxHistory = () => setShowTxHistory(true);

  const updateChipScroll = () => {
    const el = filterChipsRef.current;
    if (!el) return;
    setChipScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  const scrollFilterChips = (direction: 1 | -1) => {
    filterChipsRef.current?.scrollBy({
      left: direction * 180,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!showTxHistory) return;
    updateChipScroll();
    window.addEventListener("resize", updateChipScroll);
    return () => window.removeEventListener("resize", updateChipScroll);
  }, [showTxHistory]);

  const closeTxHistory = () => {
    setShowTxHistory(false);
    setActiveTab("home");
  };

  const renderTxRow = (tx: TransactionItem) => {
    const isCredit = tx.type === "credit";
    return (
      <div
        key={tx.id}
        className={styles.txItemCard}
        data-flow={isCredit ? "in" : "out"}
        data-status={tx.status}
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
            {tx.cashback && (
              <span className={styles.cashbackTag}>{tx.cashback}</span>
            )}
          </div>
          <div className={styles.txSubRow}>
            <span>{tx.meta}</span>
            <span className={styles.txDotSep}>•</span>
            <span>
              {tx.date}, {tx.time}
            </span>
          </div>
        </div>

        <div className={styles.txAmountCol}>
          <strong
            className={isCredit ? styles.amountPositive : styles.amountNegative}
          >
            {isCredit ? "+" : "-"}₦{tx.amount.toLocaleString()}
          </strong>
          <span className={styles.txStatusPill} data-status={tx.status}>
            {tx.status}
          </span>
        </div>
      </div>
    );
  };

  const syncVirtualAccount = async (opts?: {
    bvn?: string;
    forceRefresh?: boolean;
    silent?: boolean;
    backgroundPoll?: boolean;
  }) => {
    if (!opts?.backgroundPoll) setVaBusy(true);
    try {
      const isPost = Boolean(opts?.bvn || opts?.forceRefresh);
      const res = await fetch("/api/payments/bachs/virtual-account", {
        method: isPost ? "POST" : "GET",
        headers: isPost ? { "Content-Type": "application/json" } : undefined,
        body: isPost
          ? JSON.stringify({
              bvn: opts?.bvn,
              forceRefresh: opts?.forceRefresh,
            })
          : undefined,
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error || "Unable to sync virtual account.");
      if (body.virtualAccount) {
        setVirtualAccount(body.virtualAccount as VirtualAccountInfo);
      }
      if (Array.isArray(body.notifications)) {
        setNotifications(body.notifications);
      }
      if (typeof body.balance === "number") {
        setWalletBalance((prev) => {
          const added = Number((body.balance - prev).toFixed(2));
          if (added > 0) {
            const vaMeta = (
              body.virtualAccount as VirtualAccountInfo | undefined
            )?.metadata;
            const senderLabel = vaMeta?.verified_sender_bank
              ? `${vaMeta.verified_sender_bank}${vaMeta.verified_sender_name ? ` • ${vaMeta.verified_sender_name}` : ""}`
              : "Virtual Account Transfer";
            const creditTx: TransactionItem = {
              id: `va-credit-${Date.now()}`,
              title: vaMeta?.verified_sender_name
                ? `Wallet deposit from ${vaMeta.verified_sender_name}`
                : "Virtual Account Deposit",
              category: "funding",
              type: "credit",
              amount: added,
              date: "Today",
              time: new Date().toLocaleTimeString("en-NG", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              }),
              status: "completed",
              meta: senderLabel,
              reference: String(
                vaMeta?.last_deposit_charge_id || `FND-VA-${Date.now()}`,
              ),
            };
            setTransactions((curr) => [creditTx, ...curr]);
            showToast(
              `₦${added.toLocaleString("en-NG")} transfer received! Wallet & profile updated.`,
              "success",
            );
            setShowFundModal(false);
            router.refresh();
          } else if (opts?.forceRefresh && !opts?.bvn && !opts?.silent) {
            showToast(
              "Account checked • Waiting for bank confirmation",
              "info",
            );
          }
          return body.balance;
        });
      }
      if (opts?.bvn) {
        setShowBvnForm(false);
        setVaBvn("");
        showToast("Dedicated account request submitted!", "success");
      }
    } catch (err) {
      if (!opts?.silent) {
        showToast(
          err instanceof Error
            ? err.message
            : "Could not refresh virtual account.",
          "error",
        );
      }
    } finally {
      if (!opts?.backgroundPoll) setVaBusy(false);
    }
  };

  const openNotificationsDrawer = () => {
    setUnreadAtOpen(
      new Set(notifications.filter((n) => !n.read_at).map((n) => n.id)),
    );
    setShowNotificationDrawer(true);
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || nowIso })),
    );
    void fetch("/api/notifications", { method: "PATCH" }).catch(() => null);
  };

  useEffect(() => {
    if (!virtualAccount || !virtualAccount.account_number) {
      void syncVirtualAccount({ silent: true });
    }
  }, []);

  useEffect(() => {
    if (!showFundModal) return;
    if (!virtualAccount || !virtualAccount.account_number) {
      void syncVirtualAccount({ silent: true });
    }
    // GET reads Funda's own records (wallet balance, account), so polling never hits Bachs.
    const interval = window.setInterval(() => {
      void syncVirtualAccount({ silent: true, backgroundPoll: true });
    }, 5000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void syncVirtualAccount({ silent: true, backgroundPoll: true });
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [showFundModal]);

  // When Fund modal is opened, clear transient errors and allow user to specify amount first
  useEffect(() => {
    if (!showFundModal) return;
    setFundingBusy(false);
    setFundingError(null);
  }, [showFundModal]);

  // Countdown timer for active temporary virtual account
  useEffect(() => {
    if (!tempAccount?.expiresAt) {
      setTempAccountTimer(null);
      return;
    }
    const updateCountdown = () => {
      const diffMs = Date.parse(tempAccount.expiresAt) - Date.now();
      if (diffMs <= 0) {
        setTempAccountTimer("Expired");
        return;
      }
      const totalSecs = Math.floor(diffMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      setTempAccountTimer(`${mins}:${secs < 10 ? "0" : ""}${secs}`);
    };
    updateCountdown();
    const timerInterval = setInterval(updateCountdown, 1000);
    return () => clearInterval(timerInterval);
  }, [tempAccount?.expiresAt]);

  // Polling for temporary virtual account incoming transfer
  useEffect(() => {
    if (!showFundModal || !tempAccount?.checkoutId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/payments/bachs/status?checkout_id=${encodeURIComponent(tempAccount.checkoutId)}`,
          { cache: "no-store" },
        );
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (body.status === "succeeded" || body.credited) {
          const added = Number(body.amount || tempAccount.amount);
          setWalletBalance(Number(body.balance));
          const completedAccount = tempAccount;
          setTempAccount(null);
          showToast(
            `₦${added.toLocaleString("en-NG")} transfer received! (₦10 Bachs fee deducted).`,
            "success",
          );
          setShowFundModal(false);
          const creditTx: TransactionItem = {
            id: `va-temp-credit-${Date.now()}`,
            title: "Virtual Account Deposit",
            category: "funding",
            type: "credit",
            amount: added,
            date: "Today",
            time: new Date().toLocaleTimeString("en-NG", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
            status: "completed",
            meta: `${completedAccount.bankName} • ${completedAccount.accountNumber}`,
            reference: completedAccount.reference,
          };
          setTransactions((curr) => [creditTx, ...curr]);
          router.refresh();
        }
      } catch {
        // silent background poll
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [showFundModal, tempAccount?.checkoutId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncVirtualAccount({ forceRefresh: false });
      showToast("Wallet balance & account synced", "info");
    } finally {
      setIsRefreshing(false);
    }
  };

  const monthlySpend = useMemo(() => {
    const now = new Date();
    let total = 0;
    let count = 0;
    for (const tx of transactions) {
      if (tx.type !== "debit" || tx.status === "failed" || !tx.createdAt) continue;
      const when = new Date(tx.createdAt);
      if (when.getFullYear() !== now.getFullYear() || when.getMonth() !== now.getMonth()) continue;
      total += Number(tx.amount) || 0;
      count += 1;
    }
    return { total, count };
  }, [transactions]);

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { showToast("Couldn't copy. Select the value and copy it manually.", "error"); }
  };

  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showFundModal) {
      const added = Number(fundAmount) || 0;
      setWalletBalance((prev) => prev + added);
      showToast(`₦${added.toLocaleString()} added to your wallet!`, "success");
      setShowFundModal(false);
      setShowQuickActionDockMenu(false);
    } else {
      if (
        !showQuickServiceModal ||
        !["data", "airtime", "electricity", "tv", "education"].includes(
          showQuickServiceModal.id,
        )
      ) {
        setServiceError(
          "This service is coming soon. Data, airtime, electricity, Cable TV, and Exam PINs are ready.",
        );
        return;
      }
      if (showQuickServiceModal.id === "data" && !servicePackage) {
        setServiceError("Pick a bundle first.");
        return;
      }
      if (showQuickServiceModal.id === "airtime") {
        if (airtimeMode === "vtu") {
          const digits = cleanNigerianPhone(serviceRecipient);
          if (digits.length !== 10) {
            setServiceError("Enter a valid 10-digit Nigerian phone number.");
            return;
          }
          const amt = Number(airtimeAmount);
          if (!Number.isFinite(amt) || amt < 50 || amt > 50000) {
            setServiceError("Enter an airtime amount between ₦50 and ₦50,000.");
            return;
          }
        } else {
          if (![100, 200, 500, 1000].includes(epinDenomination)) {
            setServiceError("Select a valid recharge card denomination.");
            return;
          }
          if (!rechargeCheckout.quote || rechargeCheckout.busy || rechargeCheckout.error) {
            setServiceError(rechargeCheckout.error || "Wait for your recharge-card quote before paying.");
            return;
          }
        }
      }
      if (showQuickServiceModal.id === "electricity") {
        const cleanMeter = electricityMeterNumber.trim().replace(/\D/g, "");
        if (cleanMeter.length < 6) {
          setServiceError("Enter a valid meter number (at least 6 digits).");
          return;
        }
        const amt = Number(electricityAmount);
        if (!Number.isFinite(amt) || amt < 500 || amt > 100000) {
          setServiceError(
            "Enter an electricity token amount between ₦500 and ₦100,000.",
          );
          return;
        }
      }
      if (showQuickServiceModal.id === "tv") {
        const cleanCard = tvSmartcard.trim().replace(/[^0-9A-Za-z]/g, "");
        if (cleanCard.length < 5) {
          setServiceError("Enter a valid Smartcard / IUC / Account number.");
          return;
        }
        if (!tvPackageCode) {
          setServiceError("Select a bouquet package to subscribe.");
          return;
        }
      }
      if (showQuickServiceModal.id === "education") {
        if (!selectedEduPackage) {
          setServiceError("Please select an examination package.");
          return;
        }
        const phoneDigits = cleanNigerianPhone(
          eduCandidatePhone || user.phone || "",
        );
        if (phoneDigits.length !== 10) {
          setServiceError(
            "Enter a valid 10-digit candidate phone number for PIN delivery.",
          );
          return;
        }
        if (selectedEduConfig?.requiresProfileCode || eduExamBody === "jamb") {
          const profileClean = eduProfileCode.trim().replace(/\D/g, "");
          if (profileClean.length !== 10) {
            setServiceError("Enter a valid 10-digit JAMB Profile Code.");
            return;
          }
        }
        if (eduQuantity < 1 || eduQuantity > 20) {
          setServiceError("Quantity must be between 1 and 20.");
          return;
        }
      }
      setServiceBusy(true);
      setServiceError(null);
      try {
        const isRechargeOrder = showQuickServiceModal.id === "airtime" && airtimeMode === "epin";
        const intent = JSON.stringify([serviceNetwork, epinDenomination, epinQuantity, epinCardName.trim() || "Funda"]);
        const attemptStorageKey = `funda:recharge-attempts:${user.id}`;
        if (isRechargeOrder) {
          try {
            const stored = JSON.parse(sessionStorage.getItem(attemptStorageKey) || "{}");
            if (stored && typeof stored === "object" && !Array.isArray(stored)) {
              const valid = Object.entries(stored).filter((entry): entry is [string, string] => entry[0].length <= 250 && typeof entry[1] === "string" && /^[A-Za-z0-9_-]{16,160}$/.test(entry[1])).slice(-100);
              rechargeAttempts.current = { ...Object.fromEntries(valid), ...rechargeAttempts.current };
            }
          } catch { /* A disabled browser store does not affect server idempotency. */ }
        }
        const idempotencyKey = isRechargeOrder && rechargeAttempts.current[intent]
          ? rechargeAttempts.current[intent]
          : crypto.randomUUID().replaceAll("-", "");
        if (isRechargeOrder) {
          rechargeAttempts.current[intent] = idempotencyKey;
          try { sessionStorage.setItem(attemptStorageKey, JSON.stringify(rechargeAttempts.current)); } catch {}
        }
        const destination =
          showQuickServiceModal.id === "airtime" && airtimeMode === "epin"
            ? `${serviceNetwork.toUpperCase()} e-PIN (${epinQuantity}x ₦${epinDenomination})`
            : showQuickServiceModal.id === "electricity"
              ? electricityMeterNumber.trim().replace(/\D/g, "")
              : showQuickServiceModal.id === "tv"
                ? tvSmartcard.trim().replace(/[^0-9A-Za-z]/g, "")
                : showQuickServiceModal.id === "education"
                  ? eduProfileCode.trim()
                    ? `JAMB Profile ${eduProfileCode.trim()}`
                    : `0${cleanNigerianPhone(eduCandidatePhone || user.phone || "")}`
                  : serviceRecipient
                    ? `0${cleanNigerianPhone(serviceRecipient)}`
                    : "";
        const requestPayload =
          showQuickServiceModal.id === "airtime"
            ? {
                serviceType: "airtime" as const,
                mode: airtimeMode,
                network: serviceNetwork,
                amount: computedAirtimeTotal,
                quantity: airtimeMode === "epin" ? epinQuantity : 1,
                cardName: epinCardName.trim() || "Funda",
                ...(airtimeMode === "epin" ? { quoteId: rechargeCheckout.quote?.quoteId } : {}),
                destination,
                idempotencyKey,
              }
            : showQuickServiceModal.id === "electricity"
              ? {
                  serviceType: "electricity" as const,
                  disco: electricityDisco,
                  meterNumber: destination,
                  meterType: electricityMeterType,
                  amount: Number(electricityAmount),
                  customerName: verifiedCustomer?.customerName || undefined,
                  customerAddress:
                    verifiedCustomer?.customerAddress || undefined,
                  couponCode: appliedCoupon?.code || undefined,
                  idempotencyKey,
                }
              : showQuickServiceModal.id === "tv"
                ? {
                    serviceType: "tv" as const,
                    operator: tvOperator,
                    smartcardNumber: destination,
                    packageCode: tvPackageCode,
                    subscriptionType: tvSubscriptionType,
                    customerName: verifiedSmartcard?.customerName || undefined,
                    couponCode: appliedCoupon?.code || undefined,
                    idempotencyKey,
                  }
                : showQuickServiceModal.id === "education"
                  ? {
                      serviceType: "education" as const,
                      examBody: eduExamBody,
                      packageCode: eduPackageCode,
                      quantity: eduQuantity,
                      phone: `0${cleanNigerianPhone(eduCandidatePhone || user.phone || "")}`,
                      email:
                        eduCandidateEmail.trim() || user.email || undefined,
                      profileCode: eduProfileCode.trim() || undefined,
                      candidateName:
                        eduCandidateName.trim() ||
                        verifiedEduCandidate?.candidateName ||
                        undefined,
                      couponCode: appliedCoupon?.code || undefined,
                      idempotencyKey,
                    }
                  : {
                      productId: servicePackage,
                      destination,
                      couponCode: appliedCoupon?.code || undefined,
                      idempotencyKey,
                    };
        const response = await fetch("/api/services/purchase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(requestPayload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Your session expired. Please refresh the page or sign in again.",
            );
          }
          throw new Error(body.error || "Purchase could not be completed.");
        }
        if (typeof body.balance === "number") {
          setWalletBalance(Number(body.balance));
        }

        const isSuccess = body.status === "successful";
        const isFailed = body.status === "failed";
        if (isRechargeOrder && (isSuccess || isFailed)) {
          delete rechargeAttempts.current[intent];
          try { sessionStorage.setItem(attemptStorageKey, JSON.stringify(rechargeAttempts.current)); } catch {}
        }
        const isElectricityPurchase =
          showQuickServiceModal.id === "electricity";
        const isTvPurchase = showQuickServiceModal.id === "tv";
        const isEduPurchase = showQuickServiceModal.id === "education";
        const isEpinPurchase =
          showQuickServiceModal.id === "airtime" && airtimeMode === "epin";

        if (isSuccess || ["pending", "processing", "initiated"].includes(body.status)) {
          const newTx: TransactionItem = {
            id: body.transactionId || `tx-${Date.now()}`,
            title:
              body.productName ||
              selectedEduPackage?.name ||
              selectedTvPackage?.name ||
              selectedLiveProduct?.name ||
              (isElectricityPurchase
                ? `${body.discoName || electricityDisco.toUpperCase()} Token`
                : isTvPurchase
                  ? `${tvOperator.toUpperCase()} Subscription`
                  : isEduPurchase
                    ? `${eduExamBody.toUpperCase()} Exam PIN`
                    : showQuickServiceModal.id === "airtime"
                      ? "Airtime Purchase"
                      : "Data Bundle"),
            category: (body.serviceType ||
              showQuickServiceModal.id ||
              "data") as
              | "data"
              | "electricity"
              | "airtime"
              | "tv"
              | "education"
              | "funding"
              | "internet",
            type: "debit",
            amount: body.amount || activePayableAmount || 0,
            date: "Today",
            time: new Date().toLocaleTimeString("en-NG", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
            status: isSuccess ? "completed" : "processing",
            meta: isElectricityPurchase
              ? `${body.discoName || electricityDisco.toUpperCase()} • Meter ${destination}`
              : isTvPurchase
                ? `${tvOperator.toUpperCase()} • Decoder ${destination}`
                : isEduPurchase
                  ? `${body.examName || eduExamBody.toUpperCase()} • ${selectedEduPackage?.name || "Exam PIN"}${eduProfileCode ? ` • ${eduProfileCode}` : ""}`
                  : isEpinPurchase
                    ? destination
                    : destination
                      ? formatNigerianPhone(destination.slice(1)) || destination
                      : user.phone || "",
            reference: body.reference || `FND-${Date.now()}`,
            cashback:
              body.cashback && body.cashback > 0
                ? `+₦${body.cashback} cashback`
                : undefined,
            token: body.token || undefined,
            pins:
              Array.isArray(body.pins) && body.pins.length > 0
                ? body.pins
                : undefined,
            ...(isEpinPurchase ? { mode: "epin" as const, quantity: body.quantity, unitAmount: body.unitAmount, faceValue: body.faceValue, discountAmount: body.discount, deliveryStatus: body.deliveryStatus, pinCount: body.pinCount, refunded: body.refunded, createdAt: body.createdAt, providerReference: body.providerReference } : {}),
            originalAmount:
              isEpinPurchase ? body.faceValue : typeof body.originalAmount === "number"
                ? body.originalAmount
                : undefined,
            discountAmount:
              isEpinPurchase ? body.discount : typeof body.discountAmount === "number"
                ? body.discountAmount
                : undefined,
            couponCode:
              typeof body.couponCode === "string"
                ? body.couponCode
                : undefined,
          };

          setTransactions((prev) => [newTx, ...prev.filter((tx) => tx.id !== newTx.id)]);
          refreshBeneficiaries();

          const newNotif = {
            id: `notif-${Date.now()}`,
            title: isSuccess
              ? isElectricityPurchase
                ? "Electricity Token Generated"
                : isTvPurchase
                  ? "Cable TV Renewed"
                  : isEduPurchase
                    ? "Exam PIN Generated"
                    : isEpinPurchase
                      ? "Recharge PIN Generated"
                      : showQuickServiceModal.id === "data"
                        ? "Data Bundle Activated"
                        : "Airtime Top-Up Successful"
              : "Purchase Processing",
            body:
              isSuccess && isElectricityPurchase && body.token
                ? `Token: ${body.token} (${body.units || ""} kWh) for meter ${destination}.`
                : isSuccess && isTvPurchase
                  ? `Renewed ${newTx.title} for smartcard ${destination}. ${body.message || "Active immediately."}`
                  : isSuccess && isEduPurchase
                    ? `${newTx.title} · ₦${newTx.amount.toLocaleString("en-NG")} — ${newTx.pins && newTx.pins.length > 1 ? `${newTx.pins.length}× PINs` : body.token ? `Token: ${body.token}` : "Exam PIN"} generated. Ready in your receipt vault.`
                    : isSuccess && isEpinPurchase
                      ? `${newTx.title} · ${newTx.pins?.length ?? 0} PINs ready in your receipt vault.`
                      : `${newTx.title} for ${newTx.meta} · ₦${newTx.amount.toLocaleString("en-NG")} — ${body.message || "Delivered successfully."}`,
            kind: "transaction",
            read_at: null,
            created_at: new Date().toISOString(),
          };
          setNotifications((prev) => [newNotif, ...prev]);

          // Immediately display the rich iOS Transaction Receipt Sheet
          setSelectedTx(newTx);
          setShowQuickServiceModal(null);
          setShowQuickActionDockMenu(false);
          setVerifiedCustomer(null);
          setVerifiedSmartcard(null);
          setVerifiedEduCandidate(null);
          setEduProfileVerificationError(null);
          setAppliedCoupon(null);
          router.refresh();
          showToast(
            isSuccess
              ? isEduPurchase
                ? "Receipt ready • Exam PIN generated!"
                : newTx.pins?.length
                  ? "Recharge PIN generated • Ready to dial or copy!"
                  : isElectricityPurchase
                    ? "Receipt ready • Electricity token generated!"
                    : isTvPurchase
                      ? "Receipt ready • Cable TV subscription renewed!"
                      : showQuickServiceModal.id === "airtime"
                        ? "Receipt ready • Airtime delivered!"
                        : "Receipt ready • Data delivered!"
              : "Purchase is processing with provider.",
            "success",
          );
        } else if (isFailed) {
          const detail =
            body.message ||
            "Provider could not complete purchase. Your wallet has been refunded.";
          const failedTitle =
            body.productName ||
            selectedEduPackage?.name ||
            selectedTvPackage?.name ||
            selectedLiveProduct?.name ||
            (isElectricityPurchase
              ? `${electricityDisco.toUpperCase()} Token`
              : isTvPurchase
                ? `${tvOperator.toUpperCase()} Subscription`
                : isEduPurchase
                  ? `${eduExamBody.toUpperCase()} Exam PIN`
                  : showQuickServiceModal.id === "airtime"
                    ? "Airtime Purchase"
                    : "Data Bundle");
          const refundNotif = {
            id: `notif-refund-${Date.now()}`,
            title: "Purchase Refunded",
            body: `${failedTitle} · ₦${(body.amount || activePayableAmount || 0).toLocaleString("en-NG")} — ${detail}`,
            kind: "transaction",
            read_at: null,
            created_at: new Date().toISOString(),
          };
          setNotifications((prev) => [refundNotif, ...prev]);
          showToast(detail, "refund");
          setServiceError(detail);
          router.refresh();
        } else {
          showToast(
            body.message ||
              "We are confirming your purchase with the provider.",
            "info",
          );
          setShowQuickServiceModal(null);
          setShowQuickActionDockMenu(false);
        }
      } catch (error) {
        const errMessage =
          error instanceof Error
            ? error.message
            : "Purchase could not be completed.";
        setServiceError(errMessage);
        if (showQuickServiceModal.id === "airtime" && airtimeMode === "epin" && /pricing changed|quote/i.test(errMessage)) rechargeCheckout.refresh();
        showToast(errMessage, "error");
      } finally {
        setServiceBusy(false);
      }
      return;
    }
  };

  // Generate a live temporary virtual account directly without any Bachs checkout overlay.
  const handleGenerateTempAccount = async (targetAmount?: string | number) => {
    const rawAmt = targetAmount ?? fundAmount;
    const amt = Number(rawAmt);
    if (!Number.isFinite(amt) || amt < 100 || amt > 500000) {
      setFundingError("Enter an amount between ₦100 and ₦500,000.");
      return;
    }
    setFundingBusy(true);
    setFundingError(null);
    try {
      const response = await fetch("/api/payments/bachs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.temporaryAccount) {
        throw new Error(
          body.error || "Unable to generate temporary account number.",
        );
      }
      setTempAccount(body.temporaryAccount as TemporaryAccountInfo);
      setIsEditingAmount(false);
      showToast(
        "Temporary account ready! Send money from your bank app.",
        "success",
      );
    } catch (error) {
      setFundingError(
        error instanceof Error
          ? error.message
          : "Unable to generate temporary account.",
      );
    } finally {
      setFundingBusy(false);
    }
  };

  const handleCancelTransfer = async () => {
    try {
      await fetch("/api/payments/bachs/checkout", { method: "DELETE" });
    } catch {}
    setTempAccount(null);
    setIsEditingAmount(false);
    showToast("Transfer cancelled.", "info");
  };
  const handleVerifyTempPayment = async () => {
    if (!tempAccount?.checkoutId) return;
    setIsVerifyingTempPayment(true);
    try {
      const res = await fetch(
        `/api/payments/bachs/status?checkout_id=${encodeURIComponent(tempAccount.checkoutId)}&reconcile=true`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (body.status === "succeeded" || body.credited) {
        const added = Number(body.amount || tempAccount.amount);
        setWalletBalance(Number(body.balance));
        const completedAccount = tempAccount;
        setTempAccount(null);
        showToast(
          `₦${added.toLocaleString("en-NG")} transfer confirmed! (₦10 Bachs fee deducted).`,
          "success",
        );
        setShowFundModal(false);
        const creditTx: TransactionItem = {
          id: `va-temp-credit-${Date.now()}`,
          title: "Temporary Account Deposit",
          category: "funding",
          type: "credit",
          amount: added,
          date: "Today",
          time: new Date().toLocaleTimeString("en-NG", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          status: "completed",
          meta: `${completedAccount.bankName} • ${completedAccount.accountNumber}`,
          reference: completedAccount.reference,
        };
        setTransactions((curr) => [creditTx, ...curr]);
        router.refresh();
      } else {
        showToast(
          "Waiting for bank confirmation. Most transfers take 15–45 seconds.",
          "info",
        );
      }
    } catch {
      showToast(
        "Checking bank status… We'll keep monitoring automatically.",
        "info",
      );
    } finally {
      setIsVerifyingTempPayment(false);
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
        <Link
          href="/"
          className={styles.desktopWordmark}
          aria-label="Funda home"
        >
          funda<span>.</span>
        </Link>
        <div className={styles.desktopNavActions}>
          <button
            type="button"
            className={styles.frostedIconButton}
            onClick={toggleTheme}
            aria-label={
              resolvedTheme === "light"
                ? "Switch to dark mode"
                : "Switch to light mode"
            }
          >
            <SvgIcon
              name={resolvedTheme === "light" ? "moon" : "sun"}
              size={19}
            />
          </button>
          <button
            type="button"
            className={styles.frostedIconButton}
            onClick={openNotificationsDrawer}
            aria-label={
              unreadNotificationCount > 0
                ? `Notifications, ${unreadNotificationCount} unread`
                : "Notifications"
            }
          >
            <SvgIcon name="bell" size={19} />
            {unreadNotificationCount > 0 && (
              <span className={styles.unreadCountBadge} aria-hidden="true">
                {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
              </span>
            )}
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

      {/* Minimal Contextual Action Toast with Dismiss */}
      {toast && (
        <div
          className={`${styles.floatingToast} ${styles[`toast_${toast.type}`] || ""}`}
          role="status"
        >
          <span className={styles.toastIcon}>
            <SvgIcon
              name={
                toast.type === "refund"
                  ? "refund"
                  : toast.type === "error"
                    ? "alert"
                    : toast.type === "info"
                      ? "info"
                      : "check"
              }
              size={13.5}
            />
          </span>
          <span className={styles.toastMessage}>{toast.message}</span>
          <button
            type="button"
            className={styles.toastDismissBtn}
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <SvgIcon name="close" size={11.5} />
          </button>
        </div>
      )}

      <main className={styles.appContainer}>
        {/* iOS Dynamic Header */}
        <header className={styles.iosTopBar}>
          <div className={styles.brandProfile}>
            <div className={styles.brandBadge}>
              <span className={styles.brandLetter}>f.</span>
              <div className={styles.brandText}>
                <span className={styles.appName}>
                  funda<span className={styles.appNameDot}>.</span>
                </span>
                <span className={styles.liveStatusBeacon}>
                  <i className={styles.beaconDot} /> Ready • ₦ NGN
                </span>
              </div>
            </div>
          </div>

          <div className={styles.topBarRight}>
            {/* Theme Switcher Button */}
            <button
              type="button"
              className={styles.frostedIconButton}
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
            >
              <SvgIcon
                name={resolvedTheme === "light" ? "moon" : "sun"}
                size={19}
              />
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              className={styles.frostedIconButton}
              onClick={openNotificationsDrawer}
              aria-label={
                unreadNotificationCount > 0
                  ? `Notifications, ${unreadNotificationCount} unread`
                  : "Notifications"
              }
            >
              <SvgIcon name="bell" size={19} />
              {unreadNotificationCount > 0 && (
                <span className={styles.unreadCountBadge} aria-hidden="true">
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
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
        <section
          className={styles.walletCardSection}
          aria-label="Wallet Overview"
        >
          <div className={styles.proWalletHeroCard}>
            <div className={styles.cardInnerGlow} />

            {/* Card Header Row: Phone Number Chip + Controls */}
            <div className={styles.cardTopRow}>
              <button
                type="button"
                className={styles.virtualAccountChip}
                onClick={() => {
                  if (user?.phone) {
                    copyToClipboard(user.phone, "phone-top");
                  } else {
                    setShowAccountDrawer(true);
                  }
                }}
                aria-label={
                  user?.phone
                    ? "Copy phone number"
                    : "Add phone number to account"
                }
              >
                <span className={styles.nigeriaFlagPill}>🇳🇬</span>
                {user?.phone ? (
                  <>
                    <span className={styles.phoneChipValue}>{user.phone}</span>
                    <span
                      className={styles.phoneChipEditIcon}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAccountDrawer(true);
                      }}
                      aria-label="Edit phone number"
                    >
                      <SvgIcon name="pencil" size={10} />
                    </span>
                    <span className={styles.phoneChipCopyIcon}>
                      <SvgIcon
                        name={copiedField === "phone-top" ? "check" : "copy"}
                        size={10.5}
                      />
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.phoneChipPlaceholder}>
                      +234 ••••••••••
                    </span>
                    <span
                      className={styles.phoneChipEditCallout}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAccountDrawer(true);
                      }}
                      aria-label="Add phone number"
                    >
                      <SvgIcon name="pencil" size={10} />
                    </span>
                  </>
                )}
              </button>

              <div className={styles.cardRightControls}>
                <button
                  type="button"
                  className={styles.cardHistorySubtleBtn}
                  onClick={openTxHistory}
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
                    ? walletBalance.toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "••••••••"}
                </strong>
              </div>
              <div className={styles.cashbackBadgeRow}>
                <span className={styles.cashbackBadgePill}>
                  <SvgIcon name="wallet" size={11} />
                  <span>
                    Cashback: <strong>₦{cashbackBalance.toFixed(2)}</strong>
                  </span>
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
                <span className={styles.actionBtnIcon}>
                  <SvgIcon name="wallet" size={18} />
                </span>
                <span>Fund Wallet</span>
              </button>

              <button
                type="button"
                className={styles.walletSecondaryActionBtn}
                onClick={() =>
                  setShowQuickServiceModal(
                    SERVICES.find((service) => service.id === "data") ||
                      SERVICES[0],
                  )
                }
              >
                <span className={styles.actionBtnIcon}>
                  <SvgIcon name="data" size={17} />
                </span>
                <span>Buy Data</span>
              </button>

              <button
                type="button"
                className={styles.walletSecondaryActionBtn}
                onClick={() =>
                  setShowQuickServiceModal(
                    SERVICES.find((service) => service.id === "airtime") ||
                      SERVICES[1],
                  )
                }
              >
                <span className={styles.actionBtnIcon}>
                  <SvgIcon name="airtime" size={17} />
                </span>
                <span>Buy Airtime</span>
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PRO BENTO UTILITY SERVICES GRID (Data, Airtime, Electricity, etc.)        */}
        {/* ========================================================================= */}
        <section
          className={styles.servicesGridSection}
          id="services-grid-anchor"
          aria-label="Funda Utilities"
        >
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <h2 className={styles.sectionMainTitle}>Quick Services</h2>
            </div>
          </div>

          <div className={styles.bentoServicesGrid}>
            {SERVICES.map((srv) => (
              <button
                key={srv.id}
                type="button"
                className={styles.bentoServiceTile}
                onClick={() =>
                  srv.id === "more"
                    ? setShowAllServices(true)
                    : setShowQuickServiceModal(srv)
                }
                aria-label={`Buy ${srv.name}`}
              >
                <div className={styles.tileIconBackdrop} data-tone={srv.tone}>
                  <SvgIcon name={srv.iconName} size={22} />
                  {srv.badge && (
                    <span className={styles.tileBadge}>{srv.badge}</span>
                  )}
                </div>
                <span className={styles.tileName}>{srv.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* QUICK TOOLS: funding account, balance codes, monthly spend                */}
        {/* ========================================================================= */}
        <section className={styles.quickToolsSection} aria-label="Quick tools">
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <h2 className={styles.sectionMainTitle}>Quick Tools</h2>
            </div>
          </div>

          <div className={styles.quickToolsGrid}>
            {virtualAccount?.account_number ? (
              <button
                type="button"
                className={`${styles.quickToolCard} ${styles.quickToolWide}`}
                onClick={() => {
                  copyToClipboard(virtualAccount.account_number!, "tools-va");
                  showToast("Account number copied", "success");
                }}
                aria-label="Copy funding account number"
              >
                <span className={styles.quickToolIcon}>
                  <SvgIcon name="bank" size={17} />
                </span>
                <span className={styles.quickToolText}>
                  <small>{virtualAccount.bank_name || "Funding account"}</small>
                  <strong>{virtualAccount.account_number}</strong>
                </span>
                <span className={styles.quickToolAction}>
                  <SvgIcon name={copiedField === "tools-va" ? "check" : "copy"} size={14} />
                </span>
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.quickToolCard} ${styles.quickToolWide}`}
                onClick={() => setShowFundModal(true)}
              >
                <span className={styles.quickToolIcon}>
                  <SvgIcon name="bank" size={17} />
                </span>
                <span className={styles.quickToolText}>
                  <small>Funding account</small>
                  <strong>Get your account</strong>
                </span>
                <span className={styles.quickToolAction}>
                  <SvgIcon name="chevron-right" size={14} />
                </span>
              </button>
            )}

            <div className={`${styles.quickToolCard} ${styles.quickToolWide}`}>
              <span className={styles.quickToolIcon}>
                <SvgIcon name="wallet" size={17} />
              </span>
              <span className={styles.quickToolText}>
                <small>Spent this month</small>
                <strong>₦{monthlySpend.total.toLocaleString("en-NG")}</strong>
              </span>
              <span className={styles.quickToolMeta}>
                {monthlySpend.count} {monthlySpend.count === 1 ? "purchase" : "purchases"}
              </span>
            </div>

            <a href="tel:*310%23" className={styles.quickToolCard}>
              <span className={styles.quickToolIcon}>
                <SvgIcon name="airtime" size={17} />
              </span>
              <span className={styles.quickToolText}>
                <small>Airtime balance</small>
                <strong>*310#</strong>
              </span>
            </a>

            <a href="tel:*323%23" className={styles.quickToolCard}>
              <span className={styles.quickToolIcon}>
                <SvgIcon name="data" size={17} />
              </span>
              <span className={styles.quickToolText}>
                <small>Data balance</small>
                <strong>*323#</strong>
              </span>
            </a>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SMART REPEAT / FREQUENT RECHARGES                                         */}
        {/* ========================================================================= */}
        {beneficiaries.length > 0 ? <section
          className={styles.smartAssistantSection}
          aria-label="Frequent Bills"
        >
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <h2 className={styles.sectionMainTitle}>Recent Beneficiaries</h2>
            </div>
          </div>

          <div className={styles.smartRepeatScrollDeck}>
            {beneficiaries.map((item) => (
              <div key={item.id} className={styles.smartRepeatCard}>
                <div className={styles.smartRepeatHeader}>
                  <span
                    className={styles.smartIconSquircle}
                    data-tone={item.serviceType === "electricity" ? "amber" : "violet"}
                  >
                    <SvgIcon name={item.serviceType === "electricity" ? "bolt" : item.serviceType} size={19} />
                  </span>
                </div>
                <div className={styles.smartRepeatBody}>
                  <strong className={styles.smartTitle}>{item.label || item.networkOrDisco.toUpperCase()}</strong>
                  <span className={styles.smartRecipient}>
                    {item.recipient}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.smartRepeatBtn}
                  onClick={() => {
                    const service = SERVICES.find((service) => service.id === (item.serviceType === "cable_tv" ? "tv" : item.serviceType));
                    if (!service) return;
                    if (item.serviceType === "airtime") setAirtimeMode("vtu");
                    handleSelectBeneficiary(item);
                    setShowQuickServiceModal(service);
                  }}
                >
                  Review purchase
                </button>
              </div>
            ))}
          </div>
        </section> : null}

        {/* ========================================================================= */}
        {/* TRANSACTIONS SECTION (PayPal Reference Style)                             */}
        {/* ========================================================================= */}
        <section
          className={styles.activitySection}
          id="transactions-section-anchor"
          aria-label="Recent Transactions"
        >
          <div className={styles.sectionHeaderRow}>
            <div className={styles.sectionHeadingGroup}>
              <h2 className={styles.sectionMainTitle}>Transactions</h2>
            </div>
            {transactions.length > RECENT_TX_LIMIT && (
              <button
                type="button"
                className={styles.txViewAllBtn}
                onClick={openTxHistory}
              >
                View all
                <SvgIcon name="chevron-right" size={13} />
              </button>
            )}
          </div>

          <div className={styles.txListContainer}>
            {transactions.length > 0 ? (
              transactions.slice(0, RECENT_TX_LIMIT).map(renderTxRow)
            ) : (
              <div className={styles.emptyStateBox}>
                <span className={styles.emptyIcon}>
                  <SvgIcon name="clock" size={24} />
                </span>
                <strong>No transactions yet</strong>
                <p>Your purchases and top-ups will show up here.</p>
              </div>
            )}
          </div>

          {transactions.length > RECENT_TX_LIMIT && (
            <button
              type="button"
              className={styles.txSeeAllRow}
              onClick={openTxHistory}
            >
              See all {transactions.length} transactions
            </button>
          )}
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

      <div className={styles.dockBackdropBlur} aria-hidden="true" />
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
            setShowAllServices(true);
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
            <SvgIcon name="plus" size={20} />
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
                <span className={styles.menuItemIcon} data-tone="violet">
                  <SvgIcon name="data" size={17} />
                </span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>
                    Buy Data Bundle
                  </span>
                </div>
                <span className={styles.quickMenuChevron}>
                  <SvgIcon name="chevron-right" size={14} />
                </span>
              </button>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowQuickServiceModal(SERVICES[1]);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="coral">
                  <SvgIcon name="airtime" size={17} />
                </span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>
                    Buy Airtime Top-up
                  </span>
                </div>
                <span className={styles.quickMenuChevron}>
                  <SvgIcon name="chevron-right" size={14} />
                </span>
              </button>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowQuickServiceModal(SERVICES[2]);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="amber">
                  <SvgIcon name="bolt" size={17} />
                </span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>
                    Pay Electricity
                  </span>
                </div>
                <span className={styles.quickMenuChevron}>
                  <SvgIcon name="chevron-right" size={14} />
                </span>
              </button>
              <button
                type="button"
                className={styles.quickMenuItem}
                onClick={() => {
                  setShowQuickActionDockMenu(false);
                  setShowFundModal(true);
                }}
              >
                <span className={styles.menuItemIcon} data-tone="blue">
                  <SvgIcon name="plus" size={17} />
                </span>
                <div className={styles.quickMenuItemText}>
                  <span className={styles.quickMenuItemTitle}>
                    Fund Funda Wallet
                  </span>
                </div>
                <span className={styles.quickMenuChevron}>
                  <SvgIcon name="chevron-right" size={14} />
                </span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`${styles.dockTabBtn} ${activeTab === "history" ? styles.dockTabActive : ""}`}
          onClick={() => {
            setActiveTab("history");
            openTxHistory();
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
      {/* TRANSACTION HISTORY SHEET                                                 */}
      {/* ========================================================================= */}
      {showTxHistory && (
        <div className={styles.modalOverlay} onClick={closeTxHistory}>
          <div
            className={`${styles.iosBottomSheet} ${styles.txHistorySheet}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div>
                <h3 className={styles.sheetTitle}>Transactions</h3>
                <p className={styles.sheetSub}>
                  {transactions.length} in total
                </p>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={closeTxHistory}
                aria-label="Close"
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            {/* Category Filter Pills & Search */}
            <div
              className={styles.filterControlsRow}
              id="transactions-filter-anchor"
            >
              <div className={styles.txFilterScroller}>
                {chipScroll.left && (
                  <button
                    type="button"
                    className={`${styles.txChipArrow} ${styles.txChipArrowLeft}`}
                    onClick={() => scrollFilterChips(-1)}
                    aria-label="Show previous filters"
                  >
                    <SvgIcon name="chevron-right" size={14} />
                  </button>
                )}
                <div
                  ref={filterChipsRef}
                  className={styles.txFilterChips}
                  role="tablist"
                  aria-label="Filter transactions"
                  onScroll={updateChipScroll}
                >
                  {TX_FILTERS.map((filter) => {
                    const count =
                      filter.id === "all"
                        ? transactions.length
                        : transactions.filter((tx) => tx.category === filter.id)
                            .length;
                    const isActive = transactionFilter === filter.id;
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`${styles.txFilterChip} ${isActive ? styles.txFilterChipActive : ""}`}
                        onClick={() => setTransactionFilter(filter.id)}
                      >
                        <SvgIcon name={filter.icon} size={14} />
                        <span>{filter.label}</span>
                        <span className={styles.txFilterCount}>{count}</span>
                      </button>
                    );
                  })}
                </div>
                {chipScroll.right && (
                  <button
                    type="button"
                    className={`${styles.txChipArrow} ${styles.txChipArrowRight}`}
                    onClick={() => scrollFilterChips(1)}
                    aria-label="Show more filters"
                  >
                    <SvgIcon name="chevron-right" size={14} />
                  </button>
                )}
              </div>

              <div className={styles.searchBarWrapper}>
                <SvgIcon
                  name="search"
                  size={15}
                  className={styles.searchIcon}
                />
                <input
                  type="text"
                  placeholder={transactionFilter === "epin" ? "Search recharge reference…" : "Search phone, meter, or reference…"}
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

            <div
              className={`${styles.txListContainer} ${styles.txHistoryList}`}
            >
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map(renderTxRow)
              ) : !(transactionFilter === "epin" && (rechargeHistory.loading || rechargeHistory.error)) ? (
                <div className={styles.emptyStateBox}>
                  <span className={styles.emptyIcon}>
                    <SvgIcon name="search" size={24} />
                  </span>
                  <strong>No matching transactions</strong>
                  <p>Try clearing your search query or switching filters.</p>
                </div>
              ) : null}
              {transactionFilter === "epin" && (
                <div className={styles.rechargeHistoryFooter} aria-live="polite">
                  {rechargeHistory.error ? <><span role="alert">{rechargeHistory.error}</span><button type="button" className={styles.epinActionBtn} onClick={rechargeHistory.retry}>Try again</button></> : rechargeHistory.loading ? <span>Loading recharge cards…</span> : rechargeHistory.hasMore ? <button type="button" className={styles.epinActionBtn} onClick={rechargeHistory.loadMore}>Load older cards</button> : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ALL SERVICES SHEET                                                        */}
      {/* ========================================================================= */}
      {showAllServices && (
        <div className={styles.modalOverlay} onClick={closeAllServices}>
          <div
            className={`${styles.iosBottomSheet} ${styles.txHistorySheet}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div>
                <h3 className={styles.sheetTitle}>All services</h3>
                <p className={styles.sheetSub}>
                  {liveServiceCount} available now · more coming soon
                </p>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={closeAllServices}
                aria-label="Close"
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            <div className={styles.searchBarWrapper}>
              <SvgIcon name="search" size={15} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search services…"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className={styles.txSearchInput}
              />
              {serviceSearch && (
                <button
                  type="button"
                  onClick={() => setServiceSearch("")}
                  className={styles.clearSearchBtn}
                  aria-label="Clear search"
                >
                  <SvgIcon name="close" size={13} />
                </button>
              )}
            </div>

            <div className={styles.catalogScroll}>
              {visibleCatalog.length > 0 ? (
                visibleCatalog.map((category) => (
                  <section key={category.id} className={styles.catalogSection}>
                    <h4 className={styles.catalogTitle}>{category.title}</h4>
                    <div className={styles.catalogGrid}>
                      {category.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={styles.catalogItem}
                          data-soon={!item.serviceId || undefined}
                          onClick={() => openCatalogItem(item)}
                        >
                          <span className={styles.catalogIcon}>
                            <SvgIcon name={item.icon} size={18} />
                          </span>
                          <span className={styles.catalogName}>
                            {item.name}
                          </span>
                          {!item.serviceId && (
                            <span className={styles.catalogSoon}>Soon</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className={styles.emptyStateBox}>
                  <span className={styles.emptyIcon}>
                    <SvgIcon name="search" size={24} />
                  </span>
                  <strong>No services match “{serviceSearch}”</strong>
                  <p>Try a different word, like “bills” or “gift”.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: FUND WALLET SHEET                                                */}
      {/* ========================================================================= */}
      {showFundModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowFundModal(false)}
        >
          <div
            className={styles.iosBottomSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div>
                <h3 className={styles.sheetTitle}>Fund Wallet</h3>
                <p className={styles.sheetSub}>
                  Transfer from any bank app to top up your balance
                </p>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowFundModal(false)}
                aria-label="Close"
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            <div className={styles.modalForm}>
              {/* Single Continuous Minimal Flow: Enter Amount + Inline Get Account Button */}
              <div className={styles.fundAmountEntryForm}>
                <div className={styles.fundAmountInputGroup}>
                  <label
                    htmlFor="fund-amount-input"
                    className={styles.fundInputLabel}
                  >
                    {tempAccount && !isEditingAmount
                      ? "Transfer Amount (Locked for this account)"
                      : "How much would you like to transfer?"}
                  </label>
                  <div className={styles.fundAmountInlineRow}>
                    <div
                      className={`${styles.fundAmountInputWrapper} ${tempAccount && !isEditingAmount ? styles.fundAmountInputWrapperLocked : ""}`}
                    >
                      <span className={styles.fundAmountNairaPrefix}>₦</span>
                      <input
                        id="fund-amount-input"
                        type="number"
                        min="100"
                        max="500000"
                        step="50"
                        placeholder="500"
                        value={fundAmount}
                        readOnly={Boolean(tempAccount && !isEditingAmount)}
                        onChange={(e) => {
                          setFundAmount(e.target.value);
                          if (fundingError) setFundingError(null);
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            (!tempAccount || isEditingAmount)
                          ) {
                            e.preventDefault();
                            void handleGenerateTempAccount(fundAmount);
                          }
                        }}
                        className={`${styles.fundMainAmountInput} ${tempAccount && !isEditingAmount ? styles.fundMainAmountInputLocked : ""}`}
                        autoFocus={!tempAccount || isEditingAmount}
                        required
                      />
                    </div>

                    {tempAccount && !isEditingAmount ? (
                      <button
                        type="button"
                        className={styles.fundInlineChangeBtn}
                        onClick={() => {
                          setIsEditingAmount(true);
                          setFundingError(null);
                        }}
                        aria-label="Change transfer amount"
                      >
                        <span>Change</span>
                      </button>
                    ) : (
                      <div className={styles.fundEditBtnGroup}>
                        <button
                          type="button"
                          className={styles.fundInlineGetBtn}
                          disabled={
                            fundingBusy ||
                            !fundAmount ||
                            Number(fundAmount) < 100
                          }
                          onClick={() =>
                            void handleGenerateTempAccount(fundAmount)
                          }
                        >
                          {fundingBusy ? (
                            <>
                              <SpinnerIcon size={13} />
                              <span>Getting…</span>
                            </>
                          ) : tempAccount ? (
                            `Update to ₦${Number(fundAmount).toLocaleString()}`
                          ) : (
                            "Get Account Number"
                          )}
                        </button>
                        {tempAccount && isEditingAmount && (
                          <button
                            type="button"
                            className={styles.fundInlineCancelBtn}
                            onClick={() => {
                              setFundAmount(String(tempAccount.amount));
                              setIsEditingAmount(false);
                              setFundingError(null);
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick preset chips - ONLY shown when choosing or editing amount */}
                {(!tempAccount || isEditingAmount) && (
                  <div className={styles.fundAmountPresetRow}>
                    {["500", "1000", "2000", "5000", "10000"].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className={`${styles.fundPresetChip} ${fundAmount === amt ? styles.fundPresetChipActive : ""}`}
                        onClick={() => {
                          setFundAmount(amt);
                          if (fundingError) setFundingError(null);
                        }}
                      >
                        ₦{Number(amt).toLocaleString()}
                      </button>
                    ))}
                  </div>
                )}

                {/* Line talking about how much you will receive because of the ₦10 fee */}
                <div className={styles.fundReceiveCalculationLine}>
                  <span>You will receive:</span>
                  <span className={styles.fundReceiveHighlight}>
                    ₦
                    {Math.max(0, (Number(fundAmount) || 0) - 10).toLocaleString(
                      "en-NG",
                      { minimumFractionDigits: 2 },
                    )}
                  </span>
                  <span className={styles.fundReceiveFeeSub}>
                    into wallet (₦10 Bachs fee deducted)
                  </span>
                </div>

                {fundingError && (
                  <div className={styles.fundErrorNotice} role="alert">
                    {fundingError}
                  </div>
                )}
              </div>
              {/* Account Number appears on the SAME page below once generated */}
              {tempAccount &&
                !isEditingAmount &&
                tempAccountTimer !== "Expired" && (
                  <div className={styles.bankTransferWrapper}>
                    {/* Single Unified Box containing Account Number, Bank Name, Account Name, and Amount to Send */}
                    <div className={styles.bankDetailsUnifiedBox}>
                      <div className={styles.naturalDetailsList}>
                        {/* Account Number with Copy Button in front */}
                        <div className={styles.naturalDetailLine}>
                          <span className={styles.naturalLabel}>
                            Account Number:
                          </span>
                          <div className={styles.naturalAccountGroup}>
                            <span className={styles.naturalAccountDigits}>
                              {tempAccount.accountNumber}
                            </span>
                            <button
                              type="button"
                              className={`${styles.unifiedCopyBtn} ${copiedField === "temp-va-num" ? styles.unifiedCopyBtnCopied : ""}`}
                              onClick={() => {
                                copyToClipboard(
                                  tempAccount.accountNumber,
                                  "temp-va-num",
                                );
                                showToast("Account number copied!", "success");
                              }}
                              aria-label="Copy account number"
                            >
                              <SvgIcon
                                name={
                                  copiedField === "temp-va-num"
                                    ? "check"
                                    : "copy"
                                }
                                size={10}
                              />
                              <span>
                                {copiedField === "temp-va-num"
                                  ? "Copied"
                                  : "Copy"}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Bank Name */}
                        <div className={styles.naturalDetailLine}>
                          <span className={styles.naturalLabel}>
                            Bank Name:
                          </span>
                          <span className={styles.naturalValue}>
                            {tempAccount.bankName || "Nombank MFB"}
                          </span>
                        </div>

                        {/* Account Name */}
                        <div className={styles.naturalDetailLine}>
                          <span className={styles.naturalLabel}>
                            Account Name:
                          </span>
                          <span className={styles.naturalValue}>
                            {tempAccount.accountName || "BACHS/Funda"}
                          </span>
                        </div>

                        {/* Amount to Send */}
                        <div className={styles.naturalDetailLine}>
                          <span className={styles.naturalLabel}>
                            Amount to Send:
                          </span>
                          <div className={styles.naturalAccountGroup}>
                            <span className={styles.naturalAmountHighlight}>
                              ₦
                              {Number(tempAccount.amount).toLocaleString(
                                "en-NG",
                                { minimumFractionDigits: 2 },
                              )}
                            </span>
                            <button
                              type="button"
                              className={`${styles.unifiedCopyBtn} ${copiedField === "temp-va-amt" ? styles.unifiedCopyBtnCopied : ""}`}
                              onClick={() => {
                                copyToClipboard(
                                  String(Number(tempAccount.amount)),
                                  "temp-va-amt",
                                );
                                showToast("Amount copied!", "success");
                              }}
                              aria-label="Copy amount to send"
                            >
                              <SvgIcon
                                name={
                                  copiedField === "temp-va-amt"
                                    ? "check"
                                    : "copy"
                                }
                                size={10}
                              />
                              <span>
                                {copiedField === "temp-va-amt"
                                  ? "Copied"
                                  : "Copy"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Animated spinner waiting for transfer */}
                    <div className={styles.unifiedWaitingStrip}>
                      <SpinnerIcon
                        size={14}
                        className={styles.waitingSpinner}
                      />
                      <span>
                        Waiting for you to transfer the money… It will be
                        detected automatically.
                      </span>
                    </div>

                    {/* Confirmation & Cancel Action Buttons */}
                    <div className={styles.confirmActionContainer}>
                      <button
                        type="button"
                        className={styles.confirmTransferBtn}
                        disabled={isVerifyingTempPayment}
                        onClick={() => void handleVerifyTempPayment()}
                      >
                        {isVerifyingTempPayment ? (
                          <>
                            <SpinnerIcon size={14} />
                            <span>Checking with bank…</span>
                          </>
                        ) : (
                          "I Have Sent the Money"
                        )}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelTransferBtn}
                        disabled={isVerifyingTempPayment}
                        onClick={() => void handleCancelTransfer()}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL 2: QUICK UTILITY SERVICE PURCHASE SHEET                             */}
      {/* ========================================================================= */}
      {showQuickServiceModal && (
        <div
          className={styles.modalOverlay}
          data-recharge-modal={showQuickServiceModal.id === "airtime" && airtimeMode === "epin" || undefined}
          onClick={() => setShowQuickServiceModal(null)}
        >
          <div
            className={styles.iosBottomSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div className={styles.sheetServiceTitleGroup}>
                <span
                  className={styles.sheetServiceIcon}
                  data-tone={showQuickServiceModal.tone}
                >
                  <SvgIcon name={showQuickServiceModal.iconName} size={18} />
                </span>
                <div>
                  <h3 className={styles.sheetTitle}>
                    {showQuickServiceModal.name}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowQuickServiceModal(null)}
                aria-label="Close purchase"
              >
                <SvgIcon name="close" size={14} />
              </button>
            </div>

            <form onSubmit={handleSimulatePayment} className={styles.modalForm}>
              {showQuickServiceModal.id === "electricity" ? (
                <>
                  {/* Electricity Disco Selection Dropdown */}
                  <div className={styles.fieldBlock}>
                    <span className={styles.fieldBlockLabel}>
                      Select Electricity Company (Disco)
                    </span>
                    <FundaSelect
                      ariaLabel="Select Electricity Company (Disco)"
                      value={electricityDisco}
                      placeholder="Select your electricity company"
                      onChange={(val) => {
                        setElectricityDisco(val);
                        setVerifiedCustomer(null);
                        setMeterVerificationError(null);
                      }}
                      options={ELECTRICITY_DISCOS.map((d) => ({
                        value: d.code,
                        label: d.name,
                        meta: d.short,
                      }))}
                    />
                  </div>

                  {/* Meter Type Toggle */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <button
                      type="button"
                      className={`${styles.airtimeModeBtn} ${electricityMeterType === "prepaid" ? styles.airtimeModeBtnActive : ""}`}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        background:
                          electricityMeterType === "prepaid"
                            ? "#660033"
                            : "transparent",
                        color:
                          electricityMeterType === "prepaid"
                            ? "#ffffff"
                            : "inherit",
                      }}
                      onClick={() => {
                        setElectricityMeterType("prepaid");
                        setVerifiedCustomer(null);
                      }}
                    >
                      ⚡ Prepaid (Token)
                    </button>
                    <button
                      type="button"
                      className={`${styles.airtimeModeBtn} ${electricityMeterType === "postpaid" ? styles.airtimeModeBtnActive : ""}`}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        background:
                          electricityMeterType === "postpaid"
                            ? "#660033"
                            : "transparent",
                        color:
                          electricityMeterType === "postpaid"
                            ? "#ffffff"
                            : "inherit",
                      }}
                      onClick={() => {
                        setElectricityMeterType("postpaid");
                        setVerifiedCustomer(null);
                      }}
                    >
                      📄 Postpaid (Bill)
                    </button>
                  </div>

                  {/* Saved Beneficiary Meters */}
                  {beneficiaries.filter((b) => b.serviceType === "electricity")
                    .length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#64748b",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        Saved Meters
                      </span>
                      <div className={styles.beneficiaryDeck}>
                        {beneficiaries
                          .filter((b) => b.serviceType === "electricity")
                          .map((b) => {
                            const isSelected =
                              electricityMeterNumber === b.recipient;
                            return (
                              <button
                                key={b.id}
                                type="button"
                                className={`${styles.beneficiaryChip} ${isSelected ? styles.beneficiaryChipActive : ""}`}
                                onClick={() => handleSelectBeneficiary(b)}
                              >
                                <span
                                  style={{
                                    textTransform: "uppercase",
                                    fontSize: "9px",
                                    padding: "1px 4px",
                                    borderRadius: "3px",
                                    background: "#fef3c7",
                                    color: "#92400e",
                                  }}
                                >
                                  ⚡ {b.networkOrDisco}
                                </span>
                                <span>{b.label || b.recipient}</span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Meter Number Input + Verify Button */}
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        {electricityMeterType === "prepaid"
                          ? "Meter Number"
                          : "Account / Meter Number"}
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleVerifyMeter()}
                        disabled={
                          isVerifyingMeter ||
                          electricityMeterNumber.trim().length < 6
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "#660033",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {isVerifyingMeter ? "Verifying…" : "Verify Meter →"}
                      </button>
                    </div>
                    <div className={styles.phoneInputBox}>
                      <span className={styles.phonePrefixTag}>MTR</span>
                      <input
                        type="text"
                        placeholder="e.g. 01011504932"
                        value={electricityMeterNumber}
                        onChange={(e) => {
                          setElectricityMeterNumber(
                            e.target.value.replace(/\D/g, ""),
                          );
                          setVerifiedCustomer(null);
                          setMeterVerificationError(null);
                        }}
                        className={styles.phoneInputField}
                        maxLength={20}
                        required
                      />
                    </div>
                    {meterVerificationError && (
                      <span
                        className={styles.phoneValidationNotice}
                        style={{ color: "#dc2626" }}
                      >
                        {meterVerificationError}
                      </span>
                    )}
                  </div>

                  {/* Verified Customer Card */}
                  {verifiedCustomer && (
                    <div className={styles.meterVerifyCard}>
                      <div className={styles.meterVerifyIcon}>✓</div>
                      <div className={styles.meterVerifyInfo}>
                        <span className={styles.meterCustomerName}>
                          {verifiedCustomer.customerName || "Customer Verified"}
                        </span>
                        {verifiedCustomer.customerAddress && (
                          <span className={styles.meterCustomerAddress}>
                            {verifiedCustomer.customerAddress}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Amount Selection */}
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: "6px",
                      }}
                    >
                      Recharge Amount (₦)
                    </label>
                    <div
                      className={styles.phoneInputBox}
                      style={{ marginBottom: "8px" }}
                    >
                      <span className={styles.phonePrefixTag}>₦</span>
                      <input
                        type="number"
                        placeholder="Enter amount (min ₦500)"
                        value={electricityAmount}
                        onChange={(e) => setElectricityAmount(e.target.value)}
                        min={500}
                        max={100000}
                        className={styles.phoneInputField}
                        required
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        overflowX: "auto",
                        paddingBottom: "4px",
                        scrollbarWidth: "none",
                      }}
                    >
                      {["1000", "2000", "5000", "10000", "20000"].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border:
                              electricityAmount === amt
                                ? "1.5px solid #660033"
                                : "1px solid rgba(0,0,0,0.08)",
                            background:
                              electricityAmount === amt
                                ? "rgba(102, 0, 51, 0.08)"
                                : "#ffffff",
                            color:
                              electricityAmount === amt ? "#660033" : "#334155",
                            fontWeight: 700,
                            fontSize: "12px",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                          onClick={() => setElectricityAmount(amt)}
                        >
                          ₦{Number(amt).toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Promo Coupon */}
                  <div style={{ marginBottom: "10px" }}>
                    {!appliedCoupon ? (
                      <div className={styles.couponRow}>
                        <input
                          type="text"
                          placeholder="Promo code (e.g. POWER5)"
                          value={couponInput}
                          onChange={(e) =>
                            setCouponInput(e.target.value.toUpperCase())
                          }
                          className={styles.couponInput}
                        />
                        <button
                          type="button"
                          disabled={couponBusy || !couponInput.trim()}
                          onClick={() =>
                            handleApplyCoupon(
                              "electricity",
                              Number(electricityAmount) || 0,
                            )
                          }
                          className={styles.couponBtn}
                        >
                          {couponBusy ? "Checking…" : "Apply"}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.couponBadge}>
                        <span>
                          🎟️ {appliedCoupon.code} applied (-₦
                          {appliedCoupon.discountAmount.toLocaleString()})
                        </span>
                        <button
                          type="button"
                          onClick={() => setAppliedCoupon(null)}
                          className={styles.couponBadgeRemove}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#dc2626",
                          marginTop: "3px",
                        }}
                      >
                        {couponError}
                      </div>
                    )}
                  </div>

                  {/* Order Summary Breakdown */}
                  <div className={styles.orderSummaryCard}>
                    <div className={styles.orderSummaryRow}>
                      <span>Token Value</span>
                      <span>
                        ₦{(Number(electricityAmount) || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className={styles.orderSummaryRow}>
                      <span>Convenience Fee</span>
                      <span>₦100.00</span>
                    </div>
                    {appliedCoupon && (
                      <div
                        className={styles.orderSummaryRow}
                        style={{ color: "#059669", fontWeight: 600 }}
                      >
                        <span>Discount ({appliedCoupon.code})</span>
                        <span>
                          -₦{appliedCoupon.discountAmount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className={styles.orderSummaryTotal}>
                      <span>Total Payable</span>
                      <span>
                        ₦
                        {Math.max(
                          0,
                          (Number(electricityAmount) || 0) +
                            100 -
                            (appliedCoupon?.discountAmount || 0),
                        ).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </>
              ) : showQuickServiceModal.id === "tv" ? (
                <>
                  {/* Operator Selection Grid */}
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: "6px",
                      }}
                    >
                      Select Cable TV Operator
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {TV_OPERATORS.map((op) => (
                        <button
                          key={op.id}
                          type="button"
                          className={`${styles.discoCard} ${tvOperator === op.id ? styles.discoCardActive : ""}`}
                          style={{
                            alignItems: "center",
                            textAlign: "center",
                            padding: "10px 4px",
                            border:
                              tvOperator === op.id
                                ? `2px solid ${op.color}`
                                : "1px solid rgba(0,0,0,0.08)",
                          }}
                          onClick={() => {
                            setTvOperator(op.id as typeof tvOperator);
                            setVerifiedSmartcard(null);
                            setSmartcardVerificationError(null);
                          }}
                        >
                          <strong
                            style={{
                              color:
                                tvOperator === op.id ? op.color : "inherit",
                              fontSize: "13px",
                            }}
                          >
                            {op.name}
                          </strong>
                          <span
                            style={{
                              fontSize: "10px",
                              color: "#64748b",
                              marginTop: "2px",
                            }}
                          >
                            {op.badge}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Saved Beneficiaries Quick-Select Deck */}
                  {beneficiaries.filter(
                    (b) =>
                      b.serviceType === "cable_tv" ||
                      b.networkOrDisco === tvOperator,
                  ).length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#64748b",
                            textTransform: "uppercase",
                          }}
                        >
                          Recent Smartcards
                        </span>
                      </div>
                      <div className={styles.beneficiaryScroll}>
                        {beneficiaries
                          .filter(
                            (b) =>
                              b.serviceType === "cable_tv" ||
                              b.networkOrDisco === tvOperator,
                          )
                          .map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              className={`${styles.beneficiaryChip} ${tvSmartcard === b.recipient ? styles.beneficiaryChipActive : ""}`}
                              onClick={() => {
                                setTvSmartcard(b.recipient);
                                void handleVerifySmartcard(b.recipient);
                              }}
                            >
                              <span>💳</span>
                              <strong>{b.recipient}</strong>
                              {b.label && <small>{b.label}</small>}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Smartcard / IUC Input with Verify Button */}
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        Smartcard / IUC Number
                      </label>
                      <button
                        type="button"
                        onClick={() => handleVerifySmartcard()}
                        disabled={isVerifyingSmartcard || !tvSmartcard.trim()}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#660033",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor:
                            isVerifyingSmartcard || !tvSmartcard.trim()
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            isVerifyingSmartcard || !tvSmartcard.trim()
                              ? 0.6
                              : 1,
                        }}
                      >
                        {isVerifyingSmartcard
                          ? "Verifying..."
                          : "Verify Decoder →"}
                      </button>
                    </div>
                    <div className={styles.phoneInputBox}>
                      <span className={styles.phonePrefixTag}>📺</span>
                      <input
                        type="text"
                        placeholder="Enter 10-digit Smartcard or IUC"
                        value={tvSmartcard}
                        onChange={(e) => {
                          setTvSmartcard(
                            e.target.value.replace(/[^0-9A-Za-z]/g, ""),
                          );
                          setVerifiedSmartcard(null);
                          setSmartcardVerificationError(null);
                        }}
                        className={styles.phoneInputField}
                        required
                      />
                      {tvSmartcard && (
                        <button
                          type="button"
                          className={styles.phoneClearBtn}
                          onClick={() => {
                            setTvSmartcard("");
                            setVerifiedSmartcard(null);
                            setSmartcardVerificationError(null);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {smartcardVerificationError && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#dc2626",
                          marginTop: "4px",
                          fontWeight: 500,
                        }}
                      >
                        ⚠️ {smartcardVerificationError}
                      </div>
                    )}

                    {/* Verified Customer Card */}
                    {verifiedSmartcard?.valid && (
                      <div
                        className={styles.meterVerifyCard}
                        style={{ marginTop: "8px" }}
                      >
                        <div className={styles.meterVerifyIcon}>✓</div>
                        <div className={styles.meterVerifyInfo}>
                          <span className={styles.meterCustomerName}>
                            {verifiedSmartcard.customerName ||
                              "VERIFIED CUSTOMER"}
                          </span>
                          <span
                            className={styles.meterAddress}
                            style={{ fontSize: "11px", color: "#166534" }}
                          >
                            Current Bouquet:{" "}
                            <strong>
                              {verifiedSmartcard.currentBouquet || "Active"}
                            </strong>
                            {verifiedSmartcard.dueDate
                              ? ` • Due: ${verifiedSmartcard.dueDate}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Subscription Mode: Renew Current vs Change Bouquet */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <button
                      type="button"
                      className={`${styles.airtimeModeBtn} ${tvSubscriptionType === "renew" ? styles.airtimeModeBtnActive : ""}`}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        background:
                          tvSubscriptionType === "renew"
                            ? "#660033"
                            : "transparent",
                        color:
                          tvSubscriptionType === "renew"
                            ? "#ffffff"
                            : "inherit",
                        padding: "8px",
                        fontSize: "12px",
                      }}
                      onClick={() => setTvSubscriptionType("renew")}
                    >
                      🔄 Renew Bouquet
                    </button>
                    <button
                      type="button"
                      className={`${styles.airtimeModeBtn} ${tvSubscriptionType === "change" ? styles.airtimeModeBtnActive : ""}`}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        background:
                          tvSubscriptionType === "change"
                            ? "#660033"
                            : "transparent",
                        color:
                          tvSubscriptionType === "change"
                            ? "#ffffff"
                            : "inherit",
                        padding: "8px",
                        fontSize: "12px",
                      }}
                      onClick={() => setTvSubscriptionType("change")}
                    >
                      🔀 Switch Bouquet
                    </button>
                  </div>

                  {/* Bouquet Package Selector */}
                  <div className={styles.fieldBlock}>
                    <span className={styles.fieldBlockLabel}>Bouquet</span>
                    <FundaSelect
                      ariaLabel="Bouquet"
                      value={tvPackageCode}
                      onChange={setTvPackageCode}
                      options={tvPackages.map((p) => ({
                        value: p.packageCode,
                        label: `${p.name} · ${p.durationMonths === 0 ? "1 week" : p.durationMonths === 1 ? "1 month" : `${p.durationMonths} months`}`,
                        meta: `₦${p.price.toLocaleString("en-NG")}`,
                      }))}
                    />
                  </div>

                  {/* Promo Coupon */}
                  <div style={{ marginBottom: "10px" }}>
                    {!appliedCoupon ? (
                      <div className={styles.couponRow}>
                        <input
                          type="text"
                          placeholder="Promo code (e.g. FUNDA50)"
                          value={couponInput}
                          onChange={(e) =>
                            setCouponInput(e.target.value.toUpperCase())
                          }
                          className={styles.couponInput}
                        />
                        <button
                          type="button"
                          disabled={couponBusy || !couponInput.trim()}
                          onClick={() =>
                            handleApplyCoupon("cable_tv", tvBouquetPrice)
                          }
                          className={styles.couponBtn}
                        >
                          {couponBusy ? "Checking…" : "Apply"}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.couponBadge}>
                        <span>
                          🎟️ {appliedCoupon.code} applied (-₦
                          {appliedCoupon.discountAmount.toLocaleString()})
                        </span>
                        <button
                          type="button"
                          onClick={() => setAppliedCoupon(null)}
                          className={styles.couponBadgeRemove}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#dc2626",
                          marginTop: "3px",
                        }}
                      >
                        {couponError}
                      </div>
                    )}
                  </div>

                  {/* Order Summary Card */}
                  <div className={styles.orderSummaryCard}>
                    <div className={styles.orderSummaryRow}>
                      <span>Bouquet Price</span>
                      <span>
                        ₦
                        {tvBouquetPrice.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className={styles.orderSummaryRow}>
                      <span>Convenience Fee</span>
                      <span>₦0.00 (Free)</span>
                    </div>
                    {appliedCoupon && (
                      <div
                        className={styles.orderSummaryRow}
                        style={{ color: "#059669", fontWeight: 600 }}
                      >
                        <span>Discount ({appliedCoupon.code})</span>
                        <span>
                          -₦{appliedCoupon.discountAmount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className={styles.orderSummaryTotal}>
                      <span>Total Payable</span>
                      <span>
                        ₦
                        {computedTvTotal.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </>
              ) : showQuickServiceModal.id === "education" ? (
                <>
                  {/* Exam Board Selection Grid */}
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: "6px",
                      }}
                    >
                      Select Examination Board
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, 1fr)",
                        gap: "6px",
                      }}
                    >
                      {EDUCATION_BOARDS.map((board) => {
                        const isSelected = eduExamBody === board.id;
                        return (
                          <button
                            key={board.id}
                            type="button"
                            className={`${styles.discoCard} ${isSelected ? styles.discoCardActive : ""}`}
                            style={{
                              alignItems: "center",
                              textAlign: "center",
                              padding: "8px 2px",
                              border: isSelected
                                ? `2px solid ${board.color}`
                                : "1px solid rgba(0,0,0,0.08)",
                            }}
                            onClick={() => {
                              setEduExamBody(board.id as typeof eduExamBody);
                              setVerifiedEduCandidate(null);
                              setEduProfileVerificationError(null);
                            }}
                          >
                            <span
                              style={{ fontSize: "16px", marginBottom: "2px" }}
                            >
                              {board.icon}
                            </span>
                            <strong
                              style={{
                                color: isSelected ? board.color : "inherit",
                                fontSize: "11px",
                              }}
                            >
                              {board.name}
                            </strong>
                            <span
                              style={{
                                fontSize: "9px",
                                color: "#64748b",
                                marginTop: "1px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {board.badge.split(" ")[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Maintenance Notice Alert if exam body offline */}
                  {selectedEduConfig && !selectedEduConfig.isActive && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#991b1b",
                        fontSize: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      ⚠️ <strong>Maintenance Notice:</strong>{" "}
                      {selectedEduConfig.maintenanceNotice ||
                        `${selectedEduConfig.name} portal is currently offline for scheduled maintenance.`}
                    </div>
                  )}

                  {/* Saved Beneficiaries Quick-Select Deck */}
                  {beneficiaries.filter(
                    (b) =>
                      b.serviceType === "education" ||
                      b.networkOrDisco === eduExamBody,
                  ).length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#64748b",
                            textTransform: "uppercase",
                          }}
                        >
                          Recent Candidates
                        </span>
                      </div>
                      <div className={styles.beneficiaryScroll}>
                        {beneficiaries
                          .filter(
                            (b) =>
                              b.serviceType === "education" ||
                              b.networkOrDisco === eduExamBody,
                          )
                          .map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              className={`${styles.beneficiaryChip} ${eduCandidatePhone === b.recipient ? styles.beneficiaryChipActive : ""}`}
                              onClick={() => {
                                setEduCandidatePhone(b.recipient);
                                if (b.label && !eduCandidateName)
                                  setEduCandidateName(b.label);
                              }}
                            >
                              <span>🎓</span>
                              <strong>{b.recipient}</strong>
                              {b.label && <small>{b.label}</small>}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Package Selector via FundaSelect */}
                  <div
                    className={styles.fieldBlock}
                    style={{ marginBottom: "12px" }}
                  >
                    <span className={styles.fieldBlockLabel}>
                      Examination Package
                    </span>
                    <FundaSelect
                      ariaLabel="Exam Package"
                      value={eduPackageCode}
                      onChange={(val) => {
                        setEduPackageCode(val);
                        setVerifiedEduCandidate(null);
                        setEduProfileVerificationError(null);
                      }}
                      options={eduPackages.map((p) => ({
                        value: p.packageCode,
                        label: p.name,
                        meta: `₦${p.price.toLocaleString("en-NG")}`,
                      }))}
                    />
                  </div>

                  {/* JAMB Profile Code Input & Live Verification */}
                  {(selectedEduConfig?.requiresProfileCode ||
                    eduExamBody === "jamb") && (
                    <div style={{ marginBottom: "12px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          {selectedEduConfig?.profileCodeLabel ||
                            "10-Digit JAMB Profile Code"}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleVerifyEduProfile()}
                          disabled={
                            isVerifyingEduProfile ||
                            eduProfileCode.trim().length !== 10
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "#660033",
                            fontWeight: 700,
                            fontSize: "12px",
                            cursor:
                              isVerifyingEduProfile ||
                              eduProfileCode.trim().length !== 10
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              isVerifyingEduProfile ||
                              eduProfileCode.trim().length !== 10
                                ? 0.6
                                : 1,
                          }}
                        >
                          {isVerifyingEduProfile
                            ? "Verifying..."
                            : "Verify Profile Code →"}
                        </button>
                      </div>
                      <div className={styles.phoneInputBox}>
                        <span className={styles.phonePrefixTag}>🎓</span>
                        <input
                          type="text"
                          placeholder="e.g. 1029384756 (10 digits)"
                          maxLength={10}
                          value={eduProfileCode}
                          onChange={(e) => {
                            setEduProfileCode(
                              e.target.value.replace(/\D/g, ""),
                            );
                            setVerifiedEduCandidate(null);
                            setEduProfileVerificationError(null);
                          }}
                          className={styles.phoneInputField}
                          required
                        />
                        {eduProfileCode && (
                          <button
                            type="button"
                            className={styles.phoneClearBtn}
                            onClick={() => {
                              setEduProfileCode("");
                              setVerifiedEduCandidate(null);
                              setEduProfileVerificationError(null);
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "10.5px",
                          color: "#64748b",
                          marginTop: "3px",
                        }}
                      >
                        Candidates get this by texting &quot;NIN [11
                        digits]&quot; to 55019 or 66019.
                      </div>

                      {eduProfileVerificationError && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#dc2626",
                            marginTop: "4px",
                            fontWeight: 500,
                          }}
                        >
                          ⚠️ {eduProfileVerificationError}
                        </div>
                      )}

                      {/* Verified Candidate Profile Card */}
                      {verifiedEduCandidate?.valid && (
                        <div
                          className={styles.meterVerifyCard}
                          style={{ marginTop: "8px" }}
                        >
                          <div className={styles.meterVerifyIcon}>✓</div>
                          <div className={styles.meterVerifyInfo}>
                            <span className={styles.meterCustomerName}>
                              {verifiedEduCandidate.candidateName ||
                                "VERIFIED JAMB CANDIDATE"}
                            </span>
                            <span
                              className={styles.meterAddress}
                              style={{ fontSize: "11px", color: "#166534" }}
                            >
                              Profile:{" "}
                              <strong>
                                {verifiedEduCandidate.profileCode ||
                                  eduProfileCode}
                              </strong>{" "}
                              •{" "}
                              {verifiedEduCandidate.examType?.toUpperCase() ||
                                "UTME"}{" "}
                              2026 Ready
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quantity Pills */}
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: "6px",
                      }}
                    >
                      Quantity of PINs
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, 1fr)",
                        gap: "6px",
                      }}
                    >
                      {[1, 2, 3, 5, 10].map((qty) => (
                        <button
                          key={qty}
                          type="button"
                          className={`${styles.airtimeModeBtn} ${eduQuantity === qty ? styles.airtimeModeBtnActive : ""}`}
                          style={{
                            border: "1px solid rgba(0,0,0,0.08)",
                            background:
                              eduQuantity === qty ? "#660033" : "transparent",
                            color: eduQuantity === qty ? "#ffffff" : "inherit",
                            padding: "6px 2px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                          onClick={() => setEduQuantity(qty)}
                        >
                          {qty} {qty === 1 ? "PIN" : "PINs"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Candidate Phone Number Input */}
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        Candidate Phone Number
                      </label>
                      {user.phone && (
                        <button
                          type="button"
                          onClick={() => setEduCandidatePhone(user.phone || "")}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#660033",
                            fontWeight: 600,
                            fontSize: "11.5px",
                            cursor: "pointer",
                          }}
                        >
                          Use My Number
                        </button>
                      )}
                    </div>
                    <div className={styles.phoneInputBox}>
                      <span className={styles.phonePrefixTag}>+234</span>
                      <input
                        type="tel"
                        placeholder="0803 123 4567"
                        value={eduCandidatePhone}
                        onChange={(e) => setEduCandidatePhone(e.target.value)}
                        className={styles.phoneInputField}
                        required
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "10.5px",
                        color: "#64748b",
                        marginTop: "2px",
                        display: "block",
                      }}
                    >
                      SMS with e-PIN & portal instructions will be sent here.
                    </span>
                  </div>

                  {/* Candidate Email (Optional) */}
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#475569",
                        marginBottom: "4px",
                      }}
                    >
                      Candidate Email (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. candidate@gmail.com"
                      value={eduCandidateEmail}
                      onChange={(e) => setEduCandidateEmail(e.target.value)}
                      className={styles.phoneInputField}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  {/* Promo Coupon */}
                  <div style={{ marginBottom: "10px" }}>
                    {!appliedCoupon ? (
                      <div className={styles.couponRow}>
                        <input
                          type="text"
                          placeholder="Promo code (e.g. FUNDA50)"
                          value={couponInput}
                          onChange={(e) =>
                            setCouponInput(e.target.value.toUpperCase())
                          }
                          className={styles.couponInput}
                        />
                        <button
                          type="button"
                          disabled={couponBusy || !couponInput.trim()}
                          onClick={() =>
                            handleApplyCoupon("education", computedEduSubtotal)
                          }
                          className={styles.couponBtn}
                        >
                          {couponBusy ? "Checking…" : "Apply"}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.couponBadge}>
                        <span>
                          🎟️ {appliedCoupon.code} applied (-₦
                          {appliedCoupon.discountAmount.toLocaleString()})
                        </span>
                        <button
                          type="button"
                          onClick={() => setAppliedCoupon(null)}
                          className={styles.couponBadgeRemove}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#dc2626",
                          marginTop: "3px",
                        }}
                      >
                        {couponError}
                      </div>
                    )}
                  </div>

                  {/* Order Summary Card */}
                  <div className={styles.orderSummaryCard}>
                    <div className={styles.orderSummaryRow}>
                      <span>
                        {selectedEduPackage?.name || "Exam Package"} (
                        {eduQuantity}x)
                      </span>
                      <span>
                        ₦
                        {computedEduSubtotal.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className={styles.orderSummaryRow}>
                      <span>Portal Delivery Fee</span>
                      <span>₦0.00 (Instant)</span>
                    </div>
                    {appliedCoupon && (
                      <div
                        className={styles.orderSummaryRow}
                        style={{ color: "#059669", fontWeight: 600 }}
                      >
                        <span>Discount ({appliedCoupon.code})</span>
                        <span>
                          -₦{appliedCoupon.discountAmount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className={styles.orderSummaryTotal}>
                      <span>Total Payable</span>
                      <span>
                        ₦
                        {computedEduTotal.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {showQuickServiceModal.id === "airtime" && (
                    <div className={styles.rechargeModeControl} data-mode={airtimeMode} role="group" aria-label="Airtime purchase type">
                      {([{ value: "vtu", label: "Direct top-up" }, { value: "epin", label: "Recharge cards" }] as const).map((mode) => (
                        <button key={mode.value} type="button" aria-pressed={airtimeMode === mode.value} disabled={serviceBusy} onClick={() => { setAirtimeMode(mode.value); setServiceError(null); }}>{mode.label}</button>
                      ))}
                    </div>
                  )}

                  {/* Provider / Network Select */}
                  <div className={styles.networkSelectGrid}>
                    {NETWORK_PROVIDERS.map((net) => (
                      <button
                        key={net.id}
                        type="button"
                        data-net={net.id}
                        className={`${styles.networkSelectBtn} ${net.id === serviceNetwork ? styles.networkActive : ""}`}
                        onClick={() => {
                          setServiceNetwork(net.id);
                          setAppliedCoupon(null);
                          setCouponError(null);
                        }}
                      >
                        <span className={styles.networkInitialLogo}>
                          {net.initial}
                        </span>
                        <span>{net.name}</span>
                      </button>
                    ))}
                  </div>

                  {(showQuickServiceModal.id !== "airtime" ||
                    airtimeMode === "vtu") && (
                    <>
                      {/* Saved Beneficiaries Quick Select Deck */}
                      <div style={{ marginBottom: "6px" }}>
                        <div className={styles.beneficiaryDeck}>
                          {user.phone && (
                            <button
                              type="button"
                              className={`${styles.beneficiaryChip} ${serviceRecipient === cleanNigerianPhone(user.phone) ? styles.beneficiaryChipActive : ""}`}
                              onClick={handleUseMyNumber}
                            >
                              <span>👤 My Number</span>
                            </button>
                          )}
                          {beneficiaries
                            .filter(
                              (b) =>
                                b.serviceType === "airtime" ||
                                b.serviceType === "data",
                            )
                            .map((b) => {
                              const clean = cleanNigerianPhone(b.recipient);
                              const isSelected = serviceRecipient === clean;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  className={`${styles.beneficiaryChip} ${isSelected ? styles.beneficiaryChipActive : ""}`}
                                  onClick={() => handleSelectBeneficiary(b)}
                                >
                                  <span
                                    style={{
                                      textTransform: "uppercase",
                                      fontSize: "9px",
                                      padding: "1px 4px",
                                      borderRadius: "3px",
                                      background: "#f1f5f9",
                                    }}
                                  >
                                    {b.networkOrDisco}
                                  </span>
                                  <span>
                                    {b.label ||
                                      formatNigerianPhone(clean) ||
                                      b.recipient}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      <label className={styles.inputLabel}>
                        <div className={styles.phoneLabelRow}>
                          <span>Recipient Phone Number</span>
                        </div>
                        <div className={styles.phoneInputBox}>
                          <span className={styles.phonePrefixTag}>+234</span>
                          <input
                            type="tel"
                            placeholder="803 123 4567"
                            value={formatNigerianPhone(serviceRecipient)}
                            onChange={(e) =>
                              handlePhoneInputChange(e.target.value)
                            }
                            className={styles.phoneInputField}
                            maxLength={12}
                            required
                          />
                          {detectedNetworkItem && (
                            <span
                              className={styles.phoneDetectedMicroPill}
                              data-net={detectedNetworkItem.id}
                              aria-label={`Detected: ${detectedNetworkItem.name}`}
                            >
                              <span className={styles.phoneMiniDot} />
                              <span>{detectedNetworkItem.name}</span>
                              {phoneValidation.isValid && (
                                <span className={styles.phoneMicroCheck}>
                                  ✓
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {phoneValidation.error && (
                          <span className={styles.phoneValidationNotice}>
                            {phoneValidation.error}
                          </span>
                        )}
                      </label>
                    </>
                  )}

                  {/* Category Quick Chips without title & without emojis */}
                  {showQuickServiceModal.id === "data" && (
                    <div className={styles.amountChipsRow}>
                      <button
                        type="button"
                        className={`${styles.amountChip} ${styles.topPickChip} ${serviceCategory === "top" ? styles.topPickActive : ""}`}
                        onClick={() => setServiceCategory("top")}
                      >
                        Top Picks
                      </button>
                      <button
                        type="button"
                        className={`${styles.amountChip} ${serviceCategory === "daily" ? styles.amountChipActive : ""}`}
                        onClick={() => setServiceCategory("daily")}
                      >
                        Daily
                      </button>
                      <button
                        type="button"
                        className={`${styles.amountChip} ${serviceCategory === "weekly" ? styles.amountChipActive : ""}`}
                        onClick={() => setServiceCategory("weekly")}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        className={`${styles.amountChip} ${serviceCategory === "monthly" ? styles.amountChipActive : ""}`}
                        onClick={() => setServiceCategory("monthly")}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        className={`${styles.amountChip} ${serviceCategory === "all" ? styles.amountChipActive : ""}`}
                        onClick={() => setServiceCategory("all")}
                      >
                        All
                      </button>
                    </div>
                  )}

                  {/* Data Bundle Rows (Transaction-Style Design with Squircle Icon, Badges, Fixed Height) */}
                  {showQuickServiceModal.id === "data" ? (
                    <>
                    <div className={styles.bundleRowListContainer}>
                      {filteredLiveProducts.length > 0 ? (
                        filteredLiveProducts.map((product) => {
                          const {
                            qtyNum,
                            qtyUnit,
                            validity,
                            isHot,
                            isCheap,
                            isValue,
                          } = parseBundleDisplay(product);
                          const isSelected = product.id === servicePackage;
                          const healthStatus = product.health?.status;
                          const isOutage = healthStatus === "outage";
                          return (
                            <button
                              key={product.id}
                              type="button"
                              disabled={isOutage}
                              style={isOutage ? { opacity: 0.56, cursor: "not-allowed" } : undefined}
                              className={`${styles.bundleRowItem} ${isSelected ? styles.bundleRowSelected : ""} ${isHot ? styles.bundleRowHot : ""}`}
                              onClick={() => {
                                if (isOutage) return;
                                if (product.id !== servicePackage) {
                                  setServicePackage(product.id);
                                  setAppliedCoupon(null);
                                  setCouponError(null);
                                }
                              }}
                            >
                              <div
                                className={styles.bundleRowIconWrapper}
                                data-net={serviceNetwork}
                              >
                                <span className={styles.bundleIconNum}>
                                  {qtyNum}
                                </span>
                                <span className={styles.bundleIconUnit}>
                                  {qtyUnit}
                                </span>
                              </div>

                              <div className={styles.bundleRowInfoCol}>
                                <div className={styles.bundleRowTitleRow}>
                                  <span className={styles.bundleRowTitle}>
                                    {product.name}
                                  </span>
                                  {product.health?.badge ? (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "2px 7px",
                                        borderRadius: "6px",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        background:
                                          healthStatus === "outage"
                                            ? "rgba(225, 29, 72, 0.1)"
                                            : healthStatus === "degraded"
                                              ? "rgba(217, 119, 6, 0.12)"
                                              : "rgba(14, 165, 233, 0.12)",
                                        color:
                                          healthStatus === "outage"
                                            ? "#be123c"
                                            : healthStatus === "degraded"
                                              ? "#b45309"
                                              : "#0369a1",
                                      }}
                                    >
                                      {product.health.badge}
                                    </span>
                                  ) : null}
                                  {isHot && (
                                    <span className={styles.bundleBadgeHot}>
                                      HOT
                                    </span>
                                  )}
                                  {isCheap && (
                                    <span className={styles.bundleBadgeCheap}>
                                      CHEAP
                                    </span>
                                  )}
                                  {isValue && (
                                    <span className={styles.bundleBadgeValue}>
                                      BEST VALUE
                                    </span>
                                  )}
                                  {product.cashback > 0 && (
                                    <span className={styles.bundleCashbackTag}>
                                      +₦{product.cashback} cashback
                                    </span>
                                  )}
                                </div>
                                <div className={styles.bundleRowSubRow}>
                                  <span>{validity}</span>
                                  <span className={styles.bundleDotSep}>•</span>
                                  <span>
                                    {isOutage
                                      ? "Temporarily unavailable"
                                      : healthStatus === "degraded"
                                        ? "Route unstable"
                                        : "Instant 4G/5G delivery"}
                                  </span>
                                </div>
                              </div>

                              <div className={styles.bundleRowPriceCol}>
                                <span className={styles.bundleRowPrice}>
                                  ₦{product.price.toLocaleString("en-NG")}
                                </span>
                                {product.basePrice &&
                                product.basePrice > product.price ? (
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      color: "#94a3b8",
                                      textDecoration: "line-through",
                                    }}
                                  >
                                    ₦{product.basePrice.toLocaleString("en-NG")}
                                  </span>
                                ) : null}
                                <span
                                  className={`${styles.bundleRowStatusPill} ${isSelected ? styles.bundleRowStatusActive : ""}`}
                                >
                                  {isOutage ? "Offline" : isSelected ? "Selected" : "Select"}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className={styles.bundleEmptyStateBox}>
                          <span>No bundles available for this category</span>
                        </div>
                      )}
                    </div>

                    {selectedLiveProduct?.health?.notice ? (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "8px 11px",
                          borderRadius: "9px",
                          fontSize: "11.5px",
                          fontWeight: 550,
                          lineHeight: 1.35,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background:
                            selectedLiveProduct.health.status === "outage"
                              ? "rgba(225, 29, 72, 0.08)"
                              : selectedLiveProduct.health.status === "degraded"
                                ? "rgba(217, 119, 6, 0.1)"
                                : "rgba(14, 165, 233, 0.09)",
                          color:
                            selectedLiveProduct.health.status === "outage"
                              ? "#be123c"
                              : selectedLiveProduct.health.status === "degraded"
                                ? "#b45309"
                                : "#0369a1",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "999px",
                            flexShrink: 0,
                            background: "currentColor",
                          }}
                        />
                        <span>{selectedLiveProduct.health.notice}</span>
                      </div>
                    ) : null}

                    {selectedLiveProduct && (
                      <div style={{ marginTop: "10px" }}>
                        {!appliedCoupon ? (
                          <div className={styles.couponRow}>
                            <input
                              type="text"
                              placeholder="Promo code"
                              value={couponInput}
                              onChange={(e) =>
                                setCouponInput(e.target.value.toUpperCase())
                              }
                              className={styles.couponInput}
                            />
                            <button
                              type="button"
                              disabled={couponBusy || !couponInput.trim()}
                              onClick={() =>
                                handleApplyCoupon(
                                  "data",
                                  selectedLiveProduct.price,
                                )
                              }
                              className={styles.couponBtn}
                            >
                              {couponBusy ? "Checking…" : "Apply"}
                            </button>
                          </div>
                        ) : (
                          <div className={styles.couponBadge}>
                            <span>
                              {appliedCoupon.code} (-₦
                              {appliedCoupon.discountAmount.toLocaleString("en-NG")})
                            </span>
                            <button
                              type="button"
                              onClick={() => setAppliedCoupon(null)}
                              className={styles.couponBadgeRemove}
                              aria-label="Remove coupon"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {couponError && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#dc2626",
                              marginTop: "4px",
                            }}
                          >
                            {couponError}
                          </div>
                        )}

                        {(appliedCoupon || selectedLiveProduct.cashback > 0) && (
                          <div className={styles.orderSummaryCard}>
                            <div className={styles.orderSummaryRow}>
                              <span>Bundle</span>
                              <span>
                                ₦
                                {selectedLiveProduct.price.toLocaleString(
                                  "en-NG",
                                )}
                              </span>
                            </div>
                            {appliedCoupon && (
                              <div
                                className={styles.orderSummaryRow}
                                style={{ color: "#15803d" }}
                              >
                                <span>Discount ({appliedCoupon.code})</span>
                                <span>
                                  -₦
                                  {appliedCoupon.discountAmount.toLocaleString(
                                    "en-NG",
                                  )}
                                </span>
                              </div>
                            )}
                            {selectedLiveProduct.cashback > 0 && (
                              <div
                                className={styles.orderSummaryRow}
                                style={{ color: "#0f766e" }}
                              >
                                <span>Wallet Cashback</span>
                                <span>
                                  +₦
                                  {selectedLiveProduct.cashback.toLocaleString(
                                    "en-NG",
                                  )}
                                </span>
                              </div>
                            )}
                            <div className={styles.orderSummaryTotal}>
                              <span>Total</span>
                              <span>
                                ₦{computedDataTotal.toLocaleString("en-NG")}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    </>
                  ) : showQuickServiceModal.id === "airtime" &&
                    airtimeMode === "vtu" ? (
                    <>
                      <div className={styles.inputLabel}>
                        <span>Recharge Amount (₦50 – ₦50,000)</span>
                        <div
                          className={styles.phoneInputBox}
                          style={{ marginBottom: "8px" }}
                        >
                          <span className={styles.phonePrefixTag}>₦</span>
                          <input
                            type="number"
                            min={50}
                            max={50000}
                            step={50}
                            placeholder="500"
                            value={airtimeAmount}
                            onChange={(e) => {
                              setAirtimeAmount(e.target.value);
                              setServiceError(null);
                            }}
                            className={styles.phoneInputField}
                            required
                          />
                        </div>

                        <div className={styles.airtimeQuickGrid}>
                          {[100, 200, 500, 1000, 2000, 5000].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`${styles.airtimeQuickBtn} ${Number(airtimeAmount) === preset ? styles.airtimeQuickBtnActive : ""}`}
                              onClick={() => {
                                setAirtimeAmount(String(preset));
                                setServiceError(null);
                              }}
                            >
                              ₦{preset.toLocaleString("en-NG")}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : showQuickServiceModal.id === "airtime" &&
                    airtimeMode === "epin" ? (
                    <>
                      <div className={styles.inputLabel}>
                        <span>Card Denomination</span>
                        <div className={styles.epinDenomGrid}>
                          {RECHARGE_DENOMINATIONS.map((denom) => (
                            <button
                              key={denom}
                              type="button"
                              className={`${styles.epinDenomCard} ${epinDenomination === denom ? styles.epinDenomCardActive : ""}`}
                              disabled={serviceBusy || !rechargeOffers?.some((offer) => offer.network === serviceNetwork && offer.denomination === denom)}
                              onClick={() => {
                                setEpinDenomination(denom);
                                setServiceError(null);
                              }}
                            >
                              <strong>₦{denom.toLocaleString("en-NG")}</strong>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.inputLabel}>
                        <span>Quantity</span>
                        <FundaSelect ariaLabel="Recharge-card quantity" value={String(epinQuantity)} disabled={serviceBusy} onChange={(value) => { setEpinQuantity(Number(value)); setServiceError(null); }} options={Array.from({ length: rechargeOrderLimit }, (_, index) => ({ value: String(index + 1), label: `${index + 1} ${index === 0 ? "card" : "cards"}` }))} />
                      </div>

                      <label className={styles.inputLabel}>
                        <span>Name on Recharge Card (Optional)</span>
                        <div className={styles.phoneInputBox}>
                          <input
                            type="text"
                            maxLength={20}
                            placeholder="Funda"
                            value={epinCardName}
                            onChange={(e) => setEpinCardName(e.target.value)}
                            className={styles.phoneInputField}
                          />
                        </div>
                      </label>

                      <RechargePriceSummary quote={rechargeCheckout.quote} busy={rechargeCheckout.busy} error={rechargeCheckout.error} onRetry={rechargeCheckout.refresh} />
                    </>
                  ) : (
                    <div className={styles.inputLabel}>
                      <span>Package</span>
                      <FundaSelect
                        ariaLabel="Package"
                        value={servicePackage}
                        onChange={setServicePackage}
                        disabled={serviceBusy}
                        options={filteredLiveProducts.map((product) => ({
                          value: product.id,
                          label: product.name,
                          meta: `₦${product.price.toLocaleString("en-NG")}`,
                        }))}
                      />
                    </div>
                  )}
                </>
              )}

              {serviceError && (
                <div className={styles.paymentError} role="alert">
                  {serviceError}
                </div>
              )}

              {/* Insufficient Funds Warning & Shortcut to Fund Wallet */}
              {activePayableAmount > 0 &&
                walletBalance < activePayableAmount && (
                  <div className={styles.insufficientBalanceNotice}>
                    <div className={styles.insufficientLeft}>
                      <span className={styles.insufficientDot} />
                      <span>
                        Insufficient balance:{" "}
                        <strong>
                          ₦{walletBalance.toLocaleString("en-NG")}
                        </strong>{" "}
                        (Need{" "}
                        <strong>
                          ₦
                          {(activePayableAmount - walletBalance).toLocaleString(
                            "en-NG",
                          )}
                        </strong>{" "}
                        more)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const needed = Math.max(
                          100,
                          Math.ceil(
                            (activePayableAmount - walletBalance) / 100,
                          ) * 100,
                        );
                        setShowQuickServiceModal(null);
                        setFundAmount(String(needed));
                        setShowFundModal(true);
                      }}
                      className={styles.fundWalletInlineLink}
                    >
                      Fund Wallet →
                    </button>
                  </div>
                )}

              <button
                type={
                  activePayableAmount > 0 && walletBalance < activePayableAmount
                    ? "button"
                    : "submit"
                }
                onClick={
                  activePayableAmount > 0 && walletBalance < activePayableAmount
                    ? () => {
                        const needed = Math.max(
                          100,
                          Math.ceil(
                            (activePayableAmount - walletBalance) / 100,
                          ) * 100,
                        );
                        setShowQuickServiceModal(null);
                        setFundAmount(String(needed));
                        setShowFundModal(true);
                      }
                    : undefined
                }
                className={`${styles.submitPrimaryBtn} ${activePayableAmount > 0 && walletBalance < activePayableAmount ? styles.submitFundWalletBtn : ""}`}
                disabled={
                  serviceBusy ||
                  (showQuickServiceModal.id === "airtime" && airtimeMode === "epin" && !rechargeCheckout.quote) ||
                  (showQuickServiceModal.id === "data" && !servicePackage) ||
                  (showQuickServiceModal.id === "airtime" &&
                    activePayableAmount < 50) ||
                  (showQuickServiceModal.id === "electricity" &&
                    (activePayableAmount < 500 ||
                      electricityMeterNumber.trim().length < 6)) ||
                  (showQuickServiceModal.id === "tv" &&
                    (!tvPackageCode || tvSmartcard.trim().length < 5)) ||
                  (showQuickServiceModal.id === "education" &&
                    (!eduPackageCode ||
                      activePayableAmount <= 0 ||
                      (selectedEduConfig?.requiresProfileCode &&
                        eduProfileCode.trim().length !== 10)))
                }
              >
                {serviceBusy ? (
                  <>
                    <SpinnerIcon size={18} />
                    <span>Processing with Provider…</span>
                  </>
                ) : activePayableAmount > 0 &&
                  walletBalance < activePayableAmount ? (
                  "Fund Your Wallet to Continue"
                ) : showQuickServiceModal.id === "electricity" ? (
                  `Pay ₦${activePayableAmount.toLocaleString("en-NG")} • Generate Token`
                ) : showQuickServiceModal.id === "tv" ? (
                  `Subscribe • ₦${activePayableAmount.toLocaleString("en-NG")}`
                ) : showQuickServiceModal.id === "education" ? (
                  `Generate ${eduQuantity > 1 ? `${eduQuantity} Exam PINs` : "Exam PIN"} • ₦${activePayableAmount.toLocaleString("en-NG")}`
                ) : showQuickServiceModal.id === "airtime" &&
                  airtimeMode === "epin" ? (
                  `Generate ${epinQuantity > 1 ? `${epinQuantity} Recharge PINs` : "Recharge PIN"} • ₦${activePayableAmount.toLocaleString("en-NG")}`
                ) : activePayableAmount > 0 ? (
                  `Pay ₦${activePayableAmount.toLocaleString("en-NG")} from Wallet • Instant Fulfilment`
                ) : (
                  "Pay from Wallet • Instant Fulfilment"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: TRANSACTION RECEIPT SHEET                                        */}
      {/* ========================================================================= */}
      {selectedTx && (
        <div
          className={styles.modalOverlay}
          data-recharge-modal={selectedTx.mode === "epin" || undefined}
          onClick={() => setSelectedTx(null)}
        >
          <div
            className={styles.iosReceiptSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <button
              type="button"
              className={`${styles.sheetCloseBtn} ${styles.receiptCloseBtn}`}
              onClick={() => setSelectedTx(null)}
              aria-label="Close receipt"
            >
              <SvgIcon name="close" size={16} />
            </button>
            <div className={styles.receiptTopHeader}>
              <div
                className={
                  selectedTx.status === "failed"
                    ? styles.receiptFailedIcon
                    : selectedTx.status === "processing"
                      ? styles.receiptProcessingIcon
                      : styles.receiptCheckIcon
                }
              >
                <SvgIcon
                  name={
                    selectedTx.status === "failed"
                      ? "close"
                      : selectedTx.status === "processing"
                        ? "clock"
                        : "check"
                  }
                  size={24}
                />
              </div>
              <strong
                className={styles.receiptAmount}
                data-flow={selectedTx.type === "credit" ? "in" : "out"}
                data-status={selectedTx.status}
              >
                {selectedTx.type === "credit" ? "+" : "-"}₦
                {selectedTx.amount.toLocaleString()}
              </strong>
              <span
                className={`${styles.receiptStatusTag} ${
                  selectedTx.status === "failed"
                    ? styles.receiptStatusTagFailed
                    : selectedTx.status === "processing"
                      ? styles.receiptStatusTagProcessing
                      : ""
                }`}
              >
                {selectedReceipt?.statusLabel}
              </span>
              <p className={styles.receiptTitle}>{selectedTx.title}</p>
            </div>

            {/* Recharge Card & Exam e-PIN Vault if applicable */}
            {selectedTx.mode === "epin" && (
              <div className={styles.receiptDetailsList}>
                <div className={styles.receiptRow} role="status"><span>Card delivery</span><strong>{rechargeDeliveryLabel(selectedTx.deliveryStatus ?? "awaiting_provider")}</strong></div>
                {rechargeReceiptError ? <div className={styles.paymentError} role="alert">{rechargeReceiptError}</div> : selectedTx.deliveryStatus === "ready" && !selectedTx.pins?.length ? <div role="status">Opening PIN vault…</div> : null}
              </div>
            )}
            {selectedTx.pins && selectedTx.pins.length > 0 && (
              <div className={styles.epinVaultList}>
                {selectedTx.pins.map((pinItem, idx) => {
                  const formattedPin = pinItem.pin
                    .replace(/\s+/g, "")
                    .replace(/(.{4})/g, "$1 ")
                    .trim();
                  const copyKey = `epin-${idx}`;
                  const isEdu = selectedTx.category === "education";
                  return (
                    <div key={copyKey} className={styles.epinVaultCard}>
                      <div className={styles.epinVaultTop}>
                        <span>
                          {isEdu
                            ? `${(pinItem.examBody || "EXAM").toUpperCase()} ${pinItem.serviceName || "PIN"} ${selectedTx.pins!.length > 1 ? `#${idx + 1}` : ""}`
                            : `${(pinItem.network || "AIRTIME").toUpperCase()} ₦${pinItem.amount?.toLocaleString("en-NG") || ""} PIN ${selectedTx.pins!.length > 1 ? `#${idx + 1}` : ""}`}
                        </span>
                        {pinItem.serial && <span>S/N: {pinItem.serial}</span>}
                      </div>
                      <div className={styles.epinVaultPin}>{formattedPin}</div>
                      <div className={styles.epinVaultActions}>
                        <button
                          type="button"
                          className={styles.epinActionBtn}
                          onClick={() => copyToClipboard(pinItem.pin, copyKey)}
                        >
                          <SvgIcon
                            name={copiedField === copyKey ? "check" : "copy"}
                            size={13}
                          />
                          <span>
                            {copiedField === copyKey
                              ? "Copied PIN"
                              : "Copy PIN"}
                          </span>
                        </button>
                        {isEdu ? (
                          pinItem.instructions ? (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                alignSelf: "center",
                                textAlign: "right",
                                gridColumn: "span 1",
                              }}
                            >
                              {pinItem.instructions}
                            </span>
                          ) : null
                        ) : (
                          <a
                            href={`tel:${encodeURIComponent(pinItem.dialCode || `*311*${pinItem.pin}#`)}`}
                            className={styles.epinDialBtn}
                          >
                            <span>
                              Dial {pinItem.dialCode || `*311*${pinItem.pin}#`}
                            </span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Electricity & Education Token Callout if applicable */}
            {selectedTx.token && (
              <div className={styles.tokenHighlightBox}>
                <span className={styles.tokenLabel}>
                  {selectedTx.category === "education"
                    ? "EXAM TOKEN / PIN"
                    : "TOKEN CODE"}
                </span>
                <strong className={styles.tokenCode}>{selectedTx.token}</strong>
                <button
                  type="button"
                  className={styles.copyTokenBtn}
                  onClick={() => copyToClipboard(selectedTx.token!, "tx-token")}
                >
                  <SvgIcon
                    name={copiedField === "tx-token" ? "check" : "copy"}
                    size={14}
                  />
                  <span>
                    {copiedField === "tx-token"
                      ? "Copied Token!"
                      : "Copy Token"}
                  </span>
                </button>
              </div>
            )}

            {selectedReceipt?.sections.map((section) => (
              <div key={section.title} className={styles.receiptDetailsList}>
                <span className={styles.receiptSectionTitle}>
                  {section.title}
                </span>
                {section.fields.map((field) => {
                  const copyKey = `receipt-${field.label}`;
                  return (
                    <div key={field.label} className={styles.receiptRow}>
                      <span>{field.label}</span>
                      {field.copyable ? (
                        <button
                          type="button"
                          className={styles.receiptCopyValue}
                          onClick={() => copyToClipboard(field.value, copyKey)}
                        >
                          <strong>{field.value}</strong>
                          <SvgIcon
                            name={copiedField === copyKey ? "check" : "copy"}
                            size={13}
                          />
                        </button>
                      ) : (
                        <strong
                          className={
                            field.tone === "reward"
                              ? styles.receiptRewardHighlight
                              : undefined
                          }
                        >
                          {field.value}
                        </strong>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className={styles.receiptActionsRow}>
              {selectedTx.mode === "epin" ? <button type="button" className={styles.receiptSecondaryBtn} onClick={() => { window.dispatchEvent(new CustomEvent("funda:recharge-support", { detail: { reference: selectedTx.reference } })); setSelectedTx(null); }}><SvgIcon name="ticket" size={16} />Get help</button> : null}
              {selectedTx.mode === "epin" && selectedTx.status === "completed" && Boolean(selectedTx.pins?.length) ? (
                <button type="button" className={styles.receiptSecondaryBtn} onClick={() => {
                  const html = rechargeCardPrintHtml((selectedTx.pins ?? []).map((pin) => ({ ...pin, amount: pin.amount ?? selectedTx.unitAmount ?? 0 })), selectedTx.cardName ?? "Funda", selectedTx.reference);
                  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
                  const link = document.createElement("a"); link.href = url; link.download = `funda-cards-${selectedTx.reference}.html`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}><SvgIcon name="download" size={16} />Download cards</button>
              ) : null}
              {(selectedTx.status === "processing" || (selectedTx.mode === "epin" && (rechargeReceiptError || selectedTx.deliveryStatus !== "ready"))) && (
                <button
                  type="button"
                  className={styles.receiptSecondaryBtn}
                  onClick={() => void handleRefreshTxStatus(selectedTx)}
                  disabled={receiptBusy !== null || refreshingTxId === selectedTx.id}
                >
                  <SvgIcon name="refresh" size={16} />
                  {refreshingTxId === selectedTx.id ? "Checking…" : "Check Status"}
                </button>
              )}
              <button
                type="button"
                className={styles.receiptSecondaryBtn}
                onClick={downloadReceipt}
                disabled={receiptBusy !== null}
              >
                <SvgIcon name="download" size={16} />
                {receiptBusy === "download" ? "Preparing…" : "Download"}
              </button>
              <button
                type="button"
                className={styles.receiptSecondaryBtn}
                onClick={shareReceipt}
                disabled={receiptBusy !== null}
              >
                <SvgIcon name="share" size={16} />
                {receiptBusy === "share" ? "Preparing…" : "Share"}
              </button>
              <button
                type="button"
                className={`${styles.submitPrimaryBtn} ${styles.receiptDoneBtn}`}
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
        <div
          className={styles.modalOverlay}
          onClick={() => setShowNotificationDrawer(false)}
        >
          <div
            className={`${styles.iosBottomSheet} ${styles.txHistorySheet}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeaderRow}>
              <div>
                <h3 className={styles.sheetTitle}>Notifications</h3>
                <p className={styles.sheetSub}>
                  {unreadAtOpen.size > 0
                    ? `${unreadAtOpen.size} unread`
                    : "You're all caught up"}
                </p>
              </div>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowNotificationDrawer(false)}
                aria-label="Close"
              >
                <SvgIcon name="close" size={16} />
              </button>
            </div>

            <div
              className={`${styles.txListContainer} ${styles.txHistoryList}`}
            >
              {notifications.length > 0 ? (
                (() => {
                  const now = new Date();
                  const groups: {
                    label: string;
                    items: typeof notifications;
                  }[] = [];
                  for (const notif of notifications) {
                    const label = notificationDayLabel(notif.created_at, now);
                    const last = groups[groups.length - 1];
                    if (last && last.label === label) last.items.push(notif);
                    else groups.push({ label, items: [notif] });
                  }
                  return groups.map((group) => (
                    <section key={group.label} className={styles.notifGroup}>
                      <h4 className={styles.notifDayLabel}>{group.label}</h4>
                      {group.items.map((notif) => {
                        const { icon, tone } = describeNotification(notif);
                        const timeStr = new Date(
                          notif.created_at,
                        ).toLocaleTimeString("en-NG", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });
                        return (
                          <div
                            key={notif.id}
                            className={styles.notifRow}
                            data-tone={tone}
                            data-unread={
                              unreadAtOpen.has(notif.id) || undefined
                            }
                          >
                            <span className={styles.notifRowIcon}>
                              <SvgIcon name={icon} size={18} />
                            </span>
                            <div className={styles.notifRowBody}>
                              <div className={styles.notifRowTop}>
                                <strong>{notif.title}</strong>
                                <time dateTime={notif.created_at}>
                                  {timeStr}
                                </time>
                              </div>
                              <p>{notif.body}</p>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  ));
                })()
              ) : (
                <div className={styles.emptyStateBox}>
                  <span className={styles.emptyIcon}>
                    <SvgIcon name="bell" size={24} />
                  </span>
                  <strong>No notifications yet</strong>
                  <p>Purchases, top-ups and refunds will show up here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: ACCOUNT & PREFERENCES                                             */}
      {/* ========================================================================= */}
      {showAccountDrawer && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowAccountDrawer(false)}
        >
          <ProfileCenter
            user={user}
            settings={settings}
            onClose={() => setShowAccountDrawer(false)}
          />
        </div>
      )}
    </div>
  );
}
