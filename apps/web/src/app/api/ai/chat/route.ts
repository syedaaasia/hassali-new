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
  mode: "SUGGEST";
  status: "pending";
  summary: string;
  changes: Array<{
    path: string;
    summary: string;
    proposedContent: string;
    diffPreview: string;
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

function createDiffPreview(path: string, proposedContent: string) {
  return [`--- ${path}`, `+++ ${path}`, ...proposedContent.split("\n").map((line) => `+ ${line}`)].join(
    "\n"
  );
}

function createLocalProposal(prompt: string, workspace: WorkspaceContext): DiffProposal {
  const proposedContent = `${workspace.activeFileContent.trimEnd()}\n\n// Hassali suggestion: ${prompt}\n`;

  return {
    id: `proposal-${Date.now()}`,
    mode: "SUGGEST",
    status: "pending",
    summary: `Propose an update to ${workspace.activePath}.`,
    changes: [
      {
        path: workspace.activePath,
        proposedContent,
        summary: "Adds a local suggestion note without changing files automatically.",
        diffPreview: createDiffPreview(workspace.activePath, proposedContent)
      }
    ]
  };
}

function isDiffProposalPayload(value: unknown): value is Pick<DiffProposal, "summary" | "changes"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Pick<DiffProposal, "summary" | "changes">;

  return (
    typeof payload.summary === "string" &&
    Array.isArray(payload.changes) &&
    payload.changes.every(
      (change) =>
        change &&
        typeof change === "object" &&
        typeof change.path === "string" &&
        typeof change.summary === "string" &&
        typeof change.proposedContent === "string" &&
        typeof change.diffPreview === "string"
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
    "I prepared a diff proposal for review. It will only apply if you approve it.\n\n";
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

  if (mode === "EXECUTE") {
    return Response.json({ error: "EXECUTE mode is not enabled yet." }, { status: 400 });
  }

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

  if (mode === "SUGGEST" && !process.env.OPENROUTER_API_KEY) {
    const proposal = createLocalProposal(latestUserPrompt, workspace);
    const visibleSummary =
      "I prepared a diff proposal for review. It will only apply if you approve it.";

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

  if (mode === "SUGGEST") {
    const response = await fetch(openRouterChatCompletionsUrl, {
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              `You are Hassali.ai in SUGGEST mode. Return only one JSON object with this exact shape: ` +
              `{ "summary": string, "changes": [{ "path": string, "summary": string, "proposedContent": string, "diffPreview": string }] }. ` +
              `Do not use markdown. Do not mutate files. Use the provided workspace context. Active file: ${workspace.activePath}. ` +
              `Files: ${workspace.fileList.join(", ")}. Active file content:\n${workspace.activeFileContent}`
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
      return Response.json({ error: "OpenRouter suggest request failed." }, { status: response.status });
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
          parseError: "invalid_suggest_json"
        },
        role: "assistant"
      });

      return createTextStream(fallbackContent, persistence?.sessionId);
    }

    const proposal: DiffProposal = {
      id: `proposal-${Date.now()}`,
      mode: "SUGGEST",
      status: "pending",
      summary: parsed.summary,
      changes: parsed.changes
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
