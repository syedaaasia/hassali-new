import { createHash } from "node:crypto";

export type RichExperienceMode = "ASK" | "CODE" | "GROWTH" | "WEBSITE";

export type RichArtifactKind =
  | "code"
  | "csv"
  | "document"
  | "html"
  | "image"
  | "json"
  | "markdown"
  | "project"
  | "text"
  | "zip";

export type RichArtifactStatus =
  | "blocked"
  | "generated"
  | "invalid"
  | "package_ready"
  | "valid"
  | "validating";

export type ArtifactProvenance =
  | "generated"
  | "hassali_curated"
  | "project_canonical"
  | "project_existing"
  | "user_upload";

export type RichArtifactReference = {
  contentType: string;
  id: string;
  integrity?: { algorithm: "sha256"; value: string };
  kind: RichArtifactKind;
  name: string;
  provenance: ArtifactProvenance;
  sizeBytes?: number;
};

export type RichExperienceResult = {
  canonicalRevision: string | null;
  download: { available: boolean; reason?: string };
  media: RichArtifactReference[];
  mode: RichExperienceMode;
  outputKind: RichArtifactKind;
  preview: { available: boolean; reason?: string };
  primaryArtifact: RichArtifactReference | null;
  status: RichArtifactStatus;
  supportingArtifacts: RichArtifactReference[];
  unresolvedCapabilities: string[];
  warnings: string[];
};

function sha256(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function createAskCsvArtifact(input: { content: string; name?: string }): {
  content: string;
  result: RichExperienceResult;
  rows: number;
} {
  const rows = parseCsvRows(input.content);
  const columns = rows[0]?.length ?? 0;
  if (rows.length < 1 || columns < 1 || rows.some((row) => row.length !== columns)) {
    throw new Error("The CSV artifact is not structurally valid.");
  }

  const bytes = Buffer.byteLength(input.content, "utf8");
  const digest = sha256(input.content);
  const artifact: RichArtifactReference = {
    contentType: "text/csv; charset=utf-8",
    id: `ask-csv-${digest.slice(0, 16)}`,
    integrity: { algorithm: "sha256", value: digest },
    kind: "csv",
    name: input.name ?? "hassali-data.csv",
    provenance: "generated",
    sizeBytes: bytes
  };

  return {
    content: input.content,
    result: {
      canonicalRevision: digest,
      download: { available: true },
      media: [],
      mode: "ASK",
      outputKind: "csv",
      preview: { available: true },
      primaryArtifact: artifact,
      status: "valid",
      supportingArtifacts: [],
      unresolvedCapabilities: [],
      warnings: []
    },
    rows: Math.max(0, rows.length - 1)
  };
}

export function preserveCoreResultWhenOptionalArtifactFails(input: {
  coreSatisfied: boolean;
  mode: RichExperienceMode;
  outputKind?: RichArtifactKind;
  reason: string;
}): RichExperienceResult {
  return {
    canonicalRevision: null,
    download: { available: false, reason: input.reason },
    media: [],
    mode: input.mode,
    outputKind: input.outputKind ?? "text",
    preview: { available: input.coreSatisfied, reason: input.coreSatisfied ? undefined : input.reason },
    primaryArtifact: null,
    status: input.coreSatisfied ? "valid" : "blocked",
    supportingArtifacts: [],
    unresolvedCapabilities: [input.reason],
    warnings: input.coreSatisfied ? [`Optional rich output unavailable: ${input.reason}`] : []
  };
}
