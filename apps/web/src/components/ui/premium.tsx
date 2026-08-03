import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type PremiumPanelProps = HTMLAttributes<HTMLDivElement> & {
  glow?: "accent" | "none" | "teal";
};

type SystemBadgeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "accent" | "ask" | "code" | "muted" | "success" | "warning" | "website";
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
        "relative overflow-hidden rounded-[28px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.84)] backdrop-blur-xl",
        glow === "accent" &&
          "shadow-[0_0_0_1px_hsl(var(--premium-accent)/0.06),0_16px_48px_hsl(0_0%_0%/0.3),0_8px_32px_hsl(var(--premium-accent)/0.14)]",
        glow === "teal" &&
          "shadow-[0_0_0_1px_hsl(var(--premium-teal)/0.05),0_16px_48px_hsl(0_0%_0%/0.28)]",
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
          "border-[color:color-mix(in_srgb,var(--home-success)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--home-success)_10%,transparent)] text-[var(--home-success)]",
        tone === "warning" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-100",
        tone === "ask" &&
          "border-[var(--home-ask)]/35 bg-[var(--home-ask-soft)] text-[var(--home-ask)]",
        tone === "website" &&
          "border-[var(--home-website)]/35 bg-[var(--home-website-soft)] text-[var(--home-website)]",
        tone === "code" &&
          "border-[var(--home-code)]/35 bg-[var(--home-code-soft)] text-[var(--home-code)]",
        tone === "muted" &&
          "border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong)/0.55)] text-[hsl(var(--premium-muted))]",
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
          ? "border border-[hsl(var(--premium-accent)/0.42)] bg-[var(--home-interactive)] text-[var(--home-interactive-foreground)] shadow-[0_8px_32px_rgba(255,122,60,0.14)] hover:bg-[var(--home-interactive-hover)]"
          : "border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong)/0.58)] text-[hsl(var(--premium-paper))] hover:border-[hsl(var(--premium-accent)/0.34)] hover:bg-[hsl(var(--premium-panel-strong)/0.82)]"
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
