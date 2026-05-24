import {
  resolveChatPersistenceContext,
  saveChatMessage,
  type AiMode as PersistedAiMode
} from "@hassali/database";
import { auth } from "@clerk/nextjs/server";
import {
  buildDiagnosticContext,
  formatDiagnosticContext,
  type DiagnosticContext
} from "@/lib/server/ai/diagnostic-context";
import { getRuntimeStatus } from "@/lib/server/runtime-manager";

export const runtime = "nodejs";

const fallbackModel = "openai/gpt-4o-mini";
const openRouterChatCompletionsUrl = "https://openrouter.ai/api/v1/chat/completions";

type ChatRequestMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type AiMode = "ASK" | "SUGGEST" | "EXECUTE";

type WorkspaceContext = {
  activeFileContent: string;
  activePath: string;
  fileContents?: Record<string, string>;
  fileList: string[];
  projectName?: string | null;
};

type ChatPersistenceContext = {
  mode: PersistedAiMode;
  projectId: string;
  sessionId: string | null;
  userId: string;
};

type FileProposalAction = "create" | "update";
type RuntimeProposalAction = "restart_runtime" | "reload_preview" | "stop_runtime";
type ProposalAction = FileProposalAction | RuntimeProposalAction;

type ProposalChange = {
  action: ProposalAction;
  path?: string;
  summary: string;
  proposedContent?: string;
  diffPreview?: string;
};

type DiffProposal = {
  changes: ProposalChange[];
  id: string;
  mode: "SUGGEST" | "EXECUTE";
  projectId: string | null;
  status: "pending";
  summary: string;
};

type DiffProposalPayload = {
  changes: ProposalChange[];
  summary: string;
};

const proposalMarker = "HASSALI_DIFF_PROPOSAL:";

function isChatMessage(value: unknown): value is ChatRequestMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as ChatRequestMessage;

  return (
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function isWorkspaceContext(value: unknown): value is WorkspaceContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as WorkspaceContext;

  return (
    typeof workspace.activeFileContent === "string" &&
    typeof workspace.activePath === "string" &&
    Array.isArray(workspace.fileList) &&
    workspace.fileList.every((path) => typeof path === "string") &&
    (typeof workspace.fileContents === "undefined" ||
      (workspace.fileContents &&
        typeof workspace.fileContents === "object" &&
        Object.values(workspace.fileContents).every((content) => typeof content === "string"))) &&
    (typeof workspace.projectName === "undefined" ||
      workspace.projectName === null ||
      typeof workspace.projectName === "string")
  );
}

function createDiffPreview(action: "create" | "update", path: string, proposedContent: string) {
  return [
    action === "create" ? `create ${path}` : `update ${path}`,
    `--- ${path}`,
    `+++ ${path}`,
    ...proposedContent.split("\n").map((line) => `+ ${line}`)
  ].join("\n");
}

function isRuntimeProposalAction(action: unknown): action is RuntimeProposalAction {
  return action === "restart_runtime" || action === "reload_preview" || action === "stop_runtime";
}

function isFileProposalAction(action: unknown): action is FileProposalAction {
  return action === "create" || action === "update";
}

function shouldRestartPreview(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  return (
    lowerPrompt.includes("preview") ||
    lowerPrompt.includes("start") ||
    lowerPrompt.includes("restart") ||
    lowerPrompt.includes("run")
  );
}

