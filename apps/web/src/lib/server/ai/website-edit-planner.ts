import type { WebsiteEditContext } from "@/lib/server/ai/website-edit-context";
import type { WebsiteEditIntent } from "@/lib/server/ai/website-edit-intent";
import { inferSemanticDomain } from "@/lib/server/ai/industry-taxonomy";
import {
  buildWebsiteSceneBlueprint,
  type WebsitePalette
} from "@/lib/server/ai/website-quality-blueprint";
import {
  renderWebsiteSceneFiles,
  renderWebsiteSceneScriptTags,
  renderWebsiteSceneSection
} from "@/lib/server/ai/website-scene-renderer";
import { buildWebsiteCinematicExperience } from "@/lib/server/ai/website-cinematic-sequence-spec";
import {
  renderWebsiteCinematicFiles,
  renderWebsiteCinematicScriptTags,
  renderWebsiteCinematicSection
} from "@/lib/server/ai/website-cinematic-sequence-renderer";

export type WebsiteEditPlanChange = {
  action?: "delete_file" | "write_file";
  content?: string;
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

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function replaceBrand(
  content: string,
  context: WebsiteEditContext,
  businessName: string,
  htmlContext = false
) {
  let next = content;
  const replacement = htmlContext ? escapeHtmlText(businessName) : businessName;
  const candidates = unique([
    context.brandName ?? "",
    context.displayName ?? ""
  ]);

  for (const candidate of candidates) {
    next = next.replace(new RegExp(escapeRegExp(candidate), "g"), replacement);
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

  const selectedPalette = /--bg\s*:/i.test(next)
    ? {
        "--accent": palette["--color-accent"],
        "--accent-alt": palette["--color-primary"],
        "--bg": palette["--color-bg"],
        "--border": palette["--color-border"],
        "--ink": palette["--color-text"],
        "--muted": palette["--color-muted"],
        "--surface": palette["--color-surface"]
      }
    : palette;

  for (const [name, value] of Object.entries(selectedPalette)) {
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
  return { action: "write_file", content, path, summary };
}

function deleteChange(path: string, summary: string): WebsiteEditPlanChange {
  return { action: "delete_file", path, summary };
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function refreshPage(content: string, context: WebsiteEditContext, intent: WebsiteEditIntent, page: string, replacement: boolean) {
  const brand = context.brandName ?? context.displayName ?? "This business";
  const domain = titleCase((context.domainId ?? "business").replace(/_/g, " "));
  const productFocused = page === "home" && /\bproduct[- ]focused\b/i.test(intent.originalPrompt);
  const buyingPhilosophy = page === "about" && /\b(?:buying philosophy|installation support|how (?:we|you) choose)\b/i.test(intent.originalPrompt);
  const heading = productFocused && /electronics|television|tv/i.test(context.domainId ?? "")
    ? "Find the right screen for your room"
    : buyingPhilosophy
      ? "A clearer way to choose home technology"
      : page === "home" ? brand : `${titleCase(page)} at ${brand}`;
  const lede = page === "about"
      ? buyingPhilosophy
        ? `${brand} starts with the room, viewing habits, and practical tradeoffs, then supports delivery, mounting, setup, and the questions that follow installation.`
      : `Learn about ${brand}, its ${domain.toLowerCase()} focus, and the standards behind its work.`
    : page === "home"
      ? productFocused && /electronics|television|tv/i.test(context.domainId ?? "")
        ? "Compare OLED, Mini-LED, QLED, gaming, and installation options by room, screen size, and viewing priorities."
        : `${brand} offers clear, practical ${domain.toLowerCase()} information for customers.`
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
    const links = context.navLinks
      .filter((link) => !link.href.startsWith("#") && !link.href.startsWith("mailto:") && !link.href.startsWith("tel:"))
      .slice(0, 6);
    const navigation = links.length
      ? links.map((link) => `<li><a href="${link.href}">${link.label}</a></li>`).join("")
      : '<li><a href="./index.html">Home</a></li>';
    const contactLink = links.find((link) => /contact/i.test(`${link.label} ${link.href}`));
    const footer = `<footer class="site-footer" data-hassali-scope="section-edit" aria-label="Site footer">
      <div class="footer-brand"><p class="eyebrow">${domain}</p><h2>${brand}</h2><p>Clear product guidance, practical support, and a direct way to continue the conversation.</p></div>
      <div><h2>Navigation</h2><ul>${navigation}</ul></div>
      <div><h2>Customer support</h2><ul><li>Buying guidance</li><li>Installation planning</li><li>Delivery questions</li></ul></div>
      <div><h2>Product categories</h2><ul><li>OLED and premium screens</li><li>Bright-room televisions</li><li>Gaming and audio</li></ul></div>
      ${contactLink ? `<div><h2>Contact</h2><p><a href="${contactLink.href}">${contactLink.label}</a></p></div>` : ""}
      <div class="footer-bottom"><span>&copy; <span data-current-year></span> ${brand}</span></div>
    </footer>`;
    return /<footer\b[\s\S]*?<\/footer>/i.test(content)
      ? content.replace(/<footer\b[\s\S]*?<\/footer>/i, footer)
      : content.replace(/<\/body>/i, `${footer}\n</body>`);
  }

  const className = section === "navigation" || section === "navbar" ? "nav" : section.replace(/_/g, "-");
  const pattern = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*)>`, "i");
  return content.replace(pattern, `<$1$2 data-hassali-scope="section-edit">`);
}

function addOrRefreshCarousel(content: string, context: WebsiteEditContext) {
  if (/data-carousel\b/i.test(content)) {
    return content.replace(/(<div\b[^>]*class=["'][^"']*carousel[^"']*["'][^>]*)(>)/i, '$1 data-hassali-scope="carousel-edit"$2');
  }

  const domain = titleCase((context.domainId ?? "products").replace(/_/g, " "));
  const labels = /electronics|television|tv/i.test(context.domainId ?? "")
    ? ["OLED cinema", "Mini-LED bright room", "Gaming 120Hz", "QLED everyday"]
    : ["Featured option one", "Featured option two", "Featured option three", "Featured option four"];
  const section = `<section class="content-section" aria-labelledby="featured-products-title" data-hassali-scope="carousel-edit">
    <div class="section-heading"><p class="eyebrow">Featured products</p><h2 id="featured-products-title">Explore featured ${domain.toLowerCase()}</h2><p>Use the controls or arrow keys to compare featured options.</p></div>
    <div class="carousel" data-carousel tabindex="0" aria-label="Featured products carousel"><div class="carousel-track" data-carousel-track>${labels.map((label, index) => `<article class="carousel-slide entity-card" data-carousel-slide aria-label="${index + 1} of ${labels.length}"><div class="entity-art art-${(index % 4) + 1}" aria-hidden="true">${label}</div><h3>${label}</h3><p>Compare the design, fit, and practical differences before choosing.</p></article>`).join("")}</div><div class="carousel-controls"><button class="icon-button" type="button" data-carousel-prev aria-label="Previous item">&#8592;</button><p class="carousel-status" aria-live="polite" data-carousel-status>1 / ${labels.length}</p><button class="icon-button" type="button" data-carousel-next aria-label="Next item">&#8594;</button></div></div>
  </section>`;

  return content.replace(/<\/main>/i, `${section}\n</main>`);
}

function addCarouselCss(content: string) {
  if (/\.carousel\s*\{/i.test(content)) return content;
  return `${content.trimEnd()}\n\n.carousel { overflow: hidden; }\n.carousel-track { display: flex; gap: 1rem; transition: transform .35s ease; touch-action: pan-y; }\n.carousel-slide { flex: 0 0 min(31rem, 82vw); }\n.carousel-controls { display: flex; justify-content: flex-end; align-items: center; gap: .8rem; margin-top: 1rem; }\n`;
}

function addCarouselJs(content: string) {
  if (/data-carousel-prev/i.test(content)) return content;
  return `${content.trimEnd()}\n\ndocument.querySelectorAll("[data-carousel]").forEach((carousel) => {\n  const track = carousel.querySelector("[data-carousel-track]");\n  const slides = Array.from(carousel.querySelectorAll("[data-carousel-slide]"));\n  const status = carousel.querySelector("[data-carousel-status]");\n  let index = 0;\n  let startX = 0;\n  const update = () => { const width = slides[0]?.getBoundingClientRect().width ?? 0; if (track instanceof HTMLElement) track.style.transform = "translateX(-" + (index * (width + 16)) + "px)"; if (status) status.textContent = (index + 1) + " / " + slides.length; };\n  const move = (step) => { index = (index + step + slides.length) % Math.max(slides.length, 1); update(); };\n  carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => move(-1));\n  carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => move(1));\n  carousel.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); });\n  carousel.addEventListener("pointerdown", (event) => { startX = event.clientX; }, { passive: true });\n  carousel.addEventListener("pointerup", (event) => { const distance = event.clientX - startX; if (Math.abs(distance) > 48) move(distance > 0 ? -1 : 1); }, { passive: true });\n  update();\n});\n`;
}

function removeWebglHtml(content: string) {
  return content
    .replace(/\s*<section\b[^>]*class=["'][^"']*\bscene-section\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, "")
    .replace(/\s*<script\b[^>]*src=["']\.\/scene\.js["'][^>]*><\/script>/gi, "")
    .replace(/\s*<canvas\b[^>]*data-webgl-canvas[^>]*><\/canvas>/gi, "")
    .replace(/\s*<canvas\b[^>]*data-webgl-canvas[^>]*\/?>/gi, "")
    .replace(/data-experience-engine=["']procedural_webgl["']/gi, 'data-experience-engine="standard_html"')
    .replace(/data-webgl=["']enabled["']/gi, 'data-webgl="disabled"')
    .replace(/data-3d-requirement=["'](?:allowed|required)["']/gi, 'data-3d-requirement="forbidden"')
    .replace(/data-scene-recipe=["'][^"']+["']/gi, 'data-scene-recipe="none"');
}

function removeWebglJs(content: string) {
  const start = content.indexOf('  const stage = document.querySelector("[data-webgl-stage]");');
  const end = content.lastIndexOf("\n})();");
  return start >= 0 && end > start ? `${content.slice(0, start).trimEnd()}\n${content.slice(end)}` : content;
}

function removeWebglCss(content: string) {
  return content
    .replace(/\.hero-stage > img,\s*\.hero-stage canvas/g, ".hero-stage > img")
    .replace(/^\.hero-stage canvas \{[^\n]*\}\s*$/gim, "")
    .replace(/^\.hero-stage\.is-webgl-ready canvas \{[^\n]*\}\s*$/gim, "")
    .replace(/^\.hero-stage\.is-webgl-ready > img \{[^\n]*\}\s*$/gim, "");
}

function removeCinematicHtml(content: string) {
  return content
    .replace(/\s*<section\b[^>]*class=["'][^"']*\bcinematic-sequence\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, "")
    .replace(/\s*<script\b[^>]*src=["']\.\/sequence(?:-manifest)?\.js["'][^>]*><\/script>/gi, "")
    .replace(/data-experience-engine=["']frame_sequence["']/gi, 'data-experience-engine="standard_html"')
    .replace(/data-cinematic=["']enabled["']/gi, 'data-cinematic="disabled"')
    .replace(/data-cinematic-requirement=["'](?:allowed|required)["']/gi, 'data-cinematic-requirement="forbidden"');
}

function cssVariable(content: string, name: string, fallback: string) {
  return content.match(new RegExp(`${escapeRegExp(name)}\\s*:\\s*([^;]+);`, "i"))?.[1]?.trim() ?? fallback;
}

function existingPalette(files: Record<string, string>): WebsitePalette {
  const styles = files["styles.css"] ?? "";
  return {
    accent: cssVariable(styles, "--accent", "#5f7a61"),
    accentAlt: cssVariable(styles, "--accent-alt", "#334f44"),
    background: cssVariable(styles, "--bg", "#f7f7f4"),
    border: cssVariable(styles, "--border", "rgba(31, 41, 36, 0.14)"),
    ink: cssVariable(styles, "--ink", "#17201c"),
    muted: cssVariable(styles, "--muted", "#647068"),
    surface: cssVariable(styles, "--surface", "#ffffff")
  };
}

function setBodyData(content: string, name: string, value: string) {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}=["'][^"']*["']`, "i");
  if (pattern.test(content)) return content.replace(pattern, `${name}="${value}"`);
  return content.replace(/<body\b([^>]*)>/i, `<body$1 ${name}="${value}">`);
}

