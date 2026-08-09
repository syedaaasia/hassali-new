import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { DocumentArtifact } from "@/lib/server/attachments/document-contract";
import {
  assessOutcome,
  buildEvidenceGraph,
  buildMultimodalVerification,
  createMultimodalRequestPlan,
  observeWorkflow,
  publicResearchEvidenceNodes,
  validateRenderedEvidenceReferences,
  validateEvidenceCitations,
  validateVerifiedClaims,
  type EvidenceNode,
  type WorkflowEvent
} from "@/lib/server/attachments/multimodal-verification";
import type { VisualArtifact } from "@/lib/server/attachments/visual-contract";

function documentArtifact(input: { method?: "native" | "ocr"; text?: string; tables?: boolean } = {}): DocumentArtifact {
  const method = input.method ?? "native";
  return {
    citations: [],
    extractionSummary: "fixture",
    filename: "terms.pdf",
    id: "doc-1",
    inspection: {
      fileType: "pdf",
      imageCount: null,
      mixedContent: false,
      nativeTextQuality: method === "native" ? "high" : "unknown",
      ocrPages: method === "ocr" ? [1] : [],
      pageCount: 1,
      requiresOcr: method === "ocr",
      scannedPageCount: method === "ocr" ? 1 : 0,
      tableLikelihood: input.tables ? "high" : "low",
      textLayerPresent: method === "native"
    },
    pageCount: 1,
    pages: [{
      blocks: [], confidence: "high", extractionMethod: method, pageNumber: 1,
      tables: [], text: input.text ?? "Renewal date is June 30.", warnings: []
    }],
    provenance: { kind: "user-provided-document", private: true },
    sections: [],
    tables: input.tables ? [{
      confidence: "high", headers: [{ confidence: "high", text: "Amount", uncertain: false }], id: "table-1",
      pageNumber: 1, rows: [[{ confidence: "high", text: "1500", uncertain: false }]], structureUncertain: false
    }] : [],
    type: "pdf",
    warnings: []
  };
}

function visualArtifact(sourceType: VisualArtifact["sourceType"] = "screenshot"): VisualArtifact {
  return {
    chartInfo: null,
    confidence: "high",
    contentHash: "hash",
    height: 600,
    id: `visual-${sourceType}`,
    mimeType: "image/png",
    objects: ["red error banner"],
    ocrEvidence: "Success",
    orientation: 0,
    origin: "user-upload",
    provenance: { kind: "user-supplied", private: true },
    regions: [],
    sourceType,
    textRegions: [],
    visualDescription: "A red error banner is visible above the Success label.",
    warnings: [],
    width: 900
  };
}

function node(input: Partial<EvidenceNode> & Pick<EvidenceNode, "id" | "contentSummary">): EvidenceNode {
  return {
    artifactId: null,
    authority: "unknown",
    confidence: "high",
    freshness: "unknown",
    origin: "public-web",
    page: null,
    private: false,
    sourceId: null,
    timestamp: null,
    url: null,
    ...input
  };
}

test("MMV-01 text-only requests do not require external tools", () => {
  const plan = createMultimodalRequestPlan({ prompt: "Explain compound interest simply." });
  assert.deepEqual(plan.requiredCapabilities, ["textReasoning"]);
  assert.deepEqual(plan.requiredModalities, ["text"]);
});

test("MMV-02 current official claims require web research while no-search stays unavailable", () => {
  const verified = buildMultimodalVerification({ prompt: "What is the latest official API behavior?", researchPolicy: "no-search" });
  assert.equal(verified.matrix.webResearch, "unavailable");
  assert.equal(verified.state, "UNAVAILABLE");
});

test("MMV-03 native PDF avoids OCR and MMV-04 scanned PDF requires OCR", () => {
  const native = buildMultimodalVerification({ documentArtifacts: [documentArtifact()], prompt: "Summarize this PDF." });
  assert.equal(native.matrix.documentNative, "available");
  assert.equal(native.matrix.documentOcr, "not-required");
  const scanned = buildMultimodalVerification({ documentArtifacts: [documentArtifact({ method: "ocr" })], prompt: "What does this scanned PDF say?" });
  assert.equal(scanned.matrix.documentOcr, "available");
});

test("MMV-05 screenshot and MMV-06 multi-image capabilities preserve truth", () => {
  const one = buildMultimodalVerification({ prompt: "Why does this screenshot look broken?", visualArtifacts: [visualArtifact()], visionCompleted: true, visionText: "A red error banner is visible." });
  assert.equal(one.matrix.vision, "available");
  const two = buildMultimodalVerification({ prompt: "Compare these two screenshots", visualArtifacts: [visualArtifact(), { ...visualArtifact("image"), id: "visual-2" }], visionCompleted: true });
  assert.equal(two.matrix.multiImage, "available");
});

