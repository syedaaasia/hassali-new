import type { WebsitePlan } from "@/lib/server/ai/website-planner";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(value: string) {
  return value
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function pageToPath(page: string) {
  return page === "home" ? "index.html" : `${page}.html`;
}

function nav(plan: WebsitePlan) {
  return plan.pages
    .map((page) => `<a href="./${pageToPath(page)}">${escapeHtml(titleCase(page))}</a>`)
    .join("\n        ");
}

function sectionsForPage(plan: WebsitePlan, page: string) {
  if (page === "home") return plan.requiredSections;
  const offset = Math.max(0, plan.pages.indexOf(page) - 1);
  const section = plan.requiredSections[offset % plan.requiredSections.length];
  const support = plan.optionalSections[offset % Math.max(plan.optionalSections.length, 1)];

  return support ? [section, support] : [section];
}

function industryLabel(plan: WebsitePlan) {
  return plan.industry.replace(/_/g, " ");
}

function renderVisual(label: string, index: number) {
  return `<div class="visual visual-${(index % 4) + 1}" aria-label="${escapeHtml(label)}">
            <span>${escapeHtml(label)}</span>
          </div>`;
}

function renderPage(input: {
  brandName: string;
  page: string;
  plan: WebsitePlan;
}) {
  const isHome = input.page === "home";
  const pageTitle = titleCase(input.page);
  const pageSections = sectionsForPage(input.plan, input.page);
  const leadSection = pageSections[0] ?? input.plan.requiredSections[0];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(isHome ? input.brandName : `${pageTitle} - ${input.brandName}`)}</title>
    <meta name="description" content="${escapeHtml(input.plan.goal)}" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body data-industry="${input.plan.industry}" data-layout="${input.plan.layoutType}">
    <header class="site-header">
      <a class="brand" href="./index.html">${escapeHtml(input.brandName)}</a>
      <nav aria-label="Primary navigation">
        ${nav(input.plan)}
      </nav>
    </header>
    <main>
      <section class="hero" data-section-id="${escapeHtml(leadSection.id)}">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(industryLabel(input.plan))} / ${escapeHtml(input.plan.layoutType.replace(/_/g, " "))}</p>
          <h1>${escapeHtml(isHome ? leadSection.title : `${pageTitle} built around ${leadSection.title.toLowerCase()}`)}</h1>
          <p class="lede">${escapeHtml(isHome ? leadSection.intent : leadSection.contentAngle)}</p>
          <a class="button" href="./${input.plan.pages.includes("contact") ? "contact.html" : pageToPath(input.plan.pages[input.plan.pages.length - 1] ?? "contact")}">${escapeHtml(input.plan.goal)}</a>
        </div>
        ${renderVisual(leadSection.visualIntent, 0)}
      </section>
      <section class="section-grid" aria-label="${escapeHtml(pageTitle)} sections">
${pageSections
  .map((section, index) => `        <article class="section-card" data-section-id="${escapeHtml(section.id)}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <p class="eyebrow">${escapeHtml(section.visualIntent)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.contentAngle)}</p>
          ${renderVisual(section.visualIntent, index + 1)}
        </article>`)
  .join("\n")}
      </section>
    </main>
    <footer>
      <span>${escapeHtml(input.brandName)}</span>
      <span>${escapeHtml(input.plan.visualStrategy)}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`;
}

export function renderWebsitePlanFiles(input: {
  brandName: string;
  plan: WebsitePlan;
}) {
  const files: Record<string, string> = {
    "main.js": `document.querySelectorAll(".section-card, .visual").forEach((element, index) => {
  element.style.setProperty("--stagger", String(index));
});
`,
    "styles.css": renderWebsitePlanCss(input.plan)
  };

  input.plan.pages.forEach((page) => {
    files[pageToPath(page)] = renderPage({
      brandName: input.brandName,
      page,
      plan: input.plan
    });
  });

  if (!files["index.html"]) {
    files["index.html"] = renderPage({
      brandName: input.brandName,
      page: "home",
      plan: input.plan
    });
  }

  return files;
}

function renderWebsitePlanCss(plan: WebsitePlan) {
  return `:root {
  color-scheme: light;
  --canvas: #f7f4ee;
  --surface: rgba(255, 255, 255, 0.76);
  --ink: #121212;
  --muted: rgba(18, 18, 18, 0.66);
  --accent: #4f46e5;
  --accent-2: #0f766e;
  --line: rgba(18, 18, 18, 0.1);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 18% 10%, rgba(79, 70, 229, 0.16), transparent 28rem),
    radial-gradient(circle at 82% 16%, rgba(15, 118, 110, 0.14), transparent 26rem),
    var(--canvas);
  color: var(--ink);
}
a { color: inherit; text-decoration: none; }
.site-header, main, footer { margin: 0 auto; max-width: 1180px; }
.site-header, footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem clamp(1rem, 4vw, 2rem);
}
.brand { font-weight: 900; letter-spacing: -0.03em; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; color: var(--muted); font-size: 0.92rem; }
main { padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 4vw, 2rem); }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(17rem, 0.72fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: center;
  padding: clamp(2rem, 8vw, 6rem) 0;
}
.hero-copy { min-width: 0; }
.eyebrow {
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
h1, h2, p { margin: 0; }
h1 {
  max-width: 13ch;
  font-size: clamp(2.6rem, 7vw, 6rem);
  line-height: 0.92;
  letter-spacing: -0.045em;
}
h2 { margin-top: 0.5rem; font-size: clamp(1.35rem, 3vw, 2rem); line-height: 1.05; }
.lede, .section-card p, footer { color: var(--muted); line-height: 1.72; }
.lede { margin-top: 1rem; max-width: 650px; font-size: clamp(1rem, 1.8vw, 1.2rem); }
.button {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin-top: 1.25rem;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  padding: 0.82rem 1.1rem;
  font-weight: 850;
}
.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 1rem;
}
.section-card, .visual {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  backdrop-filter: blur(16px) saturate(120%);
}
.section-card { display: grid; gap: 0.9rem; padding: 1.1rem; }
.section-card span { color: var(--accent-2); font-size: 0.76rem; font-weight: 900; }
.visual {
  display: grid;
  min-height: 18rem;
  place-items: center;
  overflow: hidden;
  padding: 1.5rem;
  text-align: center;
  font-size: clamp(1.3rem, 4vw, 3rem);
  font-weight: 950;
}
.visual span { max-width: 10ch; }
.visual-1 { background: radial-gradient(circle at 22% 18%, rgba(255,255,255,0.7), transparent 8rem), linear-gradient(135deg, rgba(79,70,229,0.18), rgba(15,118,110,0.2)); }
.visual-2 { background: radial-gradient(circle at 70% 20%, rgba(79,70,229,0.25), transparent 9rem), linear-gradient(145deg, #fff, rgba(15,118,110,0.12)); }
.visual-3 { background: radial-gradient(circle at 32% 70%, rgba(15,118,110,0.22), transparent 10rem), linear-gradient(145deg, #fff, rgba(79,70,229,0.12)); }
.visual-4 { background: linear-gradient(135deg, rgba(18,18,18,0.08), rgba(79,70,229,0.18), rgba(15,118,110,0.18)); }
body[data-layout="${plan.layoutType}"] .section-card:first-child { grid-column: span 2; }
@media (max-width: 860px) {
  .site-header, footer { align-items: flex-start; flex-direction: column; }
  .hero { grid-template-columns: 1fr; }
  body[data-layout="${plan.layoutType}"] .section-card:first-child { grid-column: span 1; }
}
`;
}
