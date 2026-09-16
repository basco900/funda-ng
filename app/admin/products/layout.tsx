import type { ReactNode } from "react";
import { requireAdmin } from "../../../lib/admin/auth";
import AdminShell from "../(console)/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminProductsLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
