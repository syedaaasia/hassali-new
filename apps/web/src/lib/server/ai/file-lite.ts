export type FileLiteIntent =
  | "cleaned_preview_request"
  | "data_quality_check"
  | "file_unavailable_explanation"
  | "large_data_workflow_guidance"
  | "pasted_csv_analysis"
  | "pasted_table_cleanup"
  | "pasted_text_summary"
  | "unsupported_ocr_request"
  | "unsupported_url_request"
  | "wrong_mode_save_request";

type ParsedTable = {
  delimiter: "," | "\t" | "|";
  headers: string[];
  rows: string[][];
};

type TableIssue = {
  description: string;
  row?: number;
  total?: number;
};

const importantBlankHeaders = /^(?:email|e-mail|mail|price|amount|id|name|status|phone|mobile|contact|date)$/i;
const formulaRisk = /^[=+\-@]/;
const maxIssues = 20;
const defaultPreviewRows = 20;
const maxPromptChars = 24000;

export function classifyFileLiteIntent(prompt: string): FileLiteIntent | null {
  if (isUnsupportedUrlRequest(prompt)) return "unsupported_url_request";
  if (isUnsupportedOcrRequest(prompt)) return "unsupported_ocr_request";
  if (isUnsupportedFileRequest(prompt)) return "file_unavailable_explanation";
  if (isLargeUnseenDataPrompt(prompt)) return "large_data_workflow_guidance";

  const table = detectPastedTable(prompt);

  if (!table) {
    return isPastedTextSummary(prompt) ? "pasted_text_summary" : null;
  }

  if (/\b(?:save|write|store)\b[\s\S]{0,80}\b(?:file|workspace|project|disk|csv)\b/i.test(prompt)) {
    return "wrong_mode_save_request";
  }

  if (/\b(?:clean|preview|show me the cleaned|show preview)\b/i.test(prompt)) {
    return table.delimiter === "|" ? "pasted_table_cleanup" : "cleaned_preview_request";
  }

  return table.delimiter === "|" ? "pasted_table_cleanup" : "pasted_csv_analysis";
}

export function createFileLiteAnswer(prompt: string): string | null {
  if (isUnsupportedUrlRequest(prompt)) {
    return "Live URL reading is not available in FILE-I1 Lite. Paste the page content here and I can summarize it.";
  }

  if (isUnsupportedOcrRequest(prompt)) {
    return "OCR/image reading is not available in FILE-I1 Lite. Paste the visible text here and I can help.";
  }

  if (isUnsupportedFileRequest(prompt)) {
    return createUnsupportedFileAnswer(prompt);
  }

  if (isLargeUnseenDataPrompt(prompt)) {
    return createLargeDataWorkflow(prompt);
  }

  const table = detectPastedTable(prompt);

  if (table) {
    return createTableAnswer(prompt, table);
  }

  return null;
}

function isUnsupportedUrlRequest(prompt: string) {
  return /\bhttps?:\/\/\S+/i.test(prompt) &&
    /\b(?:open|read|visit|fetch|check|summarize|summarise|analyze|analyse|clean)\b/i.test(prompt) &&
    !detectPastedTable(prompt);
}

function isUnsupportedOcrRequest(prompt: string) {
  if (isPastedTextSummary(prompt)) {
    return false;
  }

  return /\b(?:screenshot|image|photo|ocr)\b/i.test(prompt) &&
    /\b(?:read|extract|summarize|summarise|analyze|analyse)\b/i.test(prompt);
}

function isUnsupportedFileRequest(prompt: string) {
  return /\b(?:uploaded|attached|my|the)\s+(?:excel|xlsx|pdf|file|document|contract)\b/i.test(prompt) &&
    /\b(?:read|clean|summarize|summarise|analyze|analyse|extract|open)\b/i.test(prompt) &&
    !detectPastedTable(prompt);
}

function isPastedTextSummary(prompt: string) {
  const text = extractPastedText(prompt);

  return /\b(?:summarize|summarise|summary)\b/i.test(prompt) && text.split(/\s+/).length >= 25;
}

