"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { HassaliActivityMascot } from "@/components/ai/hassali-activity-mascot";
import { ApprovalPolicyControl } from "@/components/shell/approval-policy-control";
import { Panel } from "@/components/ui/panel";
import { PremiumSelect } from "@/components/ui/premium-select";
import {
  isProposalApprovalBlocked,
  normalizeApprovalDecision,
  type ChatMessage,
  type DiffProposal,
  type ProductMode,
  useChatStore
} from "@/lib/chat-store";
import { selectWorkspaceContentPaths } from "@/lib/chat-request-context";
import {
  deriveAssistantActivity,
  hasMeaningfulAssistantOutput
} from "@/lib/assistant-activity";
import { canApplyWithProjectApprovalPolicy } from "@/lib/approval-policy";
import { useApprovalPolicyStore } from "@/lib/approval-policy-store";
import { getHassaliModelOptions } from "@/lib/model-registry";
import { boundedProjectNotesContext, useProjectNotesStore } from "@/lib/project-notes-store";
import {
  type RuntimeApprovalResponse,
  syncRuntimeApprovalResult
} from "@/lib/runtime-result-sync";
import { useRuntimeStore } from "@/lib/runtime-store";
import { folderPlaceholderFileName, useWorkspaceStore } from "@/lib/workspace-store";
import { normalizeSafeProjectPath } from "@/lib/utils/path";
import {
  attachmentKindLabel,
  attachmentLimits,
  type AttachmentFailureCode,
  type HassaliAttachment
} from "@/lib/attachments";

const modelOptions = getHassaliModelOptions();

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
const activeModeClasses: Record<ProductMode, string> = {
  ASK: "bg-[#57A8FF] text-[#0B0D10] shadow-[0_8px_22px_rgba(87,168,255,0.2)]",
  WEBSITE: "bg-[#9D7BFF] text-[#0B0D10] shadow-[0_8px_22px_rgba(157,123,255,0.2)]",
  CODE: "bg-[#FF7A3C] text-[#0B0D10] shadow-[0_8px_22px_rgba(255,122,60,0.2)]"
};
type ChatScrollBehavior = "auto" | "smooth";
type ChatScrollContainer = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  scrollTo: (options: { behavior: ChatScrollBehavior; top: number }) => void;
};
type AnimationGlobal = {
  cancelAnimationFrame: (handle: number) => void;
  requestAnimationFrame: (callback: () => void) => number;
};
type UploadProgressEvent = { lengthComputable: boolean; loaded: number; total: number };
type UploadRequest = {
  abort: () => void;
  onerror: (() => void) | null;
  onload: (() => void) | null;
  open: (method: string, url: string) => void;
  responseText: string;
  send: (body: FormData) => void;
  status: number;
  upload: { onprogress: ((event: UploadProgressEvent) => void) | null };
};
type UploadGlobal = {
  XMLHttpRequest?: new () => UploadRequest;
};
type ComposerUpload = {
  attachment?: HassaliAttachment;
  clientId: string;
  error?: string;
  errorCode?: AttachmentFailureCode;
  file: File;
  progress: number;
  status: "failed" | "ready" | "uploading";
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
  return action === "create" || action === "modify" || action === "update" || action === "write_file";
}

function isDeleteProposalAction(action: string) {
  return action === "delete_file";
}

function isRuntimeProposalAction(action: string) {
  return action === "restart_runtime" ||
    action === "reload_preview" ||
    action === "stop_runtime" ||
    action === "start_runtime" ||
    action === "run_dev_server";
}

function normalizeProposalPath(value: unknown) {
  const normalized = normalizeSafeProjectPath(value);

  if (!normalized || normalized === folderPlaceholderFileName || normalized.endsWith(`/${folderPlaceholderFileName}`)) {
    return null;
  }

  return normalized;
}

