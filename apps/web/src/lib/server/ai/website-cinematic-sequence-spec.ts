import {
  analyzeWebsiteCinematicAssets,
  type WebsiteCinematicAssetAnalysis,
  type WebsiteCinematicAssetInput,
  type WebsiteCinematicSequenceCandidate
} from "@/lib/server/ai/website-cinematic-asset-analyzer";

export type WebsiteCinematicRequirement = "allowed" | "forbidden" | "not_requested" | "required";

export type WebsiteCinematicChapter = {
  body: string;
  heading: string;
  id: string;
  progressEnd: number;
  progressStart: number;
};

export type WebsiteCinematicSequenceSpec = {
  cache: {
    desktopLimit: number;
    mobileLimit: number;
    preloadAhead: number;
    retainBehind: number;
  };
  chapters: WebsiteCinematicChapter[];
  contentCues: string[];
  dimensions: { height: number | null; width: number | null };
  engine: "frame_sequence_canvas";
  estimatedDecodedBytes: number;
  fallbackFrame: string;
  frameCount: number;
  id: string;
  mobileStrategy: {
    mode: "every_second" | "every_third" | "full" | "keyframes";
    stride: number;
  };
  narrativePurpose: string;
  playDirection: "forward" | "reverse";
  reducedMotionStrategy: {
    frame: string;
    mode: "representative_static";
  };
  scrollDriven: boolean;
  scrollLengthVh: number;
  sourceFrames: string[];
  sourceSequenceId: string;
  transitionBehavior: "fade";
};

export type WebsiteCinematicExperience = {
  analysis: WebsiteCinematicAssetAnalysis;
  enabled: boolean;
  engine: "frame_sequence" | "none";
  repairApplied: boolean;
  requirement: WebsiteCinematicRequirement;
  sequences: WebsiteCinematicSequenceSpec[];
  warnings: string[];
};

const forbiddenPattern = /(?:\b(?:no|without|disable|avoid|exclude|remove)\s+(?:any\s+)?(?:animation|motion|cinematic(?:\s+playback)?|frame[-\s]sequence|scroll[-\s](?:animation|scrubbing))\b|\bdo\s+not\s+animate\b|\bstatic\s+images?\s+only\b|\banimation\s+(?:off|disabled|forbidden)\b)/i;
const requiredPattern = /(?:\b(?:image|frame)\s+sequence\b|\bsequential\s+(?:image|frame)s?\b|\buploaded\s+(?:image\s+)?sequence\b|\bthese\s+(?:image\s+)?frames\b|\bframe[-\s]by[-\s]frame\b|\bscroll[-\s]controlled\s+(?:animation|playback|frames?|sequence)\b|\bcinematic\b[\s\S]{0,80}\b(?:frames?|sequence|scroll\s+story)\b|\b(?:frames?|sequence)\b[\s\S]{0,80}\bcinematic\b)/i;
const cinematicPattern = /\b(?:cinematic|immersive|scroll\s+story|visual\s+storytelling)\b/i;

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sequence";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function classifyWebsiteCinematicIntent(input: { prompt: string; sequenceCount: number }): WebsiteCinematicRequirement {
  if (forbiddenPattern.test(input.prompt)) return "forbidden";
  if (requiredPattern.test(input.prompt)) return "required";
  if (input.sequenceCount > 0 && cinematicPattern.test(input.prompt)) return "required";
  if (input.sequenceCount > 0 && /\b(?:premium|editorial|interactive|story-led|storytelling)\b/i.test(input.prompt)) return "allowed";
  return "not_requested";
}

function mobileStrategy(sequence: WebsiteCinematicSequenceCandidate): WebsiteCinematicSequenceSpec["mobileStrategy"] {
  if (sequence.frameCount > 160 || sequence.estimatedDecodedBytes > 320 * 1024 * 1024) return { mode: "keyframes", stride: Math.max(1, Math.floor(sequence.frameCount / 5)) };
  if (sequence.frameCount > 90 || sequence.estimatedDecodedBytes > 180 * 1024 * 1024) return { mode: "every_third", stride: 3 };
  if (sequence.frameCount > 45 || sequence.estimatedDecodedBytes > 96 * 1024 * 1024) return { mode: "every_second", stride: 2 };
  return { mode: "full", stride: 1 };
}

function cachePolicy(sequence: WebsiteCinematicSequenceCandidate) {
  const averageBytes = sequence.estimatedDecodedBytes / Math.max(1, sequence.frameCount);
  const memoryBound = Math.floor((96 * 1024 * 1024) / Math.max(averageBytes, 1));
  const desktopLimit = clamp(memoryBound, 6, 24);
  const strategy = mobileStrategy(sequence);
  const mobileLimit = strategy.mode === "keyframes" ? 3 : clamp(Math.floor(desktopLimit / 2), 4, 10);
  return {
    desktopLimit,
    mobileLimit,
    preloadAhead: clamp(Math.floor(desktopLimit * 0.45), 3, 10),
    retainBehind: clamp(Math.floor(desktopLimit * 0.25), 2, 6)
  };
}