function hasStandardWebFiles(fileList: string[]) {
  return (
    fileList.includes("index.html") ||
    fileList.includes("styles.css") ||
    fileList.includes("main.js")
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanRenameValue(value: string) {
  return value
    .trim()
    .replace(/^["'`]/, "")
    .replace(/["'`.,!?]$/, "")
    .trim();
}

function detectRenameRequest(prompt: string) {
  const match =
    prompt.match(/(?:rename|change(?:\s+the)?\s+name)\s+from\s+(.+?)\s+to\s+(.+?)(?:$|[.!?])/i) ??
    prompt.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:$|[.!?])/i);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const from = cleanRenameValue(match[1]);
  const to = cleanRenameValue(match[2]);

  return from && to && from.toLowerCase() !== to.toLowerCase() ? { from, to } : null;
}

function isEnhancementRequest(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  return [
    "animation",
    "animate",
    "apple glass",
    "beautiful",
    "carousel",
    "glass style",
    "glassmorphism",
    "make premium",
    "premium",
    "slider"
  ].some((term) => lowerPrompt.includes(term));
}

function contentForPath(workspace: WorkspaceContext, path: string) {
  return workspace.fileContents?.[path] ?? (workspace.activePath === path ? workspace.activeFileContent : "");
}

function safeFileContent(workspace: WorkspaceContext, path: string, fallback: string) {
  const content = contentForPath(workspace, path);

  return content.trim().length > 0 ? content : fallback;
}

function createStaticWebsiteContent(domain: DiagnosticContext["inferredDomain"]) {
  const theme =
    domain === "florist"
      ? {
          accent: "Fresh bouquets",
          cta: "Plan a bouquet",
          detail: "Seasonal stems, quiet arrangements, and thoughtful delivery for everyday rituals.",
          title: "Petal House"
        }
      : domain === "jewellery"
        ? {
            accent: "Fine jewellery",
            cta: "View collection",
            detail: "Considered pieces with warm metals, clean silhouettes, and a softer kind of luxury.",
            title: "Aurum Atelier"
          }
        : domain === "car rental"
          ? {
              accent: "Premium car rental",
              cta: "Reserve a drive",
              detail: "A calm fleet experience for airport transfers, city days, and weekend escapes.",
              title: "Apex Reserve"
            }
          : {
              accent: "Calm web experience",
              cta: "Start exploring",
              detail: "A focused, responsive static website with clear sections and lightweight interaction.",
              title: "Hassali Studio"
            };

  return {
    indexHtml: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${theme.title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="#">${theme.title}</a>
      <nav aria-label="Primary navigation">
        <a href="#services">Services</a>
        <a href="#story">Story</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <p class="eyebrow">${theme.accent}</p>
        <h1>A refined digital home built to feel calm, modern, and trustworthy.</h1>
        <p class="lede">${theme.detail}</p>
        <a class="button" href="#contact">${theme.cta}</a>
      </section>
      <section class="feature-grid" id="services">
        <article>
          <span>01</span>
          <h2>Curated choices</h2>
          <p>Focused options, clear presentation, and no unnecessary clutter.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Responsive by default</h2>
          <p>Layouts breathe across phones, laptops, desktops, and large screens.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Easy next step</h2>
          <p>A direct call to action keeps the experience simple and confident.</p>
        </article>
      </section>
      <section class="story" id="story">
        <h2>Designed with restraint.</h2>
        <p>Warm typography, soft contrast, and spacious sections create a premium first impression without heavy effects.</p>
      </section>
    </main>
    <footer id="contact">
      <span>${theme.title}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`,
    mainJs: `const cards = document.querySelectorAll(".feature-grid article");

cards.forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--x", String(event.clientX - rect.left));
    card.style.setProperty("--y", String(event.clientY - rect.top));
  });
});
`,
    stylesCss: `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #080808;
  color: #f4efe6;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 16% 12%, rgba(255, 54, 85, 0.2), transparent 30rem),
    radial-gradient(circle at 84% 18%, rgba(16, 185, 129, 0.12), transparent 28rem),
    #080808;
}

a {
  color: inherit;
  text-decoration: none;
}

.site-header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 auto;
  max-width: 1120px;
  padding: 1.25rem clamp(1rem, 4vw, 2rem);
}

.brand {
  font-weight: 800;
  letter-spacing: 0.01em;
}

nav {
  display: flex;
  gap: clamp(0.75rem, 2vw, 1.4rem);
  color: #b8b0a4;
  font-size: 0.92rem;
}

main {
  margin: 0 auto;
  max-width: 1120px;
  padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 4vw, 2rem);
}

.hero {
  max-width: 820px;
  padding: clamp(3rem, 10vw, 7rem) 0;
}

.eyebrow {
  color: #d6b16d;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 12ch;
  font-size: clamp(2.8rem, 8vw, 6.8rem);
  line-height: 0.9;
  letter-spacing: -0.04em;
}

h2 {
  margin: 0;
  font-size: clamp(1.4rem, 4vw, 2.5rem);
}

.lede,
.story p,
article p {
  color: #bbb3a7;
  line-height: 1.75;
}

.lede {
  max-width: 680px;
  font-size: clamp(1rem, 2vw, 1.22rem);
}

