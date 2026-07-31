import assert from "node:assert/strict";
import {
  compactWorkspaceForChatRequest,
  isSensitiveWorkspacePath,
  removeCancelledRequestTurn,
  requestNeedsWorkspaceContext,
  serializedWorkspaceBytes
} from "../../../chat-request-context";
import { buildAskRuntimeContext } from "../../ai/ask-context";
import { runAskBrain } from "../../ai/ask-brain-orchestrator";
import { resolveBehavioralDecision } from "../../ai/behavioral-intelligence";
import { redactWorkspaceSecrets } from "../../ai/workspace-context-engine";
import {
  getAskProviderCooldown,
  recordAskProviderHealth,
  resetAskProviderHealthForTests,
  resolveAskProvider
} from "../../ai/provider-router";
import {
  recordBetaTelemetry,
  sanitizeBetaTelemetryEvent
} from "../beta-telemetry";
import { runIntelligencePreflight } from "../intelligence-preflight";
import {
  classifyTaskComplexity,
  completionComplexity,
  escalateTaskComplexity
} from "../task-complexity";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function classify(prompt: string, mode: "ASK" | "CODE" | "WEBSITE" = "ASK") {
  return classifyTaskComplexity({ mode, prompt });
}

function largeWorkspace() {
  const fileContents = Object.fromEntries(
    Array.from({ length: 180 }, (_, index) => [
      `src/feature-${index}.ts`,
      `export const feature${index} = ${JSON.stringify("x".repeat(2_800))};`
    ])
  );
  return {
    activeFileContent: fileContents["src/feature-0.ts"],
    activePath: "src/feature-0.ts",
    fileContents,
    fileList: Object.keys(fileContents),
    projectName: "Large Fixture"
  };
}

test("direct casual and identity requests are INSTANT", () => {
  assert.equal(classify("Hi").class, "INSTANT");
  assert.equal(classify("Who are you?").class, "INSTANT");
  assert.equal(classify("Explain this regex.").class, "INSTANT");
  assert.equal(classify("What does this function do?", "CODE").class, "INSTANT");
  assert.equal(classify("Rename this button from Save to Update.", "CODE").class, "INSTANT");
  assert.equal(classify("Rename Save to Update.", "CODE").class, "INSTANT");
  assert.equal(classify("Rename all components across the repository.", "CODE").class, "STANDARD");
});

test("normal comparison requests remain STANDARD", () => {
  assert.equal(classify("Explain inflation and interest rates.").class, "STANDARD");
  assert.equal(classify("Compare React and Vue for a SaaS dashboard.").class, "STANDARD");
  assert.equal(classify("What are the practical trade-offs between React and Vue?").class, "STANDARD");
  assert.equal(classify("Explain the difference between inflation and interest rates to a beginner.").class, "STANDARD");
});

test("code-location questions select project context", () => {
  const decision = classify("Where is authentication implemented?");
  assert.equal(decision.class, "STANDARD");
  assert.equal(decision.projectContextSelected, true);
});

test("workspace selection distinguishes local context from general topics", () => {
  const context = {
    activePath: "src/auth.ts",
    fileList: ["src/auth.ts"],
    projectName: "Hassali"
  };
  assert.equal(requestNeedsWorkspaceContext("Explain this.", "ASK", context), true);
  assert.equal(requestNeedsWorkspaceContext("What does this function do?", "ASK", context), true);
  assert.equal(requestNeedsWorkspaceContext("Where is authentication implemented?", "ASK", context), true);
  assert.equal(requestNeedsWorkspaceContext("What was the Manhattan Project?", "ASK", context), false);
  assert.equal(requestNeedsWorkspaceContext("Explain project management techniques.", "ASK", context), false);
  assert.equal(requestNeedsWorkspaceContext("What is a codebase?", "ASK", context), false);
  assert.equal(requestNeedsWorkspaceContext("Explain the repository pattern.", "ASK", context), false);
  assert.equal(requestNeedsWorkspaceContext("What is AI?", "ASK", {
    ...context,
    projectName: "AI"
  }), false);
});

test("multi-system and constrained work becomes DEEP", () => {
  const decision = classify(
    "Audit the full repository end-to-end across frontend UI, backend API, database migrations, auth permissions, and security. Diagnose repeated failures and verify the production architecture."
  );
  assert.equal(decision.class, "DEEP");
  assert.equal(decision.expectedVerificationDepth, "broad");
  assert.equal(classify("Research and synthesize a comprehensive long-term architecture decision.").class, "DEEP");
});

