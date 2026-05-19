"use client";

import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/lib/workspace-store";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-background font-mono text-xs text-muted-foreground">
      Loading editor...
    </div>
  )
});

export function EditorPanel() {
  const files = useWorkspaceStore((state) => state.files);
  const openTabs = useWorkspaceStore((state) => state.openTabs);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const closeFile = useWorkspaceStore((state) => state.closeFile);
  const updateActiveFile = useWorkspaceStore((state) => state.updateActiveFile);
  const saveActiveFile = useWorkspaceStore((state) => state.saveActiveFile);

  const activeFile = files[activePath];
  const hasDirtyFiles = Object.values(files).some((file) => file.content !== file.savedContent);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b bg-surface/95">
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
          {openTabs.map((tabPath) => {
            const file = files[tabPath];
            const isActive = tabPath === activePath;
            const isDirty = file.content !== file.savedContent;

            return (
              <button
                key={tabPath}
                className={`group relative flex h-full min-w-32 max-w-48 items-center gap-2 border-r px-3 text-left text-xs ${
                  isActive
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                }`}
                onClick={() => openFile(tabPath)}
                type="button"
              >
                {isActive ? <span className="absolute inset-x-2 top-0 h-px bg-accent" /> : null}
                <span className="truncate">{tabPath}</span>
                {isDirty ? (
                  <span
                    aria-label={`${tabPath} has unsaved changes`}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                ) : null}
                {openTabs.length > 1 ? (
                  <span
                    aria-label={`Close ${tabPath}`}
                    className="ml-auto rounded px-1 text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeFile(tabPath);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        closeFile(tabPath);
                      }
                    }}
                  >
                    x
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex h-full shrink-0 items-center gap-2 border-l px-3">
          {hasDirtyFiles ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">Unsaved changes</span>
          ) : null}
          <button
            className="rounded-md border bg-background/80 px-3 py-1.5 text-xs text-foreground shadow-sm hover:bg-muted"
            onClick={saveActiveFile}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <MonacoEditor
          height="100%"
          language={activeFile.language}
          onChange={(value) => updateActiveFile(value ?? "")}
          options={{
            automaticLayout: true,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
            fontSize: 13,
            minimap: { enabled: false },
            overviewRulerBorder: false,
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            smoothScrolling: false,
            tabSize: 2,
            padding: { top: 16 },
            wordWrap: "on"
          }}
          path={activeFile.path}
          theme="vs-dark"
          value={activeFile.content}
        />
      </div>
    </main>
  );
}