.button {
  display: inline-flex;
  border: 1px solid rgba(214, 177, 109, 0.45);
  border-radius: 999px;
  background: #d6b16d;
  color: #111;
  margin-top: 1rem;
  padding: 0.85rem 1.1rem;
  font-weight: 800;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

article,
.story {
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at calc(var(--x, 80) * 1px) calc(var(--y, 40) * 1px), rgba(255, 255, 255, 0.08), transparent 12rem),
    rgba(255, 255, 255, 0.045);
  padding: 1.25rem;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
}

article span {
  color: #ff5a70;
  font-size: 0.78rem;
  font-weight: 800;
}

.story {
  margin-top: 1rem;
}

footer {
  color: #91897f;
}

@media (max-width: 760px) {
  .site-header,
  footer {
    align-items: flex-start;
    flex-direction: column;
  }

  nav {
    flex-wrap: wrap;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }
}
`
  };
}

function createEnhancementChanges(
  prompt: string,
  workspace: WorkspaceContext,
  diagnostic: DiagnosticContext
) {
  const websiteContent = createStaticWebsiteContent(diagnostic.inferredDomain);
  const currentHtml = safeFileContent(workspace, "index.html", websiteContent.indexHtml);
  const currentCss = safeFileContent(workspace, "styles.css", websiteContent.stylesCss);
  const currentJs = safeFileContent(workspace, "main.js", websiteContent.mainJs);
  const needsCarousel = /\b(carousel|slider)\b/i.test(prompt);
  const hasCarousel = currentHtml.includes("hassali-carousel");
  const carouselHtml = `
      <section class="hassali-carousel" aria-label="Featured highlights">
        <div class="carousel-copy">
          <p class="eyebrow">Featured</p>
          <h2>Soft motion, clear focus, and a more premium rhythm.</h2>
        </div>
        <div class="carousel-track">
          <article class="carousel-card is-active">
            <span>01</span>
            <strong>Calm first impression</strong>
            <p>Layered glass surfaces and spacious content keep the page easy to scan.</p>
          </article>
          <article class="carousel-card">
            <span>02</span>
            <strong>Polished interaction</strong>
            <p>Subtle slider behavior adds life without making the page feel heavy.</p>
          </article>
          <article class="carousel-card">
            <span>03</span>
            <strong>Responsive detail</strong>
            <p>The section stacks cleanly on smaller screens and preserves the layout.</p>
          </article>
        </div>
        <div class="carousel-controls" aria-label="Carousel controls">
          <button class="carousel-button" data-carousel="prev" type="button">Prev</button>
          <button class="carousel-button" data-carousel="next" type="button">Next</button>
        </div>
      </section>
`;
  const htmlWithCarousel =
    needsCarousel && !hasCarousel
      ? currentHtml.includes("</main>")
        ? currentHtml.replace("</main>", `${carouselHtml}    </main>`)
        : `${currentHtml.trimEnd()}\n${carouselHtml}`
      : currentHtml;
  const enhancementCss = `

/* Hassali safe enhancement: Apple Glass-inspired motion without a full rewrite */
:where(.hero, section, article, .card, .product-card, .feature-card, .collection-card, .carousel-card) {
  transition:
    transform 220ms ease,
    border-color 220ms ease,
    box-shadow 220ms ease,
    opacity 240ms ease;
}

:where(article, .card, .product-card, .feature-card, .collection-card, .carousel-card):hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.26);
}

.hassali-reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 540ms ease, transform 540ms ease;
}

.hassali-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.hassali-carousel {
  display: grid;
  gap: 1rem;
  margin-top: clamp(2rem, 5vw, 4rem);
}

.carousel-copy {
  max-width: 620px;
}

.carousel-track {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.carousel-card {
  min-height: 12rem;
  opacity: 0.58;
}

.carousel-card.is-active {
  opacity: 1;
  transform: translateY(-3px);
  border-color: rgba(214, 177, 109, 0.38);
}

.carousel-card span {
  color: #d6b16d;
  font-size: 0.78rem;
  font-weight: 800;
}

.carousel-card strong {
  display: block;
  margin-top: 0.85rem;
}

.carousel-controls {
  display: flex;
  gap: 0.6rem;
}

.carousel-button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  padding: 0.65rem 0.9rem;
}

@media (max-width: 760px) {
  .carousel-track {
    grid-template-columns: 1fr;
  }
}
`;
  const enhancementJs = `

const revealTargets = document.querySelectorAll(".hero, section, article, .card, .product-card, .feature-card, .collection-card");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((element) => element.classList.add("hassali-reveal"));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealTargets.forEach((element) => revealObserver.observe(element));
}

