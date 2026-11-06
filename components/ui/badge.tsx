import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "border-transparent bg-primary text-white shadow-xs hover:bg-primary/90",
  secondary: "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200/80",
  destructive: "border-transparent bg-rose-600 text-white shadow-xs hover:bg-rose-700",
  outline: "border-zinc-200 text-zinc-800",
  success: "border-transparent bg-emerald-50 text-emerald-700 border-emerald-200/50",
  warning: "border-transparent bg-amber-50 text-amber-700 border-amber-200/50",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

