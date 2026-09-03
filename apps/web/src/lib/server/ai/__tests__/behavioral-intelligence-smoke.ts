import assert from "node:assert/strict";
import {
  analyzeContinuityDependency,
  normalizeFinalActionDecision,
  resolveBehavioralDecision,
  selectRelevantBehavioralContext,
  validateAnswerAgainstContract,
  type BehavioralAction
} from "../behavioral-intelligence";
import {
  buildCodeGenerationBrief
} from "../generation-brief";
import { buildCodeIntentContract } from "../industry-taxonomy";
import {
  generateCrmViteSource,
  validateCodeProductFidelity
} from "../code-app-source-generator";
import { createDeterministicAskAnswer, buildAskRuntimeContext } from "../ask-context";
import { containsUnfinishedWorkMarker } from "../unfinished-content";
import { classifyWebsiteEditIntent } from "../website-edit-intent";
import { visitorReadyText } from "../website-quality-renderer";

type Mode = "ASK" | "CODE" | "WEBSITE";
type TestCase = { name: string; run: () => void };
const tests: TestCase[] = [];

function test(name: string, run: () => void) {
  tests.push({ name, run });
}

function decision(prompt: string, mode: Mode, prior: Array<{ content: string; role: "assistant" | "user" }> = []) {
  return resolveBehavioralDecision({
    messages: [...prior, { content: prompt, role: "user" }],
    prompt,
    selectedMode: mode,
    workspace: { fileList: [] }
  });
}

const nonMutationCases: Array<[string, Mode, BehavioralAction]> = [
  ["What is the best tool for vibe coding?", "ASK", "ANSWER"],
  ["Explain this architecture.", "ASK", "EXPLAIN"],
  ["Help me plan authentication.", "ASK", "PLAN"],
  ["Compare React, Vue, and Svelte.", "ASK", "ANALYZE"],
  ["What is the best coding tool in the world?", "CODE", "ANSWER"],
  ["what is the best tool iin the world for coding", "CODE", "ANSWER"],
  ["What does React hydration mean?", "CODE", "EXPLAIN"],
  ["can u explain hydration", "CODE", "EXPLAIN"],
  ["Should I use Postgres or MongoDB?", "CODE", "ANALYZE"],
  ["Review this architecture. Do not change anything.", "CODE", "ANALYZE"],
  ["Why is this function slow?", "CODE", "ANSWER"],
  ["What makes a premium SaaS website look professional?", "WEBSITE", "ANSWER"],
  ["Should I use WebGL for a law firm website?", "WEBSITE", "ANALYZE"],
  ["Would WebGL make sense for a lawyer site?", "WEBSITE", "ANALYZE"],
  ["Is WebGL a good idea for legal websites?", "WEBSITE", "ANALYZE"],
  ["bro should i use webgl here", "WEBSITE", "ANALYZE"],
  ["What colors would suit a premium watch website?", "WEBSITE", "ANSWER"],
  ["Review this hero copy.", "WEBSITE", "ANALYZE"],
  ["How can I improve conversion?", "WEBSITE", "ANSWER"]
];

for (const [prompt, mode, expectedAction] of nonMutationCases) {
  test(`non-mutating ${mode}: ${prompt}`, () => {
    const result = decision(prompt, mode);
    assert.equal(result.action, expectedAction);
    assert.equal(result.mutationIntent, false);
    assert.equal(result.answerIntent, true);
  });
}

const mutationCases: Array<[string, Mode, BehavioralAction]> = [
  ["Build a simple React todo app.", "CODE", "BUILD"],
  ["buld me a react mobile app for finace stuff", "CODE", "BUILD"],
  ["Implement authentication.", "CODE", "BUILD"],
  ["Fix this bug.", "CODE", "FIX"],
  ["Refactor this function.", "CODE", "EDIT"],
  ["Add validation.", "CODE", "EDIT"],
  ["Run the tests.", "CODE", "RUN"],
  ["Test the app.", "CODE", "TEST"],
  ["Build a premium website for a law firm.", "WEBSITE", "BUILD"],
  ["Create this landing page.", "WEBSITE", "BUILD"],
  ["Change the hero to black.", "WEBSITE", "EDIT"],
  ["For the gallery cards use rounded corners.", "WEBSITE", "EDIT"],
  ["Use WebGL on this site.", "WEBSITE", "EDIT"],
  ["Redesign this website.", "WEBSITE", "EDIT"],
  ["Can you build this for me?", "CODE", "BUILD"],
  ["Please build a React notes app.", "CODE", "BUILD"],
  ["Could you fix this bug?", "CODE", "FIX"],
  ["I want you to create a portfolio site.", "WEBSITE", "BUILD"]
];

for (const [prompt, mode, expectedAction] of mutationCases) {
  test(`mutating ${mode}: ${prompt}`, () => {
    const result = decision(prompt, mode);
    assert.equal(result.action, expectedAction);
    assert.equal(result.mutationIntent, true);
  });
}

test("ASK build becomes a handoff opportunity without granting mutation authority", () => {
  const result = decision("Build a React todo app for me.", "ASK");
  assert.equal(result.action, "HANDOFF");
  assert.equal(result.handoffIntent, true);
  assert.equal(result.mutationIntent, true);
});

test("question grammar around build remains explanatory", () => {
  const result = decision("Can you explain how to build authentication?", "CODE");
  assert.equal(result.action, "EXPLAIN");
  assert.equal(result.mutationIntent, false);
});

