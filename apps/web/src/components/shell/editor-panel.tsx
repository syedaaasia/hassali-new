"use client";

import dynamic from "next/dynamic";
import type { EditorProps } from "@monaco-editor/react";
import { useWorkspaceStore } from "@/lib/workspace-store";

type MonacoBeforeMount = NonNullable<EditorProps["beforeMount"]>;

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-background font-mono text-xs text-muted-foreground">
      Preparing workspace...
    </div>
  )
});

const configureMonacoTheme: MonacoBeforeMount = (monaco) => {
  monaco.editor.defineTheme("hassali-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7b7f8e" },
      { token: "keyword", foreground: "9f8cff" },
      { token: "string", foreground: "48d597" },
      { token: "number", foreground: "b8a8ff" }
    ],
    colors: {
      "editor.background": "#070707",
      "editor.foreground": "#eee6d4",
      "editor.lineHighlightBackground": "#151515",
      "editorCursor.foreground": "#DE7356",
      "editorLineNumber.foreground": "#5f5b58",
      "editorLineNumber.activeForeground": "#F0A18B",
      "editor.selectionBackground": "#2d285f",
      "editor.inactiveSelectionBackground": "#17152d"
    }
  });
};

export function EditorPanel() {
  const files = useWorkspaceStore((state) => state.files);
  const openTabs = useWorkspaceStore((state) => state.openTabs);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const closeFile = useWorkspaceStore((state) => state.closeFile);
  const updateActiveFile = useWorkspaceStore((state) => state.updateActiveFile);
  const saveActiveFile = useWorkspaceStore((state) => state.saveActiveFile);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const projectName = useWorkspaceStore((state) => state.projectName);

  const activeFile = files[activePath];
  const hasDirtyFiles = Object.values(files).some((file) => file.content !== file.savedContent);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--royal-black))]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.88)]">
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
          {openTabs.map((tabPath) => {
            const file = files[tabPath];
            if (!file) {
              return null;
            }

            const isActive = tabPath === activePath;
            const isDirty = file.content !== file.savedContent;

            return (
              <button
                key={tabPath}
                className={`group relative flex h-full min-w-36 max-w-52 items-center gap-2 border-r px-3.5 text-left text-xs ${
                  isActive
                    ? "bg-[hsl(var(--royal-black))] text-foreground shadow-[inset_0_-1px_0_hsl(var(--royal-black))]"
                    : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised)/0.45)] hover:text-foreground"
                }`}
                onClick={() => openFile(tabPath)}
                type="button"
              >
                {isActive ? (
                  <span className="absolute inset-x-3 top-0 h-px rounded-full bg-[hsl(var(--premium-accent))] shadow-[0_0_16px_hsl(var(--premium-accent)/0.5)]" />
                ) : null}
                <span className="truncate">{tabPath}</span>
                {isDirty ? (
                  <span
                    aria-label={`${tabPath} has unsaved changes`}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--premium-accent))]"
                  />
                ) : null}
                {openTabs.length > 1 ? (
                  <span
                    aria-label={`Close ${tabPath}`}
                    className="ml-auto rounded px-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
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
        <div className="flex h-full shrink-0 items-center gap-2 border-l border-[hsl(var(--royal-border-soft))] px-3.5">
          {hasDirtyFiles ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">Unsaved changes</span>
          ) : null}
          <button
            className="rounded-full border border-[hsl(var(--premium-accent)/0.35)] bg-[hsl(var(--premium-accent)/0.12)] px-3.5 py-1.5 text-xs font-medium text-[hsl(var(--premium-paper))] shadow-sm hover:bg-[hsl(var(--premium-accent)/0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--premium-accent)/0.2)]"
            disabled={!activeFile}
            onClick={() => {
              void saveActiveFile();
            }}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-b-2xl bg-[hsl(var(--royal-black))]">
        {activeFile ? (
          <MonacoEditor
            beforeMount={configureMonacoTheme}
            height="100%"
            language={activeFile.language}
            onChange={(value) => updateActiveFile(value ?? "")}
            options={{
              automaticLayout: true,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              fontSize: 13,
              lineHeight: 21,
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
            theme="hassali-dark"
            value={activeFile.content}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.54)] p-5 shadow-[0_24px_80px_hsl(0_80%_3%/0.28)]">
              <div className="text-sm font-medium text-foreground">
                {isLoading ? "Loading workspace" : projectName ? "No file selected" : "Create a project"}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {isLoading
                  ? "Restoring your latest PostgreSQL-backed workspace."
                  : projectName
                    ? "Choose a file from the workspace sidebar to continue."
                    : "Start with a small set of starter files, then save edits into the database."}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
