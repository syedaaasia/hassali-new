export const orchestrationPackageName = "@hassali/orchestration";

export type AiMode = "ASK" | "SUGGEST" | "EXECUTE";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type OrchestrationToolName =
  | "read_file"
  | "write_file"
  | "edit_file"
  | "search_files"
  | "create_snapshot"
  | "apply_diff";

export type TaskPlanStep = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "complete";
};

export type TaskPlan = {
  id: string;
  goal: string;
  steps: TaskPlanStep[];
};

export type FileChange = {
  path: string;
  summary: string;
  currentContent?: string;
  proposedContent: string;
  diffPreview: string;
};

export type DiffProposal = {
  id: string;
  mode: "SUGGEST";
  status: ApprovalStatus;
  summary: string;
  changes: FileChange[];
  taskPlan?: TaskPlan;
};

export const orchestrationToolNames: OrchestrationToolName[] = [
  "read_file",
  "write_file",
  "edit_file",
  "search_files",
  "create_snapshot",
  "apply_diff"
];
