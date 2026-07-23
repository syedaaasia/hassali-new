import { naturalCompareFramePaths } from "@/lib/server/ai/website-cinematic-asset-analyzer";
import type { WebsiteCinematicExperience } from "@/lib/server/ai/website-cinematic-sequence-spec";

export type WebsiteCinematicValidationResult = {
  hardBlockers: string[];
  passed: boolean;
  repairableFindings: string[];
  warnings: string[];
};

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) duplicates.add(value);
    seen.add(normalized);
  });
  return [...duplicates];
}

export function validateWebsiteCinematicOutput(input: {
  availableAssetPaths?: string[];
  cinematic: WebsiteCinematicExperience;
  files: Record<string, string>;
}): WebsiteCinematicValidationResult {
  const hardBlockers: string[] = [];
  const repairableFindings: string[] = [];
  const warnings = [...input.cinematic.warnings];
  const indexHtml = input.files["index.html"] ?? "";
  const runtime = input.files["sequence.js"] ?? "";
  const manifest = input.files["sequence-manifest.js"] ?? "";
  const styles = input.files["styles.css"] ?? "";
  const availableAssets = new Set((input.availableAssetPaths ?? []).map((path) => path.replace(/^\.\//, "")));
  const mountIds = Array.from(indexHtml.matchAll(/data-cinematic-sequence=["']([^"']+)["']/gi), (match) => match[1]);
  const canvasCount = (indexHtml.match(/data-cinematic-canvas/gi) ?? []).length;
  const ids = input.cinematic.sequences.map((sequence) => sequence.id);

  if (input.cinematic.requirement === "required" && input.cinematic.sequences.length === 0) {
    hardBlockers.push("Cinematic playback is required, but no usable extracted frame sequence was detected.");
  }
  if (input.cinematic.requirement === "forbidden" && (input.cinematic.enabled || runtime || manifest || mountIds.length)) {
    hardBlockers.push("The request forbids animation, but cinematic sequence output was generated.");
  }
  if (!input.cinematic.enabled) {
    return { hardBlockers, passed: hardBlockers.length === 0, repairableFindings, warnings };
  }

  if (!runtime) hardBlockers.push("Cinematic output is missing sequence.js.");
  if (!manifest) hardBlockers.push("Cinematic output is missing sequence-manifest.js.");
  if (mountIds.length !== input.cinematic.sequences.length) hardBlockers.push("Cinematic sequence mounts do not match the structured sequence count.");
  if (canvasCount !== input.cinematic.sequences.length) hardBlockers.push("Each cinematic sequence must own exactly one canvas.");
  const duplicateIds = Array.from(new Set([...duplicateValues(ids), ...duplicateValues(mountIds)]));
  if (duplicateIds.length) hardBlockers.push(`Duplicate cinematic sequence IDs detected: ${duplicateIds.join(", ")}.`);

  for (const sequence of input.cinematic.sequences) {
    if (!sequence.sourceFrames.length) hardBlockers.push(`Sequence ${sequence.id} has no source frames.`);
    if (sequence.frameCount !== sequence.sourceFrames.length) repairableFindings.push(`Sequence ${sequence.id} frame count does not match its source frame list.`);
    const sorted = [...sequence.sourceFrames].sort(naturalCompareFramePaths);
    if (sequence.sourceFrames.some((path, index) => path !== sorted[index])) repairableFindings.push(`Sequence ${sequence.id} frame order is not naturally sorted.`);
    if (!sequence.sourceFrames.includes(sequence.fallbackFrame)) repairableFindings.push(`Sequence ${sequence.id} fallback frame is not part of the sequence.`);
    const missingAssets = sequence.sourceFrames.filter((path) => !availableAssets.has(path.replace(/^\.\//, "")) && !(path in input.files));
    if (missingAssets.length) hardBlockers.push(`Sequence ${sequence.id} references ${missingAssets.length} unavailable frame asset(s).`);
    if (sequence.cache.desktopLimit < 4 || sequence.cache.desktopLimit > 32) repairableFindings.push(`Sequence ${sequence.id} desktop cache limit is outside the supported range.`);
    if (sequence.cache.mobileLimit < 2 || sequence.cache.mobileLimit > sequence.cache.desktopLimit) repairableFindings.push(`Sequence ${sequence.id} mobile cache limit is invalid.`);
    if (!sequence.mobileStrategy?.mode || sequence.mobileStrategy.stride < 1) repairableFindings.push(`Sequence ${sequence.id} lacks a valid mobile strategy.`);
    if (sequence.reducedMotionStrategy?.mode !== "representative_static") repairableFindings.push(`Sequence ${sequence.id} lacks a representative reduced-motion strategy.`);
    if (sequence.scrollDriven && sequence.chapters.length < 3) warnings.push(`Sequence ${sequence.id} has fewer than three narrative chapters.`);
  }

  if (!/requestAnimationFrame/.test(runtime) || !/desiredFrame\s*===\s*renderedFrame/.test(runtime)) hardBlockers.push("Cinematic runtime does not schedule frame changes efficiently.");
  if (!/const cache = new Map/.test(runtime) || !/cache\.size > cacheLimit\(\)/.test(runtime) || !/cache\.delete/.test(runtime)) hardBlockers.push("Cinematic runtime does not implement a bounded frame cache.");
  if (!/IntersectionObserver/.test(runtime)) repairableFindings.push("Cinematic runtime does not control offscreen work.");
  if (!/addEventListener\("scroll"[\s\S]*passive:\s*true/.test(runtime)) repairableFindings.push("Cinematic runtime scroll handling is not passive.");
  if (!/prefers-reduced-motion:\s*reduce/i.test(styles) || !/prefers-reduced-motion:\s*reduce/i.test(runtime)) repairableFindings.push("Cinematic output lacks a complete reduced-motion fallback.");
  if (!/@media\s*\(max-width:\s*760px\)/i.test(styles) || !/mobileStrategy/.test(manifest)) repairableFindings.push("Cinematic output lacks a complete mobile strategy.");
  if (!/data-cinematic-fallback/i.test(indexHtml) || !/is-cinematic-ready/.test(runtime)) hardBlockers.push("Cinematic fallback is not preserved until a valid frame renders.");
  if (/Promise\.all\s*\(\s*(?:sources|sequence\.sourceFrames)/.test(runtime)) hardBlockers.push("Cinematic runtime attempts to preload the complete sequence at once.");

  input.cinematic.analysis.sequences.forEach((sequence) => {
    if (sequence.missingNumbers.length) warnings.push(`${sequence.sequenceId} has frame gaps (${sequence.missingNumbers.slice(0, 12).join(", ")}) but remains usable.`);
    if (sequence.duplicateNumbers.length) repairableFindings.push(`${sequence.sequenceId} contains duplicate frame numbers.`);
  });

  return {
    hardBlockers,
    passed: hardBlockers.length === 0,
    repairableFindings,
    warnings: Array.from(new Set(warnings))
  };
}
