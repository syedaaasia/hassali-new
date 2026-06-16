import type {
  DesignTokenMap,
  TokensStudioTokenMap
} from "@/lib/server/design/tokens/design-token-types";

export function exportTokensStudioJson(tokens: DesignTokenMap): TokensStudioTokenMap {
  return Object.fromEntries(
    Object.entries(tokens).map(([category, group]) => [
      category,
      Object.fromEntries(
        Object.entries(group).map(([name, token]) => [
          name,
          {
            ...(token.description ? { description: token.description } : {}),
            type: token.type,
            value: token.value
          }
        ])
      )
    ])
  );
}

export function tokensToCssVariables(tokens: DesignTokenMap) {
  const variables: Record<string, string> = {};

  Object.entries(tokens).forEach(([category, group]) => {
    Object.entries(group).forEach(([name, token]) => {
      variables[`--token-${kebab(category)}-${kebab(name)}`] = token.value;
    });
  });

  variables["--canvas"] = tokens.color.background.value;
  variables["--surface"] = tokens.color.surface.value;
  variables["--surface-elevated"] = tokens.color.surfaceElevated.value;
  variables["--ink"] = tokens.color.foreground.value;
  variables["--muted"] = tokens.color.muted.value;
  variables["--accent"] = tokens.color.primary.value;
  variables["--accent-2"] = tokens.color.secondary.value;
  variables["--line"] = tokens.color.border.value;
  variables["--radius"] = tokens.radius.lg.value;
  variables["--radius-card"] = tokens.radius.card.value;
  variables["--shadow-soft"] = tokens.shadow.soft.value;
  variables["--shadow-glow"] = tokens.shadow.glow.value;
  variables["--font-sans"] = tokens.typography.fontSans.value;
  variables["--font-display"] = tokens.typography.fontDisplay.value;
  variables["--section-padding"] = tokens.component.sectionPadding.value;
  variables["--button-padding"] = tokens.component.buttonPadding.value;
  variables["--card-padding"] = tokens.component.cardPadding.value;

  return variables;
}

function kebab(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`).replace(/_/g, "-");
}