const carouselCards = Array.from(document.querySelectorAll(".carousel-card"));
let carouselIndex = Math.max(0, carouselCards.findIndex((card) => card.classList.contains("is-active")));

function showCarouselCard(nextIndex) {
  if (carouselCards.length === 0) {
    return;
  }

  carouselIndex = (nextIndex + carouselCards.length) % carouselCards.length;
  carouselCards.forEach((card, index) => {
    card.classList.toggle("is-active", index === carouselIndex);
  });
}

document.querySelector('[data-carousel="prev"]')?.addEventListener("click", () => {
  showCarouselCard(carouselIndex - 1);
});

document.querySelector('[data-carousel="next"]')?.addEventListener("click", () => {
  showCarouselCard(carouselIndex + 1);
});
`;

  return [
    ...(htmlWithCarousel !== currentHtml
      ? [
          {
            action: diagnostic.fileList.includes("index.html") ? ("update" as const) : ("create" as const),
            path: "index.html",
            proposedContent: htmlWithCarousel,
            summary: "Adds a small carousel section while preserving the existing HTML structure."
          }
        ]
      : []),
    {
      action: diagnostic.fileList.includes("styles.css") ? ("update" as const) : ("create" as const),
      path: "styles.css",
      proposedContent: `${currentCss.trimEnd()}${enhancementCss}`,
      summary: "Adds responsive Apple Glass-inspired surfaces, hover states, reveal motion, and carousel styling."
    },
    {
      action: diagnostic.fileList.includes("main.js") ? ("update" as const) : ("create" as const),
      path: "main.js",
      proposedContent: `${currentJs.trimEnd()}${enhancementJs}`,
      summary: "Adds lightweight reveal and carousel controls without shell execution or external packages."
    }
  ];
}

function createLocalProposal(
  prompt: string,
  workspace: WorkspaceContext,
  mode: "SUGGEST" | "EXECUTE",
  diagnostic: DiagnosticContext
): DiffProposal {
  const renameRequest = detectRenameRequest(prompt);

  if (renameRequest) {
    const candidatePaths = workspace.fileList.filter((path) =>
      /\.(css|html|js|json|md|txt|tsx?|jsx?)$/i.test(path)
    );
    const changes = candidatePaths.flatMap((path) => {
      const currentContent = contentForPath(workspace, path);

      if (!currentContent || !new RegExp(escapeRegExp(renameRequest.from), "i").test(currentContent)) {
        return [];
      }

      const proposedContent = currentContent.replace(
        new RegExp(escapeRegExp(renameRequest.from), "gi"),
        renameRequest.to
      );

      return [
        {
          action: "update" as const,
          diffPreview: createDiffPreview("update", path, proposedContent),
          path,
          proposedContent,
          summary: `Replaces "${renameRequest.from}" with "${renameRequest.to}" in ${path}.`
        }
      ];
    });

    return {
      changes,
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        changes.length > 0
          ? `Detected a rename request. I will only replace matching text from "${renameRequest.from}" to "${renameRequest.to}" and leave the structure untouched.`
          : `Detected a rename request, but I could not find "${renameRequest.from}" in the current project files. No file changes are proposed.`,
    };
  }

  if (isEnhancementRequest(prompt)) {
    const changes = createEnhancementChanges(prompt, workspace, diagnostic).map((change) => ({
      ...change,
      diffPreview: createDiffPreview(change.action, change.path, change.proposedContent)
    }));

    return {
      changes: [
        ...changes,
        ...(mode === "EXECUTE"
          ? [
              {
                action: shouldRestartPreview(prompt) ? ("restart_runtime" as const) : ("reload_preview" as const),
                summary: shouldRestartPreview(prompt)
                  ? "Restart the local static preview after the approved enhancement."
                  : "Reload the local preview after the approved enhancement."
              }
            ]
          : [])
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected an existing ${diagnostic.inferredDomain} project. I will add targeted animation, carousel/slider support when requested, and Apple Glass-inspired polish without blanking or rewriting the whole site.`
    };
  }

  if (diagnostic.promptIntent === "animation_or_interaction") {
    const existingCss = diagnostic.keyFiles.stylesCss ?? "";
    const existingJs = diagnostic.keyFiles.mainJs ?? "";
    const hasMainJs = diagnostic.fileList.includes("main.js") || Boolean(diagnostic.keyFiles.mainJs);
    const animationCss = `

/* Hassali diagnostic polish: subtle ${diagnostic.inferredDomain} motion */
:where(.hero, .card, .product-card, .feature-card, .collection-card, .gallery-card) {
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, opacity 220ms ease;
}

:where(.card, .product-card, .feature-card, .collection-card, .gallery-card):hover {
  transform: translateY(-4px);
  border-color: rgba(214, 177, 109, 0.42);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.hassali-reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 520ms ease, transform 520ms ease;
}

.hassali-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
`;
    const animationJs = `

const revealTargets = document.querySelectorAll(".hero, section, .card, .product-card, .feature-card, .collection-card, .gallery-card");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((element) => element.classList.add("hassali-reveal"));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealTargets.forEach((element) => revealObserver.observe(element));
}
`;
    const changes: ProposalChange[] = [
      {
        action: diagnostic.fileList.includes("styles.css") ? "update" : "create",
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes("styles.css") ? "update" : "create",
          "styles.css",
          `${existingCss.trimEnd()}${animationCss}`
        ),
        path: "styles.css",
        proposedContent: `${existingCss.trimEnd()}${animationCss}`,
        summary: `Adds subtle ${diagnostic.inferredDomain} hover and reveal motion without changing the page structure.`
      },
      {
        action: hasMainJs ? "update" : "create",
        diffPreview: createDiffPreview(
          hasMainJs ? "update" : "create",
          "main.js",
          `${existingJs.trimEnd()}${animationJs}`
        ),
        path: "main.js",
        proposedContent: `${existingJs.trimEnd()}${animationJs}`,
        summary: "Adds a tiny IntersectionObserver reveal behavior for existing sections and cards."
      }
    ];

    return {
      changes,
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected a ${diagnostic.inferredDomain} project. I will add targeted CSS/JS animation polish while preserving the existing structure.`
    };
  }

  if (
    diagnostic.promptIntent === "small_style_improvement" &&
    diagnostic.keyFiles.stylesCss &&
    diagnostic.fileList.includes("styles.css")
  ) {
    const proposedContent = `${diagnostic.keyFiles.stylesCss.trimEnd()}

/* Hassali diagnostic polish: restrained premium refinement */
:where(a, button, .button, .btn) {
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

:where(a, button, .button, .btn):hover {
  transform: translateY(-1px);
}

:where(.card, .product-card, .feature-card, .collection-card) {
  backdrop-filter: saturate(115%);
}
`;

    return {
      changes: [
        {
          action: "update",
          diffPreview: createDiffPreview("update", "styles.css", proposedContent),
          path: "styles.css",
          proposedContent,
          summary: "Refines existing styling with restrained premium hover states."
        }
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected a ${diagnostic.inferredDomain} project. I will make a targeted style improvement in CSS without restructuring the site.`
    };
  }

  if (diagnostic.promptIntent === "full_generation") {
    const websiteContent = createStaticWebsiteContent(diagnostic.inferredDomain);
    const standardFiles = [
      {
        content: websiteContent.indexHtml,
        path: "index.html",
        summary: `Creates the semantic ${diagnostic.inferredDomain} website structure.`
      },
      {
        content: websiteContent.stylesCss,
        path: "styles.css",
        summary: "Adds responsive premium styling for the static website."
      },
      {
        content: websiteContent.mainJs,
        path: "main.js",
        summary: "Adds a tiny low-cost interaction for card polish."
      }
    ];
    const changes = [
      ...standardFiles.map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      }))
    ];

    return {
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        mode === "EXECUTE"
          ? hasStandardWebFiles(diagnostic.fileList)
            ? `Detected existing web files. I will update the standard ${diagnostic.inferredDomain} HTML/CSS/JS website files and prepare the preview runtime.`
            : `I will create standard ${diagnostic.inferredDomain} website files: index.html, styles.css, and main.js, then prepare the preview runtime.`
          : hasStandardWebFiles(diagnostic.fileList)
            ? `Detected existing web files. I will update index.html, styles.css, and main.js for this ${diagnostic.inferredDomain} request.`
            : `I will create standard ${diagnostic.inferredDomain} website files: index.html, styles.css, and main.js.`,
      changes: [
        ...changes.map((change) => ({
          ...change,
          diffPreview: createDiffPreview(change.action, change.path, change.proposedContent)
        })),
        ...(mode === "EXECUTE" || shouldRestartPreview(prompt)
          ? [
              {
                action: "restart_runtime" as const,
                summary: "Restart the local static preview after files are approved."
              }
            ]
          : [])
      ]
    };
  }

  const targetPath = workspace.activePath || "notes.md";
  const action = workspace.fileList.includes(targetPath) ? "update" : "create";
  const proposedContent = `${workspace.activeFileContent.trimEnd()}\n\n// Hassali suggestion: ${prompt}\n`;

  return {
    id: `proposal-${Date.now()}`,
    mode,
    projectId: diagnostic.projectId,
    status: "pending",
    summary: `${action === "create" ? "Create" : "Update"} ${targetPath}.`,
    changes: [
      {
        action,
        path: targetPath,
        proposedContent,
        summary: "Adds a local suggestion note without changing files automatically.",
        diffPreview: createDiffPreview(action, targetPath, proposedContent)
      }
    ]
  };
}

