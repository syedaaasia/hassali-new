"use client";

import { create } from "zustand";

export type ChatRole = "user" | "assistant";
export type AiMode = "ASK" | "SUGGEST" | "EXECUTE";
export type ProductMode = "ASK" | "WEBSITE" | "CODE";
export type KernelMutationPolicy = "answer_only" | "proposal_required" | "safe_auto_apply_blocked";
export type KernelProviderProfileHint =
  | "cheap"
  | "coding"
  | "fast"
  | "local"
  | "long_context"
  | "privacy_sensitive"
  | "reasoning"
  | "vision";
export type KernelFrameworkHint =
  | "crewai_candidate"
  | "langchain_candidate"
  | "langgraph_candidate"
  | "llamaindex_candidate"
  | "multi_agent_candidate"
  | "none"
  | "rag_candidate";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type WorkspaceContext = {
  activeFileContent: string;
  activePath: string;
  chatSessionId: string | null;
  fileContents: Record<string, string>;
  fileList: string[];
  projectId: string | null;
  projectName: string | null;
};

type FileProposalAction = "create" | "update";
type RuntimeProposalAction = "restart_runtime" | "reload_preview" | "stop_runtime";
type ProposalAction = FileProposalAction | RuntimeProposalAction;
type ProposalRoutingMode = "blocked" | "normal" | "review_required";

export type ProposalRoutingReason = {
  code: string;
  message: string;
  severity: "high" | "info" | "medium";
};

export type ProposalRoutingWarning = {
  code: string;
  message: string;
  risk: "high" | "medium";
};

export type KernelRoutingDecision = {
  confidence: number;
  constraints: string[];
  frameworkHint?: KernelFrameworkHint;
  mode: ProductMode;
  mutationPolicy: KernelMutationPolicy;
  providerProfileHint?: KernelProviderProfileHint;
  requiredChecks: string[];
  risks: string[];
  routingExplanation: string;
  taskType: string;
};

export type DiffProposal = {
  appPreview?: {
    appKind: string;
    appName: string;
    entities: string[];
    integrations: string[];
    mockDataNotice: string;
    screens: string[];
  };
  blueprintConfidence?: number;
  blueprintId?: string;
  blueprintKind?: "answer" | "code_app" | "website";
  blueprintName?: string;
  blueprintPreviewType?: "code_app_preview" | "code_plan_preview" | "none" | "website_static_preview";
  blueprintStatus?: "fallback" | "matched" | "none";
  blockedReason?: string;
  contradictionStatus?: "blocked" | "clear" | "review_required";
  detectedDomain?: string;
  domainConfidence?: number;
  domainSource?: "current_user_prompt" | "existing_project" | "inferred" | "unknown";
  id: string;
  intentConfidence?: number;
  intentTranslationStatus?: "available" | "low_confidence" | "unavailable";
  intelligenceKernelSummary?: string;
  kernelRoutingDecision?: KernelRoutingDecision;
  modeObedienceStatus?: "blocked" | "obeyed" | "review_required";
  mode: "SUGGEST" | "EXECUTE";
  previewMode?: "answer_only" | "code_plan" | "static_preview";
  previewType?: "code_app_preview" | "code_plan_preview" | "docs_preview" | "none" | "website_static_preview";
  projectId: string | null;
  proposalRoutingMode?: ProposalRoutingMode;
  proposalRoutingReasons?: ProposalRoutingReason[];
  proposalRoutingWarnings?: ProposalRoutingWarning[];
  publicCopyCleanStatus?: "blocked" | "clean" | "review_required";
  requiresExtraReview?: boolean;
  sectionCopyQualityStatus?: "blocked" | "clean" | "review_required";
  shouldBlockExecution?: boolean;
  staleTermScanStatus?: "blocked" | "clean" | "review_required";
  status: "pending" | "approved" | "rejected";
  summary: string;
  translatedBusinessType?: string | null;
  translatedDomain?: string | null;
  translatedFeatures?: string[];
  translatedStyle?: string | null;
  changes: Array<{
    action: ProposalAction;
    path?: string;
    summary: string;
    proposedContent?: string;
    diffPreview?: string;
  }>;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAppPreview(value: unknown): value is NonNullable<DiffProposal["appPreview"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const preview = value as NonNullable<DiffProposal["appPreview"]>;

  return (
    typeof preview.appKind === "string" &&
    typeof preview.appName === "string" &&
    isStringArray(preview.entities) &&
    isStringArray(preview.integrations) &&
    typeof preview.mockDataNotice === "string" &&
    isStringArray(preview.screens)
  );
}

type ChatState = {
  messages: ChatMessage[];
  input: string;
  model: string;
  mode: AiMode;
  productMode: ProductMode;
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
  setProductMode: (mode: ProductMode) => void;
  clearProposal: () => void;
  markProposalApproved: () => void;
  sendMessage: (workspaceContext: WorkspaceContext) => Promise<void>;
};

const defaultModel = "openai/gpt-4o-mini";
const proposalMarker = "HASSALI_DIFF_PROPOSAL:";

function productModeToAiMode(mode: ProductMode): AiMode {
  return mode === "ASK" ? "ASK" : "EXECUTE";
}

function aiModeToProductMode(mode: AiMode): ProductMode {
  if (mode === "ASK") {
    return "ASK";
  }

  return mode === "SUGGEST" ? "WEBSITE" : "CODE";
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content
  };
}

