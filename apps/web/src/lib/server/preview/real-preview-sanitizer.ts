const eventHandlerPattern = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const scriptPattern = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const dangerousUrlPattern = /\b(?:javascript|data):/gi;
const remoteScriptPattern = /<script\b[^>]*\bsrc\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')[^>]*>\s*<\/script>/gi;
const remoteIframePattern = /<iframe\b[^>]*\bsrc\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')[^>]*>[\s\S]*?<\/iframe>/gi;
const remoteImagePattern = /<img\b[^>]*\bsrc\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')[^>]*>/gi;

export function sanitizePreviewText(value: unknown, fallback = "Preview item") {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value
    .replace(/[<>]/g, "")
    .replace(dangerousUrlPattern, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

export function sanitizePreviewList(values: unknown, fallback: string[]) {
  if (!Array.isArray(values)) {
    return fallback;
  }

  const cleaned = values
    .map((value) => sanitizePreviewText(value, ""))
    .filter(Boolean)
    .slice(0, 8);

  return cleaned.length > 0 ? cleaned : fallback;
}

export function escapePreviewHtml(value: unknown) {
  return sanitizePreviewText(value, "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitizeStaticPreviewHtml(html: string) {
  return html
    .replace(scriptPattern, "")
    .replace(remoteScriptPattern, "")
    .replace(remoteIframePattern, "")
    .replace(remoteImagePattern, "")
    .replace(eventHandlerPattern, "")
    .replace(dangerousUrlPattern, "");
}

function testPreviewPattern(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

export function hasDangerousPreviewMarkup(value: string) {
  return (
    testPreviewPattern(scriptPattern, value) ||
    testPreviewPattern(eventHandlerPattern, value) ||
    testPreviewPattern(dangerousUrlPattern, value) ||
    testPreviewPattern(remoteScriptPattern, value) ||
    testPreviewPattern(remoteIframePattern, value)
  );
}
