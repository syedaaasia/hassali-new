import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAskTurnSemantics } from "@/lib/ask-turn-semantics";
import {
  compactWorkspaceForChatRequest,
  type ChatRequestWorkspace
} from "@/lib/chat-request-context";
import { buildAskRuntimeContext } from "../ask-context";
import { runAskBrain, type AskProviderCall } from "../ask-brain-orchestrator";
import { understandAskRequest } from "../ask-request-understanding";
import {
  extractAskResponseConstraints,
  finalizeAskResponseConstraints,
  validateAskResponseConstraints
} from "../ask-response-constraints";
import { resolveBehavioralDecision } from "../behavioral-intelligence";

const selectedWorkspace: ChatRequestWorkspace = {
  activeFileContent: "Owner: Mira\nAction: rotate the token\nDue: Friday\nStatus: open",
  activePath: "ops-note.txt",
  fileContents: {
    "ops-note.txt": "Owner: Mira\nAction: rotate the token\nDue: Friday\nStatus: open"
  },
  fileList: ["ops-note.txt"],
  projectName: "Operations"
};

const unrelatedMessages = [
  { content: "Explain sourdough starters.", role: "user" as const },
  { content: "A starter cultures yeast and bacteria.", role: "assistant" as const }
];

test("generated continuity matrix separates missing targets from explicit subjects", () => {
  const refinement = ["Clarify", "Defend", "Elaborate", "Expand"]
    .flatMap((verb) => ["", " more", " further", " again"].map((suffix) => `${verb}${suffix}?`));
  const requestedEvidence = ["counterexample", "example", "objection", "reason"]
    .map((kind) => `Give me another ${kind}.`);
  const openConcerns = ["caveats", "drawbacks", "risks", "tradeoffs"]
    .map((kind) => `What are the ${kind}?`);
  const relational = [
    "What practical consequence follows?",
    "What would a skeptic argue?",
    "How would the reverse case behave?",
    "What part is least certain?",
    "Where does the comparison break down?",
    "What assumption is doing the most work?",
    "What should happen afterward?",
    "How does that affect the tradeoff?"
  ];
  const dependent = [...refinement, ...requestedEvidence, ...openConcerns, ...relational];
  assert(dependent.length >= 25);
  for (const prompt of dependent) {
    assert.equal(analyzeAskTurnSemantics(prompt).dependency, "prior_context", prompt);
  }

  const topics = [
    "quantum entanglement",
    "photosynthesis",
    "PostgreSQL MVCC",
    "React Server Components",
    "Redis failover",
    "OAuth token rotation"
  ];
  const selfContained = topics.flatMap((topic) => [
    `Explain ${topic}.`,
    `What are the downsides of ${topic}?`,
    `How does ${topic} work?`,
    `Walk me through ${topic}.`
  ]);
  assert(selfContained.length >= 20);
  for (const prompt of selfContained) {
    assert.equal(analyzeAskTurnSemantics(prompt).dependency, "independent", prompt);
  }

  for (const prompt of [
    "PostgreSQL uses MVCC; why does that matter?",
    "Redis evicts keys under pressure, so how does that affect hit rates?",
    "The queue retries three times; what happens after that?",
    "OAuth tokens expire hourly: why is that useful?"
  ]) {
    assert.equal(analyzeAskTurnSemantics(prompt).dependency, "local_reference", prompt);
  }

  for (const prompt of [
    "Create a website for software that helps small service businesses follow up with leads.",
    "Build a tracker that works with local CSV files.",
    "Explain a cache that refreshes with new records."
  ]) {
    assert.equal(analyzeAskTurnSemantics(prompt).dependency, "independent", prompt);
  }
});

test("cumulative topic chains bind dependent turns to the newest explicit objective", () => {
  const messages: Array<{ content: string; role: "assistant" | "user" }> = [];
  const addTopic = (prompt: string) => {
    const result = resolveBehavioralDecision({ messages, prompt, selectedMode: "ASK" });
    assert.equal(result.referencedObjective, null, prompt);
    messages.push({ content: prompt, role: "user" }, { content: `Answer for ${prompt}`, role: "assistant" });
  };
  const addFollowup = (prompt: string, expected: RegExp) => {
    const result = resolveBehavioralDecision({ messages, prompt, selectedMode: "ASK" });
    assert.match(result.referencedObjective ?? "", expected, prompt);
    messages.push({ content: prompt, role: "user" }, { content: `Answer for ${prompt}`, role: "assistant" });
  };

  addTopic("Explain circuit breakers in distributed systems.");
  addFollowup("What practical consequence follows?", /circuit breakers/i);
  addFollowup("What would a skeptic argue?", /circuit breakers/i);
  addTopic("Now explain photosynthesis.");
  addFollowup("What part is least certain?", /photosynthesis/i);
  addTopic("Actually, describe PostgreSQL MVCC instead.");
  addFollowup("Where does the comparison break down?", /PostgreSQL MVCC/i);
});

