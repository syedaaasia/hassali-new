"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useChatStore } from "@/lib/chat-store";

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

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.86 15a1.8 1.8 0 0 0-1.65-1.08H2a2.1 2.1 0 0 1 0-4.2h.06a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.08-1.65V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.08H22a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

export function TopBar() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const productMode = useChatStore((state) => state.productMode);

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
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-[#050505]/95 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <img
            alt="Hassali.ai"
            className="h-full w-full object-contain"
            src="/brand/hassali-logo.png"
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">Hassali.ai</div>
          <div className="hidden text-[11px] text-muted-foreground sm:block">
            Autonomous engineering workspace
          </div>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <div className="hidden items-center gap-2 px-1.5 py-1 text-[11px] font-medium text-[#f4f1e8] md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8b7cf6] shadow-[0_0_12px_rgba(139,124,246,0.45)]" />
          {productMode}
        </div>
        <div className="hidden items-center gap-2 px-1.5 py-1 text-[11px] font-medium text-muted-foreground lg:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
          Usage 0%
        </div>
        <details className="group relative">
          <summary
            aria-label="Settings"
            className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground [.light_&]:hover:bg-slate-200 [.light_&]:hover:text-slate-950 [&::-webkit-details-marker]:hidden"
          >
            <SettingsIcon />
          </summary>
          <div className="absolute right-0 top-9 z-20 w-48 rounded-2xl border border-white/10 bg-[#111] p-2 shadow-[0_20px_80px_rgba(0,0,0,0.45)] [.light_&]:border-slate-200 [.light_&]:bg-white [.light_&]:text-slate-950">
            <button
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground [.light_&]:hover:bg-slate-100 [.light_&]:hover:text-slate-950"
              onClick={toggleTheme}
              type="button"
            >
              Theme
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <div className="mt-1 rounded-xl px-3 py-2">
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
        </details>
      </div>
    </header>
  );
}
