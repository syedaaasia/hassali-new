export class GrowthDiscoveryError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function growthStorageFailure(error: unknown) {
  let current = error;
  const seen = new Set<unknown>();
  const codes: string[] = [];
  for (let i = 0; i < 5 && current && typeof current === "object" && !seen.has(current); i++) {
    seen.add(current);
    const e = current as { code?: unknown; cause?: unknown };
    if (typeof e.code === "string") codes.push(e.code);
    current = e.cause;
  }
  if (codes.includes("42P01")) return { code: "GROWTH_STORAGE_TABLE_MISSING", error: "Growth storage has not been provisioned. Ask the administrator to apply the existing Growth migration." };
  if (codes.some(c => ["28P01", "28000", "42501"].includes(c))) return { code: "GROWTH_STORAGE_PERMISSION_DENIED", error: "Growth cannot access its storage with the configured database permissions." };
  if (codes.some(c => c.startsWith("08") || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "57P01", "53300"].includes(c))) return { code: "GROWTH_STORAGE_UNREACHABLE", error: "Growth cannot reach its database right now. Your saved data has not been replaced." };
  return { code: "GROWTH_STORAGE_FAILED", error: "Growth project storage is unavailable. Your saved data has not been replaced." };
}