test("final action gate separates specialist answers, plans, and mutations", () => {
  const database = decision("Which database should I use for a multi-tenant SaaS?", "CODE");
  assert.equal(database.intentClass, "RECOMMENDATION");
  assert.equal(database.finalDisposition, "answer");
  assert.equal(database.answerOnly, true);
  assert.equal(database.mutationIntent, false);
  assert.equal(database.approvalRequired, false);
  assert.equal(database.executionAllowed, false);

  const explanation = decision("Explain how I could fix this authentication architecture.", "CODE");
  assert.equal(explanation.intentClass, "EXPLANATION");
  assert.equal(explanation.finalDisposition, "answer");
  assert.equal(explanation.mutationIntent, false);

  const mutation = decision("Fix the authentication architecture in my current project.", "CODE");
  assert.equal(mutation.intentClass, "CODE_MUTATION");
  assert.equal(mutation.finalDisposition, "request_approval");
  assert.equal(mutation.mutationIntent, true);
  assert.equal(mutation.approvalRequired, true);
  assert.equal(mutation.executionAllowed, false);

  const plan = decision("Give me a step-by-step plan to migrate this app to Postgres.", "CODE");
  assert.equal(plan.intentClass, "PLAN_ONLY");
  assert.equal(plan.finalDisposition, "plan");
  assert.equal(plan.answerOnly, true);
  assert.equal(plan.mutationIntent, false);
  assert.equal(plan.approvalRequired, false);
  assert.equal(plan.executionAllowed, false);
});

test("todo and build words follow semantic outcome rather than isolated keywords", () => {
  const informational = decision("What architecture should I use for a todo app?", "CODE");
  assert.equal(informational.finalDisposition, "answer");
  assert.equal(informational.mutationIntent, false);

  const walkthrough = decision("Could you walk me through how this should be built?", "CODE");
  assert.equal(walkthrough.answerOnly, true);
  assert.equal(walkthrough.mutationIntent, false);

  const mutation = decision("Build a todo app in the current project.", "CODE");
  assert.equal(mutation.intentClass, "NEW_CODE_BUILD");
  assert.equal(mutation.finalDisposition, "request_approval");
  assert.equal(mutation.approvalRequired, true);

  const paraphrasedMutation = decision("Go ahead and apply the suggested changes.", "CODE");
  assert.equal(paraphrasedMutation.mutationIntent, true);
  assert.equal(paraphrasedMutation.finalDisposition, "request_approval");
});

test("website guidance answers while explicit hero replacement requests approval", () => {
  const guidance = decision("How should I improve the hero section for conversions?", "WEBSITE");
  assert.equal(guidance.finalDisposition, "answer");
  assert.equal(guidance.answerOnly, true);
  assert.equal(guidance.approvalRequired, false);

  const mutation = decision("Replace the current hero with a conversion-focused version.", "WEBSITE");
  assert.equal(mutation.intentClass, "WEBSITE_MUTATION");
  assert.equal(mutation.finalDisposition, "request_approval");
  assert.equal(mutation.approvalRequired, true);
});

test("mixed intent keeps explanation intent while requiring approval for mutation", () => {
  const result = decision("Explain the problem and then fix it in the selected file.", "CODE");
  assert.equal(result.intentClass, "MIXED_INTENT");
  assert.equal(result.mixedIntent, true);
  assert.equal(result.answerIntent, true);
  assert.equal(result.mutationIntent, true);
  assert.equal(result.finalDisposition, "request_approval");
  assert.equal(result.approvalRequired, true);
  assert.equal(result.executionAllowed, false);
});

test("context relevance excludes stale tasks and retains explicit continuity", () => {
  const staleWebsiteMessages = [
    { content: "Build a Korean beauty ecommerce website for Seoul Glow.", role: "user" as const },
    { content: "The Seoul Glow website proposal is ready.", role: "assistant" as const },
    { content: "Explain Redis caching for a Node API.", role: "user" as const }
  ];
  const staleWebsiteDecision = decision(
    "Explain Redis caching for a Node API.",
    "CODE",
    staleWebsiteMessages.slice(0, -1)
  );
  const codeContext = selectRelevantBehavioralContext({
    messages: staleWebsiteMessages,
    mode: "CODE",
    mutationRequested: staleWebsiteDecision.mutationIntent,
    prompt: "Explain Redis caching for a Node API.",
    referencedObjective: staleWebsiteDecision.referencedObjective
  });
  assert.equal(codeContext.topicShift, true);
  assert.equal(codeContext.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(codeContext.messages), /Korean beauty|Seoul Glow|ecommerce/i);

  const staleCodeMessages = [
    { content: "Build a todo application with recurring tasks.", role: "user" as const },
    { content: "The todo application proposal is ready.", role: "assistant" as const },
    { content: "How should a florist homepage establish trust?", role: "user" as const }
  ];
  const staleCodeDecision = decision(
    "How should a florist homepage establish trust?",
    "WEBSITE",
    staleCodeMessages.slice(0, -1)
  );
  const websiteContext = selectRelevantBehavioralContext({
    messages: staleCodeMessages,
    mode: "WEBSITE",
    mutationRequested: staleCodeDecision.mutationIntent,
    prompt: "How should a florist homepage establish trust?",
    referencedObjective: staleCodeDecision.referencedObjective
  });
  assert.equal(websiteContext.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(websiteContext.messages), /todo|recurring/i);

  const continuityPrior = [
    { content: "Give me a plan to refactor authentication safely.", role: "user" as const },
    { content: "Plan: isolate session validation, then migrate callers.", role: "assistant" as const }
  ];
  const continuity = decision("Apply that plan.", "CODE", continuityPrior);
  assert.match(continuity.resolvedRequest, /refactor authentication/i);
  assert.equal(continuity.mutationIntent, true);
  assert.equal(continuity.approvalRequired, true);
  assert(continuity.relevantContextScope.includes("related_conversation"));
});

