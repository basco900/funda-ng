import type { SVGProps } from "react";

type AdminIconProps = SVGProps<SVGSVGElement> & { name: string };

const paths: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  pulse: <><path d="M3 12h4l2.2-6 4.1 12 2.1-6H21"/><path d="M4 4h16v16H4z" opacity="0"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 13h2"/></>,
  segments: <><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="m8.5 8 2 7M15.5 8l-2 7"/></>,
  referral: <><path d="M8 12h8M13 7l5 5-5 5"/><path d="M5 5v14"/></>,
  transactions: <><path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="m18 7-3 3M6 17l3-3"/></>,
  funding: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h10M12 7v6M9.5 10.5h5"/></>,
  refund: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v10M9 10h5.5a2 2 0 0 1 0 4H9"/></>,
  reconcile: <><path d="M20 7h-9M20 17h-9M4 7l2 2 3-4M4 17l2 2 3-4"/></>,
  ledger: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="3"/><path d="M10 5h4M11 18h2"/></>,
  bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>,
  tv: <><rect x="3" y="6" width="18" height="13" rx="3"/><path d="m8 2 4 4 4-4M8 22h8"/></>,
  catalogue: <><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 14v6M14 17h6"/></>,
  provider: <><path d="M4 18V8l8-5 8 5v10"/><path d="M2 21h20M8 21v-7h8v7"/></>,
  pricing: <><path d="M20.6 13.1 11 22.7 1.3 13V3.4h9.7Z"/><circle cx="7" cy="9" r="1.5"/></>,
  spark: <><path d="m12 3-1.5 5.5L5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5Z"/><path d="m5 17-.6 2.4L2 20l2.4.6L5 23l.6-2.4L8 20l-2.4-.6Z"/></>,
  percent: <><path d="m19 5-14 14"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></>,
  alert: <><path d="M10.3 3.6 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  dispute: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></>,
  support: <><circle cx="12" cy="12" r="9"/><path d="M8 15v-3a4 4 0 0 1 8 0v3M8 15H6v-4h2M16 15h2v-4h-2M16 15c0 2-1 3-3 3"/></>,
  incident: <><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/><circle cx="12" cy="12" r="3"/></>,
  campaign: <><path d="m3 11 18-5v12L3 13Z"/><path d="M7 14v6h4v-7"/></>,
  coupon: <><path d="M2 9a3 3 0 0 0 0 6v4h20v-4a3 3 0 0 0 0-6V5H2Z"/><path d="M13 5v14"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  megaphone: <><path d="m3 11 18-5v12L3 13Z"/><path d="M7 14v6h4v-7M18 7v10"/></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M7.5 8C5 8 4 6.8 4 5.5S5 3 6.5 3C9 3 12 8 12 8s3-5 5.5-5C19 3 20 4.2 20 5.5S19 8 16.5 8"/></>,
  risk: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v4M12 16h.01"/></>,
  limits: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="M3 8h18"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  blocked: <><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></>,
  device: <><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 5h6M11 18h2"/></>,
  report: <><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h8"/></>,
  analytics: <><path d="M3 3v18h18M7 16l4-5 3 3 5-8"/></>,
  flag: <><path d="M5 22V4M5 5h11l-1 4 1 4H5"/></>,
  sliders: <><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></>,
  plug: <><path d="m12 22 1-7M9 8l6 1M8 3l-1 5 10 2 1-5ZM7 13l10 2"/></>,
  webhook: <><circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 0 1 8 5M4 17a9 9 0 0 1 0-10M20 16a9 9 0 0 1-8 5"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></>,
  health: <><path d="M3 12h4l2-5 4 10 2-5h6"/><circle cx="12" cy="12" r="10" opacity="0"/></>,
  admin: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M18 3v4M16 5h4"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M15 7l2 2M18 4l2 2"/></>,
  audit: <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/><path d="m15 16 1 1 2-3"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  tools: <><path d="m14 7 3-3 3 3-3 3M4 20l8-8M5 5l14 14"/></>,
};

export default function AdminIcon({ name, ...props }: AdminIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name] ?? paths.grid}
    </svg>
  );
}