function isDiffProposalPayload(value: unknown): value is DiffProposalPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as DiffProposalPayload;

  return (
    typeof payload.summary === "string" &&
    Array.isArray(payload.changes) &&
    payload.changes.every(
      (change) => {
        if (!change || typeof change !== "object" || typeof change.summary !== "string") {
          return false;
        }

        if (isRuntimeProposalAction(change.action)) {
          return true;
        }

        return (
          isFileProposalAction(change.action) &&
          typeof change.path === "string" &&
          typeof change.proposedContent === "string" &&
          (typeof change.diffPreview === "undefined" || typeof change.diffPreview === "string")
        );
      }
    )
  );
}

function parseDiffProposalContent(content: string) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return null;
  }

  const fencedJsonMatch = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmedContent;

  try {
    const parsed = JSON.parse(candidate) as unknown;

    return isDiffProposalPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createResponseHeaders(sessionId?: string | null) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  };

  if (sessionId) {
    headers["x-hassali-chat-session-id"] = sessionId;
  }

  return headers;
}

function createTextStream(content: string, sessionId?: string | null) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(sessionId)
    }
  );
}

async function createPersistenceContext(input: {
  mode: AiMode;
  projectId?: string | null;
  sessionId?: string | null;
}) {
  if (!input.projectId) {
    return null;
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      console.info("chat persistence skipped", { reason: "no_clerk_user" });
      return null;
    }

    const context = await resolveChatPersistenceContext({
      externalUserId: userId,
      mode: input.mode,
      projectId: input.projectId,
      sessionId: input.sessionId ?? null
    });

    console.info("chat persistence context", {
      hasContext: Boolean(context),
      projectId: input.projectId,
      sessionId: context?.sessionId ?? null
    });

    return context satisfies ChatPersistenceContext | null;
  } catch (error) {
    console.error(
      "chat persistence context failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return null;
  }
}

