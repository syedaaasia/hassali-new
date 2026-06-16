import type { DesignTokenCategory } from "@/lib/server/design/tokens/design-token-types";
import type {
  MutableDesignTokenMap,
  PenpotDocument,
  PenpotImportWarning,
  PenpotLayer,
  PenpotTokenMap
} from "@/lib/server/design/penpot/penpot-types";

export function mapPenpotTokens(document: PenpotDocument): PenpotTokenMap {
  const warnings: PenpotImportWarning[] = [];
  const tokens = createEmptyTokenMap();

  document.styles.forEach((style) => {
    const category = style.category === "unknown" ? inferCategory(style.value) : style.category;

    if (category === "effect") {
      tokens.shadow[safeName(style.name)] = token("shadow", style.value);
      return;
    }

    if (category === "color") tokens.color[safeName(style.name)] = token("color", style.value);
    if (category === "typography") tokens.typography[safeName(style.name)] = token("typography", style.value);
    if (category === "spacing") tokens.spacing[safeName(style.name)] = token("spacing", style.value);
    if (category === "radius") tokens.radius[safeName(style.name)] = token("radius", style.value);
  });

  document.pages.forEach((page) => {
    page.frames.forEach((frame) => {
      frame.layers.forEach((layer) => collectLayerTokens(layer, tokens));
    });
  });

  if (Object.keys(tokens.color).length === 0) {
    warnings.push({
      code: "missing_color_styles",
      message: "No Penpot color styles or layer fills were found."
    });
  }

  if (Object.keys(tokens.typography).length === 0) {
    warnings.push({
      code: "missing_typography",
      message: "No Penpot typography styles or text layer typography were found."
    });
  }

  return {
    sourceStyleCount: document.styles.length,
    tokenCount: Object.values(tokens).reduce((total, group) => total + Object.keys(group).length, 0),
    tokens,
    warnings
  };
}

function collectLayerTokens(layer: PenpotLayer, tokens: MutableDesignTokenMap) {
  layer.fills.forEach((fill, index) => {
    if (fill.color) {
      tokens.color[safeName(`${layer.name} fill ${index + 1}`)] = token("color", fill.color);
    }
  });

  layer.strokes.forEach((stroke, index) => {
    if (stroke.color) {
      tokens.border[safeName(`${layer.name} stroke ${index + 1}`)] = token("border", stroke.color);
    }
  });

  if (layer.typography?.fontSize) {
    tokens.typography[safeName(`${layer.name} text size`)] = token("typography", layer.typography.fontSize);
  }

  if (layer.spacing) {
    tokens.spacing[safeName(`${layer.name} spacing`)] = token("spacing", layer.spacing);
  }

  if (layer.radius) {
    tokens.radius[safeName(`${layer.name} radius`)] = token("radius", layer.radius);
  }

  layer.effects.forEach((effect, index) => {
    tokens.shadow[safeName(`${layer.name} effect ${index + 1}`)] = token("shadow", effect);
  });

  layer.children.forEach((child) => collectLayerTokens(child, tokens));
}

function createEmptyTokenMap(): MutableDesignTokenMap {
  return {
    border: {},
    color: {},
    component: {},
    layout: {},
    motion: {},
    radius: {},
    shadow: {},
    spacing: {},
    typography: {}
  };
}

function inferCategory(value: string): Exclude<DesignTokenCategory, "component" | "layout" | "motion"> | "effect" {
  if (/^#|rgb|hsl/i.test(value)) return "color";
  if (/shadow|blur|rgba/i.test(value)) return "effect";
  if (/^\d+(\.\d+)?(px|rem|em|%)$/i.test(value)) return "spacing";
  return "typography";
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "token";
}

function token(type: DesignTokenCategory, value: string) {
  return { type, value };
}
