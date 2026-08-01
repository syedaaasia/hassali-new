"use client";

import { BottomPanel } from "@/components/shell/bottom-panel";
import { EditorPanel } from "@/components/shell/editor-panel";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { PreviewPanel } from "@/components/shell/preview-panel";
import { ProjectNotesPanel } from "@/components/shell/project-notes-panel";
import { RightSidebar } from "@/components/shell/right-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { WorkspaceHydrator } from "@/components/shell/workspace-hydrator";
import { useChatStore } from "@/lib/chat-store";
import { useRuntimeStore } from "@/lib/runtime-store";
import { useEffect, useState } from "react";

const sidebarStorageKey = "hassali:left-sidebar-collapsed";
type BrowserGlobal = {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
};

export function AppShell() {
  const productMode = useChatStore((state) => state.productMode);
  const isPreviewOpen = useRuntimeStore((state) => state.isPreviewOpen);
  const setPreviewOpen = useRuntimeStore((state) => state.setPreviewOpen);
  const allowsTools = productMode !== "ASK";
  const shouldShowPreview = allowsTools && isPreviewOpen;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    const saved = (globalThis as BrowserGlobal).localStorage?.getItem(sidebarStorageKey);

    setIsSidebarCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    if (productMode === "ASK") {
      setIsEditorOpen(false);
      setPreviewOpen(false);
    }
  }, [productMode, setPreviewOpen]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;

      (globalThis as BrowserGlobal).localStorage?.setItem(sidebarStorageKey, String(next));

      return next;
    });
  };

  return (
    <div
      className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[hsl(var(--premium-void))] text-[13px] text-foreground"
      data-product-mode={productMode}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_0%,hsl(var(--premium-accent)/0.12),transparent_28rem),radial-gradient(circle_at_92%_20%,hsl(var(--premium-teal)/0.07),transparent_26rem)]" />
      <WorkspaceHydrator />
      <TopBar />
      <div className="relative z-10 flex min-h-0 flex-1 gap-2 overflow-hidden p-1.5 pt-0">
        <LeftSidebar collapsed={isSidebarCollapsed} onToggleCollapsed={toggleSidebar} />
        <div className="flex min-w-0 flex-[1.8] flex-col overflow-hidden rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.74)] shadow-[0_0_0_1px_hsl(var(--premium-paper)/0.02),0_28px_90px_hsl(0_0%_0%/0.35)] backdrop-blur-xl">
          <RightSidebar
            isEditorOpen={allowsTools && isEditorOpen}
            onToggleEditor={() => setIsEditorOpen((current) => !current)}
          />
        </div>
        {allowsTools && isEditorOpen ? (
          <div className="hidden w-[19rem] shrink-0 flex-col overflow-hidden rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.72)] shadow-[0_24px_90px_hsl(0_0%_0%/0.32)] backdrop-blur-xl lg:flex xl:w-[21rem] 2xl:w-[23rem]">
            <EditorPanel />
            <BottomPanel />
          </div>
        ) : null}
        {shouldShowPreview ? <PreviewPanel /> : null}
        {productMode === "ASK" ? <ProjectNotesPanel /> : null}
      </div>
    </div>
  );
}
