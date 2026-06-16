import type {
  DesignTokenMap,
  DesignTokenValue
} from "@/lib/server/design/tokens/design-token-types";

export type PenpotNodeType =
  | "component"
  | "frame"
  | "group"
  | "image"
  | "shape"
  | "text"
  | "unknown";

export type PenpotBounds = {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
};

export type PenpotFill = {
  color?: string;
  opacity?: number;
  type: "color" | "gradient" | "image" | "unknown";
};

export type PenpotStroke = {
  color?: string;
  opacity?: number;
  width?: number;
};

export type PenpotTypography = {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
};

export type PenpotLayoutGrid = {
  columns?: number;
  gutter?: number;
  margin?: number;
  type: "columns" | "grid" | "rows" | "unknown";
};

export type PenpotConstraints = {
  horizontal?: string;
  vertical?: string;
};

export type PenpotLayer = {
  assetRef?: string;
  bounds?: PenpotBounds;
  children: PenpotLayer[];
  constraints?: PenpotConstraints;
  effects: string[];
  fills: PenpotFill[];
  id: string;
  name: string;
  radius?: string;
  spacing?: string;
  strokes: PenpotStroke[];
  text?: string;
  type: PenpotNodeType;
  typography?: PenpotTypography;
  visible: boolean;
};

export type PenpotFrame = {
  bounds?: PenpotBounds;
  constraints?: PenpotConstraints;
  id: string;
  layers: PenpotLayer[];
  layoutGrids: PenpotLayoutGrid[];
  name: string;
};

export type PenpotPage = {
  frames: PenpotFrame[];
  id: string;
  name: string;
};

export type PenpotComponent = {
  id: string;
  name: string;
  sourceNodeId?: string;
};

export type PenpotStyle = {
  category: "color" | "effect" | "radius" | "spacing" | "typography" | "unknown";
  id: string;
  name: string;
  value: string;
};

export type PenpotAsset = {
  id: string;
  name: string;
  type: "font" | "icon" | "image" | "unknown";
  url?: string;
};

export type PenpotDocument = {
  assets: PenpotAsset[];
  components: PenpotComponent[];
  id: string;
  name: string;
  pages: PenpotPage[];
  sourceFormat: "penpot_json" | "normalized_design_json";
  styles: PenpotStyle[];
};

export type PenpotImportWarning = {
  code:
    | "broken_asset"
    | "duplicate_component"
    | "empty_frame"
    | "missing_color_styles"
    | "missing_typography"
    | "oversized_document"
    | "unsupported_layer";
  message: string;
  nodeId?: string;
};

export type PenpotImportError = {
  code: "invalid_document" | "missing_pages";
  message: string;
};

export type PenpotImportResult = {
  document?: PenpotDocument;
  errors: PenpotImportError[];
  importStatus: "blocked" | "parsed" | "warning";
  warnings: PenpotImportWarning[];
};

export type NormalizedPenpotNode = {
  children: NormalizedPenpotNode[];
  id: string;
  name: string;
  role: PenpotNodeType;
  text?: string;
};

export type NormalizedPenpotDocument = {
  assetInventory: PenpotAsset[];
  componentInventory: PenpotComponent[];
  frameTree: Array<{
    children: NormalizedPenpotNode[];
    id: string;
    name: string;
    pageId: string;
  }>;
  id: string;
  name: string;
  pageTree: Array<{
    frameIds: string[];
    id: string;
    name: string;
  }>;
  styleInventory: PenpotStyle[];
};

export type PenpotTokenMap = {
  sourceStyleCount: number;
  tokenCount: number;
  tokens: DesignTokenMap;
  warnings: PenpotImportWarning[];
};

export type PenpotWebsiteSectionType =
  | "card_grid"
  | "contact"
  | "dashboard"
  | "feature_grid"
  | "footer"
  | "form_section"
  | "gallery"
  | "hero"
  | "pricing"
  | "testimonials";

export type PenpotSectionPlan = {
  confidence: number;
  frameId: string;
  pageId: string;
  sectionType: PenpotWebsiteSectionType;
  sourceName: string;
  textSignals: string[];
};

export type PenpotLayoutPlan = {
  layoutStatus: "mapped" | "warning";
  pages: Array<{
    id: string;
    name: string;
    sectionIds: string[];
  }>;
  sections: PenpotSectionPlan[];
  warnings: PenpotImportWarning[];
};

export type MutableDesignTokenMap = {
  [K in keyof DesignTokenMap]: Record<string, DesignTokenValue>;
};
