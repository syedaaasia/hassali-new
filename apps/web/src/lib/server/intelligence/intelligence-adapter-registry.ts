import {
  normalizeIntelligenceRequest,
  type IntelligenceCapabilityProfile,
  type IntelligenceComputeSource,
  type IntelligenceFailure,
  type IntelligenceHealth,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult,
  type IntelligenceStreamResult
} from "./intelligence-contract";

export type IntelligenceAdapter = {
  capabilities: IntelligenceCapabilityProfile;
  computeSource: IntelligenceComputeSource;
  defaultModelId?: string | null;
  discoverModels?: (signal?: AbortSignal) => Promise<IntelligenceModelDescriptor[]>;
  health: (signal?: AbortSignal) => Promise<IntelligenceHealth>;
  id: string;
  invoke: (request: IntelligenceRequest) => Promise<IntelligenceResult>;
  models?: () => Promise<IntelligenceModelDescriptor[]>;
  providerId: string;
  stream?: (request: IntelligenceRequest) => Promise<IntelligenceStreamResult>;
};

export class IntelligenceAdapterRegistryError extends Error {
  readonly code: "ADAPTER_ALREADY_REGISTERED" | "ADAPTER_NOT_REGISTERED";

  constructor(code: IntelligenceAdapterRegistryError["code"], message: string) {
    super(message);
    this.name = "IntelligenceAdapterRegistryError";
    this.code = code;
  }
}

function registryFailure(adapterId: string): IntelligenceFailure {
  return {
    category: "provider-unavailable",
    internal: { code: "ADAPTER_NOT_REGISTERED", details: `No adapter is registered for ${adapterId}.` },
    model: null,
    providerId: adapterId,
    retryable: false,
    safeUserMessage: "The selected intelligence provider is not available in Hassali."
  };
}

function capabilityFailure(adapter: IntelligenceAdapter, request: IntelligenceRequest): IntelligenceFailure | null {
  const missing = request.requiredCapabilities.find(
    (capability) => adapter.capabilities[capability] !== "supported"
  );
  if (!missing) return null;
  const support = adapter.capabilities[missing];
  return {
    category: "unsupported-capability",
    internal: {
      code: support === "unknown" ? "CAPABILITY_SUPPORT_UNKNOWN" : "CAPABILITY_UNSUPPORTED",
      details: `${adapter.id} reports ${support} support for ${missing}.`
    },
    model: request.requestedModel ?? null,
    providerId: adapter.providerId,
    retryable: false,
    safeUserMessage: `The selected provider cannot confirm the required ${missing} capability.`
  };
}

function privacyFailure(adapter: IntelligenceAdapter, request: IntelligenceRequest): IntelligenceFailure | null {
  if (request.privacy?.dataLocality !== "local-only") return null;
  if (adapter.computeSource === "local-endpoint" || adapter.computeSource === "hassali-local") return null;
  return {
    category: "invalid-request",
    internal: { code: "LOCAL_ONLY_COMPUTE_REQUIRED" },
    model: request.requestedModel ?? null,
    providerId: adapter.providerId,
    retryable: false,
    safeUserMessage: "This request requires local processing, but the selected compute source is not local."
  };
}

export class IntelligenceAdapterRegistry {
  private readonly adapters = new Map<string, IntelligenceAdapter>();

  register(adapter: IntelligenceAdapter) {
    const id = adapter.id.trim().toLowerCase();
    if (!id) throw new IntelligenceAdapterRegistryError("ADAPTER_ALREADY_REGISTERED", "Adapter ID cannot be empty.");
    if (this.adapters.has(id)) {
      throw new IntelligenceAdapterRegistryError("ADAPTER_ALREADY_REGISTERED", `Adapter ${id} is already registered.`);
    }
    this.adapters.set(id, adapter);
    return this;
  }

  get(adapterId: string) {
    const id = adapterId.trim().toLowerCase();
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new IntelligenceAdapterRegistryError("ADAPTER_NOT_REGISTERED", `Adapter ${id || "(empty)"} is not registered.`);
    }
    return adapter;
  }

  list() {
    return Array.from(this.adapters.values());
  }

  async health(adapterId: string, signal?: AbortSignal): Promise<IntelligenceHealth> {
    const adapter = this.adapters.get(adapterId.trim().toLowerCase());
    if (!adapter) {
      return {
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        providerId: adapterId,
        reason: "No adapter is registered for the requested provider.",
        retryable: false,
        status: "unavailable"
      };
    }
    return adapter.health(signal);
  }

  async invoke(adapterId: string, input: IntelligenceRequest): Promise<IntelligenceResult> {
    const adapter = this.adapters.get(adapterId.trim().toLowerCase());
    if (!adapter) return { ok: false, failure: registryFailure(adapterId) };
    const request = normalizeIntelligenceRequest(input);
    const failure = privacyFailure(adapter, request) ?? capabilityFailure(adapter, request);
    return failure ? { ok: false, failure } : adapter.invoke(request);
  }

  async stream(adapterId: string, input: IntelligenceRequest): Promise<IntelligenceStreamResult> {
    const adapter = this.adapters.get(adapterId.trim().toLowerCase());
    if (!adapter) return { ok: false, failure: registryFailure(adapterId) };
    const request = normalizeIntelligenceRequest({ ...input, stream: true });
    const failure = privacyFailure(adapter, request) ?? capabilityFailure(adapter, request);
    if (failure) return { ok: false, failure };
    if (!adapter.stream) {
      return {
        ok: false,
        failure: {
          category: "unsupported-capability",
          internal: { code: "STREAM_METHOD_UNAVAILABLE" },
          model: request.requestedModel ?? null,
          providerId: adapter.providerId,
          retryable: false,
          safeUserMessage: "The selected provider does not expose streaming through Hassali."
        }
      };
    }
    return adapter.stream(request);
  }
}
