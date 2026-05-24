"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
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
const themeStorageKey = "hassali:theme";
type ThemeMode = "dark" | "light";
type BrowserGlobal = {
  document?: {
    documentElement: {
      classList: {
        toggle: (className: string, force?: boolean) => void;
      };
    };
  };
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
};

function applyTheme(theme: ThemeMode) {
  const classList = (globalThis as BrowserGlobal).document?.documentElement.classList;

  classList?.toggle("dark", theme === "dark");
  classList?.toggle("light", theme === "light");
}

export function TopBar() {
  const [model, setModel] = useState("auto");
  const [mode, setMode] = useState("balanced");
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const savedTheme = (globalThis as BrowserGlobal).localStorage?.getItem(themeStorageKey);
    const nextTheme: ThemeMode = savedTheme === "light" ? "light" : "dark";

    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    applyTheme(nextTheme);
    (globalThis as BrowserGlobal).localStorage?.setItem(themeStorageKey, nextTheme);
  };

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
        <button
          className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.68)] px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-sm hover:text-foreground"
          onClick={toggleTheme}
          type="button"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
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
