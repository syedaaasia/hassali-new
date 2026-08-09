import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  deletePersistedIntelligenceSource,
  getPersistedIntelligenceSecret,
  hasPersistedIntelligenceSecret,
  putPersistedIntelligenceSecret,
  type PersistedIntelligenceSecretEnvelope
} from "@hassali/database";

export type IntelligenceSecretStore = {
  delete: (userId: string, sourceId: string) => Promise<boolean>;
  exists: (userId: string, sourceId: string) => Promise<boolean>;
  get: (userId: string, sourceId: string) => Promise<string | null>;
  put: (userId: string, sourceId: string, secret: string) => Promise<void>;
};

type SecretPersistenceBackend = {
  delete: (userId: string, sourceId: string) => Promise<boolean>;
  exists: (userId: string, sourceId: string) => Promise<boolean>;
  get: (userId: string, sourceId: string) => Promise<PersistedIntelligenceSecretEnvelope | null>;
  put: (userId: string, sourceId: string, envelope: PersistedIntelligenceSecretEnvelope) => Promise<void>;
};

function associatedData(userId: string, sourceId: string, keyVersion: string) {
  return Buffer.from(`hassali-intelligence:${keyVersion}:${userId}:${sourceId}`, "utf8");
}

export class IntelligenceSecretCipher {
  constructor(
    private readonly key: Buffer,
    readonly keyVersion: string
  ) {
    if (key.byteLength !== 32) throw new Error("INTELLIGENCE_MASTER_KEY_INVALID");
    if (!/^[a-zA-Z0-9._-]{1,40}$/.test(keyVersion)) throw new Error("INTELLIGENCE_KEY_VERSION_INVALID");
  }

  encrypt(userId: string, sourceId: string, secret: string): PersistedIntelligenceSecretEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(associatedData(userId, sourceId, this.keyVersion));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      keyVersion: this.keyVersion
    };
  }

  decrypt(userId: string, sourceId: string, envelope: PersistedIntelligenceSecretEnvelope) {
    if (envelope.keyVersion !== this.keyVersion) throw new Error("INTELLIGENCE_KEY_VERSION_UNAVAILABLE");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(associatedData(userId, sourceId, envelope.keyVersion));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }
}

export class DurableIntelligenceSecretStore implements IntelligenceSecretStore {
  constructor(
    private readonly backend: SecretPersistenceBackend,
    private readonly cipher: IntelligenceSecretCipher
  ) {}

  delete(userId: string, sourceId: string) {
    return this.backend.delete(userId, sourceId);
  }

  exists(userId: string, sourceId: string) {
    return this.backend.exists(userId, sourceId);
  }

  async get(userId: string, sourceId: string) {
    const envelope = await this.backend.get(userId, sourceId);
    return envelope ? this.cipher.decrypt(userId, sourceId, envelope) : null;
  }

  async put(userId: string, sourceId: string, secret: string) {
    await this.backend.put(userId, sourceId, this.cipher.encrypt(userId, sourceId, secret));
  }
}

function parseMasterKey(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  const decoded = Buffer.from(trimmed, "base64");
  return decoded.byteLength === 32 ? decoded : null;
}

function databaseBackend(): SecretPersistenceBackend {
  return {
    delete: deletePersistedIntelligenceSource,
    exists: hasPersistedIntelligenceSecret,
    get: getPersistedIntelligenceSecret,
    put: (userId, sourceId, envelope) => putPersistedIntelligenceSecret({ envelope, externalUserId: userId, sourceId })
  };
}

let cachedEnvironmentStore: IntelligenceSecretStore | null | undefined;

export function environmentIntelligenceSecretStore(): IntelligenceSecretStore | null {
  if (cachedEnvironmentStore !== undefined) return cachedEnvironmentStore;
  const key = parseMasterKey(process.env.HASSALI_INTELLIGENCE_MASTER_KEY);
  if (!key) {
    cachedEnvironmentStore = null;
    return null;
  }
  const version = process.env.HASSALI_INTELLIGENCE_KEY_VERSION?.trim() || "v1";
  cachedEnvironmentStore = new DurableIntelligenceSecretStore(
    databaseBackend(),
    new IntelligenceSecretCipher(key, version)
  );
  return cachedEnvironmentStore;
}

export function intelligenceSecretPersistenceState() {
  const configured = Boolean(parseMasterKey(process.env.HASSALI_INTELLIGENCE_MASTER_KEY));
  return {
    mode: configured ? "durable-encrypted" as const : "server-session" as const,
    reason: configured
      ? "BYOK credentials are encrypted with the configured server master key before PostgreSQL persistence."
      : "Durable BYOK storage requires HASSALI_INTELLIGENCE_MASTER_KEY; credentials remain encrypted in server memory for this session."
  };
}

export function resetEnvironmentIntelligenceSecretStoreForTests() {
  cachedEnvironmentStore = undefined;
}
