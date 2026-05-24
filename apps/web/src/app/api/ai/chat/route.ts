import {
  resolveChatPersistenceContext,
  saveChatMessage,
  type AiMode as PersistedAiMode
} from "@hassali/database";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const fallbackModel = "openai/gpt-4o-mini";
const openRouterChatCompletionsUrl = "https://openrouter.ai/api/v1/chat/completions";

type ChatRequestMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type AiMode = "ASK" | "SUGGEST" | "EXECUTE";

type WorkspaceContext = {
  activeFileContent: string;
  activePath: string;
  fileList: string[];
};

type ChatPersistenceContext = {
  mode: PersistedAiMode;
  projectId: string;
  sessionId: string | null;
  userId: string;
};

type DiffProposal = {
  id: string;
  mode: "SUGGEST" | "EXECUTE";
  status: "pending";
  summary: string;
  changes: Array<{
    action: "create" | "restart_runtime" | "reload_preview" | "stop_runtime" | "update";
    path?: string;
    summary: string;
    proposedContent?: string;
    diffPreview?: string;
  }>;
};
type DiffProposalPayload = {
  summary: string;
  changes: Array<{
    action: "create" | "restart_runtime" | "reload_preview" | "stop_runtime" | "update";
    path?: string;
    summary: string;
    proposedContent?: string;
    diffPreview?: string;
  }>;
};

const proposalMarker = "HASSALI_DIFF_PROPOSAL:";

function isChatMessage(value: unknown): value is ChatRequestMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as ChatRequestMessage;

  return (
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function isWorkspaceContext(value: unknown): value is WorkspaceContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as WorkspaceContext;

  return (
    typeof workspace.activeFileContent === "string" &&
    typeof workspace.activePath === "string" &&
    Array.isArray(workspace.fileList) &&
    workspace.fileList.every((path) => typeof path === "string")
  );
}

function createDiffPreview(action: "create" | "update", path: string, proposedContent: string) {
  return [
    action === "create" ? `create ${path}` : `update ${path}`,
    `--- ${path}`,
    `+++ ${path}`,
    ...proposedContent.split("\n").map((line) => `+ ${line}`)
  ].join("\n");
}

function shouldRestartPreview(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  return (
    lowerPrompt.includes("preview") ||
    lowerPrompt.includes("start") ||
    lowerPrompt.includes("restart") ||
    lowerPrompt.includes("run")
  );
}