test("selected content transformations share target authority before compaction", () => {
  const transforms = [
    "Write a summary.",
    "Rewrite this professionally.",
    "Simplify this for a new employee.",
    "Extract the action items.",
    "Identify the errors.",
    "List the important points.",
    "Turn this into a checklist.",
    "Format this as bullet points.",
    "Polish this.",
    "Translate this into Spanish."
  ];
  for (const prompt of transforms) {
    const compacted = compactWorkspaceForChatRequest({
      messages: unrelatedMessages,
      mode: "ASK",
      prompt,
      workspace: selectedWorkspace
    });
    assert.equal(compacted.activePath, "ops-note.txt", prompt);
    assert.match(compacted.activeFileContent, /rotate the token/, prompt);
  }

  const explicitSubject = compactWorkspaceForChatRequest({
    messages: unrelatedMessages,
    mode: "ASK",
    prompt: "List five benefits of React.",
    workspace: selectedWorkspace
  });
  assert.equal(explicitSubject.activePath, "");

  const conversation = compactWorkspaceForChatRequest({
    messages: unrelatedMessages,
    mode: "ASK",
    prompt: "Summarize our conversation.",
    workspace: selectedWorkspace
  });
  assert.equal(conversation.activePath, "");
});

test("selected artifact authority is structural rather than tied to known rewrite verbs", () => {
  const workspace = {
    ...selectedWorkspace,
    activeFileContent: "Board update: launch Friday. Promise: refund delays by Monday.",
    fileContents: { "ops-note.txt": "Board update: launch Friday. Promise: refund delays by Monday." }
  };
  for (const prompt of [
    "Clean this up for a board audience.",
    "Put this in Spanish.",
    "Give me just the promises and dates.",
    "Tighten this for an executive audience.",
    "Make this sound less robotic."
  ]) {
    const compacted = compactWorkspaceForChatRequest({ messages: unrelatedMessages, mode: "ASK", prompt, workspace });
    const decision = resolveBehavioralDecision({ messages: unrelatedMessages, prompt, selectedMode: "ASK", workspace });
    assert.equal(compacted.activePath, "ops-note.txt", prompt);
    assert.match(compacted.activeFileContent, /launch Friday/, prompt);
    assert.equal(decision.referencedObjective, null, prompt);
    assert.equal(decision.mutationIntent, false, prompt);
    assert.equal(decision.finalDisposition, "answer", prompt);
  }

  for (const prompt of [
    "Polish the selected file in place.",
    "Translate the selected file to Urdu in place."
  ]) {
    const decision = resolveBehavioralDecision({ prompt, selectedMode: "ASK", workspace });
    assert.equal(decision.mutationIntent, true, prompt);
    assert.notEqual(decision.finalDisposition, "answer", prompt);
  }
});

test("operation transfer preserves the prior operation but gives the new subject authority", () => {
  const messages = [
    { content: "Explain recursion.", role: "user" as const },
    { content: "Recursion is a function solving a problem through smaller instances of itself.", role: "assistant" as const }
  ];
  for (const prompt of [
    "Do the same for JavaScript.",
    "Give me an equivalent explanation for PostgreSQL.",
    "Similarly, cover Redis.",
    "Repeat that with TypeScript."
  ]) {
    const decision = resolveBehavioralDecision({ messages, prompt, selectedMode: "ASK" });
    assert.match(decision.referencedObjective ?? "", /Explain recursion/i, prompt);
    assert.match(decision.resolvedRequest, /Current request:/i, prompt);
    assert.match(decision.resolvedRequest, new RegExp(prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), prompt);
    assert.equal(decision.objective, prompt, prompt);
  }
});

