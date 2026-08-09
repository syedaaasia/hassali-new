import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";
import {
  attachmentLimits,
  shouldRestorePreviousAttachments
} from "@/lib/attachments";
import {
  createProjectBinaryAssetEnvelope,
  parseProjectBinaryAssetEnvelope
} from "@/lib/project-binary-asset";
import { compileStaticPreview } from "@/lib/static-preview-compiler";
import {
  analyzeImagesWithVision,
  generateImageToAttachment,
  imageGenerationCapability
} from "@/lib/server/attachments/attachment-context";
import {
  AttachmentPipelineError,
  classifyAttachment,
  extractAttachmentEvidence,
  inspectZipArchive,
  loadStoredAttachment,
  removeStoredAttachment,
  storeAttachment
} from "@/lib/server/attachments/attachment-pipeline";
import {
  createProjectAssetChange,
  projectAssetPath,
  shouldPromoteUploadedImages
} from "@/lib/server/project-asset-pipeline";
import {
  createStoredZip,
  prepareProjectExportFiles,
  shouldExcludeProjectExportPath
} from "@/lib/server/project-export";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";

const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

test("classifies supported files by extension, MIME, signature, and text shape", () => {
  assert.deepEqual(classifyAttachment({ bytes: png, mimeType: "image/png", name: "screen.png" }), {
    kind: "image",
    mimeType: "image/png"
  });
  assert.equal(classifyAttachment({ bytes: new TextEncoder().encode("export const ok = true;"), mimeType: "text/plain", name: "app.ts" }).kind, "code");
  assert.throws(
    () => classifyAttachment({ bytes: new TextEncoder().encode("not png"), mimeType: "image/png", name: "fake.png" }),
    (error) => error instanceof AttachmentPipelineError && error.code === "MIME_MISMATCH"
  );
  assert.throws(
    () => classifyAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "application/octet-stream", name: "video.mp4" }),
    (error) => error instanceof AttachmentPipelineError && error.code === "UNSUPPORTED_FORMAT"
  );
});