function createLocalProposal(
  prompt: string,
  workspace: WorkspaceContext,
  mode: "SUGGEST" | "EXECUTE"
): DiffProposal {
  const lowerPrompt = prompt.toLowerCase();

  if (
    lowerPrompt.includes("landing") ||
    lowerPrompt.includes("html") ||
    lowerPrompt.includes("css") ||
    lowerPrompt.includes("javascript") ||
    lowerPrompt.includes("js")
  ) {
    const changes = [
      {
        action: "create" as const,
        path: "index.html",
        summary: "Creates a small landing page structure.",
        proposedContent:
          '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Hassali Landing</title>\n    <link rel="stylesheet" href="./styles.css" />\n  </head>\n  <body>\n    <main class="page-shell">\n      <section class="hero">\n        <p class="eyebrow">Calm software creation</p>\n        <h1>Build ideas into working software with less friction.</h1>\n        <p class="lede">A lightweight AI-native workspace for focused creators.</p>\n        <button id="start-button">Start building</button>\n      </section>\n    </main>\n    <script src="./main.js"></script>\n  </body>\n</html>\n'
      },
      {
        action: "create" as const,
        path: "styles.css",
        summary: "Adds calm premium styling for the landing page.",
        proposedContent:
          ':root {\n  color-scheme: dark;\n  font-family: Inter, ui-sans-serif, system-ui, sans-serif;\n  background: #090909;\n  color: #f4efe6;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  min-height: 100vh;\n  background: radial-gradient(circle at top left, rgba(16, 185, 129, 0.18), transparent 32%), #090909;\n}\n\n.page-shell {\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  padding: 48px 20px;\n}\n\n.hero {\n  max-width: 720px;\n}\n\n.eyebrow {\n  color: #d6b16d;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  font-size: 0.78rem;\n}\n\nh1 {\n  font-size: clamp(2.4rem, 7vw, 5rem);\n  line-height: 0.95;\n  margin: 0;\n}\n\n.lede {\n  color: #b8b0a4;\n  font-size: 1.1rem;\n  line-height: 1.7;\n}\n\nbutton {\n  border: 1px solid rgba(214, 177, 109, 0.45);\n  border-radius: 999px;\n  background: #d6b16d;\n  color: #111;\n  padding: 12px 18px;\n  font-weight: 700;\n}\n'
      },
      {
        action: "create" as const,
        path: "main.js",
        summary: "Adds a tiny interaction hook for the landing page.",
        proposedContent:
          'const button = document.querySelector("#start-button");\n\nbutton?.addEventListener("click", () => {\n  button.textContent = "Ready when you are";\n});\n'
      }
    ];

    return {
      id: `proposal-${Date.now()}`,
      mode,
      status: "pending",
      summary:
        mode === "EXECUTE"
          ? "Create a small static web project and prepare the preview runtime."
          : "Create a small HTML, CSS, and JavaScript landing page.",
      changes: [
        ...changes.map((change) => ({
          ...change,
          diffPreview: createDiffPreview(change.action, change.path, change.proposedContent)
        })),
        ...(mode === "EXECUTE" || shouldRestartPreview(prompt)
          ? [
              {
                action: "restart_runtime" as const,
                summary: "Restart the local static preview after files are approved."
              }
            ]
          : [])
      ]
    };
  }

  const targetPath = workspace.activePath || "notes.md";
  const action = workspace.fileList.includes(targetPath) ? "update" : "create";
  const proposedContent = `${workspace.activeFileContent.trimEnd()}\n\n// Hassali suggestion: ${prompt}\n`;

  return {
    id: `proposal-${Date.now()}`,
    mode,
    status: "pending",
    summary: `${action === "create" ? "Create" : "Update"} ${targetPath}.`,
    changes: [
      {
        action,
        path: targetPath,
        proposedContent,
        summary: "Adds a local suggestion note without changing files automatically.",
        diffPreview: createDiffPreview(action, targetPath, proposedContent)
      }
    ]
  };
}

function isDiffProposalPayload(value: unknown): value is DiffProposalPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as DiffProposalPayload;

  return (
    typeof payload.summary === "string" &&
    Array.isArray(payload.changes) &&
    payload.changes.every(
      (change) => {
        if (!change || typeof change !== "object" || typeof change.summary !== "string") {
          return false;
        }

        if (
          change.action === "restart_runtime" ||
          change.action === "reload_preview" ||
          change.action === "stop_runtime"
        ) {
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

function parseDiffProposalContent(content: string) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return null;
  }

  const fencedJsonMatch = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmedContent;

  try {
    const parsed = JSON.parse(candidate) as unknown;

    return isDiffProposalPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createResponseHeaders(sessionId?: string | null) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  };

  if (sessionId) {
    headers["x-hassali-chat-session-id"] = sessionId;
  }

  return headers;
}

function createTextStream(content: string, sessionId?: string | null) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(sessionId)
    }
  );
}

async function createPersistenceContext(input: {
  mode: AiMode;
  projectId?: string | null;
  sessionId?: string | null;
}) {
  if (!input.projectId) {
    return null;
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      console.info("chat persistence skipped", { reason: "no_clerk_user" });
      return null;
    }

    const context = await resolveChatPersistenceContext({
      externalUserId: userId,
      mode: input.mode,
      projectId: input.projectId,
      sessionId: input.sessionId ?? null
    });

    console.info("chat persistence context", {
      hasContext: Boolean(context),
      projectId: input.projectId,
      sessionId: context?.sessionId ?? null
    });

    return context satisfies ChatPersistenceContext | null;
  } catch (error) {
    console.error(
      "chat persistence context failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return null;
  }
}