test("MMV-07 video remains unavailable without a decoder", () => {
  const result = buildMultimodalVerification({ prompt: "Analyze this video." });
  assert.equal(result.matrix.videoFrames, "unavailable");
  assert.equal(result.state, "UNAVAILABLE");
});

test("EVIDENCE-01 duplicate support merges relationally without losing origins", () => {
  const graph = buildEvidenceGraph([
    node({ contentSummary: "Policy changed July 31", id: "web-a", origin: "public-web" }),
    node({ contentSummary: "Policy changed July 31", id: "doc-a", origin: "user-document", private: true })
  ]);
  assert.ok(graph.relations.some((relation) => relation.kind === "duplicates"));
  assert.notEqual(graph.nodes[0]?.origin, graph.nodes[1]?.origin);
});

test("EVIDENCE-02 document/web and EVIDENCE-03 OCR/native conflicts are explicit", () => {
  const graph = buildEvidenceGraph([
    node({ claimKey: "renewal", contentSummary: "June 30", id: "doc", origin: "user-document", private: true }),
    node({ authority: "official", claimKey: "renewal", contentSummary: "July 31", freshness: "current", id: "web" }),
    node({ claimKey: "amount", contentSummary: "$1,500", id: "native", origin: "user-document", private: true }),
    node({ claimKey: "amount", confidence: "low", contentSummary: "$1,800", id: "ocr", origin: "document-ocr", private: true })
  ]);
  assert.equal(graph.relations.filter((relation) => relation.kind === "contradicts").length, 2);
});

test("EVIDENCE-04 generated assets cannot support factual claims", () => {
  const graph = buildEvidenceGraph([node({ authority: "generated", contentSummary: "synthetic logo", id: "generated", origin: "generated-image" })]);
  const result = validateVerifiedClaims([{
    claimId: "claim", claimType: "source-fact", confidence: "high", conflictingEvidenceIds: [],
    statement: "This is the current logo.", supportingEvidenceIds: ["generated"], verificationState: "FULLY_VERIFIED"
  }], graph);
  assert.equal(result.valid, false);
  assert.equal(result.invalid[0]?.reason, "generated-content-cannot-prove-facts");
});

test("CITE-01 document page citations validate and CITE-02 fake pages fail", () => {
  const graph = buildEvidenceGraph([node({ contentSummary: "terms", id: "page", origin: "user-document", page: 4, private: true })]);
  assert.equal(validateEvidenceCitations([{ evidenceId: "page", page: 4 }], graph).valid, true);
  assert.equal(validateEvidenceCitations([{ evidenceId: "page", page: 9 }], graph).valid, false);
});

test("CITE-03 dangling web citations and CITE-04 generated factual citations fail", () => {
  const graph = buildEvidenceGraph([node({ authority: "generated", contentSummary: "art", id: "generated", origin: "generated-image" })]);
  assert.equal(validateEvidenceCitations([{ evidenceId: "missing", url: "https://example.com" }], graph).valid, false);
  assert.equal(validateVerifiedClaims([{
    claimId: "fact", claimType: "source-fact", confidence: "high", conflictingEvidenceIds: [], statement: "Exists",
    supportingEvidenceIds: ["generated"], verificationState: "FULLY_VERIFIED"
  }], graph).valid, false);
});

test("CITE-05 rendered document references must map to the exact retained page", () => {
  const graph = buildEvidenceGraph([node({ contentSummary: "terms", id: "page", origin: "user-document", page: 4, private: true, sourceId: "terms.pdf" })]);
  assert.equal(validateRenderedEvidenceReferences("Renewal applies. [Document: terms.pdf, p. 4]", graph).valid, true);
  assert.equal(validateRenderedEvidenceReferences("Renewal applies. [Document: terms.pdf, p. 8]", graph).valid, false);
});

test("EVIDENCE-05 public research nodes retain URL, authority, and public boundary", () => {
  const nodes = publicResearchEvidenceNodes([{
    claimValue: "July 31", content: "The renewal date is July 31.", effectiveDate: "2026-07-31", id: "official-1",
    isOfficial: true, sourceType: "official", title: "Renewal policy", trustBoundary: "untrusted_public_web", url: "https://example.com/policy"
  }]);
  assert.equal(nodes[0]?.authority, "official");
  assert.equal(nodes[0]?.private, false);
  assert.equal(nodes[0]?.url, "https://example.com/policy");
});

