import type { VendorId } from "../types";
import { smeplug } from "./smeplug";
import { vtpass } from "./vtpass";
import { gladtidings } from "./gladtidings";
import { pairgate } from "./pairgate";

export const vendors = { vtpass, smeplug, gladtidings, pairgate } as const;

export function getVendor(id: VendorId) {
  const vendor = vendors[id];
  if (!vendor) throw new Error(`Unknown vendor: ${id}`);
  return vendor;
}
