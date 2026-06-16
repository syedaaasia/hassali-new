import type {
  NormalizedPenpotDocument,
  NormalizedPenpotNode,
  PenpotDocument,
  PenpotLayer
} from "@/lib/server/design/penpot/penpot-types";

export function normalizePenpotDocument(document: PenpotDocument): NormalizedPenpotDocument {
  return {
    assetInventory: document.assets,
    componentInventory: document.components,
    frameTree: document.pages.flatMap((page) =>
      page.frames.map((frame) => ({
        children: frame.layers.map(normalizeLayer),
        id: frame.id,
        name: frame.name,
        pageId: page.id
      }))
    ),
    id: document.id,
    name: document.name,
    pageTree: document.pages.map((page) => ({
      frameIds: page.frames.map((frame) => frame.id),
      id: page.id,
      name: page.name
    })),
    styleInventory: document.styles
  };
}

function normalizeLayer(layer: PenpotLayer): NormalizedPenpotNode {
  return {
    children: layer.children.map(normalizeLayer),
    id: layer.id,
    name: layer.name,
    role: layer.type,
    text: layer.text
  };
}
