import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type PremiumPanelProps = HTMLAttributes<HTMLDivElement> & {
  glow?: "accent" | "none" | "teal";
};

type SystemBadgeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "accent" | "muted" | "success" | "warning";
};

type CommandCapsuleProps = {
  children: ReactNode;
  href: string;
  tone?: "primary" | "secondary";
};

export function PremiumPanel({ className, glow = "none", ...props }: PremiumPanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.72)] backdrop-blur-xl",
        glow === "accent" &&
          "shadow-[0_0_0_1px_hsl(var(--premium-accent)/0.06),0_32px_120px_hsl(var(--premium-accent)/0.12)]",
        glow === "teal" &&
          "shadow-[0_0_0_1px_hsl(var(--premium-teal)/0.05),0_32px_120px_hsl(var(--premium-teal)/0.1)]",
        className
      )}
      {...props}
    />
  );
}

export function SystemBadge({ className, tone = "muted", ...props }: SystemBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]",
        tone === "accent" &&
          "border-[hsl(var(--premium-accent)/0.35)] bg-[hsl(var(--premium-accent)/0.1)] text-[hsl(var(--premium-accent-soft))]",
        tone === "success" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
        tone === "warning" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-100",
        tone === "muted" &&
          "border-white/10 bg-white/[0.04] text-[hsl(var(--premium-muted))]",
        className
      )}
      {...props}
    />
  );
}

export function CommandCapsule({ children, href, tone = "secondary" }: CommandCapsuleProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--premium-accent)/0.35)]",
        tone === "primary"
          ? "border border-[hsl(var(--premium-accent)/0.42)] bg-[hsl(var(--premium-accent))] text-white shadow-[0_22px_80px_hsl(var(--premium-accent)/0.24)] hover:bg-[hsl(var(--premium-accent-soft))]"
          : "border border-white/10 bg-white/[0.045] text-[hsl(var(--premium-paper))] hover:border-[hsl(var(--premium-accent)/0.34)] hover:bg-white/[0.07]"
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