test("extracts actual bounded CSV TXT and Markdown content", () => {
  const cases = [
    { kind: "data" as const, mimeType: "text/csv", name: "clients.csv", text: "Name,Email\nAli,ali@example.com\nSara," },
    { kind: "text" as const, mimeType: "text/plain", name: "notes.txt", text: "Launch checklist: verify row counts." },
    { kind: "text" as const, mimeType: "text/markdown", name: "README.md", text: "# Project\nLocal-only demo." }
  ];
  for (const item of cases) {
    const bytes = new TextEncoder().encode(item.text);
    const evidence = extractAttachmentEvidence({
      bytes,
      metadata: {
        analysisCapabilities: ["text_extract"],
        conversationId: "c",
        createdAt: "x",
        extractedTextAvailable: true,
        id: item.name,
        kind: item.kind,
        mimeType: item.mimeType,
        originalName: item.name,
        previewAvailable: false,
        projectId: "p",
        safeName: item.name,
        sizeBytes: bytes.byteLength,
        status: "ready",
        storageScope: "conversation"
      }
    });
    assert.match(evidence ?? "", new RegExp(item.text.split("\n")[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("stores attachments inside an owned project and rejects another owner", async () => {
  const projectId = `multimodal-test-${Date.now()}`;
  const binding = await resolveProjectWorkspace(projectId);
  assert.equal(isWorkspaceBindingError(binding), false);
  if (isWorkspaceBindingError(binding)) return;
  try {
    const attachment = await storeAttachment({
      bytes: png,
      conversationId: "conversation-a",
      mimeType: "image/png",
      name: "UI screenshot.png",
      ownerId: "owner-a",
      projectId,
      storageScope: "conversation",
      workspaceRoot: binding.workspaceRoot
    });
    assert.equal(attachment.safeName, "UI-screenshot.png");
    const loaded = await loadStoredAttachment({
      attachmentId: attachment.id,
      ownerId: "owner-a",
      projectId,
      workspaceRoot: binding.workspaceRoot
    });
    assert.deepEqual(loaded.bytes, png);
    await assert.rejects(
      loadStoredAttachment({
        attachmentId: attachment.id,
        ownerId: "owner-b",
        projectId,
        workspaceRoot: binding.workspaceRoot
      }),
      (error) => error instanceof AttachmentPipelineError && error.status === 403
    );
    await removeStoredAttachment({
      attachmentId: attachment.id,
      ownerId: "owner-a",
      projectId,
      workspaceRoot: binding.workspaceRoot
    });
  } finally {
    await rm(binding.workspaceRoot, { force: true, recursive: true });
  }
});

test("extracts bounded text PDF evidence and reports scanned documents honestly", () => {
  const readable = new TextEncoder().encode("%PDF-1.4\nstream\nBT (Hello PDF contract) Tj ET\nendstream");
  const evidence = extractAttachmentEvidence({
    bytes: readable,
    metadata: {
      analysisCapabilities: ["pdf_text"],
      conversationId: "c",
      createdAt: new Date(0).toISOString(),
      extractedTextAvailable: true,
      id: "a",
      kind: "pdf",
      mimeType: "application/pdf",
      originalName: "contract.pdf",
      previewAvailable: false,
      projectId: "p",
      safeName: "contract.pdf",
      sizeBytes: readable.byteLength,
      status: "ready",
      storageScope: "conversation"
    }
  });
  assert.match(evidence ?? "", /Hello PDF contract/);
  const scanned = new TextEncoder().encode("%PDF-1.4\n% image-only");
  assert.throws(
    () => extractAttachmentEvidence({
      bytes: scanned,
      metadata: {
        analysisCapabilities: ["ocr_if_available"], conversationId: "c", createdAt: "x", extractedTextAvailable: false,
        id: "b", kind: "pdf", mimeType: "application/pdf", originalName: "scan.pdf", previewAvailable: false,
        projectId: "p", safeName: "scan.pdf", sizeBytes: scanned.byteLength, status: "ready", storageScope: "conversation"
      }
    }),
    (error) => error instanceof AttachmentPipelineError && error.code === "PDF_OCR_UNAVAILABLE"
  );
});

test("ZIP inspection is bounded and rejects traversal without extraction", () => {
  const safeZip = createStoredZip([
    { content: "export default 1", path: "src/index.ts" },
    { content: "# Demo", path: "README.md" }
  ], new Date(0));
  const safe = inspectZipArchive(safeZip);
  assert.equal(safe.entries.length, 2);
  assert.equal(safe.entries[0]?.name, "src/index.ts");
  const unsafeZip = createStoredZip([{ content: "no", path: "../../outside.txt" }], new Date(0));
  assert.throws(
    () => inspectZipArchive(unsafeZip),
    (error) => error instanceof AttachmentPipelineError && error.code === "ARCHIVE_UNSAFE"
  );
  const oversized = createStoredZip(Array.from({ length: attachmentLimits.archiveEntryCount + 1 }, (_, index) => ({
    content: "x",
    path: `src/${index}.txt`
  })), new Date(0));
  assert.throws(
    () => inspectZipArchive(oversized),
    (error) => error instanceof AttachmentPipelineError && error.code === "ARCHIVE_TOO_LARGE"
  );
});

test("vision analysis uses image content parts only with a configured vision provider", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  try {
    let body = "";
    const result = await analyzeImagesWithVision({
      fetchImpl: async (_url, init) => {
        body = String(init?.body ?? "");
        return Response.json({ choices: [{ message: { content: "Dashboard layout with sidebar, metric cards, and low contrast labels." } }] });
      },
      images: [{
        bytes: png,
        metadata: {
          analysisCapabilities: ["vision"], conversationId: "c", createdAt: "x", extractedTextAvailable: false,
          id: "i", kind: "image", mimeType: "image/png", originalName: "ui.png", previewAvailable: true,
          projectId: "p", safeName: "ui.png", sizeBytes: png.byteLength, status: "ready", storageScope: "conversation"
        }
      }],
      prompt: "What is wrong with this UI?",
      selectedModel: "openrouter/free"
    });
    assert.equal(result.completed, true);
    assert.match(result.text, /sidebar/);
    assert.match(body, /image_url/);
    assert.match(body, /data:image\/png;base64/);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("vision provider refusals are not accepted as completed image analysis", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  try {
    const result = await analyzeImagesWithVision({
      fetchImpl: async () => Response.json({
        choices: [{ message: { content: "I cannot access or analyze attached files or screenshots." } }]
      }),
      images: [{
        bytes: png,
        metadata: {
          analysisCapabilities: ["vision"], conversationId: "c", createdAt: "x", extractedTextAvailable: false,
          id: "i", kind: "image", mimeType: "image/png", originalName: "ui.png", previewAvailable: true,
          projectId: "p", safeName: "ui.png", sizeBytes: png.byteLength, status: "ready", storageScope: "conversation"
        }
      }],
      prompt: "What is visible in this screenshot?",
      selectedModel: "openrouter/free"
    });
    assert.equal(result.completed, false);
    assert.equal(result.failureCode, "VISION_ANALYSIS_FAILED");
    assert.equal(result.text, "");

    const evaluatorResult = await analyzeImagesWithVision({
      fetchImpl: async () => Response.json({ choices: [{ message: { content: "User Safety: safe" } }] }),
      images: [{
        bytes: png,
        metadata: {
          analysisCapabilities: ["vision"], conversationId: "c", createdAt: "x", extractedTextAvailable: false,
          id: "i", kind: "image", mimeType: "image/png", originalName: "ui.png", previewAvailable: true,
          projectId: "p", safeName: "ui.png", sizeBytes: png.byteLength, status: "ready", storageScope: "conversation"
        }
      }],
      prompt: "What is visible in this screenshot?",
      selectedModel: "openrouter/free"
    });
    assert.equal(evaluatorResult.completed, false);
    assert.equal(evaluatorResult.failureCode, "VISION_ANALYSIS_FAILED");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("vision and image generation report unavailable capability without configuration", async () => {
  const openRouter = process.env.OPENROUTER_API_KEY;
  const openAi = process.env.OPENAI_API_KEY;
  const imageModel = process.env.HASSALI_IMAGE_MODEL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.HASSALI_IMAGE_MODEL;
  try {
    const result = await analyzeImagesWithVision({
      images: [{ bytes: png, metadata: {
        analysisCapabilities: ["vision"], conversationId: "c", createdAt: "x", extractedTextAvailable: false,
        id: "i", kind: "image", mimeType: "image/png", originalName: "ui.png", previewAvailable: true,
        projectId: "p", safeName: "ui.png", sizeBytes: png.byteLength, status: "ready", storageScope: "conversation"
      } }],
      prompt: "inspect",
      selectedModel: "tencent/hy3:free"
    });
    assert.equal(result.completed, false);
    assert.equal(result.failureCode, "VISION_CAPABILITY_UNAVAILABLE");
    assert.equal(imageGenerationCapability().available, false);
  } finally {
    if (openRouter !== undefined) process.env.OPENROUTER_API_KEY = openRouter;
    if (openAi !== undefined) process.env.OPENAI_API_KEY = openAi;
    if (imageModel !== undefined) process.env.HASSALI_IMAGE_MODEL = imageModel;
  }
});

test("configured image generation creates a real conversation-scoped image attachment", async () => {
  const openAi = process.env.OPENAI_API_KEY;
  const imageModel = process.env.HASSALI_IMAGE_MODEL;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.HASSALI_IMAGE_MODEL = "test-image-model";
  const projectId = `multimodal-image-${Date.now()}`;
  const binding = await resolveProjectWorkspace(projectId);
  assert.equal(isWorkspaceBindingError(binding), false);
  if (isWorkspaceBindingError(binding)) return;
  const controller = new AbortController();
  try {
    const generated = await generateImageToAttachment({
      conversationId: "conversation",
      fetchImpl: async (_url, init) => {
        assert.equal(init?.signal, controller.signal);
        return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] });
      },
      ownerId: "owner",
      projectId,
      prompt: "A warm bakery counter",
      signal: controller.signal,
      workspaceRoot: binding.workspaceRoot
    });
    assert.equal(generated.failureCode, null);
    assert.equal(generated.attachment?.kind, "image");
    assert.equal(generated.attachment?.storageScope, "conversation");
  } finally {
    await rm(binding.workspaceRoot, { force: true, recursive: true });
    if (openAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = openAi;
    if (imageModel === undefined) delete process.env.HASSALI_IMAGE_MODEL;
    else process.env.HASSALI_IMAGE_MODEL = imageModel;
  }
});

test("project assets use stable mode paths, render in static preview, and export as raw bytes", () => {
  const envelope = createProjectBinaryAssetEnvelope({ base64: Buffer.from(png).toString("base64"), mimeType: "image/png" });
  assert.equal(parseProjectBinaryAssetEnvelope(envelope)?.mimeType, "image/png");
  assert.equal(projectAssetPath({ existingPaths: [], mode: "WEBSITE", safeName: "hero.png" }), "assets/hero.png");
  assert.equal(projectAssetPath({ existingPaths: [], mode: "CODE", safeName: "hero.png" }), "public/assets/hero.png");
  const preview = compileStaticPreview({
    activeHtmlPath: "index.html",
    files: { "assets/hero.png": envelope, "index.html": '<main><img src="assets/hero.png" alt="Hero"></main>' },
    projectId: "project"
  });
  assert.match(preview.srcDoc, /data:image\/png;base64/);
  const files = prepareProjectExportFiles({
    files: [{ content: "<main></main>", path: "index.html" }, { content: envelope, path: "assets/hero.png" }],
    mode: "WEBSITE",
    projectName: "Bakery"
  });
  const zip = createStoredZip(files, new Date(0));
  assert.ok(zip.includes(Buffer.from(png)));
  const alreadyBinary = prepareProjectExportFiles({
    files: [{ content: "<main></main>", path: "index.html" }, { content: new Uint8Array(png), path: "assets/direct.png" }],
    mode: "WEBSITE",
    projectName: "Direct asset"
  });
  assert.deepEqual(
    Buffer.from(alreadyBinary.find((file) => file.path === "assets/direct.png")?.content as Uint8Array),
    Buffer.from(png)
  );
  assert.equal(shouldExcludeProjectExportPath(".hassali/attachments/private/content.bin"), true);
});

test("asset proposals remain explicit and attachment relevance excludes topic shifts", () => {
  const change = createProjectAssetChange({
    attachment: {
      analysisCapabilities: ["vision"], conversationId: "c", createdAt: "x", extractedTextAvailable: false,
      id: "i", kind: "image", mimeType: "image/png", originalName: "product.png", previewAvailable: true,
      projectId: "p", safeName: "product.png", sizeBytes: png.byteLength, status: "ready", storageScope: "conversation"
    },
    bytes: png,
    existingPaths: [],
    mode: "WEBSITE"
  });
  assert.equal(change.action, "create");
  assert.equal(change.path, "assets/product.png");
  assert.equal(shouldPromoteUploadedImages("Use the attached product image in the hero"), true);
  assert.equal(shouldPromoteUploadedImages("Recreate this screenshot as a website"), false);
  assert.equal(shouldRestorePreviousAttachments("Use the previous screenshot and make the header smaller"), true);
  assert.equal(shouldRestorePreviousAttachments("Explain Redis caching"), false);
});