test("complexity escalates from evidence and can shrink after hard work", () => {
  assert.equal(escalateTaskComplexity("INSTANT", { unresolvedAmbiguity: true }), "STANDARD");
  assert.equal(
    escalateTaskComplexity("STANDARD", {
      conflictingEvidence: true,
      verificationFailures: 1
    }),
    "DEEP"
  );
  assert.equal(completionComplexity("DEEP", true), "INSTANT");
});

test("irrelevant ASK requests omit the large workspace payload", () => {
  const source = largeWorkspace();
  const compacted = compactWorkspaceForChatRequest({
    mode: "ASK",
    prompt: "Why is the sky blue?",
    workspace: source
  });
  assert(serializedWorkspaceBytes(source) > 500_000);
  assert(serializedWorkspaceBytes(compacted) < 200);
  assert.deepEqual(compacted.fileList, []);
});

test("project-aware ASK requests keep bounded relevant context", () => {
  const source = {
    ...largeWorkspace(),
    fileContents: {
      ...largeWorkspace().fileContents,
      "HASSALI.md": "mode: CODE\nappName: Fixture",
      "package.json": JSON.stringify({ name: "fixture" })
    },
    fileList: [...largeWorkspace().fileList, "HASSALI.md", "package.json"]
  };
  const compacted = compactWorkspaceForChatRequest({
    mode: "ASK",
    prompt: "What kind of project is currently in my workspace?",
    workspace: source
  });
  assert(compacted.fileList.includes("HASSALI.md"));
  assert(compacted.fileList.includes("package.json"));
  assert(Object.keys(compacted.fileContents).length <= 16);
  assert(serializedWorkspaceBytes(compacted) < serializedWorkspaceBytes(source));
});

test("sensitive active files are never copied into ASK request context", () => {
  const source = {
    activeFileContent: "OPENROUTER_API_KEY=SECRET_VALUE_123",
    activePath: ".env.local",
    fileContents: {
      ".env.local": "OPENROUTER_API_KEY=SECRET_VALUE_123",
      "HASSALI.md": "mode: CODE\nappName: Fixture"
    },
    fileList: [".env.local", "HASSALI.md"],
    projectName: "Fixture"
  };
  const compacted = compactWorkspaceForChatRequest({
    mode: "ASK",
    prompt: "What kind of project is currently in my workspace?",
    workspace: source
  });
  assert.equal(compacted.activeFileContent, "");
  assert.equal(compacted.fileContents[".env.local"], undefined);
  assert(!JSON.stringify(compacted).includes("SECRET_VALUE_123"));
});

test("credential files and embedded private keys stay out of provider context", () => {
  for (const path of [
    ".envrc",
    ".netrc",
    ".ssh/id_ecdsa",
    ".docker/config.json",
    "config/service-account.json",
    "config/client_secret_web.json",
    "firebase-adminsdk-project.json"
  ]) {
    assert.equal(isSensitiveWorkspacePath(path), true, path);
  }

  const source = [
    '"client_secret": "client-secret-value"',
    '"private_key": "encoded-private-key-value"',
    "-----BEGIN PRIVATE KEY-----",
    "private-material",
    "-----END PRIVATE KEY-----"
  ].join("\n");
  const redacted = redactWorkspaceSecrets(source);
  assert.equal(redacted.redactionApplied, true);
  assert(!redacted.redacted.includes("client-secret-value"));
  assert(!redacted.redacted.includes("encoded-private-key-value"));
  assert(!redacted.redacted.includes("private-material"));

  const truncatedCredential = redactWorkspaceSecrets(
    '"client_secret": "partial-secret-without-closing-quote'
  );
  assert.equal(truncatedCredential.redactionApplied, true);
  assert(!truncatedCredential.redacted.includes("partial-secret"));

  const truncatedPrivateKey = redactWorkspaceSecrets([
    "-----BEGIN RSA PRIVATE KEY-----",
    "partial-private-material-without-end-marker"
  ].join("\n"));
  assert.equal(truncatedPrivateKey.redactionApplied, true);
  assert(!truncatedPrivateKey.redacted.includes("partial-private-material"));
});

test("CODE and WEBSITE workspace payloads are unchanged", () => {
  const source = largeWorkspace();
  assert.equal(compactWorkspaceForChatRequest({ mode: "CODE", prompt: "Build it", workspace: source }), source);
  assert.equal(compactWorkspaceForChatRequest({ mode: "WEBSITE", prompt: "Build it", workspace: source }), source);
});

