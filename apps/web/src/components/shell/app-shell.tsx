import { BottomPanel } from "@/components/shell/bottom-panel";
import { EditorPanel } from "@/components/shell/editor-panel";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { RightSidebar } from "@/components/shell/right-sidebar";
import { TopBar } from "@/components/shell/top-bar";

export function AppShell() {
  return (
    <div className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-background">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <EditorPanel />
          <BottomPanel />
        </div>
        <RightSidebar />
      </div>
    </div>
  );
}
