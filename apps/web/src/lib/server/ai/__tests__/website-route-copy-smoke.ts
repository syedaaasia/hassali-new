import assert from "node:assert/strict";
import { POST } from "@/app/api/ai/chat/route";

type Proposal = {
  changes: Array<{ path?: string; proposedContent?: string }>;
  shouldBlockExecution?: boolean;
  staleTermScanStatus?: string;
  websiteCopyValidationStatus?: string;
  websitePreviewIdentity?: string;
};

async function generate(prompt: string) {
  const response = await POST(new Request("http://localhost/api/ai/chat", {
    body: JSON.stringify({
      messages: [{ content: prompt, role: "user" }],
      mode: "EXECUTE",
      model: "tencent/hy3:free",
      modelSelectionPolicy: "locked",
      productMode: "WEBSITE",
      workspace: {
        activeFileContent: "",
        activePath: "",
        fileContents: {},
        fileList: [],
        projectName: null
      }
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }));
  const text = await response.text();
  const marker = "HASSALI_DIFF_PROPOSAL:";
  const payload = text.slice(text.indexOf(marker) + marker.length);
  assert.ok(text.includes(marker), `Expected a WEBSITE proposal for: ${prompt}. Status ${response.status}: ${text.slice(0, 500)}`);
  assert.equal(response.status, 200);
  return JSON.parse(payload) as Proposal;
}

function publicHtml(proposal: Proposal) {
  return proposal.changes
    .filter((change) => change.path?.endsWith(".html"))
    .map((change) => change.proposedContent ?? "")
    .join("\n");
}

const cases = [
  {
    absent: /SaaS|software|fake testimonial|guaranteed delivery/i,
    expected: /wedding flowers|event arrangements|event planners/i,
    name: "florist",
    prompt: "Create a website for an online wedding-flower supplier serving event planners."
  },
  {
    absent: /skincare|SaaS|award-winning|exhibition history/i,
    expected: /original artwork|collector|artist portfolio/i,
    name: "artist",
    prompt: "Create a portfolio for a New York-based artist selling original artwork."
  },
  {
    absent: /clinically proven|dermatologist approved|original artwork|wedding flower/i,
    expected: /Korean beauty|skincare|Browse the collection/i,
    name: "beauty",
    prompt: "Create an ecommerce site for a Korean beauty brand."
  },
  {
    absent: /luxury collection|wedding flower|trusted by \d/i,
    expected: /lead follow-up|small service businesses|next-action/i,
    name: "saas",
    prompt: "Create a website for software that helps small service businesses follow up with leads."
  },
  {
    absent: /restaurant|reservation|dining|menu items|chef|current prompt website/i,
    expected: /neighborhood bakery|fresh bread|cakes|pastries|daily bakes/i,
    name: "bakery",
    prompt: "Create a simple responsive website for a neighborhood bakery with home, about, and contact pages."
  },
  {
    absent: /grooming|cleaning|laundry|care options|service packages|current prompt website|explain the offer|show representative products|invite direct confirmation|ask how this/i,
    expected: /television|electronics|LCD|LED|OLED|QLED|display|home cinema/i,
    expectedPages: ["about.html", "index.html", "services.html"],
    expectCleanSovereignty: true,
    name: "tv-lcd",
    prompt: "Build me a website for my local TV LCD business with 3 pages."
  }
];

for (const item of cases) {
  const proposal = await generate(item.prompt);
  const html = publicHtml(proposal);
  if (item.expectCleanSovereignty) assert.notEqual(proposal.staleTermScanStatus, "blocked");
  assert.notEqual(proposal.websiteCopyValidationStatus, "blocked");
  assert.match(proposal.websitePreviewIdentity ?? "", /^website-[a-f0-9]{8}$/);
  assert.match(html, item.expected);
  assert.equal(html.match(item.absent)?.[0] ?? null, null, `${item.name} leaked unrelated or internal visitor copy`);
  assert.doesNotMatch(html, /\[Business Name\]|Lorem ipsum|Your tagline here|Current Prompt Website/i);
  assert.match(html, /hassali-preview-identity/);
  if (item.expectedPages) {
    const pages = proposal.changes
      .flatMap((change) => change.path?.endsWith(".html") ? [change.path] : [])
      .sort();
    assert.deepEqual(pages, item.expectedPages);
  }
  console.log(`PASS route ${item.name}`);
}

console.log(`WEBSITE route copy smoke: ${cases.length}/${cases.length} passed`);
