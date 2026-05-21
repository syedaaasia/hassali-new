"use client";

import { motion } from "framer-motion";
import { Panel } from "@/components/ui/panel";
import { PremiumSelect } from "@/components/ui/premium-select";
import { type AiMode, useChatStore } from "@/lib/chat-store";
import { folderPlaceholderFileName, useWorkspaceStore } from "@/lib/workspace-store";

const modelOptions = [
  { label: "GPT-4o mini", value: "openai/gpt-4o-mini" },
  { label: "Claude Haiku", value: "anthropic/claude-3.5-haiku" },
  { label: "Gemini Flash", value: "google/gemini-flash-1.5" }
];

const modes: Array<{ label: AiMode; disabled?: boolean }> = [
  { label: "ASK" },
  { label: "SUGGEST" },
  { label: "EXECUTE", disabled: true }
];

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
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const applyFileContent = useWorkspaceStore((state) => state.applyFileContent);
  const activeFile = files[activePath];
  const visibleFileList = Object.keys(files).filter(
    (path) => !path.endsWith(`/${folderPlaceholderFileName}`)
  );

  const sendWithContext = () =>
    sendMessage({
      activeFileContent: activeFile?.content ?? "",
      activePath,
      chatSessionId,
      fileList: visibleFileList,
      projectId
    });

  const approveProposal = async () => {
    if (!proposal) {
      return;
    }

    for (const change of proposal.changes) {
      await applyFileContent(change.path, change.proposedContent);
    }

    markProposalApproved();
  };

  return (
    <Panel className="hidden w-80 shrink-0 flex-col border-l border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.9)] lg:flex 2xl:w-96">
      <div className="border-b border-[hsl(var(--royal-border-soft))] px-4 py-3.5">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Assistant
        </div>
        <div className="mt-1 text-xs text-foreground">Quiet pair programmer</div>
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
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto scroll-smooth p-3.5">
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
                  <div className="font-medium text-foreground">Diff proposal</div>
                  <div className="mt-1 text-muted-foreground">{proposal.summary}</div>
                </div>
                <span className="rounded-full border border-[hsl(var(--royal-border))] px-2 py-1 text-[10px] text-accent">
                  pending
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {proposal.changes.map((change) => (
                  <div
                    className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.42)] p-3"
                    key={`${proposal.id}-${change.path}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-foreground">{change.path}</span>
                      <span className="rounded-full border border-[hsl(var(--royal-border-soft))] px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {change.action}
                      </span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{change.summary}</p>
                    <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--royal-border-soft))] bg-black/35 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                      {change.diffPreview}
                    </pre>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  className="rounded-xl border border-[hsl(var(--royal-border-soft))] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearProposal}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="rounded-xl border border-accent/35 bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground shadow-[0_12px_30px_hsl(var(--accent)/0.18)] hover:opacity-90"
                  onClick={() => {
                    void approveProposal();
                  }}
                  type="button"
                >
                  Approve
                </button>
              </div>
            </motion.div>
          ) : null}
        </div>

        <form
          className="border-t border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.82)] p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendWithContext();
          }}
        >
          <textarea
            className="min-h-24 w-full resize-none rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.48)] p-3.5 text-[12.5px] leading-5 text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_16px_44px_hsl(0_80%_3%/0.26)] outline-none placeholder:text-muted-foreground focus:border-accent/55 focus:ring-2 focus:ring-accent/10"
            onChange={(event) =>
              setInput((event.currentTarget as unknown as { value: string }).value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendWithContext();
              }
            }}
            placeholder={mode === "SUGGEST" ? "Describe the change to propose..." : "Ask Hassali..."}
            value={input}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {isStreaming ? "Streaming response..." : `${mode} mode`}
            </span>
            <button
              className="rounded-xl border border-accent/35 bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground shadow-[0_14px_34px_hsl(var(--accent)/0.18)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isStreaming || input.trim().length === 0 || mode === "EXECUTE"}
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
