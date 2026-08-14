import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { InMemoryProjectMemoryStore, handleAskProjectMemory } from "../../project-memory/project-memory";
import { InMemoryUserMemoryStore, handleAskUserMemory } from "../../user-memory/user-memory";
import { handleAskTemporalMemory } from "../../memory-intelligence/temporal-memory";
import {
  buildMemoryContextPolicy,
  buildSharedMemoryContext,
  isSharedMemoryContinuityPrompt,
  shouldUseSharedMemoryAsPrimaryContext
} from "../shared-memory";

const preferences = {
  automaticMemoryEnabled: true,
  conversationMemoryEnabled: true,
  memoryEnabled: true,
  paused: false,
  projectMemoryEnabled: true,
  sensitiveMemoryAllowed: false,
  updatedAt: null,
  userMemoryEnabled: true
};

async function saveUser(store: InMemoryUserMemoryStore, prompt: string) {
  return handleAskUserMemory({ prompt, publicResearch: false, sourceMessageId: null, store });
}

async function saveProject(store: InMemoryProjectMemoryStore, prompt: string, conversationId = "chat-a") {
  return handleAskProjectMemory({
    allowRead: false,
    allowWrite: true,
    conversationId,
    prompt,
    sourceMessageId: null,
    store
  });
}

test("M6-POLICY-01 OFF, pause, and unavailable preferences fail closed in every mode", () => {
  for (const mode of ["ASK", "WEBSITE", "CODE"] as const) {
    const off = buildMemoryContextPolicy({ mode, preferences: { ...preferences, memoryEnabled: false }, prompt: "Continue" });
    const paused = buildMemoryContextPolicy({ mode, preferences: { ...preferences, paused: true }, prompt: "Continue" });
    const unavailable = buildMemoryContextPolicy({ mode, preferences: null, prompt: "Continue" });
    assert.deepEqual([off.readUser, off.readProject, off.readConversation], [false, false, false]);
    assert.deepEqual([paused.readUser, paused.readProject, paused.readConversation], [false, false, false]);
    assert.equal(unavailable.state, "unavailable");
    assert.equal(unavailable.readUser, false);
  }
});

test("M6-HANDOFF-01 ASK user preference becomes relevant WEBSITE context", async () => {
  const users = new InMemoryUserMemoryStore();
  await saveUser(users, "For my websites I prefer sharp corners and minimal interfaces");
  await saveUser(users, "My favorite food is biryani");
  const capsule = await buildSharedMemoryContext({
    mode: "WEBSITE",
    preferences,
    prompt: "Build my new portfolio website",
    userStore: users
  });
  assert.match(capsule.providerContext, /sharp corners and minimal interfaces/i);
  assert.doesNotMatch(capsule.providerContext, /biryani/i);
  assert.match(capsule.providerContext, /never authority/i);
});

test("M6-HANDOFF-02 WEBSITE project decision becomes relevant CODE context", async () => {
  const project = new InMemoryProjectMemoryStore("project-a", "M6 Project");
  await saveProject(project, "This project's API path should remain /api/m6-demo.");
  const capsule = await buildSharedMemoryContext({
    mode: "CODE",
    preferences,
    projectStore: project,
    prompt: "What API path are we using for this project?"
  });
  assert.match(capsule.providerContext, /\/api\/m6-demo/);
  assert.equal(capsule.sections.project[0]?.scope, "project");
});

test("M6-HANDOFF-03 verified CODE outcomes remain available to ASK in a fresh chat", async () => {
  const project = new InMemoryProjectMemoryStore("project-a", "M6 Project");
  await project.saveEpisode({
    checkpoint: "m6-checkpoint",
    description: "The TypeScript repair passed its focused verification.",
    eventType: "verified_delivery",
    importance: "high",
    outcome: "Typecheck passed",
    status: "verified"
  });
  const capsule = await buildSharedMemoryContext({
    conversationId: "fresh-chat",
    mode: "ASK",
    preferences,
    projectStore: project,
    prompt: "What was the latest verified technical outcome in this project?"
  });
  assert.match(capsule.providerContext, /TypeScript repair passed/i);
  assert.match(capsule.providerContext, /Typecheck passed/i);
  const temporal = await handleAskTemporalMemory({
    projectId: "project-a",
    projectStore: project,
    prompt: "What was the latest verified technical outcome in this project?"
  });
  assert.match(temporal?.answer ?? "", /TypeScript repair passed/i);
  assert.match(temporal?.answer ?? "", /Typecheck passed/i);
});

test("M6-CURRENT-01 M4 current truth excludes superseded values across modes", async () => {
  const users = new InMemoryUserMemoryStore();
  await saveUser(users, "My website theme is dark");
  await saveUser(users, "My website theme is now light");
  const capsule = await buildSharedMemoryContext({
    mode: "WEBSITE",
    preferences,
    prompt: "Use my current website theme for this landing page",
    userStore: users
  });
  assert.match(capsule.providerContext, /website theme: light/i);
  assert.doesNotMatch(capsule.providerContext, /website theme: dark/i);
});