function validateProposalForApproval(proposal: DiffProposal, selectedProjectId: string | null) {
  const approvalDecision = normalizeApprovalDecision(proposal);

  if (approvalDecision.hasCriticalIssues) {
    return `This proposal has critical approval issues: ${approvalDecision.criticalIssues.join("; ")}`;
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
    if (isDeleteProposalAction(change.action)) {
      if (!normalizeProposalPath(change.path)) {
        return "This proposal contains an invalid delete path. Recreate it before approving.";
      }
      continue;
    }

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
  return proposal.changes.filter((change) => isFileProposalAction(change.action) || isDeleteProposalAction(change.action));
}

function runtimeApprovalMessage(status: number, payload: RuntimeApprovalResponse | null) {
  const backendError =
    payload?.errors?.find((item) => item.trim().length > 0) ??
    payload?.blockedSteps
      ?.flatMap((step) => step.reasons ?? [])
      .map((reason) => reason.message)
      .find((message): message is string => Boolean(message?.trim()));

  return `File approval failed. Backend returned ${status}: ${backendError ?? "Approved file runner rejected the proposal."}`;
}

async function approveProposalThroughRuntime(
  proposal: DiffProposal,
  selectedProjectId: string,
  productMode: ProductMode,
  approvalPolicy: "approve_for_me" | "ask" | "full_project_access",
  approvalSource: "inline_approval" | "standing_policy"
) {
  const fileChanges = fileProposalChanges(proposal);

  if (fileChanges.length === 0) {
    return null;
  }

  const response = await fetch("/api/runtime/approve", {
    body: JSON.stringify({
      approvalPolicy,
      approvalSource,
      productMode,
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
  return isProposalApprovalBlocked(proposal);
}

function proposalReviewMode(proposal: DiffProposal) {
  return proposal.executionMode ??
    proposal.kernelRoutingDecision?.mode ??
    (proposal.generatorMode === "code_generation" ? "CODE" : proposal.generatorMode === "website_generation" ? "WEBSITE" : null);
}

function isReviewMessageVisibleForMode(message: string, mode: "ASK" | "CODE" | "WEBSITE" | null | undefined) {
  const normalized = message.toLowerCase();

  if (mode === "CODE" && normalized.includes("website intent")) {
    return false;
  }

  if (mode === "WEBSITE" && normalized.includes("code_system_generation")) {
    return false;
  }

  return true;
}

function blockedProposalReasons(proposal: DiffProposal) {
  const decision = normalizeApprovalDecision(proposal);
  const mode = proposalReviewMode(proposal);

  if (decision.hasCriticalIssues) {
    return decision.criticalIssues.filter((issue) => isReviewMessageVisibleForMode(issue, mode));
  }

  return (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .filter((reason) => isReviewMessageVisibleForMode(reason.message, mode))
    .map((reason) => reason.message);
}

function blockedProposalWarnings(proposal: DiffProposal) {
  const decision = normalizeApprovalDecision(proposal);

  return decision.warnings.length
    ? decision.warnings
    : (proposal.proposalRoutingWarnings ?? []).map((warning) => warning.message);
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
  const mode = proposalReviewMode(proposal);
  const warnings = (proposal.proposalRoutingWarnings ?? [])
    .filter((warning) => isReviewMessageVisibleForMode(warning.message, mode));
  const visibleReasons = (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .filter((reason) => isReviewMessageVisibleForMode(reason.message, mode))
    .slice(0, 3);
  const kernelDecision = proposal.kernelRoutingDecision;
  const selfReview = proposal.selfReview;
  const selfReviewTopIssues = selfReview
    ? [...selfReview.failures, ...selfReview.warnings].slice(0, 3)
    : [];
  const selfReviewConfidence = proposal.selfReviewConfidence ?? selfReview?.confidence;
  const selfReviewStatus = proposal.selfReviewStatus ?? selfReview?.overallStatus;
  const selfReviewWarningCount = proposal.selfReviewWarningCount ?? selfReview?.warnings.length ?? 0;
  const selfReviewFailureCount = proposal.selfReviewFailureCount ?? selfReview?.failures.length ?? 0;

  return (
    <div className="mt-3 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.28)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${reviewState.className}`}>
          {reviewState.badge}
        </span>
        <span className="text-[11px] leading-5 text-muted-foreground">{reviewState.message}</span>
      </div>

      {selfReviewStatus ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2">
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
            <div>
              <span className="text-foreground/75">Score</span>
              <br />
              {selfReviewConfidence ?? 0}%
            </div>
            <div>
              <span className="text-foreground/75">Status</span>
              <br />
              {selfReviewStatus}
            </div>
            <div>
              <span className="text-foreground/75">Warnings</span>
              <br />
              {selfReviewWarningCount}
            </div>
            <div>
              <span className="text-foreground/75">Failures</span>
              <br />
              {selfReviewFailureCount}
            </div>
          </div>
          {selfReviewTopIssues.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {selfReviewTopIssues.map((issue) => (
                <div className="text-[11px] leading-5 text-muted-foreground" key={issue.id}>
                  <span className={issue.severity === "critical" || issue.severity === "high" ? "text-red-200" : "text-amber-100"}>
                    {issue.ruleId}
                  </span>{" "}
                  {issue.title}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
  const modelSelectionPolicy = useChatStore((state) => state.modelSelectionPolicy);
  const productMode = useChatStore((state) => state.productMode);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const proposal = useChatStore((state) => state.proposal);
  const chatSessionId = useChatStore((state) => state.chatSessionId);
  const setInput = useChatStore((state) => state.setInput);
  const setModel = useChatStore((state) => state.setModel);
  const setModelSelectionPolicy = useChatStore((state) => state.setModelSelectionPolicy);
  const activateHandoff = useChatStore((state) => state.activateHandoff);
  const setProductMode = useChatStore((state) => state.setProductMode);
  const clearProposal = useChatStore((state) => state.clearProposal);
  const markProposalApproved = useChatStore((state) => state.markProposalApproved);
  const cancelMessage = useChatStore((state) => state.cancelMessage);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const isPreviewOpen = useRuntimeStore((state) => state.isPreviewOpen);
  const applyRuntimePayload = useRuntimeStore((state) => state.applyRuntimePayload);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const togglePreview = useRuntimeStore((state) => state.togglePreview);
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const setWorkspaceError = useWorkspaceStore((state) => state.setError);
  const syncRuntimeFiles = useWorkspaceStore((state) => state.syncRuntimeFiles);
  const approvalPolicy = useApprovalPolicyStore((state) => state.policy);
  const approvalPolicyProjectId = useApprovalPolicyStore((state) => state.activeProjectId);
  const notesProjectId = useProjectNotesStore((state) => state.activeProjectId);
  const projectNotes = useProjectNotesStore((state) => state.notes);
  const useProjectNotesAsContext = useProjectNotesStore((state) => state.useAsContext);
  const activeFile = files[activePath];
  const visibleFileList = Object.keys(files).filter(
    (path) => !path.endsWith(`/${folderPlaceholderFileName}`)
  );
  const isApprovalBlocked = proposal ? isBlockedProposal(proposal) : false;
  const approvalDecision = proposal ? normalizeApprovalDecision(proposal) : null;
  const isProposalApplied = proposal?.status === "approved";
  const standingApprovalPending = Boolean(
    proposal &&
    approvalPolicyProjectId === projectId &&
    canApplyWithProjectApprovalPolicy(approvalPolicy, proposal)
  );
  const regenerationInFlightRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const autoApprovalProposalRef = useRef<string | null>(null);
  const autoFollowRef = useRef(true);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const uploadRequestsRef = useRef(new Map<string, UploadRequest>());
  const [blockedRegenerationAttempts, setBlockedRegenerationAttempts] = useState(0);
  const [isAwayFromLatest, setIsAwayFromLatest] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [manualReviewMessage, setManualReviewMessage] = useState<string | null>(null);
  const [runtimeApprovalResult, setRuntimeApprovalResult] =
    useState<RuntimeApprovalResponse | null>(null);
  const [composerUploads, setComposerUploads] = useState<ComposerUpload[]>([]);
  const attachmentUploadPending = composerUploads.some((upload) => upload.status === "uploading");
  const attachmentUploadFailed = composerUploads.some((upload) => upload.status === "failed");

  useEffect(() => () => {
    for (const request of uploadRequestsRef.current.values()) request.abort();
    uploadRequestsRef.current.clear();
  }, []);

  useEffect(() => {
    for (const request of uploadRequestsRef.current.values()) request.abort();
    uploadRequestsRef.current.clear();
    setComposerUploads([]);
  }, [projectId]);

  const uploadOne = (item: ComposerUpload) => {
    if (!projectId) {
      setWorkspaceError("Select a project before adding attachments.");
      return;
    }
    const UploadRequestConstructor = (globalThis as UploadGlobal).XMLHttpRequest;
    if (!UploadRequestConstructor) {
      setComposerUploads((uploads) => uploads.map((upload) => upload.clientId === item.clientId
        ? { ...upload, error: "This browser cannot upload files.", errorCode: "UPLOAD_FAILED", progress: 0, status: "failed" }
        : upload));
      return;
    }
    const request = new UploadRequestConstructor();
    const data = new FormData();
    data.append("file", item.file);
    data.append("projectId", projectId);
    data.append("conversationId", chatSessionId ?? `draft-${projectId}`);
    data.append("storageScope", "conversation");
    uploadRequestsRef.current.set(item.clientId, request);
    setComposerUploads((uploads) => uploads.map((upload) => upload.clientId === item.clientId
      ? { ...upload, error: undefined, errorCode: undefined, progress: 0, status: "uploading" }
      : upload));
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      setComposerUploads((uploads) => uploads.map((upload) => upload.clientId === item.clientId
        ? { ...upload, progress }
        : upload));
    };
    request.onload = () => {
      uploadRequestsRef.current.delete(item.clientId);
      const payload = (() => {
        try {
          return JSON.parse(request.responseText) as { attachment?: HassaliAttachment; code?: AttachmentFailureCode; error?: string };
        } catch {
          return null;
        }
      })();
      if (request.status >= 200 && request.status < 300 && payload?.attachment) {
        setComposerUploads((uploads) => uploads.map((upload) => upload.clientId === item.clientId
          ? { ...upload, attachment: payload.attachment, progress: 100, status: "ready" }
          : upload));
        return;
      }
      setComposerUploads((uploads) => uploads.map((upload) => upload.clientId === item.clientId
        ? {
            ...upload,
            error: payload?.error ?? "Attachment upload failed.",
            errorCode: payload?.code ?? "UPLOAD_FAILED",
            progress: 0,
            status: "failed"
          }
        : upload));
    };
    request.onerror = () => {
      uploadRequestsRef.current.delete(item.clientId);
      setComposerUploads((uploads) => uploads.map((upload) => upload.clientId === item.clientId
        ? { ...upload, error: "Attachment upload failed.", errorCode: "UPLOAD_FAILED", progress: 0, status: "failed" }
        : upload));
    };
    request.open("POST", "/api/attachments");
    request.send(data);
  };

  const addAttachments = (selected: File[]) => {
    if (!projectId) {
      setWorkspaceError("Select a project before adding attachments.");
      return;
    }
    const remaining = attachmentLimits.filesPerMessage - composerUploads.length;
    const files = selected.slice(0, Math.max(0, remaining));
    const existingBytes = composerUploads.reduce((total, upload) => total + upload.file.size, 0);
    let nextBytes = existingBytes;
    const accepted: ComposerUpload[] = [];
    for (const file of files) {
      if (file.size > attachmentLimits.individualFileBytes) {
        accepted.push({
          clientId: crypto.randomUUID(),
          error: `Files are limited to ${attachmentLimits.individualFileBytes / 1024 / 1024} MB each.`,
          errorCode: "FILE_TOO_LARGE",
          file,
          progress: 0,
          status: "failed"
        });
        continue;
      }
      if (nextBytes + file.size > attachmentLimits.totalMessageBytes) {
        accepted.push({
          clientId: crypto.randomUUID(),
          error: "These attachments exceed the 20 MB per-message limit.",
          errorCode: "TOTAL_LIMIT_EXCEEDED",
          file,
          progress: 0,
          status: "failed"
        });
        continue;
      }
      nextBytes += file.size;
      accepted.push({ clientId: crypto.randomUUID(), file, progress: 0, status: "uploading" });
    }
    if (selected.length > remaining) setWorkspaceError(`Up to ${attachmentLimits.filesPerMessage} attachments can be sent at once.`);
    setComposerUploads((uploads) => [...uploads, ...accepted]);
    accepted.filter((item) => item.status === "uploading").forEach(uploadOne);
  };

  const removeAttachment = (item: ComposerUpload) => {
    uploadRequestsRef.current.get(item.clientId)?.abort();
    uploadRequestsRef.current.delete(item.clientId);
    setComposerUploads((uploads) => uploads.filter((upload) => upload.clientId !== item.clientId));
    if (item.attachment && projectId) {
      void fetch(`/api/attachments/${item.attachment.id}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
    }
  };

  const scrollToLatest = (behavior: ChatScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current as unknown as ChatScrollContainer | null;
    if (!container) return;

    autoFollowRef.current = true;
    setIsAwayFromLatest(false);
    container.scrollTo({ behavior, top: container.scrollHeight });
  };

  const scheduleAutoFollow = (behavior: ChatScrollBehavior = "auto") => {
    if (!autoFollowRef.current || scrollAnimationFrameRef.current !== null) return;

    scrollAnimationFrameRef.current = (globalThis as unknown as AnimationGlobal).requestAnimationFrame(() => {
      scrollAnimationFrameRef.current = null;
      scrollToLatest(behavior);
    });
  };

  useEffect(() => () => {
    if (scrollAnimationFrameRef.current !== null) {
      (globalThis as unknown as AnimationGlobal).cancelAnimationFrame(scrollAnimationFrameRef.current);
    }
  }, []);

  useEffect(() => {
    scheduleAutoFollow(isStreaming ? "auto" : "smooth");
  }, [isStreaming, messages, proposal?.id, proposal?.status, runtimeApprovalResult]);

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

  const createWorkspaceContext = () => {
    const contentPaths = selectWorkspaceContentPaths({
      messages,
      mode: productMode,
      prompt: input,
      workspace: {
        activePath,
        fileList: visibleFileList,
        projectName
      }
    });
    const activeFileSelected = contentPaths.includes(activePath);

    return {
      attachmentIds: composerUploads.flatMap((upload) => upload.status === "ready" && upload.attachment ? [upload.attachment.id] : []),
      attachments: composerUploads.flatMap((upload) => upload.status === "ready" && upload.attachment
        ? [{
            id: upload.attachment.id,
            kind: upload.attachment.kind,
            mimeType: upload.attachment.mimeType,
            safeName: upload.attachment.safeName,
            sizeBytes: upload.attachment.sizeBytes
          }]
        : []),
      activeFileContent: activeFileSelected ? activeFile?.content ?? "" : "",
      activePath,
      approvalPolicy: approvalPolicyProjectId === projectId ? approvalPolicy : "ask",
      chatSessionId,
      fileContents: Object.fromEntries(
        contentPaths.map((path) => [path, files[path]?.content ?? ""])
      ),
      fileList: visibleFileList,
      projectId,
      projectName,
      projectNotes: productMode === "ASK" && notesProjectId === projectId
        ? boundedProjectNotesContext(projectNotes)
        : "",
      useProjectNotesAsContext: productMode === "ASK" &&
        notesProjectId === projectId &&
        useProjectNotesAsContext
    };
  };

  const sendWithContext = () => {
    const result = sendMessage(createWorkspaceContext());
    if (input.trim() && composerUploads.every((upload) => upload.status === "ready")) {
      setComposerUploads([]);
    }
    autoFollowRef.current = true;
    setIsAwayFromLatest(false);
    scheduleAutoFollow("smooth");
    return result;
  };
  const activeAssistantMessageId = isStreaming
    ? [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null
    : null;

  const prepareProviderRetry = (policy: "automatic" | "locked") => {
    setModelSelectionPolicy(policy);
    setInput(getLatestOriginalRequest(messages));
  };

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

  const approveProposal = async (approvalSource: "inline_approval" | "standing_policy" = "inline_approval") => {
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
      const effectiveApprovalPolicy = approvalPolicyProjectId === selectedProjectId ? approvalPolicy : "ask";
      const runtimeResult = await approveProposalThroughRuntime(
        proposal,
        selectedProjectId,
        productMode,
        effectiveApprovalPolicy,
        approvalSource
      );

      if (runtimeResult) {
        if (useWorkspaceStore.getState().projectId !== selectedProjectId) {
          throw new Error("The selected project changed while approval was running. Reload the current project before syncing results.");
        }
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

        syncRuntimeFiles(syncResult.fileUpdates, syncResult.deletedFiles);
        setRuntimeApprovalResult({
          ...runtimeResult,
          writtenFiles: syncResult.runtimeMetadata.runtimeWrittenFiles
        });

        const viteRuntime = runtimeResult.viteRuntime;
        const viteRuntimeStarted = viteRuntime?.runtimeStatus === "running" && viteRuntime.previewUrl;
        const nextRuntime = runtimeResult.nextRuntime;
        const nextRuntimeStarted = nextRuntime?.runtimeStatus === "running" && nextRuntime.previewUrl;
        const backendRuntime = runtimeResult.backendExecutionRuntime;
        const backendRuntimeStarted = backendRuntime?.runtimeStatus === "running" && backendRuntime.previewUrl;
        const postApplyPreview = runtimeResult.postApplyPreview;
        const verifiedPostApplyPreview = Boolean(
          postApplyPreview?.previewReady &&
          postApplyPreview.readinessVerified &&
          postApplyPreview.previewUrl
        );

        if (verifiedPostApplyPreview && postApplyPreview) {
          applyRuntimePayload({
            error: null,
            logs: [postApplyPreview.summary],
            port: postApplyPreview.port,
            previewUrl: postApplyPreview.previewUrl,
            projectId: selectedProjectId,
            status: "running",
            workspacePath: postApplyPreview.workspacePath
          });
        } else if (viteRuntimeStarted) {
          applyRuntimePayload({
            error: viteRuntime.error,
            logs: viteRuntime.logs,
            port: viteRuntime.port,
            previewUrl: viteRuntime.previewUrl,
            projectId: selectedProjectId,
            status: "running",
            workspacePath: viteRuntime.workspaceRoot
          });
        }

        if (!verifiedPostApplyPreview && nextRuntimeStarted) {
          applyRuntimePayload({
            error: nextRuntime.error,
            logs: nextRuntime.logs,
            port: nextRuntime.port,
            previewUrl: nextRuntime.previewUrl,
            projectId: selectedProjectId,
            status: "running",
            workspacePath: nextRuntime.workspaceRoot
          });
        }

        if (!verifiedPostApplyPreview && backendRuntimeStarted) {
          applyRuntimePayload({
            error: backendRuntime.error,
            logs: backendRuntime.logs,
            port: backendRuntime.port,
            previewUrl: backendRuntime.previewUrl,
            projectId: selectedProjectId,
            status: "running",
            workspacePath: backendRuntime.workspaceRoot
          });
        }

        if (!verifiedPostApplyPreview && !viteRuntimeStarted && !nextRuntimeStarted && !backendRuntimeStarted && runtimeResult.runtimeStartStatus) {
          applyRuntimePayload({
            error: postApplyPreview?.failureDetails ?? runtimeResult.runtimeStartError ?? runtimeResult.runtimeWarning ?? null,
            logs: [
              postApplyPreview?.summary,
              ...(postApplyPreview?.recoverySteps ?? []),
              runtimeResult.runtimeWarning
            ].filter((message): message is string => Boolean(message)),
            port: null,
            previewUrl: null,
            projectId: selectedProjectId,
            status:
              runtimeResult.runtimeStartStatus === "blocked"
                ? "blocked"
                : runtimeResult.runtimeStartStatus === "failed"
                  ? "error"
                  : "stopped",
            workspacePath: runtimeResult.workspaceRoot ?? null
          });
        }

        if (
          syncResult.refreshedPreview &&
          !postApplyPreview &&
          !viteRuntimeStarted &&
          !nextRuntimeStarted &&
          !backendRuntimeStarted
        ) {
          await syncPreview(selectedProjectId);
        }

        markProposalApproved(syncResult.runtimeMetadata);
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

  useEffect(() => {
    if (
      isStreaming ||
      !proposal ||
      !projectId ||
      approvalPolicyProjectId !== projectId ||
      autoApprovalProposalRef.current === proposal.id ||
      !canApplyWithProjectApprovalPolicy(approvalPolicy, proposal)
    ) {
      return;
    }

    autoApprovalProposalRef.current = proposal.id;
    void approveProposal("standing_policy");
  }, [approvalPolicy, approvalPolicyProjectId, isStreaming, projectId, proposal]);

  return (
    <Panel className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--premium-border))] bg-[#12161C]/80 px-3 py-2 [.light_&]:bg-white sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {productMode === "ASK" ? "Ask" : productMode === "WEBSITE" ? "Website" : "Code"}
          </div>
          <div className="max-w-sm truncate text-[10px] leading-4 text-muted-foreground">
            {modeHints[productMode]}
          </div>
        </div>
        <div className="order-3 grid w-full grid-cols-3 gap-1 rounded-lg border border-[hsl(var(--premium-border))] bg-black/25 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] [.light_&]:border-[#d8d1c6] [.light_&]:bg-[#F4F3EE] md:order-none md:w-[29rem]">
          {productModes.map((item) => {
            const isActive = item.label === productMode;

            return (
              <button
                aria-pressed={isActive}
                className={`min-h-8 rounded-md px-3 py-1 text-center transition ${
                  isActive
                    ? activeModeClasses[item.label]
                    : "text-[#F4F3EE]/80 hover:bg-white/[0.06] hover:text-[#F4F3EE] [.light_&]:text-[#000000] [.light_&]:hover:bg-white [.light_&]:hover:text-[#000000]"
                }`}
                data-mode-option={item.label}
                key={item.label}
                onClick={() => {
                  setProductMode(item.label);
                  setRuntimeApprovalResult(null);
                  applyRuntimePayload({
                    error: null,
                    logs: [],
                    port: null,
                    previewUrl: null,
                    projectId,
                    status: "stopped",
                    workspacePath: null
                  });
                }}
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
              className="rounded-full border border-[hsl(var(--premium-border))] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#F4F3EE]/75 hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-[#F4F3EE] [.light_&]:border-[#d8d1c6] [.light_&]:bg-white [.light_&]:text-[#000000] [.light_&]:hover:border-[#DE7356]"
              onClick={onToggleEditor}
              type="button"
            >
              {isEditorOpen ? "Hide files" : "Files"}
            </button>
            <button
              className="rounded-full border border-[hsl(var(--premium-border))] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#F4F3EE]/75 hover:border-[hsl(var(--premium-accent)/0.5)] hover:text-[#F4F3EE] [.light_&]:border-[#d8d1c6] [.light_&]:bg-white [.light_&]:text-[#000000] [.light_&]:hover:border-[#DE7356]"
              onClick={togglePreview}
              type="button"
            >
              {isPreviewOpen ? "Hide preview" : "Preview"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-smooth px-4 py-4 lg:px-6"
          data-chat-scroll-container
          onScroll={(event) => {
            const container = event.currentTarget as unknown as ChatScrollContainer;
            const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 96;

            autoFollowRef.current = nearBottom;
            setIsAwayFromLatest(!nearBottom);
          }}
          ref={scrollContainerRef}
        >
          {messages.map((message) => {
            const activity = deriveAssistantActivity({
              hasVisibleOutput: hasMeaningfulAssistantOutput(message.content),
              isRequestActive: isStreaming && message.id === activeAssistantMessageId,
              mode: productMode
            });

            return (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 4 }}
                key={message.id}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className={`mx-auto w-full max-w-4xl rounded-2xl border px-4 py-3 text-[13px] leading-6 ${
                  message.role === "user"
                    ? "border-[hsl(var(--premium-accent)/0.25)] bg-[hsl(var(--premium-accent)/0.1)] text-[hsl(var(--premium-paper))] [.light_&]:text-[#000000]"
                    : "border-white/10 bg-white/[0.035] text-[#e8dfcf] [.light_&]:border-slate-200 [.light_&]:bg-white [.light_&]:text-slate-900"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 font-medium text-foreground">
                  <span>{message.role === "user" ? "You" : "Hassali"}</span>
                </div>
                {message.attachments?.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5" data-message-attachments>
                    {message.attachments.map((attachment) => (
                      <span
                        className="rounded-md border border-white/10 bg-black/15 px-2 py-0.5 text-[10px] text-muted-foreground [.light_&]:bg-white/70"
                        key={attachment.id}
                      >
                        {attachmentKindLabel(attachment.kind)} · {attachment.safeName}
                      </span>
                    ))}
                  </div>
                ) : null}
                {message.role === "assistant" && projectId && message.attachments?.some((attachment) => attachment.kind === "image") ? (
                  <div className="mb-3 grid gap-2 sm:grid-cols-2" data-generated-images>
                    {message.attachments.filter((attachment) => attachment.kind === "image").map((attachment) => (
                      <span
                        aria-label={`Generated image ${attachment.safeName}`}
                        className="block aspect-[4/3] min-h-36 rounded-md border border-white/10 bg-black/20 bg-contain bg-center bg-no-repeat"
                        key={attachment.id}
                        role="img"
                        style={{ backgroundImage: `url("/api/attachments/${attachment.id}?projectId=${encodeURIComponent(projectId)}")` }}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="min-h-7 whitespace-pre-wrap break-words">
                  {activity.visibility === "pre-output" ? (
                    <HassaliActivityMascot
                      active
                      label={activity.label}
                    />
                  ) : message.content}
                </div>
              {message.handoff ? (
                <div
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[hsl(var(--premium-accent)/0.25)] bg-[hsl(var(--premium-accent)/0.08)] px-3 py-2 text-[11px] leading-4"
                  data-mode-handoff={message.handoff.targetMode}
                >
                  <div>
                    <div className="font-medium text-foreground">Prepared for {message.handoff.targetMode}</div>
                    <div className="text-muted-foreground">Review the carried objective and continue only when you explicitly open the target mode.</div>
                  </div>
                  <button
                    className="rounded-lg border border-[hsl(var(--premium-accent)/0.35)] px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-[hsl(var(--premium-accent)/0.15)]"
                    data-handoff-target={message.handoff.targetMode}
                    disabled={isStreaming}
                    onClick={() => activateHandoff(message.handoff!)}
                    type="button"
                  >
                    Open in {message.handoff.targetMode}
                  </button>
                </div>
              ) : null}
              {message.role === "assistant" && message.responseKind === "provider_failure" ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <button
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-muted-foreground hover:text-foreground"
                    disabled={isStreaming}
                    onClick={() => prepareProviderRetry("locked")}
                    type="button"
                  >
                    Retry selected model
                  </button>
                  {modelSelectionPolicy === "locked" ? (
                    <button
                      className="rounded-lg border border-[hsl(var(--premium-accent)/0.35)] px-2.5 py-1 text-foreground hover:bg-[hsl(var(--premium-accent)/0.15)]"
                      disabled={isStreaming}
                      onClick={() => prepareProviderRetry("automatic")}
                      type="button"
                    >
                      Use automatic fallback
                    </button>
                  ) : null}
                </div>
              ) : null}
              </motion.div>
            );
          })}
          {proposal ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-4xl rounded-[22px] border border-white/10 bg-white/[0.045] p-4 text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.02)] [.light_&]:border-[#d8d1c6] [.light_&]:bg-white [.light_&]:text-[#000000]"
              data-website-proposal={productMode === "WEBSITE" ? "true" : undefined}
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
                    <div className="mt-1 text-[11px] text-[hsl(var(--premium-accent-soft))]">
                      Approval is required before any file or preview action runs.
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full border border-[hsl(var(--premium-accent)/0.25)] px-2 py-1 text-[10px] text-[hsl(var(--premium-accent-soft))]">
                  {proposal.status}
                </span>
              </div>
              <details className="mt-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-foreground/85">
                  View {proposal.changes.length} proposed change{proposal.changes.length === 1 ? "" : "s"} and safety review
                </summary>
                <ProposalReviewState proposal={proposal} />

                <div className="mt-3 space-y-2">
                  {proposal.changes.map((change) => (
                    <div
                      className="rounded-lg border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.42)] p-3 [.light_&]:border-[#d8d1c6] [.light_&]:bg-[#F4F3EE]"
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
              </details>

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
                  {runtimeApprovalResult.runtimeWarning
                    ? ` ${runtimeApprovalResult.runtimeWarning}`
                    : null}
                  {runtimeApprovalResult.postApplyPreview
                    ? ` ${runtimeApprovalResult.postApplyPreview.summary}`
                    : null}
                  {runtimeApprovalResult.postApplyPreview?.recoverySteps[0]
                    ? ` Next: ${runtimeApprovalResult.postApplyPreview.recoverySteps[0]}`
                    : null}
                  {runtimeApprovalResult.postApplyPreview?.validationWarnings[0]
                    ? ` Note: ${runtimeApprovalResult.postApplyPreview.validationWarnings[0].message}`
                    : null}
                  {runtimeApprovalResult.websitePreviewFidelity
                    ? ` ${runtimeApprovalResult.websitePreviewFidelity.summary}`
                    : null}
                  {runtimeApprovalResult.websitePreviewFidelity?.recoverySteps[0]
                    ? ` Next: ${runtimeApprovalResult.websitePreviewFidelity.recoverySteps[0]}`
                    : null}
                  {runtimeApprovalResult.codeExecution
                    ? ` CODE ${runtimeApprovalResult.codeExecution.completionStatus.toLowerCase().replace(/_/g, " ")}: ${runtimeApprovalResult.codeExecution.metrics.commandsExecuted} command(s), ${runtimeApprovalResult.codeExecution.metrics.repairAttempts} repair attempt(s).`
                    : null}
                  {runtimeApprovalResult.codeExecution?.limitations[0]
                    ? ` ${runtimeApprovalResult.codeExecution.limitations[0]}`
                    : null}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-end gap-2">
                {standingApprovalPending ? (
                  <span className="text-xs text-muted-foreground" role="status">
                    Applying with the current project approval policy...
                  </span>
                ) : null}
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
                {!standingApprovalPending && !isProposalApplied ? (
                <button
                  className="rounded-xl border border-[hsl(var(--royal-border-soft))] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearProposal}
                  type="button"
                >
                  Reject
                </button>
                ) : null}
                {!isApprovalBlocked && !standingApprovalPending && !isProposalApplied ? (
                  <button
                    className="rounded-xl border border-[hsl(var(--premium-accent)/0.35)] bg-[hsl(var(--premium-accent))] px-3 py-1.5 text-xs font-medium text-white shadow-[0_12px_30px_hsl(var(--premium-accent)/0.18)] hover:bg-[hsl(var(--premium-accent-soft))] disabled:cursor-not-allowed disabled:opacity-50"
                    data-website-approval={productMode === "WEBSITE" ? "true" : undefined}
                    onClick={() => {
                      void approveProposal("inline_approval");
                    }}
                    type="button"
                  >
                    {approvalDecision?.hasWarnings
                        ? "Review and approve"
                        : "Approve"}
                  </button>
                ) : null}
              </div>
            </motion.div>
          ) : null}
          <div aria-hidden="true" className="h-px" data-chat-latest-anchor />
        </div>

        {isAwayFromLatest ? (
          <button
            className="absolute bottom-[7.4rem] left-1/2 z-20 -translate-x-1/2 rounded-full border border-[hsl(var(--premium-border))] bg-[#1A2029] px-3 py-1.5 text-[11px] font-medium text-foreground shadow-[0_12px_34px_rgba(0,0,0,0.4)] hover:border-[hsl(var(--premium-accent)/0.45)] [.light_&]:bg-white"
            data-jump-to-latest
            onClick={() => scrollToLatest("smooth")}
            type="button"
          >
            Jump to latest
          </button>
        ) : null}

        <form
          className="shrink-0 border-t border-[hsl(var(--premium-border))] bg-[#0B0D10]/95 px-3 py-2.5 [.light_&]:border-slate-200 [.light_&]:bg-[#F4F3EE] sm:px-4 lg:px-6"
          data-website-composer={productMode === "WEBSITE" ? "true" : undefined}
          onDragOver={(event) => {
            const transfer = event.dataTransfer as unknown as { types: { includes: (value: string) => boolean } };
            if (transfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            const transfer = event.dataTransfer as unknown as { files: ArrayLike<File> };
            if (!transfer.files.length) return;
            event.preventDefault();
            addAttachments(Array.from(transfer.files));
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void sendWithContext();
          }}
        >
          {productMode === "ASK" && useProjectNotesAsContext && notesProjectId === projectId && projectNotes.trim() ? (
            <div className="mx-auto mb-1.5 w-full max-w-4xl px-1 text-[9px] text-amber-100/80">
              Project Notes context is on for this request ({boundedProjectNotesContext(projectNotes).length.toLocaleString()} characters).
            </div>
          ) : null}
          <input
            accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.scss,.py,.java,.cs,.go,.rs,.php,.yaml,.yml,.xml,.sql,.zip"
            className="sr-only"
            data-attachment-input
            multiple
            onChange={(event) => {
              const input = event.currentTarget as unknown as { files: ArrayLike<File> | null; value: string };
              addAttachments(Array.from(input.files ?? []));
              input.value = "";
            }}
            ref={attachmentInputRef}
            type="file"
          />
          {composerUploads.length ? (
            <div className="mx-auto mb-2 flex w-full max-w-4xl gap-2 overflow-x-auto px-1 pb-0.5" data-composer-attachments>
              {composerUploads.map((upload) => (
                <div
                  className={`relative flex min-w-[10rem] max-w-[15rem] items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] ${
                    upload.status === "failed"
                      ? "border-red-400/30 bg-red-500/10 text-red-100"
                      : "border-white/10 bg-white/[0.035] text-muted-foreground"
                  }`}
                  key={upload.clientId}
                >
                  {upload.attachment?.kind === "image" && projectId ? (
                    <span
                      aria-hidden="true"
                      className="h-8 w-8 shrink-0 rounded bg-cover bg-center"
                      style={{ backgroundImage: `url("/api/attachments/${upload.attachment.id}?projectId=${encodeURIComponent(projectId)}")` }}
                    />
                  ) : (
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/[0.05] text-[9px] font-semibold">
                      {upload.attachment ? attachmentKindLabel(upload.attachment.kind) : "FILE"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{upload.file.name}</span>
                    <span className="block truncate">
                      {upload.status === "uploading"
                        ? `Uploading ${upload.progress}%`
                        : upload.status === "failed"
                          ? upload.errorCode ?? "Upload failed"
                          : `${Math.max(1, Math.round(upload.file.size / 1024))} KB ready`}
                    </span>
                  </span>
                  {upload.status === "failed" ? (
                    <button
                      aria-label={`Retry ${upload.file.name}`}
                      className="shrink-0 underline decoration-white/30 underline-offset-2"
                      onClick={() => uploadOne(upload)}
                      type="button"
                    >
                      Retry
                    </button>
                  ) : null}
                  <button
                    aria-label={`Remove ${upload.file.name}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm hover:bg-white/10"
                    onClick={() => removeAttachment(upload)}
                    type="button"
                  >
                    ×
                  </button>
                  {upload.status === "uploading" ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b bg-white/5">
                      <span className="block h-full bg-[hsl(var(--premium-accent))]" style={{ width: `${upload.progress}%` }} />
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mx-auto mb-1 w-full max-w-4xl sm:hidden">
            <PremiumSelect
              compact
              label="Model"
              onChange={setModel}
              options={modelOptions}
              value={model}
            />
          </div>
          <div className="mx-auto flex w-full max-w-4xl items-center gap-2 rounded-2xl border border-[hsl(var(--premium-border))] bg-[#1A2029] px-2.5 py-2 shadow-[0_10px_32px_rgba(0,0,0,0.2)] focus-within:border-[hsl(var(--premium-accent)/0.55)] focus-within:ring-2 focus-within:ring-[hsl(var(--premium-accent)/0.1)] [.light_&]:border-slate-300 [.light_&]:bg-white [.light_&]:shadow-[0_16px_44px_rgba(0,0,0,0.08)] sm:px-3">
            <button
              aria-label="Attach files"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none text-muted-foreground hover:bg-white/[0.04] hover:text-foreground [.light_&]:hover:bg-slate-200 [.light_&]:hover:text-slate-950"
              onClick={() => (attachmentInputRef.current as unknown as { click?: () => void } | null)?.click?.()}
              title="Attach images, documents, source files, or ZIP archives"
              type="button"
            >
              +
            </button>
            <textarea
              className="max-h-28 min-h-[40px] flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-[14px] leading-5 text-[#f4f1e8] outline-none placeholder:text-muted-foreground [.light_&]:text-slate-950 [.light_&]:placeholder:text-slate-500"
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
                  ? "border-[hsl(var(--premium-accent)/0.45)] bg-[hsl(var(--premium-accent)/0.2)] text-[hsl(var(--premium-accent-soft))]"
                  : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
              }`}
              onClick={toggleVoiceInput}
              type="button"
            >
              <MicIcon />
            </button>
            <button
              aria-label={isStreaming ? "Stop response" : "Send message"}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--premium-accent)/0.35)] bg-[hsl(var(--premium-accent))] text-[10px] font-semibold text-white shadow-[0_14px_34px_hsl(var(--premium-accent)/0.18)] hover:bg-[hsl(var(--premium-accent-soft))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--premium-accent)/0.2)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!isStreaming && (input.trim().length === 0 || attachmentUploadPending || attachmentUploadFailed)}
              onClick={isStreaming ? cancelMessage : undefined}
              title={isStreaming ? "Stop response" : "Send message"}
              type={isStreaming ? "button" : "submit"}
            >
              {isStreaming ? (
                <span aria-hidden="true" className="h-3 w-3 rounded-[2px] bg-current" />
              ) : "Go"}
            </button>
          </div>
          {productMode !== "ASK" ? (
            <div className="mx-auto mt-1 flex min-h-8 w-full max-w-4xl items-center px-1" data-approval-control-row>
              <ApprovalPolicyControl projectId={projectId} />
            </div>
          ) : null}
        </form>
      </div>
    </Panel>
  );
}
