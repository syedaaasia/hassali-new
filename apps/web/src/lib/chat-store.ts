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
  fileList: string[];
};

export type DiffProposal = {
  id: string;
  status: "pending" | "approved" | "rejected";
  summary: string;
  changes: Array<{
    path: string;
    summary: string;
    proposedContent: string;
    diffPreview: string;
  }>;
};

type ChatState = {
  messages: ChatMessage[];
  input: string;
  model: string;
  mode: AiMode;
  isStreaming: boolean;
  proposal: DiffProposal | null;
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

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [
    createMessage(
      "assistant",
      "Tell me what you want to build or understand. I will keep the response focused and careful."
    )
  ],
  input: "",
  model: defaultModel,
  mode: "ASK",
  isStreaming: false,
  proposal: null,
  setInput: (input) => set({ input }),
  setModel: (model) => set({ model }),
  setMode: (mode) => {
    if (mode === "EXECUTE") {
      return;
    }

    set({ mode });
  },
  clearProposal: () => set({ proposal: null }),
  markProposalApproved: () => set({ proposal: null }),
  sendMessage: async (workspaceContext) => {
    const prompt = get().input.trim();
    const mode = get().mode;

    if (!prompt || get().isStreaming || mode === "EXECUTE") {
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
          mode,
          model: get().model,
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

      if (mode === "SUGGEST") {
        const markerIndex = assistantContent.indexOf(proposalMarker);

        if (markerIndex !== -1) {
          const visibleContent = assistantContent.slice(0, markerIndex).trim();
          const proposalContent = assistantContent.slice(markerIndex + proposalMarker.length).trim();
          const parsedProposal = JSON.parse(proposalContent) as DiffProposal;

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
