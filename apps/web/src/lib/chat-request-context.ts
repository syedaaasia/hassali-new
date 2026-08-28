import { resolveAskSummaryTarget } from "./ask-summary-target";

export type ChatRequestProductMode = "ASK" | "CODE" | "WEBSITE";

export type ChatRequestWorkspace = {
  activeFileContent: string;
  activePath: string;
  fileContents: Record<string, string>;
  fileList: string[];
  projectName: string | null;
};

export type ChatRequestConversationMessage = {
  content: string;
  role?: string;
};

const ASK_FILE_LIST_LIMIT = 600;
const ASK_FILE_CONTENT_LIMIT = 12_000;
const IMPORTANT_CONTEXT_FILES = new Set([
  "hassali.md",
  "hassali.code.md",
  "hassali.website.md",
  "package.json",
  "readme.md",
  "roadmap.md"
]);

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, "/");
}

function hasLocalContextSignal(prompt: string) {
  return /\b(?:active file|current (?:app|application|architecture|codebase|file|implementation|project|repo(?:sitory)?|site|website|workspace)|existing (?:app|application|project|site|website)|my (?:app|application|code|codebase|files?|project|repo(?:sitory)?|site|website|workspace)|this (?:app|application|code|codebase|file|function|implementation|project|repo(?:sitory)?|site|website|workspace)|which file)\b/i.test(prompt) ||
    /\b(?:from|in|inside|within) the (?:codebase|repo(?:sitory)?|workspace)\b/i.test(prompt) ||
    /\bwhere (?:is|are|does|do)\b[\s\S]{0,80}\b(?:defined|implemented|live|located|stored)\b/i.test(prompt);
}

function referencesActiveContext(prompt: string) {
  return /\b(?:debug|explain|fix|review|summarize|walk me through)\s+(?:it|this)\b/i.test(prompt) ||
    /\bwhat does (?:it|this|this (?:code|file|function)) do\b/i.test(prompt);
}

function isContextContinuation(prompt: string) {
  return /\b(?:and (?:it|this|that)|continue|do next|it|next|same (?:app|file|project|site)|that|this)\b/i.test(prompt);
}

function priorConversationHasLocalContext(
  messages: ChatRequestConversationMessage[] | undefined,
  prompt: string
) {
  const prior = [...(messages ?? [])];
  const latest = prior.at(-1);
  if (latest?.role === "user" && latest.content.trim() === prompt.trim()) {
    prior.pop();
  }
  return prior.slice(-6).some((message) => hasLocalContextSignal(message.content));
}

export function isSensitiveWorkspacePath(value: string) {
  const normalized = normalizePath(value).toLowerCase();
  const basename = normalized.split("/").at(-1) ?? normalized;
  return basename === ".env" ||
    basename.startsWith(".env.") ||
    basename === ".envrc" ||
    basename === ".netrc" ||
    basename === ".npmrc" ||
    basename === ".pypirc" ||
    /^id_(?:dsa|ecdsa|ed25519|rsa)$/.test(basename) ||
    /^(?:application_default_credentials|client_secret[^/]*|service[-_]account[^/]*)\.json$/.test(basename) ||
    /^firebase-adminsdk[^/]*\.json$/.test(basename) ||
    /\.(?:key|p12|pfx|pem)$/i.test(basename) ||
    /(?:^|\/)\.docker\/config\.json$/i.test(normalized) ||
    /(?:^|\/)\.kube\/config$/i.test(normalized) ||
    /(?:^|\/)\.ssh\/[^/]+$/i.test(normalized) ||
    /(?:^|\/)(?:credentials?|secrets?)(?:[./_-]|$)/i.test(normalized);
}

export function requestNeedsWorkspaceContext(
  prompt: string,
  mode: ChatRequestProductMode,
  context?: {
    activePath?: string;
    fileList?: string[];
    messages?: ChatRequestConversationMessage[];
    projectName?: string | null;
  }
) {
  if (mode !== "ASK") return true;

  if (resolveAskSummaryTarget(prompt, {
    artifactTargetAvailable: Boolean(context?.activePath),
    hasConversationContext: (context?.messages?.length ?? 0) > 1
  }) === "artifact") return true;
  if (hasLocalContextSignal(prompt)) return true;
  if (context?.activePath && referencesActiveContext(prompt)) return true;

  const normalizedPrompt = prompt.toLowerCase();
  const projectName = context?.projectName?.trim().toLowerCase() ?? "";
  if (projectName.length >= 5 && normalizedPrompt.includes(projectName)) {
    return true;
  }
  if ((context?.fileList ?? []).some((path) => {
    const normalized = normalizePath(path).toLowerCase();
    const basename = normalized.split("/").at(-1) ?? normalized;
    return normalizedPrompt.includes(normalized) || normalizedPrompt.includes(basename);
  })) {
    return true;
  }
  return isContextContinuation(prompt) &&
    priorConversationHasLocalContext(context?.messages, prompt);
}

