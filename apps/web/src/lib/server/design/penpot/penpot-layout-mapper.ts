import type {
  PenpotDocument,
  PenpotFrame,
  PenpotImportWarning,
  PenpotLayer,
  PenpotLayoutPlan,
  PenpotSectionPlan,
  PenpotWebsiteSectionType
} from "@/lib/server/design/penpot/penpot-types";

const sectionSignals: Record<PenpotWebsiteSectionType, string[]> = {
  card_grid: ["card grid", "cards", "tiles", "collection", "products"],
  contact: ["contact", "location", "address", "email", "phone"],
  dashboard: ["dashboard", "analytics", "chart", "table", "sidebar", "metrics"],
  feature_grid: ["features", "benefits", "capabilities", "services"],
  footer: ["footer", "legal", "privacy", "links"],
  form_section: ["form", "signup", "booking", "appointment", "inquiry"],
  gallery: ["gallery", "portfolio", "showcase", "images"],
  hero: ["hero", "headline", "intro", "landing", "banner"],
  pricing: ["pricing", "plans", "price", "subscription"],
  testimonials: ["testimonial", "reviews", "clients", "proof", "quotes"]
};

export function mapPenpotLayouts(document: PenpotDocument): PenpotLayoutPlan {
  const warnings: PenpotImportWarning[] = [];
  const sections: PenpotSectionPlan[] = [];

  document.pages.forEach((page) => {
    page.frames.forEach((frame) => {
      if (frame.layers.length === 0) {
        warnings.push({
          code: "empty_frame",
          message: `Frame ${frame.name} has no layers to map into a section.`,
          nodeId: frame.id
        });
        return;
      }

      sections.push(classifyFrame(page.id, frame));
    });
  });

  return {
    layoutStatus: warnings.length > 0 ? "warning" : "mapped",
    pages: document.pages.map((page) => ({
      id: page.id,
      name: page.name,
      sectionIds: sections.filter((section) => section.pageId === page.id).map((section) => section.frameId)
    })),
    sections,
    warnings
  };
}

function classifyFrame(pageId: string, frame: PenpotFrame): PenpotSectionPlan {
  const textSignals = collectTextSignals(frame);
  const haystack = [frame.name, ...textSignals].join(" ").toLowerCase();
  let bestType: PenpotWebsiteSectionType = "feature_grid";
  let bestScore = 0;

  Object.entries(sectionSignals).forEach(([type, signals]) => {
    const score = signals.reduce((total, signal) => total + (haystack.includes(signal) ? 1 : 0), 0);

    if (score > bestScore) {
      bestType = type as PenpotWebsiteSectionType;
      bestScore = score;
    }
  });

  return {
    confidence: bestScore > 0 ? Math.min(0.95, 0.55 + bestScore * 0.12) : 0.42,
    frameId: frame.id,
    pageId,
    sectionType: bestType,
    sourceName: frame.name,
    textSignals
  };
}

function collectTextSignals(frame: PenpotFrame) {
  return frame.layers.flatMap(collectLayerText).slice(0, 12);
}

function collectLayerText(layer: PenpotLayer): string[] {
  return [
    layer.text ?? "",
    layer.name,
    ...layer.children.flatMap(collectLayerText)
  ].filter((value) => value.trim().length > 0);
}
