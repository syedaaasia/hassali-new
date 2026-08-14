import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { InMemoryUserMemoryStore, handleAskUserMemory } from "../../user-memory/user-memory";
import { buildMemoryAccessPolicy, disabledMemoryMessage } from "../memory-policy";
import { buildMemoryExport } from "../memory-export";

const defaults = {
  automaticMemoryEnabled: true,
  conversationMemoryEnabled: true,
  memoryEnabled: true,
  paused: false,
  projectMemoryEnabled: true,
  sensitiveMemoryAllowed: false,
  updatedAt: null,
  userMemoryEnabled: true
};

test("M5-PREFS-01 OFF, pause, automatic, scope, and sensitive gates are deterministic", () => {
  const active = buildMemoryAccessPolicy(defaults);
  assert.equal(active.userRead, true);
  assert.equal(active.userSensitiveExplicitWrite, false);
  const off = buildMemoryAccessPolicy({ ...defaults, memoryEnabled: false });
  assert.deepEqual(
    [off.userRead, off.projectRead, off.conversationRead, off.userExplicitWrite],
    [false, false, false, false]
  );
  const paused = buildMemoryAccessPolicy({ ...defaults, paused: true });
  assert.deepEqual(
    [paused.userRead, paused.projectWrite, paused.userAutomaticWrite],
    [false, false, false]
  );
  const noAutomatic = buildMemoryAccessPolicy({ ...defaults, automaticMemoryEnabled: false });
  assert.equal(noAutomatic.userAutomaticWrite, false);
  assert.equal(noAutomatic.userExplicitWrite, true);
  const noProject = buildMemoryAccessPolicy({ ...defaults, projectMemoryEnabled: false });
  assert.equal(noProject.projectRead, false);
  assert.equal(noProject.userRead, true);
});

test("M5-GATE-01 explicit save and recall are blocked while forget remains available", async () => {
  const store = new InMemoryUserMemoryStore();
  await handleAskUserMemory({
    prompt: "Remember that my M5 preference is alpine",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  const offPolicy = {
    allowAutomaticWrite: false,
    allowExplicitWrite: false,
    allowRead: false,
    allowSensitiveExplicitWrite: false,
    blockedRecallMessage: disabledMemoryMessage("off", "recall"),
    blockedSaveMessage: disabledMemoryMessage("off", "save")
  };
  const blockedSave = await handleAskUserMemory({
    policy: offPolicy,
    prompt: "Remember that my M5 value is delta",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  assert.match(blockedSave.directAnswer ?? "", /Memory is off.*won't save/i);
  assert.equal((await store.list()).length, 1);
  const blockedRecall = await handleAskUserMemory({
    policy: offPolicy,
    prompt: "What is my M5 preference?",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  assert.match(blockedRecall.directAnswer ?? "", /not using saved/i);
  const forgotten = await handleAskUserMemory({
    policy: offPolicy,
    prompt: "Forget my M5 preference",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  assert.match(forgotten.directAnswer ?? "", /removed/i);
});

test("M5-GATE-02 automatic off preserves explicit saves and sensitive opt-in remains separate", async () => {
  const store = new InMemoryUserMemoryStore();
  const policy = {
    allowAutomaticWrite: false,
    allowExplicitWrite: true,
    allowRead: true,
    allowSensitiveExplicitWrite: false
  };
  await handleAskUserMemory({
    policy,
    prompt: "My favorite M5 layout is spacious",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  assert.equal((await store.list()).length, 0);
  await handleAskUserMemory({
    policy,
    prompt: "Remember that my favorite M5 layout is spacious",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  assert.equal((await store.list()).length, 1);
  const sensitive = await handleAskUserMemory({
    policy,
    prompt: "Remember that my medical condition is synthetic M5",
    publicResearch: false,
    sourceMessageId: null,
    store
  });
  assert.match(sensitive.directAnswer ?? "", /Sensitive Memory is off/i);
});

test("M5-UI-01 Memory settings are first-class, authenticated, no-store, and avoid browser confirm", async () => {
  const component = await readFile(
    new URL("../../../../components/settings/memory-settings-dialog.tsx", import.meta.url),
    "utf8"
  );
  const route = await readFile(
    new URL("../../../../app/api/memory/route.ts", import.meta.url),
    "utf8"
  );
  const exportRoute = await readFile(
    new URL("../../../../app/api/memory/export/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(component, /What Hassali remembers/);
  assert.match(component, /CLEAR MY MEMORY/);
  assert.match(component, /Memory and chat history are different/);
  assert.doesNotMatch(component, /window\.confirm|globalThis\.confirm/);
  assert.match(route, /await auth\(\)/);
  assert.match(route, /private, no-store/);
  assert.match(exportRoute, /buildMemoryExport/);
});

test("M5-EXPORT-01 export excludes secret-like rows, internal IDs, and full-account claims", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");
  const shared = {
    captureMethod: "explicit" as const,
    category: "preference" as const,
    confidenceBps: 9900,
    createdAt: now,
    normalizedKey: "test",
    person: null,
    sensitivity: "standard" as const,
    sourceMessageId: null,
    sourceType: "user_message" as const,
    status: "active" as const,
    updatedAt: now
  };
  const payload = buildMemoryExport(
    {
      conversations: [],
      episodes: [],
      people: [],
      projectMemories: [],
      preferences: defaults,
      userMemories: [
        { ...shared, id: "ordinary-id", key: "M5 color", value: "coastal" },
        { ...shared, id: "secret-id", key: "API key", value: "sk-syntheticSecretValue123456" }
      ]
    },
    now
  );
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /coastal/);
  assert.doesNotMatch(serialized, /syntheticSecret|ordinary-id|secret-id/);
  assert.match(payload.note, /not complete chat, project, billing, or account data/i);
});