async function persistChatMessage(
  context: ChatPersistenceContext | null,
  input: {
    content: string;
    metadata?: Record<string, unknown>;
    role: "user" | "assistant";
  }
) {
  if (!context || input.content.trim().length === 0) {
    console.info("chat message persistence skipped", {
      hasContext: Boolean(context),
      role: input.role
    });
    return context;
  }

  try {
    const saved = await saveChatMessage({
      content: input.content,
      metadata: input.metadata,
      mode: context.mode,
      projectId: context.projectId,
      role: input.role,
      sessionId: context.sessionId,
      userId: context.userId
    });

    console.info("chat message saved", {
      role: input.role,
      sessionId: saved.session.id
    });

    return {
      ...context,
      sessionId: saved.session.id
    };
  } catch (error) {
    console.error(
      "chat message save failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return context;
  }
}

function createProposalStream(proposal: DiffProposal, sessionId?: string | null) {
  const encoder = new TextEncoder();
  const visibleSummary =
    proposal.mode === "EXECUTE"
      ? "I prepared an execution proposal for review. Nothing runs until you approve it.\n\n"
      : "I prepared a diff proposal for review. It will only apply if you approve it.\n\n";
  const payload = `${proposalMarker}${JSON.stringify(proposal)}`;

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(visibleSummary));
        controller.enqueue(encoder.encode(payload));
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(sessionId)
    }
  );
}

function createOpenRouterTextStream(
  response: Response,
  options?: {
    onComplete?: (content: string) => Promise<void>;
    sessionId?: string | null;
  }
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();

  if (!reader) {
    return createPlaceholderStream(fallbackModel, options);
  }

  let buffer = "";
  let streamedContent = "";

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmedLine = line.trim();

              if (!trimmedLine.startsWith("data:")) {
                continue;
              }

              const data = trimmedLine.slice(5).trim();

              if (data === "[DONE]") {
                continue;
              }

              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{
                    delta?: {
                      content?: string;
                    };
                  }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  streamedContent += content;
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                continue;
              }
            }
          }
        } finally {
          await options?.onComplete?.(streamedContent);
          controller.close();
          reader.releaseLock();
        }
      }
    }),
    {
      headers: createResponseHeaders(options?.sessionId)
    }
  );
}

