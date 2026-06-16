import type {
  PenpotAsset,
  PenpotComponent,
  PenpotDocument,
  PenpotFill,
  PenpotFrame,
  PenpotImportResult,
  PenpotImportWarning,
  PenpotLayer,
  PenpotLayoutGrid,
  PenpotNodeType,
  PenpotPage,
  PenpotStroke,
  PenpotStyle
} from "@/lib/server/design/penpot/penpot-types";

const maxNodeCount = 2400;

export function parsePenpotDocument(raw: unknown): PenpotImportResult {
  if (!isRecord(raw)) {
    return {
      errors: [{ code: "invalid_document", message: "Penpot import must be an object." }],
      importStatus: "blocked",
      warnings: []
    };
  }

  const root = unwrapRoot(raw);
  const rawPages = asArray(root.pages);

  if (rawPages.length === 0) {
    return {
      errors: [{ code: "missing_pages", message: "Penpot import did not include any pages." }],
      importStatus: "blocked",
      warnings: []
    };
  }

  const warnings: PenpotImportWarning[] = [];
  let nodeCount = 0;
  const pages = rawPages.map((page, pageIndex) => parsePage(page, pageIndex, warnings, () => {
    nodeCount += 1;
  }));

  if (nodeCount > maxNodeCount) {
    warnings.push({
      code: "oversized_document",
      message: `Design import contains ${nodeCount} nodes. Hassali will use summaries in future planning phases.`
    });
  }

  const document: PenpotDocument = {
    assets: parseAssets(root.assets),
    components: parseComponents(root.components),
    id: readString(root.id) ?? "penpot-document",
    name: readString(root.name) ?? "Imported Penpot Document",
    pages,
    sourceFormat: root.sourceFormat === "normalized_design_json" ? "normalized_design_json" : "penpot_json",
    styles: parseStyles(root.styles)
  };

  return {
    document,
    errors: [],
    importStatus: warnings.length > 0 ? "warning" : "parsed",
    warnings
  };
}

function unwrapRoot(raw: Record<string, unknown>) {
  if (isRecord(raw.document)) return raw.document;
  if (isRecord(raw.data)) return raw.data;
  return raw;
}

function parsePage(
  raw: unknown,
  index: number,
  warnings: PenpotImportWarning[],
  countNode: () => void
): PenpotPage {
  const page = isRecord(raw) ? raw : {};
  const frames = asArray(page.frames ?? page.children).map((frame, frameIndex) =>
    parseFrame(frame, frameIndex, warnings, countNode)
  );

  return {
    frames,
    id: readString(page.id) ?? `page-${index + 1}`,
    name: readString(page.name) ?? `Page ${index + 1}`
  };
}

function parseFrame(
  raw: unknown,
  index: number,
  warnings: PenpotImportWarning[],
  countNode: () => void
): PenpotFrame {
  countNode();
  const frame = isRecord(raw) ? raw : {};
  const layers = asArray(frame.layers ?? frame.children).map((layer, layerIndex) =>
    parseLayer(layer, layerIndex, warnings, countNode)
  );

  if (layers.length === 0) {
    warnings.push({
      code: "empty_frame",
      message: `Frame ${readString(frame.name) ?? index + 1} has no layers.`,
      nodeId: readString(frame.id)
    });
  }

  return {
    bounds: parseBounds(frame),
    constraints: parseConstraints(frame.constraints),
    id: readString(frame.id) ?? `frame-${index + 1}`,
    layers,
    layoutGrids: asArray(frame.layoutGrids ?? frame.grids).map(parseLayoutGrid),
    name: readString(frame.name) ?? `Frame ${index + 1}`
  };
}

function parseLayer(
  raw: unknown,
  index: number,
  warnings: PenpotImportWarning[],
  countNode: () => void
): PenpotLayer {
  countNode();
  const layer = isRecord(raw) ? raw : {};
  const type = parseNodeType(layer.type ?? layer.kind);

  if (type === "unknown") {
    warnings.push({
      code: "unsupported_layer",
      message: `Unsupported layer type on ${readString(layer.name) ?? `layer ${index + 1}`}.`,
      nodeId: readString(layer.id)
    });
  }

  return {
    assetRef: readString(layer.assetRef ?? layer.assetId),
    bounds: parseBounds(layer),
    children: asArray(layer.children ?? layer.layers).map((child, childIndex) =>
      parseLayer(child, childIndex, warnings, countNode)
    ),
    constraints: parseConstraints(layer.constraints),
    effects: asArray(layer.effects).map((effect) => readString(effect) ?? "").filter(Boolean),
    fills: parseFills(layer.fills ?? layer.fill),
    id: readString(layer.id) ?? `layer-${index + 1}`,
    name: readString(layer.name) ?? `Layer ${index + 1}`,
    radius: readScalar(layer.radius ?? layer.borderRadius),
    spacing: readScalar(layer.spacing ?? layer.gap),
    strokes: parseStrokes(layer.strokes ?? layer.stroke),
    text: readString(layer.text ?? layer.characters),
    type,
    typography: parseTypography(layer.typography ?? layer),
    visible: layer.visible !== false
  };
}

