import assert from "node:assert/strict";
import { buildAskRuntimeContext } from "../ask-context";
import { resolveOfficialReleaseQuery } from "../official-release-intelligence";
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

test("personal time context remains timeless while current external facts still require research", () => {
  const personal = decision(
    "I feel distracted today. Suggest one small step that could help me focus for fifteen minutes."
  );
  assert.equal(personal.freshnessClass, "timeless");
  assert.equal(personal.researchRequired, false);
  assert.equal(personal.directAnswerAllowed, true);

  const news = decision("What happened in the news today?");
  assert.equal(news.freshnessClass, "live_event");
  assert.equal(news.researchRequired, true);
});

test("timeless quoted wording is not rejected as an unsupported source quote", () => {
  const prompt = "Suggest one small step that could help me focus.";
  const freshness = decision(prompt);
  const report = verifyAskSourceReliability({
    answer: "Set a timer labelled \"focus\" for fifteen minutes, then work on one task until it rings.",
    decision: freshness,
    researchAttempted: false,
    sources: [],
    time: normalizeAskTimeContext(prompt, runtime)
  });
  assert.equal(report.outcome, "VERIFIED");
  assert.equal(report.sourceCount, 0);
});

test("personal focus advice survives the full ASK quality and source pipeline", async () => {
  const prompt = "I feel distracted today. Suggest one small step that could help me focus for fifteen minutes.";
  const provider = successfulProvider(
    "Put your phone out of reach, set a fifteen-minute timer, and work only on the next small task until it rings."
  );
  const result = await runAskBrain(askInput(prompt, provider.providerCall));
  assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
  assert.match(result.answer, /fifteen-minute timer/i);
  assert.doesNotMatch(result.answer, /Live evidence was unavailable|trustworthy answer|available recovery/i);
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

test("official Node release resolution survives model-search unavailability", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { date: "2026-08-26", lts: false, version: "v26.8.1" },
    { date: "2026-08-25", lts: "Krypton", version: "v24.20.0" }
  ]), { headers: { "content-type": "application/json" }, status: 200 });
  try {
    const result = await resolveOfficialReleaseQuery({
      prompt: "What is the latest stable version of Node.js?",
      retrievedAt: runtime.currentIsoDatetime
    });
    assert(result);
    assert.match(result.answer, /26\.8\.1/);
    assert.match(result.answer, /24\.20\.0/);
    assert.deepEqual(result.sources.map((item) => item.claimScope), ["version:current", "version:lts"]);
    assert(result.sources.every((item) => item.isOfficial));
  } finally {
    globalThis.fetch = previousFetch;
  }
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
  assert.match(result.answer, /live evidence was unavailable/i);
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

test("different release channels are not treated as conflicting versions", () => {
  const prompt = "What is the latest stable version of Node.js?";
  const freshness = decision(prompt);
  const report = verifyAskSourceReliability({
    answer: "Node.js 26.8.1 is the current release.",
    decision: freshness,
    researchAttempted: true,
    sources: [
      source({ claimScope: "version:current", claimValue: "26.8.1", content: "Node.js current release is 26.8.1.", id: "current", isOfficial: true, updatedAt: "2026-08-29" }),
      source({ claimScope: "version:lts", claimValue: "24.20.0", content: "Node.js LTS release is 24.20.0.", id: "lts", isOfficial: true, updatedAt: "2026-08-29", url: "https://example.com/lts" })
    ],
    time: normalizeAskTimeContext(prompt, runtime)
  });
  assert.notEqual(report.outcome, "SOURCE_CONFLICT");
  assert.equal(report.sourceConflict, false);
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
  assert.match(mixedReport.answer, /16\.1\.0 is the latest stable version/i);
  assert.match(mixedReport.answer, /supported by 1 accessible source/i);
  assert.match(mixedReport.answer, /news\.example\/next/i);
  assert.doesNotMatch(mixedReport.answer, /live evidence was unavailable/i);
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

test("partially verified current answers remain useful substantive results", async () => {
  const prompt = "What is the latest stable version of Next.js?";
  const provider = successfulProvider(
    "Next.js 16.1.0 is the latest stable version according to the current release report.",
    [source({
      content: "The current release report says Next.js 16.1.0 is the latest stable version.",
      isOfficial: false,
      sourceType: "secondary",
      title: "Current release report",
      url: "https://news.example/next"
    })]
  );
  const result = await runAskBrain(askInput(prompt, provider.providerCall));
  assert.equal(result.decision.sourceReliability.outcome, "PARTIALLY_VERIFIED");
  assert.equal(result.decision.responseKind, "substantive_answer");
  assert.match(result.answer, /Next\.js 16\.1\.0/i);
  assert.match(result.answer, /partially corroborated/i);
  assert.doesNotMatch(result.answer, /selected (?:answer service|model)|bounded recovery/i);
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
    assert.match(payload, /"type":"openrouter:web_search"/);
    assert.match(payload, /"max_tool_calls":2/);
    assert.match(payload, /"tool_choice":"required"/);
    assert.doesNotMatch(payload, /"plugins":\[\{"id":"web"/);
    assert.equal(result.decision.sourceReliability.outcome, "VERIFIED");
    assert.equal(result.decision.sourceReliability.officialSourceCount, 1);
    assert.match(result.answer, /nextjs\.org/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("OpenRouter Node release channels and noisy partial versions do not become a false conflict", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        annotations: [
          { type: "url_citation", url_citation: { content: "Get Node.js v24.20.0 LTS for production use.", title: "Node.js Download", url: "https://nodejs.org/en/download" } },
          { type: "url_citation", url_citation: { content: "A navigation label mentions Node.js 26.5 Current.", title: "Node.js Download Current", url: "https://nodejs.org/en/download/current" } },
          { type: "url_citation", url_citation: { content: "The latest current release contains node-v26.8.1-aix-ppc64.tar.gz.", title: "Index of /download/release/latest/", url: "https://nodejs.org/download/release/latest/" } }
        ],
        content: "Node.js 24.20.0 is the current LTS line, while 26.8.1 is the latest Current release."
      }
    }],
    model: "openrouter/free"
  }), { headers: { "content-type": "application/json" }, status: 200 });
  try {
    const prompt = "What is the latest stable version of Node.js?";
    const result = await runAskBrain({
      askRuntimeContext: runtime,
      messages: [{ content: prompt, role: "user" }],
      model: "openrouter/free",
      modelSelectionPolicy: "locked",
      productMode: "ASK",
      prompt
    });
    assert.notEqual(result.decision.sourceReliability.outcome, "SOURCE_CONFLICT");
    assert.doesNotMatch(result.answer, /sources conflict/i);
    assert.match(result.answer, /24\.20\.0|26\.8\.1/);
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