test("text PDF pasted and named-artifact transforms preserve only their authority", () => {
  for (const activePath of ["notes.txt", "report.pdf", "pasted-article.txt"]) {
    const workspace = {
      ...selectedWorkspace,
      activePath,
      activeFileContent: `Selected ${activePath} content with action ALPHA-42.`,
      fileContents: { [activePath]: `Selected ${activePath} content with action ALPHA-42.` },
      fileList: [activePath]
    };
    const prompt = activePath.endsWith(".pdf") ? "Extract the action items." : "Turn this into a checklist.";
    const compacted = compactWorkspaceForChatRequest({ messages: unrelatedMessages, mode: "ASK", prompt, workspace });
    assert.equal(compacted.activePath, activePath);
    assert.match(compacted.activeFileContent, /ALPHA-42/);
  }

  const misleadingFilter = compactWorkspaceForChatRequest({
    messages: unrelatedMessages,
    mode: "ASK",
    prompt: "Extract the customer messages from the selected report.",
    workspace: selectedWorkspace
  });
  assert.equal(misleadingFilter.activePath, "ops-note.txt");
});

test("ASK answer transformations remain distinct from persistent mutation authority", () => {
  for (const prompt of [
    "Rewrite this professionally.",
    "Simplify this.",
    "Turn this into bullet points.",
    "Extract the action items.",
    "Correct the grammar.",
    "Make this more concise.",
    "Translate this into Spanish."
  ]) {
    const decision = resolveBehavioralDecision({ prompt, selectedMode: "ASK", workspace: selectedWorkspace });
    assert.equal(decision.mutationIntent, false, prompt);
    assert.equal(decision.answerOnly, true, prompt);
    assert.equal(decision.finalDisposition, "answer", prompt);
  }

  for (const prompt of [
    "Rewrite the selected file and save the changes.",
    "Update ops-note.txt with this wording.",
    "Modify the selected file on disk."
  ]) {
    const decision = resolveBehavioralDecision({ prompt, selectedMode: "ASK", workspace: selectedWorkspace });
    assert.equal(decision.mutationIntent, true, prompt);
    assert.notEqual(decision.finalDisposition, "answer", prompt);
  }
});

test("typed output constraints normalize comparator scope and closed choices", () => {
  const cases = [
    ["Provide four bullet points; no bullet longer than five words.", 4, 5],
    ["Give three bullets with fewer than six words per bullet.", 3, 5],
    ["Return five bullets, every item at most four words.", 5, 4],
    ["No bullet may exceed 6 words; give three bullets.", 3, 6],
    ["Three bullets, no more than seven words each.", 3, 7]
  ] as const;
  const candidate = "Reliable systems bound retries and preserve useful diagnostic context for every failed operation.";
  for (const [prompt, count, itemLimit] of cases) {
    const constraints = extractAskResponseConstraints(prompt);
    assert.equal(constraints.bulletCount, count, prompt);
    assert.equal(constraints.bulletItemMaxWords, itemLimit, prompt);
    assert.equal(constraints.maxWords, null, prompt);
    assert(constraints.rules.some((rule) => rule.scope === "each_item" && rule.value === itemLimit), prompt);
    const finalized = finalizeAskResponseConstraints(candidate, constraints);
    assert.deepEqual(validateAskResponseConstraints(finalized, constraints), [], prompt);
  }

  for (const [prompt, expected] of [
    ["Answer only YES or NO.", ["YES", "NO"]],
    ["Return exactly one of: ACCEPT, REVISE, or REJECT.", ["ACCEPT", "REVISE", "REJECT"]],
    ["Choose exactly one: LOW / MEDIUM / HIGH.", ["LOW", "MEDIUM", "HIGH"]],
    ["Reply with PASS or FAIL only.", ["PASS", "FAIL"]]
  ] as const) {
    assert.deepEqual(extractAskResponseConstraints(prompt).allowedResponses, expected, prompt);
  }


  const numbered = extractAskResponseConstraints("Give exactly 3 numbered steps.");
  assert.equal(numbered.bulletCount, 3);
  assert.equal(numbered.listStyle, "numbered");
  const numberedAnswer = finalizeAskResponseConstraints("First action. Second action. Third action. Extra action.", numbered);
  assert.match(numberedAnswer, /^1\. /);
  assert.deepEqual(validateAskResponseConstraints(numberedAnswer, numbered), []);

  const singleSentence = extractAskResponseConstraints("Use a single sentence.");
  assert.equal(singleSentence.exactSentences, 1);
  assert.deepEqual(validateAskResponseConstraints(finalizeAskResponseConstraints("One. Two. Three.", singleSentence), singleSentence), []);

  const oneToken = extractAskResponseConstraints("Return exactly one token: SAFE or UNSAFE.");
  assert.deepEqual(oneToken.allowedResponses, ["SAFE", "UNSAFE"]);
  assert.equal(finalizeAskResponseConstraints("SAFE because no mutation occurred.", oneToken), "SAFE");
});

