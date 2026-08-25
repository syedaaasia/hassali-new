import assert from "node:assert/strict";
import test from "node:test";
import { hassaliChatContractVersion } from "@/lib/chat-contract";

type Turn = { content: string; role: "assistant" | "user" };

type AskResult = {
  answer: string;
  completionMethod: string | null;
  freshness: string | null;
  providerFailure: string | null;
  responseKind: string | null;
};

const genericFailure = /I couldn't complete that answer reliably right now|I could not verify the current answer from suitable live sources/i;

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

async function send(messages: Turn[], prompt: string): Promise<AskResult> {
  messages.push({ content: prompt, role: "user" });
  const { POST } = await import("@/app/api/ai/chat/route");
  const response = await POST(new Request("http://localhost/api/ai/chat", {
    body: JSON.stringify({
      clientContractVersion: hassaliChatContractVersion,
      messages,
      mode: "ASK",
      model: "tencent/hy3:free",
      modelSelectionPolicy: "automatic",
      productMode: "ASK",
      workspace: {
        activeFileContent: "",
        activePath: "",
        fileContents: {},
        fileList: [],
        projectName: null
      }
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
    responseKind: response.headers.get("x-hassali-ask-response-kind")
  };
}

test("founder dashboard sequence preserves correctness state routing and recovery", async () => {
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
    assert.doesNotMatch(currentNews.answer, /world news|AI companies.*today/i);

    const nextTurn = await send(messages, "Answer my next question using only three words.");
    assert.match(nextTurn.answer, /understood/i);
    const dreams = await send(messages, "Why do humans dream?");
    assert.equal(wordCount(dreams.answer), 3, dreams.answer);
    assert.notEqual(dreams.freshness, "live_event");
    assert.doesNotMatch(dreams.answer, genericFailure);

    const mangoSetup = await send(messages, "My imaginary project is called Mango. It uses Python, PostgreSQL and React. Remember that only for this conversation.");
    assert.doesNotMatch(mangoSetup.answer, genericFailure);
    assert.equal((await send(messages, "What database does Mango use?")).answer.trim(), "PostgreSQL");
    const mangoCorrection = await send(messages, "Actually Mango now uses SQLite instead of PostgreSQL.");
    assert.doesNotMatch(mangoCorrection.answer, genericFailure);
    const mangoCurrent = await send(messages, "What database does Mango use now?");
    assert.equal(mangoCurrent.answer.trim(), "SQLite");
    assert.notEqual(mangoCurrent.freshness, "live_event");

    const summary = await send(messages, "write summary of the complete chat");
    assert.match(summary.answer, /Conversation summary/i);
    assert.match(summary.answer, /Mango/i);
    assert.match(summary.answer, /SQLite/i);
    assert.notEqual(summary.freshness, "live_event");
    assert.equal(summary.completionMethod, "deterministic_conversation_summary");
    assert.equal(summary.responseKind, "deterministic_answer");
    assert.doesNotMatch(summary.answer, genericFailure);
  } finally {
    for (const key of providerKeys) {
      const previous = previousKeys[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
});
