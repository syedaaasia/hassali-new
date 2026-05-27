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
import {
  buildDecisionPlan,
  scoreProposalQuality,
  shouldUseDeterministicDecision,
  type DecisionPlan
} from "@/lib/server/ai/decision-engine";
import { generateComposedSiteFiles, generateDomainSite } from "@/lib/server/ai/domain-site-generator";
import {
  buildIntentIntelligence,
  type IntentIntelligence
} from "@/lib/server/ai/intent-intelligence";
import {
  buildCompositionStrategy,
  type CompositionStrategy
} from "@/lib/server/ai/reasoning-composition";
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

function isInvoiceRequest(prompt: string) {
  return /\binvoice\b/i.test(prompt);
}

function contentForPath(workspace: WorkspaceContext, path: string) {
  return workspace.fileContents?.[path] ?? (workspace.activePath === path ? workspace.activeFileContent : "");
}

function safeFileContent(workspace: WorkspaceContext, path: string, fallback: string) {
  const content = contentForPath(workspace, path);

  return content.trim().length > 0 ? content : fallback;
}

function createStaticWebsiteContent(domain: DiagnosticContext["inferredDomain"]) {
  return generateDomainSite(domain);
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
    ...(htmlWithCarousel !== currentHtml || !diagnostic.fileList.includes("index.html")
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

function createInvoiceContent() {
  return {
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoice</title>
    <link rel="stylesheet" href="./invoice.css" />
  </head>
  <body>
    <main class="invoice-page">
      <section class="invoice">
        <header class="invoice-header">
          <div>
            <p class="eyebrow">Invoice</p>
            <h1>Professional Service Invoice</h1>
            <p class="muted">Use the button below to print or save this invoice as a PDF.</p>
          </div>
          <button class="print-button" id="print-invoice" type="button">Save as PDF</button>
        </header>
        <section class="invoice-grid">
          <div>
            <h2>From</h2>
            <p>Your Company Name</p>
            <p>hello@example.com</p>
          </div>
          <div>
            <h2>Bill To</h2>
            <p>Client Name</p>
            <p>client@example.com</p>
          </div>
          <div>
            <h2>Invoice No.</h2>
            <p>INV-001</p>
          </div>
          <div>
            <h2>Date</h2>
            <p>May 24, 2026</p>
          </div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Website Design</td>
              <td>Premium static website design and implementation.</td>
              <td>$500.00</td>
            </tr>
            <tr>
              <td>Revision</td>
              <td>Final polish, responsive checks, and handoff.</td>
              <td>$100.00</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total</td>
              <td>$600.00</td>
            </tr>
          </tfoot>
        </table>
        <section class="terms">
          <h2>Payment Terms</h2>
          <p>Payment is due within 7 days. Thank you for your business.</p>
        </section>
      </section>
    </main>
    <script src="./invoice.js"></script>
  </body>
</html>
`,
    js: `document.querySelector("#print-invoice")?.addEventListener("click", () => {
  window.print();
});
`,
    css: `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f3f5f9;
  color: #162033;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.invoice-page {
  min-height: 100vh;
  padding: clamp(1rem, 4vw, 3rem);
}

.invoice {
  max-width: 900px;
  margin: 0 auto;
  border: 1px solid rgba(22, 32, 51, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.12);
  padding: clamp(1.5rem, 5vw, 3rem);
}

.invoice-header,
.invoice-grid,
tfoot tr {
  display: grid;
  gap: 1rem;
}

.invoice-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-bottom: 1px solid rgba(22, 32, 51, 0.12);
  padding-bottom: 1.5rem;
}

.eyebrow {
  color: #e6004c;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: clamp(2rem, 6vw, 4rem);
  letter-spacing: -0.04em;
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: #64748b;
}

.muted,
.terms p {
  margin-top: 0.7rem;
  color: #64748b;
}

.print-button {
  border: 0;
  border-radius: 999px;
  background: #e6004c;
  color: #fff;
  cursor: pointer;
  padding: 0.8rem 1rem;
  font-weight: 800;
}

.invoice-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 1.5rem 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 18px;
}

th,
td {
  border-bottom: 1px solid rgba(22, 32, 51, 0.1);
  padding: 1rem;
  text-align: left;
}

th {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.78rem;
  text-transform: uppercase;
}

td:last-child,
th:last-child {
  text-align: right;
}

tfoot td {
  border-bottom: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.terms {
  margin-top: 1.5rem;
}

@media (max-width: 720px) {
  .invoice-header,
  .invoice-grid {
    grid-template-columns: 1fr;
  }
}

@media print {
  body {
    background: #fff;
  }

  .invoice-page {
    padding: 0;
  }

  .invoice {
    border: 0;
    box-shadow: none;
  }

  .print-button {
    display: none;
  }
}
`
  };
}

function createLocalProposal(
  prompt: string,
  workspace: WorkspaceContext,
  mode: "SUGGEST" | "EXECUTE",
  diagnostic: DiagnosticContext,
  decision: DecisionPlan,
  intent: IntentIntelligence,
  composition: CompositionStrategy
): DiffProposal {
  const renameRequest = detectRenameRequest(prompt);

  if (mode === "EXECUTE" && isInvoiceRequest(prompt)) {
    const invoiceContent = createInvoiceContent();
    const files = [
      {
        content: invoiceContent.html,
        path: "invoice.html",
        summary: "Creates printable invoice wording and structure."
      },
      {
        content: invoiceContent.css,
        path: "invoice.css",
        summary: "Styles the invoice for screen and print/PDF output."
      },
      {
        content: invoiceContent.js,
        path: "invoice.js",
        summary: "Adds a Save as PDF button using the browser print dialog."
      }
    ];

    return {
      changes: files.map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes(file.path) ? "update" : "create",
          file.path,
          file.content
        ),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      })),
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        "Detected an invoice request. I will create invoice wording plus a print-ready invoice page that can be saved as PDF after approval."
    };
  }

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

  if (decision.requestType === "image_fix") {
    const websiteContent = createStaticWebsiteContent(diagnostic.inferredDomain);
    const currentHtml = safeFileContent(workspace, "index.html", websiteContent.indexHtml);
    const imageSources = Array.from(websiteContent.indexHtml.matchAll(/<img\s+src="([^"]+)"/gi)).map(
      (match) => match[1]
    );
    let imageIndex = 0;
    const proposedHtml = currentHtml.includes("<img")
      ? currentHtml.replace(/<img([^>]*?)src="[^"]+"([^>]*?)>/gi, (match, before, after) => {
          const nextSource = imageSources[imageIndex % Math.max(1, imageSources.length)] ?? "";
          imageIndex += 1;

          return nextSource ? `<img${before}src="${nextSource}"${after}>` : match;
        })
      : websiteContent.indexHtml;
    const currentCss = safeFileContent(workspace, "styles.css", websiteContent.stylesCss);
    const imageCss = `

/* Hassali image safety: keep remote images responsive and cropped cleanly */
img {
  display: block;
  max-width: 100%;
  object-fit: cover;
}
`;

    return {
      changes: [
        {
          action: diagnostic.fileList.includes("index.html") ? "update" : "create",
          diffPreview: createDiffPreview(
            diagnostic.fileList.includes("index.html") ? "update" : "create",
            "index.html",
            proposedHtml
          ),
          path: "index.html",
          proposedContent: proposedHtml,
          summary: `Replaces broken or generic imagery with safe ${diagnostic.inferredDomain} image sources.`
        },
        {
          action: diagnostic.fileList.includes("styles.css") ? "update" : "create",
          diffPreview: createDiffPreview(
            diagnostic.fileList.includes("styles.css") ? "update" : "create",
            "styles.css",
            `${currentCss.trimEnd()}${imageCss}`
          ),
          path: "styles.css",
          proposedContent: `${currentCss.trimEnd()}${imageCss}`,
          summary: "Ensures images remain responsive and do not break the layout."
        },
        ...(mode === "EXECUTE"
          ? [
              {
                action: "reload_preview" as const,
                summary: "Reload the local preview after approved image fixes."
              }
            ]
          : [])
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected an image fix request for a ${diagnostic.inferredDomain} project. I will update imagery only and avoid regenerating unrelated layout.`
    };
  }

  if (
    isEnhancementRequest(prompt) &&
    decision.requestType !== "website_generation" &&
    decision.requestType !== "multi_page_generation"
  ) {
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

  if (decision.requestType === "website_generation" || decision.requestType === "multi_page_generation") {
    const websiteFiles = generateComposedSiteFiles({ composition, intent });
    const generatedFileNames = Object.keys(websiteFiles);
    const standardFiles = Object.entries(websiteFiles).map(([path, content]) => ({
      content,
      path,
      summary:
        path === "styles.css"
          ? "Adds responsive premium styling for the static website."
          : path === "main.js"
            ? "Adds lightweight interactions for motion, hover polish, and reveal behavior."
            : `Creates the ${path.replace(".html", "")} page for the ${composition.businessType} website.`
    }));
    const changes = [
      ...standardFiles.filter((file) => file.content.trim().length > 0).map((file) => ({
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
            ? `Using composition-driven generation for ${composition.businessType}. I will update ${generatedFileNames.join(", ")} and prepare the preview runtime.`
            : `Using composition-driven generation for ${composition.businessType}. I will create ${generatedFileNames.join(", ")} and prepare the preview runtime.`
          : hasStandardWebFiles(diagnostic.fileList)
            ? `Using composition-driven generation for ${composition.businessType}. I will update ${generatedFileNames.join(", ")}.`
            : `Using composition-driven generation for ${composition.businessType}. I will create ${generatedFileNames.join(", ")}.`,
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

function addCompositionDebugSummary(
  proposal: DiffProposal,
  intent: IntentIntelligence,
  composition: CompositionStrategy
): DiffProposal {
  const palette = intent.palette.length
    ? intent.palette.join("/")
    : composition.visualLanguage.palette.join("/");
  const style = intent.visualStyle.length
    ? intent.visualStyle.join(", ")
    : composition.visualLanguage.style.join(", ");

  return {
    ...proposal,
    summary:
      `Composition-driven generation active. Business: ${composition.businessType}. ` +
      `Audience: ${composition.audience.join(", ")}. Pages: ${composition.siteArchitecture.pageCount}. ` +
      `Palette: ${palette}. Style: ${style}. ` +
      `Intent: ${intent.summary} Composition: ${composition.reasoningSummary} ${proposal.summary}`
  };
}

async function createFallbackProposalResponse(input: {
  composition: CompositionStrategy;
  diagnostic: DiagnosticContext;
  decision: DecisionPlan;
  intent: IntentIntelligence;
  mode: "SUGGEST" | "EXECUTE";
  model: string;
  persistence: ChatPersistenceContext | null;
  prompt: string;
  reason: string;
  workspace: WorkspaceContext;
}) {
  const proposal = createLocalProposal(
    input.prompt,
    input.workspace,
    input.mode,
    input.diagnostic,
    input.decision,
    input.intent,
    input.composition
  );
  const proposalWithIntent = addCompositionDebugSummary(proposal, input.intent, input.composition);
  let persistence = input.persistence;
  const visibleSummary =
    input.mode === "EXECUTE"
      ? "I prepared a safe local execution proposal for review. Nothing runs until you approve it."
      : "I prepared a safe local diff proposal for review. It will only apply if you approve it.";

  persistence = await persistChatMessage(persistence, {
    content: visibleSummary,
    metadata: {
      fallbackReason: input.reason,
      composition: input.composition,
      intent: input.intent,
      qualityDecision: input.decision,
      model: input.model,
      proposal: proposalWithIntent
    },
    role: "assistant"
  });

  return createProposalStream(proposalWithIntent, persistence?.sessionId);
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
  const decision = buildDecisionPlan({
    diagnostic,
    prompt: latestUserPrompt
  });
  const intent = buildIntentIntelligence({
    fileList: workspace.fileList,
    projectName: workspace.projectName ?? null,
    prompt: latestUserPrompt
  });
  const composition = buildCompositionStrategy(intent);

  if (mode === "SUGGEST" || mode === "EXECUTE") {
    console.info("intent intelligence", intent);
    console.info("composition strategy", composition);
  }

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
        composition,
        diagnosis: diagnostic.diagnosis,
        decision,
        editScope: diagnostic.editScope,
        fileList: workspace.fileList,
        inferredDomain: diagnostic.inferredDomain,
        intent,
        promptIntent: diagnostic.promptIntent
      }
    },
    role: "user"
  });

  const shouldUseDeterministicProposal =
    (mode === "SUGGEST" || mode === "EXECUTE") &&
    (shouldUseDeterministicDecision(decision) ||
      isEnhancementRequest(latestUserPrompt) ||
      Boolean(detectRenameRequest(latestUserPrompt)) ||
      (mode === "EXECUTE" && isInvoiceRequest(latestUserPrompt)));

  if (
    (mode === "SUGGEST" || mode === "EXECUTE") &&
    (shouldUseDeterministicProposal || !process.env.OPENROUTER_API_KEY)
  ) {
    const proposal = addCompositionDebugSummary(
      createLocalProposal(
        latestUserPrompt,
        workspace,
        mode,
        diagnostic,
        decision,
        intent,
        composition
      ),
      intent,
      composition
    );
    const visibleSummary =
      mode === "EXECUTE"
        ? "I prepared an execution proposal for review. Nothing runs until you approve it."
        : "I prepared a diff proposal for review. It will only apply if you approve it.";

    persistence = await persistChatMessage(persistence, {
      content: visibleSummary,
      metadata: {
        composition,
        model,
        intent,
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
                `For multi-page requests, satisfy the required page files exactly. Decision plan: ${JSON.stringify(decision)}. ` +
                `Intent intelligence: ${JSON.stringify(intent)}. ` +
                `Reasoning composition: ${JSON.stringify(composition)}. ` +
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
        composition,
        diagnostic,
        decision,
        intent,
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
        composition,
        diagnostic,
        decision,
        intent,
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
        composition,
        diagnostic,
        decision,
        intent,
        mode,
        model,
        persistence,
        prompt: latestUserPrompt,
        reason: "invalid_or_empty_model_proposal",
        workspace
      });
    }

    const proposal: DiffProposal = addCompositionDebugSummary({
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
    }, intent, composition);
    const quality = scoreProposalQuality({
      changes: proposal.changes,
      composition,
      decision,
      existingFileList: workspace.fileList,
      intent
    });

    if (!quality.passed) {
      return createFallbackProposalResponse({
        composition,
        diagnostic,
        decision,
        intent,
        mode,
        model,
        persistence,
        prompt: latestUserPrompt,
        reason: `quality_score_${quality.score}_${quality.issues.join(",")}`,
        workspace
      });
    }

    persistence = await persistChatMessage(persistence, {
      content: proposal.summary,
      metadata: {
        composition,
        intent,
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

