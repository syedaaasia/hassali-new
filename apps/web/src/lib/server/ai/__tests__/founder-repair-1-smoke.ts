import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAskRuntimeContext } from "../ask-context";
import { runAskBrain, type AskProviderCall } from "../ask-brain-orchestrator";
import { understandAskRequest } from "../ask-request-understanding";
import { decideAskFreshness } from "../ask-source-reliability";
import { extractAskResponseConstraints, validateAskResponseConstraints } from "../ask-response-constraints";
import { applyProjectNoteAction, buildDeterministicAskSummary, parseProjectNoteAction } from "@/lib/project-notes-intelligence";
import { createHassaliSelfKnowledgeAnswer } from "@/lib/server/self-knowledge/hassali-self-knowledge";
import { formatGitHubCodeContext, listGitHubRepositories, listGitHubRepositoryPaths } from "@/lib/server/github/github-integration";

const runtime = buildAskRuntimeContext(new Date("2026-08-22T09:00:00.000Z"));
const workspace = { activePath: "", fileList: [] };
type TestMessage = { content: string; role: "assistant" | "system" | "user" };

function askInput(prompt: string, messages: TestMessage[] = [{ content: prompt, role: "user" }], providerCall?: AskProviderCall) {
  return {
    askRuntimeContext: runtime,
    messages,
    model: "fixture/reasoning",
    modelSelectionPolicy: "automatic" as const,
    productMode: "ASK" as const,
    prompt,
    providerCall,
    providerCallOwnsRouting: true,
    requestUnderstanding: understandAskRequest({
      freshnessRequired: false,
      hasSuppliedEvidence: false,
      messages,
      prompt
    }),
    workspace
  };
}

test("timeless reasoning does not require live retrieval", () => {
  const prompts = [
    "If yesterday was two days before Thursday, what day is today?",
    "Which is heavier: 1 kg of steel or 1 kg of feathers?",
    "If an AI gives a confident answer with citations, is it automatically true?",
    "A farmer has 17 sheep. All but 9 die. How many are alive?",
    "Prove why 0.999... equals 1.",
    "How many handshakes happen among 10 people?"
  ];
  for (const prompt of prompts) {
    const decision = decideAskFreshness({ prompt, runtime });
    assert.equal(decision.researchRequired, false, prompt);
    assert.equal(decision.sourceRequirement, "none_required", prompt);
  }
});

test("current world facts and named-source existence use research authority", () => {
  for (const prompt of [
    "Who is currently the richest person in the world?",
    "What happened in the world today that could affect AI companies the most?",
    "There is a research paper called \"Quantum Bananas Improve Human Memory by 73%\" published by Harvard in 2024. Summarize its findings."
  ]) {
    assert.equal(decideAskFreshness({ prompt, runtime }).researchRequired, true, prompt);
  }
});

test("general reasoning is model-driven and excludes unrelated prior assistant content", async () => {
  const captured: Array<{ content: string; role: string }>[] = [];
  const providerCall: AskProviderCall = async (input) => {
    captured.push(input.messages);
    return { content: "One hour: take the pills at zero, thirty, and sixty minutes.", servedModel: "fixture/reasoning", status: "ok" };
  };
  const prompt = "A doctor gives me three pills, one every half hour. How long until all are taken?";
  const result = await runAskBrain(askInput(prompt, [
    { content: "My previous medical concern was a missed period.", role: "user" },
    { content: "Please contact a gynecologist about that health concern.", role: "assistant" },
    { content: prompt, role: "user" }
  ], providerCall));
  assert.match(result.answer, /one hour|sixty/i);
  assert.equal(captured.flat().some((message) => /missed period|gynecologist/i.test(message.content)), false);
});

test("current and prior-turn response constraints are reusable and validated", async () => {
  const exact = extractAskResponseConstraints("Explain the sky in exactly 20 words.");
  assert.equal(exact.exactWords, 20);
  assert.equal(validateAskResponseConstraints("one two three", exact).length, 1);
  const messages = [
    { content: "Answer my next question using only three words.", role: "user" as const },
    { content: "Understood.", role: "assistant" as const },
    { content: "Why do humans dream?", role: "user" as const }
  ];
  const prior = extractAskResponseConstraints(messages[2].content, messages);
  assert.equal(prior.exactWords, 3);
  assert.equal(prior.source, "prior-turn");
  const providerCall: AskProviderCall = async () => ({ content: "Brains process experiences.", servedModel: "fixture/reasoning", status: "ok" });
  const result = await runAskBrain(askInput(messages[2].content, messages, providerCall));
  assert.equal(result.answer.split(/\s+/).length, 3);
});

test("forbidden-word and bullet constraints fail deterministically when violated", () => {
  const forbidden = extractAskResponseConstraints("Explain simply, but do not use the words atom, particle, or physics.");
  assert.deepEqual(forbidden.forbiddenWords, ["atom", "particle", "physics"]);
  assert.match(validateAskResponseConstraints("An atom is small.", forbidden)[0] ?? "", /forbidden_word:atom/);
  const bullets = extractAskResponseConstraints("Summarize in exactly 4 bullets.");
  assert.match(validateAskResponseConstraints("- One\n- Two", bullets)[0] ?? "", /constraint_bullets/);
});

test("conversation-only project facts prefer the latest correction", async () => {
  const messages = [
    { content: "My imaginary project is called Mango. It uses Python, PostgreSQL and React. Remember that only for this conversation.", role: "user" as const },
    { content: "Understood for this conversation.", role: "assistant" as const },
    { content: "Actually Mango now uses SQLite instead of PostgreSQL.", role: "user" as const },
    { content: "What database does Mango use?", role: "user" as const }
  ];
  const result = await runAskBrain(askInput(messages.at(-1)!.content, messages));
  assert.equal(result.answer, "SQLite");
});

