"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { IntelligenceSettingsDialog } from "@/components/settings/intelligence-settings-dialog";
import { MemorySettingsDialog } from "@/components/settings/memory-settings-dialog";
import { defaultThemeMode, legacyThemeStorageKey, resolveThemeMode, themeStorageKey, type ThemeMode } from "@/lib/theme-mode";

type BrowserGlobal = {
  document?: { documentElement: { classList: { remove: (name: string) => void; toggle: (name: string, force?: boolean) => void } } };
  localStorage?: { getItem: (key: string) => string | null; removeItem: (key: string) => void; setItem: (key: string, value: string) => void };
};

function applyTheme(theme: ThemeMode) {
  const classes = (globalThis as BrowserGlobal).document?.documentElement.classList;
  classes?.toggle("dark", theme === "dark");
  classes?.toggle("darker", theme === "darker");
  classes?.remove("light");
}

export function SettingsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05-2.87 2.87-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21h-4v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.05.05-2.87-2.87.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.05-.05 2.87-2.87.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.05-.05 2.87 2.87-.05.05A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.05a1.7 1.7 0 0 0-1.55 1Z" /></svg>;
}

export function SidebarSettings() {
  const [theme, setTheme] = useState<ThemeMode>(defaultThemeMode);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  useEffect(() => {
    const storage = (globalThis as BrowserGlobal).localStorage;
    const next = resolveThemeMode(storage?.getItem(themeStorageKey) ?? storage?.getItem(legacyThemeStorageKey));
    setTheme(next);
    applyTheme(next);
    storage?.removeItem(legacyThemeStorageKey);
    storage?.setItem(themeStorageKey, next);
  }, []);

  const selectTheme = (next: ThemeMode) => {
    setTheme(next);
    applyTheme(next);
    (globalThis as BrowserGlobal).localStorage?.setItem(themeStorageKey, next);
  };

  return <>
    <details className="group border-t border-white/[0.06] pt-2">
      <summary className="hassali-focus-ring flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground [&::-webkit-details-marker]:hidden">
        <SettingsIcon />
        <span>Settings</span>
      </summary>
      <div className="mt-1 space-y-1 px-1 pb-1">
        <button className="hassali-focus-ring w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground" onClick={() => setIntelligenceOpen(true)} type="button">Intelligence</button>
        <button className="hassali-focus-ring w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground" onClick={() => setMemoryOpen(true)} type="button">Memory</button>
        <div className="px-2 py-2">
          <div className="mb-1.5 text-[10px] uppercase text-muted-foreground">Theme</div>
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="Theme">
            {(["dark", "darker"] as const).map((value) => <button aria-pressed={theme === value} className={`hassali-focus-ring rounded-md px-2 py-1.5 text-xs ${theme === value ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:bg-white/[0.04]"}`} key={value} onClick={() => selectTheme(value)} type="button">{value === "dark" ? "Dark" : "Darker"}</button>)}
          </div>
        </div>
        <div className="px-2 py-2">
          <SignedIn><div className="flex items-center gap-2 text-xs text-muted-foreground"><UserButton afterSignOutUrl="/" /><span>Account</span></div></SignedIn>
          <SignedOut><SignInButton mode="modal"><button className="text-xs text-muted-foreground" type="button">Sign in</button></SignInButton></SignedOut>
        </div>
      </div>
    </details>
    <IntelligenceSettingsDialog onClose={() => setIntelligenceOpen(false)} open={intelligenceOpen} />
    <MemorySettingsDialog onClose={() => setMemoryOpen(false)} open={memoryOpen} />
  </>;
}
