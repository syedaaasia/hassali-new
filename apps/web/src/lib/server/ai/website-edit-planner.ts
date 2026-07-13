import type { WebsiteEditContext } from "@/lib/server/ai/website-edit-context";
import type { WebsiteEditIntent } from "@/lib/server/ai/website-edit-intent";

export type WebsiteEditPlanChange = {
  content: string;
  path: string;
  summary: string;
};

export type WebsiteEditPlan = {
  blockedReason?: string;
  changes: WebsiteEditPlanChange[];
  mode: "blocked" | "planned";
  preserved: string[];
  summary: string;
  targetFiles: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function htmlFiles(context: WebsiteEditContext) {
  return context.canonicalPagePaths.filter((path) => typeof context.files[path] === "string");
}

function pageToPath(page: string) {
  return page === "home" || page === "index" || page === "homepage" ? "index.html" : `${page}.html`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setOrAppendContractLine(content: string, key: string, value: string) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*.*$`, "im");

  if (pattern.test(content)) {
    return content.replace(pattern, `${key}: ${value}`);
  }

  return `${content.trimEnd()}\n${key}: ${value}\n`;
}

function updateCreativeDirection(content: string, line: string) {
  if (/##\s+Creative Direction/i.test(content)) {
    return content.replace(/(##\s+Creative Direction[\s\S]*?)(?=\n##\s+|\s*$)/i, (section) => {
      if (/-\s*Section rhythm:/i.test(section) && /^-\s*Section rhythm:/i.test(line)) {
        return section.replace(/-\s*Section rhythm:.*$/im, line);
      }

      if (/-\s*Palette:/i.test(section) && /^-\s*Palette:/i.test(line)) {
        return section.replace(/-\s*Palette:.*$/im, line);
      }

      if (/-\s*Visual archetype:/i.test(section) && /^-\s*Visual archetype:/i.test(line)) {
        return section.replace(/-\s*Visual archetype:.*$/im, line);
      }

      return `${section.trimEnd()}\n${line}\n`;
    });
  }

  return `${content.trimEnd()}\n\n## Creative Direction\n\n${line}\n`;
}

function updateHassali(content: string, updates: Record<string, string>) {
  let next = content || "# HASSALI.md\n\nProject contract owned by Hassali.ai.\n";

  for (const [key, value] of Object.entries(updates)) {
    next = setOrAppendContractLine(next, key, value);
  }

  return next;
}

const phoneTextPattern = /(?:\+\d[\d\s().-]{6,}\d|\b(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b)/g;

function telValue(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function isInsideHtmlTag(content: string, index: number) {
  const lastOpen = content.lastIndexOf("<", index);
  const lastClose = content.lastIndexOf(">", index);

  return lastOpen > lastClose;
}

function replaceVisiblePhoneText(content: string, phone: string) {
  return content.replace(phoneTextPattern, (match, offset: number) =>
    isInsideHtmlTag(content, offset) ? match : phone
  );
}

function replacePhoneAnchors(content: string, phone: string) {
  const href = `tel:${telValue(phone)}`;

  return content.replace(/<a\b([^>]*href=["']tel:[^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi, (anchor, attributes) => {
    const nextAttributes = String(attributes).replace(/href=["']tel:[^"']+["']/i, `href="${href}"`);

    return `<a${nextAttributes}>${phone}</a>`;
  });
}

function websiteContractBase(context: WebsiteEditContext) {
  return `# ${context.contractPath}

mode: WEBSITE
Project Type: WEBSITE
domainId: ${context.domainId ?? "unknown"}
requestedPages: ${context.requestedPages.join(", ")}
requiredFiles: ${context.requiredFiles.join(", ")}
exactPageCount: ${context.exactPageCount ?? context.requestedPages.length}
Preview Type: static_website
previewPolicy: static srcDoc only

Current WEBSITE files are the source of truth for WEBSITE edits.
`;
}

function replaceKnownContact(content: string, context: WebsiteEditContext, values: WebsiteEditIntent["extractedValues"]) {
  let next = content;

  if (values.phone) {
    next = replacePhoneAnchors(next, values.phone);
    next = replaceVisiblePhoneText(next, values.phone);
    next = next.replace(/href=["']tel:[^"']+["']/gi, `href="tel:${telValue(values.phone)}"`);
  }

  if (values.email) {
    const oldEmail = context.existingContact?.email;
    if (oldEmail) next = next.replace(new RegExp(escapeRegExp(oldEmail), "g"), values.email);
    next = next.replace(/href=["']mailto:[^"']+["']/gi, `href="mailto:${values.email}"`);
  }

  if (values.address) {
    const oldAddress = context.existingContact?.address;
    if (oldAddress) next = next.replace(new RegExp(escapeRegExp(oldAddress), "g"), values.address);
  }

  return next;
}

function contactBlock(values: WebsiteEditIntent["extractedValues"]) {
  return [
    values.phone ? `<p><a href="tel:${telValue(values.phone)}">${values.phone}</a></p>` : "",
    values.email ? `<p><a href="mailto:${values.email}">${values.email}</a></p>` : "",
    values.address ? `<p>${values.address}</p>` : ""
  ].filter(Boolean).join("\n");
}

function insertContactIfMissing(content: string, values: WebsiteEditIntent["extractedValues"]) {
  const block = contactBlock(values);

  if (!block) return content;
  if ((values.phone && content.includes(values.phone)) || (values.email && content.includes(values.email)) || (values.address && content.includes(values.address))) {
    return content;
  }

  if (/\bclass=["'][^"']*contact-details[^"']*["']/i.test(content)) {
    return content.replace(/(<div\b[^>]*class=["'][^"']*contact-details[^"']*["'][^>]*>)/i, `$1\n${block}`);
  }

  const wrapped = `<div class="contact-details">\n${block}\n</div>`;

  if (/<footer\b[^>]*>/i.test(content)) {
    return content.replace(/<\/footer>/i, `${wrapped}\n</footer>`);
  }

  if (/<\/body>/i.test(content)) {
    return content.replace(/<\/body>/i, `${wrapped}\n</body>`);
  }

  return `${content}\n${wrapped}\n`;
}

function dedupePhoneContactDetails(content: string, phone: string) {
  const normalizedPhone = telValue(phone);
  let phoneBlockCount = 0;

  return content.replace(/<div\b[^>]*class=["'][^"']*contact-details[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, (block) => {
    if (!block.includes(`tel:${normalizedPhone}`) && !block.includes(phone)) {
      return block;
    }

    phoneBlockCount += 1;
    return phoneBlockCount === 1 ? block : "";
  });
}

function replaceBrand(content: string, context: WebsiteEditContext, businessName: string) {
  let next = content;
  const candidates = unique([
    context.brandName ?? "",
    context.displayName ?? ""
  ]);

  for (const candidate of candidates) {
    next = next.replace(new RegExp(escapeRegExp(candidate), "g"), businessName);
  }

  return next;
}

function updateCssForStyle(content: string, intent: WebsiteEditIntent, context: WebsiteEditContext) {
  const text = `${intent.extractedValues.styleIntent ?? ""} ${intent.extractedValues.colorIntent ?? ""}`.toLowerCase();
  let next = content;
  const palette = text.includes("blue")
    ? {
        "--color-bg": "#f6fbff",
        "--color-surface": "#ffffff",
        "--color-surface-alt": "#eaf4ff",
        "--color-text": "#102033",
        "--color-muted": "#5f7288",
        "--color-primary": "#1d6fd6",
        "--color-primary-dark": "#124a93",
        "--color-accent": "#73b7ff",
        "--color-border": "rgba(29, 111, 214, 0.18)"
      }
    : text.includes("gold") || text.includes("luxury") || text.includes("premium")
      ? {
          "--color-bg": "#130f0a",
          "--color-surface": "#1e1710",
          "--color-surface-alt": "#2b2116",
          "--color-text": "#fff7e8",
          "--color-muted": "#cbbda3",
          "--color-primary": "#c79a45",
          "--color-primary-dark": "#8a6124",
          "--color-accent": "#efd28a",
          "--color-border": "rgba(239, 210, 138, 0.22)"
        }
      : text.includes("darker") || text.includes("dark")
        ? {
            "--color-bg": "#0f1114",
            "--color-surface": "#171a1f",
            "--color-surface-alt": "#222730",
            "--color-text": "#f7f1e8",
            "--color-muted": "#b7aea1",
            "--color-primary": "#a8743f",
            "--color-primary-dark": "#6d4726",
            "--color-accent": "#d9b26f",
            "--color-border": "rgba(217, 178, 111, 0.2)"
          }
        : {
            "--color-bg": "#20140e",
            "--color-surface": "#2a1a12",
            "--color-surface-alt": "#3a281d",
            "--color-text": "#fff5e5",
            "--color-muted": "#d6c2a7",
            "--color-primary": "#b98546",
            "--color-primary-dark": "#76502c",
            "--color-accent": "#e7bd78",
            "--color-border": "rgba(231, 189, 120, 0.22)"
          };

  for (const [name, value] of Object.entries(palette)) {
    const pattern = new RegExp(`${escapeRegExp(name)}\\s*:\\s*[^;]+;`, "i");
    next = pattern.test(next)
      ? next.replace(pattern, `${name}: ${value};`)
      : next.replace(/:root\s*{/, `:root {\n  ${name}: ${value};`);
  }

  if ((intent.editType === "hero_style" || text.includes("hero")) && !/\.hero\b[\s\S]{0,240}linear-gradient/i.test(next)) {
    next += `\n\n.hero {\n  background: linear-gradient(135deg, var(--color-bg), var(--color-surface-alt));\n}\n`;
  }

  if (text.includes("luxury") && context.domainId === "upholstery") {
    next += `\n/* Luxury upholstery edit: warmer craft contrast with walnut, cream, muted gold, and fabric texture cues. */\n`;
  }

  return next;
}

function replaceCta(content: string, cta: string) {
  return content.replace(/(<a\b[^>]*class=["'][^"']*(?:btn|cta|button)[^"']*["'][^>]*>)([\s\S]*?)(<\/a>)/gi, `$1${cta}$3`);
}

function addTestimonials(content: string, context: WebsiteEditContext) {
  if (/\bclass=["'][^"']*testimonials/i.test(content)) return content;

  const label = context.domainId === "dental_clinic" ? "Clinic patient" :
    context.domainId === "real_estate" ? "Property seller" :
    context.domainId === "florist" ? "Event client" :
    "Local customer";
  const section = `
<section class="testimonials" aria-label="Customer testimonials">
  <p class="eyebrow">Customer feedback</p>
  <h2>Trusted by local customers</h2>
  <div class="testimonial-grid">
    <article>
      <p>"Clear communication, careful work, and a result that felt personal to our space."</p>
      <strong>${label}</strong>
    </article>
    <article>
      <p>"The team made the process simple, practical, and easy to trust."</p>
      <strong>Homeowner</strong>
    </article>
  </div>
</section>
`;

  if (/<section\b[^>]*class=["'][^"']*(?:cta|contact|estimate)[^"']*["']/i.test(content)) {
    return content.replace(/<section\b([^>]*class=["'][^"']*(?:cta|contact|estimate)[^"']*["'][^>]*)>/i, `${section}\n<section$1>`);
  }

  return content.replace(/<\/main>/i, `${section}\n</main>`);
}

function testimonialsCss(content: string) {
  if (/\.testimonials\b/i.test(content)) return content;

  return `${content.trimEnd()}\n\n.testimonials {\n  padding: 72px clamp(20px, 5vw, 80px);\n  background: var(--color-surface-alt);\n}\n\n.testimonial-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\n  gap: 18px;\n}\n\n.testimonial-grid article {\n  border: 1px solid var(--color-border);\n  background: var(--color-surface);\n  border-radius: 8px;\n  padding: 22px;\n}\n`;
}

function updateServiceCopy(content: string, services: string[]) {
  if (!services.length) return content;

  const list = `<ul class="service-list">\n${services.map((service) => `  <li>${service}</li>`).join("\n")}\n</ul>`;

  if (/<ul\b[^>]*class=["'][^"']*service/i.test(content)) {
    return content.replace(/<ul\b[^>]*class=["'][^"']*service[^"']*["'][^>]*>[\s\S]*?<\/ul>/i, list);
  }

  if (/<section\b[^>]*class=["'][^"']*services/i.test(content)) {
    return content.replace(/(<section\b[^>]*class=["'][^"']*services[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<\/h2>)/i, `$1\n${list}`);
  }

  return `${content.trimEnd()}\n${list}\n`;
}

function change(path: string, content: string, summary: string): WebsiteEditPlanChange {
  return { content, path, summary };
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function refreshPage(content: string, context: WebsiteEditContext, page: string, replacement: boolean) {
  const brand = context.brandName ?? context.displayName ?? "This business";
  const domain = titleCase((context.domainId ?? "business").replace(/_/g, " "));
  const heading = page === "home" ? brand : `${titleCase(page)} at ${brand}`;
  const lede = page === "about"
    ? `Learn about ${brand}, its ${domain.toLowerCase()} focus, and the standards behind its work.`
    : page === "home"
      ? `${brand} offers clear, practical ${domain.toLowerCase()} information for customers.`
      : `Explore ${titleCase(page).toLowerCase()} information from ${brand}.`;
  let next = content;

  next = /<main\b/i.test(next)
    ? next.replace(/<main\b([^>]*)>/i, `<main$1 data-hassali-scope="${replacement ? "page-replacement" : "page-edit"}">`)
    : next;
  next = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(next)
    ? next.replace(/<h1\b([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${heading}</h1>`)
    : next;
  next = /<h1\b[^>]*>[\s\S]*?<\/h1>\s*<p\b[^>]*>[\s\S]*?<\/p>/i.test(next)
    ? next.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)\s*<p\b([^>]*)>[\s\S]*?<\/p>/i, `$1\n<p$2>${lede}</p>`)
    : next;

  return next;
}

function refreshSection(content: string, context: WebsiteEditContext, section: string) {
  const brand = context.brandName ?? context.displayName ?? "This business";
  const domain = titleCase((context.domainId ?? "business").replace(/_/g, " "));

  if (section === "footer") {
    let next = content.replace(/<footer\b([^>]*)>/i, '<footer$1 data-hassali-scope="section-edit" aria-label="Site footer">');
    const line = `<p class="footer-summary">${brand} · ${domain}</p>`;
    if (!next.includes("footer-summary")) next = next.replace(/<\/footer>/i, `${line}\n</footer>`);
    return next;
  }

  const className = section === "navigation" || section === "navbar" ? "nav" : section.replace(/_/g, "-");
  const pattern = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*)>`, "i");
  return content.replace(pattern, `<$1$2 data-hassali-scope="section-edit">`);
}

export function planWebsiteEdit(context: WebsiteEditContext, intent: WebsiteEditIntent): WebsiteEditPlan {
  if (!context.hasWebsiteFiles) {
    return {
      blockedReason: "I could not find an existing WEBSITE project to edit. Please generate a website first or select the project files.",
      changes: [],
      mode: "blocked",
      preserved: [],
      summary: "Website edit blocked: no existing website files were available.",
      targetFiles: []
    };
  }

  if (intent.shouldClarify) {
    return {
      blockedReason: intent.clarificationQuestion ?? "The website edit request needs clarification.",
      changes: [],
      mode: "blocked",
      preserved: [],
      summary: "Website edit blocked: edit intent was unclear.",
      targetFiles: []
    };
  }

  if (intent.editType === "unknown") {
    return {
      blockedReason: `Hassali recognized this as a ${intent.requestScope.replace(/_/g, " ")}, but that scoped transformation is not safely supported by the deterministic website edit planner yet.`,
      changes: [],
      mode: "blocked",
      preserved: [],
      summary: `Website ${intent.requestScope.replace(/_/g, " ")} recognized without treating it as an ambiguous edit.`,
      targetFiles: intent.targetFiles
    };
  }

  const changes: WebsiteEditPlanChange[] = [];
  const files = context.files;
  const contractPath = context.contractPath;
  const hassali = files[contractPath] ?? websiteContractBase(context);
  const contractSummary = contractPath === "HASSALI.website.md"
    ? "Updates WEBSITE metadata in HASSALI.website.md because HASSALI.md belongs to CODE."
    : "Updates website metadata in HASSALI.md.";

  if (intent.editType === "remove_page") {
    const page = intent.extractedValues.pageToRemove;
    const pageFile = page === "home" ? "index.html" : `${page}.html`;

    return {
      blockedReason: page === "contact"
        ? "Removing the contact page is blocked unless an alternative contact path is provided."
        : `Safe delete actions are not supported in this proposal path yet, so ${pageFile} was not removed.`,
      changes: [],
      mode: "blocked",
      preserved: [`domainId=${context.domainId ?? "unknown"}`, `pages=${context.requestedPages.join("/") || "existing"}`],
      summary: `Website edit blocked: cannot safely remove ${pageFile}.`,
      targetFiles: [pageFile, contractPath]
    };
  }

  if (intent.editType === "contact_info") {
    for (const path of htmlFiles(context)) {
      let next = replaceKnownContact(files[path] ?? "", context, intent.extractedValues);
      next = insertContactIfMissing(next, intent.extractedValues);
      if (intent.extractedValues.phone) {
        next = dedupePhoneContactDetails(next, intent.extractedValues.phone);
      }
      if (next !== files[path]) changes.push(change(path, next, "Updates contact details consistently."));
    }

    const updates: Record<string, string> = {};
    if (intent.extractedValues.phone) updates.phone = intent.extractedValues.phone;
    if (intent.extractedValues.email) updates.email = intent.extractedValues.email;
    if (intent.extractedValues.address) updates.address = intent.extractedValues.address;
    changes.push(change(contractPath, updateHassali(hassali, updates), contractSummary));
  }

  if (intent.editType === "business_name" && intent.extractedValues.businessName) {
    for (const path of htmlFiles(context)) {
      const next = replaceBrand(files[path] ?? "", context, intent.extractedValues.businessName);
      if (next !== files[path]) changes.push(change(path, next, "Updates visible brand/business name."));
    }

    changes.push(change(contractPath, updateHassali(hassali, {
      "brand/app/site name": intent.extractedValues.businessName
    }), contractSummary));
  }

  if ((intent.editType === "hero_style" || intent.editType === "color_palette") && files["styles.css"]) {
    const nextCss = updateCssForStyle(files["styles.css"], intent, context);
    changes.push(change("styles.css", nextCss, "Updates website visual style through CSS variables."));

    const palette = intent.editType === "hero_style" && intent.extractedValues.styleIntent?.includes("luxury")
      ? "- Visual archetype: Warm luxury craft studio"
      : "- Palette: darker, warmer, and more refined while preserving the existing domain";
    changes.push(change(contractPath, updateCreativeDirection(hassali, palette), "Updates Creative Direction notes."));
  }

  if (intent.editType === "cta_text" && intent.extractedValues.primaryCta) {
    for (const path of htmlFiles(context)) {
      const next = replaceCta(files[path] ?? "", intent.extractedValues.primaryCta);
      if (next !== files[path]) changes.push(change(path, next, "Updates repeated CTA text."));
    }

    changes.push(change(contractPath, updateHassali(hassali, {
      ctaPatterns: unique([intent.extractedValues.primaryCta, ...context.existingCtas.slice(0, 3)]).join(", ")
    }), contractSummary));
  }

  if (intent.editType === "add_testimonials") {
    changes.push(change("index.html", addTestimonials(files["index.html"] ?? "", context), "Adds a safe testimonials section to the home page."));
    if (files["styles.css"]) changes.push(change("styles.css", testimonialsCss(files["styles.css"]), "Adds lightweight testimonial styles."));
    changes.push(change(contractPath, updateCreativeDirection(hassali, "- Section rhythm: hero -> proof/services -> testimonials -> estimate CTA"), "Updates Creative Direction section rhythm."));
  }

  if (intent.editType === "service_copy") {
    const services = intent.extractedValues.services ?? [];
    if (files["services.html"]) {
      changes.push(change("services.html", updateServiceCopy(files["services.html"], services), "Updates service copy on services page."));
    }
    if (files["index.html"]) {
      changes.push(change("index.html", updateServiceCopy(files["index.html"], services), "Updates home page service summary."));
    }
    if (services.length) {
      changes.push(change(contractPath, updateHassali(hassali, {
        expectedVocabulary: services.join(", ")
      }), contractSummary));
    }
  }

  if ((intent.editType === "page_edit" || intent.editType === "page_replacement") && intent.extractedValues.pageTarget) {
    const page = intent.extractedValues.pageTarget;
    const path = pageToPath(page);
    if (!context.canonicalPagePaths.includes(path)) {
      return {
        blockedReason: `${path} is not an active page in the current website contract. Ask to add a new ${page} page or choose one of: ${context.canonicalPagePaths.join(", ")}.`,
        changes: [],
        mode: "blocked",
        preserved: [`domainId=${context.domainId ?? "unknown"}`, `pages=${context.requestedPages.join("/") || "existing"}`],
        summary: `Website page edit blocked: ${path} is obsolete or outside the active canonical page set.`,
        targetFiles: []
      };
    }
    const current = files[path];
    if (current) {
      changes.push(change(path, refreshPage(current, context, page, intent.editType === "page_replacement"), `Refreshes only ${path} and preserves all other website files.`));
    }
  }

  if (intent.editType === "section_edit" && intent.extractedValues.sectionTarget) {
    const section = intent.extractedValues.sectionTarget;
    for (const path of htmlFiles(context)) {
      const current = files[path] ?? "";
      if (section !== "footer" && path !== "index.html") continue;
      const next = refreshSection(current, context, section);
      if (next !== current) changes.push(change(path, next, `Updates only the ${section.replace(/_/g, " ")} section in ${path}.`));
    }
  }

  const deduped = new Map(changes.map((item) => [item.path, item]));
  const finalChanges = [...deduped.values()].filter((item) => item.content.trim().length > 0 && item.content !== context.files[item.path]);

  if (!finalChanges.length) {
    return {
      blockedReason: "Website edit produced no safe file changes.",
      changes: [],
      mode: "blocked",
      preserved: [`domainId=${context.domainId ?? "unknown"}`, `pages=${context.requestedPages.join("/") || "existing"}`],
      summary: "Website edit blocked: no file changes were needed or safe.",
      targetFiles: intent.targetFiles
    };
  }

  return {
    changes: finalChanges,
    mode: "planned",
    preserved: [
      `domainId=${context.domainId ?? "unknown"}`,
      `pages=${context.requestedPages.join("/") || "existing pages"}`,
      `creativeDirection=${context.creativeDirection?.visualArchetype ?? "preserved"}`
    ],
    summary: `Contract-aware website edit active. ${context.mixedModeConflict ? "Detected mixed workspace state. Using WEBSITE files as source of truth and ignoring CODE HASSALI.md for this WEBSITE edit. " : ""}Detected edit: ${intent.editType.replace(/_/g, " ")}. Target files: ${finalChanges.map((item) => item.path).join(", ")}. Preserved: domainId=${context.domainId ?? "unknown"}, pages=${context.requestedPages.join("/") || "existing pages"}.`,
    targetFiles: finalChanges.map((item) => item.path)
  };
}
