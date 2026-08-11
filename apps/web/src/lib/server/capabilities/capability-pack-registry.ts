import type { CapabilityPack, CapabilityPackDetection } from "./capability-types";
import type { RepositorySnapshot } from "../repository-intelligence/repository-intelligence-types";

export class CapabilityPackRegistry {
  private readonly packs = new Map<string, CapabilityPack>();

  register(pack: CapabilityPack) {
    const id = pack.id.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) throw new Error("Capability pack ID is invalid.");
    if (this.packs.has(id)) throw new Error(`Capability pack '${id}' is already registered.`);
    if (!pack.kinds.length) throw new Error(`Capability pack '${id}' must declare at least one capability kind.`);
    this.packs.set(id, { ...pack, id });
    return this;
  }

  get(id: string) {
    return this.packs.get(id) ?? null;
  }

  list() {
    return [...this.packs.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  detect(snapshot: RepositorySnapshot): CapabilityPackDetection[] {
    return this.list()
      .map((pack) => pack.detect(snapshot))
      .filter((result): result is CapabilityPackDetection => result !== null)
      .sort((left, right) => right.confidence - left.confidence || left.packId.localeCompare(right.packId));
  }
}
