import type {
  PenpotDocument,
  PenpotImportError,
  PenpotImportWarning,
  PenpotLayer
} from "@/lib/server/design/penpot/penpot-types";

const maxRecommendedNodes = 2400;

export function validatePenpotImport(document: PenpotDocument): {
  errors: PenpotImportError[];
  validationStatus: "blocked" | "passed" | "warning";
  warnings: PenpotImportWarning[];
} {
  const errors: PenpotImportError[] = [];
  const warnings: PenpotImportWarning[] = [];

  if (document.pages.length === 0) {
    errors.push({
      code: "missing_pages",
      message: "Design import cannot be used without pages."
    });
  }

  const nodeCount = document.pages.reduce(
    (total, page) => total + page.frames.reduce((frameTotal, frame) => frameTotal + countLayers(frame.layers), 0),
    0
  );

  if (nodeCount > maxRecommendedNodes) {
    warnings.push({
      code: "oversized_document",
      message: `Design import has ${nodeCount} layers. Future phases should summarize before generation.`
    });
  }

  document.pages.forEach((page) => {
    page.frames.forEach((frame) => {
      if (frame.layers.length === 0) {
        warnings.push({
          code: "empty_frame",
          message: `Frame ${frame.name} is empty.`,
          nodeId: frame.id
        });
      }
    });
  });

  const componentNames = new Map<string, string>();

  document.components.forEach((component) => {
    const normalized = component.name.toLowerCase();
    const existing = componentNames.get(normalized);

    if (existing) {
      warnings.push({
        code: "duplicate_component",
        message: `Duplicate component name detected: ${component.name}.`,
        nodeId: component.id
      });
    }

    componentNames.set(normalized, component.id);
  });

  document.assets.forEach((asset) => {
    if (asset.type === "image" && (!asset.url || asset.url.includes("broken") || asset.url.startsWith("missing:"))) {
      warnings.push({
        code: "broken_asset",
        message: `Image asset ${asset.name} does not have a usable source.`,
        nodeId: asset.id
      });
    }
  });

  const hasTypography =
    document.styles.some((style) => style.category === "typography") ||
    document.pages.some((page) =>
      page.frames.some((frame) => frame.layers.some(hasTextTypography))
    );

  if (!hasTypography) {
    warnings.push({
      code: "missing_typography",
      message: "No typography styles were detected."
    });
  }

  const hasColor =
    document.styles.some((style) => style.category === "color") ||
    document.pages.some((page) =>
      page.frames.some((frame) => frame.layers.some(hasColorFill))
    );

  if (!hasColor) {
    warnings.push({
      code: "missing_color_styles",
      message: "No color styles or fills were detected."
    });
  }

  return {
    errors,
    validationStatus: errors.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "passed",
    warnings
  };
}

function countLayers(layers: PenpotLayer[]): number {
  return layers.reduce((count, layer) => count + 1 + countLayers(layer.children), 0);
}

function hasTextTypography(layer: PenpotLayer): boolean {
  return Boolean(layer.typography?.fontFamily || layer.typography?.fontSize) || layer.children.some(hasTextTypography);
}

function hasColorFill(layer: PenpotLayer): boolean {
  return layer.fills.some((fill) => Boolean(fill.color)) || layer.children.some(hasColorFill);
}
