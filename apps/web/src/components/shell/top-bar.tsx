"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useState } from "react";
import { PremiumSelect } from "@/components/ui/premium-select";

const modelOptions = [
  { label: "Auto", value: "auto" },
  { label: "OpenRouter", value: "openrouter" },
  { label: "Local", value: "local" }
];
const performanceOptions = [
  { label: "Balanced", value: "balanced" },
  { label: "Low power", value: "low-power" },
  { label: "Fast", value: "fast" }
];

export function TopBar() {
  const [model, setModel] = useState("auto");
  const [mode, setMode] = useState("balanced");

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.88)] px-4 shadow-[0_1px_0_hsl(var(--gold)/0.08)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-panel-raised)/0.8)] font-mono text-xs font-semibold text-accent shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06),0_0_28px_hsl(var(--accent)/0.2)]">
          H
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">Hassali.ai</div>
          <div className="hidden text-[11px] text-muted-foreground sm:block">Neon calm workspace</div>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <PremiumSelect
          className="hidden sm:block"
          label="Model"
          onChange={setModel}
          options={modelOptions}
          value={model}
        />
        <PremiumSelect
          className="hidden md:block"
          label="Mode"
          onChange={setMode}
          options={performanceOptions}
          value={mode}
        />
        <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--royal-border))] bg-[hsl(var(--gold)/0.1)] px-3 py-1.5 text-[11px] font-medium text-accent shadow-sm sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.55)]" />
          Usage 0%
        </div>
        <div className="flex h-9 shrink-0 items-center rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.68)] px-2 shadow-sm">
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-xs text-muted-foreground" type="button">
                Account
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
