import type { WebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff";
import type { TaskVerification } from "@/lib/server/runtime/verification-recovery/verification-types";
import type { ShippingManifest } from "@/lib/server/verified-shipping";
import { GraphKernel, graphNode, graphNodeId } from "./graph-kernel";
import type { GraphMode, GraphNode, GraphScope } from "./graph-types";

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function constraintValues(prompt: string) {
  const values: string[] = [];
  const budget = prompt.match(/(?:budget(?:\s+is|\s+of)?\s*)?(\$\s?\d[\d,]*(?:\.\d+)?)/i)?.[1];
  if (budget) values.push(`budget ${budget.replace(/\s+/g, "")}`);
  for (const match of prompt.matchAll(/\b(?:without|avoid|do not|don't|no)\s+([^,.!?;]+)/gi)) {
    values.push(`${match[0].split(/\s+/)[0]!.toLowerCase()} ${match[1]!.trim()}`);
  }
  if (/bundle size matters most/i.test(prompt)) values.push("bundle size matters most");
  return [...new Set(values.map(normalized))];
}

function entityValues(prompt: string) {
  const known = ["React", "Vue", "Svelte", "Python", "TypeScript"];
  return known.filter((entity) => new RegExp(`\\b${entity}\\b`, "i").test(prompt));
}

export function projectAskObjective(input: {
  capabilities?: string[];
  constraints?: string[];
  entities?: string[];
  graph?: GraphKernel;
  objective: string;
  scopeId: string;
}) {
  const graph = input.graph ?? new GraphKernel();
  const scope: GraphScope = { id: input.scopeId, kind: "conversation" };
  const objective = graph.upsertNode(graphNode({ identity: normalized(input.objective).toLowerCase(), kind: "objective", label: input.objective, mode: "ASK", provenance: "current_user_input", scope }));
  for (const constraintValue of [...constraintValues(input.objective), ...(input.constraints ?? [])]) {
    const constraint = graph.upsertNode(graphNode({ factState: "confirmed", identity: `constraint:${normalized(constraintValue).toLowerCase()}`, kind: "constraint", label: constraintValue, mode: "ASK", provenance: "current_user_input", scope }));
    graph.connect({ factState: "confirmed", from: objective.id, kind: "HAS_CONSTRAINT", mode: "ASK", provenance: "current_user_input", scope, status: "current", to: constraint.id });
  }
  for (const entityValue of [...entityValues(input.objective), ...(input.entities ?? [])]) {
    const entity = graph.upsertNode(graphNode({ factState: "derived", identity: `entity:${entityValue.toLowerCase()}`, kind: "entity", label: entityValue, mode: "ASK", provenance: "deterministic", scope }));
    graph.connect({ factState: "derived", from: objective.id, kind: "RELATED_TO", mode: "ASK", provenance: "deterministic", scope, status: "current", to: entity.id });
  }
  for (const capabilityValue of input.capabilities ?? []) {
    const capability = graph.upsertNode(graphNode({ factState: "derived", identity: `capability:${capabilityValue.toLowerCase()}`, kind: "capability", label: capabilityValue, mode: "ASK", provenance: "deterministic", scope }));
    graph.connect({ factState: "derived", from: objective.id, kind: "REQUIRES", mode: "ASK", provenance: "deterministic", scope, status: "current", to: capability.id });
  }
  return { graph, objective };
}

export function projectWebsiteState(input: {
  assets?: Array<{ id: string; provenance: "generated" | "hassali_curated" | "project_existing" | "user_upload"; role: string }>;
  graph?: GraphKernel;
  growthHandoff?: Pick<WebsiteGrowthHandoff, "projectId" | "revision"> | null;
  pages?: string[];
  previousRevision?: string | null;
  projectId: string;
  revision: string;
  visualQaId?: string | null;
}) {
  const graph = input.graph ?? new GraphKernel();
  const scope: GraphScope = { id: input.projectId, kind: "project" };
  const project = graph.upsertNode(graphNode({ authority: { id: input.projectId, kind: "project", projectId: input.projectId }, identity: input.projectId, kind: "project", label: `WEBSITE project ${input.projectId}`, mode: "WEBSITE", privacy: "private", provenance: "database", scope }));
  const previous = input.previousRevision
    ? graph.getNode(projectRevisionNodeId(scope, input.previousRevision))
    : null;
  const revisionInput = graphNode({ authority: { id: input.revision, kind: "project-revision", projectId: input.projectId, revision: input.revision }, identity: input.revision, kind: "revision", label: `WEBSITE revision ${input.revision}`, mode: "WEBSITE", privacy: "private", provenance: "project_state", scope });
  const revisionSeed = graph.upsertNode(revisionInput);
  const revision = graph.setCurrentRevision({ previousRevisionNodeId: previous?.id, projectNodeId: project.id, revisionNode: revisionSeed });

  for (const pagePath of input.pages ?? []) {
    const file = graph.upsertNode(graphNode({ authority: { id: `${input.revision}:${pagePath}`, kind: "project-file", path: pagePath, projectId: input.projectId, revision: input.revision }, identity: `${input.revision}:${pagePath}`, kind: "file", label: pagePath, mode: "WEBSITE", privacy: "private", provenance: "project_state", scope, sourceRevision: input.revision }));
    graph.connect({ factState: "confirmed", from: revision.id, kind: "CONTAINS", mode: "WEBSITE", provenance: "project_state", scope, sourceRevision: input.revision, status: "current", to: file.id });
  }
  for (const assetInput of input.assets ?? []) {
    const provenance = assetInput.provenance === "hassali_curated" ? "curated_asset" : assetInput.provenance === "user_upload" ? "user_upload" : assetInput.provenance === "generated" ? "generated" : "project_state";
    const asset = graph.upsertNode(graphNode({ authority: { id: assetInput.id, kind: "artifact", projectId: input.projectId, revision: input.revision }, identity: `asset:${assetInput.id}`, kind: "asset", label: `${assetInput.role} asset`, metadata: { role: assetInput.role, source: assetInput.provenance }, mode: "WEBSITE", privacy: assetInput.provenance === "user_upload" ? "private" : "provider_eligible", provenance, scope, sourceRevision: input.revision }));
    graph.connect({ factState: "confirmed", from: revision.id, kind: "USES", metadata: { role: assetInput.role }, mode: "WEBSITE", provenance, scope, sourceRevision: input.revision, status: "current", to: asset.id });
  }
  if (input.visualQaId) {
    const verification = graph.upsertNode(graphNode({ authority: { id: input.visualQaId, kind: "artifact", projectId: input.projectId, revision: input.revision }, factState: "derived", identity: `visual-qa:${input.visualQaId}`, kind: "verification", label: "WEBSITE visual QA", mode: "WEBSITE", privacy: "private", provenance: "verified", scope, sourceRevision: input.revision }));
    graph.connect({ factState: "derived", from: revision.id, kind: "VERIFIED_BY", mode: "WEBSITE", provenance: "verified", scope, sourceRevision: input.revision, status: "current", to: verification.id });
  }
  if (input.growthHandoff?.projectId === input.projectId && input.growthHandoff.revision === input.revision) {
    const artifact = graph.upsertNode(graphNode({ authority: { id: `growth:${input.revision}`, kind: "artifact", projectId: input.projectId, revision: input.revision }, factState: "derived", identity: `growth:${input.revision}`, kind: "artifact", label: "WEBSITE Growth handoff", mode: "WEBSITE", privacy: "private", provenance: "derived", scope, sourceRevision: input.revision }));
    graph.connect({ factState: "derived", from: artifact.id, kind: "DERIVED_FROM", mode: "WEBSITE", provenance: "derived", scope, sourceRevision: input.revision, status: "current", to: revision.id });
  }
  return { graph, project, revision };
}

function projectRevisionNodeId(scope: GraphScope, revision: string) {
  return graphNodeId(scope, "revision", revision);
}

export function projectCodeVerification(input: {
  actions: Array<{ files: Array<{ hash: string; path: string }>; id: string }>;
  graph?: GraphKernel;
  projectId: string;
  revision: string;
  taskId: string;
  verification: TaskVerification;
}) {
  const graph = input.graph ?? new GraphKernel();
  const scope: GraphScope = { id: input.taskId, kind: "task" };
  const task = graph.upsertNode(graphNode({ authority: { id: input.taskId, kind: "task", projectId: input.projectId, revision: input.revision }, identity: input.taskId, kind: "objective", label: `CODE task ${input.taskId}`, mode: "CODE", privacy: "private", provenance: "project_state", scope, sourceRevision: input.revision }));
  const project = graph.upsertNode(graphNode({ authority: { id: input.projectId, kind: "project", projectId: input.projectId, revision: input.revision }, identity: input.projectId, kind: "project", label: `CODE project ${input.projectId}`, mode: "CODE", privacy: "private", provenance: "project_state", scope, sourceRevision: input.revision }));
  graph.connect({ factState: "confirmed", from: task.id, kind: "TARGETS", mode: "CODE", provenance: "project_state", scope, sourceRevision: input.revision, status: "current", to: project.id });
  for (const actionInput of input.actions) {
    const action = graph.upsertNode(graphNode({ authority: { id: actionInput.id, kind: "task", projectId: input.projectId, revision: input.revision }, identity: actionInput.id, kind: "action", label: `CODE action ${actionInput.id}`, mode: "CODE", privacy: "private", provenance: "project_state", scope, sourceRevision: input.revision }));
    graph.connect({ factState: "confirmed", from: task.id, kind: "PRODUCED", mode: "CODE", provenance: "project_state", scope, sourceRevision: input.revision, status: "current", to: action.id });
    for (const fileInput of actionInput.files) {
      const file = graph.upsertNode(graphNode({ authority: { hash: fileInput.hash, id: `${input.revision}:${fileInput.path}`, kind: "project-file", path: fileInput.path, projectId: input.projectId, revision: input.revision }, identity: `${input.revision}:${fileInput.path}`, kind: "file", label: fileInput.path, mode: "CODE", privacy: "private", provenance: "project_state", scope, sourceRevision: input.revision }));
      graph.connect({ factState: "confirmed", from: action.id, kind: "MODIFIES", mode: "CODE", provenance: "project_state", scope, sourceRevision: input.revision, status: "current", to: file.id });
    }
    for (const result of input.verification.results.filter((result) => result.status === "passed")) {
      const verification = graph.upsertNode(graphNode({ authority: { id: result.criterionId, kind: "task", projectId: input.projectId, revision: input.revision }, identity: `verification:${result.criterionId}`, kind: "test", label: result.criterion, metadata: { evidenceCount: result.evidence.length }, mode: "CODE", privacy: "private", provenance: "verified", scope, sourceRevision: input.revision }));
      graph.connect({ factState: "derived", from: action.id, kind: "VERIFIED_BY", mode: "CODE", provenance: "verified", scope, sourceRevision: input.revision, status: "current", to: verification.id });
    }
  }
  return { graph, project, task };
}

export function projectShippingManifest(input: { graph?: GraphKernel; manifest: ShippingManifest; scopeId?: string }) {
  const graph = input.graph ?? new GraphKernel();
  const mode: GraphMode = input.manifest.mode;
  const scope: GraphScope = { id: input.scopeId ?? input.manifest.packageId, kind: "artifact" };
  const revision = graph.upsertNode(graphNode({ authority: { id: input.manifest.canonicalRevision, kind: "project-revision", revision: input.manifest.canonicalRevision }, identity: `revision:${input.manifest.canonicalRevision}`, kind: "revision", label: `Canonical revision ${input.manifest.canonicalRevision}`, mode, privacy: "private", provenance: "project_state", scope }));
  const artifact = graph.upsertNode(graphNode({ authority: { id: input.manifest.artifactId, kind: "artifact", revision: input.manifest.canonicalRevision }, factState: "derived", identity: input.manifest.artifactId, kind: "artifact", label: input.manifest.projectName, mode, privacy: "private", provenance: "derived", scope, sourceRevision: input.manifest.canonicalRevision }));
  const manifest = graph.upsertNode(graphNode({ authority: { hash: input.manifest.packageId, id: input.manifest.packageId, kind: "manifest", revision: input.manifest.canonicalRevision }, factState: "derived", identity: input.manifest.packageId, kind: "manifest", label: "Verified shipping manifest", metadata: { packageIntegrity: input.manifest.verification.packageIntegrity, projectVerification: input.manifest.verification.project }, mode, privacy: "private", provenance: "verified", scope, sourceRevision: input.manifest.canonicalRevision }));
  graph.connect({ factState: "derived", from: artifact.id, kind: "DERIVED_FROM", mode, provenance: "derived", scope, sourceRevision: input.manifest.canonicalRevision, status: "current", to: revision.id });
  graph.connect({ factState: "derived", from: artifact.id, kind: "PACKAGED_BY", mode, provenance: "verified", scope, sourceRevision: input.manifest.canonicalRevision, status: "current", to: manifest.id });
  for (const fileInput of input.manifest.files) {
    const file = graph.upsertNode(graphNode({ authority: { hash: fileInput.sha256, id: `${input.manifest.packageId}:${fileInput.path}`, kind: "manifest", path: fileInput.path, revision: input.manifest.canonicalRevision }, identity: `${input.manifest.canonicalRevision}:${fileInput.path}`, kind: "file", label: fileInput.path, metadata: { contentType: fileInput.contentType, sizeBytes: fileInput.sizeBytes }, mode, privacy: "private", provenance: "project_state", scope, sourceRevision: input.manifest.canonicalRevision }));
    graph.connect({ factState: "derived", from: manifest.id, kind: "CONTAINS", mode, provenance: "verified", scope, sourceRevision: input.manifest.canonicalRevision, status: "current", to: file.id });
  }
  return { artifact, graph, manifest, revision };
}

export function representContradiction(input: {
  graph: GraphKernel;
  left: GraphNode;
  right: GraphNode;
}) {
  if (input.left.factState === "confirmed" || input.right.factState === "confirmed") {
    throw new Error("Confirmed authority conflicts must be resolved by their owning system.");
  }
  return input.graph.connect({ factState: "inferred", from: input.left.id, kind: "CONTRADICTS", mode: input.left.mode, provenance: "derived", scope: input.left.scope, status: "current", to: input.right.id });
}

export function optionalGraphEnrichment<T>(coreResult: T, enrich: () => void) {
  try {
    enrich();
    return { coreResult, graphEnriched: true, warning: null };
  } catch {
    return { coreResult, graphEnriched: false, warning: "Relationship context was unavailable; the verified core result was preserved." };
  }
}