function ensureScriptTag(content: string, tags: string) {
  const missing = tags
    .split("\n")
    .filter((tag) => {
      const source = tag.match(/src=["']([^"']+)["']/i)?.[1];
      return source && !content.includes(`src="${source}"`) && !content.includes(`src='${source}'`);
    })
    .join("\n");
  return missing ? content.replace(/<\/body>/i, `${missing}\n</body>`) : content;
}

function insertExperienceSection(content: string, markup: string, target: string | undefined) {
  const sections = Array.from(content.matchAll(/<section\b[\s\S]*?<\/section>/gi));
  if (sections.length === 0) return content.replace(/<\/main>/i, `${markup}\n</main>`);
  const keyword = target?.replace(/_explainer$/, "").replace(/_/g, " ");
  const selected =
    target === "second_section" ? sections[1] :
    target === "hero" ? sections[0] :
    keyword ? sections.find((match) => match[0].toLowerCase().includes(keyword)) :
    sections[0];
  if (!selected || selected.index === undefined) return content.replace(/<\/main>/i, `${markup}\n</main>`);
  const insertAt = selected.index + selected[0].length;
  return `${content.slice(0, insertAt)}\n${markup}${content.slice(insertAt)}`;
}

function markExperienceEngine(markup: string, engine: "frame_sequence" | "procedural_webgl") {
  return markup.replace("<section ", `<section data-experience-engine="${engine}" `);
}

