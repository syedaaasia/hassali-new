"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { PremiumSelect } from "@/components/ui/premium-select";
import { type AiMode, type ChatMessage, type DiffProposal, useChatStore } from "@/lib/chat-store";
import { useRuntimeStore } from "@/lib/runtime-store";
import { folderPlaceholderFileName, useWorkspaceStore } from "@/lib/workspace-store";

const modelOptions = [
  { label: "GPT-4o mini", value: "openai/gpt-4o-mini" },
  { label: "Claude Haiku", value: "anthropic/claude-3.5-haiku" },
  { label: "Gemini Flash", value: "google/gemini-flash-1.5" }
];

const modes: Array<{ label: AiMode; disabled?: boolean }> = [
  { label: "ASK" },
  { label: "SUGGEST" },
  { label: "EXECUTE" }
];

const modeHints: Record<AiMode, string> = {
  ASK: "Answer only. No preview or runtime actions.",
  SUGGEST: "Review proposed file changes before anything mutates.",
  EXECUTE: "Approve safe file and preview actions before they run."
};
const blockedRegenerationLimit = 2;
const manualReviewNeededMessage =
  "Manual review needed \u2014 Hassali has blocked multiple regenerated proposals. Please adjust the request or inspect the project files.";

const manualReviewGuidance = [
  "Check the correct project is selected.",
  "Inspect selected project files before retrying.",
  "Simplify the request.",
  "Restate exact pages, colors, and style.",
  'Ask Hassali: "Explain why this proposal was blocked and what I should change."',
  "Reject the proposal and manually rewrite the request if needed."
];

function isFileProposalAction(action: string) {
  return action === "create" || action === "update";
}

function isBlockedProposal(proposal: DiffProposal) {
  return proposal.proposalRoutingMode === "blocked" || proposal.shouldBlockExecution === true;
}

function blockedProposalReasons(proposal: DiffProposal) {
  return (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .map((reason) => reason.message);
}

function blockedProposalWarnings(proposal: DiffProposal) {
  return (proposal.proposalRoutingWarnings ?? []).map((warning) => warning.message);
}

function formatPromptList(items: string[], fallback: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function extractOriginalRequest(content: string) {
  const match = content.match(/Original request:\s*\n([\s\S]*?)\n\nPrevious proposal was blocked because:/);

  return match?.[1]?.trim() || content;
}

function getLatestOriginalRequest(messages: ChatMessage[]) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return extractOriginalRequest(latestUserMessage) || "the original request in this chat";
}

function createSaferProposalPrompt(proposal: DiffProposal, originalRequest: string) {
  const reasons = blockedProposalReasons(proposal);
  const warnings = blockedProposalWarnings(proposal);

  return `Please regenerate a safer proposal.

Original request:
${originalRequest}

Previous proposal was blocked because:
${formatPromptList(reasons, proposal.summary)}

Warnings:
${formatPromptList(warnings, "No additional warnings were provided.")}

Required corrections:
- preserve approval-first safety
- avoid welcome.ts pollution
- preserve selected project isolation
- match the original business/domain
- match requested page count
- match requested colors
- match requested visual style
- avoid developer/coder fallback unless user explicitly asked for a developer/coder website
- avoid overgeneration
- avoid blank files

Required preservation rules:
- do not simplify away requested pages
- do not change the business type
- do not ignore the theme/colors
- do not change execution behavior
- produce a normal proposal only after risks are corrected

Return a corrected proposal that keeps the original request intact and fixes the blocked risks.`;
}

function getProposalReviewState(proposal: DiffProposal) {
  if (isBlockedProposal(proposal)) {
    return {
      badge: "Blocked / Unsafe to Execute",
      className:
        "border-red-500/35 bg-red-500/10 text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.12)]",
      message: "AI marked this proposal as unsafe or mismatched. Do not approve unless corrected."
    };
  }

  if (proposal.proposalRoutingMode === "review_required" || proposal.requiresExtraReview) {
    return {
      badge: "Needs Review",
      className:
        "border-amber-400/35 bg-amber-400/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.1)]",
      message: "AI found possible risks. Please review carefully before approving."
    };
  }

  return {
    badge: "Normal",
    className:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.1)]",
    message: "AI safety check passed. Review the proposal before approving."
  };
}

function ProposalReviewState({ proposal }: { proposal: DiffProposal }) {
  const reviewState = getProposalReviewState(proposal);
  const warnings = proposal.proposalRoutingWarnings ?? [];
  const visibleReasons = (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .slice(0, 3);

  return (
    <div className="mt-3 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.28)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${reviewState.className}`}>
          {reviewState.badge}
        </span>
        <span className="text-[11px] leading-5 text-muted-foreground">{reviewState.message}</span>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {warnings.slice(0, 4).map((warning) => (
            <div className="text-[11px] leading-5 text-muted-foreground" key={warning.code}>
              <span className={warning.risk === "high" ? "text-red-200" : "text-amber-100"}>
                {warning.risk === "high" ? "High" : "Review"}:
              </span>{" "}
              {warning.message}
            </div>
          ))}
        </div>
      ) : null}

      {visibleReasons.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {visibleReasons.map((reason) => (
            <div className="text-[11px] leading-5 text-muted-foreground" key={`${reason.code}-${reason.message}`}>
              {reason.message}
            </div>
          ))}
        </div>
      ) : null}

      {proposal.intelligenceKernelSummary ? (
        <details className="mt-3 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer text-foreground/80">Intelligence summary</summary>
          <p className="mt-2 leading-5">{proposal.intelligenceKernelSummary}</p>
        </details>
      ) : null}
    </div>
  );
}

