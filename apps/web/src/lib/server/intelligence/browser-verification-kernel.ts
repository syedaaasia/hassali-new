import {
  createVerificationEvidence,
  type VerificationEvidence,
  type VerificationStatus
} from "./verification-kernel";
import { sanitizeUntrustedToolText } from "./security-kernel";

export type ComputerTarget =
  | {
      kind: "browser";
      url: string;
    }
  | {
      application: string;
      kind: "desktop_future";
    };

export type BrowserErrorClassification =
  | "APP_ERROR"
  | "AUTH_UNAVAILABLE"
  | "BROWSER_TOOL_ERROR"
  | "EXTERNAL_SERVICE_ERROR"
  | "TEST_HARNESS_ERROR";

export type BrowserVerificationStep =
  | "check_console"
  | "inspect_initial"
  | "inspect_result"
  | "interact"
  | "open"
  | "reload"
  | "responsive";

export type BrowserVerificationPlan = {
  interaction?: string;
  reloadRequired: boolean;
  steps: BrowserVerificationStep[];
  target: ComputerTarget;
  viewports: Array<{ height: number; name: string; width: number }>;
};

export type BrowserStepResult = {
  details: string;
  status: VerificationStatus;
  step: BrowserVerificationStep;
};

export type BrowserVerificationAdapter = {
  runStep: (
    step: BrowserVerificationStep,
    plan: BrowserVerificationPlan
  ) => Promise<BrowserStepResult>;
};

export type BrowserVerificationResult = {
  errorClassification: BrowserErrorClassification | null;
  evidence: VerificationEvidence[];
  results: BrowserStepResult[];
  status: VerificationStatus;
};

export class BrowserVerificationError extends Error {
  readonly classification: BrowserErrorClassification;

  constructor(
    message: string,
    classification: BrowserErrorClassification
  ) {
    super(message);
    this.classification = classification;
    this.name = "BrowserVerificationError";
  }
}

export function createBrowserVerificationPlan(input: {
  interaction?: string;
  reloadRequired?: boolean;
  responsive?: boolean;
  url: string;
}): BrowserVerificationPlan {
  const steps: BrowserVerificationStep[] = [
    "open",
    "inspect_initial",
    ...(input.interaction ? ["interact" as const, "inspect_result" as const] : []),
    "check_console",
    ...(input.reloadRequired ? ["reload" as const] : []),
    ...(input.responsive ? ["responsive" as const] : [])
  ];

  return {
    interaction: input.interaction,
    reloadRequired: Boolean(input.reloadRequired),
    steps,
    target: {
      kind: "browser",
      url: input.url
    },
    viewports: input.responsive
      ? [
          { height: 900, name: "desktop", width: 1440 },
          { height: 844, name: "mobile", width: 390 }
        ]
      : [{ height: 900, name: "desktop", width: 1440 }]
  };
}

function classifyUnknownError(error: unknown): BrowserErrorClassification {
  if (error instanceof BrowserVerificationError) return error.classification;
  const message = error instanceof Error ? error.message : String(error);
  if (/\bauth|sign[- ]?in|login\b/i.test(message)) return "AUTH_UNAVAILABLE";
  if (/\bECONN|network|fetch failed|upstream\b/i.test(message)) return "EXTERNAL_SERVICE_ERROR";
  if (/\bselector|locator|harness|playwright\b/i.test(message)) return "TEST_HARNESS_ERROR";
  return "BROWSER_TOOL_ERROR";
}

export async function runBrowserVerification(input: {
  adapter: BrowserVerificationAdapter;
  plan: BrowserVerificationPlan;
}): Promise<BrowserVerificationResult> {
  const results: BrowserStepResult[] = [];
  const evidence: VerificationEvidence[] = [];

  try {
    for (const step of input.plan.steps) {
      const result = await input.adapter.runStep(step, input.plan);
      results.push(result);
      evidence.push(createVerificationEvidence({
        criterionId: step === "check_console" ? "browser-console" : "browser-behavior",
        details: result.details,
        method: "BROWSER_INTERACTION",
        source: "browser_adapter",
        status: result.status,
        target: "browser"
      }));
      if (result.status === "FAIL") {
        return {
          errorClassification: "APP_ERROR",
          evidence,
          results,
          status: "FAIL"
        };
      }
      if (result.status !== "PASS") {
        return {
          errorClassification: result.status === "NOT_AVAILABLE" ? "BROWSER_TOOL_ERROR" : null,
          evidence,
          results,
          status: result.status
        };
      }
    }
  } catch (error) {
    const classification = classifyUnknownError(error);
    const sanitized = sanitizeUntrustedToolText(
      error instanceof Error ? error.message : "Browser verification failed."
    );
    evidence.push(createVerificationEvidence({
      criterionId: "browser-behavior",
      details: sanitized.sanitized,
      method: "BROWSER_INTERACTION",
      source: "browser_adapter",
      status: "NOT_AVAILABLE",
      target: input.plan.target.kind
    }));
    return {
      errorClassification: classification,
      evidence,
      results,
      status: "NOT_AVAILABLE"
    };
  }

  return {
    errorClassification: null,
    evidence,
    results,
    status: "PASS"
  };
}
