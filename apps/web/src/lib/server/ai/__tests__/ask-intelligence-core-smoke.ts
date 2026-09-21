import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAskArithmetic, createEpistemicDirectAnswer } from "../ask-epistemic-foundation";
import { extractExclusiveSetConstraints, validateExclusiveSetConstraints } from "../answer-scope-constraints";
import { prepareConversationSummary, type ConversationHistoryMessage } from "../conversation-history-analysis";
import { classifyAskClaimEvidence, decideAskFreshness, normalizeAskTimeContext, verifyAskSourceReliability } from "../ask-source-reliability";
import { buildAskRuntimeContext } from "../ask-context";
import { runAskBrain } from "../ask-brain-orchestrator";
import { resolveBehavioralDecision } from "../behavioral-intelligence";
import { understandAskRequest } from "../ask-request-understanding";
import { analyzeAskTurnSemantics } from "../../../ask-turn-semantics";
import { loadChatHistory } from "@hassali/database";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { extractAskResponseConstraints } from "../ask-response-constraints";

const runtime = buildAskRuntimeContext(new Date("2026-09-21T12:00:00Z"));

for (const [expression, expected] of [
  ["2 + 3 * 4", 14], ["(2 + 3) * 4", 20], ["18 / 3 + 7", 13],
  ["-5 + 12", 7], ["3.5 * 4", 14], ["20% of 85", 17],
  ["36 / (2 + 4) - .5", 5.5], ["-(8 - 3) * 2", -10], ["7 times 8 minus 4", 52]
] as const) {
  test(`arithmetic consumes the complete expression: ${expression}`, async () => {
    assert.equal(evaluateAskArithmetic(expression), expected);
    const result = await runAskBrain({
      askRuntimeContext: runtime, prompt: expression, messages: [{ role: "user", content: expression }],
      model: "openrouter/free", productMode: "ASK", providerCall: async () => { throw new Error("Deterministic arithmetic invoked provider"); }
    });
    assert.equal(result.answer, `${expected}.`);
    assert.equal(result.decision.providerCallCount, 0);
  });
}

test("arithmetic rejects unsupported/incomplete expressions, never partial answers", () => {
  for (const expression of ["1/0", "2 +", "(2+3", "2**3", "2 + 3; process.exit()", "2 + 3 and explain my options", "9".repeat(600), "(".repeat(30) + "1" + ")".repeat(30)]) {
    assert.equal(evaluateAskArithmetic(expression), null, expression);
  }
  assert.equal(createEpistemicDirectAnswer("Explain why PEMDAS works."), null);
  assert.equal(createEpistemicDirectAnswer("Compare 20 + 30 with our budget and explain the tradeoffs."), null);
  assert.equal(createEpistemicDirectAnswer("If a shop gives 20% off a $75 item, what's the final price?"), "60.");
});

for (const [claim, content, expected] of [
  ["Widget supports encrypted backups.", "Widget does not support encrypted backups.", "CONTRADICTED"],
  ["Orchid requires administrator access.", "Orchid does not require administrator access.", "CONTRADICTED"],
  ["The service is available in Canada.", "The service is not available in Canada.", "CONTRADICTED"],
  ["Widget supports encrypted backups.", "Widget supports encrypted backups.", "SUPPORTED"],
  ["Widget supports encrypted backups.", "Widget might support encrypted backups.", "UNKNOWN"],
  ["Widget supports encrypted backups.", "Widget has a roadmap discussion about encrypted backups.", "UNKNOWN"],
  ["The plan costs 40 dollars.", "The plan costs 50 dollars.", "UNKNOWN"]
] as const) {
  test(`evidence relationship ${expected}: ${content}`, () => assert.equal(classifyAskClaimEvidence(claim, content), expected));
}