function parseAssets(raw: unknown): PenpotAsset[] {
  return asArray(raw).map((asset, index) => {
    const record = isRecord(asset) ? asset : {};
    const type = readString(record.type);

    return {
      id: readString(record.id) ?? `asset-${index + 1}`,
      name: readString(record.name) ?? `Asset ${index + 1}`,
      type: type === "font" || type === "icon" || type === "image" ? type : "unknown",
      url: readString(record.url ?? record.src)
    };
  });
}

function parseComponents(raw: unknown): PenpotComponent[] {
  return asArray(raw).map((component, index) => {
    const record = isRecord(component) ? component : {};

    return {
      id: readString(record.id) ?? `component-${index + 1}`,
      name: readString(record.name) ?? `Component ${index + 1}`,
      sourceNodeId: readString(record.sourceNodeId ?? record.nodeId)
    };
  });
}

function parseStyles(raw: unknown): PenpotStyle[] {
  return asArray(raw).map((style, index) => {
    const record = isRecord(style) ? style : {};
    const category = readString(record.category ?? record.type);

    return {
      category:
        category === "color" ||
        category === "effect" ||
        category === "radius" ||
        category === "spacing" ||
        category === "typography"
          ? category
          : "unknown",
      id: readString(record.id) ?? `style-${index + 1}`,
      name: readString(record.name) ?? `Style ${index + 1}`,
      value: readScalar(record.value ?? record.color ?? record.fontSize ?? record.radius) ?? ""
    };
  });
}

function parseBounds(record: Record<string, unknown>) {
  const bounds = isRecord(record.bounds) ? record.bounds : record;

  return {
    height: readNumber(bounds.height),
    width: readNumber(bounds.width),
    x: readNumber(bounds.x),
    y: readNumber(bounds.y)
  };
}

function parseConstraints(raw: unknown) {
  if (!isRecord(raw)) return undefined;

  return {
    horizontal: readString(raw.horizontal),
    vertical: readString(raw.vertical)
  };
}

function parseLayoutGrid(raw: unknown): PenpotLayoutGrid {
  const grid = isRecord(raw) ? raw : {};
  const type = readString(grid.type);

  return {
    columns: readNumber(grid.columns),
    gutter: readNumber(grid.gutter),
    margin: readNumber(grid.margin),
    type: type === "columns" || type === "grid" || type === "rows" ? type : "unknown"
  };
}

function parseFills(raw: unknown): PenpotFill[] {
  return normalizeArray(raw).map((fill) => {
    const record: Record<string, unknown> = isRecord(fill) ? fill : { color: fill };
    const type = readString(record.type);

    return {
      color: readString(record.color ?? record.value),
      opacity: readNumber(record.opacity),
      type: type === "color" || type === "gradient" || type === "image" ? type : "unknown"
    };
  });
}

function parseStrokes(raw: unknown): PenpotStroke[] {
  return normalizeArray(raw).map((stroke) => {
    const record: Record<string, unknown> = isRecord(stroke) ? stroke : { color: stroke };

    return {
      color: readString(record.color ?? record.value),
      opacity: readNumber(record.opacity),
      width: readNumber(record.width)
    };
  });
}

function parseTypography(raw: unknown) {
  if (!isRecord(raw)) return undefined;

  return {
    fontFamily: readString(raw.fontFamily),
    fontSize: readScalar(raw.fontSize),
    fontWeight: readScalar(raw.fontWeight),
    lineHeight: readScalar(raw.lineHeight)
  };
}

function parseNodeType(raw: unknown): PenpotNodeType {
  const value = readString(raw)?.toLowerCase();

  if (!value) return "unknown";
  if (value.includes("component")) return "component";
  if (value.includes("frame") || value.includes("board")) return "frame";
  if (value.includes("group")) return "group";
  if (value.includes("image") || value.includes("bitmap")) return "image";
  if (value.includes("text")) return "text";
  if (value.includes("shape") || value.includes("rect") || value.includes("ellipse") || value.includes("path")) return "shape";

  return "unknown";
}

function normalizeArray(raw: unknown) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "undefined" || raw === null) return [];
  return [raw];
}

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function readScalar(raw: unknown) {
  if (typeof raw === "number") return `${raw}px`;
  return readString(raw);
}

function readNumber(raw: unknown) {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function readString(raw: unknown) {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
