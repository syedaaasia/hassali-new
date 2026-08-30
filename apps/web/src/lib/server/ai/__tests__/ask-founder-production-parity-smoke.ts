import assert from "node:assert/strict";
import test from "node:test";
import { hassaliChatContractVersion } from "@/lib/chat-contract";
import { compactWorkspaceForChatRequest, type ChatRequestWorkspace } from "@/lib/chat-request-context";
import { buildAskRuntimeContext } from "../ask-context";
import { runAskBrain, type AskProviderCall } from "../ask-brain-orchestrator";

type Turn = { content: string; role: "assistant" | "user" };

type AskResult = {
  answer: string;
  completionMethod: string | null;
  freshness: string | null;
  providerFailure: string | null;
  responseKind: string | null;
  sourceOutcome: string | null;
};

const genericFailure = /I couldn't complete that answer reliably right now/i;
const liveResearchLimitation = /Live evidence was unavailable for this request/i;

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

async function send(messages: Turn[], prompt: string, selectedWorkspace?: ChatRequestWorkspace): Promise<AskResult> {
  messages.push({ content: prompt, role: "user" });
  const workspace = selectedWorkspace
    ? compactWorkspaceForChatRequest({ messages, mode: "ASK", prompt, workspace: selectedWorkspace })
    : {
        activeFileContent: "",
        activePath: "",
        fileContents: {},
        fileList: [],
        projectName: null
      };
  const { POST } = await import("@/app/api/ai/chat/route");
  const response = await POST(new Request("http://localhost/api/ai/chat", {
    body: JSON.stringify({
      clientContractVersion: hassaliChatContractVersion,
      messages,
      mode: "ASK",
      model: "tencent/hy3:free",
      modelSelectionPolicy: "automatic",
      productMode: "ASK",
      workspace
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }));
  assert.equal(response.status, 200, await response.clone().text());
  const answer = await response.text();
  messages.push({ content: answer, role: "assistant" });
  return {
    answer,
    completionMethod: response.headers.get("x-hassali-ask-completion-method"),
    freshness: response.headers.get("x-hassali-ask-freshness"),
    providerFailure: response.headers.get("x-hassali-ask-provider-failure"),
    responseKind: response.headers.get("x-hassali-ask-response-kind"),
    sourceOutcome: response.headers.get("x-hassali-ask-source-outcome")
  };
}

function mangoConversation(): Turn[] {
  return [
    { content: "My imaginary project Mango uses Python and SQLite.", role: "user" },
    { content: "Understood. Mango uses Python and SQLite.", role: "assistant" }
  ];
}

const lunarReportText = [
  "Lunar geology report: Mare Imbrium contains basalt plains formed by ancient volcanic activity.",
  "Tycho is a young impact crater with bright rays.",
  "Research credential: API_KEY=lunar-secret-value"
].join("\n");

const lunarWorkspace: ChatRequestWorkspace = {
  activeFileContent: lunarReportText,
  activePath: "reports/lunar-geology.txt",
  fileContents: { "reports/lunar-geology.txt": lunarReportText },
  fileList: ["reports/lunar-geology.txt"],
  projectName: "Lunar Research"
};

test("production request compaction and route preserve selected-artifact summary authority", async () => {
  const implicitArtifact = await send(mangoConversation(), "write a summary", lunarWorkspace);
  assert.match(implicitArtifact.answer, /Mare Imbrium|Tycho/i);
  assert.doesNotMatch(implicitArtifact.answer, /Mango/i);
  assert.doesNotMatch(implicitArtifact.answer, /lunar-secret-value/i);

  const explicitConversation = await send(mangoConversation(), "summarize our conversation", lunarWorkspace);
  assert.match(explicitConversation.answer, /Conversation summary/i);
  assert.match(explicitConversation.answer, /Mango/i);
  assert.doesNotMatch(explicitConversation.answer, /Mare Imbrium|lunar-secret-value/i);

  const explicitArtifact = await send(mangoConversation(), "summarize the selected report", lunarWorkspace);
  assert.match(explicitArtifact.answer, /Mare Imbrium|Tycho/i);
  assert.doesNotMatch(explicitArtifact.answer, /Mango|lunar-secret-value/i);

  const explicitConversationAgain = await send(mangoConversation(), "what have we discussed so far?", lunarWorkspace);
  assert.match(explicitConversationAgain.answer, /Conversation summary/i);
  assert.match(explicitConversationAgain.answer, /Mango/i);
  assert.doesNotMatch(explicitConversationAgain.answer, /Mare Imbrium|lunar-secret-value/i);

  const pastedArticleWorkspace = {
    ...lunarWorkspace,
    activePath: "pasted-article.txt",
    fileContents: { "pasted-article.txt": lunarReportText },
    fileList: ["pasted-article.txt"]
  };
  const pastedArticle = await send(mangoConversation(), "give me a summary", pastedArticleWorkspace);
  assert.match(pastedArticle.answer, /Mare Imbrium|Tycho/i);
  assert.doesNotMatch(pastedArticle.answer, /Mango|lunar-secret-value/i);

  const selectedPdfWorkspace = {
    ...lunarWorkspace,
    activePath: "reports/lunar-geology.pdf",
    fileContents: { "reports/lunar-geology.pdf": lunarReportText },
    fileList: ["reports/lunar-geology.pdf"]
  };
  const selectedPdf = await send(mangoConversation(), "summarize this", selectedPdfWorkspace);
  assert.match(selectedPdf.answer, /Mare Imbrium|Tycho/i);
  assert.doesNotMatch(selectedPdf.answer, /Mango|lunar-secret-value/i);
});

test("production target authority distinguishes artifact contents from conversation vocabulary", async () => {
  const relayText = [
    "Relay diagnostic report.",
    "ERROR ZEBRA-741: the gateway rejected a stale relay token.",
    "Benign stack: Python, React, PostgreSQL, and SQLite.",
    "Private sentinel: API_KEY=round2-secret-sentinel-741"
  ].join("\n");
  const relayWorkspace: ChatRequestWorkspace = {
    activeFileContent: relayText,
    activePath: "relay.txt",
    fileContents: { "relay.txt": relayText },
    fileList: ["relay.txt"],
    projectName: "Relay"
  };
  const sourdoughConversation = (): Turn[] => [
    { content: "Explain sourdough fermentation. API_KEY=round2-secret-sentinel-741", role: "user" },
    { content: "Sourdough uses wild yeast and bacteria.", role: "assistant" }
  ];

  for (const prompt of [
    "Summarize the error messages in the selected file.",
    "Summarize the chat comments in the selected file.",
    "Summarize the conversation history recorded in relay.txt.",
    "Summarize the thread notes in the selected report."
  ]) {
    const result = await send(sourdoughConversation(), prompt, relayWorkspace);
    assert.match(result.answer, /ZEBRA-741/i, prompt);
    assert.doesNotMatch(result.answer, /sourdough|round2-secret-sentinel-741/i, prompt);
  }

  for (const prompt of [
    "make this shorter",
    "shorten this",
    "condense this",
    "make this more concise",
    "trim this down",
    "give me a shorter version",
    "compress this",
    "reduce this to the essentials"
  ]) {
    const result = await send(sourdoughConversation(), prompt, relayWorkspace);
    assert.match(result.answer, /ZEBRA-741/i, prompt);
    assert.doesNotMatch(result.answer, /sourdough|round2-secret-sentinel-741|approval|proposal/i, prompt);
  }

  const conversation = await send(sourdoughConversation(), "Summarize our conversation about sourdough.", relayWorkspace);
  assert.match(conversation.answer, /sourdough/i);
  assert.doesNotMatch(conversation.answer, /ZEBRA-741|round2-secret-sentinel-741/i);

  const noArtifact = await send(sourdoughConversation(), "make this conversation shorter");
  assert.match(noArtifact.answer, /sourdough/i);
  assert.doesNotMatch(noArtifact.answer, /ZEBRA-741|round2-secret-sentinel-741/i);

  const pdfWorkspace = {
    ...relayWorkspace,
    activePath: "relay.pdf",
    fileContents: { "relay.pdf": relayText },
    fileList: ["relay.pdf"]
  };
  assert.match((await send(sourdoughConversation(), "make this concise", pdfWorkspace)).answer, /ZEBRA-741/i);

  const pastedWorkspace = {
    ...relayWorkspace,
    activePath: "pasted-article.txt",
    fileContents: { "pasted-article.txt": relayText },
    fileList: ["pasted-article.txt"]
  };
  assert.match((await send(sourdoughConversation(), "reduce this to the essentials", pastedWorkspace)).answer, /ZEBRA-741/i);
});

test("research-capable orchestration fixture requires useful verified evidence rather than treating routing as success", async () => {
  const prompt = "What happened in AI news today?";
  const providerInputs: Parameters<AskProviderCall>[0][] = [];
  const fixtureSources = [
    { id: "fixture-policy", title: "Fixture AI policy bulletin", url: "https://fixture.example/ai-policy" },
    { id: "fixture-market", title: "Fixture AI market bulletin", url: "https://fixture.example/ai-market" }
  ];
  const providerCall: AskProviderCall = async (input) => {
    providerInputs.push(input);
    assert.equal(input.webSearch, true);
    return {
      content: "A fixture AI infrastructure policy announced today could affect AI companies. [Policy bulletin](https://fixture.example/ai-policy) [Market bulletin](https://fixture.example/ai-market)",
      researchAttempted: true,
      servedModel: "fixture/research-model",
      sources: fixtureSources.map((source) => ({
        ...source,
        content: "Fixture discovery evidence.",
        isOfficial: false,
        retrievedAt: "2026-08-26T08:00:00.000Z",
        sourceType: "secondary" as const
      })),
      status: "ok"
    };
  };
  const result = await runAskBrain({
    askRuntimeContext: buildAskRuntimeContext(new Date("2026-08-26T09:00:00.000Z")),
    messages: [{ content: prompt, role: "user" }],
    model: "fixture/research-model",
    productMode: "ASK",
    prompt,
    providerCall,
    providerCallOwnsRouting: true,
    researchRetriever: async ({ discoveredSources }) => discoveredSources.map((source) => ({
      ...source,
      content: `${source.title} independently reports that fixture AI infrastructure policy changed today and materially affects AI companies.`,
      publishedAt: "2026-08-26T07:00:00.000Z",
      retrievedAt: "2026-08-26T09:00:00.000Z"
    }))
  });
  assert.equal(providerInputs.length, 1);
  assert.match(result.answer, /fixture AI infrastructure policy/i);
  assert.match(result.answer, /fixture\.example\/ai-policy/i);
  assert.doesNotMatch(result.answer, liveResearchLimitation);
  assert.equal(result.decision.freshness.freshnessClass, "live_event");
  assert.equal(result.decision.webSearchRequested, true);
  assert(["VERIFIED", "PARTIALLY_VERIFIED"].includes(result.decision.sourceReliability.outcome));
  assert.equal(result.decision.sourceReliability.sourceCount, 2);
});

test("no-provider cumulative dashboard replay distinguishes truthful live limitations from later stable recovery", async () => {
  const providerKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"] as const;
  const previousKeys = Object.fromEntries(providerKeys.map((key) => [key, process.env[key]]));
  for (const key of providerKeys) delete process.env[key];

  const messages: Turn[] = [{
    content: "Ask Hassali anything. I can explain, plan, write, debug, compare, and help you think through an idea.",
    role: "assistant"
  }];

  try {
    const recommendation = await send(messages, "What is the best tool to start freelancing");
    assert.match(recommendation.answer, /marketplace|Upwork|portfolio/i);
    assert.doesNotMatch(recommendation.answer, genericFailure);

    assert.doesNotMatch((await send(messages, "What is Hassali?")).answer, genericFailure);
    assert.doesNotMatch((await send(messages, "What is the model?")).answer, genericFailure);

    const weekday = await send(messages, "If yesterday was two days before Thursday, what day is today?");
    assert.match(weekday.answer, /today is Wednesday/i);
    assert.doesNotMatch(weekday.answer, /today is Thursday/i);

    assert.match((await send(messages, "A doctor gives me three pills, one every half hour. How long until all are taken?")).answer, /one hour|60 minutes/i);
    assert.match((await send(messages, "How many handshakes happen among 10 people if everyone shakes hands once?")).answer, /45/);

    const exactWords = await send(messages, "Give me an answer that is exactly 20 words long explaining why the sky appears blue.");
    assert.equal(wordCount(exactWords.answer), 20, exactWords.answer);
    assert.doesNotMatch(exactWords.answer, /^Referenced[.:]/i);

    const currentNews = await send(messages, "What happened in the world today that could affect AI companies the most?");
    assert.equal(currentNews.freshness, "live_event");
    assert.match(currentNews.answer, liveResearchLimitation);

    const nextTurn = await send(messages, "Answer my next question using only three words.");
    assert.match(nextTurn.answer, /understood/i);
    const dreams = await send(messages, "Why do humans dream?");
    assert.equal(wordCount(dreams.answer), 3, dreams.answer);
    assert.notEqual(dreams.freshness, "live_event");
    assert.doesNotMatch(dreams.answer, genericFailure);

    const dreamsFollowup = await send(messages, "Could you elaborate?");
    assert.notEqual(dreamsFollowup.freshness, "live_event");
    assert.doesNotMatch(dreamsFollowup.answer, genericFailure);

    const photosynthesis = await send(messages, "How does photosynthesis work?");
    assert.notEqual(photosynthesis.freshness, "live_event");
    assert.doesNotMatch(photosynthesis.answer, liveResearchLimitation);

    const photosynthesisFollowup = await send(messages, "Can you expand on that?");
    assert.notEqual(photosynthesisFollowup.freshness, "live_event");
    assert.doesNotMatch(photosynthesisFollowup.answer, genericFailure);

    const pakistanNews = await send(messages, "What happened in Pakistan today?");
    assert.equal(pakistanNews.freshness, "live_event");
    assert.match(pakistanNews.answer, liveResearchLimitation);

    const recursion = await send(messages, "Explain recursion simply.");
    assert.notEqual(recursion.freshness, "live_event");
    assert.doesNotMatch(recursion.answer, liveResearchLimitation);

    const recursionWhy = await send(messages, "Why?");
    assert.notEqual(recursionWhy.freshness, "live_event");
    assert.doesNotMatch(recursionWhy.answer, liveResearchLimitation);

    for (const prompt of ["Walk me through that.", "Does that always work?"]) {
      const followup = await send(messages, prompt);
      assert.notEqual(followup.freshness, "live_event", prompt);
      assert.doesNotMatch(followup.answer, genericFailure, prompt);
    }

    const quantum = await send(messages, "Now explain quantum entanglement.");
    assert.notEqual(quantum.freshness, "live_event");
    assert.doesNotMatch(quantum.answer, liveResearchLimitation);

    const quantumFollowup = await send(messages, "Please elaborate.");
    assert.notEqual(quantumFollowup.freshness, "live_event");
    assert.doesNotMatch(quantumFollowup.answer, genericFailure);

    const mangoSetup = await send(messages, "My imaginary project is called Mango. It uses Python, PostgreSQL and React. Remember that only for this conversation.");
    assert.doesNotMatch(mangoSetup.answer, genericFailure);
    assert.equal((await send(messages, "What database does Mango use?")).answer.trim(), "PostgreSQL");
    const mangoCorrection = await send(messages, "Actually Mango now uses SQLite instead of PostgreSQL.");
    assert.doesNotMatch(mangoCorrection.answer, genericFailure);
    const mangoCurrent = await send(messages, "What database does Mango use now?");
    assert.equal(mangoCurrent.answer.trim(), "SQLite");
    assert.notEqual(mangoCurrent.freshness, "live_event");

    for (const summaryPrompt of [
      "write a summary",
      "what have we discussed so far?",
      "write summary of the complete chat"
    ]) {
      const summary = await send(messages, summaryPrompt);
      assert.match(summary.answer, /Conversation summary/i);
      assert.match(summary.answer, /Mango/i);
      assert.match(summary.answer, /SQLite/i);
      assert.notEqual(summary.freshness, "live_event");
      assert.equal(summary.completionMethod, "deterministic_conversation_summary");
      assert.equal(summary.responseKind, "deterministic_answer");
      assert.doesNotMatch(summary.answer, genericFailure);
    }
  } finally {
    for (const key of providerKeys) {
      const previous = previousKeys[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
});
