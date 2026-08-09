import type {
  PDFDocumentLoadingTask,
  RenderParameters,
  TextItem,
  TextMarkedContent
} from "pdfjs-dist/types/src/display/api";
import {
  DocumentProcessingError,
  documentProcessingLimits,
  type DocumentBlock,
  type DocumentConfidence,
  type DocumentPage,
  type DocumentTable,
  type DocumentTableCell
} from "./document-contract";

type PositionedText = {
  height: number;
  text: string;
  width: number;
  x: number;
  y: number;
};

type NativePdfPage = {
  imageCount: number | null;
  pageNumber: number;
  page: DocumentPage;
  quality: NativeTextQuality;
  renderedImage?: Uint8Array;
};

export type NativeTextQuality = {
  confidence: DocumentConfidence;
  printableRatio: number;
  replacementCharacterRatio: number;
  usable: boolean;
  wordCount: number;
};

function confidenceCell(text: string, confidence: DocumentConfidence): DocumentTableCell {
  const numericRisk = /(?:^|\s)[OIlSB](?:[\d.,]|$)|[\d][OIlSB][\d]|\d[,.]\s*$/.test(text);
  return {
    confidence: numericRisk ? "low" : confidence,
    text,
    uncertain: numericRisk || confidence === "low" || confidence === "unknown"
  };
}

export function assessNativeTextQuality(text: string): NativeTextQuality {
  const trimmed = text.trim();
  if (!trimmed) {
    return { confidence: "low", printableRatio: 0, replacementCharacterRatio: 0, usable: false, wordCount: 0 };
  }
  const characters = [...trimmed];
  const printable = characters.filter((character) => character === "\n" || character === "\t" || character.codePointAt(0)! >= 32).length;
  const replacements = characters.filter((character) => character === "\uFFFD" || character === "\u0000").length;
  const words = trimmed.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const printableRatio = printable / Math.max(1, characters.length);
  const replacementCharacterRatio = replacements / Math.max(1, characters.length);
  const repetitiveGarbage = /(.{1,4})\1{8,}/u.test(trimmed);
  const usable = printableRatio >= 0.88 && replacementCharacterRatio <= 0.02 && !repetitiveGarbage && (words.length >= 4 || trimmed.length >= 32);
  const confidence: DocumentConfidence = !usable
    ? "low"
    : printableRatio >= 0.98 && replacementCharacterRatio === 0 && words.length >= 12
      ? "high"
      : "medium";
  return { confidence, printableRatio, replacementCharacterRatio, usable, wordCount: words.length };
}

function blockKind(text: string, height: number): DocumentBlock["kind"] {
  const trimmed = text.trim();
  if (/^(?:[-*•]|\d+[.)])\s+/.test(trimmed)) return "list";
  if (/^[\p{L}\d][\p{L}\d &'’():/-]{1,90}:?$/u.test(trimmed) && (height >= 13 || /^[A-Z\d\s&/-]{4,}$/.test(trimmed))) {
    return "heading";
  }
  if (/^[\p{L}][\p{L}\s/()-]{1,50}:\s+\S/u.test(trimmed)) return "form_field";
  return "paragraph";
}

function rowsByPosition(items: PositionedText[]) {
  const rows = new Map<number, PositionedText[]>();
  for (const item of items) {
    const key = Math.round(item.y / 3) * 3;
    const row = rows.get(key) ?? [];
    row.push(item);
    rows.set(key, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, row]) => row.sort((a, b) => a.x - b.x));
}