test("real grounding boundary never verifies contradictory official evidence", () => {
  const prompt = "According to this source, does Widget support encrypted backups? https://example.com/widget";
  const report = verifyAskSourceReliability({
    answer: "Widget supports encrypted backups.", decision: decideAskFreshness({ prompt, runtime }), researchAttempted: true,
    time: normalizeAskTimeContext(prompt, runtime),
    sources: [{ id: "primary", title: "Widget documentation", content: "Widget does not support encrypted backups.",
      isOfficial: true, sourceType: "user_source", url: "https://example.com/widget", retrievedAt: runtime.currentIsoDatetime }]
  });
  assert.equal(report.outcome, "SOURCE_CONFLICT");
  assert.equal(report.groundedClaims[0]?.evidenceRelationship, "CONTRADICTED");
  assert.match(report.answer, /does not support encrypted backups/);
  assert.doesNotMatch(report.answer, /Widget supports encrypted backups/);
});

for (const [prompt, valid, invalid] of [
  ["Cook using only lentils and cumin.", "Put the lentils in a pan; add cumin.", "Add paprika to the lentils."],
  ["Make a meal using only barley and thyme.", "Fold in thyme.", "Sprinkle saffron over the barley."],
  ["Use only red and white in the palette.", "Use white for the background.", "Use chartreuse for the background."],
  ["Build using only HTML and CSS.", "Use an HTML file for structure and CSS for layout.", "Install Alpine for interaction."],
  ["Change only header.tsx and footer.tsx.", "Update header.tsx; leave body.tsx unchanged.", "Update body.tsx."],
  ["Use only curl and jq as the tools.", "Run jq.", "Run httpie."],
  ["Perform operations using only read and compare.", "Perform read.", "Execute delete."],
  ["Return only name and email fields.", '{"name":"A","email":"a@example.com"}', '{"name":"A","timezone":"UTC"}'],
  ["Summarize only sections 2 and 4.", "Section 2: the findings.", "Section 3: unrelated findings."],
  ["Write using only these two facts: Mira joined Monday; The office is closed.", "Mira joined Monday. The office is closed.", "Mira joined Tuesday."],
  ["Use only https://example.com/a and https://example.com/b as the sources.", "[A](https://example.com/a)", "[C](https://example.com/c)"]
]) {
  test(`scoped constraint: ${prompt}`, () => {
    const constraints = extractExclusiveSetConstraints(prompt!);
    assert.equal(constraints.length, 1);
    assert.deepEqual(validateExclusiveSetConstraints(valid!, constraints), []);
    assert(validateExclusiveSetConstraints(invalid!, constraints).length > 0);
  });
}

test("positive lists and conversational only remain non-exclusive", () => {
  for (const prompt of ["Use React and TypeScript.", "Use rice, eggs, and soy sauce.", "I only wanted to say hello."]) {
    assert.deepEqual(extractExclusiveSetConstraints(prompt), []);
  }
});

for (const count of [20, 999, 1000, 1001, 1100, 12_000]) {
  test(`last N uses the real transcript tail at ${count} turns`, () => {
    const prompt = "Summarize the last 10 messages";
    const messages: ConversationHistoryMessage[] = Array.from({ length: count }, (_, index) => ({ role: "user", content: `Topic ${index + 1}` }));
    messages.push({ role: "system", content: "Hidden" }, { role: "assistant", content: "I couldn't complete that answer reliably right now." }, { role: "user", content: prompt });
    const prepared = prepareConversationSummary({ prompt, transcript: { messages, authoritative: true, source: "owned_persistence", truncated: false } });
    assert.equal(prepared?.messageCount, 10);
    assert.match(prepared!.modelContext, new RegExp(`Topic ${count - 9}\\b`));
    assert.match(prepared!.modelContext, new RegExp(`Topic ${count}\\b`));
    assert.doesNotMatch(prepared!.modelContext, new RegExp(`Topic ${count - 10}\\b|Hidden`));
  });
}

test("large whole-chat reduction retains the beginning and latest correction", () => {
  const messages: ConversationHistoryMessage[] = Array.from({ length: 2200 }, (_, index) => ({ role: "user", content: `Topic ${index}` }));
  messages[0]!.content = "Initial decision: use PostgreSQL.";
  messages[2199]!.content = "Correction: use SQLite instead of PostgreSQL.";
  const prepared = prepareConversationSummary({ prompt: "Summarize our conversation", transcript: { messages, authoritative: true, source: "owned_persistence", truncated: false } });
  assert.match(prepared!.deterministicSummary, /Initial decision/);
  assert.match(prepared!.deterministicSummary, /Correction: use SQLite/);
  assert.equal(prepared!.transcriptTruncated, true);
});