test("semantic follow-up dependency preserves prior objectives without stealing self-contained topics", () => {
  const prior = [
    { content: "Explain recursion simply.", role: "user" as const },
    { content: "Recursion solves a problem by calling the same process on a smaller input until it reaches a base case.", role: "assistant" as const }
  ];
  const dependent = [
    "Why?",
    "Why though?",
    "Why is that?",
    "How?",
    "How so?",
    "How does that work?",
    "What about that?",
    "And then?",
    "Explain why.",
    "Tell me more.",
    "What do you mean?",
    "Can you explain?",
    "Could you elaborate?",
    "Can you expand on that?",
    "Please elaborate.",
    "Walk me through that.",
    "Does that always work?",
    "Could you go deeper?",
    "Explain that more simply.",
    "Give me an example.",
    "Another example?",
    "What are the downsides?",
    "When would I use that?",
    "Is that always true?",
    "Can you unpack that?",
    "Put that another way.",
    "What makes you say that?",
    "What would break if that assumption changed?",
    "Suppose that is false; what follows?",
    "Compared with the alternative?",
    "Any caveats?",
    "Then what?",
    "Show me a counterexample.",
    "Could you justify it?",
    "What evidence supports that?",
    "Why would that matter in practice?",
    "How would I know if that's happening?",
    "What changes if it doesn't?",
    "Does that scale?",
    "What would the opposite look like?",
    "Where does that assumption fail?",
    "What comes after that?",
    "Can you defend that conclusion?",
    "Is there a simpler way to see it?",
    "What is the strongest objection?",
    "How does the alternative compare?"
  ];
  for (const prompt of dependent) {
    assert.equal(analyzeContinuityDependency(prompt).kind, "dependent", prompt);
    assert.match(decision(prompt, "ASK", prior).referencedObjective ?? "", /recursion/i, prompt);
  }

  const selfContained = [
    "Could you elaborate on quantum entanglement?",
    "Can you expand on the history of Linux?",
    "Please elaborate on photosynthesis.",
    "Walk me through React Server Components.",
    "Does SQLite always work well for high-concurrency writes?",
    "Give me an example of dependency injection.",
    "What are the downsides of PostgreSQL?",
    "When would I use Redis instead of Memcached?",
    "Is gravity always attractive?",
    "Can you unpack B-trees?",
    "Put eventual consistency another way.",
    "What makes PostgreSQL MVCC useful?",
    "What would break if serializable isolation disappeared?",
    "Show me a counterexample to dependency injection.",
    "What are the caveats of WebSockets?",
    "Compared with REST, how does GraphQL behave?",
    "Could you justify using Redis here?",
    "Does SQLite scale for high-concurrency writes?",
    "What is the strongest objection to microservices?",
    "Explain this architecture: event sourcing with CQRS.",
    "How does this PostgreSQL query work?",
    "What is wrong with that React component?"
  ];
  for (const prompt of selfContained) {
    assert.equal(analyzeContinuityDependency(prompt).kind, "independent", prompt);
    assert.equal(decision(prompt, "ASK", prior).referencedObjective, null, prompt);
  }
});

test("semantic continuity follows the newest explicit topic through a cumulative chain", () => {
  const messages: Array<{ content: string; role: "assistant" | "user" }> = [];
  const addTopic = (prompt: string, answer: string) => {
    const result = decision(prompt, "ASK", messages);
    assert.equal(result.referencedObjective, null, prompt);
    messages.push({ content: prompt, role: "user" }, { content: answer, role: "assistant" });
  };
  const addFollowup = (prompt: string, expected: RegExp) => {
    const result = decision(prompt, "ASK", messages);
    assert.match(result.referencedObjective ?? "", expected, prompt);
    messages.push({ content: prompt, role: "user" }, { content: `Answer for ${prompt}`, role: "assistant" });
  };

  addTopic("Explain why database indexes speed up selective queries.", "Indexes reduce scanned rows.");
  addFollowup("Can you unpack that?", /database indexes/i);
  addFollowup("What evidence supports that?", /database indexes/i);
  addTopic("Now explain photosynthesis.", "Photosynthesis converts light into chemical energy.");
  addFollowup("What would the opposite look like?", /photosynthesis/i);
  addTopic("Actually, explain event sourcing with CQRS instead.", "Event sourcing records state changes as events.");
  addFollowup("Where does that assumption fail?", /event sourcing/i);
  addTopic("Describe PostgreSQL MVCC.", "MVCC maintains concurrent row versions.");
  addFollowup("Could you justify it?", /PostgreSQL MVCC/i);
});

test("selected-artifact transformations stay answer-only in ASK", () => {
  const prompt = "make this shorter";
  const result = resolveBehavioralDecision({
    messages: [{ content: prompt, role: "user" }],
    prompt,
    selectedMode: "ASK",
    workspace: {
      activeFileContent: "A selected report that needs a shorter version.",
      activePath: "report.txt",
      fileList: ["report.txt"]
    }
  });
  assert.equal(result.action, "ANSWER");
  assert.equal(result.mutationIntent, false);
  assert.equal(result.approvalRequired, false);
  assert.equal(result.clarificationRequired, false);
  assert(result.relevantContextScope.includes("selected_project"));
});