function positionedTable(rows: PositionedText[][], pageNumber: number, confidence: DocumentConfidence): DocumentTable[] {
  const candidates = rows.filter((row) => row.length >= 2 && row.length <= 12);
  if (candidates.length < 2) return [];
  const countFrequency = new Map<number, number>();
  candidates.forEach((row) => countFrequency.set(row.length, (countFrequency.get(row.length) ?? 0) + 1));
  const [columnCount, frequency] = [...countFrequency.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  if (columnCount < 2 || frequency < 2) return [];
  const matching = candidates.filter((row) => row.length === columnCount).slice(0, 100);
  const stableColumns = matching.every((row) => row.every((cell, index) => {
    const anchor = matching[0]?.[index]?.x ?? cell.x;
    return Math.abs(cell.x - anchor) <= 28;
  }));
  if (!stableColumns) return [];
  const cells = matching.map((row) => row.map((item) => confidenceCell(item.text.trim(), confidence)));
  if (cells.flat().length > documentProcessingLimits.maxTableCells) return [];
  return [{
    confidence: confidence === "high" ? "medium" : confidence,
    headers: cells[0] ?? [],
    id: `p${pageNumber}-table-1`,
    pageNumber,
    rows: cells.slice(1),
    structureUncertain: confidence === "low" || confidence === "unknown"
  }];
}

function pageFromItems(items: PositionedText[], pageNumber: number): DocumentPage {
  const rows = rowsByPosition(items);
  const lines = rows.map((row) => row.map((item) => item.text.trim()).filter(Boolean).join(" ").trim()).filter(Boolean);
  const text = lines.join("\n").slice(0, documentProcessingLimits.maxPageCharacters);
  const quality = assessNativeTextQuality(text);
  const blocks = lines.map((line, index): DocumentBlock => {
    const sourceRow = rows[index] ?? [];
    const first = sourceRow[0];
    return {
      bounds: first ? {
        height: Math.max(...sourceRow.map((item) => item.height), 0),
        width: sourceRow.reduce((sum, item) => sum + item.width, 0),
        x: first.x,
        y: first.y
      } : undefined,
      confidence: quality.confidence,
      id: `p${pageNumber}-block-${index + 1}`,
      kind: blockKind(line, first?.height ?? 0),
      pageNumber,
      text: line
    };
  });
  const tables = positionedTable(rows, pageNumber, quality.confidence);
  return {
    blocks,
    confidence: quality.confidence,
    extractionMethod: "native",
    pageNumber,
    tables,
    text,
    warnings: quality.usable ? [] : ["Native text on this page is missing or unreliable."]
  };
}

export async function extractNativePdfPages(bytes: Uint8Array, options: { renderWeakPages?: boolean } = {}): Promise<{
  pages: NativePdfPage[];
  pageCount: number;
}> {
  if (bytes.byteLength > documentProcessingLimits.maxFileBytes) {
    throw new DocumentProcessingError("document-too-large", "The document exceeds the bounded reader limit.");
  }
  let loadingTask: PDFDocumentLoadingTask | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0
    });
    const pdf = await loadingTask.promise;
    if (pdf.numPages > documentProcessingLimits.maxPages) {
      throw new DocumentProcessingError("page-limit-exceeded", `PDFs are limited to ${documentProcessingLimits.maxPages} pages.`);
    }
    const pages: NativePdfPage[] = [];
    let renderedWeakPageCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({ disableNormalization: false, includeMarkedContent: false });
      const items = textContent.items.flatMap((item: TextItem | TextMarkedContent): PositionedText[] => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [{
          height: Math.abs(item.height ?? item.transform?.[3] ?? 0),
          text: item.str,
          width: Math.abs(item.width ?? 0),
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0
        }];
      });
      const nativePage = pageFromItems(items, pageNumber);
      const quality = assessNativeTextQuality(nativePage.text);
      let renderedImage: Uint8Array | undefined;
      if (options.renderWeakPages && !quality.usable && renderedWeakPageCount < documentProcessingLimits.maxOcrPages) {
        const { createCanvas } = await import("@napi-rs/canvas");
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.max(0.5, Math.sqrt(documentProcessingLimits.maxPageRenderPixels / Math.max(1, baseViewport.width * baseViewport.height))));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        const canvasContext = canvas.getContext("2d");
        const renderParameters = {
          background: "rgb(255, 255, 255)",
          canvas,
          canvasContext,
          viewport
        } as unknown as RenderParameters;
        await page.render(renderParameters).promise;
        renderedImage = new Uint8Array(canvas.toBuffer("image/png"));
        renderedWeakPageCount += 1;
      }
      pages.push({
        imageCount: null,
        page: nativePage,
        pageNumber,
        quality,
        renderedImage
      });
      page.cleanup();
    }
    return { pageCount: pdf.numPages, pages };
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    const name = error instanceof Error ? error.name : "";
    if (/PasswordException/i.test(name)) {
      throw new DocumentProcessingError("password-protected", "This PDF is password-protected and cannot be read without access.");
    }
    throw new DocumentProcessingError("corrupt-document", "This PDF could not be read safely.");
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

export function parseDelimitedTable(text: string, delimiter: "," | "\t" | "|") {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function tableFromDelimitedText(text: string, pageNumber = 1): DocumentTable | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter: "," | "\t" | "|" = firstLine.includes("\t") ? "\t" : firstLine.includes("|") ? "|" : ",";
  const rows = parseDelimitedTable(text, delimiter).filter((row) => row.some(Boolean));
  if (rows.length < 2) return null;
  const columnCount = rows[0]!.length;
  const stable = rows.every((row) => row.length === columnCount);
  const cells = rows.slice(0, 200).map((row) => row.map((text) => confidenceCell(text, "high")));
  return {
    confidence: stable ? "high" : "low",
    headers: cells[0] ?? [],
    id: `p${pageNumber}-table-1`,
    pageNumber,
    rows: stable ? cells.slice(1) : [],
    structureUncertain: !stable
  };
}
