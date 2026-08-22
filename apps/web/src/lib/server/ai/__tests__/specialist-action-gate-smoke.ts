import assert from "node:assert/strict";
import { POST } from "@/app/api/ai/chat/route";
import { hassaliChatContractVersion } from "@/lib/chat-contract";

type ChatMessage = {
  content: string;
  role: "assistant" | "user";
};

async function post(input: {
  messages: ChatMessage[];
  productMode: "ASK" | "CODE" | "WEBSITE";
  workspace?: {
    activeFileContent?: string;
    activePath?: string;
    fileContents?: Record<string, string>;
    fileList?: string[];
    projectName?: string | null;
  };
}) {
  return POST(new Request("http://localhost/api/ai/chat", {
    body: JSON.stringify({
      clientContractVersion: hassaliChatContractVersion,
      messages: input.messages,
      mode: input.productMode === "ASK" ? "ASK" : "EXECUTE",
      model: "tencent/hy3:free",
      modelSelectionPolicy: "locked",
      productMode: input.productMode,
      workspace: {
        activeFileContent: "",
        activePath: "",
        fileContents: {},
        fileList: [],
        projectName: null,
        ...input.workspace
      }
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }));
}

function assertNonMutatingHeaders(response: Response, disposition: "answer" | "plan") {
  assert.equal(response.headers.get("x-hassali-final-disposition"), disposition);
  assert.equal(response.headers.get("x-hassali-final-answer-only"), "true");
  assert.equal(response.headers.get("x-hassali-final-mutation-requested"), "false");
  assert.equal(response.headers.get("x-hassali-final-approval-required"), "false");
  assert.equal(response.headers.get("x-hassali-final-execution-allowed"), "false");
  assert.equal(response.headers.get("x-hassali-intelligence-agents"), "0");
  assert.equal(response.headers.get("x-hassali-intelligence-skills"), "");
  assert.equal(response.headers.get("x-hassali-intelligence-tools"), "");
}

const previousKey = process.env.OPENROUTER_API_KEY;
const previousFetch = globalThis.fetch;
const providerPayloads: string[] = [];
let fixture: "database" | "hero" | "plan" | "redis" = "database";

try {
  process.env.OPENROUTER_API_KEY = "test-key-not-a-real-secret";
  globalThis.fetch = async (_request, init) => {
    const payload = String(init?.body ?? "");
    providerPayloads.push(payload);
    const content = fixture === "database"
      ? "Use Postgres as the default for a multi-tenant SaaS. Relational constraints, transactions, row-level security, and mature migrations fit tenant isolation well; choose MongoDB only when the data is genuinely document-shaped and consistency is application-managed."
      : fixture === "hero"
        ? "For better hero-section conversions, lead with one concrete customer outcome, one supporting proof point, and one primary CTA. Keep the hero hierarchy tight, preserve readable contrast, make the CTA obvious on mobile, and test proof placement before adding decorative motion."
        : fixture === "plan"
          ? "Step-by-step plan to migrate this app to Postgres:\n1. Inventory the current app data model and queries.\n2. Design the Postgres schema and tenant boundaries.\n3. Prepare a reversible migration and dual-read validation.\n4. Verify counts, permissions, and rollback before cutover."
          : "Use Redis for bounded, disposable cache data around expensive Node API reads. Define keys, TTLs, invalidation ownership, stampede protection, and metrics before caching; never treat Redis as the only durable record.";
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
      model: "tencent/hy3:free"
    }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };

  const codeQuestion = await post({
    messages: [{ content: "Which database should I use for a multi-tenant SaaS?", role: "user" }],
    productMode: "CODE"
  });
  const codeText = await codeQuestion.text();
  assert.equal(codeQuestion.status, 200);
  assertNonMutatingHeaders(codeQuestion, "answer");
  assert.equal(codeQuestion.headers.get("x-hassali-final-intent-class"), "RECOMMENDATION");
  assert.equal(codeQuestion.headers.get("x-hassali-intelligence-plan"), "DIRECT");
  assert.match(codeText, /Postgres|tenant isolation/i);
  assert.doesNotMatch(codeText, /HASSALI_DIFF_PROPOSAL|Kernel classified|approval required/i);

  fixture = "hero";
  const websiteQuestion = await post({
    messages: [{ content: "How should I improve the hero section for conversions?", role: "user" }],
    productMode: "WEBSITE"
  });
  const websiteText = await websiteQuestion.text();
  assertNonMutatingHeaders(websiteQuestion, "answer");
  assert.match(websiteText, /CTA|proof|hierarchy/i);
  assert.doesNotMatch(websiteText, /HASSALI_DIFF_PROPOSAL|website proposal|files? (?:were|will be) changed/i);

  fixture = "plan";
  const planQuestion = await post({
    messages: [{ content: "Give me a step-by-step plan to migrate this app to Postgres.", role: "user" }],
    productMode: "CODE"
  });
  const planText = await planQuestion.text();
  assertNonMutatingHeaders(planQuestion, "plan");
  assert.equal(planQuestion.headers.get("x-hassali-final-intent-class"), "PLAN_ONLY");
  assert.equal(planQuestion.headers.get("x-hassali-intelligence-plan"), "PLAN");
  assert.match(planText, /1\.[\s\S]*2\.[\s\S]*3\./);
  assert.doesNotMatch(planText, /HASSALI_DIFF_PROPOSAL/);

  fixture = "redis";
  const staleContext = await post({
    messages: [
      { content: "Build a Korean beauty ecommerce website for Seoul Glow.", role: "user" },
      { content: "The Seoul Glow website proposal is ready.", role: "assistant" },
      { content: "Explain Redis caching for a Node API.", role: "user" }
    ],
    productMode: "CODE",
    workspace: {
      activeFileContent: "brandName: Seoul Glow\nindustry: Korean beauty ecommerce",
      activePath: "HASSALI.website.md",
      fileContents: {
        "HASSALI.website.md": "brandName: Seoul Glow\nindustry: Korean beauty ecommerce"
      },
      fileList: ["HASSALI.website.md"],
      projectName: "Seoul Glow"
    }
  });
  const staleContextText = await staleContext.text();
  assertNonMutatingHeaders(staleContext, "answer");
  assert.equal(staleContext.headers.get("x-hassali-final-topic-shift"), "true");
  assert(Number(staleContext.headers.get("x-hassali-final-context-excluded")) >= 2);
  assert.match(staleContextText, /Redis|TTL|cache/i);
  assert.doesNotMatch(staleContextText, /Seoul Glow|Korean beauty|ecommerce/i);
  assert.doesNotMatch(providerPayloads.at(-1) ?? "", /Seoul Glow|Korean beauty ecommerce/i);

  const mutation = await post({
    messages: [{ content: "Build a todo app in the current project.", role: "user" }],
    productMode: "CODE"
  });
  const mutationText = await mutation.text();
  assert.equal(mutation.headers.get("x-hassali-final-disposition"), "request_approval");
  assert.equal(mutation.headers.get("x-hassali-final-answer-only"), "false");
  assert.equal(mutation.headers.get("x-hassali-final-mutation-requested"), "true");
  assert.equal(mutation.headers.get("x-hassali-final-approval-required"), "true");
  assert.equal(mutation.headers.get("x-hassali-final-execution-allowed"), "false");
  assert.match(mutationText, /HASSALI_DIFF_PROPOSAL/);

  process.stdout.write("PASS CODE and WEBSITE specialist questions bypass legacy builders\n");
  process.stdout.write("PASS plan-only returns without proposal or approval\n");
  process.stdout.write("PASS stale task and workspace context are excluded on topic shift\n");
  process.stdout.write("PASS genuine CODE mutation still reaches approval-first proposal flow\n");
  process.stdout.write("\n4/4 specialist action gate route checks passed.\n");
} finally {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousKey;
}