test("contradictory final action metadata fails closed with structured warnings", () => {
  const normalized = normalizeFinalActionDecision({
    answerOnly: true,
    approvalRequired: true,
    approvalSatisfied: false,
    clarificationRequired: false,
    disposition: "execute_approved_action",
    executionAllowed: true,
    mutationRequested: true
  });
  assert.equal(normalized.disposition, "answer");
  assert.equal(normalized.mutationRequested, false);
  assert.equal(normalized.approvalRequired, false);
  assert.equal(normalized.executionAllowed, false);
  assert(normalized.warnings.length >= 3);
  assert(normalized.warnings.every((warning) => warning.code.startsWith("FINAL_ACTION_")));
});

test("question grammar is not treated as a required named entity", () => {
  const result = decision("Should I use WebGL for a law firm website?", "WEBSITE");
  assert.deepEqual(result.requestedEntities, ["WebGL"]);
  assert.equal(validateAnswerAgainstContract(
    "For a law firm, WebGL should be a restrained, optional accent that preserves accessibility and performance.",
    result.answerContract
  ).complete, true);
});

test("top-five follow-up resolves the prior objective and count", () => {
  const result = decision("Give me the top 5.", "ASK", [
    { content: "What is the best tool for vibe coding?", role: "user" },
    { content: "Cursor is one strong option, depending on workflow.", role: "assistant" }
  ]);
  assert.equal(result.action, "ANSWER");
  assert.equal(result.requestedCount, 5);
  assert.match(result.resolvedRequest, /vibe coding/i);
  assert.equal(result.referencedObjective, "What is the best tool for vibe coding?");
});

