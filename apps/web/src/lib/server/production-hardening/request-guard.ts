export const productionRequestLimits = {
  chatJsonBytes: 2 * 1024 * 1024,
  memoryJsonBytes: 256 * 1024,
  mutationJsonBytes: 8 * 1024 * 1024,
  settingsJsonBytes: 256 * 1024
} as const;

export type BoundedJsonResult<T> =
  | { ok: true; value: T }
  | { code: "INVALID_JSON" | "REQUEST_TOO_LARGE"; message: string; ok: false; status: 400 | 413 };

function declaredLength(request: Request) {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function checkDeclaredRequestSize(request: Request, maximumBytes: number) {
  const declared = declaredLength(request);
  return declared !== null && declared > maximumBytes
    ? { code: "REQUEST_TOO_LARGE" as const, message: "The request is too large to process safely.", ok: false as const, status: 413 as const }
    : { ok: true as const };
}

export async function readBoundedJson<T>(request: Request, maximumBytes: number): Promise<BoundedJsonResult<T>> {
  const preflight = checkDeclaredRequestSize(request, maximumBytes);
  if (!preflight.ok) return preflight;
  if (!request.body) return { code: "INVALID_JSON", message: "A valid JSON body is required.", ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { code: "REQUEST_TOO_LARGE", message: "The request is too large to process safely.", ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as T };
  } catch {
    return { code: "INVALID_JSON", message: "A valid JSON body is required.", ok: false, status: 400 };
  }
}

export function boundedJsonFailure(result: Exclude<BoundedJsonResult<unknown>, { ok: true }>) {
  return Response.json(
    { code: result.code, error: result.message },
    { headers: { "Cache-Control": "no-store" }, status: result.status }
  );
}
