import assert from "node:assert/strict";
import { createServer } from "node:http";
import { syncRuntimeApprovalResult } from "@/lib/runtime-result-sync";
import {
  normalizePostApplyPreviewResult,
  runPostApplyPreview
} from "../post-apply-preview";
import { discoverPostApplyRuntime } from "../post-apply-runtime-discovery";
import type {
  PostApplyPreviewResult,
  PostApplyRuntimeOperation
} from "../post-apply-preview-types";
import { waitForOwnedLocalHttp } from "../owned-runtime-safety";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

const viteFiles = {
  "package.json": JSON.stringify({
    dependencies: { "@vitejs/plugin-react": "^4.0.0", react: "^18.0.0", vite: "^5.0.0" },
    scripts: { dev: "vite" }
  }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'",
  "src/App.tsx": "export default function App() { return <main>Ready</main>; }",
  "src/main.tsx": "import './App';"
};

function readyOperation(overrides: Partial<PostApplyRuntimeOperation> = {}): PostApplyRuntimeOperation {
  return {
    error: null,
    existingProcessReused: false,
    httpStatus: 200,
    logs: ["ready"],
    port: 5173,
    previewUrl: "http://127.0.0.1:5173",
    processStarted: true,
    readinessVerified: true,
    runtimeStatus: "running",
    workspaceRoot: ".",
    ...overrides
  };
}

function previewInput(overrides: Partial<Parameters<typeof runPostApplyPreview>[0]> = {}) {
  return {
    approvalSatisfied: true,
    filesApplied: true,
    filesChanged: ["package.json", "src/App.tsx"],
    generatedFiles: viteFiles,
    projectId: "project-a",
    runtimeExecutableAvailable: async () => true,
    runtimeStartAllowed: true,
    startAdapter: async () => readyOperation(),
    verificationStatus: "PASSED" as const,
    workerType: "local",
    workspaceRoot: "D:\\owned\\project-a",
    ...overrides
  };
}

test("A selects the actual Vite script and package manager", async () => {
  const output = await runPostApplyPreview(previewInput());
  assert.equal(output.discovery.selectedTarget?.framework, "react_vite");
  assert.equal(output.result.packageManager, "pnpm");
  assert.equal(output.result.selectedCommand, "pnpm run dev");
  assert.equal(output.result.runtimeStatus, "READY");
  assert.equal(output.result.previewReady, true);
  assert.equal(output.result.readinessVerified, true);
});

test("packageManager declaration wins visibly over a conflicting lockfile", () => {
  const discovery = discoverPostApplyRuntime({
    generatedFiles: {
      ...viteFiles,
      "package.json": JSON.stringify({
        dependencies: { vite: "^5.0.0" },
        packageManager: "pnpm@9.0.0",
        scripts: { dev: "vite" }
      }),
      "package-lock.json": "{}"
    },
    writtenFiles: ["src/App.tsx"]
  });
  assert.equal(discovery.selectedTarget?.packageManager, "pnpm");
  assert.match(discovery.warnings.join(" "), /overrides the nearby npm lockfile signal/i);
});

test("B selects the changed frontend package in a monorepo", () => {
  const discovery = discoverPostApplyRuntime({
    generatedFiles: {
      "package.json": JSON.stringify({ packageManager: "pnpm@9", scripts: { lint: "eslint ." } }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'",
      "apps/api/package.json": JSON.stringify({
        dependencies: { express: "^4.0.0" },
        scripts: { dev: "node server.js" }
      }),
      "apps/api/server.js": "export {};",
      "apps/web/package.json": JSON.stringify({
        dependencies: { react: "^18.0.0", vite: "^5.0.0" },
        scripts: { dev: "vite" }
      }),
      "apps/web/src/App.tsx": "export default function App() { return null; }"
    },
    writtenFiles: ["apps/web/src/App.tsx"]
  });
  assert.equal(discovery.status, "DETECTED");
  assert.equal(discovery.selectedTarget?.relativeRoot, "apps/web");
  assert.equal(discovery.selectedTarget?.selectedCommand, "pnpm --dir apps/web run dev");
});

test("C refuses an ambiguous multi-app target", async () => {
  let starts = 0;
  const output = await runPostApplyPreview(previewInput({
    filesChanged: ["README.md"],
    generatedFiles: {
      "apps/a/package.json": JSON.stringify({ dependencies: { vite: "^5" }, scripts: { dev: "vite" } }),
      "apps/a/src/main.tsx": "",
      "apps/b/package.json": JSON.stringify({ dependencies: { vite: "^5" }, scripts: { dev: "vite" } }),
      "apps/b/src/main.tsx": ""
    },
    startAdapter: async () => {
      starts += 1;
      return readyOperation();
    }
  }));
  assert.equal(output.result.runtimeStatus, "AMBIGUOUS_TARGET");
  assert.equal(output.result.failureClass, "AMBIGUOUS_TARGET");
  assert.equal(output.result.previewAttempted, false);
  assert.equal(starts, 0);
});

test("D reports missing dependencies without installing or starting", async () => {
  let starts = 0;
  const output = await runPostApplyPreview(previewInput({
    runtimeExecutableAvailable: async () => false,
    startAdapter: async () => {
      starts += 1;
      return readyOperation();
    }
  }));
  assert.equal(output.result.failureClass, "MISSING_DEPENDENCIES");
  assert.equal(output.result.previewReady, false);
  assert.match(output.result.recoverySteps.join(" "), /explicitly approved package-install flow/i);
  assert.equal(starts, 0);
});

test("E records a safe alternative port", async () => {
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      port: 5191,
      previewUrl: "http://127.0.0.1:5191"
    })
  }));
  assert.equal(output.result.portSelectionResult, "used_alternative_port");
  assert.equal(output.result.port, 5191);
});

