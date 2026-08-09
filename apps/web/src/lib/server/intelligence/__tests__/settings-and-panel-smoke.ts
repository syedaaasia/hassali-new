import assert from "node:assert/strict";
import {
  createInitialAppShellPanelState,
  toggleProjectPanelState
} from "@/lib/app-shell-state";
import {
  IntelligenceSettingsResponseError,
  readIntelligenceSettingsResponse,
  requestIntelligenceSettings
} from "@/lib/intelligence-settings-response";
import { useProjectNotesStore } from "@/lib/project-notes-store";
import {
  intelligenceSettingsErrorResponse,
  normalizeIntelligenceSettingsError
} from "../intelligence-settings-http";
import { listIntelligenceSources } from "../intelligence-source-service";
import { resetEnvironmentIntelligenceSecretStoreForTests } from "../intelligence-secret-store";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

test("UI-01 actual workspace panel initializer starts collapsed", () => {
  const state = createInitialAppShellPanelState();
  assert.equal(state.projectPanelCollapsed, true);
  assert.equal(useProjectNotesStore.getState().isOpen, false);
});

test("UI-02 manual Project Panel toggles remain lifecycle-local and reversible", () => {
  const initial = createInitialAppShellPanelState();
  const open = toggleProjectPanelState(initial);
  const closed = toggleProjectPanelState(open);
  assert.equal(open.projectPanelCollapsed, false);
  assert.equal(closed.projectPanelCollapsed, true);
});

test("SETTINGS-01 valid JSON response loads the established response shape", async () => {
  const data = await listIntelligenceSources("settings-valid-user");
  const parsed = await readIntelligenceSettingsResponse(new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" }
  }));
  assert.equal(parsed.routing.mode, "auto");
  assert(parsed.sources.length >= 1);
});

test("SETTINGS-02 empty response becomes a normalized UI error", async () => {
  await assert.rejects(
    () => readIntelligenceSettingsResponse(new Response(null, { status: 500 })),
    (error: unknown) => error instanceof IntelligenceSettingsResponseError && !/Unexpected end of JSON input/i.test(error.message)
  );
});

test("SETTINGS-03 invalid JSON never exposes a raw SyntaxError", async () => {
  await assert.rejects(
    () => readIntelligenceSettingsResponse(new Response("<html>failed", { status: 500 })),
    (error: unknown) => error instanceof IntelligenceSettingsResponseError && !/Unexpected token|SyntaxError/i.test(error.message)
  );
});

test("SETTINGS-04 server failures serialize a structured JSON body", async () => {
  const response = intelligenceSettingsErrorResponse(new Error("private SQL detail"), "load");
  const payload = await response.json() as { error: { code: string; message: string }; ok: boolean };
  assert.equal(response.status, 500);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "INTELLIGENCE_SETTINGS_LOAD_FAILED");
  assert.doesNotMatch(JSON.stringify(payload), /private SQL detail/);
});

test("SETTINGS-05 missing master key keeps settings available in encrypted session mode", async () => {
  const previous = process.env.HASSALI_INTELLIGENCE_MASTER_KEY;
  delete process.env.HASSALI_INTELLIGENCE_MASTER_KEY;
  resetEnvironmentIntelligenceSecretStoreForTests();
  try {
    const data = await listIntelligenceSources("settings-session-user");
    assert.match(data.disclosure, /server memory for this session/i);
    assert(data.sources.filter((source) => source.id !== "hassali-cloud").every((source) => source.persistence === "server-session"));
  } finally {
    if (previous === undefined) delete process.env.HASSALI_INTELLIGENCE_MASTER_KEY;
    else process.env.HASSALI_INTELLIGENCE_MASTER_KEY = previous;
    resetEnvironmentIntelligenceSecretStoreForTests();
  }
});

test("SETTINGS-06 settings responses never expose keys or encryption envelopes", async () => {
  const data = await listIntelligenceSources("settings-secret-user");
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /apiKey|ciphertext|authTag|"iv"|masterKey/i);
});

test("SETTINGS-07 persistence failures normalize without raw database detail", () => {
  const error = Object.assign(new Error("relation intelligence_preferences does not exist"), { code: "42P01" });
  const normalized = normalizeIntelligenceSettingsError(error, "load");
  assert.equal(normalized.status, 503);
  assert.equal(normalized.code, "INTELLIGENCE_SETTINGS_PERSISTENCE_UNAVAILABLE");
  assert.doesNotMatch(normalized.message, /relation|SQL|42P01/i);
  assert.equal(
    normalizeIntelligenceSettingsError(new Error("DATABASE_URL is not configured"), "load").status,
    503
  );
});

test("SETTINGS-08 a user-triggered retry can recover after one failed request", async () => {
  const data = await listIntelligenceSources("settings-retry-user");
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 500 })
      : new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  };
  await assert.rejects(() => requestIntelligenceSettings("/api/settings/intelligence", {}, fetchImpl));
  const recovered = await requestIntelligenceSettings("/api/settings/intelligence", {}, fetchImpl);
  assert.equal(recovered.routing.mode, "auto");
  assert.equal(calls, 2);
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} settings/panel checks passed.\n`);
