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

function createProposalStream(proposal: DiffProposal) {
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
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      }
    }
  );
}

function createOpenRouterTextStream(response: Response) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();

  if (!reader) {
    return createPlaceholderStream(fallbackModel);
  }

  let buffer = "";

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
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                continue;
              }
            }
          }
        } finally {
          controller.close();
          reader.releaseLock();
        }
      }
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      }
    }
  );
}

function createPlaceholderStream(model: string) {
  const encoder = new TextEncoder();
  const chunks = [
    `Streaming placeholder active for ${model}.\n\n`,
    "Add OPENROUTER_API_KEY to enable live OpenRouter responses. ",
    "Usage tracking hooks are reserved for a later phase."
  ];

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      }
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      }
    }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    messages?: unknown;
    mode?: unknown;
    model?: unknown;
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

  if (mode === "SUGGEST" && !process.env.OPENROUTER_API_KEY) {
    return createProposalStream(createLocalProposal(latestUserPrompt, workspace));
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return createPlaceholderStream(model);
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
    const parsed = JSON.parse(content) as Pick<DiffProposal, "summary" | "changes">;
    const proposal: DiffProposal = {
      id: `proposal-${Date.now()}`,
      mode: "SUGGEST",
      status: "pending",
      summary: parsed.summary,
      changes: parsed.changes
    };

    return createProposalStream(proposal);
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

  return createOpenRouterTextStream(response);
}