async function persistChatMessage(
  context: ChatPersistenceContext | null,
  input: {
    content: string;
    metadata?: Record<string, unknown>;
    role: "user" | "assistant";
  }
) {
  if (!context || input.content.trim().length === 0) {
    console.info("chat message persistence skipped", {
      hasContext: Boolean(context),
      role: input.role
    });
    return context;
  }

  try {
    const saved = await saveChatMessage({
      content: input.content,
      metadata: input.metadata,
      mode: context.mode,
      projectId: context.projectId,
      role: input.role,
      sessionId: context.sessionId,
      userId: context.userId
    });

    console.info("chat message saved", {
      role: input.role,
      sessionId: saved.session.id
    });

    return {
      ...context,
      sessionId: saved.session.id
    };
  } catch (error) {
    console.error(
      "chat message save failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return context;
  }
}

function createProposalStream(proposal: DiffProposal, sessionId?: string | null) {
  const encoder = new TextEncoder();
  const visibleSummary =
    proposal.mode === "EXECUTE"
      ? "I prepared an execution proposal for review. Nothing runs until you approve it.\n\n"
      : "I prepared a diff proposal for review. It will only apply if you approve it.\n\n";
  const payload = `${proposalMarker}${JSON.stringify(proposal)}`;

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(visibleSummary));
        controller.enqueue(encoder.encode(payload));
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(sessionId)
    }
  );
}