test("an explicit top-five subject starts a new topic instead of reusing a naming task", () => {
  const result = decision("Give me the top five tools for vibe coding.", "ASK", [
    { content: "Give me five names combining Aasia, Mujtaba and Hassan.", role: "user" },
    { content: "Muhaasia, AhsanIQ, MuhaTech, Hasia AI, Mujassan", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, null);
  assert.equal(result.resolvedRequest, "Give me the top five tools for vibe coding.");
  assert.equal(result.requestedCount, 5);
  assert.doesNotMatch(result.resolvedRequest, /Muhaasia|AhsanIQ|Mujassan/i);
});

test("think-longer follow-up retains the answerable objective", () => {
  const result = decision("Think longer and answer.", "ASK", [
    { content: "Should I use Postgres or MongoDB for a multi-tenant SaaS?", role: "user" },
    { content: "Postgres is usually the safer default.", role: "assistant" }
  ]);
  assert.equal(result.action, "ANSWER");
  assert.match(result.resolvedRequest, /Postgres or MongoDB/i);
  assert.equal(result.mutationIntent, false);
  assert.deepEqual(result.requestedEntities, ["Postgres", "MongoDB", "SaaS"]);
  assert.equal(
    validateAnswerAgainstContract(
      "Postgres is the stronger default for a multi-tenant SaaS because relational constraints, transactions, and row-level security fit tenant isolation well. MongoDB can still fit highly variable documents, but it shifts more consistency work into application code.",
      result.answerContract
    ).complete,
    true
  );
});

test("answer-previous follow-up does not require orchestration verbs as entities", () => {
  const result = decision("Answer the previous question correctly.", "ASK", [
    { content: "What is the best tool for vibe coding?", role: "user" },
    { content: "Cursor is one strong option.", role: "assistant" },
    { content: "Give me the top 5.", role: "user" },
    { content: "1. Cursor\n2. Windsurf\n3. Replit\n4. GitHub Copilot\n5. Zed", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, "What is the best tool for vibe coding?");
  assert.deepEqual(result.requestedEntities, []);
  assert.equal(
    validateAnswerAgainstContract(
      "Cursor is a strong default for vibe coding because its repository-aware AI editing stays close to a familiar VS Code workflow. Replit is better for instant browser prototypes, while GitHub Copilot fits developers who want lighter assistance inside an existing editor.",
      result.answerContract
    ).complete,
    true
  );
});

test("explicit website brand fact is an edit while ASK remains non-mutating", () => {
  const website = decision("Our name is Westbridge Legal.", "WEBSITE");
  assert.equal(website.action, "EDIT");
  assert.equal(website.mutationIntent, true);
  const ask = decision("Our name is Westbridge Legal.", "ASK");
  assert.equal(ask.action, "ANSWER");
  assert.equal(ask.mutationIntent, false);
});

test("website brand facts are scoped and stop before another edit directive", () => {
  assert.equal(decision("My name is Ali.", "WEBSITE").mutationIntent, false);
  assert.equal(decision("The name is temporary.", "WEBSITE").mutationIntent, false);
  const intent = classifyWebsiteEditIntent("Our name is Westbridge Legal and use blue.");
  assert.equal(intent.editType, "business_name");
  assert.equal(intent.extractedValues.businessName, "Westbridge Legal");
  const unsafe = classifyWebsiteEditIntent("Our name is </title><script>alert(1)</script>.");
  assert.equal(unsafe.extractedValues.businessName, undefined);
});

test("visitor copy cleanup is phrase-specific", () => {
  assert.equal(visitorReadyText("Free samples are available."), "Free samples are available.");
  assert.equal(visitorReadyText("Open the editable document."), "Open the editable document.");
  assert.equal(visitorReadyText("Review editable sample pricing."), "Review illustrative pricing.");
});

test("comparison follow-ups retain the original entities and requested count", () => {
  const prior = [
    { content: "Compare Cursor and Claude Code.", role: "user" as const },
    { content: "Both are capable, with different workflows.", role: "assistant" as const },
    { content: "Which one is better for a beginner?", role: "user" as const },
    { content: "Cursor is usually easier for an editor-first beginner.", role: "assistant" as const },
    { content: "Why?", role: "user" as const },
    { content: "Its workflow is familiar and visible.", role: "assistant" as const }
  ];
  const result = decision("Give me 3 reasons.", "ASK", prior);
  assert.equal(result.referencedObjective, "Compare Cursor and Claude Code.");
  assert.match(result.resolvedRequest, /Cursor and Claude Code/i);
  assert.equal(result.requestedCount, 3);
});

test("selection follow-ups may answer with one named choice", () => {
  const result = decision("Which one is simpler for a beginner?", "ASK", [
    { content: "Compare React and Vue for a small dashboard.", role: "user" },
    { content: "Both can build the dashboard, with different ecosystems.", role: "assistant" }
  ]);
  assert.deepEqual(result.requestedComparisons, ["React", "Vue"]);
  assert.equal(
    validateAnswerAgainstContract(
      "Vue is the simpler beginner choice because its single-file component structure and official tooling are easier to learn together.",
      result.answerContract
    ).complete,
    true
  );
});

test("WEBSITE advice follow-ups retain the site decision without mutation", () => {
  const result = decision("What are the downsides?", "WEBSITE", [
    { content: "Should I use WebGL for my law firm site?", role: "user" },
    { content: "Use it only as a restrained optional accent.", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, "Should I use WebGL for my law firm site?");
  assert.equal(result.mutationIntent, false);
  assert.match(result.resolvedRequest, /WebGL.*law firm/i);
});

test("CODE explanation transformations retain the technical topic", () => {
  const result = decision("Make that simpler.", "CODE", [
    { content: "Explain React hydration.", role: "user" },
    { content: "Hydration attaches behavior to server-rendered markup.", role: "assistant" }
  ]);
  assert.equal(result.action, "ANSWER");
  assert.equal(result.referencedObjective, "Explain React hydration.");
  assert.equal(result.mutationIntent, false);
});

test("latest explicit objective wins over an older technical topic", () => {
  const result = decision("Make it shorter.", "ASK", [
    { content: "Compare React and Vue.", role: "user" },
    { content: "React and Vue use different component ecosystems.", role: "assistant" },
    { content: "Now write an email to my client.", role: "user" },
    { content: "Hello, I wanted to share a project update.", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, "Now write an email to my client.");
  assert.doesNotMatch(result.resolvedRequest, /React|Vue/i);
});

test("complete why questions do not inherit an unrelated live objective", () => {
  const result = decision("Why do humans dream?", "ASK", [
    { content: "What happened in the world today that could affect AI companies the most?", role: "user" },
    { content: "Current sources are unavailable.", role: "assistant" },
    { content: "Answer my next question using only three words.", role: "user" },
    { content: "Understood.", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, null);
  assert.equal(result.resolvedRequest, "Why do humans dream?");
  assert.equal(result.researchIntent, false);
});

const liveObjectiveHistory = [
  { content: "What happened in AI news today?", role: "user" as const },
  { content: "I could not verify the current answer from suitable live sources.", role: "assistant" as const }
];

for (const prompt of [
  "Why do humans dream?",
  "Why is the sky blue?",
  "How does photosynthesis work?",
  "How can I start freelancing?",
  "Which one is the best database for Mango?",
  "Think longer about why humans dream.",
  "Before you answer it, explain photosynthesis.",
  "Before you answer it explain photosynthesis.",
  "What database does Mango use now?",
  "What is quantum entanglement?",
  "When did World War II end?",
  "Where is Karachi?",
  "Who created Linux?"
]) {
  test(`self-contained request does not inherit live context: ${prompt}`, () => {
    const result = decision(prompt, "ASK", liveObjectiveHistory);
    assert.equal(result.referencedObjective, null);
    assert.equal(result.researchIntent, false);
    assert.doesNotMatch(result.resolvedRequest, /AI news today/i);
  });
}

const recursionHistory = [
  { content: "Explain recursion simply.", role: "user" as const },
  { content: "Recursion is when a process solves a problem by calling a smaller version of itself.", role: "assistant" as const }
];

for (const prompt of [
  "Why?",
  "Why though?",
  "How?",
  "How so?",
  "What about that?",
  "And then?",
  "Explain why.",
  "Tell me more.",
  "What do you mean?",
  "Can you explain?",
  "Why is that?",
  "How does that work?",
  "What does that mean?",
  "Explain this more."
]) {
  test(`elliptical request preserves relevant continuity: ${prompt}`, () => {
    const result = decision(prompt, "ASK", recursionHistory);
    assert.equal(result.referencedObjective, "Explain recursion simply.");
    assert.match(result.resolvedRequest, /recursion/i);
    assert.equal(result.researchIntent, false);
  });
}

test("active negative constraints survive list and choice follow-ups", () => {
  const result = decision("Which one is simplest?", "ASK", [
    { content: "Help me choose an auth system.", role: "user" },
    { content: "There are several suitable choices.", role: "assistant" },
    { content: "Do not recommend Firebase.", role: "user" },
    { content: "Understood.", role: "assistant" },
    { content: "Give me top 3.", role: "user" },
    { content: "1. Clerk\n2. Auth0\n3. Supabase Auth", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, "Help me choose an auth system.");
  assert(result.answerContract.explicitConstraints.some((constraint) => /do not recommend Firebase/i.test(constraint)));
  assert.equal(result.requestedEntities.includes("Firebase"), false);
});

test("negative constraints expire when the conversation changes topic", () => {
  const result = decision("Compare AWS and Azure.", "ASK", [
    { content: "Help me choose an auth system.", role: "user" },
    { content: "There are several suitable choices.", role: "assistant" },
    { content: "Do not recommend Firebase.", role: "user" },
    { content: "Understood.", role: "assistant" }
  ]);
  assert.equal(result.answerContract.explicitConstraints.some((constraint) => /Firebase/i.test(constraint)), false);
  assert.deepEqual(result.requestedEntities, ["AWS", "Azure"]);
});

test("explicit topic reference skips an intervening identity question", () => {
  const result = decision("Go back to the tools. Give me top 5.", "ASK", [
    { content: "What are the best coding tools?", role: "user" },
    { content: "Several choices fit different workflows.", role: "assistant" },
    { content: "Who are you?", role: "user" },
    { content: "I am Hassali.", role: "assistant" }
  ]);
  assert.equal(result.referencedObjective, "What are the best coding tools?");
  assert.match(result.resolvedRequest, /best coding tools/i);
});

test("answer contract requires all comparison entities", () => {
  const result = decision("Compare React, Vue, and Svelte.", "ASK");
  const incomplete = validateAnswerAgainstContract(
    "React has a broad ecosystem, while Vue is approachable.",
    result.answerContract
  );
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missingEntities, ["Svelte"]);

  const complete = validateAnswerAgainstContract(
    "React has the broadest ecosystem. Vue is approachable. Svelte shifts more work to compilation.",
    result.answerContract
  );
  assert.equal(complete.complete, true);
});

test("answer contract enforces requested list count", () => {
  const result = decision("Give me the top 5 tools for vibe coding.", "ASK");
  const validation = validateAnswerAgainstContract(
    "1. Cursor\n2. Windsurf\n3. Replit",
    result.answerContract
  );
  assert.equal(validation.complete, false);
  assert.match(validation.issues.join(" "), /fewer than the requested 5/i);

  const complete = validateAnswerAgainstContract(
    "1. Cursor\n2. Windsurf\n3. Replit\n4. GitHub Copilot\n5. Zed",
    result.answerContract
  );
  assert.equal(complete.complete, true);
});

test("personal advice with one step does not invent entity or list requirements", () => {
  const result = decision(
    "I feel distracted today. Suggest one small step that could help me focus for fifteen minutes.",
    "ASK"
  );
  assert.deepEqual(result.requestedEntities, []);
  assert.equal(result.answerContract.requiredOutputs.includes("steps"), false);

  const validation = validateAnswerAgainstContract(
    "Put your phone out of reach, set a fifteen-minute timer, and work only on the next small task until it rings.",
    result.answerContract
  );
  assert.equal(validation.complete, true);

  const concise = decision("I need to focus now. Suggest one practical action.", "ASK");
  const conciseValidation = validateAnswerAgainstContract(
    "Set a ten-minute timer and work only on the next small task until it rings.",
    concise.answerContract
  );
  assert.equal(conciseValidation.complete, true);

  for (const [prompt, answer] of [
    ["Suggest one quick way to begin writing when I feel stuck.", "Write one deliberately rough sentence, then improve it after the page is no longer blank."],
    ["Recommend one action to reduce distractions during a short study session.", "Put your phone in another room before you start the study timer."]
  ] as const) {
    const advice = decision(prompt, "ASK");
    const adviceValidation = validateAnswerAgainstContract(answer, advice.answerContract);
    assert.deepEqual(advice.requestedEntities, []);
    assert.equal(adviceValidation.complete, true);
  }
});

test("answer contract rejects unrelated evaluator output", () => {
  const result = decision("What is the best tool for vibe coding?", "ASK");
  const validation = validateAnswerAgainstContract(
    "Relevance: PASS\nCorrectness: 80%\nQuality: PASS",
    result.answerContract
  );
  assert.equal(validation.complete, false);
  assert.match(validation.issues.join(" "), /evaluator|topic/i);
});

test("answer contract enforces multiple requested category counts", () => {
  const result = decision("Give me 3 benefits and 2 drawbacks.", "ASK");
  const incomplete = validateAnswerAgainstContract(
    "Benefits:\n1. Fast\n2. Clear\n\nDrawbacks:\n1. Costly",
    result.answerContract
  );
  assert.equal(incomplete.complete, false);
  assert.deepEqual(
    incomplete.missingCountRequirements.map((requirement) => [requirement.count, requirement.label]),
    [[3, "benefits"], [2, "drawbacks"]]
  );

  const complete = validateAnswerAgainstContract(
    "Benefits:\n1. Fast\n2. Clear\n3. Reliable\n\nDrawbacks:\n1. Costly\n2. Complex",
    result.answerContract
  );
  assert.equal(complete.complete, true);
});

test("answer contract accepts Unicode bullets for category counts", () => {
  const result = decision("Give me 2 benefits and 2 drawbacks.", "ASK");
  const complete = validateAnswerAgainstContract(
    "Benefits:\n• Fast setup\n• Clear workflow\n\nDrawbacks:\n• Monthly cost\n• Vendor dependency",
    result.answerContract
  );
  assert.equal(complete.complete, true);
});

test("answer contract enforces sentence counts and every question", () => {
  const format = decision("Explain OAuth in exactly 3 sentences.", "ASK");
  assert.equal(validateAnswerAgainstContract(
    "OAuth delegates authorization. It uses scoped grants.",
    format.answerContract
  ).complete, false);
  assert.equal(validateAnswerAgainstContract(
    "OAuth delegates authorization. It uses scoped grants. Applications exchange grants for tokens.",
    format.answerContract
  ).complete, true);

  const multipart = decision("What is OAuth? How is it different from sessions?", "ASK");
  assert.equal(validateAnswerAgainstContract(
    "OAuth delegates authorization to an identity provider.",
    multipart.answerContract
  ).complete, false);
  assert.equal(validateAnswerAgainstContract(
    "OAuth delegates authorization through scoped tokens. It is different from sessions, which identify a signed-in user to the application after authentication.",
    multipart.answerContract
  ).complete, true);
});

test("one example for each compared technology requires both examples", () => {
  const result = decision("Explain REST and GraphQL and give one example of each.", "ASK");
  assert.deepEqual(result.requestedEntities, ["REST", "GraphQL"]);
  const incomplete = validateAnswerAgainstContract(
    "REST uses resource endpoints. GraphQL uses a typed query schema. Example: GET /users.",
    result.answerContract
  );
  assert.equal(incomplete.complete, false);
  const complete = validateAnswerAgainstContract(
    "REST uses resource endpoints. REST example: GET /users. GraphQL uses a typed query schema. GraphQL example: query { users { id } }.",
    result.answerContract
  );
  assert.equal(complete.complete, true);
});

test("writing imperatives are not mistaken for required named entities", () => {
  const result = decision("Write a friendly two-sentence reminder to return a borrowed book this weekend.", "ASK");
  assert.deepEqual(result.requestedEntities, []);
  assert(result.answerContract.formatRequirements.some((requirement) => /^two sentences?$/.test(requirement)));
});

test("positive and negative tone instructions survive into the answer contract", () => {
  const result = decision("Say something friendly but not cheesy.", "ASK");
  assert(result.answerContract.explicitConstraints.includes("friendly"));
  assert(result.answerContract.explicitConstraints.includes("not cheesy"));

  const neighbor = decision("Write a warm reply without robotic language.", "ASK");
  assert(neighbor.answerContract.explicitConstraints.includes("warm"));
  assert(neighbor.answerContract.explicitConstraints.includes("without robotic"));
});

test("bounded writing is validated by delivery rather than prompt-word parroting", () => {
  const result = decision("Give me a calm pep talk for starting a boring chore, without sounding dramatic.", "ASK");
  assert.equal(validateAnswerAgainstContract(
    "Set a five-minute timer and begin with the easiest visible part; stopping after that is allowed.",
    result.answerContract
  ).complete, true);
  assert.equal(validateAnswerAgainstContract(
    "I couldn't produce a trustworthy answer after provider validation failed.",
    result.answerContract
  ).complete, false);
});

test("dramatic tone exclusions reject stock motivational slogans", () => {
  const result = decision("Reassure me about opening a difficult email, without sounding dramatic.", "ASK");
  assert.equal(result.answerContract.explicitConstraints.some((value) => /dramatic/i.test(value)), true);
  assert.equal(
    validateAnswerAgainstContract("Most difficult emails are fine. You've got this.", result.answerContract).complete,
    false
  );
  assert.equal(
    validateAnswerAgainstContract("Open it only to learn what it says; you can decide what to do after reading it.", result.answerContract).complete,
    true
  );
});

test("supportive imperatives are not entities and accept substantive delivery", () => {
  const result = decision("Encourage me in a practical, non-cliched way.", "ASK");
  assert.deepEqual(result.requestedEntities, []);
  assert(result.answerContract.explicitConstraints.includes("non-cliched"));
  assert.equal(validateAnswerAgainstContract(
    "Pick one useful task that fits the energy you actually have, and let that be enough for this afternoon.",
    result.answerContract
  ).complete, true);

  const paraphrase = decision("Say something supportive for someone restarting work after lunch, without cliches.", "ASK");
  assert.deepEqual(paraphrase.requestedEntities, []);
  assert(paraphrase.answerContract.explicitConstraints.includes("without cliches"));
  assert.equal(validateAnswerAgainstContract(
    "Choose one clear task for the next twenty minutes; the rest can wait until you have your rhythm back.",
    paraphrase.answerContract
  ).complete, true);
  assert.equal(validateAnswerAgainstContract(
    "The afternoon is manageable. You've got this.",
    paraphrase.answerContract
  ).complete, false);
});

test("sentence-level conversational imperatives are not named entities", () => {
  const result = decision("I've had a quiet day. Ask me one interesting but easy question.", "ASK");
  assert.deepEqual(result.requestedEntities, []);
  assert.deepEqual(result.answerContract.requestedEntities, []);
});

test("multi-location deterministic time answers every requested city", () => {
  const answer = createDeterministicAskAnswer(
    "What time is it in New York and South Africa?",
    buildAskRuntimeContext(new Date("2026-07-30T12:00:00.000Z"))
  );
  assert(answer);
  assert.match(answer, /New York:/);
  assert.match(answer, /South Africa:/);
  assert.match(answer, /Africa\/Johannesburg/);
  assert.match(answer, /Interpreting South Africa using its standard timezone/i);
});

test("todo Product Brief stays focused", () => {
  const brief = buildCodeGenerationBrief(buildCodeIntentContract({
    prompt: "Build a simple React todo app."
  }));
  assert.equal(brief.productBrief.productType, "todo_app");
  assert.equal(brief.productBrief.primaryEntity, "task");
  assert.equal(brief.productBrief.complexity, "simple");
  assert(brief.productBrief.nonGoals.includes("CRM"));
  assert.equal(brief.filePlan.length, 7);
});

test("todo source has task interactions and no business dashboard drift", () => {
  const brief = buildCodeGenerationBrief(buildCodeIntentContract({
    prompt: "Build a simple React todo app."
  }));
  const files = generateCrmViteSource({
    appName: "Todo App",
    brief,
    prompt: brief.originalPrompt
  });
  const content = files.map((file) => file.content).join("\n");
  const runtimeContent = files.filter((file) => file.path !== "HASSALI.md").map((file) => file.content).join("\n");
  assert.match(content, /create task|New task|completed/i);
  assert.doesNotMatch(runtimeContent, /Local Product Studio|Clients|Invoices|business metrics|Workflow Board/i);
  assert.equal(validateCodeProductFidelity(brief.productBrief, files).passed, true);
});

test("todo product language is distinct from unfinished-work markers", () => {
  assert.equal(containsUnfinishedWorkMarker("Build a Todo app with a Todo type."), false);
  assert.equal(containsUnfinishedWorkMarker("// TODO: replace this content"), true);
  assert.equal(containsUnfinishedWorkMarker("// TODO"), true);
  assert.equal(containsUnfinishedWorkMarker("<p>TODO</p>"), true);
  assert.equal(containsUnfinishedWorkMarker("<p>Coming soon</p>"), true);
});

test("advanced task managers and scientific calculators retain requested scope", () => {
  const taskPrompt = "Build a collaborative Kanban task manager with boards, assignees, and due dates.";
  const taskBrief = buildCodeGenerationBrief(buildCodeIntentContract({ prompt: taskPrompt }));
  assert.equal(taskBrief.productBrief.productType, "task_management");
  assert(taskBrief.productBrief.requiredFeatures.includes("kanban board"));
  assert(taskBrief.productBrief.requiredFeatures.includes("assignees"));
  assert(taskBrief.productBrief.requiredFeatures.includes("due dates"));
  const taskSource = generateCrmViteSource({
    appName: "Team Tasks",
    brief: taskBrief,
    prompt: taskPrompt
  }).map((file) => file.content).join("\n");
  assert.match(taskSource, /kanban board|project boards/i);
  assert.match(taskSource, /assignees/i);
  assert.match(taskSource, /due dates/i);

  const calculatorPrompt = "Build a scientific calculator with trigonometry and calculation history.";
  const calculatorBrief = buildCodeGenerationBrief(buildCodeIntentContract({ prompt: calculatorPrompt }));
  assert.equal(calculatorBrief.productBrief.productType, "scientific_calculator");
  const calculatorSource = generateCrmViteSource({
    appName: "Scientific Calculator",
    brief: calculatorBrief,
    prompt: calculatorPrompt
  }).map((file) => file.content).join("\n");
  assert.match(calculatorSource, /sin|cos|tan/);
  assert.match(calculatorSource, /Calculation history/);
});

test("React finance dashboards preserve income expense and balance scope", () => {
  const prompt = "Build me a simple React finance dashboard with income, expense, and monthly balance cards.";
  const brief = buildCodeGenerationBrief(buildCodeIntentContract({ prompt }));
  assert.equal(brief.productBrief.productType, "finance_dashboard");
  const files = generateCrmViteSource({ appName: "Custom App", brief, prompt });
  const content = files.map((file) => file.content).join("\n");
  assert.match(content, /Finance Flow/);
  assert.match(content, /Monthly income/);
  assert.match(content, /Monthly expenses/);
  assert.match(content, /Current balance/);
  assert.doesNotMatch(content, /Local Service|grooming|laundry/i);
  assert.equal(validateCodeProductFidelity(brief.productBrief, files).passed, true);
});

test("representative product matrix preserves requested product type", () => {
  const prompts = [
    ["Build a React calculator.", "calculator", /calculator|arithmetic/i],
    ["Build a simple Pomodoro timer in React.", "pomodoro_timer", /pomodoro|focus timer/i],
    ["Create a React expense tracker.", "expense_tracker", /expense|running total/i],
    ["Build a restaurant ordering app in React.", "restaurant_ordering", /menu|current order/i],
    ["Build a CRM with dashboard and billing.", "crm", /contact|deal|pipeline/i],
    ["Build an inventory management app in React.", "inventory_system", /inventory|stock|product/i]
  ] as const;
  for (const [prompt, expected, expectedContent] of prompts) {
    const brief = buildCodeGenerationBrief(buildCodeIntentContract({ prompt }));
    assert.equal(brief.productBrief.productType, expected, prompt);
    const files = generateCrmViteSource({
      appName: expected.replace(/_/g, " "),
      brief,
      prompt
    });
    assert.equal(validateCodeProductFidelity(brief.productBrief, files).passed, true, prompt);
    assert.match(files.map((file) => file.content).join("\n"), expectedContent, prompt);
  }
});

let passed = 0;
for (const entry of tests) {
  entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}

process.stdout.write(`\n${passed}/${tests.length} behavioral intelligence checks passed.\n`);