function isRuntimeProposalAction(action: unknown): action is RuntimeProposalAction {
  return action === "restart_runtime" || action === "reload_preview" || action === "stop_runtime";
}

function isFileProposalAction(action: unknown): action is FileProposalAction {
  return action === "create" || action === "update";
}

function isProposalRoutingMode(value: unknown): value is ProposalRoutingMode {
  return value === "blocked" || value === "normal" || value === "review_required";
}

function isProposalRoutingWarning(value: unknown): value is ProposalRoutingWarning {
  if (!value || typeof value !== "object") {
    return false;
  }

  const warning = value as ProposalRoutingWarning;

  return (
    typeof warning.code === "string" &&
    typeof warning.message === "string" &&
    (warning.risk === "high" || warning.risk === "medium")
  );
}

function isProposalRoutingReason(value: unknown): value is ProposalRoutingReason {
  if (!value || typeof value !== "object") {
    return false;
  }

  const reason = value as ProposalRoutingReason;

  return (
    typeof reason.code === "string" &&
    typeof reason.message === "string" &&
    (reason.severity === "high" || reason.severity === "info" || reason.severity === "medium")
  );
}

function isKernelRoutingDecision(value: unknown): value is KernelRoutingDecision {
  if (!value || typeof value !== "object") {
    return false;
  }

  const decision = value as KernelRoutingDecision;

  return (
    (decision.mode === "ASK" || decision.mode === "WEBSITE" || decision.mode === "CODE") &&
    typeof decision.taskType === "string" &&
    typeof decision.confidence === "number" &&
    (decision.mutationPolicy === "answer_only" ||
      decision.mutationPolicy === "proposal_required" ||
      decision.mutationPolicy === "safe_auto_apply_blocked") &&
    Array.isArray(decision.constraints) &&
    decision.constraints.every((item) => typeof item === "string") &&
    Array.isArray(decision.risks) &&
    decision.risks.every((item) => typeof item === "string") &&
    Array.isArray(decision.requiredChecks) &&
    decision.requiredChecks.every((item) => typeof item === "string") &&
    typeof decision.routingExplanation === "string" &&
    (typeof decision.providerProfileHint === "undefined" ||
      ["cheap", "coding", "fast", "local", "long_context", "privacy_sensitive", "reasoning", "vision"].includes(decision.providerProfileHint)) &&
    (typeof decision.frameworkHint === "undefined" ||
      [
        "crewai_candidate",
        "langchain_candidate",
        "langgraph_candidate",
        "llamaindex_candidate",
        "multi_agent_candidate",
        "none",
        "rag_candidate"
      ].includes(decision.frameworkHint))
  );
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
    (typeof proposal.appPreview === "undefined" || isAppPreview(proposal.appPreview)) &&
    (typeof proposal.blueprintConfidence === "undefined" ||
      typeof proposal.blueprintConfidence === "number") &&
    (typeof proposal.blueprintId === "undefined" || typeof proposal.blueprintId === "string") &&
    (typeof proposal.blueprintKind === "undefined" ||
      proposal.blueprintKind === "answer" ||
      proposal.blueprintKind === "code_app" ||
      proposal.blueprintKind === "website") &&
    (typeof proposal.blueprintName === "undefined" || typeof proposal.blueprintName === "string") &&
    (typeof proposal.blueprintPreviewType === "undefined" ||
      proposal.blueprintPreviewType === "code_app_preview" ||
      proposal.blueprintPreviewType === "code_plan_preview" ||
      proposal.blueprintPreviewType === "none" ||
      proposal.blueprintPreviewType === "website_static_preview") &&
    (typeof proposal.blueprintStatus === "undefined" ||
      proposal.blueprintStatus === "fallback" ||
      proposal.blueprintStatus === "matched" ||
      proposal.blueprintStatus === "none") &&
    (typeof proposal.projectId === "string" || proposal.projectId === null) &&
    typeof proposal.summary === "string" &&
    (typeof proposal.blockedReason === "undefined" || typeof proposal.blockedReason === "string") &&
    (typeof proposal.contradictionStatus === "undefined" ||
      proposal.contradictionStatus === "blocked" ||
      proposal.contradictionStatus === "clear" ||
      proposal.contradictionStatus === "review_required") &&
    (typeof proposal.detectedDomain === "undefined" || typeof proposal.detectedDomain === "string") &&
    (typeof proposal.domainConfidence === "undefined" || typeof proposal.domainConfidence === "number") &&
    (typeof proposal.domainSource === "undefined" ||
      proposal.domainSource === "current_user_prompt" ||
      proposal.domainSource === "existing_project" ||
      proposal.domainSource === "inferred" ||
      proposal.domainSource === "unknown") &&
    (typeof proposal.intelligenceKernelSummary === "undefined" ||
      typeof proposal.intelligenceKernelSummary === "string") &&
    (typeof proposal.intentConfidence === "undefined" ||
      typeof proposal.intentConfidence === "number") &&
    (typeof proposal.intentTranslationStatus === "undefined" ||
      proposal.intentTranslationStatus === "available" ||
      proposal.intentTranslationStatus === "low_confidence" ||
      proposal.intentTranslationStatus === "unavailable") &&
    (typeof proposal.kernelRoutingDecision === "undefined" ||
      isKernelRoutingDecision(proposal.kernelRoutingDecision)) &&
    (typeof proposal.modeObedienceStatus === "undefined" ||
      proposal.modeObedienceStatus === "blocked" ||
      proposal.modeObedienceStatus === "obeyed" ||
      proposal.modeObedienceStatus === "review_required") &&
    (typeof proposal.proposalRoutingMode === "undefined" ||
      isProposalRoutingMode(proposal.proposalRoutingMode)) &&
    (typeof proposal.previewMode === "undefined" ||
      proposal.previewMode === "answer_only" ||
      proposal.previewMode === "code_plan" ||
      proposal.previewMode === "static_preview") &&
    (typeof proposal.previewType === "undefined" ||
      proposal.previewType === "code_app_preview" ||
      proposal.previewType === "code_plan_preview" ||
      proposal.previewType === "docs_preview" ||
      proposal.previewType === "none" ||
      proposal.previewType === "website_static_preview") &&
    (typeof proposal.proposalRoutingWarnings === "undefined" ||
      (Array.isArray(proposal.proposalRoutingWarnings) &&
        proposal.proposalRoutingWarnings.every(isProposalRoutingWarning))) &&
    (typeof proposal.proposalRoutingReasons === "undefined" ||
      (Array.isArray(proposal.proposalRoutingReasons) &&
        proposal.proposalRoutingReasons.every(isProposalRoutingReason))) &&
    (typeof proposal.requiresExtraReview === "undefined" ||
      typeof proposal.requiresExtraReview === "boolean") &&
    (typeof proposal.publicCopyCleanStatus === "undefined" ||
      proposal.publicCopyCleanStatus === "blocked" ||
      proposal.publicCopyCleanStatus === "clean" ||
      proposal.publicCopyCleanStatus === "review_required") &&
    (typeof proposal.sectionCopyQualityStatus === "undefined" ||
      proposal.sectionCopyQualityStatus === "blocked" ||
      proposal.sectionCopyQualityStatus === "clean" ||
      proposal.sectionCopyQualityStatus === "review_required") &&
    (typeof proposal.shouldBlockExecution === "undefined" ||
      typeof proposal.shouldBlockExecution === "boolean") &&
    (typeof proposal.staleTermScanStatus === "undefined" ||
      proposal.staleTermScanStatus === "blocked" ||
      proposal.staleTermScanStatus === "clean" ||
      proposal.staleTermScanStatus === "review_required") &&
    (typeof proposal.translatedBusinessType === "undefined" ||
      proposal.translatedBusinessType === null ||
      typeof proposal.translatedBusinessType === "string") &&
    (typeof proposal.translatedDomain === "undefined" ||
      proposal.translatedDomain === null ||
      typeof proposal.translatedDomain === "string") &&
    (typeof proposal.translatedFeatures === "undefined" ||
      (Array.isArray(proposal.translatedFeatures) &&
        proposal.translatedFeatures.every((feature) => typeof feature === "string"))) &&
    (typeof proposal.translatedStyle === "undefined" ||
      proposal.translatedStyle === null ||
      typeof proposal.translatedStyle === "string") &&
    Array.isArray(proposal.changes) &&
    proposal.changes.every(
      (change) => {
        if (!change || typeof change !== "object" || typeof change.summary !== "string") {
          return false;
        }

        if (isRuntimeProposalAction(change.action)) {
          return true;
        }

        return (
          isFileProposalAction(change.action) &&
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
  productMode: "ASK",
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
    set({ mode, productMode: aiModeToProductMode(mode) });
  },
  setProductMode: (productMode) => {
    set({ mode: productModeToAiMode(productMode), productMode });
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
          productMode: get().productMode,
          projectId: workspaceContext.projectId,
          workspace: {
            activeFileContent: workspaceContext.activeFileContent,
            activePath: workspaceContext.activePath,
            fileContents: workspaceContext.fileContents,
            fileList: workspaceContext.fileList,
            projectName: workspaceContext.projectName
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