async function createFallbackProposalResponse(input: {
  diagnostic: DiagnosticContext;
  mode: "SUGGEST" | "EXECUTE";
  model: string;
  persistence: ChatPersistenceContext | null;
  prompt: string;
  reason: string;
  workspace: WorkspaceContext;
}) {
  const proposal = createLocalProposal(input.prompt, input.workspace, input.mode, input.diagnostic);
  let persistence = input.persistence;
  const visibleSummary =
    input.mode === "EXECUTE"
      ? "I prepared a safe local execution proposal for review. Nothing runs until you approve it."
      : "I prepared a safe local diff proposal for review. It will only apply if you approve it.";

  persistence = await persistChatMessage(persistence, {
    content: visibleSummary,
    metadata: {
      fallbackReason: input.reason,
      model: input.model,
      proposal
    },
    role: "assistant"
  });

  return createProposalStream(proposal, persistence?.sessionId);
}

function createOpenRouterTextStream(
  response: Response,
  options?: {
    onComplete?: (content: string) => Promise<void>;
    sessionId?: string | null;
  }
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();

  if (!reader) {
    return createPlaceholderStream(fallbackModel, options);
  }

  let buffer = "";
  let streamedContent = "";

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmedLine = line.trim();

              if (!trimmedLine.startsWith("data:")) {
                continue;
              }

              const data = trimmedLine.slice(5).trim();

              if (data === "[DONE]") {
                continue;
              }

              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{
                    delta?: {
                      content?: string;
                    };
                  }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  streamedContent += content;
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                continue;
              }
            }
          }
        } finally {
          await options?.onComplete?.(streamedContent);
          controller.close();
          reader.releaseLock();
        }
      }
    }),
    {
      headers: createResponseHeaders(options?.sessionId)
    }
  );
}

