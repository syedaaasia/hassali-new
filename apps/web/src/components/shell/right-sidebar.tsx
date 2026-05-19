"use client";

import { motion } from "framer-motion";
import { Panel } from "@/components/ui/panel";
import { PremiumSelect } from "@/components/ui/premium-select";
import { useChatStore } from "@/lib/chat-store";

const modelOptions = [
  { label: "GPT-4o mini", value: "openai/gpt-4o-mini" },
  { label: "Claude Haiku", value: "anthropic/claude-3.5-haiku" },
  { label: "Gemini Flash", value: "google/gemini-flash-1.5" }
];

export function RightSidebar() {
  const messages = useChatStore((state) => state.messages);
  const input = useChatStore((state) => state.input);
  const model = useChatStore((state) => state.model);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const setInput = useChatStore((state) => state.setInput);
  const setModel = useChatStore((state) => state.setModel);
  const sendMessage = useChatStore((state) => state.sendMessage);

  return (
    <Panel className="hidden w-80 shrink-0 flex-col border-l bg-surface/90 lg:flex 2xl:w-96">
      <div className="border-b px-4 py-3.5">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Assistant
        </div>
        <div className="mt-1 text-xs text-foreground">Quiet pair programmer</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b p-3.5">
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
                  ? "ml-6 border-accent/20 bg-accent/10 text-foreground shadow-[0_10px_30px_hsl(var(--accent)/0.07)]"
                  : "mr-6 border-border/70 bg-background/70 text-muted-foreground"
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
        </div>

        <form
          className="border-t bg-surface/80 p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            className="min-h-24 w-full resize-none rounded-xl border border-border/80 bg-background/75 p-3.5 text-[12.5px] leading-5 text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_12px_34px_hsl(224_20%_4%/0.08)] outline-none placeholder:text-muted-foreground focus:border-accent/55 focus:ring-2 focus:ring-accent/10"
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
              className="rounded-lg border border-accent/30 bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground shadow-[0_10px_26px_hsl(var(--accent)/0.18)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45"
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
