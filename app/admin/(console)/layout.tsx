import type { ReactNode } from "react";
import { requireAdmin } from "../../../lib/admin/auth";
import AdminShell from "./admin-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { default: "Control centre · Funda Admin", template: "%s · Funda Admin" },
  description: "Funda's secure operational control centre.",
  robots: { index: false, follow: false },
};

export default async function AdminConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
