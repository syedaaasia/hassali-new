export type StaticPreviewVisualQAElement = {
  clientWidth: number;
  complete?: boolean;
  height: number;
  interactive: boolean;
  naturalHeight?: number;
  naturalWidth?: number;
  role: "heading" | "image" | "navigation" | "other";
  scrollWidth: number;
  selector: string;
  visible: boolean;
  width: number;
  x: number;
  y: number;
};

export type StaticPreviewVisualQAObservation = {
  documentHeight: number;
  documentWidth: number;
  elements: StaticPreviewVisualQAElement[];
  page: string;
  viewportHeight: number;
  viewportWidth: number;
};

export type StaticPreviewVisualQADiagnostic = {
  code: string;
  message: string;
  path: string;
  reference: string | null;
  severity: "blocking" | "warning";
};

export function evaluateStaticPreviewVisualQA(
  observation: StaticPreviewVisualQAObservation
): StaticPreviewVisualQADiagnostic[] {
  const diagnostics: StaticPreviewVisualQADiagnostic[] = [];
  const add = (diagnostic: StaticPreviewVisualQADiagnostic) => {
    if (!diagnostics.some((candidate) => candidate.code === diagnostic.code && candidate.reference === diagnostic.reference)) {
      diagnostics.push(diagnostic);
    }
  };

  if (observation.documentWidth > observation.viewportWidth + 1) {
    add({
      code: "VISUAL_HORIZONTAL_OVERFLOW",
      message: `Rendered page width ${observation.documentWidth}px exceeds the ${observation.viewportWidth}px Preview viewport.`,
      path: observation.page,
      reference: "html",
      severity: "blocking"
    });
  }

  observation.elements.filter((element) => element.visible).forEach((element) => {
    if (element.x < -1 || element.x + element.width > observation.viewportWidth + 1) {
      add({
        code: "VISUAL_ELEMENT_OFFSCREEN",
        message: `${element.selector} is partly outside the rendered Preview viewport.`,
        path: observation.page,
        reference: element.selector,
        severity: element.role === "other" ? "warning" : "blocking"
      });
    }
    if (element.scrollWidth > element.clientWidth + 1) {
      add({
        code: "VISUAL_CONTENT_OVERFLOW",
        message: `${element.selector} contains content wider than its rendered box.`,
        path: observation.page,
        reference: element.selector,
        severity: element.role === "heading" || element.role === "navigation" ? "blocking" : "warning"
      });
    }
    if (element.role === "image" && (element.complete === false || element.naturalWidth === 0 || element.naturalHeight === 0)) {
      add({
        code: "VISUAL_IMAGE_BROKEN",
        message: `${element.selector} did not decode into a usable image.`,
        path: observation.page,
        reference: element.selector,
        severity: "blocking"
      });
    }
    if (element.interactive && (element.width < 40 || element.height < 40)) {
      add({
        code: "VISUAL_TARGET_SMALL",
        message: `${element.selector} renders at ${Math.round(element.width)}x${Math.round(element.height)}px and may be difficult to use by touch.`,
        path: observation.page,
        reference: element.selector,
        severity: "warning"
      });
    }
  });

  return diagnostics;
}