test("INSTANT preflight skips skills tools agents and project context", async () => {
  const preflight = await runIntelligencePreflight({
    messages: [{ content: "Hi", role: "user" }],
    mode: "ASK",
    model: "tencent/hy3:free",
    prompt: "Hi",
    workspace: largeWorkspace()
  });
  assert.equal(preflight.complexity.class, "INSTANT");
  assert.equal(preflight.complexity.projectContextSelected, false);
  assert.equal(preflight.skills.loadedSkills.length, 0);
  assert.equal(preflight.tools.loadedSchemas.length, 0);
  assert.equal(preflight.agentPlan.tasks.length, 0);
});

test("answer-only preflight suppresses builder planning regardless of CODE keywords", async () => {
  const prompt = "Explain how I could fix this authentication architecture.";
  const messages = [{ content: prompt, role: "user" as const }];
  const finalAction = resolveBehavioralDecision({
    messages,
    prompt,
    selectedMode: "CODE",
    workspace: {
      activeFileContent: "",
      activePath: "",
      fileContents: {},
      fileList: [],
      projectName: null
    }
  });
  const preflight = await runIntelligencePreflight({
    finalAction,
    messages,
    mode: "CODE",
    model: "tencent/hy3:free",
    prompt
  });
  assert.equal(finalAction.finalDisposition, "answer");
  assert.equal(finalAction.mutationIntent, false);
  assert.equal(preflight.plan.state, "DIRECT");
  assert.equal(preflight.plan.executionState.approvalRequired, false);
  assert.deepEqual(preflight.plan.steps, []);
  assert.equal(preflight.agentPlan.tasks.length, 0);
  assert.equal(preflight.skills.loadedSkills.length, 0);
  assert.equal(preflight.tools.discoveredTools.length, 0);
  assert.equal(preflight.verificationPlan.taskKind, "explanation");
});

test("provider cooldown expires and cancellation does not create one", () => {
  resetAskProviderHealthForTests();
  const provider = resolveAskProvider("tencent/hy3:free");
  recordAskProviderHealth({
    category: "provider_timeout",
    now: 1_000,
    ok: false,
    provider
  });
  assert.equal(getAskProviderCooldown(provider, 1_001).active, false);
  recordAskProviderHealth({
    category: "provider_timeout",
    now: 1_010,
    ok: false,
    provider
  });
  assert.equal(getAskProviderCooldown(provider, 1_011).active, true);
  assert.equal(getAskProviderCooldown(provider, 21_011).active, false);
  recordAskProviderHealth({
    category: "request_cancelled",
    now: 30_000,
    ok: false,
    provider
  });
  assert.equal(getAskProviderCooldown(provider, 30_001).active, false);
});

test("provider health scopes account failures and ignores request-specific failures", () => {
  resetAskProviderHealthForTests();
  const primary = resolveAskProvider("tencent/hy3:free");
  const fallback = resolveAskProvider("openrouter/free");
  recordAskProviderHealth({
    category: "provider_auth_failed",
    now: 1_000,
    ok: false,
    provider: primary
  });
  assert.equal(getAskProviderCooldown(fallback, 1_001).active, true);
  resetAskProviderHealthForTests();
  recordAskProviderHealth({
    category: "provider_rate_limited",
    now: 2_000,
    ok: false,
    provider: primary
  });
  assert.equal(getAskProviderCooldown(primary, 2_001).active, true);
  assert.equal(getAskProviderCooldown(fallback, 2_001).active, false);
  assert.equal(getAskProviderCooldown(primary, 32_001).active, false);
  recordAskProviderHealth({
    category: "provider_request_rejected",
    now: 40_000,
    ok: false,
    provider: primary
  });
  assert.equal(getAskProviderCooldown(primary, 40_001).active, false);
  recordAskProviderHealth({
    category: "provider_response_invalid",
    now: 50_000,
    ok: false,
    provider: primary
  });
  assert.equal(getAskProviderCooldown(primary, 50_001).active, false);
});

test("cancelled request turns are removed before retry", () => {
  const messages = [
    { id: "prior", content: "Earlier answer" },
    { id: "user", content: "Build it" },
    { id: "assistant", content: "" }
  ];
  assert.deepEqual(removeCancelledRequestTurn(messages, "user", "assistant"), [
    { id: "prior", content: "Earlier answer" }
  ]);
});

