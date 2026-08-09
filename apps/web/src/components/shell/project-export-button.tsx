"use client";

import { useState } from "react";
import type { ProductMode } from "@/lib/chat-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

type BrowserGlobal = {
  document: {
    body: {
      appendChild: (node: unknown) => void;
    };
    createElement: (tag: "a") => {
      click: () => void;
      download: string;
      href: string;
      remove: () => void;
    };
  };
};

export function ProjectExportButton({ compact = false, mode }: { compact?: boolean; mode: ProductMode }) {
  const projectId = useWorkspaceStore((state) => state.projectId);
  const setWorkspaceError = useWorkspaceStore((state) => state.setError);
  const [isDownloading, setIsDownloading] = useState(false);

  if (mode === "ASK") return null;

  const download = async () => {
    if (!projectId || isDownloading) return;

    setIsDownloading(true);
    setWorkspaceError(null);

    try {
      const exportUrl = `/api/workspace/export?projectId=${encodeURIComponent(projectId)}&mode=${encodeURIComponent(mode)}`;
      const response = await fetch(exportUrl);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof payload?.error === "string" ? payload.error : "Project ZIP export failed.");
      }

      await response.body?.cancel();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `hassali-${mode.toLowerCase()}-project.zip`;
      const browser = globalThis as unknown as BrowserGlobal;
      const link = browser.document.createElement("a");

      link.href = exportUrl;
      link.download = fileName;
      browser.document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Project ZIP export failed.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      className={compact
        ? "min-h-9 rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        : "rounded-full border border-[hsl(var(--premium-border))] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#F4F3EE]/75 hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-[#F4F3EE] disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:border-[#d8d1c6] [.light_&]:bg-white [.light_&]:text-[#000000]"}
      disabled={!projectId || isDownloading}
      onClick={() => void download()}
      title={projectId ? "Download approved project source as ZIP" : "Select a project before exporting"}
      type="button"
    >
      {isDownloading ? "Preparing..." : "Download ZIP"}
    </button>
  );
}
