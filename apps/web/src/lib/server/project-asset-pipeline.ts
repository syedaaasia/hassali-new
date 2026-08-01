import path from "node:path";
import type { HassaliAttachment } from "@/lib/attachments";
import { createProjectBinaryAssetEnvelope } from "@/lib/project-binary-asset";

const imageExtensions = new Set([".jpeg", ".jpg", ".png", ".webp"]);

export function projectAssetPath(input: {
  existingPaths: string[];
  mode: "CODE" | "WEBSITE";
  safeName: string;
}) {
  const baseDirectory = input.mode === "WEBSITE" ? "assets" : "public/assets";
  const parsed = path.posix.parse(input.safeName.replace(/\\/g, "/"));
  const stem = parsed.name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "asset";
  const extension = imageExtensions.has(parsed.ext.toLowerCase()) ? parsed.ext.toLowerCase() : ".png";
  const occupied = new Set(input.existingPaths.map((entry) => entry.toLowerCase()));
  let candidate = `${baseDirectory}/${stem}${extension}`;
  let index = 2;
  while (occupied.has(candidate.toLowerCase())) {
    candidate = `${baseDirectory}/${stem}-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

export function createProjectAssetChange(input: {
  attachment: HassaliAttachment;
  bytes: Uint8Array;
  existingPaths: string[];
  mode: "CODE" | "WEBSITE";
}) {
  const projectPath = projectAssetPath({
    existingPaths: input.existingPaths,
    mode: input.mode,
    safeName: input.attachment.safeName
  });
  return {
    action: "create" as const,
    path: projectPath,
    proposedContent: createProjectBinaryAssetEnvelope({
      base64: Buffer.from(input.bytes).toString("base64"),
      mimeType: input.attachment.mimeType
    }),
    summary: `Save approved attachment as project asset ${projectPath}.`
  };
}

export function shouldPromoteUploadedImages(prompt: string) {
  return /\b(?:add|include|insert|save|use)\b[\s\S]{0,50}\b(?:attached|attachment|image|photo|picture|product|hero|logo)\b/i.test(prompt) &&
    !/\b(?:screenshot|figma|reference|recreate|replicate|analy[sz]e|what is wrong)\b/i.test(prompt);
}
