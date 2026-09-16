import type { VendorId } from "../types";
import { smeplug } from "./smeplug";
import { vtpass } from "./vtpass";
import { gladtidings } from "./gladtidings";
import { pairgate } from "./pairgate";
import { privateSim } from "./private-sim";
import { absvendor } from "./absvendor";
import { maskawasub } from "./maskawasub";

export const vendors = {
  vtpass,
  smeplug,
  gladtidings,
  pairgate,
  private_sim: privateSim,
  absvendor,
  maskawasub,
} as const;

export function getVendor(id: VendorId) {
  const vendor = vendors[id];
  if (!vendor) throw new Error(`Unknown vendor: ${id}`);
  return vendor;
}
