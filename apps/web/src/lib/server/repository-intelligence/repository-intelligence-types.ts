export type RepositoryStatus = "complete" | "failed" | "partial" | "stale";
export type RepositoryFileRole =
  | "asset"
  | "build-output"
  | "config"
  | "generated"
  | "ignored"
  | "other"
  | "source"
  | "test"
  | "vendor";
export type RepositoryRelationshipType =
  | "calls"
  | "configures"
  | "exports"
  | "generated-from"
  | "imports"
  | "renders"
  | "routes-to"
  | "schema-for"
  | "tests";
export type RepositoryImpactRadius = "cross-feature" | "feature" | "local" | "system-wide" | "unknown";

export type RepositoryLimits = {
  maxCandidateFiles: number;
  maxDeepFiles: number;
  maxFileBytes: number;
  maxFiles: number;
  maxRelationships: number;
  maxSymbols: number;
  maxTextBytes: number;
};

export type RepositoryFile = {
  authoritativeScore: number;
  extension: string;
  fingerprint: string;
  ignored: boolean;
  imports: string[];
  language: string | null;
  modifiedAt: string;
  packagePath: string | null;
  path: string;
  role: RepositoryFileRole;
  searchTokenHashes: string[];
  size: number;
  symbolIds: string[];
  textKind: "binary" | "oversized" | "text" | "unknown";
};

export type RepositorySymbol = {
  column: number;
  exported: boolean;
  file: string;
  id: string;
  kind: "class" | "constant" | "enum" | "function" | "interface" | "method" | "route-handler" | "type" | "variable";
  line: number;
  name: string;
};

export type RepositoryRelationship = {
  confidence: number;
  evidence: string;
  fromFile: string;
  fromSymbolId: string | null;
  id: string;
  toFile: string | null;
  toSpecifier: string | null;
  toSymbolId: string | null;
  type: RepositoryRelationshipType;
};

export type RepositoryRoute = {
  file: string;
  framework: string;
  handlers: string[];
  kind: "api" | "layout" | "page";
  route: string;
};

export type RepositoryWorkspace = {
  frameworkHints: string[];
  kind: "app" | "package" | "repository" | "worker" | "workspace";
  manifestPath: string | null;
  name: string;
  path: string;
};

export type RepositoryManifest = {
  environmentVariables: string[];
  kind: string;
  path: string;
  workspacePath: string | null;
};

export type RepositoryScript = {
  body: string;
  longRunning: boolean;
  mayMutate: boolean;
  name: string;
  purpose: "build" | "dev" | "format" | "generate" | "lint" | "migration" | "other" | "test" | "typecheck";
  risk: "high" | "low" | "moderate";
  workspacePath: string;
};

export type RepositoryDependency = {
  declaredAs: "dependency" | "devDependency" | "optionalDependency" | "peerDependency" | "workspace";
  installed: boolean | null;
  name: string;
  referencedBy: string[];
  version: string;
  workspacePath: string;
};

export type RepositorySnapshot = {
  branch: string | null;
  buildOutputPaths: string[];
  completeness: {
    deepFilesRead: number;
    discoveredFiles: number;
    reason: string | null;
    skippedBinary: number;
    skippedLarge: number;
  };
  configuration: RepositoryManifest[];
  dependencies: RepositoryDependency[];
  detectedLanguages: Array<{ fileCount: number; language: string }>;
  fingerprint: string;
  frameworks: string[];
  generatedPaths: string[];
  gitRevision: string | null;
  ignoredPaths: string[];
  inspectedAt: string;
  limits: RepositoryLimits;
  modifiedTrackedFiles: string[];
  packageManagers: string[];
  relationships: RepositoryRelationship[];
  repositoryId: string;
  repositoryRoot: string;
  routes: RepositoryRoute[];
  scripts: RepositoryScript[];
  sourceRoots: string[];
  status: RepositoryStatus;
  symbols: RepositorySymbol[];
  testRoots: string[];
  untrackedRelevantFiles: string[];
  vendorPaths: string[];
  warnings: string[];
  workspaces: RepositoryWorkspace[];
  worktree: "clean" | "dirty" | "unknown";
  files: RepositoryFile[];
};

export type RepositorySearchKind = "auto" | "config" | "exact" | "filename" | "import" | "path" | "route" | "symbol";

export type RepositorySearchResult = {
  authoritative: boolean;
  evidence: string[];
  file: string;
  kind: "config" | "definition" | "generated" | "implementation" | "route" | "test" | "usage";
  matchedSymbols: string[];
  score: number;
};

export type ImplementationSurface = {
  authoritativeFiles: string[];
  confidence: number;
  configurationFiles: string[];
  evidence: string[];
  query: string;
  relatedRoutes: RepositoryRoute[];
  relatedSymbols: RepositorySymbol[];
  relatedTests: string[];
  status: "found" | "partial" | "unavailable";
  supportingFiles: string[];
  uncertainty: string[];
};

export type ChangeImpact = {
  configurationImpact: string[];
  directFiles: string[];
  directSymbols: string[];
  possibleIndirectFiles: string[];
  radius: RepositoryImpactRadius;
  routeImpact: string[];
  schemaImpact: string[];
  testFiles: string[];
  uncertainty: string[];
};

export type RepositoryInspectionResult = {
  changeImpact: ChangeImpact;
  evidence: string[];
  implementationSurface: ImplementationSurface;
  requestTaskId: string;
  snapshotFingerprint: string;
  snapshotStatus: RepositoryStatus;
  warnings: string[];
};

export type RepositoryStaleness = {
  changedPaths: string[];
  currentFingerprint: string;
  previousFingerprint: string;
  stale: boolean;
};