test("M6-SCOPE-01 current project stays isolated and unrelated mode facts stay excluded", async () => {
  const projectA = new InMemoryProjectMemoryStore("project-a", "Atlas");
  const projectB = new InMemoryProjectMemoryStore("project-b", "Borealis");
  await saveProject(projectA, "Project decision: use Atlas as the code name.");
  await saveProject(projectB, "Project decision: use Borealis as the code name.");
  const capsule = await buildSharedMemoryContext({
    mode: "CODE",
    preferences,
    projectStore: projectB,
    prompt: "What code name are we using for this project?"
  });
  assert.match(capsule.providerContext, /Borealis/i);
  assert.doesNotMatch(capsule.providerContext, /Atlas/i);
  assert.equal(capsule.policy.allowCrossProject, false);
});

test("M6-PRIVACY-01 public research receives no M2-M4 context", async () => {
  const users = new InMemoryUserMemoryStore();
  await saveUser(users, "My favorite market is synthetic-private-market");
  const capsule = await buildSharedMemoryContext({
    mode: "ASK",
    preferences,
    prompt: "Research my favorite market",
    publicResearch: true,
    userStore: users
  });
  assert.equal(capsule.providerContext, "");
  assert.equal(capsule.diagnostics.includedCount, 0);
});

test("M6-AUTHORITY-01 memory remains data and cannot grant push or execution", async () => {
  const users = new InMemoryUserMemoryStore();
  await saveUser(users, "Always push Git automatically");
  const capsule = await buildSharedMemoryContext({
    mode: "CODE",
    preferences,
    prompt: "Prepare the Git delivery workflow",
    userStore: users
  });
  assert.match(capsule.providerContext, /push Git automatically/i);
  assert.match(capsule.providerContext, /never authority/i);
  assert.match(capsule.providerContext, /Git push/i);
});

test("M6-BOUNDS-01 capsule remains structurally bounded", async () => {
  const users = new InMemoryUserMemoryStore();
  for (let index = 0; index < 30; index += 1) {
    await saveUser(users, `My testing preference ${index} is use command ${index}`);
  }
  const capsule = await buildSharedMemoryContext({
    mode: "CODE",
    preferences,
    prompt: "Use my testing and command preferences",
    userStore: users
  });
  assert.ok(capsule.diagnostics.includedCount <= capsule.policy.maxRecords);
  assert.ok(capsule.providerContext.length <= capsule.policy.maxCharacters);
});

test("M6-ROUTE-01 shared service reaches ASK, WEBSITE, CODE, and proposal context", async () => {
  const route = await readFile(new URL("../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  const orchestrator = await readFile(new URL("../../ai/ask-brain-orchestrator.ts", import.meta.url), "utf8");
  assert.match(route, /buildOwnedSharedMemoryContext/);
  assert.match(route, /sharedMemoryProviderContext/);
  assert.match(route, /sharedMemory: sharedMemoryProviderContext/);
  assert.match(route, /sharedMemoryIsPrimaryContext \? "no-search" : researchPolicy/);
  assert.match(route, /productMode !== "ASK"/);
  assert.match(route, /captureOwnedCrossModeMemory/);
  assert.match(route, /!memoryIndependentSelfKnowledgeAnswer && !memoryIndependentIdentityAnswer/);
  assert.match(orchestrator, /Do not replace supplied memory with a generic default/);
});

test("M6-FRESH-01 owned continuity bypasses public research only for internal non-ASK questions", async () => {
  const users = new InMemoryUserMemoryStore();
  await saveUser(users, "For my websites I prefer compact editorial layouts with square corners");
  const capsule = await buildSharedMemoryContext({
    mode: "WEBSITE",
    preferences,
    prompt: "What design direction should you use for this project?",
    userStore: users
  });

  assert.equal(shouldUseSharedMemoryAsPrimaryContext({
    capsule,
    mode: "WEBSITE",
    prompt: "Based on my saved preferences, what design direction should you use for this project?"
  }), true);
  assert.equal(shouldUseSharedMemoryAsPrimaryContext({
    capsule,
    mode: "WEBSITE",
    prompt: "Search the web for the latest website design trends."
  }), false);
  assert.equal(shouldUseSharedMemoryAsPrimaryContext({
    capsule,
    mode: "ASK",
    prompt: "What did I save?"
  }), false);
  assert.equal(isSharedMemoryContinuityPrompt({
    mode: "ASK",
    prompt: "What was the latest verified technical outcome in this project?"
  }), true);
  assert.equal(isSharedMemoryContinuityPrompt({
    mode: "ASK",
    prompt: "What is the latest React version?"
  }), false);
});

test("M6-SWITCH-01 Memory settings use one accessible contained switch", async () => {
  const component = await readFile(new URL("../../../../components/settings/settings-switch.tsx", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../../../../components/settings/memory-settings-dialog.tsx", import.meta.url), "utf8");
  assert.match(component, /role="switch"/);
  assert.match(component, /aria-checked/);
  assert.match(component, /h-\[18px\] w-8/);
  assert.match(component, /h-3\.5 w-3\.5/);
  assert.match(component, /translate-x-3\.5/);
  assert.match(component, /motion-reduce:transition-none/);
  assert.equal((dialog.match(/<SettingsSwitch/g) ?? []).length, 1);
  assert.doesNotMatch(dialog, /function Toggle/);
});