function createPlaceholderStream(
  model: string,
  options?: {
    onComplete?: (content: string) => Promise<void>;
    sessionId?: string | null;
  }
) {
  const encoder = new TextEncoder();
  const chunks = [
    `Streaming placeholder active for ${model}.\n\n`,
    "Add OPENROUTER_API_KEY to enable live OpenRouter responses. ",
    "Usage tracking hooks are reserved for a later phase."
  ];

  return new Response(
    new ReadableStream({
      async start(controller) {
        let content = "";

        for (const chunk of chunks) {
          content += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        await options?.onComplete?.(content);
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(options?.sessionId)
    }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    chatSessionId?: unknown;
    messages?: unknown;
    mode?: unknown;
    model?: unknown;
    projectId?: unknown;
    workspace?: unknown;
  } | null;

  const messages = Array.isArray(body?.messages)
    ? body.messages.filter(isChatMessage).map<ChatRequestMessage>((message) => ({
        role: message.role,
        content: message.content
      }))
    : [];

  if (messages.length === 0) {
    return Response.json({ error: "A user message is required." }, { status: 400 });
  }

  const model =
    typeof body?.model === "string" && body.model.trim().length > 0
      ? body.model.trim()
      : process.env.HASSALI_DEFAULT_MODEL || fallbackModel;
  const mode: AiMode =
    body?.mode === "SUGGEST" || body?.mode === "EXECUTE" || body?.mode === "ASK"
      ? body.mode
      : "ASK";
  const workspace = isWorkspaceContext(body?.workspace)
    ? body.workspace
    : {
        activeFileContent: "",
        activePath: "welcome.ts",
        fileList: []
      };
  const latestUserPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const requestedProjectId = typeof body?.projectId === "string" ? body.projectId : null;
  const requestedSessionId = typeof body?.chatSessionId === "string" ? body.chatSessionId : null;
  let persistence = await createPersistenceContext({
    mode,
    projectId: requestedProjectId,
    sessionId: requestedSessionId
  });

  persistence = await persistChatMessage(persistence, {
    content: latestUserPrompt,
    metadata: {
      model,
      workspace: {
        activePath: workspace.activePath,
        fileList: workspace.fileList
      }
    },
    role: "user"
  });

  if ((mode === "SUGGEST" || mode === "EXECUTE") && !process.env.OPENROUTER_API_KEY) {
    const proposal = createLocalProposal(latestUserPrompt, workspace, mode);
    const visibleSummary =
      mode === "EXECUTE"
        ? "I prepared an execution proposal for review. Nothing runs until you approve it."
        : "I prepared a diff proposal for review. It will only apply if you approve it.";

    persistence = await persistChatMessage(persistence, {
      content: visibleSummary,
      metadata: {
        model,
        proposal
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return createPlaceholderStream(model, {
      onComplete: async (content) => {
        persistence = await persistChatMessage(persistence, {
          content,
          metadata: { model },
          role: "assistant"
        });
      },
      sessionId: persistence?.sessionId
    });
  }

  if (mode === "SUGGEST" || mode === "EXECUTE") {
    const response = await fetch(openRouterChatCompletionsUrl, {
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              `You are Hassali.ai in ${mode} mode. Return only one JSON object with this exact shape: ` +
              `{ "summary": string, "changes": [{ "path": string, "action": "create" | "update", "summary": string, "proposedContent": string } | { "action": "restart_runtime" | "reload_preview" | "stop_runtime", "summary": string }] }. ` +
              `You may include multiple file changes. Use action "create" for new files and "update" for existing files. ` +
              `Only include safe runtime actions when the user asks to start, restart, reload, or stop preview. Do not include shell commands, package installs, Docker, or destructive deletes. ` +
              `Do not use markdown. Do not mutate files. Use the provided workspace context. Active file: ${workspace.activePath}. ` +
              `Existing project files: ${workspace.fileList.join(", ")}. Active file content:\n${workspace.activeFileContent}`
          },
          ...messages
        ],
        model,
        stream: false
      }),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      return Response.json({ error: "OpenRouter proposal request failed." }, { status: response.status });
    }

    const completion = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = completion.choices?.[0]?.message?.content ?? "";
    const parsed = parseDiffProposalContent(content);

    if (!parsed) {
      const fallbackContent =
        "I could not turn the model response into a safe diff proposal. Try a smaller, more specific change and I will prepare it for review.";

      persistence = await persistChatMessage(persistence, {
        content: fallbackContent,
        metadata: {
          model,
          parseError: "invalid_proposal_json"
        },
        role: "assistant"
      });

      return createTextStream(fallbackContent, persistence?.sessionId);
    }

    const proposal: DiffProposal = {
      id: `proposal-${Date.now()}`,
      mode,
      status: "pending",
      summary: parsed.summary,
      changes: parsed.changes.map((change) => {
        if (
          change.action === "restart_runtime" ||
          change.action === "reload_preview" ||
          change.action === "stop_runtime"
        ) {
          return {
            action: change.action,
            summary: change.summary
          };
        }

        return {
          action: change.action,
          diffPreview:
            change.diffPreview ??
            createDiffPreview(change.action, change.path ?? "untitled.txt", change.proposedContent ?? ""),
          path: change.path,
          proposedContent: change.proposedContent,
          summary: change.summary
        };
      })
    };

    persistence = await persistChatMessage(persistence, {
      content: proposal.summary,
      metadata: {
        model,
        proposal
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  const response = await fetch(openRouterChatCompletionsUrl, {
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            `You are Hassali.ai in ASK mode. Keep answers concise and do not edit files from chat. ` +
            `Current mode: ${mode}. Active file: ${workspace.activePath}. Files: ${workspace.fileList.join(", ")}.`
        },
        ...messages
      ],
      model,
      stream: true
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    return Response.json({ error: "OpenRouter chat request failed." }, { status: response.status });
  }

  return createOpenRouterTextStream(response, {
    onComplete: async (content) => {
      persistence = await persistChatMessage(persistence, {
        content,
        metadata: { model },
        role: "assistant"
      });
    },
    sessionId: persistence?.sessionId
  });
}
