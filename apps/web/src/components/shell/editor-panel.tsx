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
      { token: "keyword", foreground: "d2b477" },
      { token: "string", foreground: "94bfa8" },
      { token: "number", foreground: "c6a477" }
    ],
    colors: {
      "editor.background": "#0d0f15",
      "editor.foreground": "#ddd7c9",
      "editor.lineHighlightBackground": "#171a22",
      "editorCursor.foreground": "#78ad98",
      "editorLineNumber.foreground": "#555967",
      "editorLineNumber.activeForeground": "#9aa09f",
      "editor.selectionBackground": "#28483f",
      "editor.inactiveSelectionBackground": "#1d2c2b"
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

  const activeFile = files[activePath];
  const hasDirtyFiles = Object.values(files).some((file) => file.content !== file.savedContent);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-surface/90">
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
          {openTabs.map((tabPath) => {
            const file = files[tabPath];
            const isActive = tabPath === activePath;
            const isDirty = file.content !== file.savedContent;

            return (
              <button
                key={tabPath}
                className={`group relative flex h-full min-w-36 max-w-52 items-center gap-2 border-r px-3.5 text-left text-xs ${
                  isActive
                    ? "bg-background text-foreground shadow-[inset_0_-1px_0_hsl(var(--background))]"
                    : "text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                }`}
                onClick={() => openFile(tabPath)}
                type="button"
              >
                {isActive ? (
                  <span className="absolute inset-x-3 top-0 h-px rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.45)]" />
                ) : null}
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
        <div className="flex h-full shrink-0 items-center gap-2 border-l px-3.5">
          {hasDirtyFiles ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">Unsaved changes</span>
          ) : null}
          <button
            className="rounded-lg border border-border/80 bg-background/75 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/10"
            onClick={saveActiveFile}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
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
      </div>
    </main>
  );
}
