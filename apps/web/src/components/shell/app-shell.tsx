import { BottomPanel } from "@/components/shell/bottom-panel";
import { EditorPanel } from "@/components/shell/editor-panel";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { RightSidebar } from "@/components/shell/right-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { WorkspaceHydrator } from "@/components/shell/workspace-hydrator";

export function AppShell() {
  return (
    <div className="flex h-[100dvh] min-h-[620px] flex-col overflow-hidden bg-[hsl(var(--royal-black))] text-[13px] text-foreground">
      <WorkspaceHydrator />
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-px bg-[hsl(var(--royal-border-soft))] p-1 pt-0">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl bg-background shadow-[0_0_0_1px_hsl(var(--royal-border-soft)),0_20px_80px_hsl(0_80%_3%/0.34)]">
          <EditorPanel />
          <BottomPanel />
        </div>
        <RightSidebar />
      </div>
    </div>
  );
}