function chapterCopy(businessType: string, capabilities: string[]) {
  const subject = businessType || "the product story";
  const details = capabilities.slice(0, 3);
  return [
    { heading: `Meet ${subject}`, body: `Begin with a clear view of ${details[0] ?? "the complete experience"}.` },
    { heading: "See the structure", body: `Reveal ${details[1] ?? "the defining layers"} without losing the surrounding context.` },
    { heading: "Move closer", body: `Focus on ${details[2] ?? "the details that shape the result"}.` },
    { heading: "Follow the transformation", body: "Let the sequence connect form, function, and progression." },
    { heading: "Continue the story", body: "Resolve into the final composition and return naturally to the page." }
  ];
}

function chapters(businessType: string, capabilities: string[]): WebsiteCinematicChapter[] {
  const copy = chapterCopy(businessType, capabilities);
  return copy.map((chapter, index) => ({
    ...chapter,
    id: `chapter-${index + 1}-${slug(chapter.heading)}`,
    progressEnd: Number(((index + 1) / copy.length).toFixed(3)),
    progressStart: Number((index / copy.length).toFixed(3))
  }));
}

function specFor(input: {
  businessType: string;
  capabilities: string[];
  index: number;
  prompt: string;
  sequence: WebsiteCinematicSequenceCandidate;
}): WebsiteCinematicSequenceSpec {
  const fallbackFrame = input.sequence.representativeFrames[Math.floor((input.sequence.representativeFrames.length - 1) / 2)] ?? input.sequence.firstFrame;
  const strategy = mobileStrategy(input.sequence);
  return {
    cache: cachePolicy(input.sequence),
    chapters: chapters(input.businessType, input.capabilities),
    contentCues: [input.businessType, ...input.capabilities].filter(Boolean).slice(0, 5),
    dimensions: { height: input.sequence.height, width: input.sequence.width },
    engine: "frame_sequence_canvas",
    estimatedDecodedBytes: input.sequence.estimatedDecodedBytes,
    fallbackFrame,
    frameCount: input.sequence.frameCount,
    id: `cinematic-${input.index + 1}-${input.sequence.sequenceId}`,
    mobileStrategy: strategy,
    narrativePurpose: `Use the ${input.sequence.sharedStem} sequence to support a ${input.businessType} story without replacing the page's semantic content.`,
    playDirection: /\b(?:reverse|backward|backwards)\b/i.test(input.prompt) ? "reverse" : "forward",
    reducedMotionStrategy: { frame: fallbackFrame, mode: "representative_static" },
    scrollDriven: true,
    scrollLengthVh: clamp(160 + Math.round(input.sequence.frameCount * 1.15), 180, 420),
    sourceFrames: input.sequence.frames.map((frame) => frame.path),
    sourceSequenceId: input.sequence.sequenceId,
    transitionBehavior: "fade"
  };
}

export function repairWebsiteCinematicSpecs(specs: WebsiteCinematicSequenceSpec[]) {
  const seen = new Set<string>();
  let repairApplied = false;
  const repaired = specs.map((spec, index) => {
    let id = slug(spec.id);
    if (seen.has(id)) { id = `${id}-${index + 1}`; repairApplied = true; }
    seen.add(id);
    const sourceFrames = Array.from(new Set(spec.sourceFrames));
    if (sourceFrames.length !== spec.sourceFrames.length) repairApplied = true;
    const fallbackFrame = sourceFrames.includes(spec.fallbackFrame) ? spec.fallbackFrame : sourceFrames[0] ?? spec.fallbackFrame;
    if (fallbackFrame !== spec.fallbackFrame) repairApplied = true;
    const desktopLimit = clamp(spec.cache.desktopLimit, 4, 32);
    const mobileLimit = clamp(spec.cache.mobileLimit, 2, Math.min(12, desktopLimit));
    if (desktopLimit !== spec.cache.desktopLimit || mobileLimit !== spec.cache.mobileLimit) repairApplied = true;
    return {
      ...spec,
      cache: { ...spec.cache, desktopLimit, mobileLimit },
      fallbackFrame,
      frameCount: sourceFrames.length,
      id,
      sourceFrames
    };
  });
  return { repairApplied, specs: repaired };
}

export function buildWebsiteCinematicExperience(input: {
  assets: WebsiteCinematicAssetInput[];
  businessType: string;
  capabilities: string[];
  prompt: string;
}): WebsiteCinematicExperience {
  const analysis = analyzeWebsiteCinematicAssets(input.assets);
  const requirement = classifyWebsiteCinematicIntent({ prompt: input.prompt, sequenceCount: analysis.sequences.length });
  const requestedSpecs = requirement === "required"
    ? analysis.sequences.map((sequence, index) => specFor({ ...input, index, sequence }))
    : [];
  const repair = repairWebsiteCinematicSpecs(requestedSpecs);
  const enabled = requirement === "required" && repair.specs.length > 0;
  const warnings = [
    ...analysis.warnings,
    ...(requirement === "required" && analysis.sequences.length === 0 ? ["Cinematic playback was requested, but no extracted frame sequence is available."] : []),
    ...(requirement === "allowed" ? ["Sequential assets are available, but playback was not enabled without a direct cinematic instruction."] : [])
  ];
  return {
    analysis,
    enabled,
    engine: enabled ? "frame_sequence" : "none",
    repairApplied: repair.repairApplied,
    requirement,
    sequences: repair.specs,
    warnings
  };
}