function isLargeUnseenDataPrompt(prompt: string) {
  return /\b(?:large|very large|\d{3,}[\w\s]{0,30}\b(?:rows|records)|\d{4,}|50,000|50000)\b/i.test(prompt) &&
    /\b(?:csv|rows|records|dataset|spreadsheet)\b/i.test(prompt) &&
    !detectPastedTable(prompt);
}

function createUnsupportedFileAnswer(prompt: string) {
  if (/\b(?:excel|xlsx)\b/i.test(prompt)) {
    return "I cannot read the uploaded Excel file content in FILE-I1 Lite yet. Export it as CSV or paste the rows here, and I can help clean, summarize, or check the data.";
  }

  if (/\bpdf|contract\b/i.test(prompt)) {
    return "I cannot read uploaded PDF content in FILE-I1 Lite yet. Paste the contract text here and I can summarize it.";
  }

  return "I cannot read uploaded file content in FILE-I1 Lite yet. Paste the text or CSV rows here and I can help analyze them.";
}

function createLargeDataWorkflow(prompt: string) {
  const mentionsRealEstate = /\breal estate|property|commercial\b/i.test(prompt);

  return [
    "I cannot process unseen large data from a description alone. Use this safe workflow:",
    "",
    "1. Make a backup copy of the original file before touching anything.",
    "2. Record the starting row count and column list.",
    "3. Split or chunk the CSV if it is too large to inspect comfortably.",
    "4. Run exact-duplicate checks first, then review near-duplicates manually.",
    "5. Keep blanks explicit. For missing prices, write `price unknown` instead of leaving a silent empty cell.",
    mentionsRealEstate ? "6. Separate commercial records into a clearly labeled group before final export." : "6. Keep a separate issue log for rows that need manual review.",
    "7. Verify row counts before and after every cleanup step.",
    "8. Save one clearly labeled final clean copy and keep the issue log beside it."
  ].join("\n");
}

function extractPastedText(prompt: string) {
  const doubleBreak = prompt.match(/\n\s*\n([\s\S]+)$/);

  if (doubleBreak?.[1]) return doubleBreak[1].trim();

  const colon = prompt.indexOf(":");
  return colon >= 0 ? prompt.slice(colon + 1).trim() : prompt.trim();
}

function detectPastedTable(prompt: string): ParsedTable | null {
  if (prompt.length > maxPromptChars) {
    return parsePromptTable(prompt.slice(0, maxPromptChars));
  }

  return parsePromptTable(prompt);
}

function parsePromptTable(prompt: string): ParsedTable | null {
  const text = extractPastedText(prompt);
  const delimiter = inferDelimiter(text);

  if (!delimiter) return null;

  const parsed = delimiter === "|" ? parsePipeTable(text) : parseDelimited(text, delimiter);

  if (!parsed || parsed.length < 2) return null;

  const headers = parsed[0].map((header) => header.trim());

  if (headers.length < 2 || headers.some((header) => header === "")) return null;

  const rows = parsed
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""));

  if (rows.length === 0) return null;

  return { delimiter, headers, rows };
}

function inferDelimiter(text: string): "," | "\t" | "|" | null {
  const firstLines = text.split(/\r?\n/).slice(0, 6).filter((line) => line.trim());
  const first = firstLines[0] ?? "";

  if (first.includes("\t")) return "\t";
  if (first.includes("|")) return "|";
  if (first.includes(",")) return ",";

  return null;
}

function parseDelimited(text: string, delimiter: "," | "\t") {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((items) => items.some((item) => item.trim() !== ""));
}

function parsePipeTable(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\|?\s*-{2,}/.test(line))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim())
    );
}

