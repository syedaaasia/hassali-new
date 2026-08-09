import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type {
  ConfigurableIntelligenceSourceId,
  IntelligenceSourceModelSummary
} from "@/lib/intelligence-sources";
import type { IntelligenceRoutingPrivacy } from "./auto-intelligence-router";
import type { IntelligenceHealth } from "./intelligence-contract";

type EncryptedCredential = {
  authTag: string;
  ciphertext: string;
  iv: string;
};

export type StoredIntelligenceSource = {
  credentialConfigured: boolean;
  defaultModel: string | null;
  enabled: boolean;
  endpointUrl: string | null;
  health: IntelligenceHealth | null;
  id: ConfigurableIntelligenceSourceId;
  models: IntelligenceSourceModelSummary[];
  updatedAt: string;
};

type InternalStoredSource = StoredIntelligenceSource & {
  credential: EncryptedCredential | null;
};

function cloneSource(source: InternalStoredSource): StoredIntelligenceSource {
  return {
    credentialConfigured: source.credentialConfigured,
    defaultModel: source.defaultModel,
    enabled: source.enabled,
    endpointUrl: source.endpointUrl,
    health: source.health ? { ...source.health } : null,
    id: source.id,
    models: source.models.map((model) => ({ ...model })),
    updatedAt: source.updatedAt
  };
}

export class IntelligenceSourceSessionVault {
  private readonly encryptionKey = randomBytes(32);
  private readonly routingPreferences = new Map<string, IntelligenceRoutingPrivacy>();
  private readonly users = new Map<string, Map<ConfigurableIntelligenceSourceId, InternalStoredSource>>();

  private encrypt(value: string): EncryptedCredential {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64")
    };
  }

  private decrypt(value: EncryptedCredential) {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(value.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  configure(input: {
    apiKey?: string;
    defaultModel?: string | null;
    enabled: boolean;
    endpointUrl: string | null;
    sourceId: ConfigurableIntelligenceSourceId;
    userId: string;
  }) {
    const userSources = this.users.get(input.userId) ?? new Map();
    const existing = userSources.get(input.sourceId);
    const trimmedKey = input.apiKey?.trim();
    const credential = trimmedKey ? this.encrypt(trimmedKey) : existing?.credential ?? null;
    const source: InternalStoredSource = {
      credential,
      credentialConfigured: Boolean(credential),
      defaultModel: input.defaultModel?.trim() || null,
      enabled: input.enabled,
      endpointUrl: input.endpointUrl,
      health: existing?.health ?? null,
      id: input.sourceId,
      models: existing?.models ?? [],
      updatedAt: new Date().toISOString()
    };
    userSources.set(input.sourceId, source);
    this.users.set(input.userId, userSources);
    return cloneSource(source);
  }

  disconnect(userId: string, sourceId: ConfigurableIntelligenceSourceId) {
    const sources = this.users.get(userId);
    const removed = sources?.delete(sourceId) ?? false;
    if (sources && sources.size === 0) this.users.delete(userId);
    return removed;
  }

  get(userId: string, sourceId: ConfigurableIntelligenceSourceId) {
    const source = this.users.get(userId)?.get(sourceId);
    return source ? cloneSource(source) : null;
  }

  getCredential(userId: string, sourceId: ConfigurableIntelligenceSourceId) {
    const credential = this.users.get(userId)?.get(sourceId)?.credential;
    return credential ? this.decrypt(credential) : null;
  }

  getRoutingPrivacy(userId: string): IntelligenceRoutingPrivacy {
    return this.routingPreferences.get(userId) ?? "allow-cloud";
  }

  setRoutingPrivacy(userId: string, privacy: IntelligenceRoutingPrivacy) {
    this.routingPreferences.set(userId, privacy);
    return privacy;
  }

  list(userId: string) {
    return Array.from(this.users.get(userId)?.values() ?? [], cloneSource);
  }

  recordCheck(input: {
    health: IntelligenceHealth;
    models: IntelligenceSourceModelSummary[];
    sourceId: ConfigurableIntelligenceSourceId;
    userId: string;
  }) {
    const source = this.users.get(input.userId)?.get(input.sourceId);
    if (!source) return null;
    source.health = { ...input.health };
    source.models = input.models.slice(0, 100).map((model) => ({ ...model }));
    source.updatedAt = new Date().toISOString();
    return cloneSource(source);
  }

  reset() {
    this.users.clear();
    this.routingPreferences.clear();
  }
}

export const intelligenceSourceSessionVault = new IntelligenceSourceSessionVault();
