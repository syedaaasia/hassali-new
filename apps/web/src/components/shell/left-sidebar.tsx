"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
import { useChatStore } from "@/lib/chat-store";
import {
  folderPlaceholderFileName,
  type WorkspaceFile,
  useWorkspaceStore
} from "@/lib/workspace-store";

const fileTypeLabels: Record<string, string> = {
  "README.md": "MD",
  "welcome.ts": "TS",
  "workspace.json": "{}"
};

type TreeNode = {
  children: Map<string, TreeNode>;
  kind: "file" | "folder";
  name: string;
  path: string;
};
type DialogGlobal = {
  confirm?: (message?: string) => boolean;
  prompt?: (message?: string, defaultValue?: string) => string | null;
};
type SidebarSection = "git" | "projects" | "search" | "workspace";

function isFolderPlaceholderPath(path: string) {
  return path.endsWith(`/${folderPlaceholderFileName}`);
}

function fileLabel(path: string) {
  if (fileTypeLabels[path]) {
    return fileTypeLabels[path];
  }

  const fileName = path.split("/").at(-1) ?? path;
  const extension = fileName.includes(".") ? fileName.split(".").at(-1) : "";

  return extension ? extension.slice(0, 3).toUpperCase() : "--";
}

function createFolderNode(name: string, path: string): TreeNode {
  return {
    children: new Map(),
    kind: "folder",
    name,
    path
  };
}

function buildFileTree(files: Record<string, WorkspaceFile>) {
  const root = createFolderNode("", "");

  for (const file of Object.values(files)) {
    const path = isFolderPlaceholderPath(file.path)
      ? file.path.slice(0, -1 * `/${folderPlaceholderFileName}`.length)
      : file.path;
    const segments = path.split("/").filter(Boolean);
    let current = root;

    segments.forEach((segment, index) => {
      const nodePath = segments.slice(0, index + 1).join("/");
      const isLeaf = index === segments.length - 1;
      const kind = isLeaf && !isFolderPlaceholderPath(file.path) ? "file" : "folder";
      const existing = current.children.get(segment);

      if (existing) {
        current = existing;
        return;
      }

      const node: TreeNode = {
        children: new Map(),
        kind,
        name: segment,
        path: nodePath
      };

      current.children.set(segment, node);
      current = node;
    });
  }

  return Array.from(root.children.values()).sort(sortTreeNodes);
}

