import { sanitizeUntrustedToolText } from "@/lib/server/intelligence/security-kernel";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

export type RuntimeReadiness = {
  error: string | null;
  outcome:
    | "application_error"
    | "cancelled"
    | "http_unreachable"
    | "process_exited"
    | "ready"
    | "timeout";
  ok: boolean;
  status: number | null;
};

export function isSafeDevelopmentScript(
  script: string,
  framework: "backend_node" | "next" | "vite"
) {
  const normalized = script.trim().replace(/\s+/g, " ");
  if (!normalized || /[;&|><`$]|\r|\n/.test(normalized)) return false;
  if (/\b(?:install|add|remove|uninstall|publish|deploy|docker|kubectl|git|migrate)\b/i.test(normalized)) {
    return false;
  }
  if (framework === "vite") return /^vite(?:\s+--[\w-]+(?:=\S+|\s+\S+)?)?$/i.test(normalized);
  if (framework === "next") return /^next\s+dev(?:\s+--[\w-]+(?:=\S+|\s+\S+)?)?$/i.test(normalized);
  return /^node\s+(?:server|src\/server|app|src\/app)\.[cm]?js$/i.test(normalized.replace(/\\/g, "/"));
}

export async function waitForOwnedLocalHttp(input: {
  abortSignal?: AbortSignal;
  isProcessAlive?: () => boolean;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  timeoutMs: number;
  url: string;
}): Promise<RuntimeReadiness> {
  const startedAt = Date.now();
  let lastError = "The owned runtime did not become ready.";
  let lastStatus: number | null = null;
  while (Date.now() - startedAt < input.timeoutMs) {
    if (input.abortSignal?.aborted) {
      return {
        error: "Runtime readiness was cancelled.",
        outcome: "cancelled",
        ok: false,
        status: lastStatus
      };
    }
    if (input.isProcessAlive && !input.isProcessAlive()) {
      return {
        error: "The owned runtime process exited before readiness was verified.",
        outcome: "process_exited",
        ok: false,
        status: lastStatus
      };
    }
    const controller = new AbortController();
    const abortProbe = () => controller.abort();
    input.abortSignal?.addEventListener("abort", abortProbe, { once: true });
    const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs ?? 1_500);
    try {
      const response = await fetch(input.url, {
        redirect: "manual",
        signal: controller.signal
      });
      lastStatus = response.status;
      if (response.status < 500) {
        return { error: null, outcome: "ready", ok: true, status: response.status };
      }
      lastError = `The owned runtime responded with HTTP ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The owned runtime readiness check failed.";
    } finally {
      clearTimeout(timeout);
      input.abortSignal?.removeEventListener("abort", abortProbe);
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs ?? 250));
  }
  return {
    error: sanitizeUntrustedToolText(lastError).sanitized,
    outcome: lastStatus && lastStatus >= 500 ? "application_error" : "timeout",
    ok: false,
    status: lastStatus
  };
}

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolveWait) => {
    let finished = false;
    const finish = (exited: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      child.removeListener("exit", onExit);
      resolveWait(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(child.exitCode !== null || child.signalCode !== null), timeoutMs);
    child.once("exit", onExit);
  });
}

async function killWindowsProcessTree(pid: number) {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  const command = path.join(systemRoot, "System32", "taskkill.exe");
  await new Promise<void>((resolveKill) => {
    const killer = spawn(command, ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolveKill();
    };
    const timeout = setTimeout(finish, 3_000);
    killer.once("error", finish);
    killer.once("exit", finish);
  });
}

export async function stopOwnedChild(child: ChildProcessWithoutNullStreams | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    await killWindowsProcessTree(child.pid);
  } else {
    child.kill("SIGTERM");
    if (!(await waitForExit(child, 1_500))) {
      child.kill("SIGKILL");
    }
  }
  if (!(await waitForExit(child, 2_500))) {
    throw new Error("The owned runtime process did not exit and remains tracked.");
  }
}