test("constraint authority is present in the existing task contract", () => {
  const prompt = "Cook using only lentils and cumin.";
  const behavior = resolveBehavioralDecision({ prompt, selectedMode: "ASK", messages: [{ role: "user", content: prompt }] });
  assert.deepEqual(behavior.answerContract.exclusiveSetConstraints[0]?.allowed, ["lentils", "cumin"]);
});

test("method plan uses calculations inside analysis without replacing the analysis", async () => {
  const prompt = "Compare plan A at 12 * 8 dollars with plan B at 18 * 5 dollars and explain which costs less.";
  const understanding = understandAskRequest({ prompt, messages: [], freshnessRequired: false, hasSuppliedEvidence: false });
  assert.deepEqual(understanding.calculations?.map((item) => item.result), [96, 90]);
  assert(understanding.workPlan?.includes("calculate") && understanding.workPlan.includes("reason"));
  let context = "";
  const result = await runAskBrain({ askRuntimeContext: runtime, prompt, messages: [{ role: "user", content: prompt }],
    model: "openrouter/free", productMode: "ASK", providerCallOwnsRouting: true,
    providerCall: async (input) => {
      context = input.messages.map((message) => message.content).join("\n");
      return { status: "ok", content: "Plan A costs 96 dollars and plan B costs 90 dollars. Plan B costs 6 dollars less, though feature suitability still needs to be checked.", servedModel: input.model };
    }
  });
  assert.match(context, /Locally evaluated arithmetic/);
  assert.match(result.answer, /96 dollars/);
});

test("provider outage retains completed calculation without pretending analysis succeeded", async () => {
  const prompt = "Compare 14 * 7 with 16 * 6 and recommend a plan based on features.";
  const result = await runAskBrain({ askRuntimeContext: runtime, prompt, messages: [{ role: "user", content: prompt }],
    model: "openrouter/free", productMode: "ASK", providerCallOwnsRouting: true,
    providerCall: async () => ({ status: "failed", category: "provider_unavailable", reason: "offline fixture" }) });
  assert.match(result.answer, /14 \* 7 = 98/);
  assert.match(result.answer, /16 \* 6 = 96/);
  assert.match(result.answer, /could not complete the requested analysis/);
  assert(result.decision.providerCallCount <= 2);
});

test("shared context authority distinguishes same-turn reference and topic break", () => {
  const messages = [{ role: "assistant" as const, content: "The old topic was PostgreSQL." }];
  for (const prompt of ["Redis keeps keys in memory. Why is it fast?", "A capacitor stores charge. How does it release energy?", "Photosynthesis uses light. Why does it matter?"]) {
    assert.equal(analyzeAskTurnSemantics(prompt).dependency, "local_reference", prompt);
    assert.notEqual(understandAskRequest({ prompt, messages, freshnessRequired: false, hasSuppliedEvidence: false }).conversationContext, "recent_required");
  }
  assert.equal(understandAskRequest({ prompt: "Explain that more.", messages, freshnessRequired: false, hasSuppliedEvidence: false }).conversationContext, "recent_required");
});

test("method plans preserve freshness and supplied-evidence authority", () => {
  const current = understandAskRequest({ prompt: "Compare current database releases", messages: [], freshnessRequired: true, hasSuppliedEvidence: false });
  assert.equal(current.method, "fresh_retrieval");
  assert.deepEqual(current.workPlan, ["retrieve", "reason", "ground", "validate"]);
  const file = understandAskRequest({ prompt: "Extract the invoice number from the uploaded PDF", messages: [], freshnessRequired: false, hasSuppliedEvidence: true });
  assert.equal(file.workPlan?.[0], "read_evidence");
  assert.equal(file.evidenceAuthority, "required");
  const stable = understandAskRequest({ prompt: "Explain photosynthesis", messages: [], freshnessRequired: false, hasSuppliedEvidence: false });
  assert(!stable.workPlan?.includes("retrieve"));
});

