function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type WebsiteImageAttachmentIntent = "asset_replacement" | "design_reference" | "unresolved";

export function classifyWebsiteImageAttachmentIntent(prompt: string): WebsiteImageAttachmentIntent {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const image = /\b(?:image|photo|picture|banner|visual|asset|screenshot)\b/i;
  const designUse =
    /\b(?:redesign|restyle|retheme|rebuild)\b[\s\S]{0,80}\b(?:from|like|match|using|based on)\b[\s\S]{0,50}\b(?:image|photo|picture|banner|visual|screenshot)\b/i.test(normalized) ||
    /\b(?:use|treat)\b[\s\S]{0,50}\b(?:image|photo|picture|banner|visual|screenshot)\b[\s\S]{0,60}\b(?:as|for)\b[\s\S]{0,30}\b(?:design reference|visual reference|style reference|design direction)\b/i.test(normalized) ||
    /\b(?:match|derive|extract|take)\b[\s\S]{0,50}\b(?:style|design|palette|colors?|typography|layout|visual language)\b[\s\S]{0,50}\b(?:from|of|to)\b[\s\S]{0,30}\b(?:image|photo|picture|banner|visual|screenshot|this)\b/i.test(normalized);
  if (designUse) return "design_reference";

  const placementTarget = /\b(?:hero|header|banner|background|gallery|section|card|thumbnail)\b/i.test(normalized);
  const placementAction = /\b(?:use|replace|set|put|place|change|swap)\b/i.test(normalized);
  const preserveDesign = /\b(?:do not|don't|dont|without)\b[\s\S]{0,36}\b(?:redesign|restyle|change (?:the )?(?:design|layout|style)|alter (?:the )?(?:design|layout|style))\b|\b(?:preserve|keep)\b[\s\S]{0,40}\b(?:design|layout|style|rest of (?:the )?(?:site|website))\b/i.test(normalized);
  if (image.test(normalized) && placementTarget && placementAction) return "asset_replacement";
  if (image.test(normalized) && preserveDesign) return "asset_replacement";
  return "unresolved";
}

export function boundedAssetEditDrift(changes: Array<{ path?: string | null }>) {
  const forbidden = changes
    .map((change) => change.path ?? "")
    .filter((path) => path && (
      /^DESIGN\.md$/i.test(path) ||
      /^styles\.css$/i.test(path) ||
      /^(?:about|contact|products|services|pricing|blog)\.html$/i.test(path)
    ));
  return forbidden.length
    ? `ASSET_EDIT_DESIGN_DRIFT: bounded asset replacement attempted unrelated changes: ${forbidden.join(", ")}.`
    : null;
}

export function replaceWebsiteSectionImage(input: {
  alt: string;
  assetPath: string;
  html: string;
  section: "hero";
}) {
  const normalizedPath = input.assetPath.replace(/^\.\//, "");
  const source = escapeAttribute(`./${normalizedPath}`);
  const alt = escapeAttribute(input.alt);
  const sectionPattern = /<section\b[^>]*class=["'][^"']*\bhero\b[^"']*["'][^>]*>[\s\S]*?<\/section>/i;
  const section = input.html.match(sectionPattern)?.[0];
  if (!section) return { changed: false, html: input.html };
  const imagePattern = /<img\b[^>]*>/i;
  const image = section.match(imagePattern)?.[0];
  const nextSection = image
    ? section.replace(imagePattern, (tag) => {
        const cleaned = tag
          .replace(/\s+data-(?:media-provider|fallback-src|media-fallback-state)=["'][^"']*["']/gi, "")
          .replace(/\s+srcset=["'][^"']*["']/gi, "");
        const withSource = /\bsrc=["'][^"']*["']/i.test(cleaned)
          ? cleaned.replace(/\bsrc=["'][^"']*["']/i, `src="${source}"`)
          : cleaned.replace(/<img\b/i, `<img src="${source}"`);
        return /\balt=["'][^"']*["']/i.test(withSource)
          ? withSource.replace(/\balt=["'][^"']*["']/i, `alt="${alt}"`)
          : withSource.replace(/<img\b/i, `<img alt="${alt}"`);
      })
    : section.replace(/<\/section>/i, `<figure class="media-frame hero-media"><img src="${source}" alt="${alt}" loading="eager" decoding="async"></figure>\n</section>`);
  const cleanedSection = nextSection
    .replace(/data-media-provider=["'][^"']*["']/gi, 'data-media-provider="user-upload"')
    .replace(/data-media-reliability=["'][^"']*["']/gi, 'data-media-reliability="approved"')
    .replace(/\s*<p\b[^>]*class=["'][^"']*\bmedia-credit\b[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, "");
  let html = input.html.replace(section, cleanedSection);
  html = html.replace(/(<meta\b[^>]*property=["']og:image["'][^>]*content=)["'][^"']*["']/i, `$1"${source}"`);
  html = html.replace(/(<meta\b[^>]*name=["']twitter:image["'][^>]*content=)["'][^"']*["']/i, `$1"${source}"`);
  return { changed: html !== input.html, html };
}