test("F reports identity-bound healthy reuse distinctly", async () => {
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      existingProcessReused: true,
      processStarted: false
    })
  }));
  assert.equal(output.result.runtimeStatus, "REUSED_EXISTING");
  assert.equal(output.result.existingProcessReused, true);
  assert.equal(output.result.commandSource, "reused_existing_process");
});

test("G does not describe a newly started app as reused", async () => {
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      port: 5180,
      previewUrl: "http://127.0.0.1:5180"
    })
  }));
  assert.equal(output.result.runtimeStatus, "READY");
  assert.equal(output.result.existingProcessReused, false);
});

test("H classifies process exit before readiness", async () => {
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      error: "Owned process exited with code 1 before readiness.",
      httpStatus: null,
      logs: ["process exited"],
      port: null,
      previewUrl: null,
      readinessVerified: false,
      runtimeStatus: "error"
    })
  }));
  assert.equal(output.result.failureClass, "PROCESS_EXITED");
  assert.equal(output.result.previewReady, false);
});

test("I classifies bounded readiness timeout", async () => {
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      error: "Runtime readiness timed out.",
      httpStatus: null,
      logs: ["did not become ready"],
      port: null,
      previewUrl: null,
      readinessVerified: false,
      runtimeStatus: "error"
    })
  }));
  assert.equal(output.result.failureClass, "READINESS_TIMEOUT");
});

test("specific compile and environment failures outrank process exit", async () => {
  const compile = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      error: "Process exited after failed to compile src/App.tsx.",
      logs: ["invalid JSX"],
      port: null,
      previewUrl: null,
      readinessVerified: false,
      runtimeStatus: "error"
    })
  }));
  const environment = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      error: "Process exited because DATABASE_URL is required by the application.",
      logs: [],
      port: null,
      previewUrl: null,
      readinessVerified: false,
      runtimeStatus: "error"
    })
  }));
  assert.equal(compile.result.failureClass, "COMPILE_ERROR");
  assert.equal(environment.result.failureClass, "ENVIRONMENT_MISSING");
});

test("J reports backend and library targets as not previewable", async () => {
  const output = await runPostApplyPreview(previewInput({
    filesChanged: ["server.js"],
    generatedFiles: {
      "package.json": JSON.stringify({
        dependencies: { express: "^4.0.0" },
        scripts: { dev: "node server.js" }
      }),
      "server.js": "export {};"
    }
  }));
  assert.equal(output.result.runtimeStatus, "NOT_PREVIEWABLE");
  assert.equal(output.result.previewAttempted, false);
});

test("K distinguishes successful apply from preview failure", async () => {
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => readyOperation({
      error: "Runtime readiness timed out.",
      logs: [],
      port: null,
      previewUrl: null,
      readinessVerified: false,
      runtimeStatus: "error"
    })
  }));
  assert.equal(output.result.filesApplied, true);
  assert.equal(output.result.previewReady, false);
  assert.match(output.result.summary, /file changes were applied, but the preview did not start/i);
});

test("M never starts before approval", async () => {
  let starts = 0;
  const output = await runPostApplyPreview(previewInput({
    approvalSatisfied: false,
    startAdapter: async () => {
      starts += 1;
      return readyOperation();
    }
  }));
  assert.equal(output.result.failureClass, "RUNTIME_NOT_APPROVED");
  assert.equal(output.result.previewAttempted, false);
  assert.equal(starts, 0);
});

test("N approved mutation performs exactly one runtime attempt", async () => {
  let starts = 0;
  const output = await runPostApplyPreview(previewInput({
    startAdapter: async () => {
      starts += 1;
      return readyOperation();
    }
  }));
  assert.equal(starts, 1);
  assert.equal(output.result.previewReady, true);
});