test("a contradicted primary source cannot be outvoted by copied secondary pages", () => {
  const prompt = "Check https://example.com/widget for encrypted backup support";
  const report = verifyAskSourceReliability({ answer: "Widget supports encrypted backups.",
    decision: decideAskFreshness({ prompt, runtime }), time: normalizeAskTimeContext(prompt, runtime), researchAttempted: true,
    sources: Array.from({ length: 4 }, (_, index) => ({ id: `source-${index}`, title: "Widget", sourceType: index === 0 ? "official" as const : "secondary" as const,
      isOfficial: index === 0, url: index === 0 ? "https://example.com/widget" : `https://secondary.example/${index}`,
      content: index === 0 ? "Widget does not support encrypted backups." : "Widget supports encrypted backups.", retrievedAt: runtime.currentIsoDatetime })) });
  assert.equal(report.outcome, "SOURCE_CONFLICT");
});

test("production POST uses compound calculator rather than the first-pair shortcut", async () => {
  const { POST } = await import("@/app/api/ai/chat/route");
  const { hassaliChatContractVersion } = await import("@/lib/chat-contract");
  const response = await POST(new Request("http://localhost/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientContractVersion: hassaliChatContractVersion, mode: "ASK", productMode: "ASK", projectId: null,
      messages: [{ role: "user", content: "What is (7 + 5) * 3?" }],
      workspace: { activePath: "", activeFileContent: "", fileList: [], fileContents: {}, projectName: null }, workspaceProjectId: null }) }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /36/);
  assert.equal(response.headers.get("x-hassali-ask-provider-call-count"), "0");
});

test("persistence orders the authorized tail before applying a summary limit", async () => {
  const dialect = new PgDialect();
  let whereSql = "";
  let orderSql = "";
  const sessionQueries: { sql: string; params: unknown[] }[] = [];
  const query = {
    from: () => query,
    where: (where: SQL) => { whereSql = dialect.sqlToQuery(where).sql; return query; },
    orderBy: (...order: SQL[]) => { orderSql = order.map((clause) => dialect.sqlToQuery(clause).sql).join(","); return query; },
    limit: async (limit: number) => {
      assert.equal(limit, 11);
      return Array.from({ length: limit }, (_, i) => ({ id: String(1100 - i), content: `Topic ${1100 - i}`, role: "user" }));
    }
  };
  const db = {
    execute: async (statement: SQL) => { sessionQueries.push(dialect.sqlToQuery(statement)); return { rows: [{ id: "owned-session" }] }; },
    select: () => query
  } as unknown as NonNullable<Parameters<typeof loadChatHistory>[1]>;
  const result = await loadChatHistory({ userId: "owner-A", projectId: "project-A", sessionId: "owned-session", window: "latest", summaryEligibleOnly: true, limit: 11 }, db);
  assert.deepEqual(sessionQueries[0]!.params, ["owned-session", "project-A", "owner-A"]);
  assert.match(whereSql, /session_id/);
  assert.match(whereSql, /role.*in.*user.*assistant/s);
  assert.match(orderSql, /created_at.*desc.*id.*desc/);
  assert.equal(result.messages[0]!.content, "Topic 1090");
  assert.equal(result.messages.at(-1)!.content, "Topic 1100");
});

test("problem quantities do not become requested output counts", async () => {
  for (const prompt of ["If a shop gives 15% off a $80 item, what's the final price?", "A crate has 12 items. What is half?", "The ladder has 8 steps. How tall is it?", "Two lines intersect. Explain the angle."]) {
    assert.equal(extractAskResponseConstraints(prompt).bulletCount, null, prompt);
  }
  for (const prompt of ["Give three bullet points.", "Summarize this in three points.", "Three bullets, please.", "Use exactly three numbered items."]) {
    assert.equal(extractAskResponseConstraints(prompt).bulletCount, 3, prompt);
  }
  const prompt = "If a shop gives 15% off a $80 item, what's the final price?";
  const result = await runAskBrain({ askRuntimeContext: runtime, prompt, messages: [{ role: "user", content: prompt }], model: "openrouter/free", productMode: "ASK" });
  assert.equal(result.answer, "68.");
});