test("hostile provider output is repaired or marked failed at final delivery", async () => {
  const runtime = buildAskRuntimeContext(new Date("2026-08-30T09:00:00.000Z"));
  const run = async (prompt: string, content: string) => {
    const messages = [{ content: prompt, role: "user" as const }];
    const providerCall: AskProviderCall = async () => ({ content, servedModel: "fixture/hostile", status: "ok" });
    return runAskBrain({
      askRuntimeContext: runtime,
      messages,
      model: "fixture/hostile",
      modelSelectionPolicy: "automatic",
      productMode: "ASK",
      prompt,
      providerCall,
      providerCallOwnsRouting: true,
      requestUnderstanding: understandAskRequest({
        freshnessRequired: false,
        hasSuppliedEvidence: false,
        messages,
        prompt
      }),
      workspace: { activePath: "", fileList: [] }
    });
  };

  const bulletsPrompt = "Return five bullets, every item at most four words.";
  const bullets = await run(bulletsPrompt, "One compact answer with enough supported words to divide safely across requested items.");
  assert.deepEqual(validateAskResponseConstraints(bullets.answer, extractAskResponseConstraints(bulletsPrompt)), []);

  const choicePrompt = "Return exactly one of: ACCEPT, REVISE, or REJECT.";
  const choice = await run(choicePrompt, "REVISE because the evidence remains incomplete.");
  assert.equal(choice.answer, "REVISE");

  const impossible = await run("Answer only YES or NO.", "MAYBE");
  assert.equal(impossible.decision.failureStage, "constraint");
  assert.equal(impossible.decision.responseKind, "provider_failure");
  assert.doesNotMatch(impossible.answer, /^MAYBE$/);

  const numberedPrompt = "Give exactly 3 numbered steps.";
  const numbered = await run(numberedPrompt, "First. Second. Third. Fourth.");
  assert.deepEqual(validateAskResponseConstraints(numbered.answer, extractAskResponseConstraints(numberedPrompt)), []);

  const sentencePrompt = "Use a single sentence.";
  const sentence = await run(sentencePrompt, "First sentence. Second sentence. Third sentence.");
  assert.deepEqual(validateAskResponseConstraints(sentence.answer, extractAskResponseConstraints(sentencePrompt)), []);

  const tokenPrompt = "Return exactly one token: SAFE or UNSAFE.";
  const token = await run(tokenPrompt, "SAFE because the request is local-only.");
  assert.equal(token.answer, "SAFE");
});

test("recovery never promotes a locally incomplete fallback over the answer contract", async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "fixture-key";
  const prompt = "Compare React, Vue, and Svelte for a dashboard.";
  const messages = [{ content: prompt, role: "user" as const }];
  let calls = 0;
  const providerCall: AskProviderCall = async () => {
    calls += 1;
    return calls === 1
      ? { content: "React has a broad ecosystem. Vue is approachable.", servedModel: "fixture/primary", status: "ok" }
      : { category: "provider_rate_limited", reason: "fixture limit", status: "failed" };
  };
  try {
    const result = await runAskBrain({
      askRuntimeContext: buildAskRuntimeContext(new Date("2026-08-30T09:00:00.000Z")),
      behavior: resolveBehavioralDecision({ messages, prompt, selectedMode: "ASK" }),
      messages,
      model: "fixture/primary",
      modelSelectionPolicy: "locked",
      productMode: "ASK",
      prompt,
      providerCall,
      providerCallOwnsRouting: true,
      requestUnderstanding: understandAskRequest({
        freshnessRequired: false,
        hasSuppliedEvidence: false,
        messages,
        prompt
      }),
      workspace: { activePath: "", fileList: [] }
    });
    assert.equal(calls, 2);
    assert.equal(result.decision.responseKind, "provider_failure");
    assert.doesNotMatch(result.answer, /For a dashboard, choose React/i);
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