test("O contradictory readiness metadata fails closed", () => {
  const base: Omit<PostApplyPreviewResult, "summary" | "validationWarnings"> = {
    commandSource: "package_script",
    existingProcessReused: false,
    failureClass: "NONE",
    failureDetails: null,
    filesApplied: true,
    filesChanged: ["src/App.tsx"],
    httpStatus: null,
    packageManager: "pnpm",
    port: 5173,
    portSelectionResult: "preferred_port",
    previewAttempted: true,
    previewReady: true,
    previewUrl: "http://127.0.0.1:5173",
    processStarted: true,
    readinessVerified: false,
    recoverySteps: [],
    runnableTargetDetected: true,
    runtimeKind: "react_vite",
    runtimeStatus: "READY",
    selectedCommand: "pnpm run dev",
    selectedScript: "dev",
    verificationStatus: "PASSED",
    workspacePath: "."
  };
  const normalized = normalizePostApplyPreviewResult(base);
  assert.equal(normalized.runtimeStatus, "FAILED");
  assert.equal(normalized.previewReady, false);
  assert.equal(normalized.previewUrl, null);
  assert.ok(normalized.validationWarnings.some((warning) =>
    warning.code === "POST_APPLY_READY_WITHOUT_READINESS"
  ));
});

test("telemetry keeps file sync success separate from preview failure", () => {
  const output = syncRuntimeApprovalResult({
    activePath: "src/App.tsx",
    currentFiles: {},
    projectId: "project-a",
    proposalChanges: [{
      action: "write_file",
      path: "src/App.tsx",
      proposedContent: "export default function App() { return null; }",
      summary: "Update app"
    }],
    proposalId: "proposal-a",
    runtimeResult: {
      applied: true,
      canonicalProjectFiles: [{ content: "export default function App() { return null; }", path: "src/App.tsx" }],
      canonicalProjectRevision: "revision-b",
      fileContents: {
        "src/App.tsx": "export default function App() { return null; }"
      },
      ok: true,
      postApplyPreview: {
        commandSource: "package_script",
        existingProcessReused: false,
        failureClass: "READINESS_TIMEOUT",
        failureDetails: "Runtime readiness timed out.",
        filesApplied: true,
        filesChanged: ["src/App.tsx"],
        httpStatus: null,
        packageManager: "pnpm",
        port: null,
        portSelectionResult: "none",
        previewAttempted: true,
        previewReady: false,
        previewUrl: null,
        processStarted: true,
        readinessVerified: false,
        recoverySteps: ["Review the runtime output."],
        runnableTargetDetected: true,
        runtimeKind: "react_vite",
        runtimeStatus: "FAILED",
        selectedCommand: "pnpm run dev",
        selectedScript: "dev",
        summary: "Files applied; preview failed.",
        validationWarnings: [],
        verificationStatus: "PASSED",
        workspacePath: "."
      },
      runnerStatus: "completed",
      verification: { ok: true },
      writtenFiles: ["src/App.tsx"]
    }
  });
  assert.equal(output.proposalApplied, true);
  assert.equal(output.runtimeMetadata.postApplyPreviewReady, false);
  assert.equal(output.runtimeMetadata.postApplyFailureClass, "READINESS_TIMEOUT");
  assert.equal(output.runtimeMetadata.postApplyPortSelectionResult, "none");
  assert.equal(output.runtimeMetadata.postApplyProcessStarted, true);
  assert.equal(output.runtimeMetadata.postApplyRecoveryProvided, true);
  assert.equal(output.runtimeMetadata.runtimeSyncStatus, "synced");
});

test("readiness probe is bounded and verifies a real local HTTP response", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ready");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const result = await waitForOwnedLocalHttp({
      isProcessAlive: () => true,
      pollIntervalMs: 10,
      requestTimeoutMs: 250,
      timeoutMs: 1_000,
      url: `http://127.0.0.1:${address.port}`
    });
    assert.deepEqual(result, {
      error: null,
      ok: true,
      outcome: "ready",
      status: 200
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("readiness probe stops immediately when the owned process exits", async () => {
  const startedAt = Date.now();
  const result = await waitForOwnedLocalHttp({
    isProcessAlive: () => false,
    timeoutMs: 5_000,
    url: "http://127.0.0.1:1"
  });
  assert.equal(result.outcome, "process_exited");
  assert.equal(result.ok, false);
  assert.ok(Date.now() - startedAt < 500);
});

test("readiness probe honors cancellation without an unbounded wait", async () => {
  const controller = new AbortController();
  controller.abort();
  const startedAt = Date.now();
  const result = await waitForOwnedLocalHttp({
    abortSignal: controller.signal,
    timeoutMs: 5_000,
    url: "http://127.0.0.1:1"
  });
  assert.equal(result.outcome, "cancelled");
  assert.equal(result.ok, false);
  assert.ok(Date.now() - startedAt < 500);
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} post-apply preview checks passed.\n`);