function requiredFilesWith(context: WebsiteEditContext, additions: string[], removals: string[] = []) {
  const removed = new Set(removals);
  return unique([...context.requiredFiles.filter((path) => !removed.has(path)), ...additions]).join(", ");
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
      const next = replaceBrand(files[path] ?? "", context, intent.extractedValues.businessName, true);
      if (next !== files[path]) changes.push(change(path, next, "Updates visible brand/business name."));
    }

    const renamedContract = replaceBrand(hassali, context, intent.extractedValues.businessName);
    const updatedContract = updateHassali(renamedContract, {
      "brand/app/site name": intent.extractedValues.businessName,
      brandNameConfirmed: "true",
      brandNameProvenance: "USER_SUPPLIED"
    }).replace(
      /^-\s+\*\*Brand Name Provenance:\*\*.*$/im,
      "- **Brand Name Provenance:** USER_SUPPLIED"
    );
    changes.push(change(contractPath, updatedContract, contractSummary));
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

  if (intent.editType === "add_carousel") {
    const nextHtml = addOrRefreshCarousel(files["index.html"] ?? "", context);
    if (nextHtml !== files["index.html"]) changes.push(change("index.html", nextHtml, "Adds or refreshes the accessible featured-products carousel on the homepage."));
    if (files["styles.css"]) {
      const nextCss = addCarouselCss(files["styles.css"]);
      if (nextCss !== files["styles.css"]) changes.push(change("styles.css", nextCss, "Adds responsive carousel layout only when missing."));
    }
    if (files["main.js"]) {
      const nextJs = addCarouselJs(files["main.js"]);
      if (nextJs !== files["main.js"]) changes.push(change("main.js", nextJs, "Adds carousel arrows, keyboard navigation, and swipe support only when missing."));
    }
  }

  if (intent.editType === "set_webgl") {
    const semantic = inferSemanticDomain(`${context.domainId ?? ""} ${intent.originalPrompt}`);
    const palette = existingPalette(files);
    const scene = buildWebsiteSceneBlueprint({
      cinematicSequenceRequired: Boolean(files["sequence.js"]),
      domainId: context.domainId ?? semantic.canonicalDomain,
      palette,
      profile: { businessType: semantic.label },
      projectName: context.brandName ?? context.displayName ?? semantic.label,
      prompt: intent.originalPrompt,
      semantic
    });
    if (!scene.spec.enabled) {
      return {
        blockedReason: "The WebGL edit was explicit, but a valid semantic scene specification could not be produced.",
        changes: [],
        mode: "blocked",
        preserved: [`domainId=${context.domainId ?? "unknown"}`, `pages=${context.requestedPages.join("/") || "existing"}`],
        summary: "Website WebGL transition blocked before changing project files.",
        targetFiles: intent.targetFiles
      };
    }
    const renderContext = {
      brand: { generatedName: context.brandName ?? context.displayName ?? semantic.label, palette },
      scene
    };
    const transitioningFromCinematic = /\b(?:replace|turn|convert)\b[^.!?;]{0,80}\b(?:cinematic|frame sequence)\b[^.!?;]{0,80}\b(?:webgl|3d)\b/i.test(intent.originalPrompt);
    let nextHtml = removeWebglHtml(files["index.html"] ?? "");
    if (transitioningFromCinematic) nextHtml = removeCinematicHtml(nextHtml);
    nextHtml = setBodyData(nextHtml, "data-webgl", "enabled");
    nextHtml = setBodyData(nextHtml, "data-3d-requirement", "required");
    nextHtml = setBodyData(nextHtml, "data-scene-recipe", scene.recipe);
    nextHtml = insertExperienceSection(
      nextHtml,
      markExperienceEngine(renderWebsiteSceneSection(renderContext), "procedural_webgl"),
      intent.extractedValues.experienceSectionTarget
    );
    nextHtml = ensureScriptTag(nextHtml, renderWebsiteSceneScriptTags(renderContext));
    changes.push(change("index.html", nextHtml, "Adds the semantic WebGL explainer at the requested section while preserving the remaining page."));
    for (const [path, content] of Object.entries(renderWebsiteSceneFiles(renderContext))) {
      changes.push(change(path, content, `Creates the ${path === "scene.js" ? "procedural WebGL runtime" : "designed static scene fallback"} for the requested edit.`));
    }
    if (transitioningFromCinematic) {
      for (const path of ["sequence.js", "sequence-manifest.js"]) {
        if (files[path]) changes.push(deleteChange(path, `Deletes obsolete cinematic runtime file ${path} after the engine transition.`));
      }
    }
    const nextContract = updateHassali(hassali, {
      requiredFiles: requiredFilesWith(
        context,
        ["scene.js", scene.fallback.asset],
        transitioningFromCinematic ? ["sequence.js", "sequence-manifest.js"] : []
      ),
      sceneDependencies: "Three.js ES module loaded by scene.js",
      webglPolicy: `enabled by explicit edit with ${scene.recipe} and a designed fallback`,
      ...(transitioningFromCinematic
        ? { cinematicPolicy: "replaced by explicit WebGL edit", cinematicSourceAssets: "none" }
        : {})
    });
    if (nextContract !== files[contractPath]) changes.push(change(contractPath, nextContract, contractSummary));
  }

  if (intent.editType === "set_cinematic") {
    const semantic = inferSemanticDomain(`${context.domainId ?? ""} ${intent.originalPrompt}`);
    const cinematic = buildWebsiteCinematicExperience({
      assets: Object.entries(files)
        .filter(([path]) => /\.(?:avif|jpe?g|png|webp)$/i.test(path))
        .map(([path, content]) => ({ content, path })),
      businessType: semantic.label,
      capabilities: semantic.capabilities,
      prompt: `${intent.originalPrompt} Use the selected image sequence as cinematic playback.`
    });
    const existingSection = (files["index.html"] ?? "").match(/<section\b[^>]*class=["'][^"']*\bcinematic-sequence\b[^"']*["'][^>]*>[\s\S]*?<\/section>/i)?.[0];
    if (!cinematic.enabled && !existingSection) {
      return {
        blockedReason: "The cinematic edit requires a usable numbered image sequence, but no sequence frames were available in this website workspace.",
        changes: [],
        mode: "blocked",
        preserved: [`domainId=${context.domainId ?? "unknown"}`, `pages=${context.requestedPages.join("/") || "existing"}`],
        summary: "Website cinematic transition blocked before changing project files.",
        targetFiles: intent.targetFiles
      };
    }
    const renderContext = {
      brand: { tagline: context.creativeDirection?.visualArchetype ?? semantic.label },
      business: { businessType: semantic.label },
      cinematic
    };
    const transitioningFromWebgl = /\b(?:replace|turn|convert)\b[^.!?;]{0,80}\b(?:webgl|3d)\b[^.!?;]{0,80}\b(?:cinematic|frame sequence)\b/i.test(intent.originalPrompt);
    let nextHtml = removeCinematicHtml(files["index.html"] ?? "");
    if (transitioningFromWebgl) nextHtml = removeWebglHtml(nextHtml);
    nextHtml = setBodyData(nextHtml, "data-cinematic", "enabled");
    nextHtml = setBodyData(nextHtml, "data-cinematic-requirement", "required");
    const section = cinematic.enabled
      ? renderWebsiteCinematicSection(renderContext, cinematic.sequences[0]?.id)
      : existingSection ?? "";
    nextHtml = insertExperienceSection(
      nextHtml,
      markExperienceEngine(section, "frame_sequence"),
      intent.extractedValues.experienceSectionTarget
    );
    if (cinematic.enabled) nextHtml = ensureScriptTag(nextHtml, renderWebsiteCinematicScriptTags(renderContext));
    else nextHtml = ensureScriptTag(nextHtml, '    <script src="./sequence-manifest.js" defer></script>\n    <script src="./sequence.js" defer></script>');
    changes.push(change("index.html", nextHtml, "Places the cinematic sequence at the requested section while preserving unrelated website content."));
    if (cinematic.enabled) {
      for (const [path, content] of Object.entries(renderWebsiteCinematicFiles(renderContext))) {
        changes.push(change(path, content, `Creates the bounded cinematic ${path === "sequence.js" ? "runtime" : "manifest"} for the requested edit.`));
      }
    }
    if (transitioningFromWebgl && files["scene.js"]) {
      changes.push(deleteChange("scene.js", "Deletes the obsolete WebGL runtime after the cinematic transition."));
    }
    const nextContract = updateHassali(hassali, {
      cinematicPolicy: "enabled by explicit section edit with reduced-motion and static-frame fallback",
      cinematicSourceAssets: cinematic.enabled
        ? cinematic.sequences.flatMap((sequence) => sequence.sourceFrames).join(", ")
        : "existing sequence manifest",
      requiredFiles: requiredFilesWith(
        context,
        ["sequence.js", "sequence-manifest.js"],
        transitioningFromWebgl ? ["scene.js"] : []
      ),
      ...(transitioningFromWebgl
        ? { sceneDependencies: "none", webglPolicy: "replaced by explicit cinematic edit" }
        : {})
    });
    if (nextContract !== files[contractPath]) changes.push(change(contractPath, nextContract, contractSummary));
  }

  if (intent.editType === "remove_webgl") {
    for (const path of htmlFiles(context)) {
      const next = removeWebglHtml(files[path] ?? "");
      if (next !== files[path]) changes.push(change(path, next, `Removes the WebGL canvas from ${path} while preserving fallback artwork.`));
    }
    if (files["styles.css"]) {
      const nextCss = removeWebglCss(files["styles.css"]);
      if (nextCss !== files["styles.css"]) changes.push(change("styles.css", nextCss, "Removes WebGL-only selectors while preserving the static hero visual."));
    }
    if (files["main.js"]) {
      const nextJs = removeWebglJs(files["main.js"]);
      if (nextJs !== files["main.js"]) changes.push(change("main.js", nextJs, "Removes WebGL initialization and animation lifecycle code."));
    }
    if (files["scene.js"]) changes.push(deleteChange("scene.js", "Deletes the obsolete procedural WebGL runtime after approval."));
    const nextContract = updateHassali(hassali, {
      requiredFiles: context.requiredFiles.filter((path) => path !== "scene.js").join(", "),
      sceneDependencies: "none",
      webglPolicy: "disabled by explicit user edit; static fallback preserved"
    });
    if (nextContract !== files[contractPath]) changes.push(change(contractPath, nextContract, contractSummary));
  }

  if (intent.editType === "remove_cinematic" || intent.editType === "remove_motion") {
    for (const path of htmlFiles(context)) {
      let next = removeCinematicHtml(files[path] ?? "");
      if (intent.editType === "remove_motion") next = removeWebglHtml(next);
      if (next !== files[path]) changes.push(change(path, next, `Removes obsolete ${intent.editType === "remove_motion" ? "cinematic and WebGL" : "cinematic"} mounts and script references from ${path}.`));
    }
    for (const path of ["sequence.js", "sequence-manifest.js"]) {
      if (files[path]) changes.push(deleteChange(path, `Deletes obsolete cinematic runtime file ${path} after approval.`));
    }
    if (intent.editType === "remove_motion" && files["scene.js"]) {
      changes.push(deleteChange("scene.js", "Deletes the obsolete procedural WebGL runtime after approval."));
    }
    const nextContract = updateHassali(hassali, {
      cinematicPolicy: "disabled by explicit user edit; representative static content preserved",
      cinematicSourceAssets: "none",
      requiredFiles: context.requiredFiles.filter((path) =>
        !["sequence.js", "sequence-manifest.js", ...(intent.editType === "remove_motion" ? ["scene.js"] : [])].includes(path)
      ).join(", "),
      ...(intent.editType === "remove_motion"
        ? { sceneDependencies: "none", webglPolicy: "disabled by explicit user edit; static fallback preserved" }
        : {})
    });
    if (nextContract !== files[contractPath]) changes.push(change(contractPath, nextContract, contractSummary));
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
      changes.push(change(path, refreshPage(current, context, intent, page, intent.editType === "page_replacement"), `Refreshes only ${path} and preserves all other website files.`));
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
  const finalChanges = [...deduped.values()].filter((item) =>
    item.action === "delete_file"
      ? typeof context.files[item.path] === "string"
      : Boolean(item.content?.trim().length) && item.content !== context.files[item.path]
  );

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
