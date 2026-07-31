import type {
  WebsitePageBlueprint,
  WebsiteQualityBlueprint,
  WebsiteSectionBlueprint
} from "@/lib/server/ai/website-quality-blueprint";
import type { WebsiteMediaAsset } from "@/lib/server/ai/website-media-registry";
import {
  renderWebsiteSceneFiles,
  renderWebsiteSceneScriptTags,
  renderWebsiteSceneSection
} from "@/lib/server/ai/website-scene-renderer";
import {
  renderWebsiteCinematicCss,
  renderWebsiteCinematicFiles,
  renderWebsiteCinematicScriptTags,
  renderWebsiteCinematicSection
} from "@/lib/server/ai/website-cinematic-sequence-renderer";
import { experienceForSection } from "@/lib/server/ai/website-experience-composer";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function visitorReadyText(value: string) {
  return value
    .replace(/\baccurate and editable\b/gi, "clear and accurate")
    .replace(/\beditable clinician details\b/gi, "current clinician details")
    .replace(/\beditable sample pricing\b/gi, "illustrative pricing")
    .replace(/\beditable menu\b/gi, "current menu")
    .replace(/\beditable delivery policy\b/gi, "clear delivery guidance")
    .replace(/\beditable service areas\b/gi, "current service areas")
    .replace(/\beditable fit guidance\b/gi, "clear fit guidance")
    .replace(/\bprototype inventory\b/gi, "featured inventory")
    .replace(/\beditable samples?\b/gi, "representative examples")
    .replace(/\beditable placeholders?\b/gi, "representative details")
    .replace(/\bprototype content\b/gi, "representative content")
    .replace(/\bgenerated demo\b/gi, "website")
    .replace(/\bgenerated case studies\b/gi, "representative case studies")
    .replace(/\bgenerated properties\b/gi, "representative properties")
    .replace(/\bgenerated products\b/gi, "representative products")
    .replace(/\bgenerated model names\b/gi, "concept model names")
    .replace(/\bsample content\b/gi, "guidance")
    .replace(/\s+until\s+(?:the\s+)?(?:business|shop|restaurant|product owner|portfolio owner|agent)[^.]*\.?/gi, ".")
    .replace(/\bconfirm this detail before launch\.?/gi, "Ask about this detail when you get in touch.")
    .replace(/\breal contact and policy details should be supplied before launch\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function escapeVisitorText(value: string) {
  return escapeHtml(visitorReadyText(value));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function visitorHref(target: string) {
  if (/^(?:#|mailto:|tel:|https?:\/\/)/i.test(target)) return target;
  return `./${target.replace(/^\.?\//, "")}`;
}

function nav(blueprint: WebsiteQualityBlueprint, activePage: string) {
  return blueprint.pages.map((page) => `          <a ${page.name === activePage ? 'aria-current="page"' : ""} href="./${page.path}">${escapeHtml(page.name === "home" ? "Home" : page.name.replace(/[-_]/g, " "))}</a>`).join("\n");
}

function mediaFor(blueprint: WebsiteQualityBlueprint, role: WebsiteMediaAsset["role"], index = 0, semanticText = "") {
  const exactMatches = blueprint.media.filter((asset) => asset.role === role);
  if (role !== "card") return exactMatches[index] ?? null;
  if (exactMatches.length > 0) {
    const normalizedText = semanticText.toLowerCase();
    return exactMatches.find((asset) => asset.semanticTags.some((tag) => normalizedText.includes(tag.toLowerCase()))) ?? null;
  }
  return blueprint.media.filter((asset) => asset.role === "team")[index] ?? null;
}

function renderMediaFrame(asset: WebsiteMediaAsset, className: string, critical = false) {
  const attribution = asset.attributionPolicy;
  const showCredit = attribution.display === "required_visible" || attribution.display === "subtle_visible";
  const markup = `<div class="media-frame ${escapeHtml(className)}" data-media-provider="${escapeHtml(asset.provider)}" data-media-reliability="${escapeHtml(asset.reliability)}">
            <img src="${escapeHtml(asset.url)}" width="${asset.width}" height="${asset.height}" alt="${escapeVisitorText(asset.alt)}" loading="${critical ? "eager" : "lazy"}" decoding="async"${critical ? ' fetchpriority="high"' : ""} data-media-provider="${escapeHtml(asset.provider)}" data-fallback-src="./${escapeHtml(asset.fallbackAsset)}" data-media-fallback-state="remote" />
            ${showCredit && attribution.label && attribution.sourceUrl ? `<p class="media-credit"><a href="${escapeHtml(attribution.sourceUrl)}" rel="noreferrer" target="_blank">${escapeHtml(attribution.label)}</a></p>` : ""}
          </div>`;
  return markup;
}

function renderCards(blueprint: WebsiteQualityBlueprint, section: WebsiteSectionBlueprint, className = "entity-grid") {
  return `<div class="${className}">
${section.items.map((item, index) => {
    const itemMedia = mediaFor(blueprint, "card", index, `${item.title} ${item.detail} ${item.meta ?? ""}`);
    return `          <article class="entity-card reveal" data-category="${escapeHtml(slug(item.meta ?? item.title))}">
            ${itemMedia ? renderMediaFrame(itemMedia, "entity-media") : `<div class="entity-art art-${(index % 6) + 1}" aria-hidden="true"><span>${String(index + 1).padStart(2, "0")}</span></div>`}
            ${item.meta ? `<p class="item-meta">${escapeVisitorText(item.meta)}</p>` : ""}
            <h3>${escapeVisitorText(item.title)}</h3>
            <p>${escapeVisitorText(item.detail)}</p>
          </article>`;
  }).join("\n")}
        </div>`;
}

function renderCarousel(blueprint: WebsiteQualityBlueprint, section: WebsiteSectionBlueprint) {
  return `<div class="carousel" data-carousel tabindex="0" aria-label="${escapeHtml(section.title)} carousel">
          <div class="carousel-track" data-carousel-track>
${section.items.map((item, index) => {
    const itemMedia = mediaFor(blueprint, "card", index, `${item.title} ${item.detail} ${item.meta ?? ""}`);
    return `            <article class="carousel-slide entity-card" data-carousel-slide aria-label="${index + 1} of ${section.items.length}">
              ${itemMedia ? renderMediaFrame(itemMedia, "carousel-media") : `<div class="entity-art art-${(index % 6) + 1}" aria-hidden="true"><span>${String(index + 1).padStart(2, "0")}</span></div>`}
               <p class="item-meta">${escapeVisitorText(item.meta ?? "Featured option")}</p>
               <h3>${escapeVisitorText(item.title)}</h3>
               <p>${escapeVisitorText(item.detail)}</p>
            </article>`;
  }).join("\n")}
          </div>
          <div class="carousel-controls">
            <button class="icon-button" type="button" data-carousel-prev aria-label="Previous item">&#8592;</button>
            <p class="carousel-status" aria-live="polite" data-carousel-status>1 / ${section.items.length}</p>
            <button class="icon-button" type="button" data-carousel-next aria-label="Next item">&#8594;</button>
          </div>
        </div>`;
}

function renderFilter(blueprint: WebsiteQualityBlueprint, section: WebsiteSectionBlueprint) {
  const categories = Array.from(new Set(section.items.map((item) => item.meta).filter(Boolean))) as string[];
  return `<div class="filter-group" data-filter-group>
          <div class="filter-controls" role="group" aria-label="Filter examples">
            <button class="filter-button is-active" type="button" data-filter="all" aria-pressed="true">All</button>
${categories.map((category) => `            <button class="filter-button" type="button" data-filter="${escapeHtml(slug(category))}" aria-pressed="false">${escapeHtml(category)}</button>`).join("\n")}
          </div>
          ${renderCards(blueprint, section)}
        </div>`;
}

function renderFaq(section: WebsiteSectionBlueprint) {
  return `<div class="faq-list" data-accordion>
${section.items.map((item, index) => {
    const id = `${section.id}-answer-${index + 1}`;
    return `          <article class="faq-item">
             <h3><button type="button" aria-expanded="false" aria-controls="${id}" data-accordion-trigger>${escapeVisitorText(item.title)}<span aria-hidden="true">+</span></button></h3>
             <div class="faq-answer" id="${id}" hidden><p>${escapeVisitorText(item.detail)}</p></div>
          </article>`;
  }).join("\n")}
        </div>`;
}

function renderForm(blueprint: WebsiteQualityBlueprint, section: WebsiteSectionBlueprint) {
  return `<form class="inquiry-form" data-honest-form novalidate>
          <div class="form-grid">
            <label>Full name<input name="name" autocomplete="name" required /></label>
            <label>Email address<input type="email" name="email" autocomplete="email" required /></label>
          </div>
          <label>What would you like help with?<select name="reason" required><option value="">Choose one</option>${blueprint.contentEntities.slice(0, 5).map((entity) => `<option>${escapeHtml(entity.label)}</option>`).join("")}</select></label>
          <label>Useful details<textarea name="message" rows="5" required placeholder="Share timing, priorities, and any constraints."></textarea></label>
          <label class="consent"><input type="checkbox" name="consent" required /> I understand this is a request, not a confirmed booking or transaction.</label>
          <button class="button" type="submit">${escapeHtml(section.title)}</button>
          <p class="form-status" data-form-status role="status">Complete the form to review your inquiry.</p>
        </form>`;
}

function renderComparison(section: WebsiteSectionBlueprint) {
  return `<div class="comparison-wrap"><table>
          <caption>${escapeHtml(section.title)}</caption>
          <thead><tr><th scope="col">Option</th><th scope="col">Best for</th><th scope="col">What to confirm</th></tr></thead>
          <tbody>${section.items.slice(0, 4).map((item) => `<tr><th scope="row">${escapeVisitorText(item.title)}</th><td>${escapeVisitorText(item.meta ?? "Specific needs")}</td><td>${escapeVisitorText(item.detail)}</td></tr>`).join("")}</tbody>
        </table></div>`;
}

function renderProcess(section: WebsiteSectionBlueprint) {
  return `<ol class="process-list">
${section.items.slice(0, 5).map((item, index) => `          <li class="reveal"><span>${index + 1}</span><div><h3>${escapeVisitorText(item.title)}</h3><p>${escapeVisitorText(item.detail)}</p></div></li>`).join("\n")}
        </ol>`;
}

function renderGallery(blueprint: WebsiteQualityBlueprint, section: WebsiteSectionBlueprint) {
  return `<div class="gallery-grid">
${section.items.slice(0, 6).map((item, index) => {
    const itemMedia = mediaFor(blueprint, "card", index, `${item.title} ${item.detail} ${item.meta ?? ""}`);
    return `          <figure class="gallery-item gallery-${(index % 3) + 1} reveal">${itemMedia ? renderMediaFrame(itemMedia, "gallery-media") : `<div class="gallery-art art-${(index % 6) + 1}" role="img" aria-label="${escapeVisitorText(item.title)} visual concept"></div>`}<figcaption><strong>${escapeVisitorText(item.title)}</strong><span>${escapeVisitorText(item.detail)}</span></figcaption></figure>`;
  }).join("\n")}
        </div>`;
}

function renderSection(blueprint: WebsiteQualityBlueprint, page: WebsitePageBlueprint, section: WebsiteSectionBlueprint, index: number) {
  let content: string;
  if (section.kind === "carousel") content = renderCarousel(blueprint, section);
  else if (section.kind === "comparison") content = renderComparison(section);
  else if (section.kind === "faq") content = renderFaq(section);
  else if (section.kind === "filter") content = renderFilter(blueprint, section);
  else if (section.kind === "form") content = renderForm(blueprint, section);
  else if (section.kind === "gallery") content = renderGallery(blueprint, section);
  else if (section.kind === "process") content = renderProcess(section);
  else content = renderCards(blueprint, section, section.kind === "trust" ? "trust-grid" : "entity-grid");

  const experience = experienceForSection(blueprint.experience, page.path, section.id);
  return `      <section class="content-section section-${escapeHtml(section.kind)}" id="${escapeHtml(section.id)}" data-experience-engine="${escapeHtml(experience?.engine ?? "standard_html")}">
        <div class="section-heading reveal">
          <p class="eyebrow">${escapeVisitorText(section.eyebrow)}</p>
          <h2>${escapeVisitorText(section.title)}</h2>
          <p>${escapeVisitorText(section.body)}</p>
        </div>
        ${content}
      </section>${index % 3 === 1 ? `
      <aside class="signal-band reveal" aria-label="Key business principle"><p>${escapeVisitorText(blueprint.business.differentiators[index % blueprint.business.differentiators.length] ?? blueprint.brand.tagline)}</p><span>${escapeVisitorText(blueprint.brand.generatedName)}</span></aside>` : ""}`;
}

function schemaFor(blueprint: WebsiteQualityBlueprint, page: WebsitePageBlueprint) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": page.structuredDataType,
    description: page.description,
    name: blueprint.brand.generatedName,
    url: `./${page.path}`
  }).replace(/</g, "\\u003c");
}

function renderHero(blueprint: WebsiteQualityBlueprint, page: WebsitePageBlueprint) {
  const nextPage = blueprint.pages.find((candidate) => candidate.name !== page.name);
  const heroMedia = page.name === "home" ? mediaFor(blueprint, "hero") : null;
  const experience = experienceForSection(blueprint.experience, page.path, page.name === "home" ? "hero" : `${page.name}-hero`);
  return `      <section class="hero" aria-labelledby="page-title" data-experience-engine="${escapeHtml(experience?.engine ?? "standard_html")}">
        <div class="hero-copy reveal">
          <p class="eyebrow">${escapeVisitorText(page.visitorCopy.eyebrow)}</p>
          <h1 id="page-title">${escapeVisitorText(page.visitorCopy.heading)}</h1>
          <p class="hero-lede">${escapeVisitorText(page.visitorCopy.body)}</p>
          <div class="hero-actions">
            <a class="button" href="${escapeHtml(visitorHref(page.visitorCopy.primaryTarget))}">${escapeHtml(page.visitorCopy.primaryCta)}</a>
            ${page.visitorCopy.secondaryCta ? `<a class="text-link" href="${escapeHtml(visitorHref(page.visitorCopy.secondaryTarget ?? nextPage?.path ?? `#${page.sections[0]?.id ?? "main-content"}`))}">${escapeHtml(page.visitorCopy.secondaryCta)} <span aria-hidden="true">&#8594;</span></a>` : ""}
          </div>
           <ul class="hero-points" aria-label="What to expect">${blueprint.business.differentiators.slice(0, 3).map((item) => `<li>${escapeVisitorText(item)}</li>`).join("")}</ul>
        </div>
        <div class="hero-stage">
          <div class="hero-visual">
            ${heroMedia ? renderMediaFrame(heroMedia, "hero-media", true) : `<img src="./assets/hero-fallback.svg" width="1200" height="900" alt="${escapeHtml(`${blueprint.brand.generatedName} ${blueprint.brand.visualArchetype} artwork`)}" />`}
          </div>
          <div class="stage-caption"><span>${escapeHtml(blueprint.brand.visualArchetype)}</span><strong>${escapeHtml(blueprint.brand.tagline)}</strong></div>
        </div>
      </section>`;
}

function renderFooter(blueprint: WebsiteQualityBlueprint) {
  const secondary = blueprint.pages.slice(0, 4);
  return `    <footer class="site-footer">
      <div class="footer-brand"><a class="brand" href="./index.html">${renderInlineLogo(blueprint, 34)}<span>${escapeVisitorText(blueprint.brand.generatedName)}</span></a><p>${escapeVisitorText(blueprint.brand.tagline)}</p></div>
      <div><h2>Explore</h2><ul>${secondary.map((page) => `<li><a href="./${page.path}">${escapeHtml(page.name === "home" ? "Home" : page.name.replace(/[-_]/g, " "))}</a></li>`).join("")}</ul></div>
      <div><h2>What matters</h2><ul>${blueprint.business.differentiators.map((item) => `<li>${escapeVisitorText(item)}</li>`).join("")}</ul></div>
      <div><h2>Contact</h2><p>Use the inquiry page to share what you are looking for and how you would like to be contacted.</p></div>
      <div class="footer-bottom"><span>&copy; <span data-current-year></span> ${escapeVisitorText(blueprint.brand.generatedName)}</span><span><a href="./sitemap.xml">Sitemap</a></span></div>
    </footer>`;
}

function renderPage(blueprint: WebsiteQualityBlueprint, page: WebsitePageBlueprint) {
  const experienceAfter = (sectionId: string) => {
    const experience = experienceForSection(blueprint.experience, page.path, sectionId);
    if (!experience) return "";
    if (experience.engine === "frame_sequence") {
      return renderWebsiteCinematicSection(blueprint, experience.sequenceId);
    }
    if (experience.engine === "procedural_webgl") {
      return renderWebsiteSceneSection(blueprint);
    }
    return "";
  };
  const heroId = page.name === "home" ? "hero" : `${page.name}-hero`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="${escapeHtml(blueprint.brand.palette.background)}" />
    <meta name="hassali-preview-identity" content="${escapeHtml(blueprint.previewIdentity)}" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <link rel="canonical" href="./${page.path}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:image" content="./assets/hero-fallback.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <link rel="icon" href="./assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./styles.css" />
    <script type="application/ld+json">${schemaFor(blueprint, page)}</script>
  </head>
  <body data-page="${escapeHtml(page.name)}" data-hassali-preview-identity="${escapeHtml(blueprint.previewIdentity)}" data-webgl="${page.name === "home" && blueprint.webgl.enabled ? "enabled" : "disabled"}" data-3d-requirement="${page.name === "home" ? escapeHtml(blueprint.scene.requirement) : "not_requested"}" data-scene-recipe="${page.name === "home" ? escapeHtml(blueprint.scene.recipe) : "none"}" data-scene-spec-version="1" data-cinematic="${page.name === "home" && blueprint.cinematic.enabled ? "enabled" : "disabled"}" data-cinematic-requirement="${page.name === "home" ? escapeHtml(blueprint.cinematic.requirement) : "not_requested"}" data-cinematic-spec-version="1" data-experience-density="${blueprint.experience.advancedDensity}">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header" data-site-header>
      <a class="brand" href="./index.html">${renderInlineLogo(blueprint, 38)}<span>${escapeHtml(blueprint.brand.generatedName)}</span></a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" data-menu-toggle><span class="sr-only">Open menu</span><span></span><span></span><span></span></button>
      <nav class="primary-navigation" id="primary-navigation" aria-label="Primary navigation" data-primary-navigation>
${nav(blueprint, page.name)}
        <a class="nav-cta" href="${escapeHtml(visitorHref(page.visitorCopy.primaryTarget))}">${escapeHtml(page.visitorCopy.primaryCta)}</a>
      </nav>
    </header>
    <main id="main-content">
${renderHero(blueprint, page)}
${experienceAfter(heroId)}
${page.sections.map((section, index) => `${renderSection(blueprint, page, section, index)}\n${experienceAfter(section.id)}`).join("\n")}
    </main>
${renderFooter(blueprint)}
    <script src="./main.js" defer></script>
    ${blueprint.media.length > 0 ? '<script src="./media.js" defer></script>' : ""}
${page.name === "home" ? renderWebsiteSceneScriptTags(blueprint) : ""}
${page.name === "home" ? renderWebsiteCinematicScriptTags(blueprint) : ""}
  </body>
</html>
`;
}

function renderLogoGeometry(blueprint: WebsiteQualityBlueprint) {
  const p = blueprint.brand.palette;
  const logo = blueprint.brand.logo;
  if (logo.symbol === "cards") return `<rect x="13" y="16" width="29" height="35" rx="5" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.ink)}" stroke-width="3" transform="rotate(${-6 - logo.variant} 27 33)"/><rect x="24" y="12" width="27" height="36" rx="5" fill="${escapeHtml(p.accent)}" stroke="${escapeHtml(p.ink)}" stroke-width="3"/><path d="M31 24c4-6 11-3 11 2 0 5-6 8-7 10-2-2-8-5-8-10 0-3 2-5 4-5" fill="${escapeHtml(p.ink)}"/>`;
  if (logo.symbol === "blocks") return `<rect x="10" y="31" width="20" height="20" rx="4" fill="${escapeHtml(p.accent)}"/><rect x="34" y="13" width="20" height="20" rx="4" fill="${escapeHtml(p.accentAlt)}"/><path d="M12 26 26 12l14 14-14 14Z" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.ink)}" stroke-width="3"/>`;
  if (logo.symbol === "drop") return `<path d="M32 9c10 13 18 22 18 32a18 18 0 0 1-36 0c0-10 8-19 18-32Z" fill="${escapeHtml(p.accent)}"/><path d="M23 43c7 3 14 0 18-7" fill="none" stroke="${escapeHtml(p.ink)}" stroke-width="4" stroke-linecap="round"/>`;
  if (logo.symbol === "display") {
    if (logo.variant === 1) {
      return `<rect x="9" y="14" width="46" height="34" rx="5" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.accent)}" stroke-width="4"/><path d="M17 22 27 17l20 10-20 10-10-5Z" fill="${escapeHtml(p.accentAlt)}"/><path d="m17 32 10 5 20-10M27 37v7" fill="none" stroke="${escapeHtml(p.accent)}" stroke-width="3" stroke-linejoin="round"/><path d="M20 53h24" stroke="${escapeHtml(p.surface)}" stroke-width="4" stroke-linecap="round"/>`;
    }
    if (logo.variant === 2) {
      return `<rect x="8" y="11" width="48" height="37" rx="6" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.accent)}" stroke-width="4"/><rect x="14" y="17" width="36" height="25" rx="2" fill="${escapeHtml(p.accentAlt)}"/><path d="M18 21h5v5h-5zM27 21h5v5h-5zM36 21h5v5h-5zM18 30h5v5h-5zM27 30h5v5h-5zM36 30h5v5h-5z" fill="${escapeHtml(p.accent)}"/><path d="M32 48v6M22 55h20" fill="none" stroke="${escapeHtml(p.surface)}" stroke-width="4" stroke-linecap="round"/>`;
    }
    if (logo.variant === 3) {
      return `<rect x="10" y="13" width="44" height="35" rx="5" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.accent)}" stroke-width="4"/><rect x="16" y="19" width="32" height="22" rx="2" fill="${escapeHtml(p.accentAlt)}"/><path d="M20 37 27 25l5 7 4-5 8 10" fill="none" stroke="${escapeHtml(p.accent)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="40" cy="24" r="2.5" fill="${escapeHtml(p.surface)}"/><path d="M32 48v6M22 55h20" fill="none" stroke="${escapeHtml(p.surface)}" stroke-width="4" stroke-linecap="round"/>`;
    }
    return `<rect x="8" y="12" width="48" height="36" rx="6" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.accent)}" stroke-width="4"/><rect x="14" y="18" width="36" height="23" rx="2" fill="${escapeHtml(p.accentAlt)}"/><path d="M19 22h16l-9 15H17Z" fill="${escapeHtml(p.accent)}" opacity=".9"/><path d="M32 48v6M22 55h20" fill="none" stroke="${escapeHtml(p.surface)}" stroke-width="4" stroke-linecap="round"/><circle cx="45" cy="22" r="2" fill="${escapeHtml(p.surface)}"/>`;
  }
  if (logo.symbol === "dial") {
    const handX = 39 + logo.variant;
    return `<circle cx="32" cy="32" r="23" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.accent)}" stroke-width="4"/><circle cx="32" cy="32" r="16" fill="none" stroke="${escapeHtml(p.accentAlt)}" stroke-width="2"/><path d="M32 11v5M32 48v5M11 32h5M48 32h5M17 17l4 4M43 43l4 4M47 17l-4 4M21 43l-4 4" stroke="${escapeHtml(p.ink)}" stroke-width="3" stroke-linecap="round"/><path d="M32 32V20M32 32l${handX - 32} 7" stroke="${escapeHtml(p.ink)}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="${escapeHtml(p.accent)}"/>`;
  }
  if (logo.symbol === "legal_seal") return `<path d="M13 23h38L32 11 13 23Z" fill="${escapeHtml(p.accent)}"/><path d="M18 27v20M27 27v20M37 27v20M46 27v20M13 50h38" fill="none" stroke="${escapeHtml(p.surface)}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="19" r="3" fill="${escapeHtml(p.ink)}"/>`;
  if (logo.symbol === "orbit") return `<circle cx="32" cy="32" r="8" fill="${escapeHtml(p.accent)}"/><ellipse cx="32" cy="32" rx="24" ry="12" fill="none" stroke="${escapeHtml(p.surface)}" stroke-width="3" transform="rotate(${logo.variant * 18} 32 32)"/><circle cx="52" cy="25" r="4" fill="${escapeHtml(p.accentAlt)}"/>`;
  return `<path d="M32 8 38 25 56 27 42 38 46 56 32 46 18 56 22 38 8 27 26 25Z" fill="${escapeHtml(p.accent)}"/><circle cx="32" cy="32" r="7" fill="${escapeHtml(p.ink)}"/>`;
}

function renderInlineLogo(blueprint: WebsiteQualityBlueprint, size: number) {
  const p = blueprint.brand.palette;
  return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false" data-logo-style="${escapeHtml(blueprint.brand.logo.style)}" data-logo-symbol="${escapeHtml(blueprint.brand.logo.symbol)}"><rect width="64" height="64" rx="${blueprint.brand.logo.style === "emblem" ? 32 : 14}" fill="${escapeHtml(p.ink)}"/>${renderLogoGeometry(blueprint)}</svg>`;
}

function renderLogo(blueprint: WebsiteQualityBlueprint) {
  const p = blueprint.brand.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title" data-logo-symbol="${escapeHtml(blueprint.brand.logo.symbol)}"><title id="title">${escapeHtml(blueprint.brand.generatedName)} brand mark</title><rect width="64" height="64" rx="${blueprint.brand.logo.style === "emblem" ? 32 : 14}" fill="${escapeHtml(p.ink)}"/>${renderLogoGeometry(blueprint)}</svg>`;
}

function semanticFallbackGeometry(blueprint: WebsiteQualityBlueprint) {
  const p = blueprint.brand.palette;
  const capabilities = blueprint.business.capabilities.join(" ").toLowerCase();
  if (/\b(?:typing|keyboard|keycaps|switches)\b/.test(capabilities)) {
    return `<g fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.ink)}" stroke-width="8">${Array.from({ length: 24 }, (_, index) => {
      const column = index % 8;
      const row = Math.floor(index / 8);
      return `<rect x="${150 + column * 112}" y="${220 + row * 126}" width="88" height="88" rx="16" transform="translate(${row * 24} 0)"/>`;
    }).join("")}</g><path d="M180 650h780" stroke="${escapeHtml(p.accent)}" stroke-width="32" stroke-linecap="round"/>`;
  }
  if (/\b(?:computer_hardware|modular_hardware|technical_product|equipment|robotics|drone)\b/.test(capabilities)) {
    return `<rect x="170" y="120" width="650" height="650" rx="54" fill="${escapeHtml(p.ink)}"/><rect x="235" y="185" width="520" height="520" rx="30" fill="${escapeHtml(p.surface)}"/><rect x="285" y="250" width="230" height="180" rx="20" fill="${escapeHtml(p.accent)}"/><rect x="555" y="250" width="150" height="380" rx="20" fill="${escapeHtml(p.accentAlt)}"/><path d="M285 485h230M285 545h230M285 605h230" stroke="${escapeHtml(p.ink)}" stroke-width="22" stroke-linecap="round"/><circle cx="940" cy="330" r="145" fill="none" stroke="${escapeHtml(p.accent)}" stroke-width="38"/><path d="M940 185v290M795 330h290" stroke="${escapeHtml(p.accentAlt)}" stroke-width="18"/>`;
  }
  if (/\b(?:coffee|beverage|food|materials|craft)\b/.test(capabilities)) {
    return `<ellipse cx="380" cy="390" rx="210" ry="300" fill="${escapeHtml(p.accent)}" transform="rotate(-22 380 390)"/><path d="M280 160c190 160 190 330 70 510" fill="none" stroke="${escapeHtml(p.ink)}" stroke-width="34"/><circle cx="820" cy="330" r="210" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.accentAlt)}" stroke-width="32"/><path d="M760 210c120 90 130 240 25 355" fill="none" stroke="${escapeHtml(p.accent)}" stroke-width="30" stroke-linecap="round"/>`;
  }
  if (/\b(?:software|saas|workflow|analytics|reporting)\b/.test(capabilities)) {
    return `<rect x="130" y="150" width="420" height="250" rx="30" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.ink)}" stroke-width="12"/><rect x="650" y="230" width="420" height="250" rx="30" fill="${escapeHtml(p.accent)}"/><rect x="300" y="520" width="480" height="220" rx="30" fill="${escapeHtml(p.accentAlt)}"/><path d="M550 275h100M450 400v120M780 480l-80 40" fill="none" stroke="${escapeHtml(p.ink)}" stroke-width="22" stroke-linecap="round"/>`;
  }
  if (/\b(?:architecture|spatial|property|construction)\b/.test(capabilities)) {
    return `<path d="M140 710V350l270-170 210 130 190-120 250 160v360Z" fill="${escapeHtml(p.surface)}" stroke="${escapeHtml(p.ink)}" stroke-width="18"/><path d="M410 180v530M620 310v400M810 190v520M140 500h920" fill="none" stroke="${escapeHtml(p.accent)}" stroke-width="20"/><rect x="690" y="390" width="120" height="220" fill="${escapeHtml(p.accentAlt)}"/>`;
  }
  return `<circle cx="350" cy="310" r="260" fill="${escapeHtml(p.accent)}" opacity=".82"/><path d="M630 110 1080 350 850 770 470 540Z" fill="${escapeHtml(p.accentAlt)}" opacity=".75"/><circle cx="820" cy="290" r="100" fill="${escapeHtml(p.surface)}" opacity=".88"/><path d="M120 720C340 520 500 870 760 650s320-30 370 70" fill="none" stroke="${escapeHtml(p.ink)}" stroke-width="28" stroke-linecap="round" opacity=".65"/>`;
}

function renderFallback(blueprint: WebsiteQualityBlueprint) {
  const p = blueprint.brand.palette;
  const subject = blueprint.business.visualSubjects.slice(0, 3).join(", ") || blueprint.brand.visualArchetype;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-labelledby="title desc"><title id="title">${escapeHtml(blueprint.brand.generatedName)} visual</title><desc id="desc">Designed artwork representing ${escapeHtml(subject)}.</desc><rect width="1200" height="900" rx="48" fill="${escapeHtml(p.background)}"/>${semanticFallbackGeometry(blueprint)}</svg>`;
}

function renderMediaFallback(blueprint: WebsiteQualityBlueprint, asset: WebsiteMediaAsset) {
  const p = blueprint.brand.palette;
  const label = asset.semanticTags.slice(0, 3).join(" / ") || blueprint.business.businessType;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-labelledby="title desc"><title id="title">${escapeVisitorText(asset.alt)}</title><desc id="desc">Designed fallback artwork for ${escapeVisitorText(label)}.</desc><rect width="1200" height="800" rx="42" fill="${escapeHtml(p.background)}"/><path d="M0 610 310 300l250 210 210-270 430 360v200H0Z" fill="${escapeHtml(p.accent)}" opacity=".72"/><circle cx="900" cy="220" r="145" fill="${escapeHtml(p.accentAlt)}" opacity=".78"/><rect x="96" y="92" width="560" height="122" rx="24" fill="${escapeHtml(p.surface)}" opacity=".9"/><text x="132" y="153" fill="${escapeHtml(p.ink)}" font-family="Arial, sans-serif" font-size="34" font-weight="700">${escapeVisitorText(label)}</text><text x="132" y="193" fill="${escapeHtml(p.muted)}" font-family="Arial, sans-serif" font-size="23">Designed local fallback artwork</text></svg>`;
}

function renderMediaJs() {
  return `(() => {
  "use strict";
  const useFallback = (image) => {
    if (!(image instanceof HTMLImageElement)) return;
    const state = image.dataset.mediaFallbackState;
    const fallback = image.dataset.fallbackSrc;
    const frame = image.closest(".media-frame");
    if (state === "remote" && fallback) {
      image.dataset.mediaFallbackState = "fallback";
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      frame?.classList.add("is-media-fallback");
      image.src = fallback;
      return;
    }
    if (state === "fallback") {
      image.dataset.mediaFallbackState = "failed";
      frame?.classList.add("is-media-missing");
      image.hidden = true;
    }
  };
  document.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    image.addEventListener("error", () => useFallback(image));
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth === 0) useFallback(image);
    window.setTimeout(() => {
      if (image instanceof HTMLImageElement && image.dataset.mediaFallbackState === "remote" && (!image.complete || image.naturalWidth === 0)) useFallback(image);
    }, 5000);
  });
})();
`;
}

function renderCss(blueprint: WebsiteQualityBlueprint) {
  const p = blueprint.brand.palette;
  return `:root {
  color-scheme: light;
  --bg: ${p.background};
  --surface: ${p.surface};
  --ink: ${p.ink};
  --muted: ${p.muted};
  --accent: ${p.accent};
  --accent-alt: ${p.accentAlt};
  --border: ${p.border};
  --overlay-bg: color-mix(in srgb, ${p.ink} 88%, transparent);
  --overlay-text: ${p.background};
  --overlay-muted: color-mix(in srgb, ${p.background} 72%, transparent);
  --overlay-border: color-mix(in srgb, ${p.background} 30%, transparent);
  --font-display: ${blueprint.brand.typography.display};
  --font-body: ${blueprint.brand.typography.body};
  --container: 1180px;
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 28px;
  --shadow: 0 24px 70px color-mix(in srgb, var(--ink) 12%, transparent);
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-text: var(--ink);
  --color-muted: var(--muted);
  --color-primary: var(--accent-alt);
  --color-accent: var(--accent);
  --font-heading: var(--font-display);
  --radius-card: var(--radius-md);
  --shadow-soft: var(--shadow);
  --section-padding: clamp(3.5rem, 8vw, 7rem);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; overflow-x: clip; }
body { margin: 0; min-width: 0; overflow-x: clip; background: var(--bg); color: var(--ink); font-family: var(--font-body); line-height: 1.65; overflow-wrap: anywhere; }
body.menu-open { overflow: hidden; }
img, canvas, svg { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; }
button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 72%, white); outline-offset: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip-link { position: fixed; left: 1rem; top: -5rem; z-index: 100; background: var(--ink); color: var(--surface); padding: .75rem 1rem; border-radius: var(--radius-sm); }
.skip-link:focus { top: 1rem; }
.site-header { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: min(calc(100% - 2rem), var(--container)); margin: 0 auto; padding: .85rem 0; transition: background-color .2s ease, box-shadow .2s ease; }
.site-header.is-scrolled { background: color-mix(in srgb, var(--bg) 90%, transparent); box-shadow: 0 1px 0 var(--border); backdrop-filter: blur(18px); }
.brand { display: inline-flex; align-items: center; gap: .65rem; min-width: 0; font-family: var(--font-display); font-weight: 800; }
.brand-mark { flex: 0 0 auto; }
.primary-navigation { display: flex; align-items: center; gap: clamp(.7rem, 2vw, 1.35rem); font-size: .9rem; font-weight: 650; }
.primary-navigation > a { padding: .65rem .1rem; color: var(--muted); text-transform: capitalize; }
.primary-navigation > a:hover, .primary-navigation > a[aria-current="page"] { color: var(--ink); }
.nav-cta, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: var(--ink); padding: .72rem 1.15rem; font-weight: 800; transition: transform .18s ease, box-shadow .18s ease; }
.nav-cta:hover, .button:hover { transform: translateY(-2px); box-shadow: 0 12px 28px color-mix(in srgb, var(--accent) 28%, transparent); }
.menu-toggle { display: none; width: 44px; height: 44px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); padding: 11px; }
.menu-toggle span:not(.sr-only) { display: block; height: 2px; margin: 4px 0; background: var(--ink); transition: transform .2s ease, opacity .2s ease; }
main { width: min(calc(100% - 2rem), var(--container)); margin: 0 auto; }
.hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(18rem, .86fr); align-items: center; gap: clamp(2rem, 6vw, 5rem); min-height: min(760px, calc(100vh - 7rem)); padding: clamp(3rem, 8vw, 7rem) 0; }
.eyebrow { margin: 0 0 .7rem; color: var(--accent-alt); font-size: .76rem; font-weight: 850; text-transform: uppercase; }
h1, h2, h3, p { margin-top: 0; }
h1, h2, h3 { font-family: var(--font-display); letter-spacing: 0; }
h1 { max-width: 13ch; margin-bottom: 1rem; font-size: clamp(2.7rem, 7vw, 6.6rem); line-height: .98; }
h2 { margin-bottom: .8rem; font-size: clamp(1.9rem, 4vw, 3.7rem); line-height: 1.05; }
h3 { margin-bottom: .45rem; font-size: clamp(1.05rem, 2vw, 1.35rem); }
.hero-lede, .section-heading > p, .footer-brand p { max-width: 66ch; color: var(--muted); }
.hero-lede { font-size: clamp(1rem, 1.8vw, 1.2rem); }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin: 1.6rem 0; }
.text-link { font-weight: 800; }
.hero-points { display: flex; flex-wrap: wrap; gap: .7rem; margin: 0; padding: 0; list-style: none; }
.hero-points li { border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--surface) 76%, transparent); padding: .45rem .72rem; color: var(--muted); font-size: .8rem; }
.hero-stage { container-type: inline-size; position: relative; min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow); }
.hero-visual { position: relative; min-height: 520px; overflow: hidden; }
.hero-visual > img, .hero-visual > .media-frame { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-visual > img, .hero-visual .media-frame img { width: 100%; height: 100%; object-fit: cover; }
.media-frame { position: relative; display: block; overflow: hidden; margin: 0; border-radius: calc(var(--radius-md) - 4px); background: color-mix(in srgb, var(--surface) 78%, var(--accent)); aspect-ratio: 3 / 2; }
.media-frame img { display: block; min-height: 0; width: 100%; height: 100%; object-fit: cover; }
.media-frame.is-media-fallback img { object-fit: cover; }
.media-frame.is-media-missing::after { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); content: "Media unavailable"; font-size: .82rem; font-weight: 750; }
.media-credit { position: absolute; right: .7rem; bottom: .7rem; z-index: 2; max-width: calc(100% - 1.4rem); margin: 0; border: 1px solid color-mix(in srgb, var(--surface) 34%, transparent); border-radius: 999px; background: color-mix(in srgb, var(--ink) 76%, transparent); padding: .28rem .55rem; color: var(--surface); font-size: .62rem; line-height: 1.3; overflow-wrap: anywhere; backdrop-filter: blur(10px); }
.media-credit a { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 2px; }
.entity-media, .carousel-media { margin-bottom: 1rem; aspect-ratio: 4 / 3; }
.gallery-media { min-height: 300px; }
.scene-section { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(16rem, .72fr) minmax(22rem, 1.1fr); min-height: clamp(38rem, 78vh, 54rem); width: min(calc(100% - 2rem), var(--container)); align-items: center; gap: clamp(2rem, 6vw, 6rem); margin: 0 auto; overflow: clip; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.scene-content { position: relative; z-index: 2; padding-block: clamp(4rem, 10vw, 8rem); }
.scene-content > p { max-width: 58ch; color: var(--muted); }
.scene-steps { display: grid; gap: .8rem; margin: 2rem 0 0; padding: 0; list-style: none; }
.scene-steps li { display: grid; grid-template-columns: 2.4rem 1fr; align-items: center; gap: .8rem; border-top: 1px solid var(--border); padding: .85rem 0; }
.scene-steps span { color: var(--accent-alt); font-size: .75rem; font-weight: 900; }
.scene-semantic-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; margin-top: 1.2rem; }
.scene-semantic-cards article { min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--surface) 86%, transparent); padding: .8rem; }
.scene-semantic-cards span, .scene-semantic-cards p { display: block; margin: 0; color: var(--muted); font-size: .72rem; }
.scene-semantic-cards strong { display: block; margin: .2rem 0; font-family: var(--font-display); font-size: 1rem; }
.scene-viewport { position: relative; isolation: isolate; z-index: 1; min-height: clamp(28rem, 65vh, 46rem); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); pointer-events: none; }
.scene-viewport canvas, .scene-fallback { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.scene-viewport canvas { z-index: 1; opacity: 0; transition: opacity .35s ease; }
.scene-fallback { z-index: 0; opacity: 1; transition: opacity .35s ease; }
.scene-noscript { grid-column: 1 / -1; margin: 0; color: var(--muted); }
.scene-section.is-scene-ready .scene-viewport canvas { opacity: 1; }
.scene-section.is-scene-ready .scene-fallback { opacity: 0; }
.scene-section.is-scene-fallback .scene-viewport canvas { display: none; }
.scene-section.is-scene-failed .scene-viewport canvas { display: none; }
.stage-caption { position: relative; z-index: 2; display: flex; justify-content: space-between; gap: 1rem; max-width: none; border-top: 1px solid var(--border); background: var(--surface); color: var(--ink); padding: .8rem 1rem; }
.stage-caption span { color: var(--muted); font-size: .75rem; }
.content-section { padding: clamp(3.5rem, 8vw, 7rem) 0; border-top: 1px solid var(--border); }
.section-heading { display: grid; grid-template-columns: minmax(0, .8fr) minmax(16rem, .55fr); gap: 1rem 3rem; align-items: end; margin-bottom: clamp(1.5rem, 4vw, 3rem); }
.section-heading .eyebrow { grid-column: 1 / -1; margin: 0; }
.section-heading h2 { margin: 0; }
.entity-grid, .trust-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.entity-card { min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); padding: 1rem; box-shadow: 0 12px 34px color-mix(in srgb, var(--ink) 7%, transparent); }
.entity-card p { color: var(--muted); }
.entity-art, .gallery-art { display: grid; min-height: 190px; margin-bottom: 1rem; place-items: end start; border-radius: calc(var(--radius-md) - 4px); padding: 1rem; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 72%, var(--surface)), color-mix(in srgb, var(--accent-alt) 65%, var(--bg))); color: var(--ink); font-family: var(--font-display); font-size: 1.4rem; font-weight: 900; }
.art-2 { background: linear-gradient(155deg, var(--surface), color-mix(in srgb, var(--accent-alt) 62%, var(--bg))); }
.art-3 { background: radial-gradient(circle at 70% 25%, var(--surface) 0 12%, transparent 13%), linear-gradient(135deg, var(--accent-alt), var(--accent)); }
.art-4 { background: linear-gradient(45deg, color-mix(in srgb, var(--ink) 84%, var(--accent)), color-mix(in srgb, var(--accent) 55%, var(--surface))); color: var(--surface); }
.art-5 { background: radial-gradient(circle at 30% 30%, var(--accent) 0 18%, transparent 19%), linear-gradient(130deg, var(--surface), var(--accent-alt)); }
.art-6 { background: linear-gradient(165deg, color-mix(in srgb, var(--accent) 32%, var(--surface)), color-mix(in srgb, var(--accent-alt) 74%, var(--bg))); }
.item-meta { margin-bottom: .4rem; color: var(--accent-alt) !important; font-size: .76rem; font-weight: 850; text-transform: uppercase; }
.carousel { overflow: hidden; }
.carousel-track { display: flex; gap: 1rem; transition: transform .35s ease; touch-action: pan-y; }
.carousel-slide { flex: 0 0 min(31rem, 82vw); }
.carousel-controls { display: flex; align-items: center; justify-content: flex-end; gap: .8rem; margin-top: 1rem; }
.icon-button { width: 44px; height: 44px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--ink); cursor: pointer; }
.carousel-status { min-width: 4rem; margin: 0; text-align: center; }
.filter-controls { display: flex; flex-wrap: wrap; gap: .6rem; margin-bottom: 1.2rem; }
.filter-button { min-height: 42px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--muted); padding: .55rem .9rem; }
.filter-button.is-active { border-color: var(--accent); background: var(--accent); color: var(--ink); }
.comparison-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
table { width: 100%; border-collapse: collapse; background: var(--surface); }
caption { padding: 1rem; font-weight: 800; text-align: left; }
th, td { border-top: 1px solid var(--border); padding: 1rem; text-align: left; vertical-align: top; }
td { color: var(--muted); }
.process-list { display: grid; gap: 1rem; margin: 0; padding: 0; list-style: none; }
.process-list li { display: grid; grid-template-columns: 3rem 1fr; gap: 1rem; padding: 1.2rem 0; border-top: 1px solid var(--border); }
.process-list > li > span { display: grid; width: 2.4rem; height: 2.4rem; place-items: center; border-radius: 50%; background: var(--accent); font-weight: 900; }
.faq-list { border-top: 1px solid var(--border); }
.faq-item { border-bottom: 1px solid var(--border); }
.faq-item h3 { margin: 0; }
.faq-item button { display: flex; width: 100%; align-items: center; justify-content: space-between; border: 0; background: transparent; color: var(--ink); padding: 1.15rem 0; text-align: left; font-weight: 800; cursor: pointer; }
.faq-answer { max-width: 72ch; padding-bottom: 1rem; color: var(--muted); }
.gallery-grid { display: grid; grid-template-columns: 1.2fr .8fr .8fr; gap: 1rem; }
.gallery-item { margin: 0; }
.gallery-art { min-height: 300px; margin: 0; }
.gallery-1 { grid-row: span 2; }
.gallery-item figcaption { display: grid; gap: .25rem; padding: .75rem 0; }
.gallery-item figcaption span { color: var(--muted); }
.inquiry-form { display: grid; gap: 1rem; max-width: 780px; padding: clamp(1rem, 4vw, 2rem); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
label { display: grid; gap: .4rem; color: var(--muted); font-size: .9rem; }
input, select, textarea { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--ink); padding: .8rem .9rem; }
.consent { display: flex; grid-template-columns: auto 1fr; align-items: start; }
.consent input { width: auto; margin-top: .3rem; }
.form-status { margin: 0; color: var(--muted); font-size: .84rem; }
.form-status.is-error { color: var(--accent-alt); font-weight: 750; }
.signal-band { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: clamp(2rem, 5vw, 4rem) 0; border-radius: var(--radius-md); background: var(--ink); color: var(--surface); padding: clamp(1.2rem, 4vw, 2.4rem); }
.signal-band p { margin: 0; }
.site-footer { display: grid; grid-template-columns: 1.4fr repeat(3, minmax(0, .75fr)); gap: 2rem; padding: clamp(3rem, 7vw, 6rem) max(1rem, calc((100vw - var(--container)) / 2)); border-top: 1px solid var(--border); background: var(--surface); }
.site-footer h2 { font-size: 1rem; }
.site-footer ul { display: grid; gap: .55rem; margin: 0; padding: 0; color: var(--muted); list-style: none; }
.footer-bottom { display: flex; grid-column: 1 / -1; justify-content: space-between; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .82rem; }
.footer-bottom span:last-child { display: flex; flex-wrap: wrap; gap: 1rem; }
.reveal { opacity: 0; transform: translateY(18px); transition: opacity .5s ease, transform .5s ease; }
.reveal.is-visible { opacity: 1; transform: none; }
@media (max-width: 900px) {
  .menu-toggle { display: block; }
  .primary-navigation { position: fixed; inset: 0 0 0 auto; z-index: 60; display: flex; width: min(86vw, 360px); max-width: 100%; flex-direction: column; align-items: stretch; justify-content: center; padding: 5rem 2rem 2rem; background: var(--surface); box-shadow: -30px 0 80px color-mix(in srgb, var(--ink) 22%, transparent); visibility: hidden; transform: translateX(100%); transition: transform .25s ease, visibility 0s linear .25s; }
  .primary-navigation.is-open { visibility: visible; transform: none; transition-delay: 0s; }
  .primary-navigation > a { padding: .8rem; }
  .menu-toggle[aria-expanded="true"] { position: fixed; right: 1rem; top: 1rem; z-index: 70; }
  .menu-toggle[aria-expanded="true"] span:nth-child(2) { transform: translateY(6px) rotate(45deg); }
  .menu-toggle[aria-expanded="true"] span:nth-child(3) { opacity: 0; }
  .menu-toggle[aria-expanded="true"] span:nth-child(4) { transform: translateY(-6px) rotate(-45deg); }
  .hero { grid-template-columns: 1fr; min-height: auto; }
  .scene-section { grid-template-columns: 1fr; min-height: auto; }
  .scene-content { padding-bottom: 0; }
  .scene-viewport { min-height: 420px; }
  .scene-semantic-cards { max-width: 42rem; }
  .hero-visual { min-height: 420px; }
  .entity-grid, .trust-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .site-footer { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .footer-bottom { grid-column: 1 / -1; }
}
@media (max-width: 600px) {
  .section-heading, .form-grid { grid-template-columns: 1fr; }
  .section-heading .eyebrow { grid-column: auto; }
  .entity-grid, .trust-grid, .gallery-grid, .site-footer { grid-template-columns: 1fr; }
  .hero-visual { min-height: 340px; }
  .scene-section { width: min(calc(100% - 2rem), var(--container)); gap: 1rem; }
  .scene-viewport { min-height: 320px; }
  .scene-semantic-cards { grid-template-columns: 1fr; }
  .signal-band, .footer-bottom { align-items: flex-start; flex-direction: column; }
  .gallery-1 { grid-row: auto; }
  .site-footer { padding-inline: 1rem; }
}
@container (max-width: 520px) {
  .hero-visual { min-height: 300px; }
  .stage-caption { display: grid; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .reveal { opacity: 1; transform: none; }
  .scene-viewport canvas { display: none !important; }
  .scene-fallback { opacity: 1 !important; }
}
${renderWebsiteCinematicCss()}
`;
}

function renderJs(blueprint: WebsiteQualityBlueprint) {
  const hasInteraction = (id: WebsiteQualityBlueprint["interactions"][number]["id"]) =>
    blueprint.interactions.some((interaction) => interaction.id === id);
  return `(() => {
  "use strict";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.querySelector("[data-site-header]");
  const menuButton = document.querySelector("[data-menu-toggle]");
  const navigation = document.querySelector("[data-primary-navigation]");
  const closeMenu = () => {
    menuButton?.setAttribute("aria-expanded", "false");
    navigation?.classList.remove("is-open");
    document.body.classList.remove("menu-open");
  };
  const openMenu = () => {
    menuButton?.setAttribute("aria-expanded", "true");
    navigation?.classList.add("is-open");
    document.body.classList.add("menu-open");
    navigation?.querySelector("a")?.focus();
  };
  menuButton?.addEventListener("click", () => menuButton.getAttribute("aria-expanded") === "true" ? closeMenu() : openMenu());
  navigation?.addEventListener("click", (event) => { if (event.target instanceof HTMLAnchorElement) closeMenu(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
  document.addEventListener("pointerdown", (event) => {
    if (navigation?.classList.contains("is-open") && event.target instanceof Node && !navigation.contains(event.target) && !menuButton?.contains(event.target)) closeMenu();
  }, { passive: true });
  window.addEventListener("scroll", () => header?.classList.toggle("is-scrolled", window.scrollY > 16), { passive: true });

  ${hasInteraction("carousel") ? `document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const track = carousel.querySelector("[data-carousel-track]");
    const slides = Array.from(carousel.querySelectorAll("[data-carousel-slide]"));
    const status = carousel.querySelector("[data-carousel-status]");
    let index = 0;
    let startX = 0;
    const update = () => {
      const width = slides[0]?.getBoundingClientRect().width ?? 0;
      const gap = 16;
      if (track instanceof HTMLElement) track.style.transform = "translateX(-" + (index * (width + gap)) + "px)";
      if (status) status.textContent = (index + 1) + " / " + Math.max(slides.length, 1);
    };
    const move = (step) => { index = (index + step + slides.length) % Math.max(slides.length, 1); update(); };
    carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => move(-1));
    carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => move(1));
    carousel.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); });
    carousel.addEventListener("pointerdown", (event) => { startX = event.clientX; }, { passive: true });
    carousel.addEventListener("pointerup", (event) => { const distance = event.clientX - startX; if (Math.abs(distance) > 48) move(distance > 0 ? -1 : 1); }, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  });` : ""}

  ${hasInteraction("filter") ? `document.querySelectorAll("[data-filter-group]").forEach((group) => {
    const buttons = Array.from(group.querySelectorAll("[data-filter]"));
    const cards = Array.from(group.querySelectorAll("[data-category]"));
    buttons.forEach((button) => button.addEventListener("click", () => {
      const filter = button.getAttribute("data-filter") ?? "all";
      buttons.forEach((candidate) => { const active = candidate === button; candidate.classList.toggle("is-active", active); candidate.setAttribute("aria-pressed", String(active)); });
      cards.forEach((card) => { if (card instanceof HTMLElement) card.hidden = filter !== "all" && card.dataset.category !== filter; });
    }));
  });` : ""}

  ${hasInteraction("accordion") ? `document.querySelectorAll("[data-accordion-trigger]").forEach((button) => button.addEventListener("click", () => {
    const panelId = button.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    if (panel) panel.hidden = expanded;
  }));` : ""}

  ${hasInteraction("form") ? `document.querySelectorAll("[data-honest-form]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!(form instanceof HTMLFormElement)) return;
    const status = form.querySelector("[data-form-status]");
    const valid = form.reportValidity();
    status?.classList.toggle("is-error", !valid);
    if (status) status.textContent = valid
      ? "Your details look complete. This preview keeps them on this device and does not send them."
      : "Please complete the required fields before continuing.";
  }));` : ""}

  const reveals = Array.from(document.querySelectorAll(".reveal"));
  if (reducedMotion.matches || !("IntersectionObserver" in window)) reveals.forEach((item) => item.classList.add("is-visible"));
  else {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { rootMargin: "0px 0px -8%" });
    reveals.forEach((item) => observer.observe(item));
  }

  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });

})();
`;
}

export function renderWebsiteQualityFiles(blueprint: WebsiteQualityBlueprint) {
  const files: Record<string, string> = {
    "assets/favicon.svg": renderLogo(blueprint),
    "assets/hero-fallback.svg": renderFallback(blueprint),
    "assets/logo.svg": renderLogo(blueprint),
    "main.js": renderJs(blueprint),
    "robots.txt": "User-agent: *\nAllow: /\nSitemap: ./sitemap.xml\n",
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${blueprint.pages.map((page) => `<url><loc>./${page.path}</loc></url>`).join("")}</urlset>`,
    "styles.css": renderCss(blueprint)
  };
  Object.assign(files, renderWebsiteSceneFiles(blueprint));
  Object.assign(files, renderWebsiteCinematicFiles(blueprint));
  if (blueprint.media.length > 0) files["media.js"] = renderMediaJs();
  blueprint.media.forEach((asset) => { files[asset.fallbackAsset] = renderMediaFallback(blueprint, asset); });
  blueprint.pages.forEach((page) => { files[page.path] = renderPage(blueprint, page); });
  return files;
}