test("Hassali self knowledge is honest about stewardship and explains Growth for users", async () => {
  const founder = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "Who founded and built Hassali?" });
  assert.match(founder?.answer ?? "", /not name|not recorded|canonical/i);
  assert.doesNotMatch(founder?.answer ?? "", /git author/i);
  const growth = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "What is Growth in Hassali?" });
  assert.match(growth?.answer ?? "", /audience|campaign|acquisition/i);
  assert.doesNotMatch(growth?.answer ?? "", /server-side|typed handoff|orchestrator/i);
});

test("Project Notes actions preserve manual notes and summary remains bounded", () => {
  const added = applyProjectNoteAction("- Keep manual decision", parseProjectNoteAction("Add to my notes that launch on Friday")!);
  assert.match(added.notes, /Keep manual decision/);
  assert.match(added.notes, /launch on Friday/i);
  const updated = applyProjectNoteAction(added.notes, parseProjectNoteAction("Update launch on Friday to launch on Monday")!);
  assert.match(updated.notes, /launch on Monday/i);
  const removed = applyProjectNoteAction(updated.notes, parseProjectNoteAction("Remove launch on Monday from my notes")!);
  assert.doesNotMatch(removed.notes, /launch on Monday/i);
  const summary = buildDeterministicAskSummary(Array.from({ length: 14 }, (_, index) => ({ content: "Meaningful conversation item number " + index + " with enough context.", role: index % 2 ? "assistant" as const : "user" as const })));
  assert(summary.split("\n").length <= 5);
});

test("GitHub discovery is bounded and filters sensitive/build paths from source metadata", async () => {
  const repositoryFetch: typeof fetch = async () => new Response(JSON.stringify([
    { default_branch: "main", html_url: "https://github.com/acme/private", name: "private", owner: { login: "acme" }, private: true, updated_at: "2026-08-22T00:00:00Z" }
  ]), { status: 200 });
  const repositories = await listGitHubRepositories({ fetchImpl: repositoryFetch, token: "test-token" });
  assert.deepEqual(repositories.map((repository) => repository.fullName), ["acme/private"]);
  const treeFetch: typeof fetch = async () => new Response(JSON.stringify({ sha: "abc", tree: [
    { path: "src/App.tsx", type: "blob" },
    { path: ".env", type: "blob" },
    { path: "node_modules/pkg/index.js", type: "blob" },
    { path: ".next/cache/item", type: "blob" }
  ] }), { status: 200 });
  const tree = await listGitHubRepositoryPaths({ branch: "main", fetchImpl: treeFetch, owner: "acme", repository: "private", token: "test-token" });
  assert.deepEqual(tree.paths, ["src/App.tsx"]);
  const codeContext = formatGitHubCodeContext({ branch: "main", head: tree.head, paths: tree.paths, repository: "acme/private", truncated: tree.truncated });
  assert.match(codeContext, /read-only remote metadata/);
  assert.match(codeContext, /src\/App\.tsx/);
  assert.doesNotMatch(codeContext, /\.env|node_modules|test-token/);
  const callbackRoute = await readFile(new URL("../../../../app/api/github/callback/route.ts", import.meta.url), "utf8");
  const projectRoute = await readFile(new URL("../../../../app/api/github/project/route.ts", import.meta.url), "utf8");
  const chatRoute = await readFile(new URL("../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(callbackRoute, /hassali_github_oauth_state/);
  assert.match(callbackRoute, /expectedState[^\n]+state/);
  assert.match(projectRoute, /readBoundedJson/);
  assert.match(chatRoute, /githubCodeContext/);
});

test("product navigation exposes Growth GitHub Settings and removes visible Workspace and top settings", async () => {
  const sidebar = await readFile(new URL("../../../../components/shell/left-sidebar.tsx", import.meta.url), "utf8");
  const chat = await readFile(new URL("../../../../components/shell/right-sidebar.tsx", import.meta.url), "utf8");
  const notes = await readFile(new URL("../../../../components/shell/project-notes-panel.tsx", import.meta.url), "utf8");
  const topbar = await readFile(new URL("../../../../components/shell/top-bar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, />Growth</);
  assert.match(sidebar, />GitHub</);
  assert.match(sidebar, /SidebarSettings/);
  assert.doesNotMatch(sidebar, />Workspace</);
  assert.doesNotMatch(sidebar, />P</);
  assert.doesNotMatch(sidebar, />F</);
  assert.doesNotMatch(topbar, /SettingsIcon|IntelligenceSettingsDialog|MemorySettingsDialog/);
  assert.match(chat, /last:border-b-0/);
  assert.doesNotMatch(chat, /max-w-4xl rounded-2xl border px-4 py-3/);
  assert.match(notes, /w-\[15rem\]/);
  assert.match(notes, /Hassali Summary/);
  assert.match(notes, /My Notes/);
});

test("Darker remains the neutral default and differs from Hassali Dark", async () => {
  const theme = await readFile(new URL("../../../../lib/theme-mode.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../../../../app/globals.css", import.meta.url), "utf8");
  assert.match(theme, /defaultThemeMode: ThemeMode = "darker"/);
  assert.match(css, /\.dark[\s\S]*--background: 222 22% 7%/);
  assert.match(css, /\.darker[\s\S]*--background: 0 0% 0%/);
  assert.match(css, /\.darker body[\s\S]*background: hsl\(var\(--background\)\)/);
});
