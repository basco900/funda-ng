import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Clock01Icon,
  Copy01Icon,
  LinkSquare02Icon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  ShoppingBag01Icon,
  Tag01Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

/** The coupon finder's glyphs: Hugeicons' rounded stroke set. */
const glyphs = {
  search: Search01Icon,
  bag: ShoppingBag01Icon,
  tag: Tag01Icon,
  copy: Copy01Icon,
  check: Tick02Icon,
  external: LinkSquare02Icon,
  back: ArrowLeft01Icon,
  next: ArrowRight01Icon,
  up: ThumbsUpIcon,
  down: ThumbsDownIcon,
  refresh: RefreshIcon,
  plus: PlusSignIcon,
  clock: Clock01Icon,
} as const;

export type CouponIconName = keyof typeof glyphs;

export function CouponIcon({ name, className }: { name: CouponIconName; className?: string }) {
  return <HugeiconsIcon icon={glyphs[name]} size={24} strokeWidth={1.8} className={className} aria-hidden="true" />;
}
