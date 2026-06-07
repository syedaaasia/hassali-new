"use client";

import { BottomPanel } from "@/components/shell/bottom-panel";
import { EditorPanel } from "@/components/shell/editor-panel";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { PreviewPanel } from "@/components/shell/preview-panel";
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
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#050505] text-[13px] text-foreground">
      <WorkspaceHydrator />
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden bg-[#050505] p-1.5 pt-0">
        <LeftSidebar collapsed={isSidebarCollapsed} onToggleCollapsed={toggleSidebar} />
        <div className="flex min-w-0 flex-[1.8] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#0d0d0d] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <RightSidebar
            isEditorOpen={allowsTools && isEditorOpen}
            onToggleEditor={() => setIsEditorOpen((current) => !current)}
          />
        </div>
        {allowsTools && isEditorOpen ? (
          <div className="hidden w-[19rem] shrink-0 flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0b0b] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] lg:flex xl:w-[21rem] 2xl:w-[23rem]">
            <EditorPanel />
            <BottomPanel />
          </div>
        ) : null}
        {shouldShowPreview ? <PreviewPanel /> : null}
      </div>
    </div>
  );
}
