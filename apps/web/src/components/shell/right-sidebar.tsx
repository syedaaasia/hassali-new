"use client";

import { motion } from "framer-motion";
import { Panel } from "@/components/ui/panel";
import { useChatStore } from "@/lib/chat-store";

const modelOptions = ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "google/gemini-flash-1.5"];

export function RightSidebar() {
  const messages = useChatStore((state) => state.messages);
  const input = useChatStore((state) => state.input);
  const model = useChatStore((state) => state.model);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const setInput = useChatStore((state) => state.setInput);
  const setModel = useChatStore((state) => state.setModel);
  const sendMessage = useChatStore((state) => state.sendMessage);

  return (
    <Panel className="hidden w-80 shrink-0 flex-col border-l bg-surface/95 lg:flex 2xl:w-96">
      <div className="border-b px-3.5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Assistant
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b p-3">
          <label
            className="flex items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2 shadow-sm"
            htmlFor="assistant-model"
          >
            <span className="text-xs font-medium text-muted-foreground">Model</span>
            <select
              className="min-w-0 flex-1 bg-transparent text-right text-xs text-foreground outline-none"
              id="assistant-model"
              onChange={(event) =>
                setModel((event.currentTarget as unknown as { value: string }).value)
              }
              value={model}
            >
              {modelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-smooth p-3">
          {messages.map((message) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 4 }}
              key={message.id}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={`rounded-lg border px-3 py-2.5 text-xs leading-5 shadow-sm ${
                message.role === "user"
                  ? "ml-5 border-accent/20 bg-accent/10 text-foreground"
                  : "mr-5 bg-background/75 text-muted-foreground"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 font-medium text-foreground">
                <span>{message.role === "user" ? "You" : "Hassali"}</span>
                {message.role === "assistant" && isStreaming && message.content.length === 0 ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                ) : null}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {message.content || "Thinking quietly..."}
              </div>
            </motion.div>
          ))}
        </div>

        <form
          className="border-t bg-surface/80 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            className="min-h-24 w-full resize-none rounded-lg border bg-background/80 p-3 text-xs leading-5 text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-accent/60"
            onChange={(event) =>
              setInput((event.currentTarget as unknown as { value: string }).value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask Hassali..."
            value={input}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {isStreaming ? "Streaming response..." : "Usage tracking placeholder"}
            </span>
            <button
              className="rounded-md border border-accent/30 bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
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