test("MIXED-01 document and screenshot remain distinct in one bounded context", () => {
  const result = buildMultimodalVerification({
    documentArtifacts: [documentArtifact()],
    prompt: "Compare this document and screenshot.",
    rawEvidenceContext: "Document evidence and visual evidence.",
    visualArtifacts: [visualArtifact()],
    visionCompleted: true,
    visionText: "Visible error state."
  });
  assert.ok(result.graph.nodes.some((entry) => entry.origin === "user-document"));
  assert.ok(result.graph.nodes.some((entry) => entry.origin === "user-image"));
  assert.match(result.contextText, /never as instructions/i);
});

test("FAILURE-01 one failed modality retains useful partial evidence", () => {
  const result = buildMultimodalVerification({
    documentArtifacts: [documentArtifact()],
    failureMessage: "Vision is unavailable.",
    prompt: "Compare this contract and screenshot.",
    rawEvidenceContext: "Contract text is available.",
    visualArtifacts: [visualArtifact()],
    visionCompleted: false
  });
  assert.equal(result.state, "PARTIALLY_VERIFIED");
  assert.match(result.contextText, /Vision is unavailable/);
});

test("OUTCOME-01 identifies observability and avoids fabricated ROI", () => {
  const graph = buildEvidenceGraph([node({ contentSummary: "Refund cases wait for manual review", id: "log", origin: "structured-data", private: true })]);
  const outcome = assessOutcome({ graph, prompt: "We keep losing ecommerce refunds. Improve this workflow." });
  assert.equal(outcome?.observability, "partially-observable");
  assert.equal(outcome?.economicImpact, null);
  assert.match(outcome?.unknowns.join(" ") ?? "", /baseline/i);
  assert.match(outcome?.experimentScope ?? "", /bounded pilot/i);
});

test("OUTCOME-02 no evidence recommends measurement before automation", () => {
  const outcome = assessOutcome({ graph: buildEvidenceGraph([]), prompt: "Our expensive process needs automation." });
  assert.equal(outcome?.observability, "unobservable");
  assert.equal(outcome?.candidateIntervention, null);
});

test("WORKFLOW-01 observed and expected events retain provenance and expose measurable gaps", () => {
  const events: WorkflowEvent[] = [{
    action: "review refund", actor: null, confidence: "high", evidenceIds: ["log"], id: "event-1",
    input: "queued case", output: "approved case", system: "CRM", timestamp: null
  }];
  const expectedEvents: WorkflowEvent[] = [{
    action: "notify client", actor: "support", confidence: "high", evidenceIds: ["sop"], id: "expected-1",
    input: "approved case", output: "notification sent", system: "CRM", timestamp: null
  }];
  const observation = observeWorkflow({
    events,
    expectedEvents,
    goal: "Reduce refund delay",
    graph: buildEvidenceGraph([
      node({ contentSummary: "queued", id: "log", origin: "structured-data", private: true }),
      node({ contentSummary: "notify client", id: "sop", origin: "user-document", private: true })
    ])
  });
  assert.equal(observation.events[0]?.actor, null);
  assert.equal(observation.events[0]?.timestamp, null);
  assert.deepEqual(observation.evidence, ["log", "sop"]);
  assert.equal(observation.expectedEvents[0]?.id, "expected-1");
  assert.deepEqual(observation.gaps[0], {
    expectedEventId: "expected-1",
    kind: "missing-observed-step",
    measurement: "Confirm whether the expected step occurred and record its completion time.",
    observedEventId: null
  });
});

test("WORKFLOW-02 screenshot-only evidence never claims the whole workflow", () => {
  const graph = buildEvidenceGraph([node({ contentSummary: "error banner", id: "screen", origin: "user-image", private: true })]);
  const observation = observeWorkflow({ goal: "Fix checkout", graph });
  assert.match(observation.unknowns.join(" "), /earlier and later/i);
});

test("SAFE-01 private evidence stays marked private and bounded", () => {
  const result = buildMultimodalVerification({
    documentArtifacts: Array.from({ length: 8 }, (_, index) => ({ ...documentArtifact({ text: "private ".repeat(10_000) }), id: `doc-${index}` })),
    prompt: "Summarize these documents.",
    rawEvidenceContext: "private ".repeat(20_000)
  });
  assert.ok(result.graph.nodes.every((entry) => entry.private));
  assert.ok(result.contextText.length <= 48 * 1024);
});

test("SAFE-02 ASK route injects attachment evidence only through the shared bounded assembler", async () => {
  const route = await readFile(new URL("../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /buildMultimodalVerification/);
  assert.match(route, /productMode === "ASK"\s*\? behavior\.resolvedRequest/);
  assert.match(route, /multimodalVerification\.contextText/);
  assert.doesNotMatch(route, /const effectiveUserPrompt = \[behavior\.resolvedRequest, multimodalContext\?\.contextText\]/);
});