function sortTreeNodes(left: TreeNode, right: TreeNode) {
  if (left.kind !== right.kind) {
    return left.kind === "folder" ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function promptValue(message: string, defaultValue: string) {
  const prompt = (globalThis as DialogGlobal).prompt;

  return prompt?.(message, defaultValue)?.trim() ?? null;
}

function confirmAction(message: string) {
  const confirm = (globalThis as DialogGlobal).confirm;

  return confirm ? confirm(message) : false;
}

export function LeftSidebar() {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [expandedSections, setExpandedSections] = useState<Record<SidebarSection, boolean>>({
    git: false,
    projects: false,
    search: false,
    workspace: true
  });
  const [selectedNode, setSelectedNode] = useState<{
    kind: "file" | "folder";
    path: string;
  } | null>(null);
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const error = useWorkspaceStore((state) => state.error);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const projects = useWorkspaceStore((state) => state.projects);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const createFile = useWorkspaceStore((state) => state.createFile);
  const createFolder = useWorkspaceStore((state) => state.createFolder);
  const createProject = useWorkspaceStore((state) => state.createProject);
  const deletePath = useWorkspaceStore((state) => state.deletePath);
  const renamePath = useWorkspaceStore((state) => state.renamePath);
  const switchProject = useWorkspaceStore((state) => state.switchProject);
  const hydrateChat = useChatStore((state) => state.hydrateChat);
  const nextProjectName = projects.length === 0 ? "Hassali Project" : `Hassali Project ${projects.length + 1}`;
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const visibleFileCount = Object.keys(files).filter((path) => !isFolderPlaceholderPath(path)).length;
  const selectedPath = selectedNode?.path ?? activePath;
  const selectedKind = selectedNode?.kind ?? "file";
  const toggleSection = (section: SidebarSection) => {
    setExpandedSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section]
    }));
  };

  const hydrateProjectChat = (payload: Awaited<ReturnType<typeof createProject>>) => {
    if (payload) {
      setSelectedNode(null);
      hydrateChat(payload.chat.messages, payload.chat.sessionId);
    }
  };
  const createProjectFromPrompt = () => {
    const requestedName = promptValue("Project name", "");
    const projectNameFromPrompt =
      requestedName && requestedName.length > 0 ? requestedName : nextProjectName;

    void createProject(projectNameFromPrompt).then(hydrateProjectChat);
  };
  const createFileFromPrompt = () => {
    const path = promptValue("New file path", "src/app/page.tsx");

    if (path) {
      setSelectedNode({ kind: "file", path });
      void createFile(path);
    }
  };
  const createFolderFromPrompt = () => {
    const path = promptValue("New folder path", "src/components");

    if (path) {
      setSelectedNode({ kind: "folder", path });
      void createFolder(path);
    }
  };
  const renameSelectedPath = () => {
    if (!selectedPath) {
      return;
    }

    const nextPath = promptValue("Rename path", selectedPath);

    if (nextPath && nextPath !== selectedPath) {
      setSelectedNode({ kind: selectedKind, path: nextPath });
      void renamePath(selectedPath, nextPath, selectedKind);
    }
  };
  const deleteSelectedPath = () => {
    if (!selectedPath) {
      return;
    }

    const confirmed = confirmAction(
      selectedKind === "folder"
        ? `Delete folder "${selectedPath}" and all files inside it?`
        : `Delete file "${selectedPath}"?`
    );

    if (confirmed) {
      setSelectedNode(null);
      void deletePath(selectedPath, selectedKind);
    }
  };
  const toggleFolder = (path: string) => {
    setCollapsedFolders((currentFolders) => {
      const nextFolders = new Set(currentFolders);

      if (nextFolders.has(path)) {
        nextFolders.delete(path);
      } else {
        nextFolders.add(path);
      }

      return nextFolders;
    });
  };
  const renderTree = (nodes: TreeNode[], depth = 0): ReactNode =>
    nodes.map((node) => {
      const isSelected =
        selectedNode?.path === node.path && selectedNode.kind === node.kind;
      const isActiveFile = node.kind === "file" && node.path === activePath;
      const isFolder = node.kind === "folder";
      const isCollapsed = isFolder && collapsedFolders.has(node.path);
      const childNodes = Array.from(node.children.values()).sort(sortTreeNodes);
      const file = files[node.path];
      const isDirty = file ? file.content !== file.savedContent : false;

      return (
        <div key={`${node.kind}-${node.path}`}>
          <button
            aria-expanded={isFolder ? !isCollapsed : undefined}
            className={`group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
              isSelected || isActiveFile
                ? "bg-[hsl(var(--gold)/0.11)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.18),0_10px_28px_hsl(var(--gold)/0.08)]"
                : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised)/0.62)] hover:text-foreground"
            }`}
            onClick={() => {
              setSelectedNode({ kind: node.kind, path: node.path });

              if (isFolder) {
                toggleFolder(node.path);
              } else {
                openFile(node.path);
              }
            }}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            type="button"
          >
            {isActiveFile ? (
              <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-accent" />
            ) : null}
            <span className="w-2 shrink-0 text-[10px] text-muted-foreground group-hover:text-foreground">
              {isFolder ? (isCollapsed ? ">" : "v") : ""}
            </span>
            <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
              {isFolder ? "DIR" : fileLabel(node.path)}
            </span>
            <span className="truncate">{node.name}</span>
            {isDirty ? (
              <span
                aria-label={`${node.path} has unsaved changes`}
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
            ) : null}
          </button>
          {isFolder && !isCollapsed && childNodes.length > 0
            ? renderTree(childNodes, depth + 1)
            : null}
        </div>
      );
    });

  return (
    <Panel className="hidden w-40 shrink-0 flex-col border-r border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.9)] md:flex lg:w-44 2xl:w-48">
      <div className="border-b border-[hsl(var(--royal-border-soft))] px-3 py-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Project
        </div>
        <div className="mt-1 truncate text-xs text-foreground">
          {projectName ?? "No project yet"}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.54)] p-2 shadow-[0_12px_36px_hsl(0_80%_3%/0.18)]">
          <div className="flex items-center justify-between gap-2 px-1 text-xs font-medium">
            <button
              aria-expanded={expandedSections.projects}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-foreground hover:text-accent"
              onClick={() => toggleSection("projects")}
              type="button"
            >
              <span className="w-2 text-[10px] text-muted-foreground">
                {expandedSections.projects ? "v" : ">"}
              </span>
              <span className="truncate">Projects</span>
            </button>
            <button
              className="rounded-lg border border-accent/35 px-2 py-1 text-[11px] text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              onClick={createProjectFromPrompt}
              type="button"
            >
              New
            </button>
          </div>
          {expandedSections.projects ? (
          <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
            {projects.length === 0 ? (
              <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.34)] px-2 py-3 text-xs leading-5 text-muted-foreground">
                {isLoading ? "Loading projects..." : "Create your first project."}
              </div>
            ) : null}
            {projects.map((project) => {
              const isActive = project.id === projectId;

              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
                    isActive
                      ? "bg-[hsl(var(--gold)/0.11)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.18),0_10px_28px_hsl(var(--gold)/0.08)]"
                      : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised)/0.62)] hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  disabled={isLoading || isActive}
                  key={project.id}
                  onClick={() => {
                    void switchProject(project.id).then(hydrateProjectChat);
                  }}
                  type="button"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground">
                    P
                  </span>
                  <span className="truncate">{project.name}</span>
                </button>
              );
            })}
          </div>
          ) : (
            <div className="mt-2 truncate px-1 text-[11px] text-muted-foreground">
              {projectName ?? "No project selected"}
            </div>
          )}
          {error ? <p className="mt-2 px-1 text-xs leading-5 text-destructive">{error}</p> : null}
        </div>
        <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.54)] p-2 shadow-[0_12px_36px_hsl(0_80%_3%/0.18)]">
          <div className="flex items-center justify-between gap-2 px-1 text-xs font-medium">
            <button
              aria-expanded={expandedSections.workspace}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-foreground hover:text-accent"
              onClick={() => toggleSection("workspace")}
              type="button"
            >
              <span className="w-2 text-[10px] text-muted-foreground">
                {expandedSections.workspace ? "v" : ">"}
              </span>
              <span className="truncate">Workspace</span>
            </button>
            <span className="text-[11px] text-muted-foreground">
              {isLoading ? "..." : visibleFileCount}
            </span>
          </div>
          {expandedSections.workspace ? (
          <>
          <div className="mb-2 mt-2 grid grid-cols-2 gap-1">
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || !projectId}
              onClick={createFileFromPrompt}
              type="button"
            >
              New file
            </button>
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || !projectId}
              onClick={createFolderFromPrompt}
              type="button"
            >
              New folder
            </button>
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || !selectedPath}
              onClick={renameSelectedPath}
              type="button"
            >
              Rename
            </button>
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || !selectedPath}
              onClick={deleteSelectedPath}
              type="button"
            >
              Delete
            </button>
          </div>
          <div className="max-h-[48dvh] space-y-1 overflow-y-auto pr-1">
            {fileTree.length === 0 ? (
              <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.34)] px-2 py-3 text-xs leading-5 text-muted-foreground">
                {isLoading ? "Loading workspace..." : "Create a project to add starter files."}
              </div>
            ) : null}
            {renderTree(fileTree)}
          </div>
          </>
          ) : null}
        </div>
        <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.38)] p-2 shadow-sm">
          <button
            aria-expanded={expandedSections.git}
            className="flex w-full items-center gap-2 text-left text-xs font-medium hover:text-accent"
            onClick={() => toggleSection("git")}
            type="button"
          >
            <span className="w-2 text-[10px] text-muted-foreground">
              {expandedSections.git ? "v" : ">"}
            </span>
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground">
              G
            </span>
            Git
          </button>
          {expandedSections.git ? (
            <div className="mt-2 px-1 text-xs leading-5 text-muted-foreground">Status placeholder</div>
          ) : null}
        </div>
        <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.38)] p-2 shadow-sm">
          <button
            aria-expanded={expandedSections.search}
            className="flex w-full items-center gap-2 text-left text-xs font-medium hover:text-accent"
            onClick={() => toggleSection("search")}
            type="button"
          >
            <span className="w-2 text-[10px] text-muted-foreground">
              {expandedSections.search ? "v" : ">"}
            </span>
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground">
              /
            </span>
            Search
          </button>
          {expandedSections.search ? (
            <div className="mt-2 px-1 text-xs leading-5 text-muted-foreground">
              Project search placeholder
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
