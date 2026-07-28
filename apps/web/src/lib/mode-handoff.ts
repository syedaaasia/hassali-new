export type HandoffMode = "ASK" | "CODE" | "WEBSITE";

export type ModeHandoff = {
  acceptanceCriteria: string[];
  acceptedDecisions: string[];
  constraints: string[];
  contextHash: string;
  createdAt: string;
  explicitNegatives: string[];
  id: string;
  knownRisks: string[];
  objective: string;
  openQuestions: string[];
  projectId: string | null;
  projectIdentity: string | null;
  projectRevision: string | null;
  relevantContext: string[];
  relevantFiles: string[];
  requirements: string[];
  schemaVersion: 1;
  sourceEvidence: string[];
  sourceMode: HandoffMode;
  targetMode: HandoffMode;
};

const LIST_LIMIT = 16;
const ITEM_LIMIT = 240;
const OBJECTIVE_LIMIT = 1_200;
const ALLOWED_TRANSITIONS = new Set(["ASK:CODE", "ASK:WEBSITE", "CODE:ASK"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMode(value: unknown): value is HandoffMode {
  return value === "ASK" || value === "CODE" || value === "WEBSITE";
}

function boundedText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function boundedOptionalText(value: unknown, limit: number) {
  const text = boundedText(value, limit);
  return text || null;
}

function boundedList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().slice(0, ITEM_LIMIT))
      .filter(Boolean)
  )).slice(0, LIST_LIMIT);
}

export function parseModeHandoff(value: unknown): ModeHandoff | null {
  if (!isPlainRecord(value) || value.schemaVersion !== 1) return null;
  if (!isMode(value.sourceMode) || !isMode(value.targetMode)) return null;
  if (!ALLOWED_TRANSITIONS.has(`${value.sourceMode}:${value.targetMode}`)) return null;

  const id = boundedText(value.id, 80);
  const contextHash = boundedText(value.contextHash, 80);
  const createdAt = boundedText(value.createdAt, 40);
  const objective = boundedText(value.objective, OBJECTIVE_LIMIT);

  if (!id || !contextHash || !createdAt || !objective) return null;

  return {
    acceptanceCriteria: boundedList(value.acceptanceCriteria),
    acceptedDecisions: boundedList(value.acceptedDecisions),
    constraints: boundedList(value.constraints),
    contextHash,
    createdAt,
    explicitNegatives: boundedList(value.explicitNegatives),
    id,
    knownRisks: boundedList(value.knownRisks),
    objective,
    openQuestions: boundedList(value.openQuestions),
    projectId: boundedOptionalText(value.projectId, 120),
    projectIdentity: boundedOptionalText(value.projectIdentity, 160),
    projectRevision: boundedOptionalText(value.projectRevision, 160),
    relevantContext: boundedList(value.relevantContext),
    relevantFiles: boundedList(value.relevantFiles),
    requirements: boundedList(value.requirements),
    schemaVersion: 1,
    sourceEvidence: boundedList(value.sourceEvidence),
    sourceMode: value.sourceMode,
    targetMode: value.targetMode
  };
}

function handoffCoreLines(handoff: ModeHandoff, includeRelevantFiles = false) {
  return [
    `Objective: ${handoff.objective}`,
    handoff.projectIdentity ? `Project: ${handoff.projectIdentity}` : "",
    handoff.requirements.length ? `Requirements: ${handoff.requirements.join("; ")}` : "",
    handoff.constraints.length ? `Constraints: ${handoff.constraints.join("; ")}` : "",
    handoff.explicitNegatives.length ? `Do not: ${handoff.explicitNegatives.join("; ")}` : "",
    handoff.acceptedDecisions.length ? `Accepted decisions: ${handoff.acceptedDecisions.join("; ")}` : "",
    includeRelevantFiles && handoff.relevantFiles.length ? `Relevant files: ${handoff.relevantFiles.join(", ")}` : "",
    handoff.acceptanceCriteria.length ? `Acceptance criteria: ${handoff.acceptanceCriteria.join("; ")}` : "",
    handoff.openQuestions.length ? `Open questions: ${handoff.openQuestions.join("; ")}` : ""
  ].filter(Boolean);
}

export function handoffSummary(handoff: ModeHandoff) {
  return handoffCoreLines(handoff, true).join("\n");
}

export function handoffTargetDraft(handoff: ModeHandoff) {
  const action = handoff.targetMode === "ASK"
    ? "Review and explain this work without changing files."
    : handoff.targetMode === "WEBSITE"
      ? "Create an approval-first WEBSITE proposal for this objective."
      : "Create an approval-first CODE proposal for this objective.";

  const safeForNewTurn = handoffCoreLines(handoff).join("\n");

  const contextualReference = handoff.targetMode === "ASK" && handoff.relevantContext.length
    ? `\n\nContext (reference only; newest user instruction wins):\n${handoff.relevantContext.join("\n")}`
    : "";

  return `${action}\n\n${safeForNewTurn}${contextualReference}`;
}
