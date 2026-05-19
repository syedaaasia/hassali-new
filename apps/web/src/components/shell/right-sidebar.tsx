"use client";

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
    <Panel className="flex w-72 shrink-0 flex-col border-l">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Assistant</div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b p-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="assistant-model">
            Model
          </label>
          <select
            className="mt-2 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none"
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
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-md border p-3 text-xs leading-5 ${
                message.role === "user" ? "bg-muted text-foreground" : "bg-background text-muted-foreground"
              }`}
            >
              <div className="mb-1 font-medium text-foreground">
                {message.role === "user" ? "You" : "Hassali"}
              </div>
              <div className="whitespace-pre-wrap">{message.content || "Thinking..."}</div>
            </div>
          ))}
        </div>

        <form
          className="border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            className="min-h-20 w-full resize-none rounded-md border bg-background p-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) =>
              setInput((event.currentTarget as unknown as { value: string }).value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask about this workspace..."
            value={input}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {isStreaming ? "Streaming..." : "Usage tracking placeholder"}
            </span>
            <button
              className="rounded-md border bg-foreground px-3 py-1.5 text-xs text-background disabled:cursor-not-allowed disabled:opacity-50"
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
