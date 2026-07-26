import type { CodeExecutionReport } from "./code-execution-types";

type InFlightRecord = {
  abortController: AbortController;
  promise: Promise<CodeExecutionReport>;
};

type CompletedRecord = {
  completedAt: number;
  report: CodeExecutionReport;
};

const inFlight = new Map<string, InFlightRecord>();
const completed = new Map<string, CompletedRecord>();
const completedTtlMs = 15 * 60 * 1000;
const maxCompleted = 100;

function prune() {
  const now = Date.now();
  for (const [key, record] of completed) {
    if (now - record.completedAt > completedTtlMs) completed.delete(key);
  }
  while (completed.size > maxCompleted) {
    const oldest = completed.keys().next().value as string | undefined;
    if (!oldest) break;
    completed.delete(oldest);
  }
}

export function codeExecutionKey(projectId: string, proposalId: string) {
  return `${projectId}:${proposalId}`;
}

export async function runCodeExecutionOnce(input: {
  execute: (signal: AbortSignal) => Promise<CodeExecutionReport>;
  key: string;
}) {
  prune();
  const prior = completed.get(input.key);
  if (prior) return { duplicateSuppressed: true, report: prior.report };
  const active = inFlight.get(input.key);
  if (active) return { duplicateSuppressed: true, report: await active.promise };
  const abortController = new AbortController();
  const promise = input.execute(abortController.signal);
  inFlight.set(input.key, { abortController, promise });
  try {
    const report = await promise;
    completed.set(input.key, { completedAt: Date.now(), report });
    return { duplicateSuppressed: false, report };
  } finally {
    inFlight.delete(input.key);
  }
}

export function cancelCodeExecution(key: string) {
  const active = inFlight.get(key);
  if (!active) return false;
  active.abortController.abort();
  return true;
}

export function clearCodeExecutionRegistry() {
  for (const record of inFlight.values()) record.abortController.abort();
  inFlight.clear();
  completed.clear();
}
