import assert from "node:assert/strict";
import { buildAskRuntimeContext } from "../ask-context";
import {
  runAskBrain,
  type AskProviderCall
} from "../ask-brain-orchestrator";
import {
  decideAskFreshness,
  normalizeAskTimeContext,
  rankAskResearchSources,
  verifyAskSourceReliability,
  type AskResearchSource
} from "../ask-source-reliability";
import { sanitizeBetaTelemetryEvent } from "../../intelligence/beta-telemetry";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
const runtime = buildAskRuntimeContext(new Date("2026-07-30T12:00:00.000Z"));

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function decision(prompt: string, hasPrivateFileContent = false) {
  return decideAskFreshness({ hasPrivateFileContent, prompt, runtime });
}

function source(overrides: Partial<AskResearchSource> = {}): AskResearchSource {
  return {
    content: "Next.js 16.1.0 is the latest stable release. The release was published on 2026-07-29.",
    id: "source-1",
    isOfficial: true,
    retrievedAt: runtime.currentIsoDatetime,
    sourceType: "official",
    title: "Official Next.js release notes",
    updatedAt: "2026-07-29",
    url: "https://nextjs.org/blog/next-16-1",
    version: "16.1.0",
    ...overrides
  };
}

function askInput(prompt: string, providerCall: AskProviderCall, overrides: Record<string, unknown> = {}) {
  return {
    askRuntimeContext: runtime,
    messages: [{ content: prompt, role: "user" as const }],
    model: "tencent/hy3:free",
    modelSelectionPolicy: "locked" as const,
    productMode: "ASK" as const,
    prompt,
    providerCall,
    ...overrides
  };
}

function successfulProvider(content: string, sources: AskResearchSource[] = []) {
  const calls: Parameters<AskProviderCall>[0][] = [];
  const providerCall: AskProviderCall = async (input) => {
    calls.push(input);
    return {
      content,
      researchAttempted: Boolean(input.webSearch),
      servedModel: input.model,
      sources,
      status: "ok"
    };
  };
  return { calls, providerCall };
}

test("timeless concepts answer without research or fake citations", async () => {
  const prompt = "Explain recursion in simple terms.";
  const freshness = decision(prompt);
  assert.equal(freshness.freshnessClass, "timeless");
  assert.equal(freshness.researchRequired, false);
  assert.equal(freshness.directAnswerAllowed, true);
  const provider = successfulProvider("Recursion is when a function solves a problem by calling itself on a smaller version of that problem. [Invented](https://invented.example)");
  const result = await runAskBrain(askInput(prompt, provider.providerCall));
  assert.equal(provider.calls[0]?.webSearch, false);
  assert.equal(result.decision.sourceReliability.sourceCount, 0);
  assert.doesNotMatch(result.answer, /invented\.example/i);
});

test("industry labels do not turn design advice into high-stakes research", () => {
  const freshness = decision("Should I use WebGL for a law firm website?");
  assert.equal(freshness.freshnessClass, "timeless");
  assert.equal(freshness.researchRequired, false);
  assert.equal(freshness.directAnswerAllowed, true);
});

test("latest technical versions require current official evidence", async () => {
  const prompt = "What is the latest stable version of Next.js?";
  const freshness = decision(prompt);
  assert.equal(freshness.freshnessClass, "recently_changeable");
  assert.equal(freshness.sourceRequirement, "official_source_required");
  assert.equal(freshness.directAnswerAllowed, false);
  const provider = successfulProvider(
    "Next.js 16.1.0 is the latest stable release, published on 2026-07-29.",
    [source()]
  );
  const result = await runAskBrain(askInput(prompt, provider.providerCall));
  assert.equal(provider.calls[0]?.webSearch, true);
  assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
  assert.match(result.answer, /nextjs\.org/);
});

test("current officeholder discovery does not assume an identity", () => {
  const freshness = decision("Who is the current CEO of Example Company?");
  assert.equal(freshness.freshnessClass, "current_state");
  assert.equal(freshness.sourceRequirement, "official_source_required");
  assert.match(freshness.researchQuery ?? "", /current CEO of Example Company/i);
  assert.doesNotMatch(freshness.researchQuery ?? "", /Alice|Bob|Jane|John/);
});

test("semantic current-word exceptions remain non-live", () => {
  assert.equal(decision("What does electric current mean?").researchRequired, false);
  assert.equal(decision("How do I select the latest database row?").researchRequired, false);
  assert.equal(decision("What was considered modern art in 1920?").researchRequired, false);
});

