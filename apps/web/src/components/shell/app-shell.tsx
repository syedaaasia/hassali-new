"use client";

import { BottomPanel } from "@/components/shell/bottom-panel";
import { EditorPanel } from "@/components/shell/editor-panel";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { PreviewPanel } from "@/components/shell/preview-panel";
import { ProjectNotesPanel } from "@/components/shell/project-notes-panel";
import { RightSidebar } from "@/components/shell/right-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { WorkspaceHydrator } from "@/components/shell/workspace-hydrator";
import { createInitialAppShellPanelState, toggleProjectPanelState } from "@/lib/app-shell-state";
import { useChatStore } from "@/lib/chat-store";
import { useRuntimeStore } from "@/lib/runtime-store";
import { useEffect, useState } from "react";
import styles from "./workspace.module.css";

export function AppShell() {
  const productMode = useChatStore((state) => state.productMode);
  const isPreviewOpen = useRuntimeStore((state) => state.isPreviewOpen);
  const setPreviewOpen = useRuntimeStore((state) => state.setPreviewOpen);
  const allowsTools = productMode !== "ASK";
  const shouldShowPreview = allowsTools && isPreviewOpen;
  const [panelState, setPanelState] = useState(createInitialAppShellPanelState);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    if (productMode === "ASK") {
      setIsEditorOpen(false);
      setPreviewOpen(false);
    }
  }, [productMode, setPreviewOpen]);

  const toggleSidebar = () => {
    setPanelState(toggleProjectPanelState);
  };

  return (
    <div
      className={`${styles.workspace} relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[hsl(var(--premium-void))] text-[13px] text-foreground`}
      data-product-mode={productMode}
    >
      <div className={`${styles.ambient} pointer-events-none absolute inset-0`} />
      <WorkspaceHydrator />
      <TopBar />
      <div className="relative z-10 flex min-h-0 flex-1 gap-2 overflow-hidden p-1.5 pt-0">
        <LeftSidebar collapsed={panelState.projectPanelCollapsed} onToggleCollapsed={toggleSidebar} />
        <div className={`${styles.primarySurface} flex min-w-0 flex-[1.8] flex-col overflow-hidden rounded-2xl border backdrop-blur-xl`}>
          <RightSidebar
            isEditorOpen={allowsTools && isEditorOpen}
            onToggleEditor={() => setIsEditorOpen((current) => !current)}
          />
        </div>
        {allowsTools && isEditorOpen ? (
          <div className={`${styles.toolSurface} hidden w-[19rem] shrink-0 flex-col overflow-hidden rounded-2xl border backdrop-blur-xl lg:flex xl:w-[21rem] 2xl:w-[23rem]`}>
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
