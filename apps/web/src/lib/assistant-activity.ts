export type AssistantActivityMode = "ASK" | "CODE" | "WEBSITE";

export type AssistantActivityKind =
  | "code_preparation"
  | "thinking"
  | "website_generation";

export type AssistantActivityState = {
  kind: AssistantActivityKind;
  label: string;
  visibility: "hidden" | "pre-output";
};

export const HASSALI_ACTIVITY_MASCOT_ASSET = {
  path: "/mascots/hassali-thinking.webp",
  renderedSize: 24,
  sourceSize: 96,
  stageHeight: 28,
  stageWidth: 56
} as const;

const activityByMode: Record<
  AssistantActivityMode,
  Pick<AssistantActivityState, "kind" | "label">
> = {
  ASK: {
    kind: "thinking",
    label: "Hassali is thinking"
  },
  CODE: {
    kind: "code_preparation",
    label: "Hassali is preparing code"
  },
  WEBSITE: {
    kind: "website_generation",
    label: "Hassali is preparing a website"
  }
};

export function hasMeaningfulAssistantOutput(content: string) {
  return content.trim().length > 0;
}

export function deriveAssistantActivity(input: {
  hasVisibleOutput: boolean;
  isRequestActive: boolean;
  mode: AssistantActivityMode;
}): AssistantActivityState {
  const activity = activityByMode[input.mode];
  return {
    ...activity,
    visibility: input.isRequestActive && !input.hasVisibleOutput
      ? "pre-output"
      : "hidden"
  };
}