function createPlaceholderStream(
  model: string,
  options?: {
    onComplete?: (content: string) => Promise<void>;
    sessionId?: string | null;
  }
) {
  const encoder = new TextEncoder();
  const chunks = [
    `Streaming placeholder active for ${model}.\n\n`,
    "Add OPENROUTER_API_KEY to enable live OpenRouter responses. ",
    "Usage tracking hooks are reserved for a later phase."
  ];

  return new Response(
    new ReadableStream({
      async start(controller) {
        let content = "";

        for (const chunk of chunks) {
          content += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        await options?.onComplete?.(content);
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(options?.sessionId)
    }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    chatSessionId?: unknown;
    messages?: unknown;
    mode?: unknown;
    model?: unknown;
    projectId?: unknown;
    workspace?: unknown;
  } | null;

  const messages = Array.isArray(body?.messages)
    ? body.messages.filter(isChatMessage).map<ChatRequestMessage>((message) => ({
        role: message.role,
        content: message.content
      }))
    : [];

  if (messages.length === 0) {
    return Response.json({ error: "A user message is required." }, { status: 400 });
  }

  const model =
    typeof body?.model === "string" && body.model.trim().length > 0
      ? body.model.trim()
      : process.env.HASSALI_DEFAULT_MODEL || fallbackModel;
  const mode: AiMode =
    body?.mode === "SUGGEST" || body?.mode === "EXECUTE" || body?.mode === "ASK"
      ? body.mode
      : "ASK";
  const workspace = isWorkspaceContext(body?.workspace)
    ? body.workspace
    : {
        activeFileContent: "",
        activePath: "welcome.ts",
        fileContents: {},
        fileList: [],
        projectName: null
      };
  const latestUserPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const requestedProjectId = typeof body?.projectId === "string" ? body.projectId : null;
  const diagnostic = buildDiagnosticContext({
    projectId: requestedProjectId,
    projectName: workspace.projectName ?? null,
    prompt: latestUserPrompt,
    runtime: getRuntimeStatus(),
    workspace
  });
  const formattedDiagnostic = formatDiagnosticContext(diagnostic);
  const requestedSessionId = typeof body?.chatSessionId === "string" ? body.chatSessionId : null;
  let persistence = await createPersistenceContext({
    mode,
    projectId: requestedProjectId,
    sessionId: requestedSessionId
  });

  persistence = await persistChatMessage(persistence, {
    content: latestUserPrompt,
    metadata: {
      model,
      workspace: {
        activePath: workspace.activePath,
        diagnosis: diagnostic.diagnosis,
        editScope: diagnostic.editScope,
        fileList: workspace.fileList,
        inferredDomain: diagnostic.inferredDomain,
        promptIntent: diagnostic.promptIntent
      }
    },
    role: "user"
  });

  if ((mode === "SUGGEST" || mode === "EXECUTE") && !process.env.OPENROUTER_API_KEY) {
    const proposal = createLocalProposal(latestUserPrompt, workspace, mode, diagnostic);
    const visibleSummary =
      mode === "EXECUTE"
        ? "I prepared an execution proposal for review. Nothing runs until you approve it."
        : "I prepared a diff proposal for review. It will only apply if you approve it.";

    persistence = await persistChatMessage(persistence, {
      content: visibleSummary,
      metadata: {
        model,
        proposal
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return createPlaceholderStream(model, {
      onComplete: async (content) => {
        persistence = await persistChatMessage(persistence, {
          content,
          metadata: { model },
          role: "assistant"
        });
      },
      sessionId: persistence?.sessionId
    });
  }

  if (mode === "SUGGEST" || mode === "EXECUTE") {
    let response: Response;

    try {
      response = await fetch(openRouterChatCompletionsUrl, {
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                `You are Hassali.ai in ${mode} mode. Return only one JSON object with this exact shape: ` +
                `{ "summary": string, "changes": [{ "path": string, "action": "create" | "update", "summary": string, "proposedContent": string } | { "action": "restart_runtime" | "reload_preview" | "stop_runtime", "summary": string }] }. ` +
                `You may include multiple file changes. Use action "create" for new files and "update" for existing files. ` +
                `Only include safe runtime actions when the user asks to start, restart, reload, or stop preview. Do not include shell commands, package installs, Docker, or destructive deletes. ` +
                `Do not use markdown. Do not mutate files. Use the diagnostic context. For vague prompts, preserve existing structure and prefer targeted edits. ` +
                `For vague create/build website requests without clear web files, propose standard static files: index.html, styles.css, and main.js. ` +
                `The proposal summary must mention what you detected and the safe treatment. Diagnostic context:\n${formattedDiagnostic}`
            },
            ...messages
          ],
          model,
          stream: false
        }),
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
    } catch {
      return createFallbackProposalResponse({
        diagnostic,
        mode,
        model,
        persistence,
        prompt: latestUserPrompt,
        reason: "openrouter_network_error",
        workspace
      });
    }

    if (!response.ok) {
      return createFallbackProposalResponse({
        diagnostic,
        mode,
        model,
        persistence,
        prompt: latestUserPrompt,
        reason: `openrouter_${response.status}`,
        workspace
      });
    }

    const completion = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = completion.choices?.[0]?.message?.content ?? "";
    const parsed = parseDiffProposalContent(content);

    if (
      !parsed ||
      parsed.changes.some(
        (change) =>
          isFileProposalAction(change.action) &&
          (!change.path || !change.proposedContent || change.proposedContent.trim().length === 0)
      )
    ) {
      return createFallbackProposalResponse({
        diagnostic,
        mode,
        model,
        persistence,
        prompt: latestUserPrompt,
        reason: "invalid_or_empty_model_proposal",
        workspace
      });
    }

    const proposal: DiffProposal = {
      id: `proposal-${Date.now()}`,
      mode,
      projectId: requestedProjectId,
      status: "pending",
      summary: `${diagnostic.diagnosis} ${parsed.summary}`,
      changes: parsed.changes.map((change) => {
        if (isRuntimeProposalAction(change.action)) {
          return {
            action: change.action,
            summary: change.summary
          };
        }

        return {
          action: change.action,
          diffPreview:
            change.diffPreview ??
            createDiffPreview(
              change.action,
              change.path ?? "untitled.txt",
              change.proposedContent ?? ""
            ),
          path: change.path,
          proposedContent: change.proposedContent,
          summary: change.summary
        };
      })
    };

    persistence = await persistChatMessage(persistence, {
      content: proposal.summary,
      metadata: {
        model,
        proposal
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  const response = await fetch(openRouterChatCompletionsUrl, {
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            `You are Hassali.ai in ASK mode. Keep answers concise and do not edit files from chat. ` +
            `Current mode: ${mode}. Active file: ${workspace.activePath}. Files: ${workspace.fileList.join(", ")}.`
        },
        ...messages
      ],
      model,
      stream: true
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    return Response.json({ error: "OpenRouter chat request failed." }, { status: response.status });
  }

  return createOpenRouterTextStream(response, {
    onComplete: async (content) => {
      persistence = await persistChatMessage(persistence, {
        content,
        metadata: { model },
        role: "assistant"
      });
    },
    sessionId: persistence?.sessionId
  });
}