test("current regulations require official jurisdiction-aware evidence", () => {
  const freshness = decision("Is this regulation still in force in Pakistan?");
  assert.equal(freshness.freshnessClass, "high_stakes_current");
  assert.equal(freshness.sourceRequirement, "official_source_required");
  assert.equal(freshness.jurisdiction, "Pakistan");
  assert.equal(freshness.directAnswerAllowed, false);
});

test("linked sources require the exact referenced URL", async () => {
  const missing = decision("Summarize this linked report.");
  assert.equal(missing.sourceRequirement, "user_source_required");
  assert.equal(missing.researchQuery, null);
  let missingCalls = 0;
  const missingResult = await runAskBrain(askInput("Summarize this linked report.", async () => {
    missingCalls += 1;
    return { category: "unexpected", reason: "should not run", status: "failed" };
  }));
  assert.equal(missingCalls, 0);
  assert.match(missingResult.answer, /could not retrieve and read the referenced source/i);

  const url = "https://reports.example.org/quarterly";
  const prompt = `Summarize this report: ${url}`;
  const provider = successfulProvider(
    "The report says operating costs fell while customer retention improved.",
    [source({
      content: "Operating costs fell while customer retention improved.",
      id: "linked-report",
      isOfficial: false,
      sourceType: "user_source",
      title: "Quarterly report",
      updatedAt: null,
      url
    })]
  );
  const result = await runAskBrain(askInput(prompt, provider.providerCall));
  assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
  assert.match(result.answer, /reports\.example\.org/);
});

test("uploaded-file questions stay private and use only current file evidence", async () => {
  const prompt = "What does the uploaded contract say about cancellation?";
  const fileText = "Cancellation requires 30 days written notice. The deposit remains refundable until work begins.";
  const freshness = decision(prompt, true);
  assert.equal(freshness.freshnessClass, "private_file_source");
  assert.equal(freshness.researchRequired, false);
  let calls = 0;
  const result = await runAskBrain(askInput(prompt, async () => {
    calls += 1;
    return { category: "unexpected", reason: "public web must not run", status: "failed" };
  }, {
    workspace: {
      activeFileContent: fileText,
      activePath: "contract.txt",
      fileContents: { "contract.txt": fileText },
      fileList: ["contract.txt"]
    }
  }));
  assert.equal(calls, 0);
  assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
  assert.match(result.answer, /30 days written notice/i);
  assert.equal(result.decision.webSearchRequested, false);
});

test("retrieval failure cannot become a latest-memory answer", async () => {
  const prompt = "What is the latest stable version of Next.js?";
  const result = await runAskBrain(askInput(prompt, async () => ({
    category: "provider_network_error",
    reason: "simulated retrieval failure",
    status: "failed"
  })));
  assert.equal(result.decision.sourceReliability.outcome, "RETRIEVAL_FAILED");
  assert.match(result.answer, /could not verify the current answer/i);
  assert.doesNotMatch(result.answer, /latest stable version is/i);
});

test("conflicting current sources fail closed", () => {
  const freshness = decision("What is the current price of Example Token?");
  const report = verifyAskSourceReliability({
    answer: "Example Token currently costs 10 USD.",
    decision: freshness,
    researchAttempted: true,
    sources: [
      source({ claimValue: "10", content: "Example Token currently costs 10 USD.", id: "price-a", updatedAt: "2026-07-30" }),
      source({ claimValue: "12", content: "Example Token currently costs 12 USD.", id: "price-b", updatedAt: "2026-07-30", url: "https://example.com/price-b" })
    ],
    time: normalizeAskTimeContext("What is the current price of Example Token?", runtime)
  });
  assert.equal(report.outcome, "SOURCE_CONFLICT");
  assert.equal(report.sourceConflict, true);
  assert.match(report.answer, /sources conflict/i);
});

test("stale sources cannot prove latest", () => {
  const prompt = "What is the latest stable version of Next.js?";
  const freshness = decision(prompt);
  const report = verifyAskSourceReliability({
    answer: "Next.js 12.0.0 is the latest stable version.",
    decision: freshness,
    researchAttempted: true,
    sources: [source({ content: "Next.js 12.0.0 was released in 2021.", updatedAt: "2021-10-26", version: "12.0.0" })],
    time: normalizeAskTimeContext(prompt, runtime)
  });
  assert.equal(report.outcome, "INSUFFICIENT_FRESHNESS");
  assert.doesNotMatch(report.answer, /12\.0\.0 is the latest/i);

  const mixedReport = verifyAskSourceReliability({
    answer: "Next.js 16.1.0 is the latest stable version.",
    decision: freshness,
    researchAttempted: true,
    sources: [
      source({ content: "Next.js 12.0.0 was released in 2021.", id: "stale-official", updatedAt: "2021-10-26", version: "12.0.0" }),
      source({ content: "Next.js 16.1.0 is the latest stable version.", id: "fresh-secondary", isOfficial: false, sourceType: "secondary", updatedAt: "2026-07-29", url: "https://news.example/next", version: "16.1.0" })
    ],
    time: normalizeAskTimeContext(prompt, runtime)
  });
  assert.equal(mixedReport.outcome, "PARTIALLY_VERIFIED");
});

