export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
  description: string;
  badge?: string;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const adminNavigation: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Control centre", href: "/admin/dashboard", icon: "grid", description: "Live platform overview" },
      { label: "Live operations", href: "/admin/operations/live", icon: "pulse", description: "Real-time transaction flow", badge: "Live" },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Users", href: "/admin/users", icon: "users", description: "Customer directory" },
      { label: "KYC & verification", href: "/admin/customers/kyc", icon: "shield", description: "Identity review queue" },
      { label: "Wallets", href: "/admin/customers/wallets", icon: "wallet", description: "Balances and controls" },
      { label: "Segments", href: "/admin/customers/segments", icon: "segments", description: "Dynamic audiences" },
      { label: "Referrals", href: "/admin/customers/referrals", icon: "referral", description: "Referral performance" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Transactions", href: "/admin/transactions", icon: "transactions", description: "Every money movement" },
      { label: "Wallet funding", href: "/admin/money/funding", icon: "funding", description: "Deposit activity" },
      { label: "Refunds", href: "/admin/money/refunds", icon: "refund", description: "Refund requests" },
      { label: "Reconciliation", href: "/admin/money/reconciliation", icon: "reconcile", description: "Match internal and provider records" },
      { label: "Ledger", href: "/admin/money/ledger", icon: "ledger", description: "Immutable financial trail" },
      { label: "Revenue", href: "/admin/money/revenue", icon: "chart", description: "Margins and earnings" },
    ],
  },
  {
    label: "Services",
    items: [
      { label: "Networks", href: "/admin/services/networks", icon: "segments", description: "Availability and maintenance controls" },
      { label: "Data bundles", href: "/admin/services/data", icon: "wifi", description: "Plans, pricing and availability" },
      { label: "Airtime", href: "/admin/services/airtime", icon: "phone", description: "Networks and denominations" },
      { label: "Electricity", href: "/admin/services/electricity", icon: "bolt", description: "DisCos and meter products" },
      { label: "Cable TV", href: "/admin/services/cable", icon: "tv", description: "Bouquets and providers" },
      { label: "Other services", href: "/admin/services/other", icon: "more", description: "Betting, education and more" },
    ],
  },
  {
    label: "Products",
    items: [
      { label: "Catalogue", href: "/admin/products", icon: "catalogue", description: "All sellable products" },
      { label: "Providers", href: "/admin/products/providers", icon: "provider", description: "Routing and balances" },
      { label: "Pricing", href: "/admin/products/pricing", icon: "pricing", description: "Costs, margins and retail prices" },
      { label: "Cashback", href: "/admin/products/cashback", icon: "spark", description: "Reward rules and budgets" },
      { label: "Commissions", href: "/admin/products/commissions", icon: "percent", description: "Provider commissions" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Failed", href: "/admin/operations/failed", icon: "alert", description: "Failed transaction queue" },
      { label: "Pending", href: "/admin/operations/pending", icon: "clock", description: "Ageing transaction queue" },
      { label: "Disputes", href: "/admin/operations/disputes", icon: "dispute", description: "Customer claims" },
      { label: "Support", href: "/admin/operations/support", icon: "support", description: "Tickets and assignments" },
      { label: "Incidents", href: "/admin/operations/incidents", icon: "incident", description: "Provider disruptions" },
      { label: "Manual operations", href: "/admin/operations/manual", icon: "tools", description: "Controlled interventions" },
    ],
  },
  {
    label: "Growth",
    items: [
      { label: "Campaigns", href: "/admin/growth/campaigns", icon: "campaign", description: "Promotional campaigns" },
      { label: "Coupons", href: "/admin/growth/coupons", icon: "coupon", description: "Codes and redemptions" },
      { label: "Notifications", href: "/admin/growth/notifications", icon: "bell", description: "Push, email and SMS" },
      { label: "Announcements", href: "/admin/growth/announcements", icon: "megaphone", description: "In-app notices" },
      { label: "Rewards", href: "/admin/growth/rewards", icon: "gift", description: "Reward programmes" },
    ],
  },
  {
    label: "Risk & compliance",
    items: [
      { label: "Risk monitor", href: "/admin/risk", icon: "risk", description: "Signals and risk cases" },
      { label: "Limits", href: "/admin/risk/limits", icon: "limits", description: "Tier and transaction limits" },
      { label: "Suspicious activity", href: "/admin/risk/activity", icon: "eye", description: "Behavioural signals" },
      { label: "Blocked accounts", href: "/admin/risk/blocked", icon: "blocked", description: "Restricted customers" },
      { label: "Device & IP", href: "/admin/risk/devices", icon: "device", description: "Device intelligence" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Reports", href: "/admin/analytics/reports", icon: "report", description: "Exportable reports" },
      { label: "Transactions", href: "/admin/analytics/transactions", icon: "chart", description: "Volume and conversion" },
      { label: "Customers", href: "/admin/analytics/customers", icon: "users", description: "Retention and cohorts" },
      { label: "Services", href: "/admin/analytics/services", icon: "analytics", description: "Product performance" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Feature flags", href: "/admin/platform/features", icon: "flag", description: "Controlled rollouts" },
      { label: "App configuration", href: "/admin/platform/config", icon: "sliders", description: "Runtime controls" },
      { label: "Integrations", href: "/admin/platform/integrations", icon: "plug", description: "Connected services" },
      { label: "Webhooks", href: "/admin/platform/webhooks", icon: "webhook", description: "Delivery and retries" },
      { label: "API logs", href: "/admin/platform/logs", icon: "terminal", description: "Redacted request logs" },
      { label: "System health", href: "/admin/platform/health", icon: "health", description: "Infrastructure status" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Admin users", href: "/admin/settings/admins", icon: "admin", description: "Team access" },
      { label: "Roles & permissions", href: "/admin/settings/roles", icon: "key", description: "Access policies" },
      { label: "Audit log", href: "/admin/settings/audit", icon: "audit", description: "Immutable activity record" },
      { label: "Security", href: "/admin/settings/security", icon: "lock", description: "Sessions and 2FA" },
      { label: "Settings", href: "/admin/settings", icon: "settings", description: "Admin preferences" },
    ],
  },
];

export const adminNavItems = adminNavigation.flatMap((group) => group.items);

export function findAdminNavItem(pathname: string) {
  return adminNavItems.find((item) => item.href === pathname);
}

export function permissionForAdminPath(pathname: string) {
  if (pathname === "/admin/dashboard") return "dashboard.view";
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/customers/segments") || pathname.startsWith("/admin/customers/referrals")) return "users.view";
  if (pathname.startsWith("/admin/customers/kyc")) return "kyc.review";
  if (pathname.startsWith("/admin/customers/wallets") || pathname.startsWith("/admin/money/ledger")) return "wallet.view";
  if (pathname.startsWith("/admin/transactions") || pathname.startsWith("/admin/money/funding") || pathname.startsWith("/admin/operations/failed") || pathname.startsWith("/admin/operations/pending") || pathname.startsWith("/admin/operations/live")) return "transactions.view";
  if (pathname.startsWith("/admin/money/refunds")) return "transactions.refund";
  if (pathname.startsWith("/admin/money/reconciliation") || pathname.startsWith("/admin/money/revenue")) return "reconciliation.manage";
  if (pathname.startsWith("/admin/services/networks")) return "providers.manage";
  if (pathname.startsWith("/admin/services") || pathname === "/admin/products" || pathname.startsWith("/admin/products/providers")) return "products.view";
  if (pathname.startsWith("/admin/products/pricing") || pathname.startsWith("/admin/products/commissions")) return "pricing.edit";
  if (pathname.startsWith("/admin/products/cashback") || pathname.startsWith("/admin/growth")) return "growth.manage";
  if (pathname.startsWith("/admin/operations/disputes") || pathname.startsWith("/admin/operations/support")) return "support.manage";
  if (pathname.startsWith("/admin/operations/incidents")) return "providers.manage";
  if (pathname.startsWith("/admin/operations/manual")) return "approvals.view";
  if (pathname.startsWith("/admin/risk")) return "risk.view";
  if (pathname.startsWith("/admin/analytics")) return "reports.export";
  if (pathname.startsWith("/admin/platform")) return "platform.manage";
  if (pathname.startsWith("/admin/settings/admins") || pathname.startsWith("/admin/settings/roles")) return "admins.manage";
  if (pathname.startsWith("/admin/settings/audit")) return "audit.view";
  if (pathname.startsWith("/admin/settings")) return "settings.edit";
  return "dashboard.view";
}
