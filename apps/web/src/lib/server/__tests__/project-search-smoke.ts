import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { searchProjectsAndChatsForExternalUser } from "@hassali/database";

test("SEARCH-01 project, chat, and message results retain exact navigation identity", async () => {
  const db = {
    async execute() {
      return {
        rows: [
          {
            kind: "project", matched_at: new Date(0), message_id: null, project_id: "project-a", project_name: "Floral Ops",
            role: null, session_id: null, session_title: null, snippet: "Floral Ops"
          },
          {
            kind: "chat", matched_at: new Date(1), message_id: null, project_id: "project-b", project_name: "Client Work",
            role: null, session_id: "session-b", session_title: "Floral launch", snippet: "Floral launch"
          },
          {
            kind: "message", matched_at: new Date(2), message_id: "message-c", project_id: "project-c", project_name: "Old work",
            role: "user", session_id: "session-c", session_title: "Workspace chat", snippet: "Need a floral website"
          }
        ]
      };
    }
  };
  const results = await searchProjectsAndChatsForExternalUser("owner-a", "floral", db as never);
  assert.deepEqual(results.map((result) => result.kind), ["project", "chat", "message"]);
  assert.equal(results[2]?.sessionId, "session-c");
  assert.equal(results[2]?.messageId, "message-c");
});

test("SEARCH-02 short queries are bounded before database work", async () => {
  let calls = 0;
  const results = await searchProjectsAndChatsForExternalUser("owner-a", "x", {
    async execute() { calls += 1; return { rows: [] }; }
  } as never);
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});

test("SEARCH-03 database query is ownership-filtered and never invokes model or web search", async () => {
  const persistence = await readFile(new URL("../../../../../../packages/database/src/persistence.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../../../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  assert.match(persistence, /users\.external_id\s*=\s*\$\{externalUserId\}/);
  assert.match(persistence, /chat_messages\.content ilike \$\{pattern\}/);
  assert.doesNotMatch(route, /openrouter|invokeAuto|webSearch|research/i);
});

test("SEARCH-04 exact session loading remains ownership and project scoped", async () => {
  const persistence = await readFile(new URL("../../../../../../packages/database/src/persistence.ts", import.meta.url), "utf8");
  assert.match(persistence, /where id = \$\{selectedSessionId\}[\s\S]{0,180}project_id = \$\{project\.id\}[\s\S]{0,120}user_id = \$\{user\.id\}/);
});

test("SEARCH-05 sidebar replaces the old Search card with header utility and exact session switch", async () => {
  const sidebar = await readFile(new URL("../../../components/shell/left-sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /aria-label="Search projects and chats"/);
  assert.match(sidebar, /switchProject\(result\.projectId, result\.sessionId\)/);
  assert.doesNotMatch(sidebar, /Project search placeholder|toggleSection\("search"\)/);
});
