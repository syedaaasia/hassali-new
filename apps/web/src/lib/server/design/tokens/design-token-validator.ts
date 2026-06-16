import type {
  DesignTokenMap,
  DesignTokenThemeId,
  DesignTokenValidationIssue,
  DesignTokenValidationResult
} from "@/lib/server/design/tokens/design-token-types";
import { isDesignTokenTheme } from "@/lib/server/design/tokens/design-token-registry";

const requiredColorTokens = ["background", "foreground", "primary"];
const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function countDesignTokens(tokens: DesignTokenMap) {
  return Object.values(tokens).reduce((count, group) => count + Object.keys(group).length, 0);
}

export function validateDesignTokens(input: {
  theme: DesignTokenThemeId;
  tokens: DesignTokenMap;
}): DesignTokenValidationResult {
  const issues: DesignTokenValidationIssue[] = [];

  if (!isDesignTokenTheme(input.theme)) {
    issues.push({
      code: "unsupported_theme",
      message: `Unsupported design token theme: ${input.theme}.`,
      severity: "blocker"
    });
  }

  requiredColorTokens.forEach((name) => {
    if (!input.tokens.color[name]?.value) {
      issues.push({
        code: "missing_required_token",
        message: `Missing required color token: ${name}.`,
        severity: "blocker",
        tokenPath: `color.${name}`
      });
    }
  });

  Object.entries(input.tokens.color).forEach(([name, token]) => {
    if (!hexColorPattern.test(token.value)) {
      issues.push({
        code: "invalid_hex_color",
        message: `Color token ${name} must be a valid hex color.`,
        severity: "blocker",
        tokenPath: `color.${name}`
      });
    }
  });

  if (Object.keys(input.tokens.typography).length === 0) {
    issues.push({
      code: "empty_typography_scale",
      message: "Typography scale cannot be empty.",
      severity: "blocker",
      tokenPath: "typography"
    });
  }

  if (Object.keys(input.tokens.spacing).length === 0) {
    issues.push({
      code: "empty_spacing_scale",
      message: "Spacing scale cannot be empty.",
      severity: "blocker",
      tokenPath: "spacing"
    });
  }

  Object.entries(input.tokens).forEach(([category, group]) => {
    const seen = new Set<string>();

    Object.keys(group).forEach((name) => {
      const normalized = name.toLowerCase();

      if (seen.has(normalized)) {
        issues.push({
          code: "duplicate_token_name",
          message: `Duplicate token name ${name} in ${category}.`,
          severity: "blocker",
          tokenPath: `${category}.${name}`
        });
      }

      seen.add(normalized);
    });
  });

  const blockingIssues = issues.filter((issue) => issue.severity === "blocker");

  return {
    issueCount: issues.length,
    issues,
    passed: blockingIssues.length === 0,
    requiredTokensPresent: requiredColorTokens.every((name) => Boolean(input.tokens.color[name]?.value)),
    theme: input.theme,
    tokenCount: countDesignTokens(input.tokens)
  };
}