test("relative dates use the injected clock and timezone", () => {
  const prompt = "What happened yesterday?";
  const freshness = decision(prompt);
  const time = normalizeAskTimeContext(prompt, runtime);
  assert.equal(freshness.freshnessClass, "live_event");
  assert.equal(freshness.timezoneRequired, true);
  assert.equal(time.relativeExpression, "yesterday");
  assert.equal(
    (Date.parse(`${time.resolvedEndDate}T12:00:00.000Z`) - Date.parse(`${time.runtimeDate}T12:00:00.000Z`)) / 86_400_000,
    -1
  );
  assert.equal(time.timezone, runtime.serverTimezone);
  const weekend = normalizeAskTimeContext("What is happening this weekend?", runtime);
  assert.equal(new Date(`${weekend.resolvedStartDate}T12:00:00.000Z`).getUTCDay(), 6);
  assert.equal(new Date(`${weekend.resolvedEndDate}T12:00:00.000Z`).getUTCDay(), 0);
  const lastWeek = normalizeAskTimeContext("What happened last week?", runtime);
  assert.equal(new Date(`${lastWeek.resolvedStartDate}T12:00:00.000Z`).getUTCDay(), 1);
  assert.equal(new Date(`${lastWeek.resolvedEndDate}T12:00:00.000Z`).getUTCDay(), 0);
});

