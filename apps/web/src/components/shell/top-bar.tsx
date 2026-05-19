"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

const modelOptions = ["Auto", "OpenRouter", "Local"];
const performanceOptions = ["Balanced", "Low power", "Fast"];

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-surface/95 px-3.5 shadow-[0_1px_0_hsl(var(--foreground)/0.03)] backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background/80 font-mono text-xs font-semibold shadow-sm">
          H
        </div>
        <span className="truncate text-sm font-medium tracking-[0.01em]">Hassali.ai</span>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <label className="hidden items-center gap-2 rounded-md border bg-background/70 px-2 py-1 shadow-sm sm:flex">
          <span>Model</span>
          <select
            aria-label="Model selector"
            className="max-w-28 bg-transparent text-foreground outline-none"
            defaultValue="Auto"
          >
            {modelOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="hidden items-center gap-2 rounded-md border bg-background/70 px-2 py-1 shadow-sm md:flex">
          <span>Mode</span>
          <select
            aria-label="Performance mode selector"
            className="max-w-28 bg-transparent text-foreground outline-none"
            defaultValue="Balanced"
          >
            {performanceOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <div className="hidden items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-accent sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Usage 0%
        </div>
        <div className="flex h-8 shrink-0 items-center rounded-md border bg-background/70 px-2 shadow-sm">
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
