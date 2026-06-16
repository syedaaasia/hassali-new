import type {
  MobileRuntimeOperationResult,
  MobileRuntimeRecord
} from "@/lib/server/runtime/mobile-runtime-types";

const runtimes = new Map<string, MobileRuntimeRecord>();

function publicRecord(record: MobileRuntimeRecord): MobileRuntimeRecord {
  return {
    ...record,
    candidateCommands: [...record.candidateCommands],
    capabilities: [...record.capabilities],
    navigation: [...record.navigation],
    screens: [...record.screens]
  };
}

export function startRuntime(record: MobileRuntimeRecord): MobileRuntimeOperationResult {
  runtimes.set(record.projectId, record);

  return {
    ...publicRecord(record),
    logs: [`[system] Mobile runtime candidate recorded for ${record.framework}.`]
  };
}

export function getRuntime(projectId: string) {
  const record = runtimes.get(projectId);

  return record ? publicRecord(record) : null;
}

export function stopRuntime(projectId: string) {
  const record = runtimes.get(projectId);

  if (!record) return null;

  const stopped: MobileRuntimeRecord = {
    ...record,
    status: "metadata_only"
  };

  runtimes.set(projectId, stopped);

  return publicRecord(stopped);
}