function ManualReviewNotice({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-[11px] leading-5 text-red-100">
      <div>{message}</div>
      <div className="mt-2 font-medium text-red-50">Try this next:</div>
      <ol className="mt-1 list-decimal space-y-1 pl-4 text-red-100/90">
        {manualReviewGuidance.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

export function RightSidebar() {
  const messages = useChatStore((state) => state.messages);
  const input = useChatStore((state) => state.input);
  const model = useChatStore((state) => state.model);
  const mode = useChatStore((state) => state.mode);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const proposal = useChatStore((state) => state.proposal);
  const chatSessionId = useChatStore((state) => state.chatSessionId);
  const setInput = useChatStore((state) => state.setInput);
  const setModel = useChatStore((state) => state.setModel);
  const setMode = useChatStore((state) => state.setMode);
  const clearProposal = useChatStore((state) => state.clearProposal);
  const markProposalApproved = useChatStore((state) => state.markProposalApproved);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const isPreviewOpen = useRuntimeStore((state) => state.isPreviewOpen);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const togglePreview = useRuntimeStore((state) => state.togglePreview);
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const applyFileContent = useWorkspaceStore((state) => state.applyFileContent);
  const setWorkspaceError = useWorkspaceStore((state) => state.setError);
  const activeFile = files[activePath];
  const visibleFileList = Object.keys(files).filter(
    (path) => !path.endsWith(`/${folderPlaceholderFileName}`)
  );
  const isApprovalBlocked = proposal ? isBlockedProposal(proposal) : false;
  const regenerationInFlightRef = useRef(false);
  const [blockedRegenerationAttempts, setBlockedRegenerationAttempts] = useState(0);
  const [manualReviewMessage, setManualReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!proposal) {
      if (!regenerationInFlightRef.current) {
        setBlockedRegenerationAttempts(0);
        setManualReviewMessage(null);
      }

      return;
    }

    if (!isBlockedProposal(proposal)) {
      regenerationInFlightRef.current = false;
      setBlockedRegenerationAttempts(0);
      setManualReviewMessage(null);
      return;
    }

    regenerationInFlightRef.current = false;
  }, [proposal]);

  const createWorkspaceContext = () => ({
    activeFileContent: activeFile?.content ?? "",
    activePath,
    chatSessionId,
    fileContents: Object.fromEntries(
      visibleFileList.map((path) => [path, files[path]?.content ?? ""])
    ),
    fileList: visibleFileList,
    projectId,
    projectName
  });

  const sendWithContext = () => sendMessage(createWorkspaceContext());

  const rejectAndRequestSaferProposal = () => {
    if (!proposal || !isBlockedProposal(proposal)) {
      return;
    }

    if (blockedRegenerationAttempts >= blockedRegenerationLimit) {
      setManualReviewMessage(manualReviewNeededMessage);
      return;
    }

    const followUpPrompt = createSaferProposalPrompt(proposal, getLatestOriginalRequest(messages));

    regenerationInFlightRef.current = true;
    setBlockedRegenerationAttempts((attempts) => attempts + 1);
    setManualReviewMessage(null);
    clearProposal();
    setInput(followUpPrompt);
    void sendMessage(createWorkspaceContext());
  };

  const approveProposal = async () => {
    if (!proposal) {
      return;
    }

    if (isBlockedProposal(proposal)) {
      setWorkspaceError("This proposal was marked unsafe. Reject it and ask Hassali to recreate a safer proposal.");
      return;
    }

    if (proposal.projectId !== projectId) {
      setWorkspaceError("This proposal belongs to another project. Recreate it for the current project.");
      clearProposal();
      return;
    }

    for (const change of proposal.changes) {
      if (
        isFileProposalAction(change.action) &&
        change.path &&
        typeof change.proposedContent === "string"
      ) {
        await applyFileContent(change.path, change.proposedContent, proposal.projectId);
      }
    }

    for (const change of proposal.changes) {
      if (change.action === "restart_runtime") {
        await startPreview(proposal.projectId);
      } else if (change.action === "reload_preview") {
        await syncPreview(proposal.projectId);
      } else if (change.action === "stop_runtime") {
        await stopPreview();
      }
    }

    markProposalApproved();
  };

  return (
    <Panel className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--royal-surface)/0.92)]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--royal-border-soft))] px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Assistant
          </div>
          <div className="mt-1 truncate text-xs text-foreground">Quiet operating surface</div>
        </div>
        {mode !== "ASK" ? (
          <button
            className="shrink-0 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.38)] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent/35 hover:text-foreground"
            onClick={togglePreview}
            type="button"
          >
            {isPreviewOpen ? "Hide preview" : "Preview"}
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-[hsl(var(--royal-border-soft))] p-3.5">
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.45)] p-1">
            {modes.map((item) => {
              const isActive = item.label === mode;

              return (
                <button
                  className={`rounded-xl px-2 py-1.5 text-[11px] font-medium ${
                    isActive
                      ? "bg-[hsl(var(--accent)/0.16)] text-foreground shadow-[0_0_18px_hsl(var(--accent)/0.18)]"
                      : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised)/0.52)] hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                  disabled={item.disabled}
                  key={item.label}
                  onClick={() => setMode(item.label)}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <PremiumSelect
            compact
            label="Model"
            onChange={setModel}
            options={modelOptions}
            value={model}
          />
          <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.28)] px-3 py-2 text-xs leading-5 text-muted-foreground">
            {modeHints[mode]}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto scroll-smooth p-4 lg:p-5">
          {messages.map((message) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 4 }}
              key={message.id}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={`rounded-xl border px-3.5 py-3 text-[12.5px] leading-5 shadow-sm ${
                message.role === "user"
                  ? "ml-6 border-[hsl(var(--royal-border))] bg-[hsl(var(--gold)/0.1)] text-foreground shadow-[0_16px_42px_hsl(var(--gold)/0.08)]"
                  : "mr-6 border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.62)] text-muted-foreground"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 font-medium text-foreground">
                <span>{message.role === "user" ? "You" : "Hassali"}</span>
                {message.role === "assistant" && isStreaming && message.content.length === 0 ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_16px_hsl(var(--accent)/0.65)]" />
                ) : null}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {message.content || "Thinking quietly..."}
              </div>
            </motion.div>
          ))}
          {proposal ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-panel)/0.72)] p-3.5 text-xs shadow-[0_18px_46px_hsl(var(--accent)/0.12)]"
              initial={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">
                    {proposal.mode === "EXECUTE" ? "Execution proposal" : "Diff proposal"}
                  </div>
                  <div className="mt-1 text-muted-foreground">{proposal.summary}</div>
                  {proposal.mode === "EXECUTE" ? (
                    <div className="mt-1 text-[11px] text-accent">
                      Approval is required before any file or preview action runs.
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full border border-[hsl(var(--royal-border))] px-2 py-1 text-[10px] text-accent">
                  pending
                </span>
              </div>
              <ProposalReviewState proposal={proposal} />

              <div className="mt-3 space-y-3">
                {proposal.changes.map((change) => (
                  <div
                    className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.42)] p-3"
                    key={`${proposal.id}-${change.action}-${change.path ?? change.summary}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-foreground">
                        {change.path ?? "preview runtime"}
                      </span>
                      <span className="rounded-full border border-[hsl(var(--royal-border-soft))] px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {change.action}
                      </span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{change.summary}</p>
                    {change.diffPreview ? (
                      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--royal-border-soft))] bg-black/35 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                        {change.diffPreview}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>

              {manualReviewMessage ? <ManualReviewNotice message={manualReviewMessage} /> : null}

              <div className="mt-3 flex items-center justify-end gap-2">
                {isApprovalBlocked ? (
                  <button
                    className="rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:border-red-300/45 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isStreaming}
                    onClick={rejectAndRequestSaferProposal}
                    type="button"
                  >
                    Reject and ask for safer proposal
                  </button>
                ) : null}
                <button
                  className="rounded-xl border border-[hsl(var(--royal-border-soft))] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearProposal}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="rounded-xl border border-accent/35 bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground shadow-[0_12px_30px_hsl(var(--accent)/0.18)] hover:opacity-90 disabled:cursor-not-allowed disabled:border-red-500/20 disabled:bg-red-500/10 disabled:text-red-200/60 disabled:shadow-none disabled:hover:opacity-100"
                  disabled={isApprovalBlocked}
                  onClick={() => {
                    void approveProposal();
                  }}
                  type="button"
                >
                  {isApprovalBlocked ? "Approval blocked" : "Approve"}
                </button>
              </div>
            </motion.div>
          ) : null}
        </div>

        <form
          className="shrink-0 border-t border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.82)] p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendWithContext();
          }}
        >
          <textarea
            className="max-h-40 min-h-20 w-full resize-none rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.48)] p-3.5 text-[12.5px] leading-5 text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_16px_44px_hsl(0_80%_3%/0.26)] outline-none placeholder:text-muted-foreground focus:border-accent/55 focus:ring-2 focus:ring-accent/10"
            onChange={(event) =>
              setInput((event.currentTarget as unknown as { value: string }).value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendWithContext();
              }
            }}
            placeholder={
              mode === "EXECUTE"
                ? "Describe the safe file or preview task..."
                : mode === "SUGGEST"
                  ? "Describe the change to propose..."
                  : "Ask Hassali..."
            }
            value={input}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {isStreaming ? "Streaming response..." : `${mode} mode`}
            </span>
            <button
              className="rounded-xl border border-accent/35 bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground shadow-[0_14px_34px_hsl(var(--accent)/0.18)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isStreaming || input.trim().length === 0}
              type="submit"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </Panel>
  );
}
