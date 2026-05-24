"use client";

import { create } from "zustand";

export type ChatRole = "user" | "assistant";
export type AiMode = "ASK" | "SUGGEST" | "EXECUTE";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type WorkspaceContext = {
  activeFileContent: string;
  activePath: string;
  chatSessionId: string | null;
  fileList: string[];
  projectId: string | null;
};

export type DiffProposal = {
  id: string;
  mode: "SUGGEST" | "EXECUTE";
  status: "pending" | "approved" | "rejected";
  summary: string;
  changes: Array<{
    action: "create" | "restart_runtime" | "reload_preview" | "stop_runtime" | "update";
    path?: string;
    summary: string;
    proposedContent?: string;
    diffPreview?: string;
  }>;
};

type ChatState = {
  messages: ChatMessage[];
  input: string;
  model: string;
  mode: AiMode;
  isStreaming: boolean;
  proposal: DiffProposal | null;
  chatSessionId: string | null;
  hydrateChat: (
    messages: Array<{
      content: string;
      id: string;
      mode?: AiMode;
      role: ChatRole;
    }>,
    sessionId: string | null
  ) => void;
  setInput: (input: string) => void;
  setModel: (model: string) => void;
  setMode: (mode: AiMode) => void;
  clearProposal: () => void;
  markProposalApproved: () => void;
  sendMessage: (workspaceContext: WorkspaceContext) => Promise<void>;
};

const defaultModel = "openai/gpt-4o-mini";
const proposalMarker = "HASSALI_DIFF_PROPOSAL:";

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content
  };
}

function createGreetingMessage() {
  return createMessage(
    "assistant",
    "Tell me what you want to build or understand. I will keep the response focused and careful."
  );
}

function normalizeHydratedMessages(
  messages: Array<{
    content: string;
    id: string;
    mode?: AiMode;
    role: ChatRole;
  }>
) {
  return messages
    .filter(
      (message) =>
        typeof message.id === "string" &&
        typeof message.content === "string" &&
        (message.role === "user" || message.role === "assistant")
    )
    .map((message) => ({
      content: message.content,
      id: message.id,
      role: message.role
    }));
}

function isDiffProposal(value: unknown): value is DiffProposal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const proposal = value as DiffProposal;

  return (
    typeof proposal.id === "string" &&
    typeof proposal.summary === "string" &&
    Array.isArray(proposal.changes) &&
    proposal.changes.every(
      (change) => {
        if (!change || typeof change !== "object" || typeof change.summary !== "string") {
          return false;
        }

        if (change.action === "restart_runtime" || change.action === "reload_preview" || change.action === "stop_runtime") {
          return true;
        }

        return (
          (change.action === "create" || change.action === "update") &&
          typeof change.path === "string" &&
          typeof change.proposedContent === "string" &&
          (typeof change.diffPreview === "undefined" || typeof change.diffPreview === "string")
        );
      }
    )
  );
}

function parseDiffProposal(content: string) {
  if (!content.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;

    return isDiffProposal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [createGreetingMessage()],
  input: "",
  model: defaultModel,
  mode: "ASK",
  isStreaming: false,
  proposal: null,
  chatSessionId: null,
  hydrateChat: (messages, sessionId) => {
    const hydratedMessages = normalizeHydratedMessages(messages);

    console.info("hydrate chat input", {
      messages: messages.length,
      normalizedMessages: hydratedMessages.length,
      sessionId
    });

    set({
      chatSessionId: sessionId,
      messages: hydratedMessages.length > 0 ? hydratedMessages : [createGreetingMessage()]
    });
  },
  setInput: (input) => set({ input }),
  setModel: (model) => set({ model }),
  setMode: (mode) => {
    set({ mode });
  },
  clearProposal: () => set({ proposal: null }),
  markProposalApproved: () => set({ proposal: null }),
  sendMessage: async (workspaceContext) => {
    const prompt = get().input.trim();
    const mode = get().mode;

    if (!prompt || get().isStreaming) {
      return;
    }

    const userMessage = createMessage("user", prompt);
    const assistantMessage = createMessage("assistant", "");
    const nextMessages = [...get().messages, userMessage, assistantMessage];

    set({ input: "", isStreaming: true, messages: nextMessages, proposal: null });

    try {
      const response = await fetch("/api/ai/chat", {
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim().length > 0)
            .map(({ role, content }) => ({ role, content })),
          chatSessionId: workspaceContext.chatSessionId,
          mode,
          model: get().model,
          projectId: workspaceContext.projectId,
          workspace: {
            activeFileContent: workspaceContext.activeFileContent,
            activePath: workspaceContext.activePath,
            fileList: workspaceContext.fileList
          }
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok || !response.body) {
        throw new Error("Unable to start assistant stream.");
      }

      const responseSessionId = response.headers.get("x-hassali-chat-session-id");

      if (responseSessionId) {
        set({ chatSessionId: responseSessionId });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          )
        }));
      }

      if (mode === "SUGGEST" || mode === "EXECUTE") {
        const markerIndex = assistantContent.indexOf(proposalMarker);

        if (markerIndex !== -1) {
          const visibleContent = assistantContent.slice(0, markerIndex).trim();
          const proposalContent = assistantContent.slice(markerIndex + proposalMarker.length).trim();
          const parsedProposal = parseDiffProposal(proposalContent);

          if (!parsedProposal) {
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content:
                        visibleContent ||
                        "I could not turn the model response into a safe diff proposal. Try a smaller, more specific change."
                    }
                  : message
              ),
              proposal: null
            }));

            return;
          }

          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: visibleContent || parsedProposal.summary
                  }
                : message
            ),
            proposal: {
              ...parsedProposal,
              status: "pending"
            }
          }));
        }
      }
    } catch {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: "The assistant stream could not start. Check the server configuration."
              }
            : message
        )
      }));
    } finally {
      set({ isStreaming: false });
    }
  }
}));
