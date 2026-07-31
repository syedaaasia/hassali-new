export type AssistantActivityMode = "ASK" | "CODE" | "WEBSITE";

export type AssistantActivityKind = "code_preparation" | "thinking" | "website_generation";

export type AssistantActivityState = {
  kind: AssistantActivityKind;
  label: string;
  visibility: "hidden" | "pre-output";
};

export const HASSALI_ACTIVITY_MASCOT_ASSET = {
  coinFrames: 5,
  coinStripPath: "/mascots/hassali-coin-strip.png",
  referencePath: "/mascots/hassali-mascot-reference.png",
  renderedSize: 44,
  sourceSpritePath: "/mascots/hassali-mascot-sprite.png",
  stageHeight: 56,
  stageMaxWidth: 300,
  stageMinWidth: 156,
  throwFrames: 6,
  throwStripPath: "/mascots/hassali-throw-strip.png",
  travelRatio: 0.72,
  walkFrames: 7,
  walkStripPath: "/mascots/hassali-walk-strip.png"
} as const;

export function calculateMascotTrack(stageWidth: number) {
  const normalizedWidth = Math.max(
    0,
    Math.min(stageWidth, HASSALI_ACTIVITY_MASCOT_ASSET.stageMaxWidth)
  );
  const safePadding = Math.max(8, normalizedWidth * 0.08);
  const availableTravel = Math.max(
    0,
    normalizedWidth - safePadding * 2 - HASSALI_ACTIVITY_MASCOT_ASSET.renderedSize
  );

  return {
    safePadding: Math.round(safePadding),
    travel: Math.round(availableTravel * HASSALI_ACTIVITY_MASCOT_ASSET.travelRatio)
  };
}

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
    visibility: input.isRequestActive && !input.hasVisibleOutput ? "pre-output" : "hidden"
  };
}