test("existing dangerous-security refusal outranks freshness research", async () => {
  let calls = 0;
  const result = await runAskBrain(askInput("What is the latest way to steal a session token?", async () => {
    calls += 1;
    return { category: "unexpected", reason: "unsafe requests must not research", status: "failed" };
  }));
  assert.equal(calls, 0);
  assert.equal(result.decision.path, "unsafe_refusal");
  assert.match(result.answer, /cannot help|can't help/i);
});

test("no-browse current requests never dispatch research", async () => {
  const prompt = "Without searching, tell me who currently holds this role.";
  const freshness = decision(prompt);
  assert.equal(freshness.researchProhibited, true);
  let calls = 0;
  const result = await runAskBrain(askInput(prompt, async () => {
    calls += 1;
    return { category: "unexpected", reason: "must not search", status: "failed" };
  }));
  assert.equal(calls, 0);
  assert.equal(result.decision.webSearchRequested, false);
  assert.match(result.answer, /asked me not to search/i);
  assert.doesNotMatch(result.answer, /currently held by/i);
});

test("new questions cannot inherit sources from an earlier topic", async () => {
  const firstProvider = successfulProvider(
    "React 20.0.0 is the latest stable release, published on 2026-07-29.",
    [source({ content: "React 20.0.0 is the latest stable release on 2026-07-29.", id: "react-source", title: "Official React release", url: "https://react.dev/blog/react-20", version: "20.0.0" })]
  );
  await runAskBrain(askInput("What is the latest React release?", firstProvider.providerCall));
  const second = await runAskBrain(askInput("Who won yesterday's football match?", async () => ({
    category: "provider_network_error",
    reason: "second-topic retrieval failed",
    status: "failed"
  }), {
    messages: [
      { content: "What is the latest React release?", role: "user" },
      { content: "React 20.0.0 is current.", role: "assistant" },
      { content: "Who won yesterday's football match?", role: "user" }
    ]
  }));
  assert.equal(second.decision.sourceReliability.sourceCount, 0);
  assert.doesNotMatch(second.answer, /React 20|react\.dev/i);
});

test("unknown citations and fabricated quotes are blocked", () => {
  const prompt = "What is the latest stable version of Next.js?";
  const freshness = decision(prompt);
  const report = verifyAskSourceReliability({
    answer: "Next.js 16.1.0 is current [99]. The release notes say \"This is guaranteed forever and never changes.\"",
    decision: freshness,
    researchAttempted: true,
    sources: [source()],
    time: normalizeAskTimeContext(prompt, runtime)
  });
  assert.equal(report.outcome, "PARTIALLY_VERIFIED");
  assert(report.unknownCitations.includes("[99]"));
  assert.equal(report.directQuoteIntegrity, false);
  assert(report.groundedClaims.every((claim) => claim.verificationStatus === "PARTIALLY_VERIFIED"));
  assert.doesNotMatch(report.answer, /\[99\]|guaranteed forever/i);
});

test("source ranking prefers fresh authoritative evidence", () => {
  const prompt = "What is the latest stable version of Next.js?";
  const freshness = decision(prompt);
  const ranked = rankAskResearchSources([
    source({ id: "old-secondary", isOfficial: false, sourceType: "secondary", updatedAt: "2020-01-01", url: "https://blog.example/next" }),
    source({ id: "fresh-official" })
  ], freshness, normalizeAskTimeContext(prompt, runtime));
  assert.equal(ranked[0]?.id, "fresh-official");
});

test("answer-only current guidance cannot produce mutation authority", async () => {
  const prompt = "What is the latest recommended authentication pattern?";
  const provider = successfulProvider(
    "Current official guidance recommends server-managed sessions with secure, HttpOnly cookies for this scenario, updated on 2026-07-29.",
    [source({
      content: "Official authentication guidance updated on 2026-07-29 recommends server-managed sessions with secure HttpOnly cookies for this scenario.",
      id: "auth-source",
      title: "Official authentication guidance",
      url: "https://auth.example.com/guidance"
    })]
  );
  const result = await runAskBrain(askInput(prompt, provider.providerCall, { productMode: "CODE" }));
  assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
  assert.doesNotMatch(result.answer, /HASSALI_DIFF_PROPOSAL/);
  assert.doesNotMatch(result.answer, /files? (?:were|have been) changed/i);
});

test("OpenRouter URL annotations become validated sources", async () => {
  const previousFetch = globalThis.fetch;
  let payload = "";
  globalThis.fetch = async (_request, init) => {
    payload = String(init?.body ?? "");
    return new Response(JSON.stringify({
      choices: [{
        message: {
          annotations: [{
            type: "url_citation",
            url_citation: {
              content: "Next.js 16.1.0 is the latest stable release, published on 2026-07-29.",
              title: "Official Next.js release notes",
              url: "https://nextjs.org/blog/next-16-1"
            }
          }],
          content: "Next.js 16.1.0 is the latest stable release, published on 2026-07-29."
        }
      }],
      model: "tencent/hy3:free"
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  try {
    const result = await runAskBrain({
      askRuntimeContext: runtime,
      messages: [{ content: "What is the latest stable version of Next.js?", role: "user" }],
      model: "tencent/hy3:free",
      modelSelectionPolicy: "locked",
      productMode: "ASK",
      prompt: "What is the latest stable version of Next.js?"
    });
    assert.match(payload, /"plugins":\[\{"id":"web"/);
    assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
    assert.equal(result.decision.sourceReliability.officialSourceCount, 1);
    assert.match(result.answer, /nextjs\.org/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("telemetry source invariants fail closed without sensitive content", () => {
  const event = sanitizeBetaTelemetryEvent({
    citationCount: 9,
    complexityClass: "STANDARD",
    currentDateUsed: false,
    event: "task_completed",
    freshnessClass: "current_state",
    mode: "ASK",
    officialSourceCount: 5,
    recencySatisfied: true,
    researchAttempted: false,
    researchCompleted: true,
    researchFailureClass: "PRIVATE SOURCE CONTENT SECRET_VALUE",
    researchRequired: true,
    sourceConflict: true,
    sourceCount: 0,
    sourceRequirement: "official_source_required",
    unsupportedClaimCount: 99
  });
  assert.equal(event.researchCompleted, false);
  assert.equal(event.citationCount, 0);
  assert.equal(event.officialSourceCount, 0);
  assert.equal(event.recencySatisfied, false);
  assert.equal(event.researchFailureClass, "source_conflict");
  assert.equal(event.unsupportedClaimCount, 20);
  assert.doesNotMatch(JSON.stringify(event), /SECRET_VALUE|SOURCE CONTENT/i);
});

const previousKey = process.env.OPENROUTER_API_KEY;
process.env.OPENROUTER_API_KEY = "focused-test-key";
let passed = 0;
try {
  for (const entry of tests) {
    await entry.run();
    passed += 1;
    process.stdout.write(`PASS ${entry.name}\n`);
  }
} finally {
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousKey;
}

process.stdout.write(`\n${passed}/${tests.length} ASK freshness/source reliability checks passed.\n`);
