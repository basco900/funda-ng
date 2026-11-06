import type { VendorId } from "../types";
import { smeplug } from "./smeplug";
import { vtpass } from "./vtpass";
import { pairgate } from "./pairgate";
import { absvendor } from "./absvendor";
import { maskawasub } from "./maskawasub";

export const vendors = {
  vtpass,
  smeplug,
  pairgate,
  absvendor,
  maskawasub,
} as const;

export function getVendor(id: VendorId) {
  const vendor = vendors[id];
  if (!vendor) throw new Error(`Unknown vendor: ${id}`);
  return vendor;
}
