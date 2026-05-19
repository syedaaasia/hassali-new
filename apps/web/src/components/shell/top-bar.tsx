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
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-surface/90 px-4 shadow-[0_1px_0_hsl(var(--foreground)/0.04)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/80 font-mono text-xs font-semibold shadow-[inset_0_1px_0_hsl(var(--foreground)/0.05),0_8px_24px_hsl(224_20%_4%/0.12)]">
          H
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">Hassali.ai</div>
          <div className="hidden text-[11px] text-muted-foreground sm:block">Calm coding workspace</div>
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
        <div className="hidden items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent shadow-sm sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.55)]" />
          Usage calm
        </div>
        <div className="flex h-9 shrink-0 items-center rounded-lg border border-border/80 bg-background/70 px-2 shadow-sm">
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