function createTableAnswer(prompt: string, table: ParsedTable) {
  const wantsPreview = /\b(?:clean|preview|show me the cleaned|show preview|save)\b/i.test(prompt);
  const wantsSave = /\b(?:save|write|store)\b[\s\S]{0,80}\b(?:file|workspace|project|disk|csv)\b/i.test(prompt);
  const analysis = analyzeTable(table);
  const lines: string[] = [];

  lines.push(`Detected pasted ${table.delimiter === "|" ? "table" : table.delimiter === "\t" ? "TSV" : "CSV"} data.`);
  lines.push(`Rows: ${table.rows.length} data row(s). Columns: ${table.headers.length}.`);

  if (wantsSave) {
    lines.push("ASK mode can show a cleaned preview, but FILE-I1 Lite will not save or modify files in your workspace.");
  } else if (wantsPreview) {
    lines.push("Preview only: nothing was saved or written.");
  }

  if (analysis.issues.length) {
    lines.push("");
    lines.push(`Issues found (${Math.min(maxIssues, analysis.issues.length)} of ${analysis.issues.length} shown):`);
    for (const issue of analysis.issues.slice(0, maxIssues)) {
      lines.push(`- ${issue.description}`);
    }
  } else {
    lines.push("");
    lines.push("No exact duplicate rows, important blank cells, or formula-risk cells were detected in the pasted rows.");
  }

  lines.push("");
  lines.push("Suggested cleanup steps:");
  lines.push("- Keep a backup of the original pasted data.");
  lines.push("- Resolve important blanks instead of guessing hidden values.");
  lines.push("- Remove exact duplicates only after confirming the duplicate rows are truly redundant.");
  lines.push("- Verify row counts before and after cleanup.");

  if (wantsPreview) {
    lines.push("");
    lines.push("Cleaned preview:");
    lines.push("```csv");
    lines.push(formatPreview(table, analysis.duplicateRowIndexes));
    lines.push("```");
  }

  return lines.join("\n");
}

function analyzeTable(table: ParsedTable) {
  const issues: TableIssue[] = [];
  const duplicateRowIndexes = new Set<number>();
  const seen = new Map<string, number>();

  table.rows.forEach((row, rowIndex) => {
    const normalizedRow = normalizeRow(row, table.headers.length);
    const key = JSON.stringify(normalizedRow.map((cell) => cell.trim().toLowerCase()));
    const firstSeen = seen.get(key);

    if (firstSeen !== undefined) {
      duplicateRowIndexes.add(rowIndex);
      issues.push({
        description: `Duplicate row: row ${rowIndex + 2} matches row ${firstSeen + 2}.`
      });
    } else {
      seen.set(key, rowIndex);
    }

    normalizedRow.forEach((cell, columnIndex) => {
      const header = table.headers[columnIndex] ?? `Column ${columnIndex + 1}`;
      const value = cell.trim();

      if (value === "" && importantBlankHeaders.test(header)) {
        issues.push({
          description: `Blank ${header} in row ${rowIndex + 2}${rowLabel(table, normalizedRow)}.`
        });
      }

      if (value && formulaRisk.test(value)) {
        issues.push({
          description: `Formula-risk value in ${header}, row ${rowIndex + 2}: starts with "${value.charAt(0)}".`
        });
      }
    });
  });

  return { duplicateRowIndexes, issues };
}

function rowLabel(table: ParsedTable, row: string[]) {
  const nameIndex = table.headers.findIndex((header) => /^name$/i.test(header));
  const name = nameIndex >= 0 ? row[nameIndex]?.trim() : "";

  return name ? ` (${name})` : "";
}

function normalizeRow(row: string[], length: number) {
  return Array.from({ length }, (_, index) => row[index] ?? "");
}

function escapeCsvCell(cell: string) {
  const safeCell = formulaRisk.test(cell.trim()) ? `'${cell}` : cell;

  if (/[",\n\r]/.test(safeCell)) {
    return `"${safeCell.replace(/"/g, "\"\"")}"`;
  }

  return safeCell;
}

function formatPreview(table: ParsedTable, duplicateRowIndexes: Set<number>) {
  const rows = [
    table.headers,
    ...table.rows.filter((_, index) => !duplicateRowIndexes.has(index)).slice(0, defaultPreviewRows)
  ];

  return rows
    .map((row) => normalizeRow(row, table.headers.length).map(escapeCsvCell).join(","))
    .join("\n");
}
