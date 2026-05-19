"use client";

import { create } from "zustand";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ChatState = {
  messages: ChatMessage[];
  input: string;
  model: string;
  isStreaming: boolean;
  setInput: (input: string) => void;
  setModel: (model: string) => void;
  sendMessage: () => Promise<void>;
};

const defaultModel = "openai/gpt-4o-mini";

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
  isStreaming: false,
  setInput: (input) => set({ input }),
  setModel: (model) => set({ model }),
  sendMessage: async () => {
    const prompt = get().input.trim();

    if (!prompt || get().isStreaming) {
      return;
    }

    const userMessage = createMessage("user", prompt);
    const assistantMessage = createMessage("assistant", "");
    const nextMessages = [...get().messages, userMessage, assistantMessage];

    set({ input: "", isStreaming: true, messages: nextMessages });

    try {
      const response = await fetch("/api/ai/chat", {
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim().length > 0)
            .map(({ role, content }) => ({ role, content })),
          model: get().model
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

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          )
        }));
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
