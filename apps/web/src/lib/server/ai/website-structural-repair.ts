export type WebsiteStructuralDefect = {
  file: string;
  identity: string;
  occurrence: number;
  repairedIdentity: string;
  semanticRole: string;
  type: "broken_anchor" | "duplicate_html_id" | "duplicate_section_identity";
};

export type WebsiteStructuralRepairResult = {
  attempts: number;
  files: Record<string, string>;
  repairs: WebsiteStructuralDefect[];
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function roleFromTag(tag: string, fallback: string) {
  return slug(
    tag.match(/\bdata-section-role=["']([^"']+)["']/i)?.[1] ??
    tag.match(/\bdata-experience-engine=["']([^"']+)["']/i)?.[1] ??
    tag.match(/\bclass=["']([^"']+)["']/i)?.[1]?.split(/\s+/).find((value) => !/^(?:section|content-section|layout-|density-)/.test(value)) ??
    fallback
  ) || fallback;
}

function uniqueIdentity(base: string, role: string, used: Set<string>) {
  const prefix = base.replace(/-(?:trust|content|section|block|panel)(?:-\d+)?$/i, "");
  const candidateBase = slug(`${prefix}-${role}`) || slug(`${base}-section`);
  let candidate = candidateBase;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${candidateBase}-${suffix++}`;
  return candidate;
}

function repairDuplicateAttribute(input: {
  attribute: "data-section-id" | "id";
  content: string;
  file: string;
  repairs: WebsiteStructuralDefect[];
}) {
  const escapedAttribute = input.attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\s)${escapedAttribute}=(['"])([^'"]+)\\1`, "gi");
  const seen = new Set<string>();
  const occurrences = new Map<string, number>();
  let cursor = 0;
  let output = "";
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input.content)) !== null) {
    const identity = match[2] ?? "section";
    const key = identity.toLowerCase();
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }

    const tagStart = input.content.lastIndexOf("<", match.index);
    const tagEnd = input.content.indexOf(">", match.index);
    const tag = tagStart >= 0 && tagEnd >= 0 ? input.content.slice(tagStart, tagEnd + 1) : "";
    const semanticRole = roleFromTag(tag, input.attribute === "id" ? "section" : "content");
    const repairedIdentity = uniqueIdentity(identity, semanticRole, seen);
    const valueStart = match.index + match[0].lastIndexOf(identity);
    output += input.content.slice(cursor, valueStart) + repairedIdentity;
    cursor = valueStart + identity.length;
    seen.add(repairedIdentity.toLowerCase());
    input.repairs.push({
      file: input.file,
      identity,
      occurrence,
      repairedIdentity,
      semanticRole,
      type: input.attribute === "id" ? "duplicate_html_id" : "duplicate_section_identity"
    });
  }

  return output ? `${output}${input.content.slice(cursor)}` : input.content;
}

function editDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let diagonal = rows[0] ?? 0;
    rows[0] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const previous = rows[leftIndex] ?? 0;
      rows[leftIndex] = Math.min(
        (rows[leftIndex] ?? 0) + 1,
        (rows[leftIndex - 1] ?? 0) + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return rows[left.length] ?? Math.max(left.length, right.length);
}

function repairBrokenAnchors(file: string, content: string, repairs: WebsiteStructuralDefect[]) {
  const ids = Array.from(content.matchAll(/(?:^|\s)id=["']([^"']+)["']/gi), (match) => match[1] ?? "").filter(Boolean);
  const known = new Set(ids.map((value) => value.toLowerCase()));
  return content.replace(/href=(['"])#([^'"]+)\1/gi, (reference, quote: string, target: string) => {
    if (known.has(target.toLowerCase())) return reference;
    const candidates = ids
      .map((identity) => ({ distance: editDistance(target.toLowerCase(), identity.toLowerCase()), identity }))
      .filter((candidate) => candidate.distance <= 2)
      .sort((left, right) => left.distance - right.distance || left.identity.localeCompare(right.identity));
    if (candidates.length !== 1) return reference;
    const repairedIdentity = candidates[0]!.identity;
    repairs.push({ file, identity: target, occurrence: 1, repairedIdentity, semanticRole: "anchor", type: "broken_anchor" });
    return `href=${quote}#${repairedIdentity}${quote}`;
  });
}

export function repairGeneratedWebsiteStructure(
  inputFiles: Record<string, string>,
  maxAttempts = 2
): WebsiteStructuralRepairResult {
  const files = { ...inputFiles };
  const repairs: WebsiteStructuralDefect[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt < Math.max(1, Math.min(2, maxAttempts)); attempt += 1) {
    const before = repairs.length;
    for (const [file, original] of Object.entries(files)) {
      if (!file.toLowerCase().endsWith(".html")) continue;
      let content = repairDuplicateAttribute({ attribute: "id", content: original, file, repairs });
      content = repairDuplicateAttribute({ attribute: "data-section-id", content, file, repairs });
      content = repairBrokenAnchors(file, content, repairs);
      files[file] = content;
    }
    attempts = attempt + 1;
    if (repairs.length === before) break;
  }

  return { attempts, files, repairs };
}