test("locked selection still attempts a cooling model", async () => {
  const previous = {
    allow: process.env.HASSALI_ALLOW_TEST_MODELS,
    key: process.env.OPENROUTER_API_KEY,
    status: process.env.HASSALI_TEST_OPENROUTER_STATUS
  };
  process.env.HASSALI_ALLOW_TEST_MODELS = "1";
  process.env.HASSALI_TEST_OPENROUTER_STATUS = "429";
  process.env.OPENROUTER_API_KEY = "test-only";
  resetAskProviderHealthForTests();

  try {
    const input = {
      askRuntimeContext: buildAskRuntimeContext(new Date("2026-07-28T09:00:00.000Z")),
      messages: [{ content: "Compare React and Vue for a SaaS dashboard.", role: "user" as const }],
      model: "tencent/hy3:free",
      modelSelectionPolicy: "locked" as const,
      productMode: "ASK" as const,
      prompt: "Compare React and Vue for a SaaS dashboard."
    };
    const first = await runAskBrain(input);
    const second = await runAskBrain(input);
    assert.equal(first.decision.providerCallCount, 1);
    assert.equal(second.decision.providerCallCount, 1);
    assert.equal(second.decision.attemptedModels[0], resolveAskProvider(input.model).executionModelId);
  } finally {
    resetAskProviderHealthForTests();
    if (previous.allow === undefined) delete process.env.HASSALI_ALLOW_TEST_MODELS;
    else process.env.HASSALI_ALLOW_TEST_MODELS = previous.allow;
    if (previous.status === undefined) delete process.env.HASSALI_TEST_OPENROUTER_STATUS;
    else process.env.HASSALI_TEST_OPENROUTER_STATUS = previous.status;
    if (previous.key === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous.key;
  }
});

test("ASK abort propagates without fallback or provider-health penalty", async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  const controller = new AbortController();
  const pending = runAskBrain({
    abortSignal: controller.signal,
    askRuntimeContext: buildAskRuntimeContext(new Date("2026-07-28T09:00:00.000Z")),
    messages: [{ content: "Compare React and Vue for a SaaS dashboard.", role: "user" }],
    model: "tencent/hy3:free",
    productMode: "ASK",
    prompt: "Compare React and Vue for a SaaS dashboard.",
    providerCall: ({ abortSignal }) => new Promise((resolve) => {
      const cancelled = () => resolve({
        category: "request_cancelled",
        reason: "ASK request was cancelled.",
        status: "cancelled"
      });
      if (abortSignal?.aborted) cancelled();
      else abortSignal?.addEventListener("abort", cancelled, { once: true });
    })
  });
  controller.abort();
  const result = await pending;
  assert.equal(result.decision.providerFailureCategory, "request_cancelled");
  assert.equal(result.decision.providerCallCount, 1);
  assert.equal(result.decision.fallbackOccurred, false);
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousKey;
});

test("beta telemetry is bounded private and non-blocking", () => {
  const event = sanitizeBetaTelemetryEvent({
    complexityClass: "STANDARD",
    durationMs: 812,
    event: "task_completed",
    failureCategory: "Provider failed: SECRET_VALUE_123 customer prompt contents",
    mode: "ASK",
    providerId: "openrouter",
    toolCount: 999
  });
  const serialized = JSON.stringify(event);
  assert(!serialized.includes("SECRET_VALUE_123"));
  assert(!serialized.toLowerCase().includes("customer_prompt"));
  assert.equal(event.failureCategory, "none");
  assert(!serialized.includes("prompt"));
  assert(!serialized.includes("file"));
  assert.equal(event.toolCount, 20);
  const contradictory = sanitizeBetaTelemetryEvent({
    answerOnly: true,
    approvalRequired: true,
    approvalSatisfied: true,
    complexityClass: "STANDARD",
    contextItemsExcluded: 400,
    contextItemsIncluded: 4,
    contextScope: ["current_message", "selected_project"],
    event: "task_completed",
    executionCompleted: true,
    executionStarted: true,
    failureCategory: "provider_timeout",
    finalDisposition: "answer",
    intentClass: "INFORMATIONAL_ANSWER",
    mode: "CODE",
    mutationRequested: true
  });
  assert.equal(contradictory.answerOnly, true);
  assert.equal(contradictory.mutationRequested, false);
  assert.equal(contradictory.approvalRequired, false);
  assert.equal(contradictory.approvalSatisfied, false);
  assert.equal(contradictory.executionStarted, false);
  assert.equal(contradictory.executionCompleted, false);
  assert.equal(contradictory.completionStatus, "completed");
  assert.equal(contradictory.failureCategory, "none");
  assert.equal(contradictory.contextItemsExcluded, 100);
  assert.equal(recordBetaTelemetry({
    complexityClass: "INSTANT",
    event: "task_started",
    mode: "ASK"
  }, () => {
    throw new Error("telemetry sink unavailable");
  }), false);
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}

process.stdout.write(`\n${passed}/${tests.length} launch optimization checks passed.\n`);
