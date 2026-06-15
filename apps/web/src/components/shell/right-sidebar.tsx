"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { PremiumSelect } from "@/components/ui/premium-select";
import { type ChatMessage, type DiffProposal, type ProductMode, useChatStore } from "@/lib/chat-store";
import {
  type RuntimeApprovalResponse,
  syncRuntimeApprovalResult
} from "@/lib/runtime-result-sync";
import { useRuntimeStore } from "@/lib/runtime-store";
import { folderPlaceholderFileName, useWorkspaceStore } from "@/lib/workspace-store";

const modelOptions = [
  { label: "GPT-4o mini", value: "openai/gpt-4o-mini" },
  { label: "Claude Haiku", value: "anthropic/claude-3.5-haiku" },
  { label: "Gemini Flash", value: "google/gemini-flash-1.5" }
];

const productModes: Array<{
  label: ProductMode;
}> = [
  {
    label: "ASK"
  },
  {
    label: "WEBSITE"
  },
  {
    label: "CODE"
  }
];

const modeHints: Record<ProductMode, string> = {
  ASK: "Ask mode is answer-first. Hassali can explain, plan, debug, and reason without mutating files.",
  WEBSITE: "Website mode focuses on premium sites, pages, visuals, animation, copy, images, and theme edits.",
  CODE: "Code mode is for apps, tools, systems, automations, APIs, and industry-grade software proposals."
};
type RightSidebarProps = {
  isEditorOpen: boolean;
  onToggleEditor: () => void;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
    isFinal: boolean;
  }>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechGlobal = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};
const blockedRegenerationLimit = 2;
const manualReviewNeededMessage =
  "Manual review needed \u2014 Hassali has blocked multiple regenerated proposals. Please adjust the request or inspect the project files.";

const manualReviewGuidance = [
  "Check the correct project is selected.",
  "Inspect selected project files before retrying.",
  "Simplify the request.",
  "Restate exact pages, colors, and style.",
  'Ask Hassali: "Explain why this proposal was blocked and what I should change."',
  "Reject the proposal and manually rewrite the request if needed."
];

function isFileProposalAction(action: string) {
  return action === "create" || action === "update";
}

function isRuntimeProposalAction(action: string) {
  return action === "restart_runtime" || action === "reload_preview" || action === "stop_runtime";
}

function normalizeProposalPath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const rawPath = value.trim();

  if (!rawPath || rawPath.startsWith("/") || rawPath.startsWith("\\") || /^[a-z]:/i.test(rawPath)) {
    return null;
  }

  const normalized = rawPath
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (normalized === folderPlaceholderFileName || normalized.endsWith(`/${folderPlaceholderFileName}`)) {
    return null;
  }

  const segments = normalized.split("/");
  const hasUnsafeSegment = segments.some(
    (segment) => !segment || segment === "." || segment === ".."
  );

  return hasUnsafeSegment ? null : normalized;
}

function validateProposalForApproval(proposal: DiffProposal, selectedProjectId: string | null) {
  if (isBlockedProposal(proposal)) {
    return "This proposal was marked unsafe. Reject it and ask Hassali to recreate a safer proposal.";
  }

  if (proposal.changes.length === 0) {
    return "This proposal has no approved changes to apply.";
  }

  if (!proposal.projectId) {
    return "This proposal is missing projectId. Recreate it before approving.";
  }

  if (!selectedProjectId) {
    return "Select a project before approving this proposal.";
  }

  if (proposal.projectId !== selectedProjectId) {
    return "This proposal belongs to another project. Recreate it for the current project.";
  }

  for (const change of proposal.changes) {
    if (isFileProposalAction(change.action)) {
      const normalizedPath = normalizeProposalPath(change.path);

      if (!normalizedPath) {
        return "This proposal contains an invalid file path. Recreate it before approving.";
      }

      if (typeof change.proposedContent !== "string") {
        return `Could not save ${normalizedPath}. Proposed content was missing. Proposal was not applied.`;
      }
    } else if (!isRuntimeProposalAction(change.action)) {
      return "This proposal contains an unsupported action. Recreate it before approving.";
    }
  }

  return null;
}

