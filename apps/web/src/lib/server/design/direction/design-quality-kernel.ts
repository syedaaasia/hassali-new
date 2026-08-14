import type { ProjectDesignContract } from "./project-design-contract";

export type DesignQualityFinding = {
  code: string;
  evidence: string;
  message: string;
  severity: "block" | "warning";
};

export type DesignQualityReview = {
  blocking: boolean;
  coherenceScore: number;
  findings: DesignQualityFinding[];
  passedChecks: string[];
  status: "blocked" | "passed" | "warning";
};

const fakeProofPatterns = [
  /trusted by\s+[\d,]+/i,
  /(?:over|more than)\s+[\d,]+\s+(?:customers|clients|users)/i,
  /(?:award[- ]winning|industry[- ]leading)/i,
  /\b(?:4\.9|5\.0)\s*(?:\/\s*5|stars?)/i,
  /as seen (?:in|on)/i
];

const genericPatterns = [
  { code: "GENERIC_PURPLE_GRADIENT", pattern: /linear-gradient\([^)]*(?:#7c3aed|#8b5cf6|purple)[^)]*(?:#2563eb|#3b82f6|blue)/i },
  { code: "UNSUPPORTED_GLASS", pattern: /backdrop-filter\s*:\s*blur/i },
  { code: "FLOATING_BLOB", pattern: /\b(?:gradient|floating)[-_ ]?(?:orb|blob)\b/i },
  { code: "EXCESSIVE_PILLS", pattern: /border-radius\s*:\s*999(?:px|rem)/gi },
  { code: "GIANT_RADIUS", pattern: /border-radius\s*:\s*(?:2[4-9]|[3-9]\d)px/gi }
];

function supports(contract: ProjectDesignContract, term: string) {
  return [
    contract.identity.archetype,
    contract.geometry.surfaceTreatment,
    contract.geometry.buttonRadius,
    contract.geometry.cardRadius,
    contract.components.buttons,
    contract.components.cards,
    ...contract.intent.personality,
    ...contract.doRules
  ].join(" ").toLowerCase().includes(term);
}

function finding(code: string, message: string, evidence: string, severity: DesignQualityFinding["severity"]): DesignQualityFinding {
  return { code, evidence: evidence.slice(0, 180), message, severity };
}

export function reviewProjectDesignContract(contract: ProjectDesignContract): DesignQualityReview {
  const findings: DesignQualityFinding[] = [];
  if (!contract.identity.userBrand.trim()) findings.push(finding("MISSING_USER_BRAND", "The project brand must remain distinct from reference brands.", "identity.userBrand is empty", "block"));
  if (contract.references.filter((reference) => reference.scope === "global").length > 1 && contract.conflicts.some((conflict) => conflict.severity === "blocking")) {
    findings.push(finding("GLOBAL_REFERENCE_CONFLICT", "Equal-authority global references need a role or explicit precedence.", contract.references.map((reference) => `${reference.name}:${reference.role}`).join(", "), "block"));
  }
  if (contract.colors.accent.value === contract.colors.background.value) findings.push(finding("COLOR_ROLE_COLLISION", "Accent and background roles need distinguishable usage.", contract.colors.accent.value, "warning"));
  if (contract.layout.sectionRhythm.length < 3) findings.push(finding("WEAK_SECTION_RHYTHM", "A serious website direction needs a deliberate multi-step page rhythm.", contract.layout.sectionRhythm.join(" -> "), "warning"));
  if (/proprietary/i.test(contract.typography.display) && !/never assert/i.test(contract.typography.fallbackPolicy)) findings.push(finding("FONT_AUTHORITY", "Unavailable proprietary fonts need an explicit fallback policy.", contract.typography.display, "block"));
  const blocking = findings.some((item) => item.severity === "block");
  const score = Math.max(0, 100 - findings.filter((item) => item.severity === "block").length * 35 - findings.filter((item) => item.severity === "warning").length * 8);
  return {
    blocking,
    coherenceScore: score,
    findings,
    passedChecks: ["semantic color roles", "typography hierarchy", "systematic spacing", "responsive rules", "accessibility boundary", "reference role scope", "content integrity"].filter((check) => !findings.some((item) => item.code.toLowerCase().includes(check.split(" ")[0]))),
    status: blocking ? "blocked" : findings.length ? "warning" : "passed"
  };
}

export function reviewGeneratedWebsiteDesign(input: {
  contract: ProjectDesignContract;
  files: Record<string, string>;
}): DesignQualityReview {
  const base = reviewProjectDesignContract(input.contract);
  const source = Object.entries(input.files).filter(([path]) => /\.(?:css|html|js)$/i.test(path)).map(([path, content]) => `FILE:${path}\n${content}`).join("\n");
  const findings = [...base.findings];
  for (const proof of fakeProofPatterns) {
    const match = source.match(proof);
    if (match) findings.push(finding("FAKE_SOCIAL_PROOF", "Generated design cannot manufacture customers, ratings, awards, or adoption metrics.", match[0], "block"));
  }
  for (const item of genericPatterns) {
    const matches = source.match(item.pattern) ?? [];
    if (!matches.length) continue;
    if (item.code === "UNSUPPORTED_GLASS" && supports(input.contract, "glass")) continue;
    if (item.code === "EXCESSIVE_PILLS" && matches.length <= 3) continue;
    if (item.code === "GIANT_RADIUS" && supports(input.contract, "rounded")) continue;
    if (item.code === "GENERIC_PURPLE_GRADIENT" && supports(input.contract, "violet")) continue;
    findings.push(finding(item.code, "Generated styling introduced an unsupported generic AI-site pattern.", matches.slice(0, 4).join(", "), item.code === "FAKE_SOCIAL_PROOF" ? "block" : "warning"));
  }
  const contractColors = [input.contract.colors.background.value, input.contract.colors.surface.value, input.contract.colors.textPrimary.value, input.contract.colors.accent.value];
  const colorMatches = contractColors.filter((color) => source.toLowerCase().includes(color.toLowerCase())).length;
  if (colorMatches < 3) findings.push(finding("CONTRACT_COLOR_DRIFT", "Generated files must consume the contract's semantic color system.", `${colorMatches}/4 contract colors found`, "block"));
  if (!source.includes(input.contract.fingerprint)) findings.push(finding("CONTRACT_FINGERPRINT_MISSING", "Portable design output must identify the contract consumed by the builder.", input.contract.fingerprint, "block"));
  const blocking = findings.some((item) => item.severity === "block");
  return {
    blocking,
    coherenceScore: Math.max(0, 100 - findings.filter((item) => item.severity === "block").length * 30 - findings.filter((item) => item.severity === "warning").length * 6),
    findings,
    passedChecks: base.passedChecks,
    status: blocking ? "blocked" : findings.length ? "warning" : "passed"
  };
}
