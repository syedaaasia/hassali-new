import type {
  DocumentBlock,
  DocumentConfidence,
  DocumentTable
} from "./document-contract";

export type OcrInput = {
  bytes: Uint8Array;
  documentId: string;
  filename: string;
  mimeType: string;
  pageNumber?: number;
  source: "image" | "pdf-page";
};

export type OcrResult = {
  blocks: DocumentBlock[];
  confidence: DocumentConfidence;
  language: string | null;
  orientation: 0 | 90 | 180 | 270 | null;
  provider: string;
  tables: DocumentTable[];
  text: string;
  warnings: string[];
};

export type OcrHealth = {
  checkedAt: string;
  provider: string;
  reason: string | null;
  retryable: boolean;
  status: "ready" | "unavailable" | "unconfigured";
};

export interface OcrProvider {
  readonly id: string;
  readonly supports?: {
    image: boolean;
    pdfPage: boolean;
  };
  health(): Promise<OcrHealth>;
  recognizeImage(input: OcrInput, signal?: AbortSignal): Promise<OcrResult>;
  recognizePage(input: OcrInput, signal?: AbortSignal): Promise<OcrResult>;
}

export class OcrProviderRegistry {
  private readonly providers = new Map<string, OcrProvider>();

  register(provider: OcrProvider) {
    if (this.providers.has(provider.id)) {
      throw new Error(`OCR provider '${provider.id}' is already registered.`);
    }
    this.providers.set(provider.id, provider);
    return this;
  }

  get(providerId: string) {
    return this.providers.get(providerId) ?? null;
  }

  list() {
    return [...this.providers.values()];
  }

  async firstReady() {
    for (const provider of this.providers.values()) {
      const health = await provider.health().catch(() => null);
      if (health?.status === "ready") return provider;
    }
    return null;
  }
}

export function unavailableOcrHealth(provider = "none"): OcrHealth {
  return {
    checkedAt: new Date().toISOString(),
    provider,
    reason: "No OCR provider is configured in the current runtime.",
    retryable: false,
    status: "unconfigured"
  };
}

export const documentOcrProviders = new OcrProviderRegistry();
