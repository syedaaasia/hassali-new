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

export function AppShell() {
  const mode = useChatStore((state) => state.mode);
  const isPreviewOpen = useRuntimeStore((state) => state.isPreviewOpen);
  const shouldShowPreview = mode !== "ASK" && isPreviewOpen;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[hsl(var(--royal-black))] text-[13px] text-foreground">
      <WorkspaceHydrator />
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-px overflow-hidden bg-[hsl(var(--royal-border-soft))] p-1 pt-0">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl bg-background shadow-[0_0_0_1px_hsl(var(--royal-border-soft)),0_20px_80px_hsl(0_80%_3%/0.34)]">
          <RightSidebar />
        </div>
        <div className="hidden w-[20rem] shrink-0 flex-col overflow-hidden bg-background shadow-[0_0_0_1px_hsl(var(--royal-border-soft)),0_20px_80px_hsl(0_80%_3%/0.24)] lg:flex xl:w-[23rem] 2xl:w-[26rem]">
          <EditorPanel />
          <BottomPanel />
        </div>
        {shouldShowPreview ? <PreviewPanel /> : null}
      </div>
    </div>
  );
}