function fileProposalChanges(proposal: DiffProposal) {
  return proposal.changes.filter((change) => isFileProposalAction(change.action));
}

function runtimeApprovalMessage(status: number, payload: RuntimeApprovalResponse | null) {
  const backendError =
    payload?.errors?.find((item) => item.trim().length > 0) ??
    payload?.blockedSteps
      ?.flatMap((step) => step.reasons ?? [])
      .map((reason) => reason.message)
      .find((message): message is string => Boolean(message?.trim()));

  return `Runtime approval failed. Backend returned ${status}: ${backendError ?? "Approved file runner rejected the proposal."} Proposal was not applied.`;
}

async function approveProposalThroughRuntime(proposal: DiffProposal, selectedProjectId: string) {
  const fileChanges = fileProposalChanges(proposal);

  if (fileChanges.length === 0) {
    return null;
  }

  const response = await fetch("/api/runtime/approve", {
    body: JSON.stringify({
      changes: proposal.changes.map((change) => ({
        action: change.action,
        path: change.path,
        proposedContent: change.proposedContent,
        summary: change.summary
      })),
      projectId: selectedProjectId,
      proposalId: proposal.id
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const payload = (await response.json().catch(() => null)) as RuntimeApprovalResponse | null;

  if (!response.ok || payload?.runnerStatus === "blocked" || payload?.verification?.ok === false) {
    throw new Error(runtimeApprovalMessage(response.status, payload));
  }

  console.info("runtime approval result", payload);

  return payload;
}

function isBlockedProposal(proposal: DiffProposal) {
  return proposal.proposalRoutingMode === "blocked" || proposal.shouldBlockExecution === true;
}

function blockedProposalReasons(proposal: DiffProposal) {
  return (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .map((reason) => reason.message);
}

function blockedProposalWarnings(proposal: DiffProposal) {
  return (proposal.proposalRoutingWarnings ?? []).map((warning) => warning.message);
}

function formatPromptList(items: string[], fallback: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function extractOriginalRequest(content: string) {
  const match = content.match(/Original request:\s*\n([\s\S]*?)\n\nPrevious proposal was blocked because:/);

  return match?.[1]?.trim() || content;
}

function getLatestOriginalRequest(messages: ChatMessage[]) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return extractOriginalRequest(latestUserMessage) || "the original request in this chat";
}

function regenerationIntentFor(request: string) {
  const prompt = request.toLowerCase();
  const colorTerms = "green|blue|pink|white|black|gold|golden|yellow|brown|cream|teal|red|maroon|gradient";

  if (
    /\b(?:change|make|update|switch|turn|replace)\b[\s\S]{0,80}\b(?:color|colors|colour|colours|theme|palette)\b/.test(prompt) ||
    new RegExp(`\\b(?:change|update|switch|turn|replace)\\b[\\s\\S]{0,80}\\b(?:${colorTerms})\\b`).test(prompt)
  ) {
    return "visual_theme_edit";
  }

  if (/\b(?:rename|replace)\b/.test(prompt) || /\bchange(?:\s+the)?\s+(?:name|text|brand|title)\b/.test(prompt)) {
    return "rename";
  }

  if (/\bchange\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\s+(?:to|with)\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\b/i.test(prompt)) {
    return "rename";
  }

  if (/\b(?:reload|restart|stop|start)\s+preview\b/.test(prompt)) {
    return "runtime_action";
  }

  if (/\b(?:create|build|generate|design|make)\b[\s\S]{0,80}\b(?:website|site|web app|system|app|tool)\b/.test(prompt)) {
    return "generation";
  }

  return "small_edit";
}

function createSaferProposalPrompt(proposal: DiffProposal, originalRequest: string) {
  const reasons = blockedProposalReasons(proposal);
  const warnings = blockedProposalWarnings(proposal);
  const intent = regenerationIntentFor(originalRequest);
  const typeSpecificCorrections =
    intent === "visual_theme_edit"
      ? `Required corrections:
- preserve approval-first safety
- keep this as a visual_theme_edit
- preserve the existing CSS/layout/content
- apply the requested color tokens, accents, glows, buttons, and highlights
- mutate CSS only, plus reload preview only if needed
- do not create index.html/about/contact/story pages
- do not regenerate the website
- do not include page-count or domain-generation rules
- do not output generic website copy
- avoid blank files`
      : intent === "rename"
        ? `Required corrections:
- preserve approval-first safety
- keep this as a rename/text replacement
- edit only files that contain the source text
- do not create new pages or regenerate the website
- do not change unrelated content
- preserve selected project isolation
- avoid blank files`
        : intent === "runtime_action"
          ? `Required corrections:
- preserve approval-first safety
- keep this as a runtime action proposal
- do not create or update files
- use only allowed runtime actions
- preserve selected project isolation`
          : `Required corrections:
- preserve approval-first safety
- avoid welcome.ts pollution
- preserve selected project isolation
- match the original business/domain
- match requested page count
- match requested colors
- match requested visual style
- avoid developer/coder fallback unless user explicitly asked for a developer/coder website
- avoid overgeneration
- avoid blank files`;
  const preservationRules =
    intent === "generation"
      ? `Required preservation rules:
- do not simplify away requested pages
- do not change the business type
- do not ignore the theme/colors
- do not change execution behavior
- produce a normal proposal only after risks are corrected`
      : `Required preservation rules:
- preserve the original intent family: ${intent}
- do not expand this into website generation
- do not introduce unrelated pages, business copy, or domain changes
- do not change execution behavior
- produce a corrected proposal only after risks are fixed`;
  const repairContext = `Repair context:
- previous repair status: ${proposal.proposalRepairStatus ?? "unknown"}
- previous repair strategy: ${proposal.proposalRepairStrategy ?? "none"}
- previous repair attempted: ${proposal.proposalRepairAttempted ? "yes" : "no"}
- unresolved repair issues: ${proposal.proposalUnresolvedIssueCount ?? 0}
- treat every blocked reason and warning above as hard forbidden output unless the original request explicitly requires it`;

  return `Please regenerate a safer proposal.

Original request:
${originalRequest}

Previous proposal was blocked because:
${formatPromptList(reasons, proposal.summary)}

Warnings:
${formatPromptList(warnings, "No additional warnings were provided.")}

Proposal type:
${intent}

${typeSpecificCorrections}

${preservationRules}

${repairContext}

Return a corrected proposal that keeps the original request intact and fixes the blocked risks.`;
}

function getProposalReviewState(proposal: DiffProposal) {
  if (isBlockedProposal(proposal)) {
    return {
      badge: "Blocked / Unsafe to Execute",
      className:
        "border-red-500/35 bg-red-500/10 text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.12)]",
      message: "AI marked this proposal as unsafe or mismatched. Do not approve unless corrected."
    };
  }

  if (proposal.proposalRoutingMode === "review_required" || proposal.requiresExtraReview) {
    return {
      badge: "Needs Review",
      className:
        "border-amber-400/35 bg-amber-400/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.1)]",
      message: "AI found possible risks. Please review carefully before approving."
    };
  }

  return {
    badge: "Normal",
    className:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.1)]",
    message: "AI safety check passed. Review the proposal before approving."
  };
}

function ProposalReviewState({ proposal }: { proposal: DiffProposal }) {
  const reviewState = getProposalReviewState(proposal);
  const warnings = proposal.proposalRoutingWarnings ?? [];
  const visibleReasons = (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .slice(0, 3);
  const kernelDecision = proposal.kernelRoutingDecision;

  return (
    <div className="mt-3 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.28)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${reviewState.className}`}>
          {reviewState.badge}
        </span>
        <span className="text-[11px] leading-5 text-muted-foreground">{reviewState.message}</span>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {warnings.slice(0, 4).map((warning, index) => (
            <div
              className="text-[11px] leading-5 text-muted-foreground"
              key={`${warning.code}-${warning.message ?? "warning"}-${index}`}
            >
              <span className={warning.risk === "high" ? "text-red-200" : "text-amber-100"}>
                {warning.risk === "high" ? "High" : "Review"}:
              </span>{" "}
              {warning.message}
            </div>
          ))}
        </div>
      ) : null}

      {visibleReasons.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {visibleReasons.map((reason) => (
            <div className="text-[11px] leading-5 text-muted-foreground" key={`${reason.code}-${reason.message}`}>
              {reason.message}
            </div>
          ))}
        </div>
      ) : null}

      {proposal.intelligenceKernelSummary ? (
        <details className="mt-3 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer text-foreground/80">Intelligence summary</summary>
          <p className="mt-2 leading-5">{proposal.intelligenceKernelSummary}</p>
        </details>
      ) : null}

      {kernelDecision ? (
        <details className="mt-3 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer text-foreground/80">Kernel routing evidence</summary>
          <div className="mt-3 grid gap-2 rounded-2xl border border-[hsl(var(--premium-border))] bg-black/24 p-3 sm:grid-cols-2">
            <div>
              <span className="text-foreground/75">Kernel Mode:</span> {kernelDecision.mode}
            </div>
            <div>
              <span className="text-foreground/75">Task Type:</span> {kernelDecision.taskType}
            </div>
            <div>
              <span className="text-foreground/75">Confidence:</span>{" "}
              {Math.round(kernelDecision.confidence * 100)}%
            </div>
            <div>
              <span className="text-foreground/75">Mutation Policy:</span>{" "}
              {kernelDecision.mutationPolicy}
            </div>
            <div>
              <span className="text-foreground/75">Provider Hint:</span>{" "}
              {kernelDecision.providerProfileHint ?? "none"}
            </div>
            <div>
              <span className="text-foreground/75">Framework Hint:</span>{" "}
              {kernelDecision.frameworkHint ?? "none"}
            </div>
          </div>
          <p className="mt-2 leading-5">{kernelDecision.routingExplanation}</p>

          {kernelDecision.constraints.length > 0 ? (
            <div className="mt-3">
              <div className="text-foreground/75">Extracted Constraints</div>
              <ul className="mt-1 space-y-1">
                {kernelDecision.constraints.slice(0, 6).map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {kernelDecision.risks.length > 0 ? (
            <div className="mt-3">
              <div className="text-foreground/75">Risks</div>
              <ul className="mt-1 space-y-1">
                {kernelDecision.risks.slice(0, 6).map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {kernelDecision.requiredChecks.length > 0 ? (
            <div className="mt-3">
              <div className="text-foreground/75">Required Checks</div>
              <ul className="mt-1 space-y-1">
                {kernelDecision.requiredChecks.slice(0, 7).map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

function ManualReviewNotice({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-[11px] leading-5 text-red-100">
      <div>{message}</div>
      <div className="mt-2 font-medium text-red-50">Try this next:</div>
      <ol className="mt-1 list-decimal space-y-1 pl-4 text-red-100/90">
        {manualReviewGuidance.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

export function RightSidebar({ isEditorOpen, onToggleEditor }: RightSidebarProps) {
  const messages = useChatStore((state) => state.messages);
  const input = useChatStore((state) => state.input);
  const model = useChatStore((state) => state.model);
  const productMode = useChatStore((state) => state.productMode);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const proposal = useChatStore((state) => state.proposal);
  const chatSessionId = useChatStore((state) => state.chatSessionId);
  const setInput = useChatStore((state) => state.setInput);
  const setModel = useChatStore((state) => state.setModel);
  const setProductMode = useChatStore((state) => state.setProductMode);
  const clearProposal = useChatStore((state) => state.clearProposal);
  const markProposalApproved = useChatStore((state) => state.markProposalApproved);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const isPreviewOpen = useRuntimeStore((state) => state.isPreviewOpen);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const togglePreview = useRuntimeStore((state) => state.togglePreview);
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const setWorkspaceError = useWorkspaceStore((state) => state.setError);
  const syncRuntimeFiles = useWorkspaceStore((state) => state.syncRuntimeFiles);
  const activeFile = files[activePath];
  const visibleFileList = Object.keys(files).filter(
    (path) => !path.endsWith(`/${folderPlaceholderFileName}`)
  );
  const isApprovalBlocked = proposal ? isBlockedProposal(proposal) : false;
  const isProposalApplied = proposal?.status === "approved";
  const regenerationInFlightRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [blockedRegenerationAttempts, setBlockedRegenerationAttempts] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [manualReviewMessage, setManualReviewMessage] = useState<string | null>(null);
  const [runtimeApprovalResult, setRuntimeApprovalResult] =
    useState<RuntimeApprovalResponse | null>(null);

  useEffect(() => {
    if (proposal?.status !== "approved") {
      setRuntimeApprovalResult(null);
    }

    if (!proposal) {
      if (!regenerationInFlightRef.current) {
        setBlockedRegenerationAttempts(0);
        setManualReviewMessage(null);
      }

      return;
    }

    if (!isBlockedProposal(proposal)) {
      regenerationInFlightRef.current = false;
      setBlockedRegenerationAttempts(0);
      setManualReviewMessage(null);
      return;
    }

    regenerationInFlightRef.current = false;
  }, [proposal]);

  const createWorkspaceContext = () => ({
    activeFileContent: activeFile?.content ?? "",
    activePath,
    chatSessionId,
    fileContents: Object.fromEntries(
      visibleFileList.map((path) => [path, files[path]?.content ?? ""])
    ),
    fileList: visibleFileList,
    projectId,
    projectName
  });

  const sendWithContext = () => sendMessage(createWorkspaceContext());

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionConstructor =
      (globalThis as SpeechGlobal).SpeechRecognition ??
      (globalThis as SpeechGlobal).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setWorkspaceError("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setWorkspaceError("Voice input stopped before Hassali could capture speech.");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        const nextInput = input.trim() ? `${input.trim()} ${transcript}` : transcript;

        setInput(nextInput);
      }
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const rejectAndRequestSaferProposal = () => {
    if (!proposal || !isBlockedProposal(proposal)) {
      return;
    }

    if (blockedRegenerationAttempts >= blockedRegenerationLimit) {
      setManualReviewMessage(manualReviewNeededMessage);
      return;
    }

    const followUpPrompt = createSaferProposalPrompt(proposal, getLatestOriginalRequest(messages));

    regenerationInFlightRef.current = true;
    setBlockedRegenerationAttempts((attempts) => attempts + 1);
    setManualReviewMessage(null);
    clearProposal();
    setInput(followUpPrompt);
    void sendMessage(createWorkspaceContext());
  };

  const approveProposal = async () => {
    if (!proposal) {
      return;
    }

    const validationError = validateProposalForApproval(proposal, projectId);

    if (validationError) {
      setWorkspaceError(validationError);
      return;
    }

    const selectedProjectId = projectId;

    if (!selectedProjectId) {
      setWorkspaceError("Select a project before approving this proposal.");
      return;
    }

    try {
      setRuntimeApprovalResult(null);
      const runtimeResult = await approveProposalThroughRuntime(proposal, selectedProjectId);

      if (runtimeResult) {
        const syncResult = syncRuntimeApprovalResult({
          activePath,
          currentFiles: files,
          projectId: selectedProjectId,
          proposalChanges: proposal.changes,
          proposalId: proposal.id,
          runtimeResult
        });

        if (!syncResult.proposalApplied) {
          throw new Error(
            syncResult.errors[0] ??
              syncResult.warnings[0] ??
              "Runtime completed, but Hassali could not sync the written files."
          );
        }

        syncRuntimeFiles(syncResult.fileUpdates);
        setRuntimeApprovalResult({
          ...runtimeResult,
          writtenFiles: syncResult.runtimeMetadata.runtimeWrittenFiles
        });

        if (syncResult.refreshedPreview) {
          await syncPreview(selectedProjectId);
        }

        markProposalApproved(syncResult.runtimeMetadata);
      }

      for (const change of proposal.changes) {
        if (change.action === "restart_runtime") {
          await startPreview(proposal.projectId);
        } else if (change.action === "reload_preview") {
          await syncPreview(proposal.projectId);
        } else if (change.action === "stop_runtime") {
          await stopPreview();
        }
      }

      if (!runtimeResult) {
        markProposalApproved();
      }
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Proposal apply failed. The proposal was not applied."
      );
    }
  };

  return (
    <Panel className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--premium-border))] bg-black/10 px-4 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {productMode === "ASK" ? "Ask" : productMode === "WEBSITE" ? "Website" : "Code"}
          </div>
          <div className="max-w-sm truncate text-[10px] leading-4 text-muted-foreground">
            {modeHints[productMode]}
          </div>
        </div>
        <div className="order-3 grid w-full grid-cols-3 gap-1 rounded-full border border-[hsl(var(--premium-border))] bg-black/35 p-0.5 md:order-none md:w-[29rem]">
          {productModes.map((item) => {
            const isActive = item.label === productMode;

            return (
              <button
                className={`rounded-full px-3 py-1 text-center transition ${
                  isActive
                    ? "bg-[hsl(var(--premium-paper))] text-black shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                }`}
                key={item.label}
                onClick={() => setProductMode(item.label)}
                type="button"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        {productMode !== "ASK" ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="rounded-full border border-[hsl(var(--premium-border))] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-foreground"
              onClick={onToggleEditor}
              type="button"
            >
              {isEditorOpen ? "Hide files" : "Files"}
            </button>
            <button
              className="rounded-full border border-[hsl(var(--premium-border))] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-foreground"
              onClick={togglePreview}
              type="button"
            >
              {isPreviewOpen ? "Hide preview" : "Preview"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-smooth px-4 py-4 lg:px-6">
          {messages.map((message) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 4 }}
              key={message.id}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={`mx-auto w-full max-w-4xl rounded-2xl border px-4 py-3 text-[13px] leading-6 ${
                message.role === "user"
                  ? "border-[hsl(var(--premium-accent)/0.25)] bg-[hsl(var(--premium-accent)/0.1)] text-[hsl(var(--premium-paper))]"
                  : "border-white/10 bg-white/[0.035] text-[#c7c1b4]"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 font-medium text-foreground">
                <span>{message.role === "user" ? "You" : "Hassali"}</span>
                {message.role === "assistant" && isStreaming && message.content.length === 0 ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8b7cf6] shadow-[0_0_16px_rgba(139,124,246,0.55)]" />
                ) : null}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {message.content || "Thinking quietly..."}
              </div>
            </motion.div>
          ))}
          {proposal ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-4xl rounded-[22px] border border-white/10 bg-white/[0.045] p-4 text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              initial={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">
                    {productMode === "WEBSITE"
                      ? "Website proposal"
                      : productMode === "CODE"
                        ? "Code proposal"
                        : "Review proposal"}
                  </div>
                  <div className="mt-1 text-muted-foreground">{proposal.summary}</div>
                  {proposal.mode === "EXECUTE" ? (
                    <div className="mt-1 text-[11px] text-[#a59bff]">
                      Approval is required before any file or preview action runs.
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full border border-[#7c6cff]/25 px-2 py-1 text-[10px] text-[#a59bff]">
                  pending
                </span>
              </div>
              <ProposalReviewState proposal={proposal} />

              <div className="mt-3 space-y-3">
                {proposal.changes.map((change) => (
                  <div
                    className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.42)] p-3"
                    key={`${proposal.id}-${change.action}-${change.path ?? change.summary}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-foreground">
                        {change.path ?? "preview runtime"}
                      </span>
                      <span className="rounded-full border border-[hsl(var(--royal-border-soft))] px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {change.action}
                      </span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{change.summary}</p>
                    {change.diffPreview ? (
                      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--royal-border-soft))] bg-black/35 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                        {change.diffPreview}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>

              {manualReviewMessage ? <ManualReviewNotice message={manualReviewMessage} /> : null}
              {runtimeApprovalResult ? (
                <div className="mt-3 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">
                  Runtime approval {runtimeApprovalResult.runnerStatus ?? "completed"}.
                  {runtimeApprovalResult.writtenFiles?.length
                    ? ` Verified ${runtimeApprovalResult.writtenFiles.length} file change(s).`
                    : null}
                  {proposal.runtimeSyncStatus
                    ? ` Sync ${proposal.runtimeSyncStatus}.`
                    : null}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-end gap-2">
                {isApprovalBlocked ? (
                  <button
                    className="rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:border-red-300/45 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isStreaming}
                    onClick={rejectAndRequestSaferProposal}
                    type="button"
                  >
                    Reject and ask for safer proposal
                  </button>
                ) : null}
                <button
                  className="rounded-xl border border-[hsl(var(--royal-border-soft))] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearProposal}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="rounded-xl border border-[#7c6cff]/35 bg-[#7c6cff] px-3 py-1.5 text-xs font-medium text-white shadow-[0_12px_30px_rgba(124,108,255,0.18)] hover:bg-[#8b7cf6] disabled:cursor-not-allowed disabled:border-red-500/20 disabled:bg-red-500/10 disabled:text-red-200/60 disabled:shadow-none disabled:hover:opacity-100"
                  disabled={isApprovalBlocked || isProposalApplied}
                  onClick={() => {
                    void approveProposal();
                  }}
                  type="button"
                >
                  {isApprovalBlocked ? "Approval blocked" : isProposalApplied ? "Applied" : "Approve"}
                </button>
              </div>
            </motion.div>
          ) : null}
        </div>

        <form
          className="shrink-0 border-t border-white/10 bg-[#0b0b0b] px-4 py-3 lg:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void sendWithContext();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-[28px] border border-white/10 bg-[#1d1d1d] px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] focus-within:border-[#7c6cff]/55 focus-within:ring-2 focus-within:ring-[#7c6cff]/10">
            <button
              aria-label="Add context"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none text-muted-foreground hover:bg-white/[0.04] hover:text-foreground [.light_&]:hover:bg-slate-200 [.light_&]:hover:text-slate-950"
              type="button"
            >
              +
            </button>
            <textarea
              className="max-h-28 min-h-[40px] flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-[14px] leading-5 text-[#f4f1e8] outline-none placeholder:text-muted-foreground"
              onChange={(event) =>
                setInput((event.currentTarget as unknown as { value: string }).value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendWithContext();
                }
              }}
              placeholder={
                productMode === "WEBSITE"
                  ? "Build or refine a premium website. Mention pages, style, images, products, colors, or animations..."
                  : productMode === "CODE"
                    ? "Build an app, tool, system, API, automation, or technical workflow..."
                    : "Ask Hassali anything. Explain, plan, learn, debug, compare, or think through an idea..."
              }
              value={input}
            />
            <div className="mb-0.5 hidden w-44 shrink-0 sm:block">
              <PremiumSelect
                compact
                label="Model"
                onChange={setModel}
                options={modelOptions}
                value={model}
              />
            </div>
            <button
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                isListening
                  ? "border-[#7c6cff]/45 bg-[#7c6cff]/20 text-[#d8d2ff]"
                  : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
              }`}
              onClick={toggleVoiceInput}
              type="button"
            >
              <MicIcon />
            </button>
            <button
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#7c6cff]/35 bg-[#7c6cff] text-[10px] font-semibold text-white shadow-[0_14px_34px_rgba(124,108,255,0.18)] hover:bg-[#8b7cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6cff]/20 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isStreaming || input.trim().length === 0}
              type="submit"
            >
              Go
            </button>
          </div>
        </form>
      </div>
    </Panel>
  );
}