function referencedPaths(prompt: string, fileList: string[]) {
  const normalizedPrompt = prompt.toLowerCase();
  return fileList.filter((path) => {
    const normalized = normalizePath(path);
    const basename = normalized.split("/").at(-1) ?? normalized;
    return normalizedPrompt.includes(normalized.toLowerCase()) || normalizedPrompt.includes(basename.toLowerCase());
  });
}

function boundedFileContent(value: string | undefined) {
  return (value ?? "").slice(0, ASK_FILE_CONTENT_LIMIT);
}

export function selectWorkspaceContentPaths(input: {
  messages?: ChatRequestConversationMessage[];
  mode: ChatRequestProductMode;
  prompt: string;
  workspace: Pick<ChatRequestWorkspace, "activePath" | "fileList" | "projectName">;
}) {
  const normalizedFileList = Array.from(new Set(
    input.workspace.fileList.map(normalizePath).filter(Boolean)
  ));
  if (input.mode !== "ASK") return normalizedFileList;
  if (!requestNeedsWorkspaceContext(input.prompt, input.mode, {
    activePath: input.workspace.activePath,
    fileList: normalizedFileList,
    messages: input.messages,
    projectName: input.workspace.projectName
  })) {
    return [];
  }

  return Array.from(new Set([
    normalizePath(input.workspace.activePath),
    ...referencedPaths(input.prompt, normalizedFileList),
    ...normalizedFileList.filter((path) =>
      IMPORTANT_CONTEXT_FILES.has((path.split("/").at(-1) ?? path).toLowerCase())
    )
  ].filter((path) => Boolean(path) && !isSensitiveWorkspacePath(path)))).slice(0, 16);
}

export function compactWorkspaceForChatRequest(input: {
  messages?: ChatRequestConversationMessage[];
  mode: ChatRequestProductMode;
  prompt: string;
  workspace: ChatRequestWorkspace;
}): ChatRequestWorkspace {
  if (input.mode !== "ASK") return input.workspace;
  if (!requestNeedsWorkspaceContext(input.prompt, input.mode, {
    activePath: input.workspace.activePath,
    fileList: input.workspace.fileList,
    messages: input.messages,
    projectName: input.workspace.projectName
  })) {
    return {
      activeFileContent: "",
      activePath: "",
      fileContents: {},
      fileList: [],
      projectName: null
    };
  }

  const normalizedFileList = Array.from(new Set(input.workspace.fileList.map(normalizePath).filter(Boolean)));
  const normalizedFileContents = Object.fromEntries(
    Object.entries(input.workspace.fileContents).map(([path, content]) => [normalizePath(path), content])
  );
  const selectedPaths = selectWorkspaceContentPaths({
    messages: input.messages,
    mode: input.mode,
    prompt: input.prompt,
    workspace: {
      activePath: input.workspace.activePath,
      fileList: normalizedFileList,
      projectName: input.workspace.projectName
    }
  });
  const selectedContents = Object.fromEntries(
    selectedPaths
      .map((path) => [path, boundedFileContent(normalizedFileContents[path])] as const)
      .filter(([, content]) => content.length > 0)
  );

  return {
    activeFileContent: isSensitiveWorkspacePath(input.workspace.activePath)
      ? ""
      : boundedFileContent(
          input.workspace.activeFileContent || selectedContents[normalizePath(input.workspace.activePath)]
        ),
    activePath: normalizePath(input.workspace.activePath),
    fileContents: selectedContents,
    fileList: Array.from(new Set([
      ...selectedPaths,
      ...normalizedFileList
    ])).slice(0, ASK_FILE_LIST_LIMIT),
    projectName: input.workspace.projectName
  };
}

export function serializedWorkspaceBytes(workspace: ChatRequestWorkspace) {
  return new TextEncoder().encode(JSON.stringify(workspace)).byteLength;
}

export function removeCancelledRequestTurn<T extends { id: string }>(
  messages: T[],
  userMessageId: string,
  assistantMessageId: string
) {
  return messages.filter(
    (message) => message.id !== userMessageId && message.id !== assistantMessageId
  );
}
