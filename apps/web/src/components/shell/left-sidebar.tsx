"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
type SidebarSection = "git" | "projects" | "workspace";
type ProjectSearchResult = {
  kind: "chat" | "message" | "project";
  messageId: string | null;
  projectId: string;
  projectName: string;
  role: "assistant" | "user" | null;
  sessionId: string | null;
  sessionTitle: string | null;
  snippet: string;
  updatedAt: string;
};
type LeftSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

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

  try {
    return prompt?.(message, defaultValue)?.trim() ?? null;
  } catch {
    return defaultValue.trim() || null;
  }
}

function confirmAction(message: string) {
  const confirm = (globalThis as DialogGlobal).confirm;

  return confirm ? confirm(message) : false;
}

export function LeftSidebar({ collapsed, onToggleCollapsed }: LeftSidebarProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [expandedSections, setExpandedSections] = useState<Record<SidebarSection, boolean>>({
    git: false,
    projects: false,
    workspace: true
  });
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectSearchResult[]>([]);
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

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      fetch(`/api/workspace/search?q=${encodeURIComponent(searchQuery.trim())}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Project search is unavailable.");
          const payload = await response.json() as { results?: ProjectSearchResult[] };
          setSearchResults(Array.isArray(payload.results) ? payload.results : []);
        })
        .catch((caught) => {
          if (!controller.signal.aborted) setSearchError(caught instanceof Error ? caught.message : "Project search is unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchOpen, searchQuery]);

  const hydrateProjectChat = (payload: Awaited<ReturnType<typeof createProject>>) => {
    if (payload) {
      setSelectedNode(null);
      hydrateChat(payload.chat.messages, payload.chat.sessionId);
    }
  };
  const openSearchResult = (result: ProjectSearchResult) => {
    void switchProject(result.projectId, result.sessionId).then((payload) => {
      hydrateProjectChat(payload);
      if (payload) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    });
  };
  const createProjectFromPrompt = () => {
    const requestedName = promptValue("Project name", "");
    const projectNameFromPrompt =
      requestedName && requestedName.length > 0 ? requestedName : nextProjectName;

    void createProject(projectNameFromPrompt).then(hydrateProjectChat);
  };
  const createProjectChat = async () => {
    if (!projectId || isLoading) return;
    setSearchError(null);
    try {
      const response = await fetch("/api/workspace/chat", {
        body: JSON.stringify({ projectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!response.ok) throw new Error("New chat could not be created.");
      const payload = await response.json() as { sessionId?: unknown };
      if (typeof payload.sessionId !== "string") throw new Error("New chat could not be created.");
      hydrateChat([], payload.sessionId);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "New chat could not be created.");
    }
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
                ? "bg-[hsl(var(--premium-accent)/0.15)] text-[hsl(var(--premium-paper))] shadow-[inset_0_0_0_1px_hsl(var(--premium-accent)/0.24)]"
                : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground"
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
              <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-[hsl(var(--premium-accent))]" />
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
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--premium-accent))]"
              />
            ) : null}
          </button>
          {isFolder && !isCollapsed && childNodes.length > 0
            ? renderTree(childNodes, depth + 1)
            : null}
        </div>
      );
    });

  if (collapsed) {
    return (
      <Panel className="hidden w-14 shrink-0 flex-col items-center rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.72)] py-2 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl [.light_&]:bg-white md:flex">
        <button
          aria-label="Open sidebar"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] p-1 hover:border-[hsl(var(--premium-accent)/0.5)]"
          onClick={onToggleCollapsed}
          type="button"
        >
          <Image
            alt="Hassali.ai"
            className="h-8 w-8 object-contain"
            height={32}
            src="/apple-icon.png"
            width={32}
          />
        </button>
        <div className="mt-4 flex flex-1 flex-col items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[10px] text-muted-foreground">
            P
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[10px] text-muted-foreground">
            F
          </span>
        </div>
        <button
          aria-label="Expand project sidebar"
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs text-muted-foreground hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-foreground"
          onClick={onToggleCollapsed}
          type="button"
        >
          &gt;
        </button>
      </Panel>
    );
  }

  return (
    <Panel className="hidden w-[17rem] shrink-0 flex-col rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.74)] shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl [.light_&]:bg-white md:flex">
      <div className="relative border-b border-[hsl(var(--premium-border))] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground [.light_&]:text-[#4b403a]">
              Project
            </div>
            <button
              aria-label="Search projects and chats"
              aria-expanded={searchOpen}
              className="hassali-focus-ring flex h-7 w-7 items-center justify-center rounded-md text-base text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              onClick={() => setSearchOpen((current) => !current)}
              title="Search projects and chats"
              type="button"
            >
              <span aria-hidden="true">⌕</span>
            </button>
            <button
              aria-label="Start a new chat in this project"
              className="hassali-focus-ring flex h-7 w-7 items-center justify-center rounded-md text-base text-muted-foreground hover:bg-white/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!projectId || isLoading}
              onClick={() => void createProjectChat()}
              title="New project chat"
              type="button"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <button
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-xs text-muted-foreground hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-foreground [.light_&]:border-[#d8d1c6] [.light_&]:bg-white [.light_&]:text-[#000000]"
            onClick={onToggleCollapsed}
            type="button"
          >
            &lt;
          </button>
        </div>
        <div className="mt-1 truncate text-xs text-foreground">
          {projectName ?? "No project yet"}
        </div>
        {searchOpen ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/25 shadow-xl backdrop-blur-xl [.light_&]:bg-white/90">
            <input
              aria-label="Search project names, chat titles, and messages"
              autoFocus
              className="hassali-focus-ring h-9 w-full border-0 bg-transparent px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setSearchQuery((event.currentTarget as unknown as { value: string }).value)}
              onKeyDown={(event) => {
                if ((event as unknown as { key: string }).key === "Escape") setSearchOpen(false);
                if ((event as unknown as { key: string }).key === "Enter" && searchResults[0]) openSearchResult(searchResults[0]);
              }}
              placeholder="Search projects and chats..."
              value={searchQuery}
            />
            {searchQuery.trim().length >= 2 ? (
              <div className="max-h-64 overflow-y-auto border-t border-white/10 p-1.5">
                {searchLoading ? <p className="px-2 py-3 text-xs text-muted-foreground">Searching...</p> : null}
                {!searchLoading && searchError ? <p className="px-2 py-3 text-xs text-rose-300">{searchError}</p> : null}
                {!searchLoading && !searchError && searchResults.length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">No matching projects or chats.</p> : null}
                {searchResults.map((result) => (
                  <button
                    className="hassali-focus-ring block w-full rounded-md px-2 py-2 text-left hover:bg-white/[0.06]"
                    key={`${result.kind}:${result.messageId ?? result.sessionId ?? result.projectId}`}
                    onClick={() => openSearchResult(result)}
                    type="button"
                  >
                    <span className="block truncate text-xs font-medium text-foreground">{result.projectName}</span>
                    <span className="mt-0.5 block text-[10px] uppercase text-muted-foreground">{result.kind}{result.sessionTitle ? ` · ${result.sessionTitle}` : ""}</span>
                    <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">{result.snippet}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        <section className="border-b border-white/[0.06] px-1 pb-3 pt-1">
          <div className="flex items-center justify-between gap-2 px-1 text-xs font-medium">
            <button
              aria-expanded={expandedSections.projects}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-foreground hover:text-[hsl(var(--premium-accent-soft))]"
              onClick={() => toggleSection("projects")}
              type="button"
            >
              <span className="w-2 text-[10px] text-muted-foreground">
                {expandedSections.projects ? "v" : ">"}
              </span>
              <span className="truncate">Projects</span>
            </button>
            <button
              className="rounded-full border border-[hsl(var(--premium-accent)/0.35)] px-2.5 py-1 text-[11px] text-[hsl(var(--premium-accent-soft))] hover:bg-[hsl(var(--premium-accent)/0.1)] disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:border-[#DE7356] [.light_&]:text-[#000000] [.light_&]:hover:bg-[#DE7356]/10"
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
                      ? "bg-[hsl(var(--premium-accent)/0.15)] text-[hsl(var(--premium-paper))] shadow-[inset_0_0_0_1px_hsl(var(--premium-accent)/0.24)] [.light_&]:text-[#000000]"
                      : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground [.light_&]:text-[#2f2a27] [.light_&]:hover:bg-white [.light_&]:hover:text-[#000000]"
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
        </section>
        <section className="border-b border-white/[0.06] px-1 pb-3 pt-1">
          <div className="flex items-center justify-between gap-2 px-1 text-xs font-medium">
            <button
              aria-expanded={expandedSections.workspace}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-foreground hover:text-[hsl(var(--premium-accent-soft))]"
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
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:border-[#d8d1c6] [.light_&]:text-[#000000] [.light_&]:hover:border-[#DE7356]"
              disabled={isLoading || !projectId}
              onClick={createFileFromPrompt}
              type="button"
            >
              New file
            </button>
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:border-[#d8d1c6] [.light_&]:text-[#000000] [.light_&]:hover:border-[#DE7356]"
              disabled={isLoading || !projectId}
              onClick={createFolderFromPrompt}
              type="button"
            >
              New folder
            </button>
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:border-[#d8d1c6] [.light_&]:text-[#000000] [.light_&]:hover:border-[#DE7356]"
              disabled={isLoading || !selectedPath}
              onClick={renameSelectedPath}
              type="button"
            >
              Rename
            </button>
            <button
              className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:border-[#d8d1c6] [.light_&]:text-[#000000] [.light_&]:hover:border-[#DE7356]"
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
        </section>
        <section className="mt-auto border-t border-white/[0.06] px-1 py-3">
          <button
            aria-expanded={expandedSections.git}
            className="flex w-full items-center gap-2 text-left text-xs font-medium hover:text-[hsl(var(--premium-accent-soft))]"
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
        </section>
      </div>
    </Panel>
  );
}
